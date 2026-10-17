-- Additive migration: existing users, memberships and history keep their IDs.
CREATE TABLE email_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  mail_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mail_enabled IN (0,1)),
  mail_enabled_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE email_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ready INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX email_challenges_email_time ON email_challenges(email,created_at);
CREATE INDEX email_challenges_client_time ON email_challenges(client_hash,created_at);
CREATE TABLE email_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX email_sessions_account ON email_sessions(account_id);
CREATE TABLE email_members (
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
  creator_verified INTEGER NOT NULL DEFAULT 0 CHECK(creator_verified IN (0,1)),
  bound_at TEXT NOT NULL,
  PRIMARY KEY(account_id,dorm_id)
);
CREATE TABLE email_grants (
  token_hash TEXT PRIMARY KEY,
  email_session_hash TEXT NOT NULL REFERENCES email_sessions(token_hash) ON DELETE CASCADE,
  full_session INTEGER NOT NULL CHECK(full_session IN (0,1))
);
CREATE TABLE email_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES email_accounts(id),
  reminder_id INTEGER REFERENCES chore_reminders(id),
  kind TEXT NOT NULL DEFAULT 'reminder' CHECK(kind IN ('reminder','test')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(account_id,reminder_id)
);
CREATE INDEX email_jobs_due ON email_jobs(status,next_attempt_at);
