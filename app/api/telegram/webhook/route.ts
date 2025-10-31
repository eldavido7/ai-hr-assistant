// app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export const POST = async (req: NextRequest) => {
    try {
        const body = await req.json();
        const message = body.message;

        if (!message?.text || !message?.chat?.id) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const question = message.text.trim();

        // Ignore bot commands or non-questions
        if (question.startsWith('/')) {
            await sendTelegramMessage(chatId, "Send me a question about HR policies!");
            return NextResponse.json({ ok: true });
        }

        // Call internal /api/ask
        const askResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
        });

        let answer = 'Sorry, I couldn’t process that.';

        if (askResponse.ok) {
            const data = await askResponse.json();
            answer = data.answer || answer;
        } else {
            console.error('Ask API failed:', askResponse.status);
        }

        await sendTelegramMessage(chatId, answer);
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('Telegram webhook error:', error);
        return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
    }
};

async function sendTelegramMessage(chatId: number, text: string) {
    const url = `${TELEGRAM_API}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
        }),
    });
}

// Optional: Set webhook on deploy
export const GET = async () => {
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://your-app.vercel.app'}/api/telegram/webhook`;
    const setUrl = `${TELEGRAM_API}/setWebhook?url=${webhookUrl}`;
    const res = await fetch(setUrl);
    const data = await res.json();
    return NextResponse.json({ webhook: data, setUrl: webhookUrl });
};