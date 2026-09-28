ALTER TABLE oauth_states ADD COLUMN desktop_challenge TEXT;
CREATE TABLE desktop_handoffs (
  code_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL, session_encrypted TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
