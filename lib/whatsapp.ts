// lib/whatsapp.ts

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      'WhatsApp not configured: WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required'
    );
  }

  return { phoneNumberId, accessToken };
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const { phoneNumberId, accessToken } = getConfig();

  for (const chunk of splitMessage(text)) {
    const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: chunk },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`WhatsApp sendMessage failed: ${response.status} ${errorBody}`);
    }
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const { phoneNumberId, accessToken } = getConfig();

  await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
}

const MAX_WHATSAPP_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_WHATSAPP_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > MAX_WHATSAPP_LENGTH) {
    let cut = remaining.lastIndexOf('\n', MAX_WHATSAPP_LENGTH);
    if (cut < 1) cut = remaining.lastIndexOf(' ', MAX_WHATSAPP_LENGTH);
    if (cut < 1) cut = MAX_WHATSAPP_LENGTH;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
