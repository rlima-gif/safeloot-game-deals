ALTER TABLE `news_articles` ADD `rumor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `news_articles` ADD `provider_type` text DEFAULT 'heuristic' NOT NULL;--> statement-breakpoint
ALTER TABLE `news_events` ADD `rumor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `news_sources` ADD `last_success_at` text;--> statement-breakpoint
ALTER TABLE `news_sources` ADD `last_failure_at` text;--> statement-breakpoint
ALTER TABLE `news_sources` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `news_sources` ADD `last_item_count` integer DEFAULT 0;