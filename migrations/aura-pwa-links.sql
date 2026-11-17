CREATE TABLE IF NOT EXISTS aura_pwa_links (
  challenge TEXT PRIMARY KEY,
  sealed_profile TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS aura_pwa_links_expiry ON aura_pwa_links (expires_at);
