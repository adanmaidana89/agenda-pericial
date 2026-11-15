ALTER TABLE laudos ADD COLUMN summary TEXT NOT NULL DEFAULT '{}';
UPDATE laudos SET summary=json_remove(payload,'$.text','$.format','$.history');
