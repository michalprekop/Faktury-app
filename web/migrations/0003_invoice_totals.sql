-- New product database only; summaries avoid loading image/document blobs into list memory.
ALTER TABLE invoices ADD COLUMN total TEXT NOT NULL DEFAULT '0.00';
