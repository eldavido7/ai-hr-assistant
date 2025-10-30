// temp-setup.ts
import { setupFullTextIndexes } from './lib/prisma-setup';

setupFullTextIndexes().catch(console.error);