import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workflowDrafts = sqliteTable('workflow_drafts', {
  id: text('id').primaryKey(),
  protocolCode: text('protocol_code').notNull().unique(),
  name: text('name').notNull(),
  objective: text('objective').notNull(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  version: integer('version').notNull().default(1),
  stagesJson: text('stages_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
