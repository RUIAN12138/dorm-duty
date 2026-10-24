export type TaskKey = "floor" | "toilet" | "sink" | "water" | `task_${string}`;
export const MAX_DORM_TASKS = 20;
export interface DraftTask {
  key: TaskKey;
  name: string;
  content: string;
  enabled: boolean;
  page: "duty" | "water";
  rotation: "round" | "rotation" | "completion";
  display: "title" | "card";
  policy?: "inherit" | "soft" | "hard";
  deadline: string;
  execution_time?: string;
  interval: number;
}
export interface DormConfiguration {
  schema_version: 2;
  pages: { id: "duty" | "water" | "calendar"; label: string }[];
  tasks: DraftTask[];
  policy: "soft" | "hard";
  second_page_kind?: "tasks" | "nudge";
}
export interface DormDraft extends DormConfiguration {
  name: string;
  nickname: string;
  members: string[];
}
export const taskDefaults: DraftTask[] = [
  {
    key: "floor",
    name: "地板",
    content: "扫地、拖地",
    enabled: true,
    page: "duty",
    rotation: "round",
    display: "title",
    deadline: "22:00",
    interval: 3,
  },
  {
    key: "toilet",
    name: "厕所",
    content: "清洁厕所",
    enabled: true,
    page: "duty",
    rotation: "round",
    display: "title",
    deadline: "22:00",
    interval: 3,
  },
  {
    key: "sink",
    name: "洗手池",
    content: "清洁台面、水渍",
    enabled: true,
    page: "duty",
    rotation: "round",
    display: "card",
    deadline: "22:00",
    interval: 3,
  },
  {
    key: "water",
    name: "抬水",
    content: "将饮用水送到宿舍",
    enabled: true,
    page: "water",
    rotation: "rotation",
    display: "title",
    deadline: "20:00",
    interval: 3,
  },
];
export function createCustomTask(): DraftTask {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replaceAll("-", "").toLowerCase()
    : Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
  return {
    key: `task_${suffix}`,
    name: "",
    content: "",
    enabled: true,
    page: "water",
    rotation: "round",
    display: "title",
    deadline: "22:00",
    interval: 3,
  };
}
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export function createDormDraft(): DormDraft {
  return {
    schema_version: 2,
    name: "",
    nickname: "创建者",
    members: [],
    tasks: clone(taskDefaults),
    policy: "soft",
    second_page_kind: "tasks",
    pages: [
      { id: "duty", label: "值日" },
      { id: "water", label: "抬水" },
      { id: "calendar", label: "日历" },
    ],
  };
}
export function configurationOf(draft: DormConfiguration): DormConfiguration {
  return clone({
    schema_version: 2,
    tasks: draft.tasks,
    pages: draft.pages,
    policy: draft.policy,
    second_page_kind: draft.second_page_kind || "tasks",
  });
}
export function draftErrors(draft: DormDraft) {
  const names = [
    draft.nickname.trim(),
    ...draft.members.map((n) => n.trim()).filter(Boolean),
  ];
  return [
    !draft.name.trim() ? "填写宿舍名称" : "",
    !names[0] ? "填写你的名字" : "",
    names.length > 12 ? "最多12位室友" : "",
    new Set(names).size !== names.length ? "室友姓名不能重复" : "",
    !draft.tasks.some((t) => t.enabled) ? "至少启用一项任务" : "",
    draft.tasks.filter(t=>t.enabled && t.page==="duty").length > 4 ? "值日页最多四项" : "",
    draft.tasks.some(t=>t.enabled && (t.policy === "hard" || ((!t.policy || t.policy === "inherit") && draft.policy === "hard")) && (t.execution_time || "08:00") >= t.deadline) ? "执行时间需早于截止时间" : "",
    draft.tasks.some((t) => t.enabled && !t.name.trim())
      ? "填写任务名称"
      : "",
  ].filter(Boolean);
}
export function reorderPage(
  draft: DormConfiguration,
  from: number,
  to: number,
) {
  if (
    from < 0 ||
    to < 0 ||
    from >= draft.pages.length ||
    to >= draft.pages.length
  )
    return;
  const page = draft.pages.splice(from, 1)[0]!;
  draft.pages.splice(to, 0, page);
}
