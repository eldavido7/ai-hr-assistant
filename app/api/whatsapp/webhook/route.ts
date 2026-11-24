// app/api/whatsapp/webhook/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { answerHRQuestion } from '@/lib/rag';
import { sendWhatsAppEscalation, sendWhatsAppMessage, markMessageAsRead } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ESCALATION_NUMBER = process.env.WHATSAPP_ESCALATION_NUMBER;

function hasValidMetaSignature(rawBody: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signature) {
    return false;
  }

  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(match[1], 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// --- WhatsApp Cloud API payload types ---

interface WhatsAppText {
  body: string;
}

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: WhatsAppText;
}

interface WhatsAppContact {
  profile?: { name?: string };
  wa_id?: string;
}

interface WhatsAppValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: unknown[];
}

interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

// --- GET: Meta webhook verification ---

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (VERIFY_TOKEN && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// --- POST: Handle incoming messages ---

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!hasValidMetaSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as WhatsAppWebhookPayload;

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ ok: true });
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const messages = change.value.messages;
        if (!messages) continue;

        for (const message of messages) {
          if (message.type !== 'text' || !message.text?.body) continue;

          const userPhone = message.from;
          const question = message.text.body.trim();
          if (!question) continue;

          // Mark as read immediately so the user sees blue ticks
          markMessageAsRead(message.id).catch((err) =>
            console.error('Failed to mark as read:', err)
          );

          const { answer, shouldEscalate } = await answerHRQuestion(question);

          if (shouldEscalate && ESCALATION_NUMBER) {
            const contact = change.value.contacts?.find((item) => item.wa_id === userPhone)
              ?? change.value.contacts?.[0];
            const contactName = contact?.profile?.name || 'WhatsApp user';

            try {
              await sendWhatsAppEscalation(ESCALATION_NUMBER, {
                name: contactName,
                phone: `+${userPhone.replace(/\D/g, '')}`,
                summary: 'ACF-related question needs human follow-up',
                message: question,
              });
            } catch (error) {
              console.error('WhatsApp escalation delivery failed:', error);
              await sendWhatsAppMessage(
                userPhone,
                `${answer}\n\nI couldn't reach the ACF team just now. Please contact them directly for help.`,
              );
              continue;
            }

            await sendWhatsAppMessage(
              userPhone,
              `${answer}\n\nI've escalated your question to the ACF team. You should receive a follow-up message here with the appropriate help.`,
            );
          } else {
            await sendWhatsAppMessage(
              userPhone,
              answer || "I couldn't process that right now. Please try again."
            );
          }
        }
      }
    }

    // Always return 200 to Meta — non-200 triggers retries
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
