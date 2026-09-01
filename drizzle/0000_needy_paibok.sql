CREATE TABLE `workflow_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol_code` text NOT NULL,
	`name` text NOT NULL,
	`objective` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`stages_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_drafts_protocol_code_unique` ON `workflow_drafts` (`protocol_code`);