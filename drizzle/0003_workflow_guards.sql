CREATE UNIQUE INDEX callbacks_one_pending ON callbacks(lead_id) WHERE status='예정';
--> statement-breakpoint
CREATE TRIGGER activities_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT, 'activity_history_is_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER activities_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT, 'activity_history_is_append_only'); END;
