import type { ChoreMember } from "../api/chores";

export type NoteTarget = number | "all";
export type NotePhase =
  | "idle"
  | "recipient"
  | "content"
  | "confirm"
  | "sending"
  | "failed"
  | "sent";
export interface NoteState {
  phase: NotePhase;
  target: NoteTarget | null;
  text: string;
  error: string;
}
export type NoteAction =
  | { type: "input"; text: string }
  | { type: "start"; target?: NoteTarget }
  | { type: "choose"; target: NoteTarget }
  | { type: "edit"; field: "target" | "text" }
  | { type: "cancel" | "submit" | "success" }
  | { type: "failure"; error: string };
export const emptyNote = (): NoteState => ({
  phase: "idle",
  target: null,
  text: "",
  error: "",
});
const allNames = new Set([
  "所有人",
  "所有舍友",
  "所有室友",
  "全体舍友",
  "全体室友",
  "大家",
  "全部舍友",
  "全部室友",
  "全体",
  "全部",
]);
export function noteIntent(
  text: string,
): { recipient: string; content: string } | null {
  const value = text
    .trim()
    .replace(/^(?:请|麻烦|帮我|我想要|我想|我要)\s*/u, "");
  if (/^(?:留言|留(?:个|一句)?话)[。！!]?$/u.test(value))
    return { recipient: "", content: "" };
  const match = value.match(
    /^给(.+?)(?:留言|留(?:个|一句)?话|说一下|说一声|说)(?:[：:,，]?\s*([\s\S]*))?$/u,
  );
  return match
    ? { recipient: match[1]!.trim(), content: (match[2] || "").trim() }
    : null;
}
export function noteTargetName(
  target: NoteTarget | null,
  members: ChoreMember[],
) {
  return target === "all"
    ? "所有舍友"
    : members.find((m) => m.user_id === target)?.nickname || "";
}
export function transitionNote(
  state: NoteState,
  action: NoteAction,
  members: ChoreMember[],
  self: number,
) {
  const others = members.filter((m) => m.user_id !== self);
  const valid = (target: NoteTarget | null) =>
    target === "all"
      ? others.length > 0
      : others.some((m) => m.user_id === target);
  const resolve = (name: string): NoteTarget | null => {
    if (allNames.has(name)) return "all";
    const matches = others.filter((m) => m.nickname === name);
    return matches.length === 1 ? matches[0]!.user_id : null;
  };
  const reply = (
    next: NoteState,
    messages: string[] = [],
    consumed = true,
  ) => ({ state: next, messages, consumed });
  const toDraft = (target: NoteTarget | null, text: string) => {
    if (!valid(target))
      return reply({ phase: "recipient", target: null, text, error: "" }, [
        others.length ? "想留给谁？选一位室友吧。" : "室友加入后，就能留言啦。",
      ]);
    if (!text)
      return reply({ phase: "content", target, text: "", error: "" }, [
        "想对他说什么？",
        "写好后，我会请你确认。",
      ]);
    if (
      Array.from(text).length > 120 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    )
      return reply(
        { phase: "content", target, text: "", error: "请写 1–120 字的留言" },
        ["留言请控制在一百二十字内。"],
      );
    return reply({ phase: "confirm", target, text, error: "" }, [
      "发出前，再看一眼。",
    ]);
  };
  if (state.phase === "sending") {
    if (action.type === "success")
      return reply({ ...state, phase: "sent", error: "" }, ["留言已发出。"]);
    if (action.type === "failure")
      return reply({ ...state, phase: "failed", error: action.error }, [
        "暂时未能确认送达。",
        "稍后可重新确认。",
      ]);
    return reply(state);
  }
  if (action.type === "cancel") return reply(emptyNote(), ["这次留言已取消。"]);
  if (action.type === "start") return toDraft(action.target || null, "");
  if (action.type === "choose") return toDraft(action.target, state.text);
  if (action.type === "edit")
    return reply(
      {
        ...state,
        phase: action.field === "target" ? "recipient" : "content",
        error: "",
      },
      [
        action.field === "target"
          ? "重新选择留言对象吧。"
          : "把新的留言内容告诉我吧。",
      ],
    );
  if (action.type === "submit") {
    if (!["confirm", "failed"].includes(state.phase)) return reply(state);
    if (!valid(state.target)) return toDraft(null, state.text);
    if (!state.text.trim() || Array.from(state.text).length > 120)
      return toDraft(state.target, state.text);
    return reply({ ...state, phase: "sending", error: "" });
  }
  if (action.type !== "input") return reply(state, [], false);
  const text = action.text.trim();
  const active = !["idle", "sent"].includes(state.phase);
  if (active && /^(取消(?:留言)?|不用了|不发了)$/u.test(text))
    return reply(emptyNote(), ["这次留言已取消。"]);
  if (active && /^(修改|更换|改)(收件人|对象)$/u.test(text))
    return reply({ ...state, phase: "recipient", error: "" }, [
      "重新选择留言对象吧。",
    ]);
  if (active && /^(修改|更换|改)(内容|留言)$/u.test(text))
    return reply({ ...state, phase: "content", error: "" }, [
      "把新的留言内容告诉我吧。",
    ]);
  // In content mode every sentence is content, including names and commands.
  // It still cannot send without the explicit confirmation button.
  if (state.phase === "content") return toDraft(state.target, text);
  const intent = noteIntent(text);
  if (intent) return toDraft(resolve(intent.recipient), intent.content);
  if (state.phase === "recipient") return toDraft(resolve(text), state.text);
  if (active) return reply(state, ["请先确认，或修改这条留言。"]);
  return reply(state, [], false);
}
