import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHarness, SQLiteD1 } from "./check-cloud-backend.mjs";
import { handleApi } from "../worker/backend.mjs";
import emailModule from "../runtime/email-runtime.cjs";
const h = await createHarness();
try {
  for (const flag of [undefined, false, true, "true"]) {
    const response = await handleApi(new Request("https://test.invalid/auth/register", {method: "POST", headers: {"EMAIL_GATE_VERIFIED":"true"}, body: "{}"}), {...h.env, EMAIL_GATE_VERIFIED:flag}, {});
    assert.equal(response.status, 503);
    assert.equal((await response.json()).detail.code, "email_gateway_required");
  }
  const runtime = emailModule.createEmailRuntime(h.db, {autoStart:false, version:"fixture-release"});
  const config = await runtime.wrap(new Request("https://test.invalid/email/config"), () => {throw Error("must not dispatch")});
  assert.equal((await config.json()).version, "fixture-release");
  const ops = await runtime.wrap(new Request("https://test.invalid/email/operations"), () => {});
  assert.equal(ops.status, 401);
  await runtime.close();
} finally { h.close(); }
// Upgrade a pre-migration database: no device credential survives; accounts/history stay.
const db = new SQLiteD1();
try {
  for (const name of (await fs.readdir(new URL("../drizzle/", import.meta.url))).filter(n=>n.endsWith(".sql") && n < "0015").sort())
    db.sqlite.exec(await fs.readFile(new URL(`../drizzle/${name}`,import.meta.url), "utf8"));
  db.sqlite.exec(`INSERT INTO users(id,username,password_hash,nickname,created_at) VALUES (1,'fixture','hash','fixture','2026-10-01');
    INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind) VALUES ('retired',1,'2026-10-01','2027-10-01','device'),('account',1,'2026-10-01','2027-10-01','account');`);
  db.sqlite.exec(await fs.readFile(new URL("../drizzle/0015_email_scoped_sessions.sql",import.meta.url),"utf8"));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='device'").get().n,0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='account'").get().n,1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM users").get().n,1);
  assert.equal(db.sqlite.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
} finally { db.close(); }
console.log("邮箱网关失效关闭、版本可见、指标隔离及设备凭据迁移回归通过");
