-- Activated once by the Node email runtime when SMTP is configured. Retain
-- member credentials as migration proof; never delete rooms or history.
CREATE TABLE email_entry_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  activated_at TEXT
);
INSERT INTO email_entry_policy(id,required) VALUES (1,0);
