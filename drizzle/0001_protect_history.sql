CREATE TRIGGER notes_no_update BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT, 'consultation_history_is_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER notes_no_delete BEFORE DELETE ON notes BEGIN SELECT RAISE(ABORT, 'consultation_history_is_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER inquiries_no_delete BEFORE DELETE ON inquiries BEGIN SELECT RAISE(ABORT, 'original_inquiry_is_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER inquiries_protect_source BEFORE UPDATE ON inquiries
WHEN NEW.lead_id != OLD.lead_id OR NEW.id != OLD.id
OR json_extract(NEW.data,'$.raw') IS NOT json_extract(OLD.data,'$.raw')
OR json_extract(NEW.data,'$.summary') IS NOT json_extract(OLD.data,'$.summary')
OR json_extract(NEW.data,'$.source') IS NOT json_extract(OLD.data,'$.source')
OR json_extract(NEW.data,'$.campaign') IS NOT json_extract(OLD.data,'$.campaign')
OR json_extract(NEW.data,'$.receivedAt') IS NOT json_extract(OLD.data,'$.receivedAt')
BEGIN SELECT RAISE(ABORT, 'original_inquiry_is_immutable'); END;
