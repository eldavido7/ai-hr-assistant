## HR knowledge-base search

The RAG pipeline stores overlapping text chunks in PostgreSQL, uses PostgreSQL
full-text search and Upstash Vector semantic search together, then sends the
best matching context to DeepSeek. Upstash Vector generates embeddings for
uploaded text using the embedding model configured on the index; a separate
OpenAI API key is not needed.

### Required configuration

- `DATABASE_URL`: PostgreSQL connection string.
- `DEEPSEEK_API_KEY`: DeepSeek chat API key for answer generation.
- `UPSTASH_VECTOR_REST_URL` and `UPSTASH_VECTOR_REST_TOKEN`: credentials for
  an Upstash Vector index configured with the `openai/text-embedding-3-small`
  embedding model and cosine distance.

To cache repeated answers, also configure
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Caching is skipped
when these Redis variables are absent. Cache keys include a database corpus
version, so document updates naturally use a fresh cache.

### Database and existing documents

Push the Prisma schema to PostgreSQL, then index existing documents in Upstash
Vector. Run these commands after configuring the environment:

```bash
npx prisma db push
npm run rag:reindex
```

The reindex command may be run again safely after a failed or partial indexing
run. New PDF uploads are chunked and indexed automatically. Deleting documents
also removes their vectors. PostgreSQL full-text search is applied to the
indexed chunks rather than loading and scoring every document in application
memory.

### Answer scope and escalation

Each question is classified in the answer-generation call as answerable from
retrieved organisation information, out of scope, or organisation-related but not sufficiently
answered by the available information. Out-of-scope questions receive a brief
scope explanation and do not request escalation. Organisation-related questions without
sufficient evidence request escalation. Currently, only the WhatsApp webhook
forwards those questions, and it sends them to the single
`WHATSAPP_ESCALATION_NUMBER`; web and Telegram responses do not forward them.

## Run locally

```bash
npm run dev
```

# or

yarn dev

# or

pnpm dev

# or

bun dev

```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
```
