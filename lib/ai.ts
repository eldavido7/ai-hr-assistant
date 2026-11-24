// lib/ai.ts
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash' as const;

type DeepSeekRole = 'system' | 'user' | 'assistant' | 'tool';

interface DeepSeekMessage {
  role: DeepSeekRole;
  content: string;
}

interface DeepSeekChatRequest {
  model: typeof DEEPSEEK_MODEL;
  messages: DeepSeekMessage[];
  max_tokens: number;
  temperature: number;
  top_p: number;
  thinking: {
    type: 'disabled';
  };
  response_format: {
    type: 'json_object';
  };
}

interface DeepSeekChatChoice {
  message?: {
    content?: string | null;
  };
}

interface DeepSeekChatResponse {
  choices?: DeepSeekChatChoice[];
}

// === DeepSeek API Call ===
export async function queryDeepSeek(prompt: string): Promise<string> {
  const body: DeepSeekChatRequest = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: 'You are a helpful AI assistant. Return valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2000,
    temperature: 0.7,
    top_p: 0.9,
    thinking: {
      type: 'disabled',
    },
    response_format: {
      type: 'json_object',
    },
  };

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  if (!response.ok) {
    let errorMessage = responseText;

    try {
      const parsedError = JSON.parse(responseText) as {
        error?: { message?: string };
        message?: string;
      };
      errorMessage = parsedError.error?.message ?? parsedError.message ?? responseText;
    } catch {
      // Keep the raw text fallback.
    }

    console.error('DeepSeek API error:', errorMessage);
    throw new Error(`DeepSeek failed: ${response.status} ${response.statusText}`);
  }

  const data = JSON.parse(responseText) as DeepSeekChatResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

export function processDeepSeekResponse(response: string): string {
  if (!response || !response.trim()) {
    return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
  }

  let answer = response.trim();

  // Remove code blocks
  if (answer.startsWith('```')) {
    const lines = answer.split('\n');
    answer = lines.slice(1, -1).join('\n').trim();

    if (!answer) {
      return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
    }
  }

  // Parse JSON if present, including nested JSON strings.
  const maxAttempts = 5;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      const parsed: unknown = JSON.parse(answer);

      if (typeof parsed === 'string') {
        answer = parsed.trim();
        if (!answer) {
          return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
        }

        if ((answer.startsWith('{') && answer.endsWith('}')) || (answer.startsWith('[') && answer.endsWith(']'))) {
          continue;
        }

        break;
      }

      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;

        if ('answer' in record) {
          const extracted = record.answer;

          if (extracted === null || extracted === undefined || extracted === '') {
            return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
          }

          if (typeof extracted === 'string') {
            answer = extracted.trim();
            if (!answer) {
              return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
            }

            if ((answer.startsWith('{') && answer.endsWith('}')) || (answer.startsWith('[') && answer.endsWith(']'))) {
              continue;
            }

            break;
          }

          if (typeof extracted === 'object') {
            answer = JSON.stringify(extracted);
            continue;
          }
        }

        const values = Object.values(record);
        if (values.length === 1) {
          const firstValue = values[0];

          if (firstValue === null || firstValue === undefined || firstValue === '') {
            return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
          }

          if (typeof firstValue === 'string') {
            answer = firstValue.trim();
            if (!answer) {
              return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
            }

            if ((answer.startsWith('{') && answer.endsWith('}')) || (answer.startsWith('[') && answer.endsWith(']'))) {
              continue;
            }

            break;
          }

          if (typeof firstValue === 'object') {
            answer = JSON.stringify(firstValue);
            continue;
          }
        }

        if (values.length === 0) {
          return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
        }
      }

      break;
    } catch {
      break;
    }
  }

  // Remove markdown formatting.
  answer = answer.replace(/\*\*/g, '').replace(/\*/g, '');

  // Remove common DeepSeek sentinel tokens if they appear in output.
  const artifacts = [
    '<｜begin▁of▁sentence｜>',
    '<|begin_of_sentence|>',
    '<｜end▁of▁sentence｜>',
    '<|end_of_sentence|>',
  ];

  for (const artifact of artifacts) {
    answer = answer.replace(new RegExp(artifact, 'g'), '');
  }

  answer = answer.trim();

  if (
    !answer ||
    answer === '""' ||
    answer === "''" ||
    answer === '{}' ||
    answer === '[]' ||
    answer === 'null' ||
    answer === 'undefined' ||
    answer.toLowerCase() === 'none'
  ) {
    return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
  }

  return answer;
}
