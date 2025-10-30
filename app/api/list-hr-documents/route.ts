// app/api/list-hr-documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const GET = async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search')?.trim();

        let documents;

        if (search) {
            documents = await db.hRDocument.findMany({
                where: {
                    filename: { contains: search, mode: 'insensitive' },
                },
                select: { id: true, filename: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            });
        } else {
            documents = await db.hRDocument.findMany({
                select: { id: true, filename: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            });
        }

        interface HRDocumentRaw {
            id: number;
            filename: string;
            content?: string | Buffer;
            createdAt: Date;
        }

        interface FormattedDocument {
            id: number;
            filename: string;
            content_length: number;
            created_at: Date;
        }

        const formatted: FormattedDocument[] = (documents as HRDocumentRaw[]).map(d => ({
            id: d.id,
            filename: d.filename,
            content_length: d.content ? d.content.length : 0,
            created_at: d.createdAt,
        }));

        return NextResponse.json({
            documents: formatted,
            count: formatted.length,
        });
    } catch (error: any) {
        console.error('List error:', error);
        return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
    }
};