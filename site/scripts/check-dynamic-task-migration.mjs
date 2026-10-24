import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { SQLiteD1 } from "../local/sqlite-d1.mjs";

const db = new SQLiteD1();
const migrationDir = new URL("../drizzle/", import.meta.url);
const names = (await fs.readdir(migrationDir))
  .filter((name) => name.endsWith(".sql") && name < "0020_dynamic_task_keys.sql")
  .sort();
for (const name of names)
  db.sqlite.exec(await fs.readFile(new URL(name, migrationDir), "utf8"));

try {
  db.sqlite.exec(`
    INSERT INTO users(id,username,password_hash,nickname,created_at)
      VALUES (1,'dynamic-owner','disabled','宿舍长','2026-10-01T00:00Z'),
             (2,'dynamic-roommate','disabled','室友','2026-10-01T00:00Z');
    INSERT INTO dormitories(id,name,invite_code,admin_user_id,rotation_order,rotation_start_date)
      VALUES (1,'隔离迁移宿舍','DYNAMIC1',1,'[1,2]','2026-10-01');
    INSERT INTO chore_settings(dorm_id) VALUES (1);
    INSERT INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order,enabled)
      VALUES (1,'floor','地板','旧记录','22:00','2026-10-01','[1,2]',1),
             (1,'water','抬水','旧抬水记录','20:00','2026-10-01','[1,2]',1);
    INSERT INTO chore_tasks(id,dorm_id,key,task_key,name,content,duty_date,assignee_id,assignee_name_snapshot,marker_id_snapshot,deadline_at,status,completed_at,sequence,completed_by)
      VALUES (1,1,'floor','round-1-1','地板','旧记录','2026-10-01',1,'旧名','pixel-01','2026-10-01T14:00Z','completed','2026-10-01T12:00Z',1,1),
             (2,1,'water','turn-2','抬水','旧额度','2026-10-02',2,'旧室友','pixel-02','2026-10-02T12:00Z','pending',NULL,2,NULL),
             (3,1,'water','turn-3','抬水','旧跳过','2026-10-03',1,'宿舍长','pixel-01','2026-10-03T12:00Z','completed','2026-10-03T10:00Z',3,1);
    INSERT INTO chore_reminders(id,dorm_id,sender_id,sender_name_snapshot,target_member_id,task_id,task_name_snapshot,task_content_snapshot,created_at,mutation_key)
      VALUES (1,1,1,'宿舍长',2,1,'地板','旧记录','2026-10-01T12:01Z','migration-reminder');
    INSERT INTO chore_water_credits(id,dorm_id,user_id,task_id,status,consumed_by)
      VALUES (1,1,2,2,'pending',NULL);
    INSERT INTO chore_water_skips(id,dorm_id,user_id,task_id,reason,created_at)
      VALUES (1,1,1,3,'临时有事','2026-10-03T09:00Z');
    INSERT INTO chore_history_entries(id,dorm_id,task_id,assignee_id,key,name,assignee_name_snapshot,marker_id_snapshot,completed_at,operation_key,created_at,updated_at)
      VALUES (1,1,1,1,'floor','地板','旧名','pixel-01','2026-10-01T12:00Z','old-op','2026-10-01T12:00Z','2026-10-01T12:00Z');
    INSERT INTO chore_history_audit(id,entry_id,dorm_id,actor_id,actor_name,before_json,after_json,reason,created_at)
      VALUES (1,1,1,1,'宿舍长',NULL,'{"name":"地板"}','旧审核','2026-10-01T12:02Z');
  `);

  const preservedTables = [
    "chore_categories",
    "chore_tasks",
    "chore_reminders",
    "chore_water_credits",
    "chore_water_skips",
    "chore_history_entries",
    "chore_history_audit",
  ];
  const snapshot = () => JSON.stringify(Object.fromEntries(preservedTables.map((table) => [
    table,
    db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
  ])));
  const before = snapshot();
  const migration = await fs.readFile(new URL("../drizzle/0020_dynamic_task_keys.sql", import.meta.url), "utf8");
  db.sqlite.exec("BEGIN IMMEDIATE");
  try {
    db.sqlite.exec(migration);
    const pendingForeignKeys = db.sqlite.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(pendingForeignKeys, [], "the migration must leave all existing references valid before commit");
    db.sqlite.exec("COMMIT");
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
  assert.equal(snapshot(), before, "the migration preserves legacy rows and snapshots byte-for-byte");

  const key = `task_${"a".repeat(32)}`;
  db.sqlite.prepare(`INSERT INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order) VALUES (1,?,?,'清理阳台','22:00','2026-10-24','[1,2]')`).run(key, "阳台");
  db.sqlite.prepare(`INSERT INTO chore_tasks(id,dorm_id,key,task_key,name,content,duty_date,assignee_id,assignee_name_snapshot,marker_id_snapshot,deadline_at,status,sequence) VALUES (4,1,?,'round-1-2','阳台','清理阳台','2026-10-24',2,'室友','pixel-02','', 'pending',1)`).run(key);
  db.sqlite.prepare(`INSERT INTO chore_history_entries(id,dorm_id,task_id,assignee_id,key,name,assignee_name_snapshot,marker_id_snapshot,completed_at,operation_key,created_at,updated_at) VALUES (2,1,4,2,?,'阳台','室友','pixel-02','2026-10-24T02:00Z','custom-op','2026-10-24T02:00Z','2026-10-24T02:00Z')`).run(key);
  assert.throws(
    () => db.sqlite.prepare(`INSERT INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order) VALUES (1,'bad-key','错误','错误','22:00','2026-10-24','[1,2]')`).run(),
    /CHECK constraint failed/,
  );
  assert.deepEqual(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.sqlite.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  console.log(JSON.stringify({ status: "passed", preservedTables: preservedTables.length, checks: 4 }));
} finally {
  db.close();
}
