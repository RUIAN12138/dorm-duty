import assert from "node:assert/strict";
import { createHarness } from "./check-cloud-backend.mjs";
const h = await createHarness();
let batches = 0,
  writeStatements = 0,
  queries = 0;
const prepare = h.db.prepare.bind(h.db),
  batch = h.db.batch.bind(h.db);
h.db.prepare = (sql) => {
  const wrap = (statement) =>
    new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...values) => wrap(target.bind(...values));
        if (["first", "all", "run", "raw"].includes(key))
          return (...args) => {
            queries++;
            if (!/^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(sql))
              writeStatements++;
            return target[key](...args);
          };
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  return wrap(prepare(sql));
};
h.db.batch = async (statements) => {
  batches++;
  writeStatements += statements.filter(
    (s) => !/^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(s.sql),
  ).length;
  return batch(statements);
};
const call = async (path, opts = {}) => {
  const r = await h.request(path, opts);
  assert.equal(r.status, opts.expected || 200);
  return r.json();
};
try {
  const created = await call("/guest/create", {
    method: "POST",
    expected: 201,
    data: { name: "轮询成本验收", nickname: "甲", members: ["乙", "丙"] },
  });
  const token = created.access_token,
    route = `/chores/board?invite_code=${created.invite_code}&member_id=${created.member_id}`;
  let board = await call(route, { token });
  batches = writeStatements = queries = 0;
  const start = performance.now();
  for (let i = 0; i < 20; i++) {
    const next = await call(route, { token });
    assert.equal(next.version, board.version);
  }
  const polling = {
    requests: 20,
    batches,
    writeStatements,
    queries,
    totalMs: Math.round(performance.now() - start),
  };
  batches = writeStatements = queries = 0;
  const beforeTasks = h.db.sqlite
    .prepare("SELECT * FROM chore_tasks ORDER BY id")
    .all();
  await call("/chores/order", {
    method: "PATCH",
    token,
    data: {
      version: board.version,
      key: "floor",
      rotation_order: [
        ...board.categories.find((c) => c.key === "floor").rotation_order,
      ].reverse(),
    },
  });
  const reorder = { batches, writeStatements, queries };
  assert.deepEqual(
    h.db.sqlite.prepare("SELECT * FROM chore_tasks ORDER BY id").all(),
    beforeTasks,
  );
  // The order fast path must still replan scheduled pending tasks.
  board = await call(route, { token });
  const floor = board.categories.find((c) => c.key === "floor");
  await call("/chores/settings", {
    method: "PATCH",
    token,
    data: {
      version: board.version,
      categories: [{ ...floor, mode: "scheduled" }],
    },
  });
  board = await call(route, { token });
  const plannedBefore = h.db.sqlite
    .prepare(
      "SELECT duty_date,assignee_id FROM chore_tasks WHERE key='floor' AND status='pending' ORDER BY duty_date",
    )
    .all();
  await call("/chores/order", {
    method: "PATCH",
    token,
    data: {
      version: board.version,
      key: "floor",
      rotation_order: [
        ...board.categories.find((c) => c.key === "floor").rotation_order,
      ].reverse(),
    },
  });
  const plannedAfter = h.db.sqlite
    .prepare(
      "SELECT duty_date,assignee_id FROM chore_tasks WHERE key='floor' AND status='pending' ORDER BY duty_date",
    )
    .all();
  assert.equal(plannedAfter.length, plannedBefore.length);
  assert.notDeepEqual(
    plannedAfter,
    plannedBefore,
    "scheduled order still replans pending dates",
  );
  console.log(
    JSON.stringify(
      {
        polling,
        reorder,
        mode: process.env.DORM_COST_BASELINE ? "baseline" : "regression",
      },
      null,
      2,
    ),
  );
  if (!process.env.DORM_COST_BASELINE) {
    assert.equal(
      polling.batches,
      0,
      "initialized GET polling never opens a write transaction",
    );
    assert.equal(
      polling.writeStatements,
      0,
      "initialized GET polling executes no DML",
    );
    assert.equal(reorder.batches, 1, "order-only save needs one atomic batch");
    assert.equal(
      reorder.writeStatements,
      2,
      "voluntary reorder only updates version and order",
    );
  }
} finally {
  await h.close();
}
