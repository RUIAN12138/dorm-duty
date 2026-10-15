import { renderCalendar } from "../shared/ical.mjs";

export class CalendarError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
const fail = (status, code, message) => {
  throw new CalendarError(status, code, message);
};
const stmt = (db, sql, values = []) => db.prepare(sql).bind(...values);
const first = (db, sql, values = []) => stmt(db, sql, values).first();
const encoder = new TextEncoder();
async function hash(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const random = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
const view = (row) => ({
  enabled: Boolean(row?.enabled),
  include_alarms: Boolean(row?.include_alarms),
  version: row?.version || 0,
  updated_at: row?.updated_at || null,
});
const liveMember = `EXISTS(SELECT 1 FROM dorm_members m JOIN users u ON u.id=m.user_id JOIN dormitories d ON d.id=m.dorm_id
  WHERE m.dorm_id=? AND m.user_id=? AND m.is_active=1 AND u.current_dorm_id=m.dorm_id AND d.is_demo=0)`;

export async function calendarSettings(request, { db, room, who, now }) {
  const current = await first(
    db,
    "SELECT * FROM chore_calendar_subscriptions WHERE dorm_id=? AND user_id=?",
    [room.id, who.user_id],
  );
  if (request.method === "GET") return json(view(current));
  if (!["POST", "PATCH", "DELETE"].includes(request.method))
    fail(404, "not_found", "接口不存在");
  const text = await request.text();
  if (text.length > 2048) fail(413, "body_too_large", "提交内容过长");
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    fail(422, "validation_error", "请检查订阅设置");
  }
  const allowed =
    request.method === "POST" || request.method === "PATCH"
      ? ["version", "include_alarms"]
      : ["version"];
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k)) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 0 ||
    (["POST", "PATCH"].includes(request.method) &&
      typeof input.include_alarms !== "boolean")
  )
    fail(422, "validation_error", "请检查订阅设置");
  if (input.version !== (current?.version || 0))
    fail(409, "calendar_changed", "订阅设置已变化，请重新读取");
  const sessionHash = await hash(request.headers.get("Authorization").slice(7));
  const sessionTable = who.scoped ? "member_sessions" : "sessions";
  const liveSession = `EXISTS(SELECT 1 FROM ${sessionTable} s WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>?${who.scoped ? " AND s.dorm_id=?" : ""})`;
  const guard = `${liveMember} AND ${liveSession}`;
  const values = [
    room.id,
    who.user_id,
    sessionHash,
    who.user_id,
    now.toISOString(),
    ...(who.scoped ? [room.id] : []),
  ];
  if (request.method === "PATCH") {
    if (!current?.enabled)
      fail(409, "calendar_changed", "日历订阅已关闭，请重新读取");
    if (input.include_alarms) {
      const plan = await first(
        db,
        "SELECT enabled FROM chore_reminder_preferences WHERE dorm_id=? AND user_id=?",
        [room.id, who.user_id],
      );
      if (!plan?.enabled)
        fail(422, "reminder_plan_required", "请先在定时提醒中设置时间");
    }
    const result = await stmt(
      db,
      `UPDATE chore_calendar_subscriptions SET include_alarms=?,version=version+1,updated_at=? WHERE id=? AND enabled=1 AND version=? AND ${guard}`,
      [
        Number(input.include_alarms),
        now.toISOString(),
        current.id,
        input.version,
        ...values,
      ],
    ).run();
    if (Number(result.meta?.changes) !== 1)
      fail(409, "calendar_changed", "身份或订阅设置已变化，请重新读取");
    return json(
      view({
        ...current,
        include_alarms: Number(input.include_alarms),
        version: current.version + 1,
        updated_at: now.toISOString(),
      }),
    );
  }
  if (request.method === "DELETE") {
    if (!current?.enabled) return json(view(current));
    const result = await stmt(
      db,
      `UPDATE chore_calendar_subscriptions SET enabled=0,token_hash=NULL,version=version+1,updated_at=?,last_fetched_at=NULL WHERE id=? AND version=? AND ${guard}`,
      [now.toISOString(), current.id, input.version, ...values],
    ).run();
    if (Number(result.meta?.changes) !== 1)
      fail(409, "calendar_changed", "身份或订阅设置已变化，请重新读取");
    return json(
      view({
        ...current,
        enabled: 0,
        version: current.version + 1,
        updated_at: now.toISOString(),
      }),
    );
  }
  if (
    current?.enabled &&
    now.getTime() - new Date(current.created_at).getTime() < 60000
  )
    fail(429, "calendar_cooldown", "请等一分钟后再更换订阅地址");
  if (input.include_alarms) {
    const plan = await first(
      db,
      "SELECT enabled FROM chore_reminder_preferences WHERE dorm_id=? AND user_id=?",
      [room.id, who.user_id],
    );
    if (!plan?.enabled)
      fail(422, "reminder_plan_required", "请先在定时提醒中设置时间");
  }
  const token = random(),
    tokenHash = await hash(token);
  const result = await stmt(
    db,
    `INSERT INTO chore_calendar_subscriptions(dorm_id,user_id,token_hash,enabled,include_alarms,version,created_at,updated_at)
    SELECT ?,?,?,1,?,1,?,? WHERE COALESCE((SELECT version FROM chore_calendar_subscriptions WHERE dorm_id=? AND user_id=?),0)=? AND ${guard}
    ON CONFLICT(dorm_id,user_id) DO UPDATE SET token_hash=excluded.token_hash,enabled=1,include_alarms=excluded.include_alarms,version=chore_calendar_subscriptions.version+1,created_at=excluded.created_at,updated_at=excluded.updated_at,last_fetched_at=NULL WHERE chore_calendar_subscriptions.version=?`,
    [
      room.id,
      who.user_id,
      tokenHash,
      Number(input.include_alarms),
      now.toISOString(),
      now.toISOString(),
      room.id,
      who.user_id,
      input.version,
      ...values,
      input.version,
    ],
  ).run();
  if (Number(result.meta?.changes) !== 1)
    fail(409, "calendar_changed", "身份或订阅设置已变化，请重新读取");
  return json({
    ...view({
      enabled: 1,
      include_alarms: input.include_alarms,
      version: input.version + 1,
      updated_at: now.toISOString(),
    }),
    path: `/chores/calendar/${token}.ics`,
  });
}

export async function calendarFeed(request, { db, now, maintain }) {
  const match = /^\/chores\/calendar\/([a-f0-9]{64})\.ics$/.exec(
    new URL(request.url).pathname,
  );
  const missing = () =>
    new Response(request.method === "HEAD" ? null : "订阅不存在或已撤销", {
      status: 404,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  if (!match || !["GET", "HEAD"].includes(request.method)) return missing();
  const tokenHash = await hash(match[1]);
  const read = () =>
    first(
      db,
      `SELECT s.* FROM chore_calendar_subscriptions s WHERE s.token_hash=? AND s.enabled=1 AND ${liveMember}`.replace(
        "m.dorm_id=? AND m.user_id=?",
        "m.dorm_id=s.dorm_id AND m.user_id=s.user_id",
      ),
      [tokenHash],
    );
  let subscription = await read();
  if (!subscription) return missing();
  const calendarHeaders = {
    ...headers,
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="lundao.ics"',
  };
  if (request.method === "HEAD")
    return new Response(null, { headers: calendarHeaders });
  const cutoff = new Date(now.getTime() - 10000).toISOString();
  const locked = await stmt(
    db,
    "UPDATE chore_calendar_subscriptions SET last_fetched_at=? WHERE id=? AND token_hash=? AND enabled=1 AND (last_fetched_at IS NULL OR last_fetched_at<=?)",
    [now.toISOString(), subscription.id, tokenHash, cutoff],
  ).run();
  if (!Number(locked.meta?.changes))
    return new Response("请稍后同步", {
      status: 429,
      headers: {
        ...headers,
        "Retry-After": "10",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  const room = await first(
    db,
    "SELECT * FROM dormitories WHERE id=? AND is_demo=0",
    [subscription.dorm_id],
  );
  if (!room) return missing();
  const { state } = await maintain(db, room, now);
  // Recheck revocation / room changes after asynchronous maintenance, before reading personal data.
  subscription = await read();
  if (!subscription) return missing();
  const today = new Date(now.getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const end = new Date(now.getTime() + 8 * 3600000 + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const tasks = (
    await stmt(
      db,
      `SELECT t.*,c.mode FROM chore_tasks t JOIN chore_categories c ON c.dorm_id=t.dorm_id AND c.key=t.key
    WHERE t.dorm_id=? AND t.assignee_id=? AND t.status='pending' AND t.key IN ('floor','toilet') AND c.enabled=1
    AND ((c.mode='scheduled' AND t.duty_date BETWEEN ? AND ?) OR (c.mode='self_round' AND t.duty_date<=? AND t.sequence=(SELECT MAX(x.sequence) FROM chore_tasks x WHERE x.dorm_id=t.dorm_id AND x.key=t.key))) ORDER BY t.duty_date,t.key LIMIT 64`,
      [subscription.dorm_id, subscription.user_id, today, end, today],
    ).all()
  ).results;
  const preference = await first(
    db,
    "SELECT * FROM chore_reminder_preferences WHERE dorm_id=? AND user_id=?",
    [subscription.dorm_id, subscription.user_id],
  );
  const plan = preference
    ? {
        enabled: Boolean(preference.enabled),
        times: JSON.parse(preference.times),
      }
    : null;
  if (!(await read())) return missing();
  const version =
    state.version +
    subscription.version +
    (preference?.version || 0) +
    Math.floor((now.getTime() + 8 * 3600000) / 86400000);
  const content = renderCalendar({
    tasks,
    today,
    now,
    version,
    alarms: Boolean(subscription.include_alarms),
    plan,
  });
  return new Response(content, { headers: calendarHeaders });
}
