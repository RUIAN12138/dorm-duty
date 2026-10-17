-- Clamp existing device credentials without changing user data or account sessions.
UPDATE sessions SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+90 days')
WHERE kind='device' AND julianday(expires_at)>julianday(created_at,'+90 days');
UPDATE member_sessions SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+90 days')
WHERE julianday(expires_at)>julianday(created_at,'+90 days');
CREATE TABLE auth_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TEXT NOT NULL);
