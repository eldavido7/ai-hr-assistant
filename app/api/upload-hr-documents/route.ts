// app/api/upload-hr-documents/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { indexHRDocument } from '@/lib/hr-document-index';

interface PdfTextRun {
  T: string;
}

interface PdfText {
  R: PdfTextRun[];
}

interface PdfPage {
  Texts: PdfText[];
}

interface PdfParserReadyData {
  Pages?: PdfPage[];
}

interface PdfParserErrorData {
  parserError?: string | Error;
}

interface PdfParserInstance {
  on(event: 'pdfParser_dataError', handler: (err: PdfParserErrorData) => void): void;
  on(event: 'pdfParser_dataReady', handler: (data: PdfParserReadyData) => void): void;
  parseBuffer(buffer: Buffer): void;
}

function extractPdfText(data: PdfParserReadyData): string {
  return (data.Pages ?? [])
    .map((page) =>
      (page.Texts ?? [])
        .map((text) =>
          text.R
            .map((run) => run.T)
            .join('')
        )
        .map((text) => decodeURIComponent(text))
        .join(' ')
    )
    .join('\n');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

export const POST = async (req: NextRequest) => {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploaded: string[] = [];
    const errors: string[] = [];

    const { default: Pdf2JsonParser } = (await import('pdf2json')) as {
      default: new () => PdfParserInstance;
    };

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        errors.push(`${file.name}: Only PDF files allowed`);
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfParser = new Pdf2JsonParser();

        const content = await new Promise<string>((resolve, reject) => {
          pdfParser.on('pdfParser_dataError', (err) => {
            reject(err.parserError ?? new Error('Failed to parse PDF'));
          });

          pdfParser.on('pdfParser_dataReady', (data) => {
            resolve(extractPdfText(data));
          });

          pdfParser.parseBuffer(buffer);
        });

        const trimmed = content.trim();
        if (trimmed.length < 50) {
          errors.push(`${file.name}: Empty PDF`);
          continue;
        }

        await indexHRDocument(file.name, trimmed);

        uploaded.push(file.name);
      } catch (error: unknown) {
        errors.push(`${file.name}: ${getErrorMessage(error)}`);
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
  } catch (error: unknown) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
};
