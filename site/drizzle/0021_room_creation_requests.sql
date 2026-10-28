-- Account-scoped creation replay; no raw request IDs, tokens or credentials.
CREATE TABLE room_creation_requests (
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  request_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(account_id, request_hash)
);
