-- SQLite supports UTF-8 by default, allowing mixed language storage (English, Japanese, etc.)
DROP TABLE IF EXISTS safety_checks;

CREATE TABLE safety_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,       -- Stores UTF-8 (e.g., "Tanaka", "田中")
  id_number TEXT,           -- Hidden ID
  location TEXT,            -- Stores UTF-8
  status TEXT NOT NULL,
  message TEXT,             -- Stores UTF-8
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices allow searching efficiently regardless of language
CREATE INDEX idx_name ON safety_checks(name);
CREATE INDEX idx_id_number ON safety_checks(id_number);
CREATE INDEX idx_location ON safety_checks(location);
