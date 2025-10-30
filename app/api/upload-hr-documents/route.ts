// app/api/upload-hr-documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const POST = async (req: NextRequest) => {
    try {
        const formData = await req.formData();
        const files = formData.getAll('files') as File[];

        if (!files.length) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        const uploaded: string[] = [];
        const errors: string[] = [];

        const PDFParser = (await import('pdf2json')).default;

        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                errors.push(`${file.name}: Only PDF files allowed`);
                continue;
            }

            try {
                const buffer = Buffer.from(await file.arrayBuffer());
                const pdfParser = new PDFParser();

                const content = await new Promise<string>((resolve, reject) => {
                    pdfParser.on('pdfParser_dataError', (err: any) => reject(err.parserError));
                    pdfParser.on('pdfParser_dataReady', (data: any) => {
                        const text = data.Pages.map((p: any) =>
                            p.Texts.map((t: any) =>
                                decodeURIComponent(t.R.map((r: any) => r.T).join(''))
                            ).join(' ')
                        ).join('\n');
                        resolve(text);
                    });
                    pdfParser.parseBuffer(buffer);
                });

                const trimmed = content.trim();
                if (trimmed.length < 50) {
                    errors.push(`${file.name}: Empty PDF`);
                    continue;
                }

                // Use Prisma upsert
                await db.hRDocument.upsert({
                    where: { filename: file.name },
                    update: { content: trimmed },
                    create: { filename: file.name, content: trimmed },
                });

                uploaded.push(file.name);
            } catch (e: any) {
                errors.push(`${file.name}: ${e.message}`);
            }
        }

        if (uploaded.length === 0) {
            return NextResponse.json({ error: 'No valid PDFs', details: errors }, { status: 400 });
        }

        return NextResponse.json({
            message: 'Uploaded successfully',
            uploaded,
            errors: errors.length ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
};