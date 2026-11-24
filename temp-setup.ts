// temp-setup.ts
import 'dotenv/config';
import { setupFullTextIndexes } from './lib/prisma-setup';
import { reindexAllHRDocuments } from './lib/hr-document-index';

async function setupRAGIndex() {
  await setupFullTextIndexes();
  const documentCount = await reindexAllHRDocuments();
  console.log(`Indexed ${documentCount} existing HR documents`);
}

setupRAGIndex().catch((error: unknown) => {
  console.error('RAG setup failed:', error);
  process.exitCode = 1;
});