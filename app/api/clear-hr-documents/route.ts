// app/api/clear-hr-documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { deleteAllHRDocuments, deleteHRDocument } from '@/lib/hr-document-index';

export const DELETE = async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url);
        const idParam = searchParams.get('id');

        if (idParam) {
            const id = parseInt(idParam, 10);
            if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

            const doc = await db.hRDocument.findUnique({
                where: { id },
                select: { id: true, filename: true },
            });
            if (!doc) {
                return NextResponse.json({ error: 'Document not found' }, { status: 404 });
            }

            await deleteHRDocument(id);

            return NextResponse.json({
                message: 'Document deleted',
                deleted: { id: doc.id, filename: doc.filename },
            });
        } else {
            await deleteAllHRDocuments();
            return NextResponse.json({ message: 'All HR documents deleted' });
        }
    } catch (error: unknown) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Failed', details: (error as Error).message }, { status: 500 });
    }
};