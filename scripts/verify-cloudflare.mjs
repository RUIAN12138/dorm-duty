import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Usage: node scripts/verify-cloudflare.mjs https://your-worker.workers.dev
// Creates one uniquely named QA dorm; never reads local databases or credentials.
// Business tokens stay in memory. The evidence contains only safe summaries.
const root = fileURLToPath(new URL("../", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shanghaiDate = (iso) =>
  new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

export async function verifyCloudflare(rawOrigin, options = {}) {
  assert(rawOrigin, "必须显式提供 HTTPS origin 参数");
  const url = new URL(rawOrigin);
  assert.equal(url.protocol, "https:", "验收地址必须使用 HTTPS");
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    "origin 不能包含凭据、查询参数或 fragment",
  );
  assert.equal(url.pathname, "/", "请输入 origin，不要附加页面路径");
  const origin = url.origin;
  const base = options.base || "/";
  assert(/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base), "应用路径必须是 /路径/ 格式");
  const runtime = options.runtime || "cloudflare-worker";
  const storage = options.storage || "d1";
  const frontendDirectory =
    options.frontendDirectory || path.join(root, "frontend/dist");
  const targetUrl = (route) => new URL(base + route.replace(/^\//, ""), origin);
  // Injection is solely for disposable script validation. Such a run explicitly
  // records D1 as untested and cannot be confused with the normal remote CLI run.
  const request = options.request || globalThis.fetch;
  const isolated = request !== globalThis.fetch;
  const suffix = `${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const stamp = `${new Date().toISOString().replace(/[:.]/g, "-")}_${suffix}`;
  const evidenceDirectory = path.join(
    options.evidenceRoot || path.join(root, "docs/evidence/cloudflare"),
    stamp,
  );
  const checks = [],
    requests = [],
    secrets = [];
  let phase = "health",
    assertions = 0;
  const result = {
    date: new Date().toISOString(),
    origin,
    base,
    scope: isolated ? "isolated script validation" : `remote ${runtime} API`,
    runtime: "unverified",
    cloudD1: "not yet verified",
    physicalIphone: "not tested",
    browserRendering: "not tested; HTTP and API checks only",
    push: "not tested",
    workerBundleSha256: sha256(
      await fs.readFile(
        options.workerFile || path.join(root, "site/worker/index.js"),
      ),
    ),
  };
  function safe(error) {
    let text = String(error?.message || error);
    for (const secret of secrets)
      if (secret) text = text.split(secret).join("[redacted]");
    return text
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
      .replace(/\b[a-f0-9]{64}\b/gi, "[redacted]")
      .split("\n")[0]
      .slice(0, 600);
  }
  function equal(actual, expected, message) {
    assertions++;
    assert.deepEqual(actual, expected, message);
  }
  function ok(value, message) {
    assertions++;
    assert(value, message);
  }
  async function api(
    route,
    { token, method = "GET", data, status = 200 } = {},
  ) {
    const target = targetUrl(route);
    equal(target.origin, origin, "API 必须同源");
    const response = await request(target, {
      method,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    requests.push({ method, path: target.pathname, status: response.status });
    ok(
      /json/i.test(response.headers.get("content-type") || ""),
      `${target.pathname} 应返回 JSON，不能跳到平台登录页`,
    );
    ok(
      /(?:^|,)\s*no-store\b/i.test(response.headers.get("cache-control") || ""),
      `${target.pathname} 业务响应必须 no-store`,
    );
    const value = await response.json();
    if (typeof value?.access_token === "string")
      secrets.push(value.access_token);
    equal(response.status, status, `${target.pathname} HTTP 状态不符`);
    return value;
  }
  async function rawApi(route, options) {
    // Concurrent writes must not hide an unexpected response behind Promise.all.
    const target = targetUrl(route);
    equal(target.origin, origin, "并发 API 必须同源");
    const response = await request(target, {
      method: options.method,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      body: JSON.stringify(options.data || {}),
    });
    requests.push({
      method: options.method,
      path: target.pathname,
      status: response.status,
    });
    ok(/json/i.test(response.headers.get("content-type") || ""));
    ok(/no-store/i.test(response.headers.get("cache-control") || ""));
    return { status: response.status, body: await response.json() };
  }
  async function staticChecks() {
    const index = await fs.readFile(path.join(frontendDirectory, "index.html"));
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(frontendDirectory, "manifest.webmanifest"),
        "utf8",
      ),
    );
    const routes = ["/", "/water", "/calendar"];
    const resources = new Set([
      "/sw.js",
      "/manifest.webmanifest",
      "/marks/pixel-10.svg",
    ]);
    for (const match of index
      .toString("utf8")
      .matchAll(/(?:src|href)="(\/[^"?#]+)"/g))
      resources.add("/" + match[1].slice(base.length));
    for (const icon of manifest.icons || [])
      resources.add("/" + icon.src.slice(base.length));
    equal(manifest.scope, base, "PWA scope 必须限制在应用路径内");
    equal(manifest.start_url, base, "PWA 入口必须使用应用路径");
    for (const asset of await fs.readdir(
      path.join(frontendDirectory, "assets"),
    ))
      if (/^GuestHome-.*\.(?:js|css)$/.test(asset))
        resources.add(`/assets/${asset}`);
    for (const route of [...routes, ...resources]) {
      const target = targetUrl(route);
      equal(target.origin, origin, "资源必须同源");
      const response = await request(target, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      equal(response.status, 200, `${route} 应可直接访问`);
      const actual = Buffer.from(await response.arrayBuffer());
      const expected = routes.includes(route)
        ? index
        : await fs.readFile(path.join(frontendDirectory, route.slice(1)));
      equal(sha256(actual), sha256(expected), `${route} 与当前生产构建不一致`);
      if (routes.includes(route))
        ok(/html/i.test(response.headers.get("content-type") || ""));
      if (route === "/sw.js")
        equal(response.headers.get("service-worker-allowed"), base);
      requests.push({
        method: "GET",
        path: route,
        status: response.status,
        bytes: actual.length,
      });
    }
    result.staticResources = {
      pageCount: routes.length,
      assetCount: resources.size,
      matchingBuild: true,
    };
    checks.push(
      "三个深链接返回当前 SPA 构建；入口与任务页面 JS/CSS、PWA 图标、Manifest、SW 和像素标记逐字节一致",
    );
  }
  try {
    const health = await api("/health");
    equal(health.runtime, runtime, "后端运行环境标识必须正确");
    equal(health.storage, storage, "后端数据库标识必须正确");
    equal(health.status, "ok");
    ok(Number.isFinite(Date.parse(health.time)), "服务器时间应有效");
    result.runtime = health.runtime;
    result.cloudD1 = isolated
      ? "not tested; disposable injected adapter"
      : storage === "d1"
        ? "API uses remote d1 binding"
        : "not applicable; server SQLite";
    result.storage = storage;
    checks.push(
      `HTTPS 健康接口返回 ${runtime} / ${storage}，业务响应 no-store`,
    );
    phase = "static_resources";
    await staticChecks();
    phase = "create_and_claim";
    const created = await api("/guest/create", {
      method: "POST",
      status: 201,
      data: {
        name: `${storage === "d1" ? "Cloudflare" : "服务器"}验收_${suffix}`,
        nickname: "云端验收创建者",
        members: ["云端验收室友"],
        marker_id: "pixel-10",
      },
    });
    secrets.push(created.invite_code);
    ok(/^[a-f0-9]{64}$/i.test(created.access_token), "创建者令牌必须有效");
    const owner = { id: created.member_id, token: created.access_token };
    const roommateId = created.dorm.members.find(
      (member) => member.user_id !== owner.id,
    )?.user_id;
    ok(Number.isSafeInteger(roommateId), "必须有第二名成员");
    equal(created.dorm.members.length, 2);
    result.fixture = {
      dormId: created.dorm.id,
      name: created.dorm.name,
      memberCount: 2,
    };
    const claim = async (id, marker) => {
      const claimed = await api("/chores/claim", {
        method: "POST",
        status: 201,
        data: {
          invite_code: created.invite_code,
          member_id: id,
          marker_id: marker,
        },
      });
      equal(claimed.member.user_id, id);
      equal(claimed.member.marker_id, marker);
      equal(claimed.is_creator, false);
      ok(/^[a-f0-9]{64}$/i.test(claimed.access_token));
      return { id, token: claimed.access_token };
    };
    const ownerMember = await claim(owner.id, "pixel-10");
    const roommate = await claim(roommateId, "pixel-11");
    const board = (person, month) =>
      api(
        `/chores/board?invite_code=${encodeURIComponent(created.invite_code)}&member_id=${person.id}${month ? `&month=${month}` : ""}`,
        { token: person.token },
      );
    let ownerBoard = await board(owner);
    equal(ownerBoard.is_creator, true);
    equal((await board(ownerMember)).is_creator, false);
    equal((await board(roommate)).is_creator, false);
    equal(ownerBoard.member.marker_id, "pixel-10");
    equal((await board(roommate)).member.marker_id, "pixel-11");
    await api("/dorms/current", { token: roommate.token, status: 401 });
    checks.push(
      "免密码创建独立测试宿舍；两个成员领取不同图案和限定令牌，选创建者名字不授予管理权限",
    );
    phase = "configure_and_permissions";
    const ids = [owner.id, roommate.id];
    const changes = ownerBoard.categories.map((category) => ({
      key: category.key,
      content: {
        floor: "云端验收：扫地并拖地",
        toilet: "云端验收：刷洗便池和地漏",
        sink: "云端验收：刷洗池面与龙头",
        water: "云端验收：抬一桶饮用水",
      }[category.key],
      deadline_time: { floor: "20:15", toilet: "21:20", sink: "21:40", water: "18:35" }[
        category.key
      ],
      start_date: ownerBoard.today,
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      rotation_days: 2,
      rotation_order: [...ids].reverse(),
      enabled: true,
    }));
    const configure = {
      method: "PATCH",
      data: { version: ownerBoard.version, categories: changes },
    };
    await api("/chores/settings", {
      ...configure,
      token: roommate.token,
      status: 403,
    });
    await api("/chores/settings", {
      ...configure,
      token: ownerMember.token,
      status: 403,
    });
    await api("/chores/settings", { ...configure, status: 401 });
    await api("/chores/settings", { ...configure, token: owner.token });
    await api("/chores/settings", {
      ...configure,
      token: owner.token,
      status: 409,
    });
    ownerBoard = await board(owner);
    for (const expected of changes) {
      const actual = ownerBoard.categories.find(
        (category) => category.key === expected.key,
      );
      for (const key of Object.keys(expected))
        equal(actual[key], expected[key], `保存 ${expected.key}.${key}`);
    }
    checks.push(
      "创建者可配置三类内容、时间、开始日期、星期、连续天数和顺序；成员、匿名和过期版本被拒绝",
    );
    phase = "targeted_reminders";
    const floor = ownerBoard.today_tasks.find((task) => task.key === "floor");
    ok(floor, "创建者当天应有地板任务");
    const reminderData = { target_member_id: owner.id, task_id: floor.id };
    const simultaneousReminders = await Promise.all([
      rawApi("/chores/remind", {
        method: "POST",
        token: roommate.token,
        data: reminderData,
      }),
      rawApi("/chores/remind", {
        method: "POST",
        token: roommate.token,
        data: reminderData,
      }),
    ]);
    equal(
      simultaneousReminders.map((response) => response.status).sort(),
      [201, 429],
      "并发提醒应只发送一次",
    );
    const reminder = simultaneousReminders.find(
      (response) => response.status === 201,
    ).body;
    equal(reminder.target_member_id, owner.id);
    equal(reminder.sender_id, roommate.id);
    equal(reminder.task_id, floor.id);
    await api("/chores/remind", {
      method: "POST",
      token: roommate.token,
      data: reminderData,
      status: 429,
    });
    const received = (await board(ownerMember)).reminders.filter(
      (entry) => entry.id === reminder.id,
    );
    equal(received.length, 1);
    equal(received[0].read_at, null);
    equal(
      (await board(roommate)).reminders.some(
        (entry) => entry.id === reminder.id,
      ),
      false,
    );
    await api(`/chores/reminders/${reminder.id}/read`, {
      method: "PATCH",
      token: roommate.token,
      data: {},
      status: 403,
    });
    const read = await api(`/chores/reminders/${reminder.id}/read`, {
      method: "PATCH",
      token: ownerMember.token,
      data: {},
    });
    ok(read.ok && Number.isFinite(Date.parse(read.read_at)));
    equal(
      (
        await api(`/chores/reminders/${reminder.id}/read`, {
          method: "PATCH",
          token: ownerMember.token,
          data: {},
        })
      ).read_at,
      read.read_at,
    );
    equal(
      (await board(owner)).reminders.find((entry) => entry.id === reminder.id)
        ?.read_at,
      read.read_at,
    );
    checks.push(
      "定向提醒并发仅一条、60 秒限频、仅接收人可见及已读，重复已读时间保持",
    );
    phase = "daily_completion";
    const complete = (person, task, status = 200) =>
      api(`/chores/tasks/${task.id}/complete`, {
        method: "PATCH",
        token: person?.token,
        data: {},
        status,
      });
    await complete(roommate, floor, 403);
    await complete(null, floor, 401);
    const completedFloor = (await complete(ownerMember, floor)).task;
    equal(completedFloor.status, "completed");
    await complete(ownerMember, floor, 409);
    await api("/chores/remind", {
      method: "POST",
      token: roommate.token,
      data: reminderData,
      status: 409,
    });
    const toilet = (await board(roommate)).today_tasks.find(
      (task) => task.key === "toilet",
    );
    ok(toilet, "第二名成员当天应有厕所任务");
    await complete(ownerMember, toilet, 403);
    const completedToilet = (await complete(roommate, toilet)).task;
    equal(completedToilet.status, "completed");
    await complete(roommate, toilet, 409);
    checks.push(
      "地板与厕所本人打卡记录服务器时间；替人、匿名和重复打卡被拒绝，已完成任务不能再提醒",
    );
    phase = "water_concurrency";
    const water = (await board(ownerMember)).water_task;
    equal(water.assignee_id, owner.id);
    await complete(roommate, water, 403);
    const simultaneousWater = await Promise.all([
      rawApi(`/chores/tasks/${water.id}/complete`, {
        method: "PATCH",
        token: ownerMember.token,
      }),
      rawApi(`/chores/tasks/${water.id}/complete`, {
        method: "PATCH",
        token: ownerMember.token,
      }),
    ]);
    equal(
      simultaneousWater.map((response) => response.status).sort(),
      [200, 409],
      "并发抬水应只有一次成功",
    );
    const completedWater = simultaneousWater.find(
      (response) => response.status === 200,
    ).body.task;
    const afterWater = await board(ownerMember);
    equal(afterWater.water_task.sequence, water.sequence + 1);
    equal(afterWater.water_task.assignee_id, roommate.id);
    ok(afterWater.water_task.id !== water.id);
    const nextFromRoommate = (await board(roommate)).water_task;
    equal(
      nextFromRoommate.id,
      afterWater.water_task.id,
      "另一成员刷新看到同一新轮次",
    );
    equal(nextFromRoommate.can_complete, true);
    const secondWater = (await complete(roommate, nextFromRoommate)).task;
    const secondAdvance = (await board(ownerMember)).water_task;
    equal(secondAdvance.sequence, water.sequence + 2);
    equal(secondAdvance.assignee_id, owner.id);
    checks.push(
      "实际后端抬水并发仅一次完成、序号仅加一；下一成员同步领取，第二轮完成后回到创建者",
    );
    phase = "calendar_and_refresh";
    const completed = [
      completedFloor,
      completedToilet,
      completedWater,
      secondWater,
    ];
    const monthSet = new Set(
      completed.map((task) => shanghaiDate(task.completed_at).slice(0, 7)),
    );
    const calendar = [];
    for (const month of monthSet) {
      const a = await board(ownerMember, month),
        b = await board(roommate, month);
      equal(a.calendar, b.calendar, "不同成员刷新获得同一完成日历");
      equal(
        (await board(owner, month)).calendar,
        a.calendar,
        "新 HTTP 请求恢复同一完成历史",
      );
      calendar.push(...a.calendar);
    }
    equal(calendar.length, completed.length);
    for (const task of completed) {
      const records = calendar.filter((entry) => entry.id === task.id);
      equal(records.length, 1, "每个完成任务在日历只有一条");
      equal(records[0].completed_at, task.completed_at);
      equal(records[0].completed_date, shanghaiDate(task.completed_at));
      equal(
        records[0].marker_id,
        task.assignee_id === owner.id ? "pixel-10" : "pixel-11",
      );
      equal(records[0].assignee_id, task.assignee_id);
      ok(Number.isFinite(Date.parse(task.completed_at)));
      ok(
        Date.parse(task.completed_at) >= Date.parse(health.time),
        "打卡时间由本轮服务器生成",
      );
    }
    equal(new Set(calendar.map((entry) => entry.marker_id)).size, 2);
    checks.push(
      "四条完成记录按上海完成日期进入日历，各成员图案保持；跨令牌和全新 HTTP 读取一致",
    );
    phase = "final_health";
    const finalHealth = await api("/health");
    equal(finalHealth.runtime, runtime);
    equal(finalHealth.storage, storage);
    for (const task of completed)
      ok(Date.parse(task.completed_at) <= Date.parse(finalHealth.time));
    result.completionSummary = {
      total: completed.length,
      floor: 1,
      toilet: 1,
      water: 2,
      uniqueMarks: 2,
      waterAdvances: 2,
    };
    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.failure = { phase, message: safe(error) };
    process.exitCode = 1;
  } finally {
    result.finishedAt = new Date().toISOString();
    result.assertions = assertions;
    result.checks = checks;
    result.requests = requests;
    await fs.mkdir(evidenceDirectory, { recursive: true });
    const destination = path.join(evidenceDirectory, "api.json");
    await fs.writeFile(destination, JSON.stringify(result, null, 2) + "\n");
    console.log(
      JSON.stringify({
        status: result.status,
        scope: result.scope,
        assertions,
        groups: checks.length,
        evidence: destination,
        ...(result.failure ? { failure: result.failure } : {}),
      }),
    );
    secrets.fill("");
  }
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verifyCloudflare(process.argv[2]);
}
