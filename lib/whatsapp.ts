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

interface EscalationTemplateParameters {
  name: string;
  phone: string;
  summary: string;
  message: string;
}

const ESCALATION_TEMPLATE_NAME = 'escalation_alert';
const ESCALATION_TEMPLATE_LANGUAGE = 'en';
const MAX_TEMPLATE_BODY_LENGTH = 1024;
const MAX_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 20;
const MAX_SUMMARY_LENGTH = 100;
const MAX_USER_MESSAGE_LENGTH = 650;

function sanitizeTemplateParameter(value: string, maxLength: number): string {
  const cleaned = (value || 'N/A').replace(/\s+/g, ' ').trim() || 'N/A';
  const characters = Array.from(cleaned);

  if (characters.length <= maxLength) {
    return cleaned;
  }

  return `${characters.slice(0, maxLength - 3).join('')}...`;
}

export async function sendWhatsAppEscalation(
  to: string,
  parameters: EscalationTemplateParameters,
): Promise<void> {
  const safeParameters = {
    name: sanitizeTemplateParameter(parameters.name, MAX_NAME_LENGTH),
    phone: sanitizeTemplateParameter(parameters.phone, MAX_PHONE_LENGTH),
    summary: sanitizeTemplateParameter(parameters.summary, MAX_SUMMARY_LENGTH),
    message: sanitizeTemplateParameter(parameters.message, MAX_USER_MESSAGE_LENGTH),
  };
  const renderedBody =
    `Escalation alert\n` +
    `Name: ${safeParameters.name}\n` +
    `Phone: ${safeParameters.phone}\n` +
    `Summary: ${safeParameters.summary}\n` +
    `Message: ${safeParameters.message}`;

  if (renderedBody.length > MAX_TEMPLATE_BODY_LENGTH) {
    throw new Error('Rendered WhatsApp escalation template exceeds 1,024 characters');
  }

  const { phoneNumberId, accessToken } = getConfig();
  const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: ESCALATION_TEMPLATE_NAME,
        language: { code: ESCALATION_TEMPLATE_LANGUAGE },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: safeParameters.name },
              { type: 'text', text: safeParameters.phone },
              { type: 'text', text: safeParameters.summary },
              { type: 'text', text: safeParameters.message },
            ],
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp escalation template failed: ${response.status} ${errorBody}`);
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
