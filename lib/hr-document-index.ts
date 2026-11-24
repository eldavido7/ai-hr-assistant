import { Index } from '@upstash/vector';
import { db } from './db';

const VECTOR_NAMESPACE = 'hr-documents-v1';
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;
const VECTOR_BATCH_SIZE = 100;

interface HRDocumentVectorMetadata extends Record<string, unknown> {
  documentId: number;
  filename: string;
}

let vectorIndex: Index<HRDocumentVectorMetadata> | undefined;

function getVectorIndex(): Index<HRDocumentVectorMetadata> {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) {
    throw new Error('UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are required for document indexing and search');
  }

  if (!vectorIndex) {
    vectorIndex = new Index<HRDocumentVectorMetadata>({ url, token });
  }

  return vectorIndex;
}

function getVectorNamespace() {
  return getVectorIndex().namespace(VECTOR_NAMESPACE);
}

export function getHRVectorNamespace() {
  return getVectorNamespace();
}

export function chunkDocument(content: string): string[] {
  const normalized = content.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);

    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end);
      if (boundary > start + CHUNK_SIZE / 2) {
        end = boundary;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    if (end === normalized.length) {
      break;
    }

    start = Math.max(start + 1, end - CHUNK_OVERLAP);
    while (normalized[start] === ' ') {
      start += 1;
    }
  }

  return chunks;
}

async function syncChunkVectors(
  documentId: number,
  filename: string,
  chunks: Array<{ id: number; content: string }>,
): Promise<void> {
  const namespace = getVectorNamespace();

  for (let offset = 0; offset < chunks.length; offset += VECTOR_BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + VECTOR_BATCH_SIZE);
    await namespace.upsert(
      batch.map((chunk) => ({
        id: `hrchunk-${chunk.id}`,
        data: chunk.content,
        metadata: { documentId, filename },
      })),
    );
  }
}

export async function indexHRDocument(filename: string, content: string): Promise<void> {
  const newChunks = chunkDocument(content);
  if (!newChunks.length) {
    throw new Error(`Document "${filename}" did not produce any searchable chunks`);
  }

  const document = await db.hRDocument.upsert({
    where: { filename },
    update: { content },
    create: { filename, content },
    select: { id: true },
  });

  const previousChunks = await db.hRDocumentChunk.findMany({
    where: { documentId: document.id },
    select: { id: true },
  });

  await db.$transaction([
    db.hRDocumentChunk.deleteMany({ where: { documentId: document.id } }),
    db.hRDocumentChunk.createMany({
      data: newChunks.map((chunk, chunkIndex) => ({
        documentId: document.id,
        chunkIndex,
        content: chunk,
      })),
    }),
  ]);

  const indexedChunks = await db.hRDocumentChunk.findMany({
    where: { documentId: document.id },
    select: { id: true, content: true },
  });

  await syncChunkVectors(document.id, filename, indexedChunks);

  if (previousChunks.length) {
    await getVectorNamespace().delete(
      previousChunks.map((chunk) => `hrchunk-${chunk.id}`),
    );
  }
}

export async function deleteHRDocument(documentId: number): Promise<void> {
  const chunks = await db.hRDocumentChunk.findMany({
    where: { documentId },
    select: { id: true },
  });

  if (chunks.length) {
    await getVectorNamespace().delete(chunks.map((chunk) => `hrchunk-${chunk.id}`));
  }

  await db.hRDocument.delete({ where: { id: documentId } });
}

export async function deleteAllHRDocuments(): Promise<void> {
  await getVectorNamespace().delete({ prefix: 'hrchunk-' });
  await db.hRDocument.deleteMany({});
}

export async function reindexAllHRDocuments(): Promise<number> {
  const documents = await db.hRDocument.findMany({
    select: { filename: true, content: true },
  });

  for (const document of documents) {
    await indexHRDocument(document.filename, document.content);
  }

  return documents.length;
}
