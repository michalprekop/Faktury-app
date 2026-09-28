PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, apple_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended')),
  profile TEXT NOT NULL DEFAULT '{}', profile_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, apple_refresh TEXT NOT NULL,
  checked_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE templates (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1, config TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE template_grants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(id),
  PRIMARY KEY (user_id, template_id)
);
CREATE TABLE invoices (
  id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL COLLATE NOCASE, version INTEGER NOT NULL,
  document TEXT NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,id), UNIQUE(user_id,number)
);
CREATE INDEX invoices_list ON invoices(user_id,deleted_at,updated_at);
CREATE TABLE invoice_versions (
  user_id TEXT NOT NULL, invoice_id TEXT NOT NULL, version INTEGER NOT NULL,
  document TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,invoice_id,version),
  FOREIGN KEY(user_id,invoice_id) REFERENCES invoices(user_id,id)
);
CREATE TRIGGER invoice_created AFTER INSERT ON invoices BEGIN
  INSERT INTO invoice_versions VALUES(NEW.user_id,NEW.id,NEW.version,NEW.document,NEW.updated_at);
END;
CREATE TRIGGER invoice_updated AFTER UPDATE OF document ON invoices WHEN OLD.version != NEW.version BEGIN
  INSERT INTO invoice_versions VALUES(NEW.user_id,NEW.id,NEW.version,NEW.document,NEW.updated_at);
END;
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  target_id TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE backup_runs (
  day TEXT PRIMARY KEY, completed_at TEXT, accounts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('running','complete','failed'))
);
INSERT INTO templates(id,name,description,config,created_at,updated_at) VALUES
('classic','Boring default 01','Čistá faktúra s vaším logom a farbou.','{"layout":"classic","accent":"#1b4338","wordmark":"","logo":"","footer":""}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('mono','Mono 01','Typografická faktúra s monospaced písmom.','{"layout":"mono","accent":"#222222","wordmark":"","logo":"","footer":""}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
