CREATE TABLE companion_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 account_id INTEGER NOT NULL REFERENCES email_accounts(id),
 request_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')),
 body TEXT NOT NULL,
 emotion TEXT NOT NULL DEFAULT '02',
 created_at TEXT NOT NULL,
 UNIQUE(dorm_id,user_id,account_id,request_id,role)
);
CREATE INDEX companion_messages_scope ON companion_messages(dorm_id,user_id,id);
CREATE TABLE companion_reminder_actions (
 id TEXT PRIMARY KEY,
 dorm_id INTEGER NOT NULL REFERENCES dormitories(id),
 user_id INTEGER NOT NULL REFERENCES users(id),
 target_id INTEGER NOT NULL REFERENCES users(id),
 account_id INTEGER NOT NULL REFERENCES email_accounts(id),
 target_account_id INTEGER NOT NULL REFERENCES email_accounts(id),
 request_id TEXT NOT NULL,
 text TEXT NOT NULL,
 due_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('proposed','pending','sent','cancelled','expired')),
 created_at TEXT NOT NULL,
 confirmed_at TEXT,
 UNIQUE(dorm_id,user_id,account_id,request_id)
);
CREATE INDEX companion_reminder_due ON companion_reminder_actions(status,due_at);
