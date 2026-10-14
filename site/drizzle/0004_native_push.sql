ALTER TABLE chore_push_subscriptions ADD COLUMN provider TEXT NOT NULL DEFAULT 'web' CHECK(provider IN ('web','jpush'));
ALTER TABLE chore_push_subscriptions ADD COLUMN platform TEXT NOT NULL DEFAULT 'web' CHECK(platform IN ('web','android','harmony'));
ALTER TABLE chore_push_subscriptions ADD COLUMN device_id TEXT;
ALTER TABLE chore_push_subscriptions ADD COLUMN device_secret_hash TEXT;
CREATE UNIQUE INDEX chore_native_device_idx ON chore_push_subscriptions(provider,platform,device_id) WHERE device_id IS NOT NULL;
