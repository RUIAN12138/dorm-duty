import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SQLiteD1 } from "./sqlite-d1.mjs";
import { localDate, planned } from "../worker/backend.mjs";

const migrationsPath = fileURLToPath(new URL("../drizzle/", import.meta.url));

export async function openDatabase(filename) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new SQLiteD1(filename);
  try {
    db.sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    db.sqlite.exec(
      "CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    const files = (await fs.readdir(migrationsPath))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    if (!files.length) throw new Error("缺少本地数据库迁移文件");
    for (const name of files) {
      const sql = await fs.readFile(path.join(migrationsPath, name), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const existing = db.sqlite
        .prepare("SELECT sha256 FROM _local_migrations WHERE name=?")
        .get(name);
      if (existing) {
        if (existing.sha256 !== hash)
          throw new Error(
            `已应用的迁移 ${name} 已被修改，请保留原文件并新增迁移`,
          );
        continue;
      }
      db.sqlite.exec("BEGIN IMMEDIATE");
      try {
        db.sqlite.exec(sql);
        db.sqlite
          .prepare(
            "INSERT INTO _local_migrations(name,sha256,applied_at) VALUES (?,?,?)",
          )
          .run(name, hash, new Date().toISOString());
        db.sqlite.exec("COMMIT");
      } catch (error) {
        db.sqlite.exec("ROLLBACK");
        throw error;
      }
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// Seed only the explicit visitor example, atomically and outside migrations.
// These members have no account passwords or administrator device sessions.
export function ensureLocalDemo(db) {
  const existing = db.sqlite
    .prepare(
      "SELECT invite_code FROM dormitories WHERE is_demo=1 ORDER BY id LIMIT 2",
    )
    .all();
  if (existing.length > 1)
    throw new Error("发现多个游客示例，请先明确要使用的示例宿舍");
  if (existing.length === 1) return existing[0].invite_code;
  const names = ["张同学", "李同学", "王同学", "陈同学", "刘同学", "赵同学"];
  const now = new Date(),
    today = localDate(now),
    prefix = `demo_${randomBytes(9).toString("hex")}`;
  const invite = randomBytes(4).toString("hex").toUpperCase();
  db.sqlite.exec("BEGIN IMMEDIATE");
  try {
    const memberIds = names.map((nickname, index) =>
      Number(
        db.sqlite
          .prepare(
            "INSERT INTO users(username,password_hash,nickname,created_at) VALUES (?,?,?,?)",
          )
          .run(
            `${prefix}_${index}`,
            `disabled$${randomBytes(32).toString("hex")}`,
            nickname,
            now.toISOString(),
          ).lastInsertRowid,
      ),
    );
    const dormId = Number(
      db.sqlite
        .prepare(
          "INSERT INTO dormitories(name,invite_code,admin_user_id,rotation_order,rotation_start_date,is_demo) VALUES (?,?,?,?,?,1)",
        )
        .run("6-402", invite, memberIds[0], JSON.stringify(memberIds), today)
        .lastInsertRowid,
    );
    for (let index = 0; index < memberIds.length; index++) {
      db.sqlite
        .prepare("UPDATE users SET current_dorm_id=? WHERE id=?")
        .run(dormId, memberIds[index]);
      db.sqlite
        .prepare(
          "INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,joined_at) VALUES (?,?,?,?,?)",
        )
        .run(
          dormId,
          memberIds[index],
          index === 0 ? "admin" : "member",
          index,
          now.toISOString(),
        );
    }
    const room = {
      rotation_order: memberIds,
      rotation_start_date: today,
      deadline_time: "22:00",
      task_text: "扫地、拖地、倒垃圾",
      schedule_rules: {
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        rotation_days: 1,
        horizon_days: 30,
        skip_dates: [],
        weekly_tasks: {},
      },
    };
    for (let index = 0; index < 30; index++) {
      const day = new Date(
        new Date(`${today}T00:00:00Z`).getTime() + index * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      const task = planned(room, day);
      db.sqlite
        .prepare(
          "INSERT INTO duty_tasks(dorm_id,duty_date,assignee_id,assignee_name_snapshot,task_text,deadline_at) VALUES (?,?,?,?,?,?)",
        )
        .run(
          dormId,
          day,
          task.assignee_id,
          names[memberIds.indexOf(task.assignee_id)],
          task.task_text,
          task.deadline_at,
        );
    }
    db.sqlite.exec("COMMIT");
    return invite;
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}
