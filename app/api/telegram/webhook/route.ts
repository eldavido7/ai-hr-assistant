// app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { answerHRQuestion } from '@/lib/rag';

export const runtime = 'nodejs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  text?: string;
  chat?: TelegramChat;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

function getUpdateMessage(body: TelegramUpdate): TelegramMessage | undefined {
  return body.message ?? body.edited_message ?? body.channel_post ?? body.edited_channel_post;
}

function splitTelegramMessage(text: string): string[] {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
    let cut = remaining.lastIndexOf('\n', MAX_TELEGRAM_MESSAGE_LENGTH);

    if (cut < 0) {
      cut = remaining.lastIndexOf(' ', MAX_TELEGRAM_MESSAGE_LENGTH);
    }

    if (cut < 1) {
      cut = MAX_TELEGRAM_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

async function sendTelegramMessage(chatId: number, text: string) {
  if (!TELEGRAM_API) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  for (const chunk of splitTelegramMessage(text)) {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Telegram sendMessage failed: ${response.status} ${errorBody}`);
    }
  }
}

export const POST = async (req: NextRequest) => {
  try {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (incomingSecret !== TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!BOT_TOKEN || !TELEGRAM_API) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    const body = (await req.json()) as TelegramUpdate;
    const message = getUpdateMessage(body);

    if (!message?.text || !message.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const question = message.text.trim();

    if (!question || question.startsWith('/')) {
      await sendTelegramMessage(chatId, 'Send me a question about HR policies.');
      return NextResponse.json({ ok: true });
    }

    const { answer } = await answerHRQuestion(question);
    await sendTelegramMessage(chatId, answer || "I couldn't process that right now.");

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
};

export const GET = async (req: NextRequest) => {
  try {
    if (!BOT_TOKEN || !TELEGRAM_API) {
      return NextResponse.json({ error: 'Telegram bot token not configured' }, { status: 500 });
    }

    const webhookUrl = new URL('/api/telegram/webhook', req.url).toString();
    const setWebhookUrl = new URL(`${TELEGRAM_API}/setWebhook`);
    setWebhookUrl.searchParams.set('url', webhookUrl);

    if (TELEGRAM_WEBHOOK_SECRET) {
      setWebhookUrl.searchParams.set('secret_token', TELEGRAM_WEBHOOK_SECRET);
    }

    const response = await fetch(setWebhookUrl.toString());
    const data = (await response.json()) as unknown;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Failed to set Telegram webhook',
          telegram: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      webhook: data,
      setWebhookUrl: webhookUrl,
    });
  } catch (error: unknown) {
    console.error('Telegram webhook setup error:', error);
    return NextResponse.json({ error: 'Webhook setup failed' }, { status: 500 });
  }
};
