// lib/prisma-setup.ts
import { db } from './db';

export async function setupFullTextIndexes() {
  await db.$executeRaw`
    DROP INDEX IF EXISTS idx_hr_documents_content_fts;
  `;

  await db.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_hr_document_chunks_content_fts
    ON "HRDocumentChunk" USING gin(to_tsvector('english', content));
  `;

  console.log('Full-text index created for HRDocumentChunk');
}