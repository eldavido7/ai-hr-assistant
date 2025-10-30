// app/api/clear-hr-documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const DELETE = async (req: NextRequest) => {
    try {
        const { searchParams } = new URL(req.url);
        const idParam = searchParams.get('id');

        if (idParam) {
            const id = parseInt(idParam, 10);
            if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

            const doc = await db.hRDocument.delete({
                where: { id },
                select: { id: true, filename: true },
            });

            return NextResponse.json({
                message: 'Document deleted',
                deleted: { id: doc.id, filename: doc.filename },
            });
        } else {
            await db.hRDocument.deleteMany({});
            return NextResponse.json({ message: 'All HR documents deleted' });
        }
    } catch (error: any) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Failed', details: error.message }, { status: 500 });
    }
};