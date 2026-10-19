CREATE TABLE `lead_statuses` (
	`name` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_brand_phone` ON `leads` (`brand_id`, (replace(replace(replace(replace(replace(json_extract("data", '$.phone'), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')));
