DROP VIEW lead_modification_times;
--> statement-breakpoint
CREATE VIEW lead_modification_times AS SELECT l.id, COALESCE(l.updated_at,NULLIF(MAX(
COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(l.data,'$.createdAt')),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',created_at)) FROM notes WHERE lead_id=l.id),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',created_at)) FROM activities WHERE lead_id=l.id),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(data,'$.receivedAt'))) FROM inquiries WHERE lead_id=l.id),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(data,'$.createdAt'))) FROM callbacks WHERE lead_id=l.id),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(data,'$.completedAt'))) FROM callbacks WHERE lead_id=l.id),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(data,'$.completedAt'))) FROM meetings WHERE lead_id=l.id),''),
COALESCE((SELECT MAX(strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(j.value,'$.at'))) FROM meetings m,json_each(m.data,'$.history') j WHERE m.lead_id=l.id),'')
),''),strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS updated_at FROM leads l;
