// lib/ai.ts
// === DeepSeek API Call ===
export async function queryDeepSeek(prompt: string): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000', // Change to Vercel URL in prod
            'X-Title': 'HR AI Assistant',
        },
        body: JSON.stringify({
            model: 'deepseek/deepseek-chat-v3.1:free',
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 2000,
            temperature: 0.7,
            top_p: 0.9,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error('DeepSeek API error:', err);
        throw new Error(`DeepSeek failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

// === Response Processing (Exact port of Python) ===
const EMPTY_RESPONSE = "I apologize, but I couldn't generate a proper response. Can you send that message again?";

// lib/ai.ts
export function processDeepSeekResponse(response: string): string {
    if (!response || !response.trim()) {
        return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
    }

    let answer = response.trim();

    // Remove code blocks
    if (answer.startsWith('```')) {
        const lines = answer.split('\n');
        answer = lines.slice(1, -1).join('\n').trim();
    }

    // === CRITICAL: Parse JSON if present ===
    try {
        const parsed = JSON.parse(answer);
        if (parsed && typeof parsed === 'object' && 'answer' in parsed) {
            answer = String(parsed.answer).trim();
        }
    } catch (e) {
        // Not JSON — continue
    }

    // Remove markdown
    answer = answer.replace(/\*\*/g, '').replace(/\*/g, '');

    // Remove DeepSeek artifacts
    const artifacts = [
        '<｜begin▁of▁sentence｜>',
        '<|begin_of_sentence|>',
        '<｜end▁of▁sentence｜>',
        '<|end_of_sentence|>',
    ];
    artifacts.forEach(art => {
        answer = answer.replace(new RegExp(art, 'g'), '');
    });

    answer = answer.trim();

    if (!answer || ['""', "''", '{}', '[]'].includes(answer)) {
        return "I apologize, but I couldn't generate a proper response. Can you send that message again?";
    }

    return answer;
}