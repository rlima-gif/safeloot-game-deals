CREATE TABLE `news_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	`summary` text
);
--> statement-breakpoint
CREATE INDEX `news_runs_started` ON `news_runs` (`started_at`);