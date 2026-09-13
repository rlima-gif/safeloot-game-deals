CREATE TABLE `news_article_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` text NOT NULL,
	`raw_item_id` text NOT NULL,
	`source_name` text NOT NULL,
	`article_url` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_item_id`) REFERENCES `news_raw_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `news_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`app_id` integer,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`why_it_matters` text NOT NULL,
	`purchase_advice` text NOT NULL,
	`category` text NOT NULL,
	`purchase_impact` text NOT NULL,
	`published_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `news_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `games`(`app_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `article_app_idx` ON `news_articles` (`app_id`);--> statement-breakpoint
CREATE INDEX `article_published_idx` ON `news_articles` (`published_at`);--> statement-breakpoint
CREATE TABLE `news_events` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`importance` integer NOT NULL,
	`confidence` real NOT NULL,
	`purchase_impact` text NOT NULL,
	`safe_to_publish` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `games`(`app_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_app_idx` ON `news_events` (`app_id`);--> statement-breakpoint
CREATE TABLE `news_raw_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`article_id` text NOT NULL,
	`article_url` text NOT NULL,
	`title` text NOT NULL,
	`snippet` text,
	`published_at` text NOT NULL,
	`collected_at` text NOT NULL,
	`app_id` integer,
	`hash` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `news_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `games`(`app_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_hash_idx` ON `news_raw_items` (`hash`);--> statement-breakpoint
CREATE INDEX `raw_app_idx` ON `news_raw_items` (`app_id`);--> statement-breakpoint
CREATE TABLE `news_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`url` text,
	`last_checked_at` text,
	`status` text DEFAULT 'ok' NOT NULL
);
