import { reactive } from "vue";
import type { ChoreBoardData, ChoreCompletion, ChoreTask } from "../api/chores";
import type { companionClient, ChatTurn } from "../api/companionChat";

export const PRACTICE_INVITE = "__onboarding_practice__";

/** Ephemeral service for the real UI. Never contains a room token or fetch. */
export function createTutorialPractice() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const today = ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)!.value).join("-");
  const members = [
    { user_id: -1, nickname: "你", marker_id: "default" },
    { user_id: -2, nickname: "小林", marker_id: "default" },
    { user_id: -3, nickname: "小陈", marker_id: "default" },
  ];
  const tasks: ChoreTask[] = ["地板", "洗手池", "厕所", "抬水"].map((name, i) => ({
    id: -10 - i,
    key: ["floor", "sink", "toilet", "water"][i]!,
    name,
    content: ["先扫地，再拖地，最后清理角落。", "擦净台面和水渍。", "刷洗便池并清理地面。", "将饮用水送到宿舍。完成后交给下一位。 "][i]!,
    duty_date: today,
    deadline_at: `${today}T22:00:00+08:00`,
    assignee_id: -1, assignee_name: "你", marker_id: "default",
    status: "pending", completed_at: null, can_complete: true,
    sequence: 1, mode: i === 3 ? "completion" : "self_round",
  }));
  const board = reactive<ChoreBoardData>({
    today, server_time: new Date().toISOString(), version: 1,
    is_creator: false, member: members[0]!, members,
    categories: tasks.map((task) => ({
      key: task.key, name: task.name, content: task.content, mode: task.mode,
      deadline_time: "22:00", start_date: today, weekdays: [0, 1, 2, 3, 4, 5, 6],
      rotation_days: 1, reminder_interval_days: 3, enabled: true,
      rotation_order: members.map((m) => m.user_id),
    })),
    today_tasks: tasks.slice(0, 3), next_tasks: [], water_task: tasks[3]!,
    water_order: members.map((m) => m.user_id), undo_tasks: [],
    rounds: tasks.slice(0, 3).map((task) => ({
      key: task.key, sequence: 1, completed: 0, total: 3,
      members: members.map((m) => ({ ...m, completed: false })), completions: [],
    })),
    calendar: [],
    reminders: [{
      id: -50, source: "note", sender_id: -2, sender_name: "小林",
      title: "室友留言", body: "这是练习消息，学会后就能给舍友留话。",
      created_at: new Date().toISOString(), read_at: null,
    }],
  });
  const events = reactive({ complete: 0, undo: 0, nudge: 0, note: 0, read: 0 });
  const chat: ChatTurn[] = [];
  const sentNotes: { target_member_id: number | "all"; text: string }[] = [];
  const matches = (invite: string, memberId: number, token: string) =>
    invite === PRACTICE_INVITE && memberId === -1 && token === "";
  function ownTask(id: number) {
    const task = tasks.find((item) => item.id === id);
    if (!task || id >= 0) throw Error("这不是练习任务");
    return task;
  }
  function complete(task: ChoreTask): ChoreCompletion {
    ownTask(task.id);
    const finished: ChoreTask = { ...task, status: "completed", completed_at: new Date().toISOString() };
    const next = task.key === "water"
      ? { ...task, id: -20, assignee_id: -2, assignee_name: "小林", sequence: 2, can_complete: false }
      : board.water_task;
    if (!board.undo_tasks.some((t) => t.id === task.id)) board.undo_tasks.push(finished);
    events.complete++;
    return { task: finished, next_water: next, version: board.version + 1 };
  }
  function undo(id: number) {
    const task = { ...ownTask(id), status: "pending" as const, completed_at: null };
    const round = board.rounds.find((r) => r.key === task.key);
    if (round) {
      round.members.forEach((m) => { if (m.user_id === -1) m.completed = false; });
      round.completions = round.completions.filter((m) => m.id !== id);
      round.completed = round.members.filter((m) => m.completed).length;
    }
    events.undo++;
    return { task, version: board.version + 1 };
  }
  async function sendNote(note: { target_member_id: number | "all"; text: string }) {
    if (!(note.target_member_id === "all" || members.some((m) => m.user_id !== -1 && m.user_id === note.target_member_id)) ||
        !note.text.trim() || Array.from(note.text).length > 120) throw Error("请确认练习对象和内容");
    sentNotes.push({ ...note });
    events.note++;
  }
  function read(id: number) {
    const note = board.reminders.find((item) => item.id === id);
    if (!note) return false;
    if (!note.read_at) { note.read_at = new Date().toISOString(); events.read++; }
    return true;
  }
  const api: ReturnType<typeof companionClient> = {
    state: async () => ({ available: true, voice_available: false, messages: [...chat], reminders: [] }),
    send: async (text, id) => {
      const reply = ["这是操作练习，不连接真实AI。", "点「我要留言」就能练习留话。"];
      chat.push({ role: "user", messages: [text], emotion: "02", request_id: id },
        { role: "assistant", messages: reply, emotion: "05", request_id: id });
      return { messages: reply, emotion: "05", reminder: null };
    },
    voice: async () => { throw Error("教程使用文字练习"); },
    reminder: async () => { throw Error("教程不会安排真实提醒"); },
    clear: async () => { chat.length = 0; },
  };
  return { kind:"tutorial" as const, board, events, matches, complete, undo, sendNote, read, api, sentNotes };
}
export type TutorialPractice = ReturnType<typeof createTutorialPractice>;
export { localBoardServiceKey as tutorialPracticeKey } from "./localBoardService";
