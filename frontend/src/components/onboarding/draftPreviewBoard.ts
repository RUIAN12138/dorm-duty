import type { ChoreBoardData, ChoreCategory, ChoreRecord, ChoreTask } from "../../api/chores";
import type { DormDraft } from "../../interaction/dormDraft";
import { configuredTaskMode, configuredTaskPolicy, canCompleteTaskWithRules } from "../../../../site/shared/dorm-configuration.mjs";

function localDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(key => parts.find(part => part.type === key)!.value).join("-");
}

/** Only synthetic, in-memory data. No token, persistence, network or real IDs. */
export function createDraftPreviewModel() {
  const ids = new Map<string, number>();
  function id(key: string) {
    if (!ids.has(key)) ids.set(key, -(ids.size + 1));
    return ids.get(key)!;
  }
  return (draft: DormDraft, now = new Date()): ChoreBoardData => {
    const today = localDate(now), nowIso = now.toISOString();
    const members = [
      { user_id: -1, nickname: draft.nickname || "你", marker_id: "default" },
      { user_id: -2, nickname: "室友二", marker_id: "default" },
      { user_id: -3, nickname: "室友三", marker_id: "default" },
    ];
    const memberIds = members.map(member => member.user_id);
    const categories: ChoreCategory[] = draft.tasks.map(task => ({
      key: task.key, name: task.name, content: task.content || task.name,
      deadline_time: task.deadline, start_date: today,
      weekdays: [1, 2, 3, 4, 5, 6, 7], rotation_days: 1,
      reminder_interval_days: task.interval, rotation_order: [...memberIds],
      enabled: task.enabled, mode: configuredTaskMode(task),
    }));
    const tasks: ChoreTask[] = draft.tasks.filter(task => task.enabled).flatMap(task => {
      const mode = configuredTaskMode(task), { hard, executionTime } = configuredTaskPolicy(task, draft);
      // Scheduled/completion modes have one current assignee, not one per member.
      const assignees = mode === "self_round" ? members : members.slice(0, 1);
      const started = nowIso >= new Date(`${today}T${executionTime}:00+08:00`).toISOString();
      return assignees.map(member => {
        const completed = mode === "self_round" && member.user_id === -2 && (!hard || started);
        const result: ChoreTask = {
          id: id(`task:${task.key}:${member.user_id}`), key: task.key,
          name: task.name, content: task.content || task.name, duty_date: today,
          assignee_id: member.user_id, assignee_name: member.nickname, marker_id: member.marker_id,
          deadline_at: mode === "scheduled" || hard ? new Date(`${today}T${task.deadline}:00+08:00`).toISOString() : "",
          status: completed ? "completed" : "pending", completed_at: completed ? nowIso : null,
          completed_by: completed ? member.user_id : null, can_complete: false,
          sequence: mode === "scheduled" ? undefined : 1, mode,
        };
        result.can_complete = canCompleteTaskWithRules(result, {
          enabled: task.enabled, version2: true, hardPolicy: hard, executionTime,
        }, members[0], today, nowIso);
        return result;
      });
    });
    const calendar: ChoreRecord[] = tasks.filter(task => task.status === "completed").map(task => ({
      id: task.id, key: task.key, name: task.name, assignee_id: task.assignee_id,
      assignee_name: task.assignee_name, marker_id: task.marker_id,
      completed_at: task.completed_at!, completed_date: today,
    }));
    // Earlier dates are synthetic history, separate from the current round.
    draft.tasks.filter(task => task.enabled).forEach((task, index) => {
      const date = new Date(`${today}T12:00:00+08:00`);
      date.setUTCDate(date.getUTCDate() - index - 1);
      const member = members[(index % 2) + 1]!;
      calendar.push({ id: id(`history:${task.key}`), key: task.key, name: task.name,
        assignee_id: member.user_id, assignee_name: member.nickname, marker_id: member.marker_id,
        completed_at: date.toISOString(), completed_date: localDate(date) });
    });
    const rounds = categories.filter(category => category.enabled && category.mode === "self_round").map(category => {
      const completed = tasks.filter(task => task.key === category.key && task.status === "completed");
      return { key: category.key, sequence: 1, completed: completed.length, total: members.length,
        members: members.map(member => ({ ...member, completed: completed.some(task => task.assignee_id === member.user_id) })),
        completions: completed.map(task => ({ ...members.find(member => member.user_id === task.assignee_id)!, id: task.id, completed_at: task.completed_at! })),
      };
    });
    const waterOnDuty = draft.tasks.some(task => task.key === "water" && task.enabled && task.page === "duty");
    const personal = tasks.filter(task => task.assignee_id === -1 && (task.key !== "water" || waterOnDuty));
    return { configuration: JSON.parse(JSON.stringify({ schema_version: 2, pages: draft.pages, tasks: draft.tasks,
      policy: draft.policy, second_page_kind: draft.second_page_kind })),
      today, server_time: nowIso, version: 1, is_creator: true, member: members[0]!, members, categories,
      workspace_tasks: tasks, nudge_tasks: tasks, today_tasks: personal, next_tasks: [],
      water_task: tasks.find(task => task.key === "water") || null, water_order: [...memberIds],
      rounds, undo_tasks: [], calendar, reminders: [] };
  };
}
