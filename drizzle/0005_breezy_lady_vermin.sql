ALTER TABLE `leads` ADD `updated_at` text;
--> statement-breakpoint
CREATE VIEW lead_modification_times AS
SELECT l.id, COALESCE(l.updated_at, NULLIF(MAX(
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(l.data,'$.createdAt')),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(created_at) FROM notes WHERE lead_id=l.id)),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(created_at) FROM activities WHERE lead_id=l.id)),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(json_extract(data,'$.receivedAt')) FROM inquiries WHERE lead_id=l.id)),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(json_extract(data,'$.createdAt')) FROM callbacks WHERE lead_id=l.id)),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(json_extract(data,'$.completedAt')) FROM callbacks WHERE lead_id=l.id)),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(json_extract(j.value,'$.at')) FROM meetings m, json_each(m.data,'$.history') j WHERE m.lead_id=l.id)),''),
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',(SELECT MAX(json_extract(data,'$.completedAt')) FROM meetings WHERE lead_id=l.id)),'')
),''),strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS updated_at FROM leads l;
--> statement-breakpoint
CREATE TRIGGER leads_created_clock AFTER INSERT ON leads BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER leads_modified_clock AFTER UPDATE OF data,status,owner_id ON leads
WHEN OLD.data IS NOT NEW.data OR OLD.status IS NOT NEW.status OR OLD.owner_id IS NOT NEW.owner_id
BEGIN UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER notes_modified_clock AFTER INSERT ON notes BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.lead_id;
END;
--> statement-breakpoint
CREATE TRIGGER inquiries_created_clock AFTER INSERT ON inquiries BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.lead_id;
END;
--> statement-breakpoint
CREATE TRIGGER meetings_created_clock AFTER INSERT ON meetings BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.lead_id;
END;
--> statement-breakpoint
CREATE TRIGGER meetings_modified_clock AFTER UPDATE OF data ON meetings WHEN OLD.data IS NOT NEW.data BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.lead_id;
END;
--> statement-breakpoint
CREATE TRIGGER callbacks_created_clock AFTER INSERT ON callbacks BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.lead_id;
END;
--> statement-breakpoint
CREATE TRIGGER callbacks_modified_clock AFTER UPDATE ON callbacks WHEN OLD.data IS NOT NEW.data BEGIN
 UPDATE leads SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.lead_id;
END;
