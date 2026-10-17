// Cloudflare Worker/D1 implementation of the original FastAPI business contract.
// Business identity comes exclusively from opaque Bearer sessions, never platform headers.
import { CalendarError } from "./calendar.mjs";
import {
  ChoreError,
  choreGuestAccess,
  choreGuestMemberMarks,
  handleChores,
  validateMarker,
} from "./chores.mjs";
const DAY = 86_400_000;
const SESSION_DAYS = 7;
const ITERATIONS = 100_000;
const encoder = new TextEncoder();
const DEFAULT_RULES = {
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  rotation_days: 1,
  horizon_days: 30,
  skip_dates: [],
  weekly_tasks: {},
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function fail(status, code, message) {
  throw new ApiError(status, code, message);
}
function invalid(message = "请检查输入内容与日期范围") {
  fail(422, "validation_error", message);
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
function stmt(db, sql, values = []) {
  return db.prepare(sql).bind(...values);
}
async function first(db, sql, values = []) {
  return stmt(db, sql, values).first();
}
async function all(db, sql, values = []) {
  return (await stmt(db, sql, values).all()).results || [];
}
function changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}
function integer(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function queryInt(url, name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = url.searchParams.get(name);
  if (value === null && fallback !== undefined) return fallback;
  if (value === null || !/^\d+$/.test(value)) invalid();
  return integer(Number(value), min, max);
}
function str(value, min, max) {
  if (typeof value !== "string") invalid();
  const clean = value.trim(),
    length = [...clean].length;
  if (length < min || length > max) invalid();
  return clean;
}
function bool(value) {
  if (typeof value !== "boolean") invalid();
  return value;
}
function time(value) {
  const clean = str(value, 5, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clean)) invalid();
  return clean;
}
function date(value) {
  const clean = str(value, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean) || clean.startsWith("0000")) invalid();
  const parsed = new Date(`${clean}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== clean
  )
    invalid();
  return clean;
}
export function localDate(now) {
  return new Date(new Date(now).getTime() + 8 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}
function addDate(day, count) {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + count * DAY)
    .toISOString()
    .slice(0, 10);
}
function diffDate(a, b) {
  return Math.round(
    (new Date(`${a}T00:00:00.000Z`) - new Date(`${b}T00:00:00.000Z`)) / DAY,
  );
}
function weekday(day) {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay() || 7;
}
function deadline(day, hhmm) {
  return new Date(`${day}T${hhmm}:00+08:00`).toISOString();
}
function nowDate(ctx) {
  // A function-valued clock is useful to the isolated test harness; it is not a remotely configurable input.
  const now =
    ctx && typeof ctx.now === "function" ? new Date(ctx.now()) : new Date();
  if (!Number.isFinite(now.getTime()))
    throw new Error("Invalid internal clock");
  return now;
}
function object(value, allowed, required = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => value[key] === undefined || value[key] === null)
  )
    invalid();
  return value;
}
async function body(request, allowed, required = []) {
  const text = await request.text();
  if (text.length > 65_536) fail(413, "body_too_large", "提交内容过长");
  let value;
  try {
    value = JSON.parse(text || "{}");
  } catch {
    invalid();
  }
  return object(value, allowed, required);
}
function present(value) {
  return value !== undefined && value !== null;
}
function parseStored(value, fallback) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value || fallback;
  } catch {
    throw new Error("Invalid stored JSON");
  }
}
function normalizeRules(value = {}) {
  object(value, Object.keys(DEFAULT_RULES));
  if (Object.values(value).some((entry) => entry === null)) invalid();
  const weekdays = value.weekdays ?? DEFAULT_RULES.weekdays;
  if (
    !Array.isArray(weekdays) ||
    weekdays.length < 1 ||
    weekdays.length > 7 ||
    new Set(weekdays).size !== weekdays.length
  )
    invalid();
  weekdays.forEach((day) => integer(day, 1, 7));
  const skip = value.skip_dates ?? [];
  if (!Array.isArray(skip) || skip.length > 180) invalid();
  const templates = value.weekly_tasks ?? {};
  object(templates, ["1", "2", "3", "4", "5", "6", "7"]);
  const weekly = {};
  for (const [key, template] of Object.entries(templates)) {
    object(template, ["task_text", "deadline_time"]);
    weekly[key] = {
      task_text: present(template.task_text)
        ? str(template.task_text, 1, 200)
        : null,
      deadline_time: present(template.deadline_time)
        ? time(template.deadline_time)
        : null,
    };
  }
  return {
    weekdays: [...weekdays].sort((a, b) => a - b),
    rotation_days: integer(value.rotation_days ?? 1, 1, 14),
    horizon_days: integer(value.horizon_days ?? 30, 7, 90),
    skip_dates: [...new Set(skip.map(date))].sort(),
    weekly_tasks: weekly,
  };
}
function normalizeDorm(row) {
  if (!row) return null;
  return {
    ...row,
    rotation_order: parseStored(row.rotation_order, []),
    schedule_rules: normalizeRules(parseStored(row.schedule_rules, {})),
  };
}
function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function random(size = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(size)));
}
async function digest(value) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}
async function derive(password, salt, count) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: encoder.encode(salt),
          iterations: count,
          hash: "SHA-256",
        },
        key,
        256,
      ),
    ),
  );
}
async function passwordHash(password) {
  const salt = random(16);
  return `pbkdf2$${ITERATIONS}$${salt}$${await derive(password, salt, ITERATIONS)}`;
}
async function passwordMatches(password, value) {
  const parts = typeof value === "string" ? value.split("$") : [];
  const count = Number(parts[1]);
  const valid =
    parts.length === 4 &&
    parts[0] === "pbkdf2" &&
    count === ITERATIONS &&
    /^[a-f0-9]{32}$/.test(parts[2]) &&
    /^[a-f0-9]{64}$/.test(parts[3]);
  const actual = await derive(
    password,
    valid ? parts[2] : "00000000000000000000000000000000",
    ITERATIONS,
  );
  const expected = valid ? parts[3] : "0".repeat(64);
  let difference = 0;
  for (let i = 0; i < 64; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return valid && difference === 0;
}
function userView(user) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    current_dorm_id: user.current_dorm_id,
    push_enabled: Boolean(user.push_enabled),
  };
}
async function currentUser(request, db, now) {
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
  if (!match) fail(401, "unauthorized", "请先登录");
  const tokenHash = await digest(match[1]);
  const user = await first(
    db,
    "SELECT u.*,s.kind AS session_kind FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.kind='account' AND (s.dorm_id IS NULL OR s.dorm_id=u.current_dorm_id)",
    [tokenHash, now.toISOString()],
  );
  if (!user) fail(401, "unauthorized", "登录已过期，请重新登录");
  user.session_hash = tokenHash;
  return user;
}
async function roomMembers(db, id) {
  return all(
    db,
    "SELECT m.user_id,u.nickname,m.role,m.sort_order FROM dorm_members m JOIN users u ON u.id=m.user_id WHERE m.dorm_id=? AND m.is_active=1 ORDER BY m.sort_order,m.id",
    [id],
  );
}
async function currentDorm(db, user, admin = false) {
  const row = await first(
    db,
    "SELECT d.*,m.role AS current_role FROM dormitories d JOIN dorm_members m ON m.dorm_id=d.id AND m.user_id=? AND m.is_active=1 WHERE d.id=?",
    [user.id, user.current_dorm_id ?? -1],
  );
  if (!row) fail(403, "no_dorm", "请先创建或加入宿舍");
  if (admin && (row.current_role !== "admin" || row.admin_user_id !== user.id))
    fail(403, "admin_required", "只有宿舍管理员可以操作");
  return normalizeDorm(row);
}
async function dormView(db, room, user) {
  const members = await roomMembers(db, room.id);
  return {
    id: room.id,
    name: room.name,
    invite_code: room.invite_code,
    admin_user_id: room.admin_user_id,
    is_admin: room.admin_user_id === user.id,
    members: members.map(({ user_id, nickname, role }) => ({
      user_id,
      nickname,
      role,
    })),
    rotation_order: room.rotation_order,
    rotation_start_date: room.rotation_start_date,
    deadline_time: room.deadline_time,
    task_text: room.task_text,
    schedule_rules: room.schedule_rules,
    schedule_version: room.schedule_version,
  };
}
function taskView(task, now, uid = null) {
  if (!task) return null;
  const late = Boolean(
    task.completed_at && task.completed_at > task.deadline_at,
  );
  return {
    id: task.id,
    duty_date: task.duty_date,
    assignee_id: task.assignee_id,
    assignee_name_snapshot: task.assignee_name_snapshot,
    task_text: task.task_text,
    deadline_at: task.deadline_at,
    status: task.status,
    completed_at: task.completed_at,
    is_override: Boolean(task.is_override),
    display_status: late
      ? "completed_late"
      : task.status === "completed"
        ? "completed"
        : now.toISOString() > task.deadline_at
          ? "overdue"
          : "pending",
    is_late: late,
    can_complete:
      task.status === "pending" &&
      task.assignee_id === uid &&
      task.duty_date <= localDate(now),
  };
}
async function validateOrder(db, room, order) {
  if (
    !Array.isArray(order) ||
    !order.length ||
    order.length > 100 ||
    new Set(order).size !== order.length
  )
    fail(422, "invalid_order", "轮换顺序必须包含每位有效成员，且不能重复");
  order.forEach((id) => integer(id));
  const members = await roomMembers(db, room.id),
    ids = new Set(members.map((member) => member.user_id));
  if (ids.size !== order.length || order.some((id) => !ids.has(id)))
    fail(422, "invalid_order", "轮换顺序必须包含每位有效成员，且不能重复");
  return members;
}
async function validAssignee(db, room, id) {
  const row = await first(
    db,
    "SELECT u.nickname FROM dorm_members m JOIN users u ON u.id=m.user_id WHERE m.dorm_id=? AND m.user_id=? AND m.is_active=1",
    [room.id, id],
  );
  if (!row) fail(422, "invalid_member", "请选择有效宿舍成员");
  return row.nickname;
}
export function planned(room, day) {
  const rules = room.schedule_rules;
  if (!rules.weekdays.includes(weekday(day)) || rules.skip_dates.includes(day))
    return null;
  const anchor = room.rotation_start_date,
    forward = day >= anchor;
  const start = forward ? anchor : day,
    end = forward ? day : anchor;
  const count = diffDate(end, start),
    weeks = Math.floor(count / 7),
    tail = count % 7;
  let turns = weeks * rules.weekdays.length;
  for (let i = 0; i < tail; i++)
    if (rules.weekdays.includes(weekday(addDate(start, i)))) turns++;
  turns -= rules.skip_dates.filter(
    (skip) =>
      skip >= start && skip < end && rules.weekdays.includes(weekday(skip)),
  ).length;
  if (!forward) turns = -turns;
  const index = Math.floor(turns / rules.rotation_days),
    length = room.rotation_order.length;
  if (!length) fail(422, "invalid_order", "宿舍没有可排班成员");
  const template = rules.weekly_tasks[String(weekday(day))] || {};
  return {
    assignee_id: room.rotation_order[((index % length) + length) % length],
    task_text: template.task_text || room.task_text,
    deadline_at: deadline(day, template.deadline_time || room.deadline_time),
  };
}

// A random operation marker is necessary: merely testing version=expected+1 would let a losing
// concurrent batch apply its later statements after another writer incremented that same version.
class Mutation {
  constructor(
    db,
    room,
    user,
    expected = room.schedule_version,
    admin = true,
    updates = {},
  ) {
    integer(expected);
    this.db = db;
    this.room = room;
    this.token = random(16);
    this.ops = [];
    this.guard =
      "EXISTS (SELECT 1 FROM dormitories WHERE id=? AND mutation_key=?)";
    this.guardValues = [room.id, this.token];
    const fields = Object.keys(updates);
    const set = [
      ...fields.map((key) => `${key}=?`),
      "schedule_version=schedule_version+1",
      "mutation_key=?",
    ].join(",");
    let permission =
      "EXISTS (SELECT 1 FROM users u JOIN dorm_members m ON m.user_id=u.id AND m.dorm_id=dormitories.id AND m.is_active=1 WHERE u.id=? AND u.current_dorm_id=dormitories.id";
    if (admin)
      permission += " AND m.role='admin' AND dormitories.admin_user_id=u.id";
    permission += ")";
    this.ops.push(
      stmt(
        db,
        `UPDATE dormitories SET ${set} WHERE id=? AND schedule_version=? AND ${permission}`,
        [
          ...fields.map((key) => updates[key]),
          this.token,
          room.id,
          expected,
          user.id,
        ],
      ),
    );
  }
  update(table, fields, where, values = []) {
    const keys = Object.keys(fields);
    this.ops.push(
      stmt(
        this.db,
        `UPDATE ${table} SET ${keys.map((key) => `${key}=?`).join(",")} WHERE (${where}) AND ${this.guard}`,
        [...keys.map((key) => fields[key]), ...values, ...this.guardValues],
      ),
    );
  }
  raw(sql, values = []) {
    this.ops.push(stmt(this.db, sql, values));
  }
  remove(table, where, values = []) {
    this.ops.push(
      stmt(this.db, `DELETE FROM ${table} WHERE (${where}) AND ${this.guard}`, [
        ...values,
        ...this.guardValues,
      ]),
    );
  }
  async finish(code = "stale_version", message = "排班已被更新，请刷新后重试") {
    const results = await this.db.batch(this.ops);
    if (changes(results[0]) !== 1) fail(409, code, message);
    return results;
  }
}
function chunks(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size)
    result.push(items.slice(i, i + size));
  return result;
}
function discardTasks(mutation, ids) {
  for (const part of chunks(ids, 90)) {
    const slots = part.map(() => "?").join(",");
    mutation.raw(
      `UPDATE notifications SET is_cancelled=1,task_id=NULL WHERE task_id IN (${slots}) AND ${mutation.guard}`,
      [...part, ...mutation.guardValues],
    );
    mutation.remove("duty_tasks", `id IN (${slots})`, part);
  }
}
function cancelChanged(mutation) {
  mutation.raw(
    `UPDATE notifications SET is_cancelled=1 WHERE dorm_id=? AND task_id IS NOT NULL AND is_cancelled=0 AND ${mutation.guard} AND NOT EXISTS (SELECT 1 FROM duty_tasks t JOIN dorm_members m ON m.dorm_id=t.dorm_id AND m.user_id=notifications.user_id AND m.is_active=1 WHERE t.id=notifications.task_id AND t.status='pending' AND t.assignee_id=notifications.user_id)`,
    [mutation.room.id, ...mutation.guardValues],
  );
  mutation.raw(
    `UPDATE notifications SET body=(SELECT duty_date||' · '||task_text||'，截止 '||strftime('%H:%M',deadline_at,'+8 hours') FROM duty_tasks WHERE id=notifications.task_id) WHERE dorm_id=? AND task_id IS NOT NULL AND is_cancelled=0 AND ${mutation.guard}`,
    [mutation.room.id, ...mutation.guardValues],
  );
}
async function addGeneration(
  mutation,
  room,
  start,
  days,
  now,
  replace = false,
  suppliedMembers = null,
) {
  const today = localDate(now),
    end = addDate(start, days - 1);
  if (start < today || end > addDate(today, 89) || (replace && start <= today))
    fail(
      422,
      "invalid_range",
      "生成范围限未来 90 天；重排必须从明天或之后开始",
    );
  const members =
    suppliedMembers ||
    (await validateOrder(mutation.db, room, room.rotation_order));
  const names = new Map(
    members.map((member) => [member.user_id, member.nickname]),
  );
  const tasks = await all(
    mutation.db,
    "SELECT * FROM duty_tasks WHERE dorm_id=? AND duty_date BETWEEN ? AND ?",
    [room.id, start, end],
  );
  const byDate = new Map(tasks.map((task) => [task.duty_date, task]));
  const rows = [],
    removed = [];
  let added = 0,
    updated = 0,
    skipped = 0;
  for (let i = 0; i < days; i++) {
    const day = addDate(start, i),
      task = byDate.get(day);
    if (task && (!replace || task.status === "completed")) {
      skipped++;
      continue;
    }
    const plan = planned(room, day);
    if (!plan) {
      if (task && replace) removed.push(task.id);
      else skipped++;
      continue;
    }
    if (task) updated++;
    else added++;
    rows.push([
      room.id,
      day,
      plan.assignee_id,
      names.get(plan.assignee_id),
      plan.task_text,
      plan.deadline_at,
      0,
    ]);
  }
  discardTasks(mutation, removed);
  for (const part of chunks(rows, 12)) {
    // 12x7 + 2 guard bindings, below D1's 100-parameter limit. At most 8 statements for 90 days.
    const values = part.map(() => "(?,?,?,?,?,?,?)").join(",");
    const conflict = replace
      ? "DO UPDATE SET assignee_id=excluded.assignee_id,assignee_name_snapshot=excluded.assignee_name_snapshot,task_text=excluded.task_text,deadline_at=excluded.deadline_at,status='pending',completed_at=NULL,is_override=0 WHERE duty_tasks.status='pending'"
      : "DO NOTHING";
    mutation.raw(
      `INSERT INTO duty_tasks (dorm_id,duty_date,assignee_id,assignee_name_snapshot,task_text,deadline_at,is_override,status,completed_at) SELECT column1,column2,column3,column4,column5,column6,column7,'pending',NULL FROM (VALUES ${values}) WHERE ${mutation.guard} ON CONFLICT(dorm_id,duty_date) ${conflict}`,
      [...part.flat(), ...mutation.guardValues],
    );
  }
  cancelChanged(mutation);
  return {
    added,
    updated,
    skipped,
    removed: removed.length,
    start_date: start,
    end_date: end,
    schedule_version: room.schedule_version + 1,
  };
}
async function replan(mutation, room, now, resetAnchor = true, members = null) {
  const today = localDate(now),
    start = addDate(today, 1);
  const last = await first(
    mutation.db,
    "SELECT MAX(duty_date) AS last FROM duty_tasks WHERE dorm_id=? AND status='pending' AND duty_date>?",
    [room.id, today],
  );
  const limit = addDate(today, 89),
    horizon = addDate(today, room.schedule_rules.horizon_days);
  const end = [limit, [horizon, last?.last || start].sort().at(-1)].sort()[0];
  if (resetAnchor) {
    room.rotation_start_date = start;
    mutation.update("dormitories", { rotation_start_date: start }, "id=?", [
      room.id,
    ]);
  }
  return addGeneration(
    mutation,
    room,
    start,
    diffDate(end, start) + 1,
    now,
    true,
    members,
  );
}

async function guestRoom(db, env, url) {
  const explicit = url.searchParams.get("invite_code");
  const code =
    explicit === null
      ? env.DEFAULT_DORM_INVITE_CODE || ""
      : str(explicit, 6, 16);
  if (code) {
    const row = await first(
      db,
      explicit === null
        ? "SELECT * FROM dormitories WHERE invite_code=? AND is_demo=1"
        : "SELECT * FROM dormitories WHERE invite_code=?",
      [code.trim().toUpperCase()],
    );
    if (row) return normalizeDorm(row);
    if (explicit !== null) fail(404, "invalid_invite", "邀请码无效或已更新");
  }
  const demos = await all(
    db,
    "SELECT * FROM dormitories WHERE is_demo=1 ORDER BY id LIMIT 2",
  );
  if (demos.length !== 1) fail(400, "invite_required", "请先输入宿舍邀请码");
  return normalizeDorm(demos[0]);
}
async function guestView(db, room) {
  return {
    id: room.id,
    name: room.name,
    is_demo: Boolean(room.is_demo),
    members: await choreGuestMemberMarks(db, room.id),
  };
}
async function guestCreate(request, db, now, emailCreator) {
  const emailSession = emailCreator
    ? await first(
        db,
        "SELECT account_id,expires_at FROM email_sessions WHERE token_hash=? AND account_id=? AND expires_at>?",
        [emailCreator.sessionHash, emailCreator.accountId, now.toISOString()],
      )
    : null;
  if (emailCreator && !emailSession)
    fail(401, "email_required", "请先用邮箱验证码登录");
  const input = await body(
    request,
    ["name", "nickname", "members", "marker_id"],
    ["name", "nickname"],
  );
  const name = str(input.name, 1, 64),
    nickname = str(input.nickname, 1, 32),
    others = input.members === undefined ? [] : input.members;
  const marker =
    input.marker_id === undefined ? null : validateMarker(input.marker_id);
  if (!Array.isArray(others) || others.length > 11)
    invalid("一个宿舍最多填写 12 位成员");
  const nicknames = [nickname, ...others.map((value) => str(value, 1, 32))];
  if (new Set(nicknames).size !== nicknames.length)
    invalid("室友名字不能重复，请使用能区分彼此的名字");
  const prefix = `guest_${random(9)}`;
  const usernames = nicknames.map(
    (_, index) => `${prefix}_${String(index).padStart(2, "0")}`,
  );
  // Name-only members have no password login. A random disabled marker avoids unnecessary KDF work.
  const hashes = usernames.map(() => `disabled$${random(32)}`);
  const invite = random(4).toUpperCase(),
    token = random(),
    tokenHash = await digest(token);
  const current = now.toISOString(),
    expires =
      emailSession?.expires_at ||
      new Date(now.getTime() + 7 * DAY).toISOString();
  const today = localDate(now),
    usernamesJson = JSON.stringify(usernames),
    ops = [];
  ops.push(
    stmt(
      db,
      `INSERT INTO users(username,password_hash,nickname,created_at) VALUES ${usernames.map(() => "(?,?,?,?)").join(",")}`,
      usernames.flatMap((username, i) => [
        username,
        hashes[i],
        nicknames[i],
        current,
      ]),
    ),
  );
  ops.push(
    stmt(
      db,
      "INSERT INTO dormitories(name,invite_code,admin_user_id,rotation_order,rotation_start_date) VALUES (?,?,(SELECT id FROM users WHERE username=?),(SELECT json_group_array(id) FROM (SELECT u.id FROM json_each(?) j JOIN users u ON u.username=j.value ORDER BY CAST(j.key AS INTEGER))),?)",
      [name, invite, usernames[0], usernamesJson, today],
    ),
  );
  ops.push(
    stmt(
      db,
      "INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,joined_at) SELECT d.id,u.id,CASE WHEN j.key=0 THEN 'admin' ELSE 'member' END,CAST(j.key AS INTEGER),? FROM json_each(?) j JOIN users u ON u.username=j.value JOIN dormitories d ON d.invite_code=?",
      [current, usernamesJson, invite],
    ),
  );
  ops.push(
    stmt(
      db,
      "UPDATE users SET current_dorm_id=(SELECT id FROM dormitories WHERE invite_code=?) WHERE username IN (SELECT value FROM json_each(?))",
      [invite, usernamesJson],
    ),
  );
  const duties = Array.from({ length: 30 }, (_, index) => {
    const day = addDate(today, index),
      assignee = index % nicknames.length;
    return [
      day,
      usernames[assignee],
      nicknames[assignee],
      "扫地、拖地、倒垃圾",
      deadline(day, "22:00"),
    ];
  });
  for (const part of chunks(duties, 12)) {
    ops.push(
      stmt(
        db,
        `INSERT INTO duty_tasks(dorm_id,duty_date,assignee_id,assignee_name_snapshot,task_text,deadline_at) SELECT d.id,v.column1,u.id,v.column3,v.column4,v.column5 FROM (VALUES ${part.map(() => "(?,?,?,?,?)").join(",")}) v JOIN users u ON u.username=v.column2 JOIN dormitories d ON d.invite_code=?`,
        [...part.flat(), invite],
      ),
    );
  }
  ops.push(
    stmt(
      db,
      "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind) SELECT ?,id,?,?,'account' FROM users WHERE username=?",
      [tokenHash, current, expires, usernames[0]],
    ),
  );
  if (marker)
    ops.push(
      stmt(
        db,
        "INSERT INTO member_marks(dorm_id,user_id,marker_id) SELECT d.id,u.id,? FROM dormitories d JOIN users u ON u.id=d.admin_user_id WHERE d.invite_code=?",
        [marker, invite],
      ),
    );
  if (emailCreator) {
    ops.push(stmt(db, "UPDATE sessions SET dorm_id=(SELECT current_dorm_id FROM users WHERE username=?) WHERE token_hash=?", [usernames[0], tokenHash]));
    // Ownership, room and email linkage commit together. A concurrently revoked
    // email login makes the NOT NULL subquery fail and rolls the entire batch back.
    ops.push(
      stmt(
        db,
        "INSERT INTO email_members(account_id,user_id,dorm_id,creator_verified,bound_at) VALUES ((SELECT account_id FROM email_sessions WHERE token_hash=? AND account_id=? AND expires_at>?), (SELECT id FROM users WHERE username=?), (SELECT id FROM dormitories WHERE invite_code=?),1,?)",
        [
          emailCreator.sessionHash,
          emailCreator.accountId,
          current,
          usernames[0],
          invite,
          current,
        ],
      ),
    );
    ops.push(
      stmt(
        db,
        "INSERT INTO email_grants(token_hash,email_session_hash,full_session) VALUES (?,?,1)",
        [tokenHash, emailCreator.sessionHash],
      ),
    );
  }
  await db.batch(ops);
  const room = normalizeDorm(
    await first(db, "SELECT * FROM dormitories WHERE invite_code=?", [invite]),
  );
  return json(
    {
      access_token: token,
      invite_code: invite,
      member_id: room.admin_user_id,
      dorm: await guestView(db, room),
    },
    201,
  );
}

async function recoveryStatus(db, room, user) {
  const row = await first(
    db,
    "SELECT owner_user_id,revision,updated_at FROM creator_recovery WHERE dorm_id=?",
    [room.id],
  );
  return {
    configured: Boolean(row && row.owner_user_id === user.id),
    version: row?.revision || 0,
    updated_at: row?.owner_user_id === user.id ? row.updated_at : null,
  };
}
async function configureRecovery(request, db, user, now) {
  const room = await currentDorm(db, user, true);
  if (room.is_demo) fail(403, "demo_read_only", "游客模式不能设置恢复码");
  const input = await body(request, ["expected_version"], ["expected_version"]);
  const version = integer(input.expected_version, 0),
    code = random(),
    hash = await digest(code),
    at = now.toISOString();
  const result = await stmt(
    db,
    `INSERT INTO creator_recovery(dorm_id,owner_user_id,code_hash,revision,updated_at)
    SELECT ?,?,?,1,? WHERE COALESCE((SELECT revision FROM creator_recovery WHERE dorm_id=?),0)=?
    AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=u.id AND m.dorm_id=u.current_dorm_id JOIN dormitories d ON d.id=m.dorm_id
      WHERE s.token_hash=? AND s.expires_at>? AND u.id=? AND d.id=? AND d.is_demo=0 AND d.admin_user_id=u.id AND m.role='admin' AND m.is_active=1)
    ON CONFLICT(dorm_id) DO UPDATE SET owner_user_id=excluded.owner_user_id,code_hash=excluded.code_hash,revision=creator_recovery.revision+1,updated_at=excluded.updated_at
    WHERE creator_recovery.revision=?`,
    [
      room.id,
      user.id,
      hash,
      at,
      room.id,
      version,
      user.session_hash,
      at,
      user.id,
      room.id,
      version,
    ],
  ).run();
  if (changes(result) !== 1)
    fail(409, "recovery_changed", "管理权限或恢复码已变化，请重新打开后再试");
  return json({
    configured: true,
    version: version + 1,
    updated_at: at,
    recovery_code: code,
  });
}
async function recoverCreator(request, db, now) {
  const input = await body(
    request,
    ["invite_code", "recovery_code"],
    ["invite_code", "recovery_code"],
  );
  const invite = str(input.invite_code, 6, 16).toUpperCase(),
    code = str(input.recovery_code, 1, 128).replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(code)) invalid("请粘贴完整恢复码");
  const hash = await digest(code),
    token = random(),
    tokenHash = await digest(token),
    at = now.toISOString();
  // The current owner, membership and code are checked in the same SQL write.
  // A rotated code or a departed former owner cannot issue an administrator session.
  const result = await stmt(
    db,
    `INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind,dorm_id)
    SELECT ?,u.id,?,?,'account',d.id FROM creator_recovery r JOIN dormitories d ON d.id=r.dorm_id
    JOIN users u ON u.id=r.owner_user_id JOIN dorm_members m ON m.dorm_id=d.id AND m.user_id=u.id
    WHERE r.code_hash=? AND d.invite_code=? AND d.is_demo=0 AND d.admin_user_id=u.id AND u.current_dorm_id=d.id AND m.is_active=1 AND m.role='admin'`,
    [
      tokenHash,
      at,
      new Date(now.getTime() + 7 * DAY).toISOString(),
      hash,
      invite,
    ],
  ).run();
  if (changes(result) !== 1)
    fail(403, "recovery_denied", "邀请码或恢复码不正确，或创建者权限已变更");
  const room = await first(
    db,
    `SELECT d.* FROM sessions s JOIN users u ON u.id=s.user_id JOIN dormitories d ON d.id=u.current_dorm_id
    JOIN dorm_members m ON m.dorm_id=d.id AND m.user_id=u.id
    WHERE s.token_hash=? AND d.invite_code=? AND d.is_demo=0 AND d.admin_user_id=u.id AND m.is_active=1 AND m.role='admin'`,
    [tokenHash, invite],
  );
  if (!room)
    fail(403, "recovery_denied", "邀请码或恢复码不正确，或创建者权限已变更");
  return json({
    access_token: token,
    invite_code: room.invite_code,
    member_id: room.admin_user_id,
    dorm: await guestView(db, room),
  });
}
async function createRoom(request, db, user, now) {
  const input = await body(request, ["name"], ["name"]),
    name = str(input.name, 1, 64);
  if (user.current_dorm_id !== null)
    fail(409, "already_joined", "你已经加入宿舍");
  const key = random(16),
    invite = random(4).toUpperCase(),
    current = now.toISOString();
  const guard = "EXISTS (SELECT 1 FROM users WHERE id=? AND mutation_key=?)";
  const ops = [
    stmt(
      db,
      "UPDATE users SET mutation_key=? WHERE id=? AND current_dorm_id IS NULL",
      [key, user.id],
    ),
    stmt(
      db,
      `INSERT INTO dormitories(name,invite_code,admin_user_id,rotation_order,rotation_start_date) SELECT ?,?,?,?,? WHERE ${guard}`,
      [
        name,
        invite,
        user.id,
        JSON.stringify([user.id]),
        localDate(now),
        user.id,
        key,
      ],
    ),
    stmt(
      db,
      `UPDATE users SET current_dorm_id=(SELECT id FROM dormitories WHERE invite_code=? AND admin_user_id=?) WHERE id=? AND ${guard}`,
      [invite, user.id, user.id, user.id, key],
    ),
    stmt(
      db,
      `INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,joined_at) SELECT current_dorm_id,id,'admin',0,? FROM users WHERE id=? AND ${guard}`,
      [current, user.id, user.id, key],
    ),
  ];
  const results = await db.batch(ops);
  if (changes(results[0]) !== 1)
    fail(409, "already_joined", "请先退出当前宿舍");
  return json(
    await dormView(
      db,
      normalizeDorm(
        await first(db, "SELECT * FROM dormitories WHERE invite_code=?", [
          invite,
        ]),
      ),
      user,
    ),
    201,
  );
}
async function joinRoom(request, db, user, now) {
  const input = await body(request, ["invite_code"], ["invite_code"]),
    invite = str(input.invite_code, 6, 16).toUpperCase();
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await first(db, "SELECT * FROM users WHERE id=?", [user.id]);
    const room = normalizeDorm(
      await first(db, "SELECT * FROM dormitories WHERE invite_code=?", [
        invite,
      ]),
    );
    if (!room) fail(404, "invalid_invite", "邀请码无效或已更新");
    if (latest.current_dorm_id === room.id)
      return json(await dormView(db, await currentDorm(db, latest), latest));
    if (latest.current_dorm_id !== null)
      fail(409, "already_joined", "请先退出当前宿舍");
    const members = await roomMembers(db, room.id);
    if (members.length >= 100)
      fail(422, "member_limit", "宿舍最多支持 100 位有效成员");
    const token = random(16),
      order = [...room.rotation_order, user.id];
    const mutation = new Mutation(db, room, user, room.schedule_version, false);
    // Joining is authorized by a current invite, not existing membership. Replace the regular guard.
    mutation.ops[0] = stmt(
      db,
      "UPDATE dormitories SET rotation_order=?,schedule_version=schedule_version+1,mutation_key=? WHERE id=? AND schedule_version=? AND invite_code=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND current_dorm_id IS NULL)",
      [
        JSON.stringify(order),
        mutation.token,
        room.id,
        room.schedule_version,
        invite,
        user.id,
      ],
    );
    mutation.update(
      "users",
      { current_dorm_id: room.id, mutation_key: token },
      "id=? AND current_dorm_id IS NULL",
      [user.id],
    );
    mutation.raw(
      `INSERT INTO dorm_members(dorm_id,user_id,role,sort_order,is_active,joined_at,left_at) SELECT ?,?,'member',?,1,?,NULL WHERE ${mutation.guard} ON CONFLICT(dorm_id,user_id) DO UPDATE SET role='member',sort_order=excluded.sort_order,is_active=1,joined_at=excluded.joined_at,left_at=NULL`,
      [
        room.id,
        user.id,
        members.length,
        now.toISOString(),
        ...mutation.guardValues,
      ],
    );
    room.rotation_order = order;
    await replan(mutation, room, now, true, [
      ...members,
      { user_id: user.id, nickname: user.nickname },
    ]);
    try {
      await mutation.finish();
      return json(
        await dormView(
          db,
          normalizeDorm(
            await first(db, "SELECT * FROM dormitories WHERE id=?", [room.id]),
          ),
          user,
        ),
      );
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.code !== "stale_version" ||
        attempt === 2
      )
        throw error;
    }
  }
}
async function removeMember(
  db,
  room,
  user,
  uid,
  now,
  expected = room.schedule_version,
) {
  if (uid === room.admin_user_id)
    fail(409, "transfer_first", "管理员请先转移管理权限");
  const members = await roomMembers(db, room.id);
  if (!members.some((member) => member.user_id === uid))
    fail(404, "member_missing", "成员不存在");
  if (
    await first(
      db,
      "SELECT id FROM duty_tasks WHERE dorm_id=? AND assignee_id=? AND duty_date=? AND status='pending'",
      [room.id, uid, localDate(now)],
    )
  )
    fail(
      409,
      "today_pending",
      "该成员今天尚未完成值日，请先完成或调整今天排班",
    );
  const order = room.rotation_order.filter((id) => id !== uid);
  const mutation = new Mutation(db, room, user, expected, uid !== user.id, {
    rotation_order: JSON.stringify(order),
  });
  mutation.update(
    "dorm_members",
    { is_active: 0, left_at: now.toISOString() },
    "dorm_id=? AND user_id=? AND is_active=1",
    [room.id, uid],
  );
  mutation.update(
    "users",
    { current_dorm_id: null },
    "id=? AND current_dorm_id=?",
    [uid, room.id],
  );
  room.rotation_order = order;
  const effect = await replan(
    mutation,
    room,
    now,
    true,
    members.filter((member) => member.user_id !== uid),
  );
  await mutation.finish();
  return effect;
}

async function configureRoom(request, db, room, user, now) {
  const input = await body(
    request,
    [
      "expected_version",
      "name",
      "task_text",
      "deadline_time",
      "rotation_order",
      "rotation_start_date",
      "schedule_rules",
      "regenerate",
    ],
    ["expected_version"],
  );
  const expected = integer(input.expected_version),
    updates = {},
    draft = { ...room };
  if (present(input.name)) updates.name = str(input.name, 1, 64);
  if (present(input.task_text))
    updates.task_text = draft.task_text = str(input.task_text, 1, 200);
  if (present(input.deadline_time))
    updates.deadline_time = draft.deadline_time = time(input.deadline_time);
  if (present(input.rotation_start_date))
    updates.rotation_start_date = draft.rotation_start_date = date(
      input.rotation_start_date,
    );
  if (present(input.schedule_rules)) {
    draft.schedule_rules = normalizeRules(input.schedule_rules);
    updates.schedule_rules = JSON.stringify(draft.schedule_rules);
  }
  let members = null;
  if (present(input.rotation_order)) {
    members = await validateOrder(db, room, input.rotation_order);
    draft.rotation_order = input.rotation_order;
    updates.rotation_order = JSON.stringify(input.rotation_order);
  }
  const regenerate =
    input.regenerate === undefined ? false : bool(input.regenerate);
  const mutation = new Mutation(db, room, user, expected, true, updates);
  if (members) {
    mutation.raw(
      `UPDATE dorm_members SET sort_order=(SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value=dorm_members.user_id) WHERE dorm_id=? AND is_active=1 AND ${mutation.guard}`,
      [JSON.stringify(draft.rotation_order), room.id, ...mutation.guardValues],
    );
  }
  const changed = [
    "task_text",
    "deadline_time",
    "rotation_order",
    "rotation_start_date",
    "schedule_rules",
  ].some((field) => present(input[field]));
  const effect =
    changed || regenerate
      ? await replan(mutation, draft, now, false, members)
      : null;
  await mutation.finish();
  return json({
    ...(await dormView(
      db,
      normalizeDorm(
        await first(db, "SELECT * FROM dormitories WHERE id=?", [room.id]),
      ),
      user,
    )),
    effect,
  });
}

async function taskInRoom(db, room, id) {
  const task = await first(
    db,
    "SELECT * FROM duty_tasks WHERE id=? AND dorm_id=?",
    [id, room.id],
  );
  if (!task) fail(404, "not_found", "任务不存在");
  return task;
}
async function generateTasks(request, db, room, user, now, replace) {
  const input = await body(
    request,
    ["expected_version", "start_date", "days"],
    ["expected_version", "start_date"],
  );
  const expected = integer(input.expected_version),
    start = date(input.start_date),
    days = integer(input.days === undefined ? 30 : input.days, 1, 90);
  const mutation = new Mutation(db, room, user, expected);
  const effect = await addGeneration(mutation, room, start, days, now, replace);
  await mutation.finish();
  return json(effect);
}
async function previewTasks(request, db, room, now) {
  const fields = [
    "rotation_order",
    "rotation_start_date",
    "task_text",
    "deadline_time",
    "schedule_rules",
    "start_date",
    "days",
  ];
  const input = await body(
    request,
    fields,
    fields.filter((field) => field !== "days"),
  );
  const members = await validateOrder(db, room, input.rotation_order),
    start = date(input.start_date),
    days = integer(input.days === undefined ? 7 : input.days, 1, 14);
  if (Math.abs(diffDate(start, localDate(now))) > 365)
    fail(422, "invalid_range", "预览开始日期需在一年以内");
  const draft = {
    rotation_order: input.rotation_order,
    rotation_start_date: date(input.rotation_start_date),
    task_text: str(input.task_text, 1, 200),
    deadline_time: time(input.deadline_time),
    schedule_rules: normalizeRules(input.schedule_rules),
  };
  const names = new Map(
    members.map(({ user_id, nickname }) => [user_id, nickname]),
  );
  return json({
    items: Array.from({ length: days }, (_, index) => {
      const day = addDate(start, index),
        plan = planned(draft, day);
      return {
        duty_date: day,
        task: plan
          ? { ...plan, assignee_name: names.get(plan.assignee_id) }
          : null,
      };
    }),
  });
}
async function customTask(request, db, room, user, now) {
  const input = await body(
    request,
    [
      "expected_version",
      "duty_date",
      "assignee_id",
      "task_text",
      "deadline_time",
    ],
    [
      "expected_version",
      "duty_date",
      "assignee_id",
      "task_text",
      "deadline_time",
    ],
  );
  const expected = integer(input.expected_version),
    day = date(input.duty_date),
    uid = integer(input.assignee_id),
    content = str(input.task_text, 1, 200),
    hhmm = time(input.deadline_time),
    today = localDate(now);
  if (day < today || day > addDate(today, 89))
    fail(422, "invalid_range", "手工安排限今天至未来 90 天");
  if (
    await first(
      db,
      "SELECT id FROM duty_tasks WHERE dorm_id=? AND duty_date=?",
      [room.id, day],
    )
  )
    fail(409, "task_exists", "这一天已有排班，请刷新后修改");
  const nickname = await validAssignee(db, room, uid),
    mutation = new Mutation(db, room, user, expected);
  mutation.raw(
    `INSERT INTO duty_tasks(dorm_id,duty_date,assignee_id,assignee_name_snapshot,task_text,deadline_at,is_override) SELECT ?,?,?,?,?,?,1 WHERE ${mutation.guard}`,
    [
      room.id,
      day,
      uid,
      nickname,
      content,
      deadline(day, hhmm),
      ...mutation.guardValues,
    ],
  );
  await mutation.finish();
  return json(
    {
      task: taskView(
        await first(
          db,
          "SELECT * FROM duty_tasks WHERE dorm_id=? AND duty_date=?",
          [room.id, day],
        ),
        now,
        user.id,
      ),
      schedule_version: room.schedule_version + 1,
    },
    201,
  );
}
async function assignTask(request, db, room, task, user, now) {
  const input = await body(
    request,
    ["expected_version", "assignee_id", "task_text", "deadline_time"],
    ["expected_version"],
  );
  const expected = integer(input.expected_version),
    updates = { is_override: 1 };
  if (task.status === "completed" || task.duty_date < localDate(now))
    fail(409, "immutable_task", "已完成或过去的排班不能修改");
  if (
    !["assignee_id", "task_text", "deadline_time"].some((field) =>
      present(input[field]),
    )
  )
    invalid("至少修改人员、内容或截止时间中的一项");
  if (present(input.assignee_id)) {
    updates.assignee_id = integer(input.assignee_id);
    updates.assignee_name_snapshot = await validAssignee(
      db,
      room,
      updates.assignee_id,
    );
  }
  if (present(input.task_text))
    updates.task_text = str(input.task_text, 1, 200);
  if (present(input.deadline_time))
    updates.deadline_at = deadline(task.duty_date, time(input.deadline_time));
  const mutation = new Mutation(db, room, user, expected);
  mutation.update(
    "duty_tasks",
    updates,
    "id=? AND dorm_id=? AND status='pending'",
    [task.id, room.id],
  );
  cancelChanged(mutation);
  await mutation.finish();
  return json({
    task: taskView(await taskInRoom(db, room, task.id), now, user.id),
    schedule_version: room.schedule_version + 1,
  });
}
async function completeTask(db, room, task, user, now) {
  if (task.assignee_id !== user.id)
    fail(403, "not_assignee", "只能完成自己的值日任务");
  if (task.duty_date > localDate(now))
    fail(409, "future_task", "不能提前完成未来任务");
  if (task.status === "completed")
    fail(409, "already_completed", "该任务已完成");
  const mutation = new Mutation(db, room, user, room.schedule_version, false);
  mutation.update(
    "duty_tasks",
    { status: "completed", completed_at: now.toISOString() },
    "id=? AND assignee_id=? AND status='pending'",
    [task.id, user.id],
  );
  cancelChanged(mutation);
  const result = await mutation.finish();
  if (changes(result[1]) !== 1) fail(409, "already_completed", "该任务已完成");
  return json(taskView(await taskInRoom(db, room, task.id), now, user.id));
}
async function listTasks(db, room, user, now, url) {
  const start = date(url.searchParams.get("start_date")),
    end = date(url.searchParams.get("end_date"));
  if (end < start || diffDate(end, start) > 89)
    fail(422, "invalid_range", "查询范围最长 90 天");
  const page = queryInt(url, "page", 1),
    pageSize = queryInt(url, "page_size", 30, 1, 100),
    status = url.searchParams.get("status");
  const where = ["dorm_id=?", "duty_date BETWEEN ? AND ?"],
    values = [room.id, start, end];
  if (url.searchParams.has("assignee_id")) {
    where.push("assignee_id=?");
    values.push(queryInt(url, "assignee_id"));
  }
  if (status === "overdue") {
    where.push("status='pending' AND deadline_at<?");
    values.push(now.toISOString());
  } else if (status === "pending") {
    where.push("status='pending' AND deadline_at>=?");
    values.push(now.toISOString());
  } else if (status === "completed") where.push("status='completed'");
  else if (status === "completed_late")
    where.push("status='completed' AND completed_at>deadline_at");
  else if (status) fail(422, "invalid_status", "无效的状态筛选");
  const clause = where.join(" AND "),
    total = await first(
      db,
      `SELECT COUNT(*) AS count FROM duty_tasks WHERE ${clause}`,
      values,
    );
  const tasks = await all(
    db,
    `SELECT * FROM duty_tasks WHERE ${clause} ORDER BY duty_date DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return json({
    items: tasks.map((task) => taskView(task, now, user.id)),
    total: total.count,
    page,
    page_size: pageSize,
  });
}
async function ensureHorizon(db, user, now) {
  if (!user.current_dorm_id) return;
  const room = await currentDorm(db, user),
    today = localDate(now),
    days = room.schedule_rules.horizon_days;
  const tasks = await all(
    db,
    "SELECT duty_date FROM duty_tasks WHERE dorm_id=? AND duty_date BETWEEN ? AND ?",
    [room.id, today, addDate(today, days - 1)],
  );
  const existing = new Set(tasks.map((task) => task.duty_date));
  const missing = Array.from({ length: days }, (_, i) =>
    addDate(today, i),
  ).some((day) => !existing.has(day) && planned(room, day));
  if (!missing) return;
  const mutation = new Mutation(db, room, user, room.schedule_version, false);
  await addGeneration(mutation, room, today, days, now);
  try {
    await mutation.finish();
  } catch (error) {
    if (!(error instanceof ApiError && error.code === "stale_version"))
      throw error;
  }
}
async function lazyReminders(db, user, now) {
  await ensureHorizon(db, user, now);
  const today = localDate(now),
    tomorrow = addDate(today, 1);
  const tasks = await all(
    db,
    "SELECT t.* FROM duty_tasks t JOIN dorm_members m ON m.dorm_id=t.dorm_id AND m.user_id=t.assignee_id AND m.is_active=1 JOIN users u ON u.id=t.assignee_id AND u.current_dorm_id=t.dorm_id WHERE t.assignee_id=? AND t.status='pending' AND t.duty_date BETWEEN ? AND ?",
    [user.id, today, tomorrow],
  );
  const rows = [];
  for (const task of tasks) {
    for (const [kind, delta, hhmm] of [
      ["previous", -1, "21:00"],
      ["morning", 0, "08:00"],
      ["evening", 0, "19:00"],
    ]) {
      const scheduled = deadline(addDate(task.duty_date, delta), hhmm);
      // These are visit-triggered in-app reminders, not a claim that a background cron delivered them.
      if (localDate(scheduled) !== today || scheduled > now.toISOString())
        continue;
      rows.push([
        user.id,
        task.dorm_id,
        task.id,
        kind,
        scheduled,
        now.toISOString(),
        kind === "previous" ? "明天轮到你值日" : "今天轮到你值日",
        `${task.duty_date} · ${task.task_text}，截止 ${new Date(new Date(task.deadline_at).getTime() + 8 * 3_600_000).toISOString().slice(11, 16)}`,
        `${task.id}:${user.id}:${kind}`,
      ]);
    }
  }
  if (rows.length) {
    // Recheck current task/member state inside the INSERT so concurrent completion cannot create
    // a stale unread reminder. The body is built from current task data after concurrent editing.
    await stmt(
      db,
      `INSERT INTO notifications(user_id,dorm_id,task_id,reminder_kind,scheduled_at,created_at,title,body,dedupe_key) SELECT v.column1,t.dorm_id,t.id,v.column4,v.column5,v.column6,v.column7,t.duty_date||' · '||t.task_text||'，截止 '||strftime('%H:%M',t.deadline_at,'+8 hours'),v.column9 FROM (VALUES ${rows.map(() => "(?,?,?,?,?,?,?,?,?)").join(",")}) v JOIN duty_tasks t ON t.id=v.column3 AND t.assignee_id=v.column1 AND t.status='pending' JOIN dorm_members m ON m.dorm_id=t.dorm_id AND m.user_id=v.column1 AND m.is_active=1 JOIN users u ON u.id=v.column1 AND u.current_dorm_id=t.dorm_id WHERE 1 ON CONFLICT(dedupe_key) DO NOTHING`,
      rows.flat(),
    ).run();
  }
}
async function listNotifications(db, user, now, url) {
  await lazyReminders(db, user, now);
  const page = queryInt(url, "page", 1),
    pageSize = queryInt(url, "page_size", 30, 1, 100),
    unreadInput = url.searchParams.get("unread_only") || "false";
  if (!["true", "false", "1", "0"].includes(unreadInput)) invalid();
  const unreadOnly = unreadInput === "true" || unreadInput === "1";
  const base = "user_id=? AND (is_cancelled=0 OR read_at IS NOT NULL)",
    query = base + (unreadOnly ? " AND read_at IS NULL" : "");
  const unread = await first(
    db,
    `SELECT COUNT(*) AS count FROM notifications WHERE ${base} AND read_at IS NULL`,
    [user.id],
  );
  const total = await first(
    db,
    `SELECT COUNT(*) AS count FROM notifications WHERE ${query}`,
    [user.id],
  );
  const notes = await all(
    db,
    `SELECT id,title,body,read_at,created_at,task_id FROM notifications WHERE ${query} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    [user.id, pageSize, (page - 1) * pageSize],
  );
  return json({
    items: notes,
    total: total.count,
    page,
    page_size: pageSize,
    unread_count: unread.count,
  });
}
function pushEndpoint(value) {
  const endpoint = str(value, 1, 2048);
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    invalid();
  }
  const domains = [
    "push.apple.com",
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "notify.windows.com",
  ];
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443") ||
    !domains.some(
      (domain) =>
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
    )
  )
    invalid("不支持的推送服务地址");
  return endpoint;
}

async function dispatch(request, env, ctx) {
  const db = env.DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function")
    fail(503, "storage_unavailable", "云端数据库暂不可用，请稍后重试");
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method,
    now = nowDate(ctx);
  if (path === "/health" && method === "GET") {
    await first(db, "SELECT 1 AS ok");
    return json({
      status: "ok",
      time: now.toISOString(),
      runtime: "cloudflare-worker",
      storage: "d1",
    });
  }
  if (/^\/chores(\/|$)/.test(path)) return handleChores(request, env, now);
  if (path === "/guest/create" && method === "POST")
    return guestCreate(request, db, now, env.EMAIL_CREATOR);
  if (path === "/guest/recover" && method === "POST")
    return recoverCreator(request, db, now);
  if ((path === "/guest/dorm" || path === "/guest/tasks") && method === "GET") {
    const room = await guestRoom(db, env, url);
    const who = room.is_demo
      ? null
      : await choreGuestAccess(request, db, now, room.id);
    if (path === "/guest/dorm")
      return json(
        room.is_demo || who
          ? await guestView(db, room)
          : {
              id: room.id,
              name: room.name,
              is_demo: false,
              members: [],
            },
      );
    if (!room.is_demo && !who)
      fail(401, "member_required", "请先输入正确的名字进入宿舍");
    const uid = queryInt(url, "member_id"),
      members = await roomMembers(db, room.id),
      member = members.find((entry) => entry.user_id === uid);
    if (!member) fail(404, "member_missing", "成员已离开宿舍或不存在");
    // Maintain an existing schedule when it is viewed. A room without any schedule
    // remains empty until its owner generates one; guest input cannot change rules.
    if (
      await first(db, "SELECT id FROM duty_tasks WHERE dorm_id=? LIMIT 1", [
        room.id,
      ])
    ) {
      await ensureHorizon(db, { id: uid, current_dorm_id: room.id }, now);
    }
    const today = localDate(now);
    const todayTask = await first(
      db,
      "SELECT * FROM duty_tasks WHERE dorm_id=? AND assignee_id=? AND duty_date=?",
      [room.id, uid, today],
    );
    const nextTask = await first(
      db,
      "SELECT * FROM duty_tasks WHERE dorm_id=? AND assignee_id=? AND duty_date>? AND status='pending' ORDER BY duty_date LIMIT 1",
      [room.id, uid, today],
    );
    return json({
      today,
      server_time: now.toISOString(),
      member: { user_id: uid, nickname: member.nickname },
      today_task: taskView(todayTask, now),
      next_task: taskView(nextTask, now),
    });
  }
  if (
    (path === "/auth/register" || path === "/auth/login") &&
    method === "POST"
  ) {
    const register = path === "/auth/register",
      fields = register
        ? ["username", "password", "nickname"]
        : ["username", "password"];
    const input = await body(request, fields, fields),
      username = str(input.username, 3, 32),
      password = str(input.password, 8, 128);
    if (!/^[A-Za-z0-9_]+$/.test(username)) invalid();
    // Atomic durable buckets survive restarts. Node overwrites X-Dorm-Client;
    // Workers use CF-Connecting-IP. No client-supplied forwarding chain is trusted.
    const client =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Dorm-Client") ||
      "unknown";
    const accountBucket = await digest(
      `auth:${register ? "register" : "login"}:${username.toLowerCase()}`,
    );
    for (const [bucket, limit] of [
      [await digest(`auth-ip:${client}`), 60],
      [accountBucket, 5],
    ]) {
      const reserved = await first(
        db,
        `INSERT INTO auth_attempts(bucket,attempts,expires_at) VALUES (?,1,?)
        ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,
        expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
        [
          bucket,
          new Date(now.getTime() + 15 * 60000).toISOString(),
          now.toISOString(),
          now.toISOString(),
        ],
      );
      if (reserved.attempts > limit)
        fail(429, "auth_rate_limited", "尝试过于频繁，请15分钟后重试");
    }
    await stmt(db, "DELETE FROM auth_attempts WHERE expires_at<=?", [
      now.toISOString(),
    ]).run();
    const existing = await first(db, "SELECT * FROM users WHERE username=?", [
      username,
    ]);
    if (register) {
      const nickname = str(input.nickname, 1, 32);
      // Same hashing cost and response for existing/new names; never overwrite.
      const encoded = await passwordHash(password);
      await stmt(
        db,
        "INSERT OR IGNORE INTO users(username,password_hash,nickname,created_at) VALUES (?,?,?,?)",
        [username, encoded, nickname, now.toISOString()],
      ).run();
      return json(
        { ok: true, message: "请使用账号密码登录；已有账号请使用原密码。" },
        201,
      );
    }
    if (!(await passwordMatches(password, existing?.password_hash)))
      fail(401, "invalid_credentials", "账号或密码不正确");
    await stmt(db, "DELETE FROM auth_attempts WHERE bucket=?", [
      accountBucket,
    ]).run();
    const token = random(),
      hash = await digest(token),
      expires = new Date(now.getTime() + SESSION_DAYS * DAY).toISOString();
    await db.batch([
      stmt(db, "DELETE FROM sessions WHERE expires_at<=?", [now.toISOString()]),
      stmt(
        db,
        "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,kind) VALUES (?,?,?,?,'account')",
        [hash, existing.id, now.toISOString(), expires],
      ),
    ]);
    return json({
      access_token: token,
      token_type: "bearer",
      expires_in: SESSION_DAYS * 86_400,
    });
  }
  if (path === "/auth/logout" && method === "POST") {
    const token = /^Bearer ([a-f0-9]{64})$/i.exec(
      request.headers.get("Authorization") || "",
    )?.[1];
    if (token) {
      const tokenHash = await digest(token);
      await db.batch([
        stmt(db, "DELETE FROM email_grants WHERE token_hash=?", [tokenHash]),
        stmt(db, "DELETE FROM sessions WHERE token_hash=?", [tokenHash]),
        stmt(db, "DELETE FROM member_sessions WHERE token_hash=?", [tokenHash]),
      ]);
    }
    return json({ ok: true });
  }
  const known = /^\/(auth|dorms|duties|notifications|push)(\/|$)/.test(path);
  if (!known) fail(404, "not_found", "接口不存在");
  const user = await currentUser(request, db, now);
  if (path === "/dorms/recovery" && method === "GET") {
    const room = await currentDorm(db, user, true);
    if (room.is_demo) fail(403, "demo_read_only", "游客模式不能设置恢复码");
    return json(await recoveryStatus(db, room, user));
  }
  if (path === "/dorms/recovery" && method === "POST")
    return configureRecovery(request, db, user, now);
  if (path === "/auth/me" && method === "GET") {
    return json(userView(user));
  }
  if (path === "/auth/me" && method === "PATCH") {
    const input = await body(request, ["nickname", "push_enabled"]),
      updates = {};
    if (present(input.nickname)) updates.nickname = str(input.nickname, 1, 32);
    if (present(input.push_enabled))
      updates.push_enabled = bool(input.push_enabled) ? 1 : 0;
    const keys = Object.keys(updates);
    if (keys.length)
      await stmt(
        db,
        `UPDATE users SET ${keys.map((key) => `${key}=?`).join(",")} WHERE id=?`,
        [...keys.map((key) => updates[key]), user.id],
      ).run();
    return json(
      userView(await first(db, "SELECT * FROM users WHERE id=?", [user.id])),
    );
  }
  if (path === "/dorms" && method === "POST")
    return createRoom(request, db, user, now);
  if (path === "/dorms/join" && method === "POST")
    return joinRoom(request, db, user, now);
  if (path === "/dorms/current" && method === "GET")
    return json(
      user.current_dorm_id === null
        ? null
        : await dormView(db, await currentDorm(db, user), user),
    );
  if (path === "/dorms/current" && method === "PATCH")
    return configureRoom(
      request,
      db,
      await currentDorm(db, user, true),
      user,
      now,
    );
  if (path === "/dorms/current/leave" && method === "POST") {
    const room = await currentDorm(db, user),
      effect = await removeMember(db, room, user, user.id, now);
    return json({ ok: true, effect });
  }
  const memberMatch = /^\/dorms\/current\/members\/(\d+)$/.exec(path);
  if (memberMatch && method === "DELETE") {
    const room = await currentDorm(db, user, true),
      expected = queryInt(url, "expected_version");
    return json(
      await removeMember(
        db,
        room,
        user,
        integer(Number(memberMatch[1])),
        now,
        expected,
      ),
    );
  }
  if (path === "/dorms/current/transfer-admin" && method === "POST") {
    const room = await currentDorm(db, user, true),
      input = await body(
        request,
        ["expected_version", "user_id"],
        ["expected_version", "user_id"],
      ),
      uid = integer(input.user_id);
    if (uid === user.id) fail(422, "invalid_admin", "请选择其他有效成员");
    if (
      !(await first(
        db,
        "SELECT id FROM dorm_members WHERE dorm_id=? AND user_id=? AND is_active=1",
        [room.id, uid],
      ))
    )
      fail(422, "invalid_admin", "请选择其他有效成员");
    const mutation = new Mutation(
      db,
      room,
      user,
      integer(input.expected_version),
    );
    mutation.update(
      "dorm_members",
      { role: "member" },
      "dorm_id=? AND is_active=1",
      [room.id],
    );
    mutation.update(
      "dorm_members",
      { role: "admin" },
      "dorm_id=? AND user_id=? AND is_active=1",
      [room.id, uid],
    );
    mutation.update("dormitories", { admin_user_id: uid }, "id=?", [room.id]);
    await mutation.finish();
    return json(
      await dormView(
        db,
        normalizeDorm(
          await first(db, "SELECT * FROM dormitories WHERE id=?", [room.id]),
        ),
        user,
      ),
    );
  }
  if (path === "/dorms/current/invite-code/rotate" && method === "POST") {
    const room = await currentDorm(db, user, true),
      invite = random(4).toUpperCase(),
      mutation = new Mutation(db, room, user, room.schedule_version, true, {
        invite_code: invite,
      });
    await mutation.finish();
    return json({
      invite_code: invite,
      schedule_version: room.schedule_version + 1,
    });
  }
  if (path.startsWith("/duties")) {
    const writesAdmin =
      method === "POST" ||
      (method === "PATCH" && !path.endsWith("/complete")) ||
      method === "DELETE";
    const room = await currentDorm(db, user, writesAdmin);
    if (path === "/duties/today" && method === "GET") {
      const today = localDate(now),
        task = await first(
          db,
          "SELECT * FROM duty_tasks WHERE dorm_id=? AND duty_date=?",
          [room.id, today],
        );
      const recent = await all(
        db,
        "SELECT * FROM duty_tasks WHERE dorm_id=? AND duty_date>? AND duty_date<=? ORDER BY duty_date",
        [room.id, today, addDate(today, 7)],
      );
      return json({
        today,
        server_time: now.toISOString(),
        task: taskView(task, now, user.id),
        recent: recent.map((item) => taskView(item, now, user.id)),
      });
    }
    if (path === "/duties" && method === "GET")
      return listTasks(db, room, user, now, url);
    if (
      (path === "/duties/generate" || path === "/duties/regenerate") &&
      method === "POST"
    )
      return generateTasks(
        request,
        db,
        room,
        user,
        now,
        path.endsWith("regenerate"),
      );
    if (path === "/duties/preview" && method === "POST")
      return previewTasks(request, db, room, now);
    if (path === "/duties/custom" && method === "POST")
      return customTask(request, db, room, user, now);
    const match = /^\/duties\/(\d+)(\/complete)?$/.exec(path);
    if (match) {
      const task = await taskInRoom(db, room, integer(Number(match[1])));
      if (match[2] && method === "PATCH")
        return completeTask(db, room, task, user, now);
      if (!match[2] && method === "PATCH")
        return assignTask(request, db, room, task, user, now);
      if (!match[2] && method === "DELETE") {
        if (task.status === "completed" || task.duty_date < localDate(now))
          fail(409, "immutable_task", "已完成或过去的排班不能修改");
        if (!task.is_override)
          fail(
            409,
            "not_override",
            "只可删除手工安排的任务，请用排班规则设置休息日",
          );
        const mutation = new Mutation(
          db,
          room,
          user,
          queryInt(url, "expected_version"),
        );
        discardTasks(mutation, [task.id]);
        cancelChanged(mutation);
        await mutation.finish();
        return json({ ok: true, schedule_version: room.schedule_version + 1 });
      }
    }
  }
  if (path === "/notifications" && method === "GET")
    return listNotifications(db, user, now, url);
  const noteMatch = /^\/notifications\/(\d+)\/read$/.exec(path);
  if (noteMatch && method === "PATCH") {
    const id = integer(Number(noteMatch[1])),
      note = await first(
        db,
        "SELECT id FROM notifications WHERE id=? AND user_id=?",
        [id, user.id],
      );
    if (!note) fail(404, "not_found", "消息不存在");
    await stmt(
      db,
      "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?",
      [now.toISOString(), id, user.id],
    ).run();
    return json({ ok: true });
  }
  if (path === "/push/public-key" && method === "GET")
    return json({ available: false, public_key: null });
  if (path === "/push/subscribe" && method === "POST") {
    const input = await body(
      request,
      ["endpoint", "keys"],
      ["endpoint", "keys"],
    );
    pushEndpoint(input.endpoint);
    object(input.keys, ["p256dh", "auth"], ["p256dh", "auth"]);
    const key = str(input.keys.p256dh, 80, 256),
      auth = str(input.keys.auth, 16, 128);
    if (!/^[A-Za-z0-9_=-]+$/.test(key) || !/^[A-Za-z0-9_=-]+$/.test(auth))
      invalid();
    fail(503, "push_unconfigured", "服务尚未配置系统推送，站内通知仍可使用");
  }
  if (path === "/push/unsubscribe" && method === "POST") {
    const input = await body(request, ["endpoint"], ["endpoint"]),
      endpoint = pushEndpoint(input.endpoint);
    const subscription = await first(
      db,
      "SELECT id,user_id FROM push_subscriptions WHERE endpoint=?",
      [endpoint],
    );
    if (subscription && subscription.user_id !== user.id)
      fail(404, "not_found", "订阅不存在");
    if (subscription)
      await stmt(
        db,
        "UPDATE push_subscriptions SET is_active=0,updated_at=? WHERE id=? AND user_id=?",
        [now.toISOString(), subscription.id, user.id],
      ).run();
    return json({ ok: true });
  }
  if (path === "/push/test" && method === "POST")
    fail(503, "push_unconfigured", "服务尚未配置系统推送");
  fail(404, "not_found", "接口不存在");
}

// A symbol cannot be supplied by HTTP headers or serialized Wrangler vars.
// Symbol.for keeps the embedded Worker and Node gateway in the same process aligned.
export const EMAIL_GATE_CAPABILITY = Symbol.for("dorm-duty.email-gateway.checked");
export async function handleApi(request, env, ctx) {
  if (env.EMAIL_GATE_VERIFIED !== EMAIL_GATE_CAPABILITY)
    return json({ detail: { code: "email_gateway_required", message: "此部署未接入邮箱准入服务，请使用正式网站" } }, 503);
  try {
    return await dispatch(request, env, ctx);
  } catch (error) {
    if (
      error instanceof ApiError ||
      error instanceof ChoreError ||
      error instanceof CalendarError
    )
      return json(
        { detail: { code: error.code, message: error.message } },
        error.status,
      );
    // Database error messages can contain bound values. Never return them or log session/password data.
    const message = String(error?.message || "");
    if (/UNIQUE constraint|constraint failed|SQLITE_CONSTRAINT/i.test(message))
      return json(
        {
          detail: {
            code: "conflict",
            message: "数据已变化或记录重复，请刷新后重试",
          },
        },
        409,
      );
    return json(
      { detail: { code: "server_error", message: "云端服务暂忙，请稍后重试" } },
      500,
    );
  }
}
