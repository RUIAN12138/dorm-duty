import {
  configuredTaskPolicy,
  canCompleteTaskWithRules,
} from "../../../../../site/shared/dorm-configuration.mjs";
const copy = (value) => JSON.parse(JSON.stringify(value));
const negative = (id) => Number.isSafeInteger(id) && id < 0;
const dayOf = (date) =>
  new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);

/** Canonical local state. No network, tokens, storage, timers or real IDs. */
export function createDraftSandbox(input, now = () => new Date()) {
  const initial = copy(input);
  if (
    initial.configuration?.schema_version !== 2 ||
    !negative(initial.member?.user_id) ||
    !initial.members?.length ||
    initial.members.some((member) => !negative(member.user_id))
  )
    throw Error("草稿预览只能使用独立的模拟成员");
  const members = initial.members,
    actor = initial.member.user_id;
  if (
    !members.some((member) => member.user_id === actor) ||
    new Set(members.map((member) => member.user_id)).size !== members.length
  )
    throw Error("请检查草稿预览的模拟身份");
  for (const item of initial.categories.filter(
    (category) => category.enabled,
  )) {
    if (
      !initial.configuration.tasks.some(
        (task) => task.key === item.key && task.enabled,
      ) ||
      !item.rotation_order?.length ||
      item.rotation_order.some(
        (id) => !members.some((member) => member.user_id === id),
      )
    )
      throw Error("请检查草稿预览的任务和轮换成员");
  }
  const source = initial.workspace_tasks || [];
  if (
    source.some(
      (task) =>
        !negative(task.id) ||
        !members.some((member) => member.user_id === task.assignee_id),
    ) ||
    new Set(source.map((task) => task.id)).size !== source.length ||
    initial.calendar.some((record) => !negative(record.id)) ||
    initial.reminders.some((note) => !negative(note.id))
  )
    throw Error("草稿预览不能使用正式任务或记录");
  const tasks = new Map(source.map((task) => [task.id, copy(task)]));
  const active = new Set(tasks.keys());
  const history = new Map(
    initial.calendar.map((record) => [record.id, copy(record)]),
  );
  const nudges = new Map(),
    noteTimes = new Map(),
    notes = [];
  const reminders = copy(initial.reminders);
  let version = initial.version;
  let handoff = initial.water_handoff || null;
  let nextId =
    Math.min(
      -1,
      ...source.map((task) => task.id),
      ...initial.calendar.map((record) => record.id),
      ...reminders.map((note) => note.id),
    ) - 1;
  const events = { complete: 0, undo: 0, nudge: 0, note: 0, read: 0 };
  function category(key) {
    const found = initial.categories.find((item) => item.key === key);
    if (!found?.enabled) throw Error("这项模拟任务已停用");
    return found;
  }
  function view(task, at = now()) {
    const config = initial.configuration.tasks.find(
      (item) => item.key === task.key,
    );
    const rules = configuredTaskPolicy(config, initial.configuration);
    const result = copy(task);
    result.can_complete = canCompleteTaskWithRules(
      result,
      {
        enabled: category(task.key).enabled,
        version2: true,
        hardPolicy: rules.hard,
        executionTime: rules.executionTime,
      },
      { user_id: actor },
      dayOf(at),
      at.toISOString(),
    );
    return result;
  }
  function owned(id) {
    if (!negative(id) || !tasks.has(id))
      throw Error("这不是当前草稿的模拟任务");
    return tasks.get(id);
  }
  function record(task) {
    history.set(task.id, {
      id: task.id,
      key: task.key,
      name: task.name,
      assignee_id: task.assignee_id,
      assignee_name: task.assignee_name,
      marker_id: task.marker_id,
      completed_at: task.completed_at,
      completed_date: dayOf(new Date(task.completed_at)),
    });
  }
  function current(key) {
    return [...active]
      .map((id) => tasks.get(id))
      .filter((task) => task.key === key);
  }
  function spawn(template, member, sequence) {
    const task = {
      ...copy(template),
      id: nextId--,
      sequence,
      assignee_id: member.user_id,
      assignee_name: member.nickname,
      marker_id: member.marker_id,
      status: "pending",
      completed_at: null,
      completed_by: null,
      can_complete: false,
    };
    tasks.set(task.id, task);
    active.add(task.id);
    return task;
  }
  function complete(candidate) {
    const task = owned(candidate?.id);
    if (!active.has(task.id) || !view(task).can_complete)
      throw Error("当前不能完成这项模拟任务");
    const finished = {
      ...task,
      status: "completed",
      completed_at: now().toISOString(),
      completed_by: actor,
      can_complete: false,
    };
    tasks.set(task.id, finished);
    record(finished);
    const mode = category(task.key).mode;
    if (mode === "completion") {
      active.delete(task.id);
      const order = category(task.key).rotation_order;
      const at = order.indexOf(task.assignee_id),
        next = order[(at + 1) % order.length];
      spawn(
        task,
        members.find((member) => member.user_id === next) || members[0],
        (task.sequence || 1) + 1,
      );
    } else if (
      mode === "self_round" &&
      current(task.key).every((item) => item.status === "completed")
    ) {
      for (const item of current(task.key)) active.delete(item.id);
      for (const member of members)
        spawn(task, member, (task.sequence || 1) + 1);
    }
    if (task.key === "water")
      handoff = {
        id: task.id,
        sequence: task.sequence || 1,
        from_member_id: task.assignee_id,
        completed_at: finished.completed_at,
      };
    events.complete++;
    version++;
    const water =
      current("water").find((item) => item.status === "pending") || null;
    return {
      task: view(finished),
      next_water: water ? view(water) : null,
      ...(task.key === "water"
        ? {
            water_handoff: {
              id: task.id,
              sequence: task.sequence || 1,
              from_member_id: task.assignee_id,
              completed_at: finished.completed_at,
            },
          }
        : {}),
      version,
    };
  }
  function undo(id) {
    const task = owned(id);
    if ((task.completed_by || task.assignee_id) !== actor)
      throw Error("只能撤销自己完成的模拟任务");
    if (task.status !== "completed")
      throw Error("这项模拟打卡已撤销或尚未完成");
    category(task.key);
    if (
      task.sequence != null &&
      [...tasks.values()].some(
        (item) =>
          item.key === task.key &&
          item.sequence > task.sequence &&
          item.status === "completed",
      )
    )
      throw Error("后续模拟轮次已完成，不能直接回退");
    // Remove only uncompleted successors; keep every confirmed historical row.
    if (task.sequence != null) {
      for (const item of [...tasks.values()])
        if (item.key === task.key && item.sequence > task.sequence) {
          active.delete(item.id);
          tasks.delete(item.id);
        }
      for (const item of tasks.values())
        if (item.key === task.key && item.sequence === task.sequence)
          active.add(item.id);
    }
    const restored = {
      ...task,
      status: "pending",
      completed_at: null,
      completed_by: null,
    };
    tasks.set(id, restored);
    active.add(id);
    history.delete(id);
    if (task.key === "water") {
      const previous = [...tasks.values()]
        .filter((item) => item.key === "water" && item.status === "completed")
        .sort((a, b) => b.sequence - a.sequence)[0];
      handoff = previous
        ? {
            id: previous.id,
            sequence: previous.sequence,
            from_member_id: previous.assignee_id,
            completed_at: previous.completed_at,
          }
        : null;
    }
    events.undo++;
    version++;
    return { task: view(restored), version };
  }
  function nudge(candidate) {
    const task = owned(candidate?.id);
    if (
      !active.has(task.id) ||
      task.status !== "pending" ||
      task.assignee_id === actor ||
      task.duty_date > dayOf(now())
    )
      throw Error("请选择当前待完成任务的模拟室友");
    category(task.key);
    const previous = nudges.get(task.id),
      at = now().getTime();
    if (previous !== undefined && at - previous < 60000) return "recent";
    nudges.set(task.id, at);
    events.nudge++;
    version++;
    return "sent";
  }
  function sendNote(note) {
    const targets =
      note?.target_member_id === "all"
        ? members.filter((member) => member.user_id !== actor)
        : members.filter(
            (member) =>
              member.user_id !== actor &&
              member.user_id === note?.target_member_id,
          );
    if (
      !targets.length ||
      typeof note.text !== "string" ||
      !note.text.trim() ||
      Array.from(note.text).length > 120
    )
      throw Error("请确认模拟留言对象和内容");
    const at = now().getTime();
    if (
      targets.some(
        (target) =>
          noteTimes.has(target.user_id) &&
          at - noteTimes.get(target.user_id) < 60000,
      )
    )
      throw Error("刚刚已模拟留言，稍后再试");
    for (const target of targets) noteTimes.set(target.user_id, at);
    notes.push(copy(note));
    events.note++;
    version++;
  }
  function read(id) {
    if (!negative(id)) return false;
    const note = reminders.find((item) => item.id === id);
    if (!note) return false;
    if (!note.read_at) {
      note.read_at = now().toISOString();
      events.read++;
      version++;
    }
    return true;
  }
  function pages(value) {
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      new Set(value.map((page) => page.id)).size !== 3 ||
      !value.every((page) => ["duty", "water", "calendar"].includes(page.id))
    )
      throw Error("请检查预览页面顺序");
    initial.configuration.pages = copy(value);
  }
  function snapshot() {
    const at = now();
    const rows = [...active].map((id) => view(tasks.get(id), at));
    const rounds = initial.categories
      .filter((item) => item.enabled && item.mode === "self_round")
      .map((item) => {
        const list = rows.filter((task) => task.key === item.key),
          completed = list.filter((task) => task.status === "completed");
        return {
          key: item.key,
          sequence: list[0]?.sequence || 1,
          completed: completed.length,
          total: members.length,
          members: members.map((member) => ({
            ...member,
            completed: completed.some(
              (task) => task.assignee_id === member.user_id,
            ),
          })),
          completions: completed.map((task) => ({
            ...members.find((member) => member.user_id === task.assignee_id),
            id: task.id,
            completed_at: task.completed_at,
          })),
        };
      });
    return copy({
      ...initial,
      version,
      today: dayOf(at),
      server_time: at.toISOString(),
      water_handoff: handoff,
      workspace_tasks: rows,
      nudge_tasks: rows,
      today_tasks: rows.filter((task) => task.assignee_id === actor),
      water_task:
        rows.find(
          (task) => task.key === "water" && task.status === "pending",
        ) || null,
      undo_tasks: [...tasks.values()]
        .filter(
          (task) => task.status === "completed" && task.completed_by === actor,
        )
        .map((task) => view(task, at)),
      calendar: [...history.values()].sort((a, b) =>
        b.completed_at.localeCompare(a.completed_at),
      ),
      rounds,
      reminders,
    });
  }
  return {
    snapshot,
    complete,
    undo,
    nudge,
    sendNote,
    read,
    pages,
    get events() {
      return { ...events };
    },
    get notes() {
      return copy(notes);
    },
  };
}
