// Queue/credit persistence is kept outside the chore routes. All writes join the
// caller's version-guarded transaction, including consumed advance credits.
const first = (db, sql, values) =>
  db
    .prepare(sql)
    .bind(...values)
    .first();
export function rotateWaterQueue(order, head) {
  const index = Math.max(0, order.indexOf(head));
  return [...order.slice(index), ...order.slice(0, index)];
}
export async function readWaterFlow(db, room, order, head) {
  const row = await first(
    db,
    "SELECT * FROM chore_water_flow WHERE dorm_id=?",
    [room.id],
  );
  let saved;
  try {
    saved = JSON.parse(row?.queue || "null");
  } catch {
    /* rebuild safely */
  }
  const previousMembers = Array.isArray(saved?.members) ? saved.members : order;
  let queue = Array.isArray(saved?.pending)
    ? saved.pending
    : Array.isArray(saved)
      ? saved
      : order.slice(Math.max(0, order.indexOf(head)));
  queue = [...new Set(queue.filter((id) => order.includes(id)))];
  // An absent old member is already done this cycle; only newly joined members
  // are appended. Completed people must not reappear before skipped people.
  for (const id of order)
    if (!previousMembers.includes(id) && !queue.includes(id)) queue.push(id);
  if (!queue.includes(head)) queue.unshift(head);
  return { queue: rotateWaterQueue(queue, head), row };
}
export function saveWaterFlow(
  mutation,
  queue,
  handoff = null,
  undo = null,
  members = queue,
) {
  mutation.raw(
    `INSERT INTO chore_water_flow(dorm_id,queue,handoff,undo_state)
    SELECT ?,?,?,? WHERE ${mutation.guard}
    ON CONFLICT(dorm_id) DO UPDATE SET queue=excluded.queue,handoff=excluded.handoff,undo_state=excluded.undo_state`,
    [
      mutation.room.id,
      JSON.stringify({ pending: queue, members }),
      handoff && JSON.stringify(handoff),
      undo && JSON.stringify(undo),
      ...mutation.guardValues,
    ],
  );
}

export async function advanceWaterQueue({
  db,
  room,
  category,
  task,
  members,
  mutation,
  now,
  appendRows,
  plannedRow,
  localDate,
  completed,
  initialQueue,
}) {
  const { queue: before } = await readWaterFlow(
    db,
    room,
    category.rotation_order,
    task.assignee_id,
  );
  const queue = initialQueue
    ? [...initialQueue]
    : completed
      ? before.slice(1)
      : [...before.slice(1), before[0]];
  const resetAfter = (uid) =>
    rotateWaterQueue(
      category.rotation_order,
      category.rotation_order[
        (category.rotation_order.indexOf(uid) + 1) %
          category.rotation_order.length
      ],
    );
  if (!queue.length) queue.push(...resetAfter(task.assignee_id));
  const credits =
    (
      await db
        .prepare(
          `SELECT c.*,t.completed_at FROM chore_water_credits c JOIN chore_tasks t ON t.id=c.task_id
    WHERE c.dorm_id=? AND c.status='pending' AND t.status='completed'`,
        )
        .bind(room.id)
        .all()
    ).results || [];
  const steps = [],
    used = [];
  let sequence = task.sequence + 1;
  // At most one outstanding credit per active member, so this loop is bounded.
  for (let i = 0; i < members.length; i++) {
    const credit = credits.find(
      (c) => c.user_id === queue[0] && !used.includes(c.id),
    );
    if (!credit) break;
    used.push(credit.id);
    steps.push({
      member_id: credit.user_id,
      task_id: credit.task_id,
      completed_at: credit.completed_at,
    });
    mutation.update(
      "chore_water_credits",
      { status: "consumed", consumed_by: task.id },
      "id=? AND status='pending'",
      [credit.id],
    );
    const finished = queue.shift();
    if (!queue.length) queue.push(...resetAfter(finished));
    sequence++;
  }
  const day =
    localDate(now) > category.start_date ? localDate(now) : category.start_date;
  appendRows(
    mutation,
    [plannedRow(room, category, day, queue[0], members, sequence)],
    true,
  );
  const handoff =
    completed || steps.length
      ? {
          id: task.id,
          sequence: sequence - 1,
          from_member_id: task.assignee_id,
          completed_at: now.toISOString(),
          steps,
          target_sequence: sequence,
        }
      : null;
  saveWaterFlow(
    mutation,
    queue,
    handoff,
    completed
      ? { task_id: task.id, before, credits: used, target_sequence: sequence }
      : { blocked: true },
    category.rotation_order,
  );
  return handoff;
}

export function publicWaterHandoff(event) {
  if (!event) return null;
  const { target_sequence, steps, ...result } = event;
  return steps?.length ? { ...result, steps } : result;
}
