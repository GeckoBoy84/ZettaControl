import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.ts';
import * as schema from './schema.ts';

// onnotice: Postgres sends notices such as "schema already exists, skipping" on every
// migration run. They are harmless and would only clutter the console.
export const sql = postgres(env.DATABASE_URL, { max: 10, onnotice: () => undefined });
export const db = drizzle(sql, { schema });
