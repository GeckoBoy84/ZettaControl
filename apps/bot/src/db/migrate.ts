import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import { db, sql } from './client.ts';

/** Applies any pending migrations. Safe to run on every start. */
export async function migrateDatabase(): Promise<void> {
	await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
}

// `npm run db:migrate`
if (import.meta.main) {
	await migrateDatabase();
	await sql.end();
	console.log('Database is up to date.');
}
