// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { answerHRQuestion } from '@/lib/rag';
import { sendWhatsAppMessage, markMessageAsRead } from '@/lib/whatsapp';

export const runtime = 'nodejs';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ESCALATION_NUMBER = process.env.WHATSAPP_ESCALATION_NUMBER;

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

interface WhatsAppValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
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

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// --- POST: Handle incoming messages ---

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as WhatsAppWebhookPayload;

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

          // Mark as read immediately so the user sees blue ticks
          markMessageAsRead(message.id).catch((err) =>
            console.error('Failed to mark as read:', err)
          );

          if (!question) continue;

          const { answer, shouldEscalate } = await answerHRQuestion(question);

          if (shouldEscalate && ESCALATION_NUMBER) {
            // Forward the question to the designated HR/MEAL officer
            await sendWhatsAppMessage(
              ESCALATION_NUMBER,
              `📋 *Escalated Query*\n\n` +
                `*From:* ${userPhone}\n` +
                `*Question:* ${question}\n\n` +
                `The assistant could not confidently answer this. Please follow up directly with this person.`
            );

            // Let the user know it's been escalated
            await sendWhatsAppMessage(
              userPhone,
              answer +
                `\n\nI've forwarded your question to the team for a more detailed response.`
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
