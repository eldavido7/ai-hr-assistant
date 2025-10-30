// app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { answerHRQuestion } from '@/lib/rag';

export async function POST(req: NextRequest) {
    try {
        const { question } = await req.json();
        if (!question || typeof question !== 'string') {
            return NextResponse.json({ error: 'Missing or invalid question' }, { status: 400 });
        }

        const { answer } = await answerHRQuestion(question.trim());
        return NextResponse.json({ answer });
    } catch (error: any) {
        console.error('Ask route error:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}