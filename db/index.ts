import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

let initialization: Promise<D1Result<unknown>> | null = null;

export async function getDb() {
  if (!env.DB) throw new Error('ProtocolOS workflow storage is unavailable.');
  initialization ??= env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS workflow_drafts (
      id TEXT PRIMARY KEY NOT NULL,
      protocol_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      version INTEGER DEFAULT 1 NOT NULL,
      stages_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await initialization;
  return drizzle(env.DB, { schema });
}
