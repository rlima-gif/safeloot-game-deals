CREATE TABLE `collection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`result` text
);
--> statement-breakpoint
CREATE TABLE `games` (
	`app_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`monitored` integer DEFAULT 1 NOT NULL,
	`checked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_health` (
	`store` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`checked_at` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product` text NOT NULL,
	`price_cents` integer NOT NULL,
	`original_cents` integer NOT NULL,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`observed_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`product`) REFERENCES `store_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_observation` ON `price_history` (`product`,`observed_at`);--> statement-breakpoint
CREATE INDEX `price_product_time` ON `price_history` (`product`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `store_products` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`store` text NOT NULL,
	`product_id` text NOT NULL,
	`url` text NOT NULL,
	`edition` text,
	`launcher` text,
	`region` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` text NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `games`(`app_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_game` ON `store_products` (`app_id`,`store`);