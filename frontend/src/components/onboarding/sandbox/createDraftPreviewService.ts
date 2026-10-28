import { reactive } from "vue";
import type { ChoreBoardData, ChoreTask } from "../../../api/chores";
import type { ChatTurn } from "../../../api/companionChat";
import type { LocalBoardService } from "../../../interaction/localBoardService";
import { createDraftSandbox } from "./draftSandbox.mjs";

export const DRAFT_PREVIEW_INVITE = "__draft_preview__";
export function createDraftPreviewService(
  initial: ChoreBoardData,
  now = () => new Date(),
) {
  let sandbox = createDraftSandbox(initial, now);
  const board = reactive<ChoreBoardData>(sandbox.snapshot());
  const events = reactive({ ...sandbox.events });
  const sentNotes = reactive<
    { target_member_id: number | number[] | "all"; text: string }[]
  >([]);
  const welcome: ChatTurn = {
    role: "assistant",
    messages: ["这是草稿预览，不连接真实AI。", "这里的留言只会模拟发送。"],
    emotion: "05",
    request_id: "draft-welcome",
  };
  const chat: ChatTurn[] = [welcome];
  const requests = new Map<
    string,
    {
      text: string;
      reply: { messages: string[]; emotion: string; reminder: null };
    }
  >();
  function refresh() {
    const next = sandbox.snapshot();
    for (const key of Object.keys(board))
      if (!(key in next))
        delete (board as unknown as Record<string, unknown>)[key];
    Object.assign(board, next);
    Object.assign(events, sandbox.events);
    sentNotes.splice(0, sentNotes.length, ...sandbox.notes);
  }
  function run<T>(action: () => T): T {
    const result = action();
    refresh();
    return result;
  }
  const service: LocalBoardService = {
    kind: "draft",
    board,
    events,
    sentNotes,
    matches: (invite, memberId, token) =>
      invite === DRAFT_PREVIEW_INVITE &&
      memberId === board.member.user_id &&
      memberId < 0 &&
      token === "",
    complete: (task: ChoreTask) => run(() => sandbox.complete(task)),
    undo: (id) => run(() => sandbox.undo(id)),
    nudge: (task) => run(() => sandbox.nudge(task)),
    sendNote: async (note) => {
      run(() => sandbox.sendNote(note));
    },
    read: (id) => run(() => sandbox.read(id)),
    api: {
      state: async () => ({
        available: true,
        voice_available: false,
        messages: JSON.parse(JSON.stringify(chat)),
        reminders: [],
      }),
      send: async (text, id) => {
        if (
          !id ||
          typeof text !== "string" ||
          !text.trim() ||
          text.length > 1000
        )
          throw Error("请输入预览问题");
        const previous = requests.get(id);
        if (previous) {
          if (previous.text !== text) throw Error("这条预览请求已用于其他内容");
          return JSON.parse(JSON.stringify(previous.reply));
        }
        const pending = board.today_tasks
          .filter((task) => task.status === "pending")
          .map((task) => task.name)
          .join("、");
        const reply = {
          messages: [
            "这是草稿预览，不连接真实AI。",
            /今天|任务|安排/.test(text)
              ? `你的模拟任务：${pending || "当前已完成"}`
              : "可以点「我要留言」练习留话。",
          ],
          emotion: "05",
          reminder: null,
        };
        chat.push(
          { role: "user", messages: [text], emotion: "02", request_id: id },
          {
            role: "assistant",
            messages: reply.messages,
            emotion: reply.emotion,
            request_id: id,
          },
        );
        requests.set(id, { text, reply });
        return JSON.parse(JSON.stringify(reply));
      },
      voice: async () => {
        throw Error("草稿预览只使用文字");
      },
      reminder: async () => {
        throw Error("草稿预览不会安排真实提醒");
      },
      clear: async () => {
        chat.length = 0;
        requests.clear();
      },
    },
  };
  return Object.assign(service, {
    refresh,
    reset(next: ChoreBoardData) {
      sandbox = createDraftSandbox(next, now);
      chat.splice(0, chat.length, welcome);
      requests.clear();
      refresh();
    },
    updatePages(pages: NonNullable<ChoreBoardData["configuration"]>["pages"]) {
      run(() => sandbox.pages(pages));
    },
  });
}
