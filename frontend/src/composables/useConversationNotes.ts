import { computed, onBeforeUnmount, ref, watch } from "vue";
import { choreRequest, type ChoreMember } from "../api/chores";
import {
  emptyNote,
  transitionNote,
  type NoteAction,
} from "../interaction/conversationNotes";

export function useConversationNotes(
  identity: () => {
    token: string;
    invite: string;
    memberId: number;
    members: ChoreMember[];
  },
  message: (role: "user" | "assistant", text: string) => void,
  sent: () => void,
  practiceSend?: (note: { target_member_id: number | "all"; text: string }) => Promise<void>,
) {
  const state = ref(emptyNote());
  const scope = () => {
    const p = identity();
    return `${p.invite}:${p.memberId}:${p.token}`;
  };
  let disposed = false;
  const active = computed(() => !["idle", "sent"].includes(state.value.phase));
  const sending = computed(() => state.value.phase === "sending");
  function step(action: NoteAction) {
    const p = identity();
    const result = transitionNote(state.value, action, p.members, p.memberId);
    state.value = result.state;
    result.messages.forEach((text) => message("assistant", text));
    return result;
  }
  function input(text: string) {
    if (sending.value) return true;
    const p = identity();
    const result = transitionNote(
      state.value,
      { type: "input", text },
      p.members,
      p.memberId,
    );
    if (!result.consumed) return false;
    message("user", text);
    state.value = result.state;
    result.messages.forEach((text) => message("assistant", text));
    return true;
  }
  async function dispatch(action: NoteAction) {
    if (sending.value) return;
    if (action.type === "start") message("user", "我要留言");
    const result = step(action);
    if (action.type !== "submit" || result.state.phase !== "sending") return;
    const snapshot = {
      target_member_id: result.state.target!,
      text: result.state.text,
    };
    const p = identity(),
      started = scope();
    try {
      // Keep the existing endpoint, room authorization, cooldown and fan-out.
      // A synchronous sending state locks out every duplicate confirmation.
      if (practiceSend) await practiceSend(snapshot);
      else await choreRequest("/chores/notes", p.token, {
        method: "POST",
        body: JSON.stringify(snapshot),
      });
      if (disposed || scope() !== started) return;
      step({ type: "success" });
      sent();
    } catch (error) {
      if (disposed || scope() !== started) return;
      step({
        type: "failure",
        error: (error as Error).message || "发送结果暂未确认",
      });
    }
  }
  function reset() {
    state.value = emptyNote();
  }
  watch(scope, reset);
  onBeforeUnmount(() => {
    disposed = true;
  });
  return { state, active, sending, input, dispatch, reset };
}
