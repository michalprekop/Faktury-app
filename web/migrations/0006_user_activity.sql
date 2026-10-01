-- Unknown historical activity stays unknown until the next authenticated request.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;
