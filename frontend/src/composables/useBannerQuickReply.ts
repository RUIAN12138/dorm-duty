import { computed, onScopeDispose, ref, watch } from "vue";
import {
  choreRequest,
  type ChoreMember,
  type ChoreReminder,
} from "../api/chores";

export type BannerReplyPhase = "idle" | "editing" | "sending" | "failed";

export const BANNER_REPLY_LIMIT = 120;

export interface BannerReplySource {
  token: string;
  invite: string;
  memberId: number;
  members: ChoreMember[];
}

export interface BannerReplyEvents {
  /** HTTP delivery is confirmed and the identity is still current. */
  sent: (noteId: number) => void;
  notice: (message: string) => void;
}

// The reply target is the actual sender, never the room or a broadcast group.
export function bannerReplyTarget(
  note: ChoreReminder | null,
  source: BannerReplySource,
): ChoreMember | null {
  if (!note || note.source === "scheduled") return null;
  const senderId = note.sender_id;
  if (
    senderId === null ||
    senderId === undefined ||
    !Number.isSafeInteger(senderId) ||
    senderId === source.memberId
  )
    return null;
  return source.members.find((member) => member.user_id === senderId) || null;
}

function accountOf(source: BannerReplySource) {
  return JSON.stringify([source.invite, source.memberId, source.token]);
}

export function useBannerQuickReply(
  source: () => BannerReplySource,
  events: BannerReplyEvents,
) {
  const phase = ref<BannerReplyPhase>("idle");
  const draft = ref("");
  const error = ref("");
  const noteId = ref<number | null>(null);
  const senderId = ref<number | null>(null);
  const senderName = ref("");
  let snapshot: {
    id: number;
    invite: string;
    memberId: number;
    token: string;
    senderId: number;
  } | null = null;
  let disposed = false;

  const editing = computed(() => phase.value !== "idle");
  const sending = computed(() => phase.value === "sending");
  const trimmed = computed(() => draft.value.trim());
  const length = computed(() => Array.from(trimmed.value).length);
  const canSend = computed(
    () =>
      editing.value &&
      !sending.value &&
      length.value >= 1 &&
      length.value <= BANNER_REPLY_LIMIT,
  );

  function clear() {
    phase.value = "idle";
    draft.value = "";
    error.value = "";
    noteId.value = null;
    senderId.value = null;
    senderName.value = "";
    snapshot = null;
  }

  function open(note: ChoreReminder | null) {
    if (disposed || !note) return false;
    if (note.source === "scheduled") {
      events.notice("系统提醒不支持快捷回复");
      return false;
    }
    const current = source();
    const target = bannerReplyTarget(note, current);
    if (!target) {
      events.notice("这条提醒暂时无法快捷回复");
      return false;
    }
    // A repeat event for the visible note keeps whatever the user typed.
    if (snapshot?.id === note.id && editing.value) return true;
    snapshot = {
      id: note.id,
      invite: current.invite,
      memberId: current.memberId,
      token: current.token,
      senderId: target.user_id,
    };
    noteId.value = note.id;
    senderId.value = target.user_id;
    senderName.value = target.nickname;
    draft.value = "";
    error.value = "";
    phase.value = "editing";
    return true;
  }

  function setDraft(text: string) {
    if (disposed || sending.value || !snapshot) return;
    draft.value = text;
    if (error.value) error.value = "";
  }

  function cancel(id?: number) {
    if (id !== undefined && noteId.value !== id) return false;
    // The sending lock deliberately ignores dismissal; the panel closes only
    // after the server confirms delivery.
    if (sending.value || !snapshot) return false;
    clear();
    return true;
  }

  async function send(id?: number) {
    if (disposed) return false;
    if (id !== undefined && noteId.value !== id) return false;
    if (!snapshot || !["editing", "failed"].includes(phase.value)) return false;
    const content = trimmed.value;
    const count = Array.from(content).length;
    if (count < 1) {
      error.value = "写一句再发送";
      return false;
    }
    if (count > BANNER_REPLY_LIMIT) {
      error.value = `不超过 ${BANNER_REPLY_LIMIT} 字`;
      return false;
    }
    const current = source();
    if (
      current.invite !== snapshot.invite ||
      current.memberId !== snapshot.memberId ||
      current.token !== snapshot.token
    ) {
      clear();
      return false;
    }
    const target = current.members.find(
      (member) => member.user_id === snapshot!.senderId,
    );
    if (!target || target.user_id === current.memberId) {
      phase.value = "failed";
      error.value = "对方已不在宿舍，无法发送";
      return false;
    }
    const frozen = { ...snapshot };
    phase.value = "sending";
    error.value = "";
    try {
      // Reuse the existing endpoint so room authorization, fan-out, cooldown
      // and notification rules are unchanged.
      await choreRequest("/chores/notes", frozen.token, {
        method: "POST",
        body: JSON.stringify({
          target_member_id: frozen.senderId,
          text: content,
        }),
      });
      if (disposed) return false;
      // The identity must still match the snapshot. A stale response may read
      // its original message, but it can never close a different panel.
      const latest = source();
      if (
        latest.invite !== frozen.invite ||
        latest.memberId !== frozen.memberId ||
        latest.token !== frozen.token
      )
        return false;
      if (noteId.value === frozen.id) clear();
      events.sent(frozen.id);
      return true;
    } catch (cause) {
      if (disposed) return false;
      const latest = source();
      if (
        latest.invite !== frozen.invite ||
        latest.memberId !== frozen.memberId ||
        latest.token !== frozen.token
      )
        return false;
      if (noteId.value === frozen.id) {
        phase.value = "failed";
        error.value =
          cause instanceof Error && cause.message
            ? cause.message
            : "发送失败，请重试";
      }
      return false;
    }
  }

  watch(
    () => accountOf(source()),
    () => {
      if (disposed) return;
      clear();
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    snapshot = null;
  });

  return {
    phase,
    draft,
    error,
    noteId,
    senderId,
    senderName,
    editing,
    sending,
    length,
    canSend,
    open,
    setDraft,
    cancel,
    send,
  };
}
