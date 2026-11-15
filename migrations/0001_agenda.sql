CREATE TABLE agenda (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT NOT NULL,
  reviewer TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  stamp TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{"dates":[]}'
);
CREATE TABLE laudos (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE historico (
  laudo_id TEXT NOT NULL REFERENCES laudos(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (laudo_id, pos)
);
CREATE TABLE modelos (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
