// lib/rag.ts
import { queryDeepSeek, processDeepSeekResponse } from './ai';
import { db } from './db';

async function generateSearchTerms(query: string): Promise<string> {
    const prompt = `Given this user question, generate 3-5 SHORT single-word or two-word keywords to search HR documents.

Question: "${query}"

Focus on core concepts only. Keep it simple.
Examples:
- "I'm feeling sick" → ["sick", "absence", "leave"]
- "Can I work from home?" → ["remote", "work", "home"]
- "Vacation days?" → ["vacation", "leave", "days"]

Return ONLY a JSON object with simple keywords:
{"keywords": ["term1", "term2", "term3"]}`;

    try {
        const raw = await queryDeepSeek(prompt);
        const processed = processDeepSeekResponse(raw);
        const parsed = JSON.parse(processed);
        const keywords = (parsed.keywords || []).slice(0, 3);
        const terms = keywords.join(' ') || query;
        console.log('🔍 Search terms:', terms);
        return terms;
    } catch (e) {
        console.error('❌ Search term generation failed:', e);
        const words = query.toLowerCase().match(/\b\w+\b/g) || [];
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'i', 'my', 'me', 'might', 'not', 'make', 'it', 'today']);
        const fallback = words.filter(w => !stopWords.has(w) && w.length > 2).slice(0, 3).join(' ');
        return fallback || query;
    }
}

function chunkDocument(content: string, chunkSize: number = 800): string[] {
    // Try splitting by double newlines first (paragraphs)
    let paragraphs = content.split(/\n\n+/);

    // If that doesn't work well (too few chunks), try single newlines
    if (paragraphs.length < 5) {
        paragraphs = content.split(/\n/);
    }

    // If still too few, split by sentences
    if (paragraphs.length < 5) {
        paragraphs = content.split(/\.\s+/);
    }

    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        // If this paragraph alone is too large, split it further
        if (trimmed.length > chunkSize) {
            // Save current chunk if it exists
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }

            // Split large paragraph into smaller pieces
            const words = trimmed.split(' ');
            let tempChunk = '';
            for (const word of words) {
                if (tempChunk.length + word.length > chunkSize) {
                    if (tempChunk) chunks.push(tempChunk.trim());
                    tempChunk = word;
                } else {
                    tempChunk += (tempChunk ? ' ' : '') + word;
                }
            }
            if (tempChunk) chunks.push(tempChunk.trim());
            continue;
        }

        // If adding this paragraph exceeds chunk size and we have content, save current chunk
        if (currentChunk && (currentChunk.length + trimmed.length > chunkSize)) {
            chunks.push(currentChunk.trim());
            currentChunk = trimmed;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
        }
    }

    // Add remaining chunk
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 50); // Filter out tiny chunks
}

function scoreChunk(chunk: string, searchTerms: string): number {
    const chunkLower = chunk.toLowerCase();
    const terms = searchTerms.toLowerCase().split(' ');
    let score = 0;

    for (const term of terms) {
        // Count occurrences of each term
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = chunkLower.match(regex);
        if (matches) {
            score += matches.length * 10;
        }

        // Bonus for terms in first 100 characters (likely headers/titles)
        if (chunkLower.substring(0, 100).includes(term)) {
            score += 5;
        }
    }

    return score;
}

export async function retrieveRelevantText(query: string): Promise<string> {
    const searchTerms = await generateSearchTerms(query);
    console.log('🔎 Searching with terms:', searchTerms);

    // Get all documents (we'll chunk and score them)
    const documents = await db.hRDocument.findMany({
        select: { content: true }
    });

    console.log('📄 Total documents:', documents.length);

    if (documents.length === 0) return '';

    // Chunk all documents and score each chunk
    const scoredChunks: { chunk: string; score: number }[] = [];

    for (const doc of documents) {
        const chunks = chunkDocument(doc.content, 800); // Increased from 500
        console.log(`📄 Document chunked into ${chunks.length} pieces`);

        for (const chunk of chunks) {
            const score = scoreChunk(chunk, searchTerms);
            if (score > 0) {
                scoredChunks.push({ chunk, score });
            }
        }
    }

    // Sort by score and take top 3-4 chunks (reduced from 5)
    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 3).map(sc => sc.chunk);

    console.log('📄 Top chunks found:', topChunks.length);
    console.log('📄 Scores:', scoredChunks.slice(0, 3).map(sc => sc.score));
    if (topChunks.length > 0) {
        console.log('📄 First chunk preview:', topChunks[0].substring(0, 200));
    }

    const relevantContext = topChunks.join('\n\n---\n\n');
    console.log('📄 Total context length:', relevantContext.length);

    return relevantContext;
}

export async function answerHRQuestion(question: string, ip?: string): Promise<{ answer: string }> {

    // === CHECK: Do ANY documents exist? ===
    const docCount = await db.hRDocument.count();

    if (docCount === 0) {
        const prompt = `You are an HR assistant. No HR documents are uploaded yet.

User message: "${question}"

Instructions:
1. If this is a greeting (hi, hello, good morning, etc.) → Respond warmly and say no docs are uploaded.
2. If this is thanks (thank you, appreciate, etc.) → Say "You're welcome" and offer more help.
3. Otherwise → Say no documents are available and ask admin to upload.

Return valid JSON only:
{"answer": "your response"}`;

        try {
            const raw = await queryDeepSeek(prompt);
            const answer = processDeepSeekResponse(raw);
            return { answer: answer || "I don't have access to HR documents yet. Please ask your admin to upload policies." };
        } catch (e) {
            console.error('AI fallback failed:', e);
            return { answer: "I don't have access to HR documents yet. Please ask your admin to upload policies." };
        }
    }

    // === Documents exist - try to find relevant ones ===
    const context = await retrieveRelevantText(question);
    console.log('📝 Context provided to AI:', context.length, 'characters');

    // === Normal RAG Flow ===
    const prompt = `You are an HR assistant. Answer using ONLY the information below.

Question: ${question}

Available Information:
${context || 'No relevant information found.'}

Instructions:
1. If greeting → Respond warmly
2. If thanks → Acknowledge politely
3. Think about what the user is really asking
4. Use reasoning to find relevant policies in the information above
5. Answer naturally without mentioning "documents" or "policies"
6. If nothing relevant exists → Say "I don't have information about that. Can I help with something else?"

BE CLEAR AND CONCISE. Give a helpful answer in 2-4 sentences.

Return ONLY valid JSON:
{"answer": "your response"}`;

    try {
        const raw = await queryDeepSeek(prompt);
        console.log('💬 Raw AI answer length:', raw.length);

        const answer = processDeepSeekResponse(raw);
        console.log('💬 Processed answer:', answer.substring(0, 200));

        return { answer };
    } catch (e) {
        console.error('AI call failed:', e);
        return { answer: 'Technical issue. Try again later.' };
    }
}