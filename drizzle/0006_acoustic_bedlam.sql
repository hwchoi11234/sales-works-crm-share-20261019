CREATE TABLE `lead_write_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER lead_write_owner_check BEFORE INSERT ON lead_write_checks
WHEN NOT EXISTS (SELECT 1 FROM leads WHERE id=NEW.lead_id AND owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT, 'lead_owner_changed'); END;
