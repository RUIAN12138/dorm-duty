// Three independent chores, shared by the local SQLite adapter and Cloudflare D1.
// Member claims are intentionally incapable of authenticating any legacy admin endpoint.
import { MARK_IDS } from "../shared/member-marks.mjs";
import { validPushEndpoint } from "../shared/push-endpoint.mjs";
import { notifyUser } from "../shared/notifications.mjs";
import { calendarSettings, calendarFeed } from "./calendar.mjs";

const DAY = 86_400_000;
const KEYS = ["floor", "toilet", "sink", "water"];
const encoder = new TextEncoder();
const markerIds = new Set(MARK_IDS);
export class ChoreError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function fail(status, code, message) {
  throw new ChoreError(status, code, message);
}
function invalid(message = "请检查任务设置、成员和日期") {
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
function random() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function digest(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function object(value, allowed, required = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
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
function str(value, min, max) {
  if (typeof value !== "string") invalid();
  const clean = value.trim();
  if ([...clean].length < min || [...clean].length > max) invalid();
  return clean;
}
function integer(value, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
function time(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    invalid("截止时间应为 00:00 至 23:59");
  return value;
}
function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith("0000")
  )
    invalid();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}
function localDate(now) {
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
function parse(value) {
  return JSON.parse(value);
}
function chunks(items, size) {
  const parts = [];
  for (let i = 0; i < items.length; i += size)
    parts.push(items.slice(i, i + size));
  return parts;
}
export function validateMarker(value) {
  if (!markerIds.has(value)) invalid("请选择提供的像素标记");
  return value;
}
async function roomMembers(db, roomId) {
  return all(
    db,
    "SELECT m.user_id,u.nickname,m.role,m.sort_order,mm.marker_id FROM dorm_members m JOIN users u ON u.id=m.user_id LEFT JOIN member_marks mm ON mm.dorm_id=m.dorm_id AND mm.user_id=m.user_id WHERE m.dorm_id=? AND m.is_active=1 ORDER BY m.sort_order,m.id",
    [roomId],
  );
}
export async function ensureChoreMarkers(db, roomId) {
  // The common poll path is read-only; repair marks only after membership changes.
  const repair = await first(
    db,
    `SELECT
    EXISTS(SELECT 1 FROM member_marks mm WHERE mm.dorm_id=? AND NOT EXISTS(SELECT 1 FROM dorm_members m WHERE m.dorm_id=mm.dorm_id AND m.user_id=mm.user_id AND m.is_active=1))
    OR EXISTS(SELECT 1 FROM dorm_members m LEFT JOIN member_marks mm ON mm.dorm_id=m.dorm_id AND mm.user_id=m.user_id WHERE m.dorm_id=? AND m.is_active=1 AND mm.id IS NULL) AS needed`,
    [roomId, roomId],
  );
  if (!repair.needed) return;

  // Matching two ranked sets assigns every unmarked member one still-free design in one statement.
  // Departed members release their live mark; completed records keep their immutable snapshot.
  await stmt(
    db,
    "DELETE FROM member_marks WHERE dorm_id=? AND NOT EXISTS(SELECT 1 FROM dorm_members m WHERE m.dorm_id=member_marks.dorm_id AND m.user_id=member_marks.user_id AND m.is_active=1)",
    [roomId],
  ).run();
  await stmt(
    db,
    `INSERT OR IGNORE INTO member_marks(dorm_id,user_id,marker_id)
    WITH missing AS (SELECT m.user_id,ROW_NUMBER() OVER (ORDER BY m.sort_order,m.id) AS n FROM dorm_members m LEFT JOIN member_marks mm ON mm.dorm_id=m.dorm_id AND mm.user_id=m.user_id WHERE m.dorm_id=? AND m.is_active=1 AND mm.id IS NULL),
    available AS (SELECT j.value AS marker_id,ROW_NUMBER() OVER (ORDER BY CAST(j.key AS INTEGER)) AS n FROM json_each(?) j WHERE NOT EXISTS (SELECT 1 FROM member_marks mm WHERE mm.dorm_id=? AND mm.marker_id=j.value))
    SELECT ?,missing.user_id,available.marker_id FROM missing JOIN available ON missing.n=available.n`,
    [roomId, JSON.stringify(MARK_IDS), roomId, roomId],
  ).run();
  const missing = await first(
    db,
    "SELECT m.user_id FROM dorm_members m LEFT JOIN member_marks mm ON mm.dorm_id=m.dorm_id AND mm.user_id=m.user_id WHERE m.dorm_id=? AND m.is_active=1 AND mm.id IS NULL",
    [roomId],
  );
  if (missing)
    fail(409, "marker_capacity", "像素标记已全部使用，请先释放离开成员的标记");
}
export async function choreGuestMemberMarks(db, roomId) {
  await ensureChoreMarkers(db, roomId);
  return (await roomMembers(db, roomId)).map(
    ({ user_id, nickname, marker_id }) => ({ user_id, nickname, marker_id }),
  );
}
function categoryView(row) {
  return {
    key: row.key,
    name: row.name,
    content: row.content,
    deadline_time: row.deadline_time,
    start_date: row.start_date,
    weekdays: parse(row.weekdays),
    rotation_days: row.rotation_days,
    reminder_interval_days: row.reminder_interval_days,
    rotation_order: parse(row.rotation_order),
    enabled: Boolean(row.enabled),
    mode: row.mode,
  };
}
async function categories(db, roomId) {
  const rows = await all(db, "SELECT * FROM chore_categories WHERE dorm_id=?", [
    roomId,
  ]);
  return KEYS.map((key) => rows.find((row) => row.key === key))
    .filter(Boolean)
    .map(categoryView);
}
async function initialize(db, room, now) {
  await ensureChoreMarkers(db, room.id);
  const initialized = await first(
    db,
    "SELECT 1 AS ready FROM chore_settings WHERE dorm_id=? AND (SELECT COUNT(*) FROM chore_categories WHERE dorm_id=?)=4",
    [room.id, room.id],
  );
  if (initialized) return;

  const members = await roomMembers(db, room.id);
  if (!members.length) fail(409, "no_members", "宿舍没有有效成员");
  const legacy = parse(room.rotation_order || "[]"),
    ids = members.map((member) => member.user_id);
  const order = [
    ...legacy.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !legacy.includes(id)),
  ];
  const shift = order.length > 1 ? [...order.slice(1), order[0]] : order;
  const start = localDate(now);
  const defaults = [
    ["floor", "地板", "扫地、拖地", "22:00", order],
    ["toilet", "厕所", "清洗便池、冲洗地面", "22:00", shift],
    ["sink", "洗手池", "清洁洗手池、台面和水渍", "22:00", order],
    ["water", "抬水", "将饮用水送到宿舍", "20:00", order],
  ];
  await db.batch([
    stmt(db, "INSERT OR IGNORE INTO chore_settings(dorm_id) VALUES (?)", [
      room.id,
    ]),
    ...defaults.map(([key, name, content, hhmm, rotation]) =>
      stmt(
        db,
        "INSERT OR IGNORE INTO chore_categories(dorm_id,key,name,content,deadline_time,start_date,rotation_order,mode) VALUES (?,?,?,?,?,?,?,?)",
        [
          room.id,
          key,
          name,
          content,
          hhmm,
          start,
          JSON.stringify(rotation),
          key === "water" ? "completion" : "self_round",
        ],
      ),
    ),
  ]);
}
async function actor(request, db, now, required = false) {
  const header = request.headers.get("Authorization");
  if (!header) {
    if (required) fail(401, "member_required", "请先选择你的宿舍身份");
    return null;
  }
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(header);
  if (!match) fail(401, "unauthorized", "身份已失效，请重新选择");
  const hash = await digest(match[1]);
  const member = await first(
    db,
    "SELECT s.user_id,s.dorm_id,u.nickname,d.is_demo,d.admin_user_id FROM member_sessions s JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=s.user_id AND m.dorm_id=s.dorm_id AND m.is_active=1 JOIN dormitories d ON d.id=s.dorm_id WHERE s.token_hash=? AND s.expires_at>? AND u.current_dorm_id=s.dorm_id",
    [hash, now.toISOString()],
  );
  if (member) return { ...member, is_creator: false, scoped: true };
  const full = await first(
    db,
    "SELECT s.user_id,u.current_dorm_id AS dorm_id,u.nickname,d.is_demo,d.admin_user_id,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN dorm_members m ON m.user_id=u.id AND m.dorm_id=u.current_dorm_id AND m.is_active=1 JOIN dormitories d ON d.id=m.dorm_id WHERE s.token_hash=? AND s.expires_at>?",
    [hash, now.toISOString()],
  );
  if (!full) fail(401, "unauthorized", "身份已失效，请重新选择");
  return {
    ...full,
    is_creator: full.role === "admin" && full.admin_user_id === full.user_id,
    scoped: false,
  };
}
// Legacy read-only guest routes must respect the same member-session boundary.
export async function choreGuestAccess(request, db, now, dormId) {
  const who = await actor(request, db, now);
  if (who && who.dorm_id !== dormId)
    fail(403, "wrong_dorm", "请使用这个宿舍的身份进入");
  return who;
}
function assertWrite(who) {
  if (who.is_demo)
    fail(403, "demo_read_only", "游客模式仅供体验，请创建或加入正式宿舍");
}
async function roomByInvite(db, env, invite) {
  if (invite !== undefined && invite !== null && invite !== "") {
    const code = str(invite, 6, 16).toUpperCase();
    const room = await first(
      db,
      "SELECT * FROM dormitories WHERE invite_code=?",
      [code],
    );
    if (!room) fail(404, "invalid_invite", "邀请码无效或已更新");
    return room;
  }
  if (env.DEFAULT_DORM_INVITE_CODE) {
    const room = await first(
      db,
      "SELECT * FROM dormitories WHERE invite_code=? AND is_demo=1",
      [env.DEFAULT_DORM_INVITE_CODE],
    );
    if (room) return room;
  }
  const demos = await all(
    db,
    "SELECT * FROM dormitories WHERE is_demo=1 LIMIT 2",
  );
  if (demos.length !== 1) fail(400, "invite_required", "请先加入宿舍");
  return demos[0];
}
async function roomByActor(db, who) {
  const room = await first(db, "SELECT * FROM dormitories WHERE id=?", [
    who.dorm_id,
  ]);
  if (!room) fail(403, "no_dorm", "宿舍已不存在");
  return room;
}
class Mutation {
  constructor(
    db,
    room,
    version,
    who = null,
    admin = false,
    extra = "",
    extraValues = [],
  ) {
    this.db = db;
    this.room = room;
    this.token = random();
    this.guard =
      "EXISTS (SELECT 1 FROM chore_settings WHERE dorm_id=? AND mutation_key=?)";
    this.guardValues = [room.id, this.token];
    let permission = "";
    const values = [this.token, room.id, version];
    if (who) {
      permission +=
        " AND EXISTS (SELECT 1 FROM dorm_members m JOIN users u ON u.id=m.user_id JOIN dormitories d ON d.id=m.dorm_id WHERE m.dorm_id=chore_settings.dorm_id AND m.user_id=? AND m.is_active=1 AND u.current_dorm_id=m.dorm_id AND d.is_demo=0";
      values.push(who.user_id);
      if (admin)
        permission += " AND m.role='admin' AND d.admin_user_id=m.user_id";
      permission += ")";
    }
    if (extra) {
      permission += ` AND (${extra})`;
      values.push(...extraValues);
    }
    this.ops = [
      stmt(
        db,
        `UPDATE chore_settings SET version=version+1,mutation_key=? WHERE dorm_id=? AND version=?${permission}`,
        values,
      ),
    ];
  }
  raw(sql, values = []) {
    this.ops.push(stmt(this.db, sql, values));
  }
  update(table, fields, where, values = []) {
    const keys = Object.keys(fields);
    this.raw(
      `UPDATE ${table} SET ${keys.map((key) => `${key}=?`).join(",")} WHERE (${where}) AND ${this.guard}`,
      [...keys.map((key) => fields[key]), ...values, ...this.guardValues],
    );
  }
  async finish() {
    const results = await this.db.batch(this.ops);
    if (changes(results[0]) !== 1)
      fail(409, "stale_version", "任务已变化，请刷新后重试");
    return results;
  }
}
function scheduledAssignee(category, day) {
  if (
    !category.enabled ||
    day < category.start_date ||
    !category.weekdays.includes(weekday(day))
  )
    return null;
  const count = diffDate(day, category.start_date),
    weeks = Math.floor(count / 7),
    tail = count % 7;
  let turns = weeks * category.weekdays.length;
  for (let i = 0; i < tail; i++)
    if (category.weekdays.includes(weekday(addDate(category.start_date, i))))
      turns++;
  return category.rotation_order[
    Math.floor(turns / category.rotation_days) % category.rotation_order.length
  ];
}
function plannedRow(room, category, day, uid, members, sequence = null) {
  const member = members.find((entry) => entry.user_id === uid);
  if (!member) fail(409, "invalid_order", "排班成员已变化，请刷新");
  return [
    room.id,
    category.key,
    sequence === null ? day : `turn-${sequence}`,
    category.name,
    category.content,
    day,
    uid,
    member.nickname,
    member.marker_id,
    deadline(day, category.deadline_time),
    sequence,
  ];
}
function appendRows(mutation, rows, replace = false) {
  for (const part of chunks(rows, 8)) {
    // 8 rows × 11 bindings + 2 CAS guard bindings = 90, below D1's 100 limit.
    mutation.raw(
      `INSERT INTO chore_tasks(dorm_id,key,task_key,name,content,duty_date,assignee_id,assignee_name_snapshot,marker_id_snapshot,deadline_at,sequence)
      SELECT column1,column2,column3,column4,column5,column6,column7,column8,column9,column10,column11 FROM (VALUES ${part.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",")}) WHERE ${mutation.guard}
      ON CONFLICT(dorm_id,key,task_key) ${replace ? "DO UPDATE SET name=excluded.name,content=excluded.content,assignee_id=excluded.assignee_id,assignee_name_snapshot=excluded.assignee_name_snapshot,marker_id_snapshot=excluded.marker_id_snapshot,deadline_at=excluded.deadline_at,status='pending' WHERE chore_tasks.status<>'completed'" : "DO NOTHING"}`,
      [...part.flat(), ...mutation.guardValues],
    );
  }
}
async function planDaily(
  db,
  mutation,
  room,
  settings,
  members,
  now,
  replaceKeys = [],
) {
  const today = localDate(now),
    end = addDate(today, 29),
    rows = [];
  for (const category of settings.filter(
    (entry) => entry.mode === "scheduled",
  )) {
    const replace = replaceKeys.includes(category.key);
    if (replace)
      mutation.update(
        "chore_tasks",
        { status: "cancelled" },
        "dorm_id=? AND key=? AND duty_date>? AND status='pending'",
        [room.id, category.key, today],
      );
    for (let i = replace ? 1 : 0; i < 30; i++) {
      const day = addDate(today, i),
        uid = scheduledAssignee(category, day);
      if (uid) rows.push(plannedRow(room, category, day, uid, members));
    }
  }
  // Each replacement only touches future rows. Historical / completed rows remain immutable.
  for (const key of KEYS.filter((entry) => entry !== "water"))
    appendRows(
      mutation,
      rows.filter((row) => row[1] === key),
      replaceKeys.includes(key),
    );
  return end;
}
async function roundState(db, room, category, members) {
  const latest = await first(
    db,
    "SELECT MAX(sequence) AS sequence FROM chore_tasks WHERE dorm_id=? AND key=? AND sequence IS NOT NULL AND status<>'cancelled'",
    [room.id, category.key],
  );
  const sequence = Number(latest?.sequence || 0);
  const rows = sequence
    ? await all(
        db,
        "SELECT * FROM chore_tasks WHERE dorm_id=? AND key=? AND sequence=?",
        [room.id, category.key, sequence],
      )
    : [];
  return {
    sequence,
    rows,
    active: rows.filter(
      (row) =>
        row.status !== "cancelled" &&
        members.some((m) => m.user_id === row.assignee_id),
    ),
  };
}
function roundRow(room, category, member, members, now, sequence) {
  const row = plannedRow(
    room,
    category,
    localDate(now),
    member.user_id,
    members,
    sequence,
  );
  row[2] = `round-${sequence}-${member.user_id}`;
  row[9] = ""; // Voluntary rounds have no daily deadline.
  return row;
}
async function planRound(
  db,
  mutation,
  room,
  category,
  members,
  now,
  completingId = null,
) {
  if (category.mode !== "self_round" || !category.enabled) return;
  const current = await roundState(db, room, category, members);
  const completed = new Set(
    current.active
      .filter((row) => row.status === "completed" || row.id === completingId)
      .map((row) => row.assignee_id),
  );
  const advance =
    !current.active.length ||
    members.every((member) => completed.has(member.user_id));
  const sequence = current.sequence + (advance ? 1 : 0);
  if (advance && current.sequence)
    mutation.update(
      "chore_tasks",
      { status: "cancelled" },
      "dorm_id=? AND key=? AND sequence=? AND status='pending' AND id<>?",
      [room.id, category.key, current.sequence, completingId || -1],
    );
  const missing = advance
    ? members
    : members.filter(
        (member) =>
          !current.active.some((row) => row.assignee_id === member.user_id),
      );
  appendRows(
    mutation,
    missing.map((member) =>
      roundRow(room, category, member, members, now, sequence),
    ),
    true,
  );
}
function synchronizedOrder(order, ids) {
  return [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
  ];
}
async function maintain(db, room, now) {
  await initialize(db, room, now);
  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await first(
        db,
        "SELECT * FROM chore_settings WHERE dorm_id=?",
        [room.id],
      ),
      settings = await categories(db, room.id),
      members = await roomMembers(db, room.id),
      ids = members.map((member) => member.user_id);
    if (!members.length) fail(409, "no_members", "宿舍没有有效成员");
    const replacements = [],
      mutation = new Mutation(db, room, state.version);
    for (const category of settings) {
      const order = synchronizedOrder(category.rotation_order, ids);
      if (JSON.stringify(order) !== JSON.stringify(category.rotation_order)) {
        category.rotation_order = order;
        mutation.update(
          "chore_categories",
          { rotation_order: JSON.stringify(order) },
          "dorm_id=? AND key=?",
          [room.id, category.key],
        );
        if (category.mode === "scheduled") replacements.push(category.key);
      }
    }
    const today = localDate(now),
      end = addDate(today, 29);
    const existing = await all(
      db,
      "SELECT key,task_key FROM chore_tasks WHERE dorm_id=? AND duty_date BETWEEN ? AND ?",
      [room.id, today, end],
    );
    const tokens = new Set(existing.map((row) => `${row.key}:${row.task_key}`));
    let missing = replacements.length > 0;
    for (const category of settings.filter(
      (entry) => entry.mode === "scheduled",
    ))
      for (let i = 0; i < 30; i++) {
        const day = addDate(today, i);
        if (
          scheduledAssignee(category, day) &&
          !tokens.has(`${category.key}:${day}`)
        )
          missing = true;
      }
    const water = settings.find((entry) => entry.key === "water"),
      pending = await first(
        db,
        "SELECT * FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='pending'",
        [room.id],
      );
    if (pending && !ids.includes(pending.assignee_id)) {
      const uid = water.rotation_order[0],
        member = members.find((entry) => entry.user_id === uid);
      mutation.update(
        "chore_tasks",
        {
          assignee_id: uid,
          assignee_name_snapshot: member.nickname,
          marker_id_snapshot: member.marker_id,
        },
        "id=? AND status='pending'",
        [pending.id],
      );
      missing = true;
    }
    if (water.enabled && !pending) {
      const last = await first(
        db,
        "SELECT assignee_id,sequence FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='completed' ORDER BY sequence DESC LIMIT 1",
        [room.id],
      );
      const sequence = Number(last?.sequence || 0) + 1;
      const index = last?.sequence
        ? (water.rotation_order.indexOf(last.assignee_id) + 1) %
          water.rotation_order.length
        : 0;
      appendRows(mutation, [
        plannedRow(
          room,
          water,
          today > water.start_date ? today : water.start_date,
          water.rotation_order[index],
          members,
          sequence,
        ),
      ]);
      missing = true;
    }
    for (const category of settings.filter(
      (entry) => entry.mode === "self_round",
    ))
      await planRound(db, mutation, room, category, members, now);
    if (!missing && mutation.ops.length === 1)
      return { state, settings, members };
    await planDaily(db, mutation, room, settings, members, now, replacements);
    try {
      await mutation.finish();
    } catch (error) {
      if (error instanceof ChoreError && error.code === "stale_version")
        continue;
      throw error;
    }
    return {
      state: { ...state, version: state.version + 1 },
      settings,
      members,
    };
  }
  fail(409, "stale_version", "宿舍正在更新，请稍后刷新");
}
function taskView(task, now, who, settings, members) {
  if (!task) return null;
  const category = settings.find((entry) => entry.key === task.key),
    active = members.find((entry) => entry.user_id === task.assignee_id);
  return {
    id: task.id,
    key: task.key,
    name: task.name,
    content: task.content,
    duty_date: task.duty_date,
    assignee_id: task.assignee_id,
    assignee_name:
      task.status === "completed"
        ? task.assignee_name_snapshot
        : active?.nickname || task.assignee_name_snapshot,
    marker_id:
      task.status === "completed"
        ? task.marker_id_snapshot
        : active?.marker_id || task.marker_id_snapshot,
    deadline_at: category?.mode === "scheduled" ? task.deadline_at : "",
    mode: category?.mode,
    status: task.status,
    completed_at: task.completed_at,
    can_complete: Boolean(
      who &&
        !who.is_demo &&
        who.user_id === task.assignee_id &&
        task.status === "pending" &&
        task.duty_date <= localDate(now) &&
        category?.enabled,
    ),
    sequence: task.sequence,
  };
}
function reminderView(row) {
  return {
    id: row.id,
    sender_id: row.source === "scheduled" ? null : row.sender_id,
    source: row.source || "member",
    sender_name: row.sender_name_snapshot,
    target_member_id: row.target_member_id,
    task_id: row.task_id,
    task_name: row.task_name_snapshot,
    task_content: row.task_content_snapshot,
    created_at: row.created_at,
    read_at: row.read_at,
    title:
      row.source === "scheduled"
        ? "轮到 · 值日提醒"
        : `${row.sender_name_snapshot} 提醒你${row.task_name_snapshot}`,
    body: row.task_content_snapshot,
  };
}
// History is a projection. Corrections never update tasks, rounds or the water cursor.
const historySQL = `SELECT t.id,t.key,t.name,t.assignee_id,t.assignee_name_snapshot,t.marker_id_snapshot,
 COALESCE(h.completed_at,t.completed_at) AS completed_at,COALESCE(h.revision,0) AS revision,
 CASE WHEN h.id IS NULL THEN 0 ELSE 1 END AS corrected
 FROM chore_tasks t LEFT JOIN chore_history_entries h ON h.task_id=t.id AND h.dorm_id=t.dorm_id
 WHERE t.dorm_id=? AND t.status='completed' AND COALESCE(h.voided,0)=0
 UNION ALL SELECT -h.id,h.key,h.name,h.assignee_id,h.assignee_name_snapshot,h.marker_id_snapshot,h.completed_at,h.revision,1
 FROM chore_history_entries h WHERE h.dorm_id=? AND h.task_id IS NULL AND h.voided=0`;
const historyView = (row) => ({
  id: row.id,
  key: row.key,
  name: row.name,
  assignee_id: row.assignee_id,
  assignee_name: row.assignee_name_snapshot,
  marker_id: row.marker_id_snapshot,
  completed_at: row.completed_at,
  completed_date: localDate(row.completed_at),
  revision: row.revision || 0,
  corrected: !!row.corrected,
});
async function activity(request, db, env, now, url) {
  const who = await actor(request, db, now),
    room = await roomByInvite(db, env, url.searchParams.get("invite_code"));
  if (!room.is_demo && !who) fail(401, "member_required", "请先进入宿舍");
  if (who && who.dorm_id !== room.id)
    fail(403, "wrong_dorm", "只能查看自己的宿舍");
  const today = localDate(now),
    firstMonth = new Date(today.slice(0, 7) + "-01T00:00:00Z");
  firstMonth.setUTCMonth(firstMonth.getUTCMonth() - 2);
  const start = firstMonth.toISOString().slice(0, 10),
    from = deadline(start, "00:00"),
    end = deadline(addDate(today, 1), "00:00");
  const daily = await all(
    db,
    `SELECT strftime('%Y-%m-%d',completed_at,'+8 hours') AS date,key,COUNT(*) AS count FROM (${historySQL}) WHERE completed_at>=? AND completed_at<? GROUP BY date,key ORDER BY date,key`,
    [room.id, room.id, from, end],
  );
  const rows = await all(
    db,
    `SELECT * FROM (${historySQL}) WHERE completed_at>=? AND completed_at<? ORDER BY completed_at DESC,id DESC LIMIT 501`,
    [room.id, room.id, deadline(addDate(today, -4), "00:00"), end],
  );
  const lastCompleted = await all(
    db,
    `SELECT key,MAX(completed_at) AS completed_at FROM (${historySQL}) WHERE completed_at<=? GROUP BY key`,
    [room.id, room.id, new Date(now).toISOString()],
  );
  return json({
    start,
    today,
    daily,
    last_completed: lastCompleted,
    recent_records: rows.slice(0, 500).map(historyView),
    recent_truncated: rows.length > 500,
  });
}
async function historyChange(request, db, room, who, now) {
  if (request.method === "GET") {
    const url = new URL(request.url),
      id = Number(url.searchParams.get("id"));
    if (!Number.isSafeInteger(id) || !id) invalid();
    const row = await first(db, `SELECT * FROM (${historySQL}) WHERE id=?`, [
      room.id,
      room.id,
      id,
    ]);
    if (!row) fail(404, "record_missing", "记录不存在");
    if (row.assignee_id !== who.user_id && !who.is_creator)
      fail(403, "not_owner", "只能修正自己的记录");
    const entry = await first(
      db,
      id > 0
        ? "SELECT id FROM chore_history_entries WHERE dorm_id=? AND task_id=?"
        : "SELECT id FROM chore_history_entries WHERE dorm_id=? AND id=?",
      [room.id, Math.abs(id)],
    );
    const audit = entry
      ? await all(
          db,
          "SELECT actor_name,before_json,after_json,reason,created_at FROM chore_history_audit WHERE dorm_id=? AND entry_id=? ORDER BY id DESC",
          [room.id, entry.id],
        )
      : [];
    return json({
      record: historyView(row),
      audit: audit.map((a) => ({
        ...a,
        before: a.before_json ? JSON.parse(a.before_json) : null,
        after: JSON.parse(a.after_json),
        before_json: undefined,
        after_json: undefined,
      })),
    });
  }
  if (!["POST", "PATCH", "DELETE"].includes(request.method))
    fail(404, "not_found", "接口不存在");
  const input = await body(
    request,
    request.method === "POST"
      ? ["version", "member_id", "key", "completed_at", "reason"]
      : request.method === "PATCH"
        ? ["id", "revision", "version", "completed_at", "reason"]
        : ["id", "revision", "version", "reason"],
    request.method === "POST"
      ? ["version", "member_id", "key", "completed_at", "reason"]
      : request.method === "PATCH"
        ? ["id", "revision", "version", "completed_at", "reason"]
        : ["id", "revision", "version", "reason"],
  );
  const reason = str(input.reason, 1, 200),
    version = integer(input.version, 0),
    id = input.id;
  const { state, settings, members } = await maintain(db, room, now);
  if (state.version !== version)
    fail(409, "stale_version", "记录或轮次已变化，请刷新后重试");
  let original = null,
    entry = null,
    target,
    key,
    name,
    marker,
    nickname;
  if (request.method !== "POST") {
    if (!Number.isSafeInteger(id) || !id) invalid();
    integer(input.revision, 0);
    original = await first(db, `SELECT * FROM (${historySQL}) WHERE id=?`, [
      room.id,
      room.id,
      id,
    ]);
    if (!original) fail(404, "record_missing", "记录不存在或已撤销");
    if (original.revision !== input.revision)
      fail(409, "history_changed", "这条记录已被修正，请重新打开");
    entry = await first(
      db,
      id > 0
        ? "SELECT * FROM chore_history_entries WHERE dorm_id=? AND task_id=?"
        : "SELECT * FROM chore_history_entries WHERE dorm_id=? AND id=?",
      [room.id, Math.abs(id)],
    );
    target = original.assignee_id;
    key = original.key;
    name = original.name;
    marker = original.marker_id_snapshot;
    nickname = original.assignee_name_snapshot;
  } else {
    target = integer(input.member_id);
    key = input.key;
    if (!KEYS.includes(key)) invalid();
    const member = members.find((m) => m.user_id === target),
      category = settings.find((c) => c.key === key);
    if (!member || !category) invalid("请选择宿舍成员和任务");
    name = category.name;
    marker = member.marker_id;
    nickname = member.nickname;
  }
  if (target !== who.user_id && !who.is_creator)
    fail(403, "not_owner", "只能补记或修正自己的记录");
  let timestamp = original?.completed_at;
  if (request.method !== "DELETE") {
    if (
      typeof input.completed_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/.test(input.completed_at)
    )
      invalid("请选择完成日期和时间");
    date(input.completed_at.slice(0, 10));
    time(input.completed_at.slice(11, 16));
    const parsed = new Date(input.completed_at);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed > now ||
      localDate(parsed) < "2020-01-01"
    )
      invalid("完成时间不能在未来，且不能早于2020年");
    timestamp = parsed.toISOString();
  }
  const after = {
      completed_at: timestamp,
      voided: request.method === "DELETE",
    },
    op = random(),
    stamp = now.toISOString();
  const mutation = new Mutation(db, room, version, who, target !== who.user_id);
  if (entry)
    mutation.update(
      "chore_history_entries",
      {
        completed_at: timestamp,
        voided: after.voided ? 1 : 0,
        revision: entry.revision + 1,
        operation_key: op,
        updated_at: stamp,
      },
      "id=? AND dorm_id=?",
      [entry.id, room.id],
    );
  else
    mutation.raw(
      `INSERT INTO chore_history_entries(dorm_id,task_id,assignee_id,key,name,assignee_name_snapshot,marker_id_snapshot,completed_at,voided,revision,operation_key,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,1,?,?,? WHERE ${mutation.guard}`,
      [
        room.id,
        id > 0 ? id : null,
        target,
        key,
        name,
        nickname,
        marker,
        timestamp,
        after.voided ? 1 : 0,
        op,
        stamp,
        stamp,
        ...mutation.guardValues,
      ],
    );
  mutation.raw(
    `INSERT INTO chore_history_audit(entry_id,dorm_id,actor_id,actor_name,before_json,after_json,reason,created_at) SELECT id,?,?,?,?,?,?,? FROM chore_history_entries WHERE dorm_id=? AND operation_key=? AND ${mutation.guard}`,
    [
      room.id,
      who.user_id,
      who.nickname,
      original
        ? JSON.stringify({ completed_at: original.completed_at, voided: false })
        : null,
      JSON.stringify(after),
      reason,
      stamp,
      room.id,
      op,
      ...mutation.guardValues,
    ],
  );
  await mutation.finish();
  return json(
    { ok: true, version: version + 1 },
    request.method === "POST" ? 201 : 200,
  );
}
async function board(request, db, env, now, url) {
  const who = await actor(request, db, now),
    room = await roomByInvite(db, env, url.searchParams.get("invite_code"));
  if (who && who.dorm_id !== room.id)
    fail(403, "wrong_dorm", "只能查看已加入的宿舍");
  const raw = url.searchParams.get("member_id");
  if (raw === null || !/^\d+$/.test(raw)) invalid("请先选择宿舍成员");
  const uid = integer(Number(raw)),
    { state, settings, members } = await maintain(db, room, now),
    selected = members.find((entry) => entry.user_id === uid);
  if (!selected) fail(404, "member_missing", "成员已离开宿舍或不存在");
  const today = localDate(now),
    month = url.searchParams.get("month") || today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith("0000"))
    invalid("请使用 YYYY-MM 月份格式");
  const actorForTasks = who?.user_id === uid ? who : null;
  const todayRows = await all(
    db,
    `SELECT t.* FROM chore_tasks t JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
    WHERE t.dorm_id=? AND t.key<>'water' AND t.assignee_id=? AND t.status<>'cancelled' AND c.enabled=1
    AND ((c.mode='scheduled' AND t.sequence IS NULL AND t.duty_date=?) OR (c.mode='self_round' AND t.sequence=(SELECT MAX(x.sequence) FROM chore_tasks x WHERE x.dorm_id=t.dorm_id AND x.key=t.key AND x.status<>'cancelled'))) ORDER BY t.key`,
    [room.id, uid, today],
  );
  const nextRows = await all(
    db,
    "SELECT t.* FROM chore_tasks t JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key AND c.mode='scheduled' AND c.enabled=1 WHERE t.dorm_id=? AND t.key<>'water' AND t.assignee_id=? AND t.status='pending' AND t.duty_date>? AND t.duty_date=(SELECT MIN(x.duty_date) FROM chore_tasks x WHERE x.dorm_id=t.dorm_id AND x.key=t.key AND x.assignee_id=t.assignee_id AND x.status='pending' AND x.duty_date>?) ORDER BY t.duty_date,t.key",
    [room.id, uid, today, today],
  );
  const water = await first(
    db,
    "SELECT * FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='pending'",
    [room.id],
  );
  const waterHandoff = water
    ? await first(
        db,
        "SELECT id,sequence,assignee_id,completed_at FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='completed' AND sequence=?",
        [room.id, water.sequence - 1],
      )
    : null;
  const adjacentMonth = (delta) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    return date.toISOString().slice(0, 7);
  };
  const calendarRows = await all(
    db,
    `SELECT * FROM (${historySQL}) WHERE strftime('%Y-%m',completed_at,'+8 hours')>=? AND strftime('%Y-%m',completed_at,'+8 hours')<? ORDER BY completed_at,id`,
    [room.id, room.id, adjacentMonth(-1), adjacentMonth(2)],
  );
  const reminders =
    who?.user_id === uid
      ? await all(
          db,
          "SELECT r.* FROM chore_reminders r WHERE r.dorm_id=? AND r.target_member_id=? AND NOT EXISTS(SELECT 1 FROM chore_tasks t WHERE t.id=r.task_id AND t.status='cancelled') ORDER BY r.created_at DESC,r.id DESC LIMIT 100",
          [room.id, uid],
        )
      : [];
  const undoRows =
    who?.user_id === uid && !room.is_demo
      ? await all(
          db,
          `SELECT t.* FROM chore_tasks t JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
     WHERE t.dorm_id=? AND t.assignee_id=? AND t.status='completed' AND t.completed_at>=?
     AND t.id=(SELECT own.id FROM chore_tasks own WHERE own.dorm_id=t.dorm_id AND own.key=t.key AND own.assignee_id=t.assignee_id AND own.status='completed' ORDER BY own.completed_at DESC,own.id DESC LIMIT 1)
     AND c.enabled=1 AND ((t.sequence IS NULL AND c.mode='scheduled') OR (t.sequence IS NOT NULL AND c.mode IN ('self_round','completion')))
     AND NOT EXISTS(SELECT 1 FROM chore_tasks later WHERE later.dorm_id=t.dorm_id AND later.key=t.key AND later.sequence>t.sequence AND later.status='completed')
     ORDER BY t.completed_at DESC,t.id DESC LIMIT 4`,
          [room.id, uid, new Date(now.getTime() - DAY).toISOString()],
        )
      : [];
  const rounds = [];
  for (const category of settings.filter(
    (entry) => entry.mode === "self_round" && entry.enabled,
  )) {
    const current = await roundState(db, room, category, members);
    rounds.push({
      key: category.key,
      sequence: current.sequence,
      total: members.length,
      completed: current.active.filter((row) => row.status === "completed")
        .length,
      completions: current.active
        .filter((row) => row.status === "completed")
        .sort(
          (a, b) => a.completed_at.localeCompare(b.completed_at) || a.id - b.id,
        )
        .map((row) => ({
          id: row.id,
          user_id: row.assignee_id,
          nickname: row.assignee_name_snapshot,
          marker_id: row.marker_id_snapshot,
          completed_at: row.completed_at,
        })),
      members: [...members]
        .sort(
          (a, b) =>
            category.rotation_order.indexOf(a.user_id) -
            category.rotation_order.indexOf(b.user_id),
        )
        .map((member) => ({
          ...member,
          completed: current.active.some(
            (row) =>
              row.assignee_id === member.user_id && row.status === "completed",
          ),
        })),
    });
  }
  const member = {
    user_id: uid,
    nickname: selected.nickname,
    marker_id: selected.marker_id,
  };
  return json({
    today,
    server_time: now.toISOString(),
    version: state.version,
    is_creator: Boolean(
      who?.is_creator && who.user_id === uid && !room.is_demo,
    ),
    member,
    members: members.map(({ user_id, nickname, marker_id }) => ({
      user_id,
      nickname,
      marker_id,
    })),
    categories: settings,
    rounds,
    today_tasks: todayRows.map((task) =>
      taskView(task, now, actorForTasks, settings, members),
    ),
    next_tasks: nextRows.map((task) =>
      taskView(task, now, actorForTasks, settings, members),
    ),
    water_task: taskView(water, now, actorForTasks, settings, members),
    water_handoff: waterHandoff
      ? {
          id: waterHandoff.id,
          sequence: waterHandoff.sequence,
          from_member_id: waterHandoff.assignee_id,
          completed_at: waterHandoff.completed_at,
        }
      : null,
    undo_tasks: undoRows.map((task) =>
      taskView(task, now, actorForTasks, settings, members),
    ),
    water_order: settings.find((entry) => entry.key === "water").rotation_order,
    calendar: calendarRows
      .filter((row) => localDate(row.completed_at).startsWith(month))
      .map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        assignee_id: row.assignee_id,
        assignee_name: row.assignee_name_snapshot,
        marker_id: row.marker_id_snapshot,
        completed_at: row.completed_at,
        completed_date: localDate(row.completed_at),
        revision: row.revision || 0,
        corrected: !!row.corrected,
      })),
    calendar_neighbors: Object.fromEntries(
      [-1, 1].map((delta) => {
        const key = adjacentMonth(delta);
        return [
          key,
          calendarRows
            .filter((row) => localDate(row.completed_at).startsWith(key))
            .map((row) => ({
              id: row.id,
              key: row.key,
              name: row.name,
              assignee_id: row.assignee_id,
              assignee_name: row.assignee_name_snapshot,
              marker_id: row.marker_id_snapshot,
              completed_at: row.completed_at,
              completed_date: localDate(row.completed_at),
              revision: row.revision || 0,
              corrected: !!row.corrected,
            })),
        ];
      }),
    ),
    reminders: reminders.map(reminderView),
  });
}
async function setMarker(db, room, who, marker, state) {
  const occupied = await first(
    db,
    "SELECT user_id FROM member_marks WHERE dorm_id=? AND marker_id=? AND user_id<>?",
    [room.id, marker, who.user_id],
  );
  if (occupied) fail(409, "marker_taken", "这个标记已被室友选用，请换一个");
  const mutation = new Mutation(db, room, state.version, who);
  mutation.update(
    "member_marks",
    { marker_id: marker },
    "dorm_id=? AND user_id=?",
    [room.id, who.user_id],
  );
  await mutation.finish();
  return {
    member: { user_id: who.user_id, nickname: who.nickname, marker_id: marker },
    version: state.version + 1,
  };
}
async function claim(request, db, env, now) {
  const input = await body(
      request,
      ["invite_code", "member_id", "nickname", "marker_id"],
      ["invite_code"],
    ),
    room = await roomByInvite(db, env, input.invite_code);
  if (room.is_demo)
    fail(403, "demo_read_only", "游客模式仅供体验，请创建或加入正式宿舍");
  if (input.nickname === undefined)
    fail(422, "name_required", "请更新页面，并输入你的完整名字进入宿舍");
  const nickname = str(input.nickname, 1, 32),
    uidHint = input.member_id === undefined ? null : integer(input.member_id),
    { state, members } = await maintain(db, room, now),
    matches = members.filter((entry) => entry.nickname === nickname);
  if (matches.length > 1 && uidHint === null)
    fail(409, "ambiguous_name", "这个名字对应多位室友，请联系宿舍创建者核对");
  const member = matches.find(
    (entry) => uidHint === null || entry.user_id === uidHint,
  );
  if (!member)
    fail(403, "name_mismatch", "名字不匹配，请输入创建者填写的完整名字");
  const uid = member.user_id;
  let marker = member.marker_id;
  if (input.marker_id !== undefined) {
    marker = validateMarker(input.marker_id);
    if (marker !== member.marker_id)
      await setMarker(
        db,
        room,
        { user_id: uid, nickname: member.nickname, is_demo: false },
        marker,
        state,
      );
  }
  const token = random(),
    hash = await digest(token),
    expires = new Date(now.getTime() + 365 * DAY).toISOString();
  const result = await stmt(
    db,
    "INSERT INTO member_sessions(token_hash,dorm_id,user_id,created_at,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dorm_members m JOIN users u ON u.id=m.user_id JOIN dormitories d ON d.id=m.dorm_id WHERE m.dorm_id=? AND m.user_id=? AND m.is_active=1 AND u.current_dorm_id=m.dorm_id AND d.is_demo=0)",
    [hash, room.id, uid, now.toISOString(), expires, room.id, uid],
  ).run();
  if (changes(result) !== 1)
    fail(409, "member_changed", "成员状态已变化，请刷新后重新选择");
  return json(
    {
      access_token: token,
      member: { user_id: uid, nickname: member.nickname, marker_id: marker },
      is_creator: false,
    },
    201,
  );
}
function normalizeCategory(input, current, ids, today) {
  object(
    input,
    [
      "key",
      "name",
      "content",
      "deadline_time",
      "start_date",
      "weekdays",
      "rotation_days",
      "reminder_interval_days",
      "rotation_order",
      "enabled",
      "mode",
    ],
    ["key"],
  );
  if (
    !KEYS.includes(input.key) ||
    (input.mode !== undefined &&
      !(
        input.key === "water" ? ["completion"] : ["scheduled", "self_round"]
      ).includes(input.mode))
  )
    invalid("请选择有效的值日方式，抬水按完成顺序轮换");
  const value = { ...current, ...input };
  value.name = str(value.name, 1, 32);
  value.content = str(value.content, 1, 500);
  value.deadline_time = time(value.deadline_time);
  value.start_date = date(value.start_date);
  if (
    value.start_date > addDate(today, 365) ||
    value.start_date < addDate(today, -3650)
  )
    invalid("排班开始日期超出范围");
  if (
    !Array.isArray(value.weekdays) ||
    !value.weekdays.length ||
    value.weekdays.length > 7 ||
    new Set(value.weekdays).size !== value.weekdays.length
  )
    invalid();
  value.weekdays.forEach((day) => integer(day, 1, 7));
  value.weekdays = [...value.weekdays].sort((a, b) => a - b);
  value.rotation_days = integer(value.rotation_days, 1, 30);
  value.reminder_interval_days = integer(value.reminder_interval_days, 1, 365);
  if (
    !Array.isArray(value.rotation_order) ||
    value.rotation_order.length !== ids.length ||
    new Set(value.rotation_order).size !== ids.length ||
    value.rotation_order.some((id) => !ids.includes(id))
  )
    fail(422, "invalid_order", "轮换顺序须包含每位有效成员且不能重复");
  if (typeof value.enabled !== "boolean") invalid();
  return value;
}
async function reassignPendingWater(db, mutation, room, water, members, now) {
  const pending = await first(
    db,
    "SELECT * FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='pending'",
    [room.id],
  );
  if (!pending) return;
  const last = await first(
    db,
    "SELECT assignee_id FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='completed' ORDER BY sequence DESC LIMIT 1",
    [room.id],
  );
  const next = last
    ? (water.rotation_order.indexOf(last.assignee_id) + 1) %
      water.rotation_order.length
    : 0;
  const member = members.find((m) => m.user_id === water.rotation_order[next]);
  if (pending.assignee_id === member.user_id) return;
  mutation.update(
    "chore_tasks",
    {
      assignee_id: member.user_id,
      assignee_name_snapshot: member.nickname,
      marker_id_snapshot: member.marker_id,
    },
    "id=? AND status='pending'",
    [pending.id],
  );
  mutation.update(
    "chore_push_jobs",
    { status: "cancelled" },
    "dorm_id=? AND status='pending' AND reminder_id IN (SELECT id FROM chore_reminders WHERE dorm_id=? AND task_id=? AND target_member_id<>?)",
    [room.id, room.id, pending.id, member.user_id],
  );
  mutation.update(
    "chore_reminders",
    { read_at: now.toISOString() },
    "dorm_id=? AND task_id=? AND target_member_id<>? AND read_at IS NULL",
    [room.id, pending.id, member.user_id],
  );
}
async function configure(request, db, room, who, now, orderOnly = false) {
  if (!orderOnly && (!who.is_creator || who.scoped))
    fail(403, "admin_required", "只有宿舍创建者可以修改任务设置");
  const input = orderOnly
    ? await body(
        request,
        ["version", "key", "rotation_order"],
        ["version", "key", "rotation_order"],
      )
    : await body(request, ["version", "categories"], ["version", "categories"]);
  if (orderOnly)
    input.categories = [
      { key: input.key, rotation_order: input.rotation_order },
    ];
  const expected = integer(input.version),
    { state, settings, members } = await maintain(db, room, now);
  if (expected !== state.version)
    fail(409, "stale_version", "任务已变化，请刷新设置后重试");
  if (
    !Array.isArray(input.categories) ||
    !input.categories.length ||
    input.categories.length > 4 ||
    new Set(input.categories.map((entry) => entry?.key)).size !==
      input.categories.length
  )
    invalid();
  const ids = members.map((member) => member.user_id),
    today = localDate(now),
    updatedKeys = input.categories.map((entry) => entry?.key);
  const updated = input.categories.map((entry) => {
    const old = settings.find((category) => category.key === entry?.key);
    if (!old) invalid();
    return normalizeCategory(entry, old, ids, today);
  });
  const draft = settings.map(
      (category) =>
        updated.find((entry) => entry.key === category.key) || category,
    ),
    mutation = new Mutation(db, room, state.version, who, !orderOnly);
  const waterToReorder = updated.find(
    (c) =>
      c.key === "water" &&
      (orderOnly ||
        JSON.stringify(c.rotation_order) !==
          JSON.stringify(
            settings.find((old) => old.key === "water").rotation_order,
          )),
  );
  if (waterToReorder)
    await reassignPendingWater(
      db,
      mutation,
      room,
      waterToReorder,
      members,
      now,
    );
  if (orderOnly) {
    for (const category of updated)
      mutation.update(
        "chore_categories",
        { rotation_order: JSON.stringify(category.rotation_order) },
        "dorm_id=? AND key=?",
        [room.id, category.key],
      );
    const scheduledKeys = updated
      .filter((c) => c.mode === "scheduled")
      .map((c) => c.key);
    if (scheduledKeys.length)
      await planDaily(db, mutation, room, draft, members, now, scheduledKeys);
    await mutation.finish();
    return json({ version: state.version + 1, categories: draft });
  }
  for (const category of updated)
    mutation.update(
      "chore_categories",
      {
        name: category.name,
        content: category.content,
        deadline_time: category.deadline_time,
        start_date: category.start_date,
        weekdays: JSON.stringify(category.weekdays),
        rotation_days: category.rotation_days,
        reminder_interval_days: category.reminder_interval_days,
        rotation_order: JSON.stringify(category.rotation_order),
        enabled: category.enabled ? 1 : 0,
        mode: category.mode,
      },
      "dorm_id=? AND key=?",
      [room.id, category.key],
    );
  for (const category of updated.filter((entry) => entry.key !== "water")) {
    const previous = settings.find((entry) => entry.key === category.key);
    if (category.mode !== previous.mode) {
      mutation.update(
        "chore_tasks",
        { status: "cancelled" },
        "dorm_id=? AND key=? AND status='pending'",
        [room.id, category.key],
      );
      if (category.mode === "self_round" && category.enabled) {
        const current = await roundState(db, room, category, members);
        appendRows(
          mutation,
          members.map((member) =>
            roundRow(
              room,
              category,
              member,
              members,
              now,
              current.sequence + 1,
            ),
          ),
        );
      } else if (category.mode === "scheduled") {
        const uid = scheduledAssignee(category, today);
        if (uid)
          appendRows(
            mutation,
            [plannedRow(room, category, today, uid, members)],
            true,
          );
      }
    } else if (category.mode === "self_round") {
      mutation.update(
        "chore_tasks",
        { name: category.name, content: category.content },
        "dorm_id=? AND key=? AND status='pending'",
        [room.id, category.key],
      );
    }
  }
  await planDaily(
    db,
    mutation,
    room,
    draft,
    members,
    now,
    updatedKeys.filter((key) => key !== "water"),
  );
  if (updatedKeys.includes("water")) {
    const water = draft.find((entry) => entry.key === "water"),
      pending = await first(
        db,
        "SELECT * FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='pending'",
        [room.id],
      );
    if (pending) {
      const previous = settings.find((entry) => entry.key === "water");
      const dutyDate =
        water.start_date !== previous.start_date &&
        (pending.duty_date > today || water.start_date > today)
          ? water.start_date > today
            ? water.start_date
            : today
          : pending.duty_date;
      mutation.update(
        "chore_tasks",
        {
          name: water.name,
          content: water.content,
          duty_date: dutyDate,
          deadline_at: deadline(dutyDate, water.deadline_time),
        },
        "id=? AND status='pending'",
        [pending.id],
      );
    } else if (water.enabled) {
      const last = await first(
        db,
        "SELECT * FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='completed' ORDER BY sequence DESC LIMIT 1",
        [room.id],
      );
      const next = last
        ? (water.rotation_order.indexOf(last.assignee_id) + 1) %
          water.rotation_order.length
        : 0;
      appendRows(mutation, [
        plannedRow(
          room,
          water,
          today > water.start_date ? today : water.start_date,
          water.rotation_order[next],
          members,
          Number(last?.sequence || 0) + 1,
        ),
      ]);
    }
  }
  await mutation.finish();
  return json({ version: state.version + 1, categories: draft });
}
async function taskInRoom(db, room, id) {
  const task = await first(db, "SELECT * FROM chore_tasks WHERE id=?", [id]);
  if (!task) fail(404, "task_missing", "任务不存在");
  if (task.dorm_id !== room.id)
    fail(403, "wrong_dorm", "不能操作其他宿舍的任务");
  return task;
}
async function complete(db, room, who, now, id) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await completeOnce(db, room, who, now, id);
    } catch (error) {
      if (
        !(error instanceof ChoreError && error.code === "stale_version") ||
        attempt === 7
      )
        throw error;
    }
  }
}
async function completeOnce(db, room, who, now, id) {
  const { state, settings, members } = await maintain(db, room, now),
    task = await taskInRoom(db, room, id),
    category = settings.find((entry) => entry.key === task.key);
  if (task.assignee_id !== who.user_id)
    fail(403, "not_assignee", "只能完成自己的任务");
  if (task.status !== "pending")
    fail(409, "already_completed", "任务已完成或已取消");
  if (!category.enabled) fail(409, "category_disabled", "这项任务已暂停");
  if (task.duty_date > localDate(now))
    fail(422, "future_task", "任务开始后才可以打卡");
  const member = members.find((entry) => entry.user_id === who.user_id),
    mutation = new Mutation(
      db,
      room,
      state.version,
      who,
      false,
      "EXISTS (SELECT 1 FROM chore_tasks WHERE id=? AND dorm_id=chore_settings.dorm_id AND assignee_id=? AND status='pending')",
      [task.id, who.user_id],
    );
  const completedAt = now.toISOString();
  mutation.update(
    "chore_tasks",
    {
      status: "completed",
      completed_at: completedAt,
      assignee_name_snapshot: member.nickname,
      marker_id_snapshot: member.marker_id,
    },
    "id=? AND assignee_id=? AND status='pending'",
    [task.id, who.user_id],
  );
  if (task.key === "water") {
    const next =
      (category.rotation_order.indexOf(who.user_id) + 1) %
      category.rotation_order.length;
    appendRows(
      mutation,
      [
        plannedRow(
          room,
          category,
          localDate(now) > category.start_date
            ? localDate(now)
            : category.start_date,
          category.rotation_order[next],
          members,
          task.sequence + 1,
        ),
      ],
      true,
    );
  }
  if (category.mode === "self_round")
    await planRound(db, mutation, room, category, members, now, task.id);
  await mutation.finish();
  const finished = {
    ...task,
    status: "completed",
    completed_at: completedAt,
    assignee_name_snapshot: member.nickname,
    marker_id_snapshot: member.marker_id,
  };
  const nextWater =
    task.key === "water"
      ? await first(
          db,
          "SELECT * FROM chore_tasks WHERE dorm_id=? AND key='water' AND status='pending'",
          [room.id],
        )
      : null;
  return json({
    task: taskView(finished, now, who, settings, members),
    next_water: taskView(nextWater, now, who, settings, members),
    version: state.version + 1,
  });
}
// Undo only the actor's completion. A later completed turn is never rewound.
async function undo(db, room, who, now, id) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await undoOnce(db, room, who, now, id);
    } catch (error) {
      if (
        !(error instanceof ChoreError && error.code === "stale_version") ||
        attempt === 7
      )
        throw error;
    }
  }
}
async function undoOnce(db, room, who, now, id) {
  const { state, settings, members } = await maintain(db, room, now),
    task = await taskInRoom(db, room, id);
  if (task.assignee_id !== who.user_id)
    fail(403, "not_assignee", "只能撤销自己的打卡");
  if (task.status !== "completed")
    fail(409, "not_completed", "这条打卡已撤销或尚未完成");
  const category = settings.find((c) => c.key === task.key);
  if (
    !category?.enabled ||
    (task.sequence === null
      ? category.mode !== "scheduled"
      : !["self_round", "completion"].includes(category.mode))
  )
    fail(409, "mode_changed", "任务安排已调整，请联系创建者处理这条记录");
  if (
    task.sequence !== null &&
    (await first(
      db,
      "SELECT id FROM chore_tasks WHERE dorm_id=? AND key=? AND sequence>? AND status='completed'",
      [room.id, task.key, task.sequence],
    ))
  )
    fail(
      409,
      "following_turn_completed",
      "后续轮次已有室友打卡，不能直接回退。请联系创建者核对。",
    );
  const mutation = new Mutation(
    db,
    room,
    state.version,
    who,
    false,
    "EXISTS(SELECT 1 FROM chore_tasks WHERE id=? AND dorm_id=chore_settings.dorm_id AND assignee_id=? AND status='completed')",
    [id, who.user_id],
  );
  if (task.sequence !== null) {
    mutation.update(
      "chore_tasks",
      { status: "cancelled" },
      "dorm_id=? AND key=? AND sequence>? AND status='pending'",
      [room.id, task.key, task.sequence],
    );
    mutation.update(
      "chore_push_jobs",
      { status: "cancelled" },
      "dorm_id=? AND status='pending' AND reminder_id IN (SELECT r.id FROM chore_reminders r JOIN chore_tasks t ON t.id=r.task_id WHERE t.dorm_id=? AND t.key=? AND t.sequence>? AND t.status='cancelled')",
      [room.id, room.id, task.key, task.sequence],
    );
  }
  mutation.update(
    "chore_tasks",
    { status: "pending", completed_at: null },
    "id=? AND assignee_id=? AND status='completed'",
    [id, who.user_id],
  );
  await mutation.finish();
  return json({
    task: taskView(
      { ...task, status: "pending", completed_at: null },
      now,
      who,
      settings,
      members,
    ),
    version: state.version + 1,
  });
}
async function remind(request, db, room, who, now, env) {
  const input = await body(
      request,
      ["target_member_id", "task_id"],
      ["target_member_id", "task_id"],
    ),
    target = integer(input.target_member_id),
    id = integer(input.task_id),
    { state, members, settings } = await maintain(db, room, now),
    task = await taskInRoom(db, room, id);
  if (!members.some((member) => member.user_id === target))
    fail(403, "wrong_dorm", "只能提醒自己宿舍的成员");
  if (target !== task.assignee_id)
    fail(422, "invalid_target", "请提醒这项任务的负责成员");
  if (task.status !== "pending")
    fail(409, "already_completed", "这项任务已完成或已取消");
  if (!settings.find((entry) => entry.key === task.key).enabled)
    fail(409, "category_disabled", "这项任务已暂停");
  if (target === who.user_id)
    fail(422, "self_reminder", "请选择需要提醒的室友");
  const cutoff = new Date(now.getTime() - 60_000).toISOString();
  const cooldownSql =
    "SELECT id FROM chore_reminders WHERE dorm_id=? AND sender_id=? AND target_member_id=? AND task_id=? AND created_at>?";
  const cooldownArgs = [room.id, who.user_id, target, id, cutoff];
  if (await first(db, cooldownSql, cooldownArgs))
    fail(429, "reminder_cooldown", "刚刚已经提醒过，等一分钟再试");
  const mutation = new Mutation(
    db,
    room,
    state.version,
    who,
    false,
    `EXISTS(SELECT 1 FROM chore_tasks WHERE id=? AND dorm_id=chore_settings.dorm_id AND assignee_id=? AND status='pending') AND NOT EXISTS (${cooldownSql})`,
    [id, target, ...cooldownArgs],
  );
  mutation.raw(
    `INSERT INTO chore_reminders(dorm_id,sender_id,sender_name_snapshot,target_member_id,task_id,task_name_snapshot,task_content_snapshot,created_at,mutation_key) SELECT ?,?,?,?,?,?,?,?,? WHERE ${mutation.guard}`,
    [
      room.id,
      who.user_id,
      who.nickname,
      target,
      task.id,
      task.name,
      task.content,
      now.toISOString(),
      mutation.token,
      ...mutation.guardValues,
    ],
  );
  // Reminder and every configured device are committed in the same CAS transaction.
  mutation.ops.push(
    notifyUser(
      target,
      {
        dormId: room.id,
        reminderKey: mutation.token,
        createdAt: now.toISOString(),
      },
      { db, env, guard: mutation.guard, values: mutation.guardValues },
    ),
  );
  try {
    await mutation.finish();
  } catch (error) {
    if (
      error instanceof ChoreError &&
      error.code === "stale_version" &&
      (await first(db, cooldownSql, cooldownArgs))
    )
      fail(429, "reminder_cooldown", "刚刚已经提醒过，等一分钟再试");
    throw error;
  }
  env.PUSH_WAKE?.();
  return json(
    reminderView(
      await first(db, "SELECT * FROM chore_reminders WHERE mutation_key=?", [
        mutation.token,
      ]),
    ),
    201,
  );
}
async function memberPush(request, db, room, who, now, env, path) {
  const config = env.PUSH_CONFIG || { available: false, public_key: null };
  if (path === "/chores/push/config" && request.method === "GET")
    return json({
      available: Boolean(config.available),
      public_key: config.available ? config.public_key : null,
    });
  if (
    ![
      "/chores/push/subscribe",
      "/chores/push/unsubscribe",
      "/chores/push/test",
    ].includes(path) ||
    request.method !== "POST"
  )
    fail(404, "not_found", "接口不存在");
  const input = await body(
    request,
    path.endsWith("/subscribe") ? ["endpoint", "keys"] : ["endpoint"],
    ["endpoint"],
  );
  if (!validPushEndpoint(input.endpoint)) invalid("推送地址无效");
  const existing = await first(
    db,
    "SELECT * FROM chore_push_subscriptions WHERE endpoint=?",
    [input.endpoint],
  );
  if (path.endsWith("/subscribe")) {
    if (!config.available)
      fail(503, "push_unconfigured", "系统通知暂未配置，站内提醒仍可使用");
    object(input.keys, ["p256dh", "auth"], ["p256dh", "auth"]);
    if (
      !/^[A-Za-z0-9_-]{87}$/.test(input.keys.p256dh) ||
      !/^[A-Za-z0-9_-]{22}$/.test(input.keys.auth)
    )
      invalid("设备订阅无效");
    try {
      const raw = Uint8Array.from(
        atob(input.keys.p256dh.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      await crypto.subtle.importKey(
        "raw",
        raw,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
      );
    } catch {
      invalid("设备订阅无效");
    }
    const sameOwner =
      existing?.dorm_id === room.id && existing?.user_id === who.user_id;
    if (
      existing &&
      !sameOwner &&
      (existing.p256dh !== input.keys.p256dh ||
        existing.auth !== input.keys.auth)
    )
      fail(403, "device_mismatch", "请使用这台设备自己的通知订阅");
    if (
      sameOwner &&
      !existing.is_active &&
      existing.p256dh === input.keys.p256dh &&
      existing.auth === input.keys.auth &&
      (await first(
        db,
        "SELECT id FROM chore_push_jobs WHERE subscription_id=? AND subscription_revision=? AND last_status IN (404,410) LIMIT 1",
        [existing.id, existing.revision],
      ))
    )
      fail(410, "device_expired", "设备订阅已过期，请重新开启通知");
    if (
      sameOwner &&
      existing.is_active &&
      existing.p256dh === input.keys.p256dh &&
      existing.auth === input.keys.auth
    )
      return json({ ok: true, enabled: true });
    const { state } = await maintain(db, room, now);
    const mutation = new Mutation(
      db,
      room,
      state.version,
      who,
      false,
      "((SELECT count(*) FROM chore_push_subscriptions WHERE dorm_id=? AND user_id=? AND is_active=1)<8 OR EXISTS(SELECT 1 FROM chore_push_subscriptions WHERE endpoint=? AND dorm_id=? AND user_id=?))",
      [room.id, who.user_id, input.endpoint, room.id, who.user_id],
    );
    mutation.raw(
      `INSERT INTO chore_push_subscriptions(dorm_id,user_id,endpoint,p256dh,auth,is_active,created_at,updated_at)
      SELECT ?,?,?,?,?,1,?,? WHERE ${mutation.guard}
      ON CONFLICT(endpoint) DO UPDATE SET dorm_id=excluded.dorm_id,user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,is_active=1,revision=revision+1,updated_at=excluded.updated_at
      WHERE (chore_push_subscriptions.dorm_id=? AND chore_push_subscriptions.user_id=?) OR (chore_push_subscriptions.p256dh=? AND chore_push_subscriptions.auth=?)`,
      [
        room.id,
        who.user_id,
        input.endpoint,
        input.keys.p256dh,
        input.keys.auth,
        now.toISOString(),
        now.toISOString(),
        ...mutation.guardValues,
        room.id,
        who.user_id,
        input.keys.p256dh,
        input.keys.auth,
      ],
    );
    const result = await mutation.finish();
    if (!changes(result[1]))
      fail(409, "device_changed", "设备订阅已变化，请重试");
    return json({ ok: true, enabled: true });
  }
  if (!existing)
    return path.endsWith("/unsubscribe")
      ? json({ ok: true, enabled: false })
      : fail(409, "device_missing", "请先开启这台设备的通知");
  if (existing.dorm_id !== room.id || existing.user_id !== who.user_id)
    fail(403, "not_recipient", "只能管理自己的设备通知");
  const { state } = await maintain(db, room, now);
  if (path.endsWith("/unsubscribe")) {
    const mutation = new Mutation(db, room, state.version, who);
    mutation.update(
      "chore_push_subscriptions",
      {
        is_active: 0,
        revision: existing.revision + 1,
        updated_at: now.toISOString(),
      },
      "id=? AND dorm_id=? AND user_id=?",
      [existing.id, room.id, who.user_id],
    );
    await mutation.finish();
    return json({ ok: true, enabled: false });
  }
  if (!config.available) fail(503, "push_unconfigured", "系统通知暂未配置");
  if (!existing.is_active)
    fail(409, "device_missing", "请先开启这台设备的通知");
  const cutoff = new Date(now.getTime() - 60000).toISOString();
  const condition =
    "NOT EXISTS(SELECT 1 FROM chore_push_jobs WHERE subscription_id=? AND kind='test' AND created_at>?) AND EXISTS(SELECT 1 FROM chore_push_subscriptions WHERE id=? AND revision=? AND is_active=1 AND dorm_id=? AND user_id=?)";
  if (
    await first(
      db,
      "SELECT id FROM chore_push_jobs WHERE subscription_id=? AND kind='test' AND created_at>?",
      [existing.id, cutoff],
    )
  )
    fail(429, "push_cooldown", "测试通知刚刚已发送，等一分钟再试");
  const mutation = new Mutation(
    db,
    room,
    state.version,
    who,
    false,
    condition,
    [existing.id, cutoff, existing.id, existing.revision, room.id, who.user_id],
  );
  mutation.raw(
    `INSERT INTO chore_push_jobs(dorm_id,user_id,subscription_id,subscription_revision,kind,next_attempt_at,created_at) SELECT ?,?,?,?,'test',?,? WHERE ${mutation.guard}`,
    [
      room.id,
      who.user_id,
      existing.id,
      existing.revision,
      now.toISOString(),
      now.toISOString(),
      ...mutation.guardValues,
    ],
  );
  await mutation.finish();
  env.PUSH_WAKE?.();
  return json({ ok: true, queued: true }, 202);
}
async function reminderPlan(request, db, room, who, now) {
  if (!["GET", "PATCH"].includes(request.method))
    fail(404, "not_found", "接口不存在");
  const current = await first(
    db,
    "SELECT * FROM chore_reminder_preferences WHERE dorm_id=? AND user_id=?",
    [room.id, who.user_id],
  );
  const view = async (row) => ({
    enabled: Boolean(row?.enabled),
    times: row ? parse(row.times) : ["08:00", "19:00"],
    version: row?.version || 0,
    timezone: "Asia/Shanghai",
    updated_at: row?.updated_at || null,
    last_reminder: await first(
      db,
      `SELECT r.created_at,COUNT(j.id) AS devices,
      SUM(CASE WHEN j.status IN ('pending','sending') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN j.status='accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN j.status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN j.status='cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM chore_reminders r LEFT JOIN chore_push_jobs j ON j.reminder_id=r.id
      WHERE r.dorm_id=? AND r.target_member_id=? AND r.source='scheduled'
      GROUP BY r.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1`,
      [room.id, who.user_id],
    ),
  });
  if (request.method === "GET") return json(await view(current));
  const input = await body(
    request,
    ["enabled", "times", "version"],
    ["enabled", "times", "version"],
  );
  const version = integer(input.version, 0);
  if (
    typeof input.enabled !== "boolean" ||
    !Array.isArray(input.times) ||
    input.times.length < 1 ||
    input.times.length > 3
  )
    invalid("请选择每天 1 至 3 个提醒时间");
  if (
    input.times.some(
      (value) =>
        typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    )
  )
    invalid("提醒时间应为 00:00 至 23:59");
  const times = [...input.times].sort();
  if (new Set(times).size !== times.length) invalid("提醒时间不能重复");
  if (version !== (current?.version || 0))
    fail(409, "plan_changed", "提醒设置已变化，请重新打开后再试");
  if (
    current &&
    current.enabled === Number(input.enabled) &&
    current.times === JSON.stringify(times)
  )
    return json(await view(current));
  const hash = await digest(request.headers.get("Authorization").slice(7));
  const session = who.scoped ? "member_sessions" : "sessions";
  const live = `EXISTS(SELECT 1 FROM ${session} s JOIN users u ON u.id=s.user_id
    JOIN dorm_members m ON m.user_id=u.id AND m.dorm_id=u.current_dorm_id AND m.is_active=1
    JOIN dormitories d ON d.id=m.dorm_id AND d.is_demo=0
    WHERE s.token_hash=? AND s.expires_at>? AND s.user_id=? AND m.dorm_id=?${who.scoped ? " AND s.dorm_id=m.dorm_id" : ""})`;
  const results = await db.batch([
    stmt(
      db,
      `INSERT INTO chore_reminder_preferences(dorm_id,user_id,enabled,times,version,updated_at)
      SELECT ?,?,?,?,1,? WHERE COALESCE((SELECT version FROM chore_reminder_preferences WHERE dorm_id=? AND user_id=?),0)=? AND ${live}
      ON CONFLICT(dorm_id,user_id) DO UPDATE SET enabled=excluded.enabled,times=excluded.times,version=chore_reminder_preferences.version+1,updated_at=excluded.updated_at WHERE chore_reminder_preferences.version=?`,
      [
        room.id,
        who.user_id,
        Number(input.enabled),
        JSON.stringify(times),
        now.toISOString(),
        room.id,
        who.user_id,
        version,
        hash,
        now.toISOString(),
        who.user_id,
        room.id,
        version,
      ],
    ),
    stmt(
      db,
      `UPDATE chore_push_jobs SET status='cancelled' WHERE status='pending' AND dorm_id=? AND user_id=?
      AND reminder_id IN (SELECT e.reminder_id FROM chore_scheduled_reminders e JOIN chore_reminder_preferences p ON p.id=e.preference_id
      WHERE p.dorm_id=? AND p.user_id=? AND p.version=? AND e.preference_version<>p.version)`,
      [room.id, who.user_id, room.id, who.user_id, version + 1],
    ),
  ]);
  if (changes(results[0]) !== 1)
    fail(409, "plan_changed", "身份或提醒设置已变化，请重新打开后再试");
  return json(
    await view(
      await first(
        db,
        "SELECT * FROM chore_reminder_preferences WHERE dorm_id=? AND user_id=?",
        [room.id, who.user_id],
      ),
    ),
  );
}
async function nativePush(request, db, room, who, now, env, path) {
  const configured = env.NATIVE_PUSH_CONFIG || {};
  if (path === "/chores/native/config" && request.method === "GET")
    return json({
      android: Boolean(configured.android),
      harmony: Boolean(configured.harmony),
    });
  if (
    request.method !== "POST" ||
    !["subscribe", "unsubscribe", "test"].some(
      (op) => path === `/chores/native/${op}`,
    )
  )
    fail(404, "not_found", "接口不存在");
  const input = await body(
    request,
    ["platform", "registration_id", "device_id", "device_secret"],
    ["platform", "device_id", "device_secret"],
  );
  if (
    !["android", "harmony"].includes(input.platform) ||
    !/^[a-f0-9]{64}$/.test(input.device_id) ||
    !/^[a-f0-9]{64}$/.test(input.device_secret)
  )
    invalid("安装版设备信息无效");
  const proof = await digest(input.device_secret);
  const existing = await first(
    db,
    "SELECT * FROM chore_push_subscriptions WHERE provider='jpush' AND platform=? AND device_id=?",
    [input.platform, input.device_id],
  );
  // The app keeps an installation proof. A member token alone cannot steal another device.
  if (existing && existing.device_secret_hash !== proof)
    fail(403, "device_mismatch", "请使用这台设备自己的通知配置");
  if (path.endsWith("/subscribe")) {
    if (!configured[input.platform])
      fail(503, "native_unconfigured", "安装版推送尚未配置，站内提醒仍可使用");
    if (
      typeof input.registration_id !== "string" ||
      !/^[A-Za-z0-9_-]{8,256}$/.test(input.registration_id)
    )
      invalid("推送设备尚未注册");
    const endpoint = `jpush:${input.platform}:${input.registration_id}`;
    const other = await first(
      db,
      "SELECT * FROM chore_push_subscriptions WHERE endpoint=?",
      [endpoint],
    );
    if (
      other &&
      (other.device_id !== input.device_id ||
        other.device_secret_hash !== proof)
    )
      fail(403, "device_mismatch", "设备注册信息不匹配");
    if (
      existing?.is_active &&
      existing.dorm_id === room.id &&
      existing.user_id === who.user_id &&
      existing.endpoint === endpoint
    )
      return json({ ok: true, enabled: true });
    const { state } = await maintain(db, room, now);
    const mutation = new Mutation(
      db,
      room,
      state.version,
      who,
      false,
      "((SELECT count(*) FROM chore_push_subscriptions WHERE dorm_id=? AND user_id=? AND is_active=1)<8 OR EXISTS(SELECT 1 FROM chore_push_subscriptions WHERE provider='jpush' AND platform=? AND device_id=?))",
      [room.id, who.user_id, input.platform, input.device_id],
    );
    mutation.raw(
      `INSERT INTO chore_push_subscriptions(dorm_id,user_id,endpoint,p256dh,auth,is_active,created_at,updated_at,provider,platform,device_id,device_secret_hash)
      SELECT ?,?,?, '','',1,?,?,'jpush',?,?,? WHERE ${mutation.guard}
      ON CONFLICT(provider,platform,device_id) WHERE device_id IS NOT NULL DO UPDATE SET dorm_id=excluded.dorm_id,user_id=excluded.user_id,endpoint=excluded.endpoint,is_active=1,revision=revision+1,updated_at=excluded.updated_at
      WHERE chore_push_subscriptions.device_secret_hash=excluded.device_secret_hash`,
      [
        room.id,
        who.user_id,
        endpoint,
        now.toISOString(),
        now.toISOString(),
        input.platform,
        input.device_id,
        proof,
        ...mutation.guardValues,
      ],
    );
    const result = await mutation.finish();
    if (!changes(result[1]))
      fail(409, "device_changed", "设备信息已变化，请重试");
    return json({ ok: true, enabled: true });
  }
  if (
    !existing ||
    existing.dorm_id !== room.id ||
    existing.user_id !== who.user_id
  )
    fail(403, "not_recipient", "只能管理自己的设备通知");
  const { state } = await maintain(db, room, now);
  if (path.endsWith("/unsubscribe")) {
    const mutation = new Mutation(db, room, state.version, who);
    mutation.update(
      "chore_push_subscriptions",
      {
        is_active: 0,
        revision: existing.revision + 1,
        updated_at: now.toISOString(),
      },
      "id=? AND device_secret_hash=?",
      [existing.id, proof],
    );
    await mutation.finish();
    return json({ ok: true, enabled: false });
  }
  if (!configured[input.platform])
    fail(503, "native_unconfigured", "安装版推送尚未配置");
  if (!existing.is_active)
    fail(409, "device_missing", "请先开启这台设备的通知");
  const cutoff = new Date(now.getTime() - 60000).toISOString();
  if (
    await first(
      db,
      "SELECT id FROM chore_push_jobs WHERE subscription_id=? AND kind='test' AND created_at>?",
      [existing.id, cutoff],
    )
  )
    fail(429, "push_cooldown", "等一分钟再发送测试通知");
  const mutation = new Mutation(
    db,
    room,
    state.version,
    who,
    false,
    "NOT EXISTS(SELECT 1 FROM chore_push_jobs WHERE subscription_id=? AND kind='test' AND created_at>?)",
    [existing.id, cutoff],
  );
  mutation.raw(
    `INSERT INTO chore_push_jobs(dorm_id,user_id,subscription_id,subscription_revision,kind,next_attempt_at,created_at) SELECT ?,?,?,?,'test',?,? WHERE ${mutation.guard}`,
    [
      room.id,
      who.user_id,
      existing.id,
      existing.revision,
      now.toISOString(),
      now.toISOString(),
      ...mutation.guardValues,
    ],
  );
  await mutation.finish();
  env.PUSH_WAKE?.();
  return json({ ok: true, queued: true }, 202);
}
export async function handleChores(request, env, now) {
  const db = env.DB,
    url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/chores/claim" && method === "POST")
    return claim(request, db, env, now);
  if (path === "/chores/activity" && method === "GET")
    return activity(request, db, env, now, url);
  if (path === "/chores/board" && method === "GET")
    return board(request, db, env, now, url);
  if (path.startsWith("/chores/calendar/"))
    return calendarFeed(request, { db, now, maintain });
  const who = await actor(request, db, now, true);
  assertWrite(who);
  const room = await roomByActor(db, who);
  if (path === "/chores/history")
    return historyChange(request, db, room, who, now);
  if (path === "/chores/calendar-subscription")
    return calendarSettings(request, { db, room, who, now });
  if (path === "/chores/reminder-plan")
    return reminderPlan(request, db, room, who, now);
  if (path.startsWith("/chores/native/"))
    return nativePush(request, db, room, who, now, env, path);
  if (path.startsWith("/chores/push/"))
    return memberPush(request, db, room, who, now, env, path);
  if (path === "/chores/order" && method === "PATCH")
    return configure(request, db, room, who, now, true);
  if (path === "/chores/settings" && method === "PATCH")
    return configure(request, db, room, who, now);
  if (path === "/chores/marker" && method === "PATCH") {
    const input = await body(request, ["marker_id"], ["marker_id"]),
      marker = validateMarker(input.marker_id),
      { state } = await maintain(db, room, now);
    return json(await setMarker(db, room, who, marker, state));
  }
  const undoMatch = /^\/chores\/tasks\/(\d+)\/undo$/.exec(path);
  if (undoMatch && method === "PATCH")
    return undo(db, room, who, now, integer(Number(undoMatch[1])));
  const completeMatch = /^\/chores\/tasks\/(\d+)\/complete$/.exec(path);
  if (completeMatch && method === "PATCH")
    return complete(db, room, who, now, integer(Number(completeMatch[1])));
  if (path === "/chores/remind" && method === "POST")
    return remind(request, db, room, who, now, env);
  const readMatch = /^\/chores\/reminders\/(\d+)\/read$/.exec(path);
  if (readMatch && method === "PATCH") {
    const id = integer(Number(readMatch[1])),
      row = await first(db, "SELECT * FROM chore_reminders WHERE id=?", [id]);
    if (!row) fail(404, "reminder_missing", "提醒不存在");
    if (row.dorm_id !== room.id || row.target_member_id !== who.user_id)
      fail(403, "not_recipient", "只能标记发给自己的提醒");
    await stmt(
      db,
      "UPDATE chore_reminders SET read_at=COALESCE(read_at,?) WHERE id=? AND dorm_id=? AND target_member_id=?",
      [now.toISOString(), id, room.id, who.user_id],
    ).run();
    return json({ ok: true, read_at: row.read_at || now.toISOString() });
  }
  fail(404, "not_found", "接口不存在");
}

export { maintain as maintainChores };
