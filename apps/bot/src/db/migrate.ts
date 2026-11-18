import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import { db, sql } from './client.ts';

await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
await sql.end();
console.log('Database is up to date.');
