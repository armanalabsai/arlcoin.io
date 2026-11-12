-- arlcoin.io whitelist, Cloudflare D1 database `arl-whitelist` (region WEUR). Only ARL data lives
-- here; it shares nothing with any other project. The site writes through the Pages Function
-- functions/api/whitelist.js, which inserts and never returns stored data.
CREATE TABLE IF NOT EXISTS whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL UNIQUE CHECK (wallet GLOB '0x[0-9a-f]*' AND length(wallet) = 42),
  email TEXT NOT NULL UNIQUE CHECK (length(email) BETWEEN 6 AND 254 AND email = lower(email)),
  privacy_notice_version TEXT NOT NULL CHECK (length(privacy_notice_version) BETWEEN 1 AND 32),
  privacy_accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  transfer_consent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS whitelist_created_at_idx ON whitelist (created_at);
