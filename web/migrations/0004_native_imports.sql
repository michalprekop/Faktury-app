CREATE TABLE native_imports (
  user_id TEXT PRIMARY KEY REFERENCES users(id), source_hash TEXT NOT NULL,
  invoice_count INTEGER NOT NULL, created_at TEXT NOT NULL,
  empty_account INTEGER NOT NULL CHECK(empty_account=1)
);
