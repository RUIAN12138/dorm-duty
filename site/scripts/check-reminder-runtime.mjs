// Real HTTP + file SQLite + scheduler timer, using an isolated child clock and no push credentials.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { SQLiteD1 } from "../local/sqlite-d1.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "dorm-reminder-runtime-"),
);
const database = path.join(directory, "runtime.sqlite"),
  clock = path.join(directory, "clock.txt"),
  hook = path.join(directory, "clock.mjs");
let child,
  assertions = 0;
const eq = (a, b, message) => {
  assertions++;
  assert.deepEqual(a, b, message);
};
const setClock = async (value) => {
  await fs.writeFile(`${clock}.next`, value);
  await fs.rename(`${clock}.next`, clock);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start() {
  child = spawn(
    process.execPath,
    ["--import", hook, "scripts/local-server.mjs"],
    {
      cwd: root,
      env: {
        ...process.env,
        DORM_DEPLOYMENT: "local",
        DORM_LOCAL_PORT: "0",
        DORM_LOCAL_HOST: "127.0.0.1",
        DORM_WEB_BASE: "/",
        DORM_LOCAL_DATABASE: database,
        DORM_TEST_CLOCK_FILE: clock,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Isolated runtime did not become ready")),
      10000,
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Isolated runtime exited before readiness"));
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /LOCAL_READY (\{[^\n]+\})/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${JSON.parse(match[1]).port}`);
      }
    });
    child.stderr.resume();
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const process = child,
    exited = once(process, "exit");
  process.kill("SIGTERM");
  const timer = setTimeout(() => process.kill("SIGKILL"), 8000);
  try {
    const [code] = await exited;
    eq(code, 0, "Runtime closes gracefully");
  } finally {
    clearTimeout(timer);
    child = null;
  }
}
async function api(
  origin,
  route,
  { token, data, method = data ? "POST" : "GET", status = 200 } = {},
) {
  const response = await fetch(origin + route, {
    method,
    signal: AbortSignal.timeout(5000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  eq(response.status, status, route.split("?")[0]);
  return response.json();
}
function count() {
  const db = new SQLiteD1(database);
  try {
    return db.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM chore_reminders WHERE source='scheduled'",
      )
      .get().n;
  } finally {
    db.close();
  }
}
try {
  await fs.writeFile(
    hook,
    `import {readFileSync} from 'node:fs'; const RealDate=Date; globalThis.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[RealDate.parse(readFileSync(process.env.DORM_TEST_CLOCK_FILE,'utf8'))]));} static now(){return RealDate.parse(readFileSync(process.env.DORM_TEST_CLOCK_FILE,'utf8'));} };`,
  );
  await setClock("2026-10-15T07:59:00+08:00");
  let origin = await start();
  const room = await api(origin, "/guest/create", {
    data: { name: "独立后台调度测试", nickname: "甲", members: ["乙"] },
    status: 201,
  });
  const token = room.access_token;
  await api(origin, "/chores/reminder-plan", {
    token,
    method: "PATCH",
    data: { enabled: true, times: ["08:00"], version: 0 },
  });
  await setClock("2026-10-15T08:05:00+08:00");
  // No browser and no board polling: the Node timer alone must create the reminder.
  const deadline = performance.now() + 40000;
  while (count() === 0 && performance.now() < deadline) await sleep(200);
  eq(
    count(),
    1,
    "Node background timer generated a reminder without a page visit",
  );
  const route = `/chores/board?invite_code=${room.invite_code}&member_id=${room.member_id}`;
  eq((await api(origin, route, { token })).reminders[0].source, "scheduled");
  eq(
    (await api(origin, "/chores/reminder-plan", { token })).last_reminder
      .devices,
    0,
  );
  await stop();
  eq(
    await fs.stat(database + ".server-lock").then(
      () => true,
      () => false,
    ),
    false,
  );
  await setClock("2026-10-15T08:06:00+08:00");
  origin = await start();
  eq((await api(origin, route, { token })).member.user_id, room.member_id);
  eq(count(), 1, "Same-day restart does not duplicate");
  await stop();
  await setClock("2026-10-16T08:05:00+08:00");
  origin = await start();
  const after = await api(origin, route, { token });
  eq(after.reminders.length, 2);
  eq(count(), 2, "Next-day startup catches up once");
  eq(after.member.user_id, room.member_id);
  await stop();
  console.log(
    JSON.stringify(
      {
        status: "passed",
        assertions,
        scope:
          "real Node HTTP service, file SQLite, autonomous 30-second timer and two restarts",
        excludes: "real provider or phone notification delivery",
      },
      null,
      2,
    ),
  );
} finally {
  await stop();
  await fs.rm(directory, { recursive: true, force: true });
}
