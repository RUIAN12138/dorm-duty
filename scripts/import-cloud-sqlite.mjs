import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../site/local/database.mjs";

// Restore only into a NEW file; never read data rows into chat or overwrite a DB.
const [sourceArg, targetArg] = process.argv.slice(2);
assert(
  sourceArg && targetArg,
  "Usage: node scripts/import-cloud-sqlite.mjs source.sql new.sqlite",
);
const source = path.resolve(sourceArg),
  target = path.resolve(targetArg);
assert.notEqual(source, target);
try {
  await fs.lstat(target);
  throw new Error("目标文件已存在，拒绝覆盖");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const oldMask = process.umask(0o077);
await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
const staging = await fs.mkdtemp(path.join(path.dirname(target), ".import-"));
const stagedDb = path.join(staging, "restored.sqlite");
let restored, canonical;
try {
  const sql = await fs.readFile(source);
  // D1 exports tables in an order that may put child rows before parent DDL.
  // Check every foreign key after restoring; normal runtime enables enforcement.
  restored = new DatabaseSync(stagedDb, { enableForeignKeyConstraints: false });
  restored.exec(sql.toString("utf8"));
  restored.exec("PRAGMA foreign_keys=ON");
  canonical = await openDatabase(":memory:");
  const tables = canonical.sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_local_migrations' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  const counts = {};
  for (const table of tables) {
    const identifier = `"${table.replaceAll('"', '""')}"`;
    assert.deepEqual(
      restored.prepare(`PRAGMA table_info(${identifier})`).all(),
      canonical.sqlite.prepare(`PRAGMA table_info(${identifier})`).all(),
      `${table} 列定义与当前迁移不一致`,
    );
    assert.deepEqual(
      restored.prepare(`PRAGMA foreign_key_list(${identifier})`).all(),
      canonical.sqlite.prepare(`PRAGMA foreign_key_list(${identifier})`).all(),
      `${table} 外键与当前迁移不一致`,
    );
    const expectedIndexes = canonical.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all(table);
    for (const { name } of expectedIndexes)
      assert(
        restored
          .prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?")
          .get(name),
        `${table} 索引 ${name} 缺失`,
      );
    counts[table] = restored
      .prepare(`SELECT COUNT(*) AS n FROM ${identifier}`)
      .get().n;
  }
  assert.equal(
    restored.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
    "备份数据库完整性检查失败",
  );
  assert.deepEqual(
    restored.prepare("PRAGMA foreign_key_check").all(),
    [],
    "备份存在无效外键",
  );
  restored.exec(
    "CREATE TABLE IF NOT EXISTS _local_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)",
  );
  for (const row of canonical.sqlite
    .prepare("SELECT name,sha256 FROM _local_migrations ORDER BY name")
    .all()) {
    const existing = restored
      .prepare("SELECT sha256 FROM _local_migrations WHERE name=?")
      .get(row.name);
    if (existing)
      assert.equal(existing.sha256, row.sha256, "既有迁移校验不一致");
    else
      restored
        .prepare("INSERT INTO _local_migrations VALUES(?,?,?)")
        .run(row.name, row.sha256, new Date().toISOString());
  }
  restored.close();
  restored = undefined;
  canonical.close();
  canonical = undefined;
  // link is atomic and fails if another process created target in the meantime.
  await fs.link(stagedDb, target);
  await fs.chmod(target, 0o600);
  console.log(
    JSON.stringify(
      {
        status: "restored_and_validated",
        tableCounts: counts,
        sourceSha256: createHash("sha256").update(sql).digest("hex"),
        integrity: "ok",
        foreignKeys: "ok",
        schema: "matches_current_migrations",
        target,
      },
      null,
      2,
    ),
  );
} finally {
  restored?.close();
  canonical?.close();
  await fs.rm(staging, { recursive: true, force: true });
  process.umask(oldMask);
}
