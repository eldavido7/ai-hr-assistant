// lib/prisma-setup.ts
import { db } from './db';

export async function setupFullTextIndexes() {
  await db.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_hr_documents_content_fts 
    ON "HRDocument" USING gin(to_tsvector('english', content));
  `;

  console.log('Full-text index created for HRDocument');
}