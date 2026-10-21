<script setup lang="ts">
import ScreenStage from "../components/ScreenStage.vue";
import AppearanceSettings from "../components/AppearanceSettings.vue";
const appearanceOpen = ref(false);
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  choreRequest,
  claimChoreIdentity,
  savedChoreToken,
  saveChoreToken,
} from "../api/chores";
import EntryBack from "../components/EntryBack.vue";
import { preferredEntryRoom } from "../interaction/entryRoom";
import {
  motionAllowed,
  motionEaseCss,
  motionTiming,
} from "../interaction/motion";
import HintPopover from "../components/HintPopover.vue";
import JoinedDorms from "../components/JoinedDorms.vue";
import { joinedDorms, rememberDorm, type JoinedDorm } from "../api/dormHistory";
import { captureCompanionHandoff } from "../interaction/companion";
import ChoreBoard from "../components/ChoreBoard.vue";
import MarkerPicker from "../components/MarkerPicker.vue";
import MemberMark from "../components/MemberMark.vue";
import ChoreBottomNav from "../components/ChoreBottomNav.vue";
import CreatorRecovery from "../components/CreatorRecovery.vue";
import ElasticSheet from "../components/ElasticSheet.vue";
import LoadingSkeleton from "../components/LoadingSkeleton.vue";
import EmailAccountPanel from "../components/EmailAccountPanel.vue";
import {
  emailAccount,
  refreshEmailAccount,
  enterEmailRoom,
  type EmailEntry,
  type EmailRoom,
  identityUnboundEvent,
} from "../api/email";
import { showToast } from "vant";
import { ApiError } from "../api";
import { logoutEvent, pendingLogout } from "../api/logout";
import { useSession } from "../stores/session";
import {
  guestApi,
  createGuestDorm,
  type GuestDorm,
  type GuestMember,
  type GuestCreation,
} from "../api/guest";

const savedDorms = ref(joinedDorms());
const storageKey = "dorm-guest-view-v1";
const route = useRoute(),
  router = useRouter(),
  session = useSession();
const dorm = ref<GuestDorm | null>(null),
  member = ref<GuestMember | null>(null);
const loading = ref(false),
  choosingMember = ref(false);
const choreToken = ref(""),
  pendingPerson = ref<GuestMember | null>(null),
  enteredName = ref(""),
  pendingClaimToken = ref(""),
  choiceMarker = ref(""),
  createMarker = ref("pixel-01");
const error = ref(""),
  notice = ref(""),
  changingDorm = ref(false);
const inviteCode = ref(""),
  draftCode = ref("");
const viewMode = ref<"entry" | "demo" | "dorm">("entry");
const creatingRoom = ref(false),
  createName = ref(""),
  createNickname = ref(""),
  createMembers = ref("");
const createdInvite = ref("");
const recoveryOpen = ref(false);
const emailOpen = ref(false);
const migrationToken = ref(""),
  migrationOwnerToken = ref(""),
  migrationMemberId = ref<number>();
function needsEmail() {
  if (!emailAccount.required || emailAccount.loggedIn) return false;
  emailOpen.value = true;
  return true;
}
function openRecovery() {
  if (!needsEmail()) recoveryOpen.value = true;
}
async function acceptEmailEntry(entry: EmailEntry, quiet = false) {
  migrationToken.value = "";
  migrationOwnerToken.value = "";
  migrationMemberId.value = undefined;
  captureCompanionHandoff();
  emailOpen.value = false;
  cancelSelection();
  if (entry.is_creator) {
    sessionStorage.setItem("dorm-token", entry.access_token);
    localStorage.setItem("dorm-email-admin-grant", entry.access_token);
    await session.refresh().catch(() => {});
  }
  saveChoreToken(entry.invite_code, entry.member_id, entry.access_token);
  await loadDorm(entry.invite_code, entry.member_id, entry.access_token, quiet);
}
function reenterAfterMigration() {
  migrationToken.value = "";
  migrationOwnerToken.value = "";
  migrationMemberId.value = undefined;
  emailOpen.value = false;
  openDormChange();
}
function exitDemo() {
  ++requestId;
  controller?.abort();
  loading.value = false;
  cancelSelection();
  member.value = null;
  dorm.value = null;
  choreToken.value = "";
  inviteCode.value = "";
  viewMode.value = "entry";
  localStorage.removeItem(storageKey);
}
function emailLogout() {
  identityFrame = undefined;
  migrationToken.value = "";
  migrationOwnerToken.value = "";
  migrationMemberId.value = undefined;
  ++requestId;
  controller?.abort();
  loading.value = false;
  changingDorm.value = false;
  creatingRoom.value = false;
  savedDorms.value = [];
  emailOpen.value = false;
  cancelSelection();
  session.clear();
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("dorm-chore-device-v1:")) localStorage.removeItem(key);
    localStorage.removeItem(storageKey);
  } catch {
    /* Optional storage. */
  }
  member.value = null;
  dorm.value = null;
  choreToken.value = "";
  inviteCode.value = "";
  viewMode.value = "entry";
}
function identityUnbound(event: Event) {
  const room = (event as CustomEvent<EmailRoom>).detail;
  savedDorms.value = joinedDorms();
  if (session.user?.id === room.member_id) session.clear();
  if (
    inviteCode.value !== room.invite_code &&
    migrationMemberId.value !== room.member_id
  )
    return;
  cancelSelection();
  emailOpen.value = false;
  migrationToken.value = "";
  migrationOwnerToken.value = "";
  migrationMemberId.value = undefined;
  member.value = null;
  choreToken.value = "";
  dorm.value = null;
  viewMode.value = "entry";
  inviteCode.value = room.invite_code;
  draftCode.value = room.invite_code;
  void loadDorm(room.invite_code).then((loaded) => {
    if (loaded) notice.value = "请输入你自己的名字，只能绑定未绑定邮箱的成员。";
  });
}
const entrySurface = ref<HTMLElement | null>(null);
const entryEmail = ref<InstanceType<typeof EmailAccountPanel>>();
const emailVerifying = ref(false);
const roomChoicesVisible = ref(true);
watch(
  () => emailAccount.loggedIn,
  (loggedIn) => {
    if (loggedIn) roomChoicesVisible.value = true;
  },
);
const entryKind = computed(() => {
  if (member.value) return "main";
  if (creatingRoom.value) return "create";
  if (changingDorm.value) return "join";
  if (dorm.value && viewMode.value !== "entry") return "identity";
  if (emailVerifying.value) return "email";
  if (emailAccount.loggedIn && roomChoicesVisible.value) return "rooms";
  return "welcome";
});
const entryBackVisible = computed(
  () => !member.value && !["welcome", "main"].includes(entryKind.value),
);
let historyWriting = false,
  restoringEntry = false,
  entryAnimation: Animation | undefined;
let historyQueue = Promise.resolve();
let identityFrame:
  | { dorm: GuestDorm; mode: "demo" | "dorm"; invite: string }
  | undefined;
function animateEntryBack() {
  entryAnimation?.cancel();
  if (entrySurface.value && motionAllowed())
    entryAnimation = entrySurface.value.animate(
      [
        { transform: "translate3d(-8px,0,0)", opacity: 0.3 },
        { transform: "translate3d(0,0,0)", opacity: 1 },
      ],
      { duration: motionTiming.page * 1000, easing: motionEaseCss },
    );
}
function restoreEntry(kind: string) {
  if (
    emailAccount.required &&
    !emailAccount.loggedIn &&
    (["rooms", "join", "create"].includes(kind) ||
      (kind === "identity" && identityFrame?.mode !== "demo"))
  )
    kind = "welcome";
  restoringEntry = true;
  if (kind === "welcome") {
    cancelSelection();
    roomChoicesVisible.value = false;
    dorm.value = null;
    member.value = null;
    viewMode.value = "entry";
    entryEmail.value?.backToEmail();
    emailVerifying.value = false;
  } else if (kind === "email") {
    entryEmail.value?.resumeVerification();
  } else if (kind === "identity" && identityFrame) {
    cancelSelection();
    dorm.value = identityFrame.dorm;
    viewMode.value = identityFrame.mode;
    inviteCode.value = identityFrame.invite;
  } else if (kind === "rooms") {
    cancelSelection();
    viewMode.value = "entry";
    roomChoicesVisible.value = true;
  } else if (kind === "join") {
    cancelSelection();
    changingDorm.value = true;
  } else if (kind === "create") {
    changingDorm.value = false;
    creatingRoom.value = true;
  }
  void nextTick().then(() => {
    restoringEntry = false;
    animateEntryBack();
  });
}
function entryBack() {
  if (!entryBackVisible.value) return;
  if (route.query.entry && router.options.history.state.back) router.back();
  else restoreEntry("welcome");
}
watch(entryKind, (kind, previous) => {
  if (kind === "identity" && dorm.value && viewMode.value !== "entry")
    identityFrame = {
      dorm: dorm.value,
      mode: viewMode.value,
      invite: inviteCode.value,
    };
  if (restoringEntry) return;
  historyQueue = historyQueue.then(async () => {
    await nextTick();
    if (disposed || entryKind.value !== kind || restoringEntry) return;
    historyWriting = true;
    try {
      const query = { ...route.query };
      delete query.entry;
      if (!["welcome", "main"].includes(kind)) query.entry = kind;
      if (route.query.entry === query.entry) return;
      const location = { path: route.path, query };
      // Identity has welcome as its parent, not the invite form.
      if (
        ["main", "welcome"].includes(kind) ||
        (kind === "identity" && previous === "join") ||
        (kind === "rooms" && previous === "email")
      )
        await router.replace(location);
      else await router.push(location);
    } finally {
      historyWriting = false;
    }
  });
});
watch(
  () => route.query.entry,
  (value) => {
    if (historyWriting || member.value || !bootReady) return;
    restoreEntry(typeof value === "string" ? value : "welcome");
  },
);
const section = computed(() =>
  route.path === "/water"
    ? "water"
    : route.path === "/calendar"
      ? "calendar"
      : "duty",
);
const navVisible = computed(
  () =>
    !!member.value &&
    !!dorm.value &&
    viewMode.value !== "entry" &&
    !creatingRoom.value &&
    !changingDorm.value &&
    !pendingPerson.value &&
    !choosingMember.value &&
    !loading.value,
);
const creatorAccess = computed(
  () =>
    !!member.value &&
    viewMode.value === "dorm" &&
    session.dorm?.invite_code === inviteCode.value &&
    session.dorm.is_admin &&
    session.user?.id === member.value.user_id,
);
let requestId = 0,
  controller: AbortController | null = null;

function normalizeCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().slice(0, 64)
    : "";
}
function storedChoice(): {
  invite_code: string;
  member_id?: number;
  guest_mode?: "demo" | "dorm";
} {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      invite_code: normalizeCode(value.invite_code),
      guest_mode:
        value.guest_mode === "demo"
          ? "demo"
          : value.guest_mode === "dorm"
            ? "dorm"
            : undefined,
      member_id:
        Number.isInteger(value.member_id) && value.member_id > 0
          ? value.member_id
          : undefined,
    };
  } catch {
    return { invite_code: "" };
  }
}
function remember() {
  if (
    viewMode.value === "dorm" &&
    dorm.value &&
    member.value &&
    choreToken.value
  ) {
    saveChoreToken(inviteCode.value, member.value.user_id, choreToken.value);
    savedDorms.value = rememberDorm({
      code: inviteCode.value,
      name: dorm.value.name,
      memberId: member.value.user_id,
      nickname: member.value.nickname,
      marker: member.value.marker_id || "pixel-01",
      creator:
        (session.dorm?.invite_code === inviteCode.value &&
          session.dorm.is_admin &&
          session.user?.id === member.value.user_id) ||
        savedDorms.value.some(
          (room) =>
            room.code === inviteCode.value &&
            room.memberId === member.value?.user_id &&
            room.creator === true,
        ),
    });
  }
  try {
    if (viewMode.value === "entry") {
      return;
    }
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        invite_code: inviteCode.value,
        guest_mode: viewMode.value,
        member_id: member.value?.user_id ?? null,
      }),
    );
  } catch {
    /* Viewing still works with browser storage disabled. */
  }
}
function startRequest(quiet = false) {
  controller?.abort();
  controller = new AbortController();
  if (!quiet) loading.value = true;
  error.value = "";
  return { id: ++requestId, signal: controller.signal };
}
function isCurrent(id: number, signal: AbortSignal) {
  return id === requestId && !signal.aborted;
}
async function creatorToken(person: GuestMember, code = inviteCode.value) {
  if (!code) return "";
  await session.init();
  if (
    session.dorm?.invite_code !== code &&
    sessionStorage.getItem("dorm-token")
  ) {
    try {
      await session.refresh();
    } catch {
      /* A network failure can be retried. */
    }
  }
  return session.dorm?.invite_code === code &&
    session.dorm.is_admin &&
    session.user?.id === person.user_id
    ? sessionStorage.getItem("dorm-token") || ""
    : "";
}
const occupiedMarks = computed(
  () =>
    dorm.value?.members
      .filter((person) => person.user_id !== pendingPerson.value?.user_id)
      .map((person) => person.marker_id || "") || [],
);
async function loadDorm(
  code: string,
  restoreId?: number,
  knownOwnerToken = "",
  quiet = false,
) {
  const { id, signal } = startRequest(quiet);
  try {
    let token =
      code && restoreId
        ? knownOwnerToken ||
          (await creatorToken({ user_id: restoreId, nickname: "" }, code)) ||
          savedChoreToken(code, restoreId)
        : "";
    let result: GuestDorm;
    try {
      result = await guestApi<GuestDorm>(
        "/guest/dorm",
        { invite_code: code || undefined },
        signal,
        token,
      );
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401 || !token) throw e;
      if (restoreId) saveChoreToken(code, restoreId, "");
      token = "";
      result = await guestApi<GuestDorm>(
        "/guest/dorm",
        { invite_code: code },
        signal,
      );
    }
    if (!code && result.is_demo !== true) throw new Error("请先输入宿舍邀请码");
    const restored =
      result.members.find((m) => m.user_id === restoreId) || null;
    if (!isCurrent(id, signal)) return false;
    // Commit only after the room is valid. Opening/cancelling a switch never logs out.
    dorm.value = result;
    inviteCode.value = result.is_demo ? "" : code;
    viewMode.value = result.is_demo ? "demo" : "dorm";
    member.value = restored;
    choreToken.value = token;
    choosingMember.value = false;
    pendingPerson.value = null;
    pendingClaimToken.value = "";
    enteredName.value = "";
    notice.value =
      restoreId && !restored ? "请输入你的名字，重新确认身份。" : "";
    remember();
    return true;
  } catch (e) {
    if (isCurrent(id, signal)) error.value = (e as Error).message;
    return false;
  } finally {
    if (isCurrent(id, signal)) loading.value = false;
  }
}

async function choose(person: GuestMember) {
  notice.value = "";
  error.value = "";
  if (viewMode.value === "demo") {
    member.value = person;
    choosingMember.value = false;
    remember();
    return;
  }
}
async function submitName() {
  if (needsEmail()) return;
  if (loading.value || !enteredName.value.trim()) return;
  const { id, signal } = startRequest();
  try {
    const result = await claimChoreIdentity(
      { invite_code: inviteCode.value, nickname: enteredName.value.trim() },
      signal,
    );
    if (!isCurrent(id, signal)) return;
    if (result.is_creator) {
      sessionStorage.setItem("dorm-token", result.access_token);
      localStorage.setItem("dorm-email-admin-grant", result.access_token);
      await session.refresh();
      if (!isCurrent(id, signal)) return;
    }
    const owner = await creatorToken(result.member);
    if (!isCurrent(id, signal)) return;
    let token = owner || result.access_token;
    let room: GuestDorm;
    try {
      room = await guestApi<GuestDorm>(
        "/guest/dorm",
        { invite_code: inviteCode.value },
        signal,
        token,
      );
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401 || !owner) throw e;
      token = result.access_token;
      room = await guestApi<GuestDorm>(
        "/guest/dorm",
        { invite_code: inviteCode.value },
        signal,
        token,
      );
    }
    if (!isCurrent(id, signal)) return;
    await refreshEmailAccount();
    if (!isCurrent(id, signal)) return;
    dorm.value = room;
    pendingClaimToken.value = token;
    pendingPerson.value = result.member;
    choiceMarker.value = result.member.marker_id;
    notice.value = "";
  } catch (e) {
    if (isCurrent(id, signal)) error.value = (e as Error).message;
  } finally {
    if (isCurrent(id, signal)) loading.value = false;
  }
}
async function confirmChoice() {
  if (
    !pendingPerson.value ||
    loading.value ||
    !choiceMarker.value ||
    !pendingClaimToken.value
  )
    return;
  const person = pendingPerson.value;
  const { id, signal } = startRequest();
  try {
    const token = pendingClaimToken.value;
    if (choiceMarker.value !== person.marker_id)
      await choreRequest("/chores/marker", token, {
        method: "PATCH",
        body: JSON.stringify({ marker_id: choiceMarker.value }),
        signal,
      });
    if (!isCurrent(id, signal)) return;
    member.value = { ...person, marker_id: choiceMarker.value };
    choreToken.value = token;
    saveChoreToken(inviteCode.value, person.user_id, token);
    pendingPerson.value = null;
    pendingClaimToken.value = "";
    choosingMember.value = false;
    remember();
  } catch (e) {
    if (isCurrent(id, signal)) error.value = (e as Error).message;
  } finally {
    if (isCurrent(id, signal)) loading.value = false;
  }
}
function cancelSelection() {
  controller?.abort();
  ++requestId;
  loading.value = false;
  choosingMember.value = false;
  changingDorm.value = false;
  creatingRoom.value = false;
  pendingPerson.value = null;
  pendingClaimToken.value = "";
  enteredName.value = "";
  error.value = "";
}
let identityRecovery: Promise<void> | null = null;
function identityExpired() {
  if (identityRecovery) return identityRecovery;
  if (emailAccount.required) {
    const code = inviteCode.value,
      shownMember = member.value?.user_id,
      previousMember = shownMember ?? storedChoice().member_id;
    const epoch = requestId;
    const current = () =>
      epoch === requestId &&
      inviteCode.value === code &&
      member.value?.user_id === shownMember;
    identityRecovery = (async () => {
      await refreshEmailAccount();
      if (!current()) return;
      const linked = emailAccount.rooms.find(
        (room) =>
          room.invite_code === code && room.member_id === previousMember,
      );
      if (emailAccount.loggedIn && linked) {
        const entry = await enterEmailRoom(linked.id);
        if (current()) await acceptEmailEntry(entry, true);
        return;
      }
      // Expired email login goes straight to verification. Preserve proof for
      // migration, but do not send a legacy token through a public room reload.
      migrationMemberId.value = previousMember;
      migrationToken.value =
        choreToken.value ||
        (previousMember ? savedChoreToken(code, previousMember) : "");
      migrationOwnerToken.value =
        localStorage.getItem("dorm-email-admin-grant") || "";
      cancelSelection();
      member.value = null;
      choreToken.value = "";
      viewMode.value = "entry";
      dorm.value = null;
    })()
      .catch(() => {
        // A transient connection failure keeps the current screen and identity.
        // Foreground/online or the next poll will retry without forcing a reload.
      })
      .finally(() => {
        identityRecovery = null;
      });
    return identityRecovery;
  }
  if (member.value) saveChoreToken(inviteCode.value, member.value.user_id, "");
  cancelSelection();
  member.value = null;
  choreToken.value = "";
  notice.value = emailAccount.required
    ? "请用邮箱重新进入宿舍。"
    : "这台设备的身份已失效，请重新输入你的名字。";
}
function changeMember() {
  if (
    emailAccount.loggedIn &&
    emailAccount.rooms.some((room) => room.id === dorm.value?.id)
  ) {
    emailOpen.value = true;
    return;
  }
  cancelSelection();
  choosingMember.value = true;
  notice.value = "";
}
function retryEntry() {
  void boot();
}
async function refresh() {
  if (
    loading.value ||
    changingDorm.value ||
    creatingRoom.value ||
    choosingMember.value ||
    pendingPerson.value ||
    (viewMode.value === "entry" &&
      !inviteCode.value &&
      storedChoice().guest_mode !== "demo")
  )
    return;
  const saved = storedChoice();
  await loadDorm(
    inviteCode.value,
    member.value?.user_id ??
      (saved.invite_code === inviteCode.value ? saved.member_id : undefined),
  );
}
function openDormChange() {
  if (needsEmail()) return;
  cancelSelection();
  notice.value = "";
  createdInvite.value = "";
  draftCode.value = "";
  changingDorm.value = true;
}
function openCreate() {
  if (needsEmail()) return;
  openDormChange();
  changingDorm.value = false;
  creatingRoom.value = true;
  createName.value = "";
  createNickname.value = "";
  createMembers.value = "";
  createMarker.value = "pixel-01";
}
async function submitCreate() {
  if (loading.value) return;
  const { id, signal } = startRequest();
  try {
    const result = await createGuestDorm(
      {
        name: createName.value.trim(),
        marker_id: createMarker.value,
        nickname: createNickname.value.trim(),
        members: createMembers.value
          .split(/[\n、，,；;]/)
          .map((name) => name.trim())
          .filter(Boolean),
      },
      signal,
    );
    if (!isCurrent(id, signal)) return;
    sessionStorage.setItem("dorm-token", result.access_token);
    try {
      localStorage.setItem("dorm-email-admin-grant", result.access_token);
    } catch {
      /* This device can still manage in its current session. */
    }
    try {
      await session.refresh();
    } catch {
      /* The created room and owner token remain usable after reconnecting. */
    }
    await refreshEmailAccount().catch(() => {});
    if (!isCurrent(id, signal)) return;
    creatingRoom.value = false;
    createdInvite.value = result.invite_code;
    inviteCode.value = result.invite_code;
    viewMode.value = "dorm";
    member.value =
      result.dorm.members.find(
        (person) => person.user_id === result.member_id,
      ) || null;
    remember();
    await router.replace({
      path: route.path,
      query: { ...route.query },
    });
    await loadDorm(result.invite_code, result.member_id, result.access_token);
  } catch (e) {
    if (isCurrent(id, signal)) error.value = (e as Error).message;
  } finally {
    if (isCurrent(id, signal)) loading.value = false;
  }
}
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(createdInvite.value);
    showToast("邀请码已复制");
  } catch {
    showToast("可以长按邀请码复制");
  }
}
async function acceptRecovered(result: GuestCreation) {
  recoveryOpen.value = false;
  const { id, signal } = startRequest();
  try {
    await session.init();
    if (!isCurrent(id, signal)) return;
    sessionStorage.setItem("dorm-token", result.access_token);
    try {
      localStorage.setItem("dorm-email-admin-grant", result.access_token);
    } catch {
      /* Current visit remains usable. */
    }
    saveChoreToken(result.invite_code, result.member_id, result.access_token);
    await session.refresh().catch(() => {
      /* A fresh owner token can retry after reconnecting. */
    });
    if (!isCurrent(id, signal)) return;
    creatingRoom.value = false;
    changingDorm.value = false;
    pendingPerson.value = null;
    choosingMember.value = false;
    createdInvite.value = "";
    inviteCode.value = result.invite_code;
    viewMode.value = "dorm";
    dorm.value = result.dorm;
    member.value =
      result.dorm.members.find(
        (person) => person.user_id === result.member_id,
      ) || null;
    choreToken.value = result.access_token;
    remember();
    const synced = await loadDorm(
      result.invite_code,
      result.member_id,
      result.access_token,
    );
    await router.replace({ path: route.path });
    showToast(synced ? "管理权限已恢复" : "权限已恢复，请联网刷新");
  } catch (e) {
    if (isCurrent(id, signal)) error.value = (e as Error).message;
  } finally {
    if (isCurrent(id, signal)) loading.value = false;
  }
}
async function switchDorm(useDefault = false) {
  if (loading.value) return;
  const code = useDefault ? "" : normalizeCode(draftCode.value);
  if (!useDefault && !code) return;
  const saved = storedChoice();
  const restoreId =
    code === inviteCode.value
      ? member.value?.user_id
      : code === saved.invite_code
        ? saved.member_id
        : undefined;
  if (!(await loadDorm(code, restoreId))) return;
  changingDorm.value = false;
  creatingRoom.value = false;
  await router.replace({
    path: route.path,
    query: { ...route.query },
  });
}
async function returnToDorm(room: JoinedDorm) {
  if (loading.value) return;
  if (await loadDorm(room.code, room.memberId)) {
    if (room.creator && choreToken.value) {
      try {
        const current = await choreRequest<{ id: number; is_admin: boolean }>(
          "/dorms/current",
          choreToken.value,
        );
        if (current?.id === dorm.value?.id && current.is_admin) {
          sessionStorage.setItem("dorm-token", choreToken.value);
          localStorage.setItem("dorm-email-admin-grant", choreToken.value);
          await session.refresh();
        }
      } catch {
        /* Viewing still works; management remains server-authorized. */
      }
    }
    changingDorm.value = false;
    creatingRoom.value = false;
    await router.replace({ path: route.path });
  }
}
function visibleRefresh() {
  if (
    (!bootReady || pendingLogout()) &&
    document.visibilityState === "visible"
  ) {
    void boot();
    return;
  }
  if (
    document.visibilityState === "visible" &&
    viewMode.value !== "entry" &&
    !member.value &&
    !pendingPerson.value
  )
    void refresh();
}
watch(
  () => route.path,
  () => {
    createdInvite.value = "";
    if (
      creatingRoom.value ||
      changingDorm.value ||
      pendingPerson.value ||
      choosingMember.value
    ) {
      cancelSelection();
    }
  },
);
function removeSharedInvite() {
  if (route.query.invite_code === undefined) return;
  const query = { ...route.query };
  delete query.invite_code;
  void router.replace({ path: route.path, query, hash: route.hash });
}
watch(() => route.query.invite_code, removeSharedInvite);

watch(emailOpen, (open, previous) => {
  if (
    !open &&
    previous &&
    emailAccount.required &&
    !emailAccount.loggedIn &&
    viewMode.value !== "demo"
  ) {
    ++requestId;
    controller?.abort();
    loading.value = false;
    cancelSelection();
    member.value = null;
    dorm.value = null;
    choreToken.value = "";
    viewMode.value = "entry";
    changingDorm.value = false;
    creatingRoom.value = false;
    error.value = "";
  }
});
window.addEventListener(logoutEvent, emailLogout);
window.addEventListener(identityUnboundEvent, identityUnbound);
let bootRunning = false;
let bootReady = false;
let disposed = false;
async function boot() {
  if (bootRunning || disposed) return;
  bootRunning = true;
  try {
    await bootEntry();
  } finally {
    bootRunning = false;
  }
}
async function bootEntry() {
  const epoch = requestId;
  loading.value = true;
  const saved = storedChoice();
  const sharedLink = route.query.invite_code !== undefined;
  // Only manual join/create or a previous room choice grants the UI entry.
  // A copied address never reveals a new room or replaces this device's room.
  const code = saved.invite_code;
  removeSharedInvite();
  inviteCode.value = code;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await refreshEmailAccount();
        break;
      } catch (failure) {
        if (attempt >= 2 || disposed || !navigator.onLine) throw failure;
        await new Promise((resolve) =>
          setTimeout(resolve, 600 * (attempt + 1)),
        );
      }
    }
    if (disposed || epoch !== requestId) return;
    bootReady = true;
    error.value = "";
  } catch (failure) {
    loading.value = false;
    error.value =
      (failure as Error).message || "暂时无法验证身份，请联网重试。";
    return;
  }
  loading.value = false;
  if (!code && !sharedLink && emailAccount.loggedIn) {
    const room = preferredEntryRoom(emailAccount.rooms);
    if (room) {
      try {
        const entry = await enterEmailRoom(room.id);
        if (!disposed && epoch === requestId) await acceptEmailEntry(entry);
      } catch (e) {
        if (!disposed && epoch === requestId)
          error.value = (e as Error).message;
      }
      return;
    }
  }
  if (code && saved.guest_mode !== "demo" && emailAccount.required) {
    const linked = emailAccount.rooms.find((room) => room.invite_code === code);
    if (emailAccount.loggedIn && linked) {
      try {
        await acceptEmailEntry(await enterEmailRoom(linked.id));
      } catch (e) {
        if (e instanceof ApiError && [401, 403, 428].includes(e.status))
          await identityExpired();
        else error.value = (e as Error).message;
      }
    } else {
      // Keep original credentials privately for this one-time migration. Do not
      // load the board, clear proof, or show a roster before email verification.
      migrationMemberId.value = saved.member_id;
      migrationToken.value = saved.member_id
        ? savedChoreToken(code, saved.member_id)
        : "";
      migrationOwnerToken.value =
        localStorage.getItem("dorm-email-admin-grant") || "";
    }
  } else if (code || saved.guest_mode === "demo")
    void loadDorm(
      code,
      code === saved.invite_code ? saved.member_id : undefined,
    );
  else if (sharedLink) openDormChange();
}
onMounted(() => {
  void boot();
  document.addEventListener("visibilitychange", visibleRefresh);
  window.addEventListener("focus", visibleRefresh);
  window.addEventListener("online", visibleRefresh);
});
onUnmounted(() => {
  entryAnimation?.cancel();
  disposed = true;
  window.removeEventListener(logoutEvent, emailLogout);
  window.removeEventListener(identityUnboundEvent, identityUnbound);
  ++requestId;
  controller?.abort();
  document.removeEventListener("visibilitychange", visibleRefresh);
  window.removeEventListener("focus", visibleRefresh);
  window.removeEventListener("online", visibleRefresh);
});
</script>

<template>
  <ScreenStage :signed-in="navVisible">
    <main
      ref="entrySurface"
      class="guest-page"
      :class="{
        'has-chore-nav': navVisible,
        'has-compact-calendar': navVisible && section === 'calendar',
        'is-name-entry': !navVisible && !!dorm && (!member || choosingMember),
        'is-entry-flow':
          !navVisible &&
          !creatingRoom &&
          (viewMode === 'entry' || changingDorm),
      }"
    >
      <EntryBack
        v-if="entryBackVisible && !emailOpen && !recoveryOpen"
        :target="entrySurface"
        :disabled="loading || !!entryEmail?.busy"
        @back="entryBack"
      />
      <header v-if="!navVisible && viewMode === 'demo'" class="guest-header">
        <div class="guest-brand-line">
          <span
            v-if="viewMode === 'demo'"
            class="guest-demo-badge"
            data-testid="guest-demo-mode"
            >游客模式</span
          >
        </div>
      </header>

      <section
        v-if="creatingRoom"
        class="guest-dorm-form"
        data-testid="guest-create-form"
        aria-labelledby="create-title"
      >
        <div class="entry-heading">
          <h1 id="create-title">创建你的宿舍</h1>
          <HintPopover
            title="创建者权限"
            :text="
              emailAccount.loggedIn
                ? '用当前邮箱创建，自动拥有创建者权限。换设备后用同一邮箱登录即可。'
                : '管理权限会保存在此设备。创建后可生成管理恢复码，用于更换设备。'
            "
          />
        </div>
        <form @submit.prevent="submitCreate">
          <label for="create-name">宿舍名称</label>
          <input
            id="create-name"
            v-model="createName"
            data-testid="guest-create-name"
            maxlength="64"
            placeholder="例如：6-402"
            autocomplete="off"
            required
            :disabled="loading"
          />
          <label for="create-nickname">你的名字</label>
          <input
            id="create-nickname"
            v-model="createNickname"
            data-testid="guest-create-nickname"
            maxlength="32"
            placeholder="室友怎么称呼你"
            autocomplete="nickname"
            required
            :disabled="loading"
          />
          <label for="create-members"
            >其他室友的名字 <span class="guest-muted">（选填）</span></label
          >
          <textarea
            id="create-members"
            v-model="createMembers"
            data-testid="guest-create-members"
            rows="3"
            maxlength="2000"
            placeholder="每行一位，也可以用逗号分隔"
            :disabled="loading"
          ></textarea>
          <MarkerPicker v-model="createMarker" :disabled="loading" />
          <p v-if="error" class="guest-create-error" role="alert">
            {{ error }}
          </p>
          <button
            type="submit"
            class="guest-primary"
            data-testid="guest-create-submit"
            :disabled="loading"
          >
            {{ loading ? "正在创建…" : "创建宿舍" }}
          </button>
        </form>
        <div class="guest-form-actions">
          <button :disabled="loading" @click="cancelSelection">返回</button>
        </div>
      </section>
      <section
        v-else-if="changingDorm"
        class="guest-dorm-form guest-switch-form"
        aria-labelledby="switch-title"
      >
        <div class="entry-heading">
          <h1 id="switch-title">加入新宿舍</h1>
          <HintPopover
            title="邀请码在哪里？"
            label="邀请码帮助"
            text="向宿舍创建者索取邀请码，再输入名单中你的完整名字即可进入。"
          />
        </div>
        <form @submit.prevent="switchDorm()">
          <label for="guest-invite" class="invite-label">宿舍邀请码</label>
          <input
            id="guest-invite"
            data-testid="guest-invite"
            v-model="draftCode"
            maxlength="64"
            autocomplete="off"
            autocapitalize="characters"
            placeholder="输入邀请码"
            required
          />
          <button
            type="submit"
            class="guest-primary"
            data-testid="guest-join-submit"
            :disabled="loading"
          >
            {{ loading ? "正在加入…" : "加入宿舍" }}
          </button>
        </form>
        <p v-if="error" class="guest-create-error" role="alert">{{ error }}</p>
        <div class="guest-form-actions">
          <button :disabled="loading" @click="switchDorm(true)">
            游客体验
          </button>
          <button @click="cancelSelection">
            {{ member ? "返回当前任务" : "取消" }}
          </button>
        </div>
        <JoinedDorms
          :rooms="savedDorms"
          :disabled="loading"
          :current="inviteCode"
          @select="returnToDorm"
        />
      </section>
      <template v-else>
        <LoadingSkeleton v-if="loading && !dorm" />
        <div v-if="error && !dorm" class="guest-error" role="alert">
          <h1>暂时无法查看</h1>
          <p>{{ error }}</p>
          <button class="guest-primary" :disabled="loading" @click="retryEntry">
            重新加载
          </button>
        </div>
        <section
          v-else-if="viewMode === 'entry' && !loading"
          class="guest-entry"
          aria-labelledby="entry-title"
        >
          <h1
            id="entry-title"
            :class="{ 'companion-entry-title': !emailAccount.loggedIn }"
          >
            {{
              (emailAccount.required && !emailAccount.loggedIn) ||
              !roomChoicesVisible
                ? "欢迎来到轮到"
                : "先找到你的宿舍"
            }}
          </h1>
          <EmailAccountPanel
            ref="entryEmail"
            auto-enter
            :preferred-invite="storedChoice().invite_code"
            @verification="emailVerifying = $event"
            v-if="
              (emailAccount.required || emailAccount.loggedIn) &&
              (!emailAccount.loggedIn || roomChoicesVisible) &&
              !emailOpen
            "
            hide-title
            :member-token="migrationToken"
            :owner-token="migrationOwnerToken"
            :member-id="migrationMemberId"
            :gate="!!migrationMemberId"
            @recover="openRecovery"
            @reenter="reenterAfterMigration"
            @entered="acceptEmailEntry"
            @logout="emailLogout"
          />
          <button
            v-if="emailAccount.loggedIn && !roomChoicesVisible"
            class="guest-primary"
            data-testid="entry-continue"
            @click="roomChoicesVisible = true"
          >
            进入宿舍
          </button>
          <JoinedDorms
            v-if="
              (!emailAccount.required || emailAccount.loggedIn) &&
              roomChoicesVisible
            "
            :rooms="savedDorms"
            :disabled="loading"
            @select="returnToDorm"
          />
          <div
            v-if="
              (!emailAccount.required || emailAccount.loggedIn) &&
              roomChoicesVisible
            "
            class="guest-entry-actions"
          >
            <button
              class="guest-primary"
              data-testid="guest-join-dorm"
              @click="openDormChange"
            >
              加入宿舍<van-icon name="arrow" aria-hidden="true" />
            </button>
            <button
              @click="openCreate"
              class="guest-secondary"
              data-testid="guest-create-dorm"
            >
              创建宿舍
            </button>
          </div>
          <div class="entry-secondary-actions">
            <button
              class="guest-demo-link"
              data-testid="guest-demo-entry"
              @click="switchDorm(true)"
            >
              游客体验<van-icon name="arrow" aria-hidden="true" />
            </button>
            <button
              class="guest-demo-link"
              data-testid="guest-recover-owner"
              @click="openRecovery"
            >
              恢复管理权限
            </button>
          </div>
        </section>
        <template v-else-if="dorm && (!loading || pendingPerson)">
          <aside
            v-if="createdInvite"
            class="guest-created"
            data-testid="guest-created-invite"
          >
            <div>
              <strong>宿舍已创建</strong>
            </div>
            <div class="guest-invite-line">
              <code>{{ createdInvite }}</code
              ><button @click="copyInvite">复制邀请码</button>
            </div>
            <button
              class="guest-created-close"
              aria-label="收起邀请码"
              @click="createdInvite = ''"
            >
              <van-icon name="cross" />
            </button>
          </aside>
          <section
            v-if="!member || choosingMember"
            class="guest-chooser"
            aria-labelledby="choose-title"
          >
            <h1 id="choose-title">
              {{
                pendingPerson
                  ? `你好，${pendingPerson.nickname}`
                  : viewMode === "demo"
                    ? "你是哪位室友？"
                    : "输入你的名字"
              }}
            </h1>
            <template v-if="pendingPerson">
              <MarkerPicker
                v-model="choiceMarker"
                :occupied="occupiedMarks"
                :disabled="loading"
              />
              <p v-if="error" class="guest-create-error" role="alert">
                {{ error }}
              </p>
              <button
                class="guest-primary"
                data-testid="marker-confirm"
                :disabled="loading || !choiceMarker"
                @click="confirmChoice"
              >
                {{ loading ? "正在进入…" : "进入宿舍" }}
              </button>
              <button
                class="guest-refresh"
                :disabled="loading"
                @click="
                  pendingPerson = null;
                  pendingClaimToken = '';
                  enteredName = '';
                  error = '';
                "
              >
                重新输入名字
              </button>
            </template>
            <p v-if="notice" class="guest-notice" role="status">{{ notice }}</p>
            <form
              v-if="!pendingPerson && viewMode === 'dorm'"
              class="name-entry"
              data-testid="guest-name-form"
              @submit.prevent="submitName"
            >
              <label for="member-name">你在宿舍名单中的名字</label>
              <input
                id="member-name"
                v-model="enteredName"
                data-testid="guest-member-name"
                autocomplete="off"
                autocapitalize="off"
                maxlength="32"
                placeholder="输入完整名字"
                required
                :disabled="loading"
              />
              <p v-if="error" class="guest-create-error" role="alert">
                {{ error }}
              </p>
              <button
                class="guest-primary"
                data-testid="guest-name-submit"
                :disabled="loading || !enteredName.trim()"
              >
                {{ loading ? "正在确认…" : "确认身份" }}
              </button>
            </form>
            <div
              v-if="
                !pendingPerson && viewMode === 'demo' && dorm.members.length
              "
              class="guest-member-list"
            >
              <button
                v-for="(person, index) in dorm.members"
                :key="person.user_id"
                :data-testid="`guest-member-${person.user_id}`"
                @click="choose(person)"
              >
                <span class="guest-member-number">{{
                  String(index + 1).padStart(2, "0")
                }}</span>
                <MemberMark :id="person.marker_id" :size="24" />
                <strong>{{ person.nickname }}</strong
                ><van-icon name="arrow" aria-hidden="true" />
              </button>
            </div>
            <p
              v-else-if="
                !pendingPerson && viewMode === 'demo' && !dorm.members.length
              "
              class="guest-notice"
            >
              这个宿舍还没有成员，可以先进入宿舍管理添加。
            </p>
            <button
              v-if="member"
              class="guest-refresh"
              data-testid="guest-cancel-member"
              @click="cancelSelection"
            >
              返回当前任务
            </button>
          </section>
          <section v-else-if="member" class="guest-personal">
            <ChoreBoard
              :key="`${inviteCode}:${member.user_id}`"
              :section="section"
              :invite="inviteCode"
              :dorm-name="dorm.name"
              :member-id="member.user_id"
              :token="choreToken"
              :demo="viewMode === 'demo'"
              @expired="identityExpired"
              @member="member = $event"
              @switch-member="changeMember"
              @join-dorm="openDormChange"
              @create-dorm="openCreate"
              @recover-owner="recoveryOpen = true"
              @email-account="emailOpen = true"
              @exit-demo="exitDemo"
            />
          </section>
        </template>
      </template>

      <footer
        v-if="viewMode !== 'entry' && !member && !changingDorm && !creatingRoom"
        class="guest-footer"
      >
        <button @click="openDormChange">
          创建 / 加入宿舍<van-icon name="arrow" aria-hidden="true" />
        </button>
        <router-link v-if="creatorAccess" to="/dorm">宿舍成员管理</router-link>
      </footer>

      <ElasticSheet
        v-model="emailOpen"
        title="邮箱登录与提醒设置"
        motion="bottom"
      >
        <EmailAccountPanel
          hide-title
          :member-token="viewMode === 'dorm' ? choreToken : ''"
          :dorm-id="dorm?.id"
          @entered="acceptEmailEntry"
          @logout="emailLogout"
        />
      </ElasticSheet>
      <CreatorRecovery
        v-model="recoveryOpen"
        mode="restore"
        :invite="inviteCode"
        @restored="acceptRecovered"
      />
    </main>
  </ScreenStage>
  <ChoreBottomNav v-if="navVisible" :section="section" />
  <button
    v-if="!navVisible"
    class="entry-appearance"
    aria-label="设置"
    @click="appearanceOpen = true"
  >
    <van-icon name="setting-o" />
  </button>
  <ElasticSheet v-model="appearanceOpen" title="设置" expandable
    ><AppearanceSettings
  /></ElasticSheet>
</template>

<style scoped>
.join-new-title {
  margin: 0 0 18px;
  font-size: 19px;
  font-weight: 600;
}
.guest-page.has-chore-nav {
  padding-bottom: calc(104px + env(safe-area-inset-bottom));
}
.guest-page.is-name-entry {
  padding-top: calc(env(safe-area-inset-top, 0px) + clamp(40px, 8dvh, 72px));
}
.guest-page.has-compact-calendar {
  /* The calendar already measures and reserves the actual fixed navigation. */
  padding-bottom: 0;
}
.guest-brand-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.guest-brand-line .guest-demo-badge {
  margin: 0;
  border: 0;
  padding: 0;
  font-size: 12px;
  font-weight: 400;
}
.guest-chooser h1,
.guest-entry h1 {
  margin-top: 0;
}
.name-entry {
  margin: 28px auto 0;
  max-width: 340px;
}
.name-entry label {
  display: block;
  margin-bottom: 12px;
  color: var(--app-tone-h555, #555);
  font-size: 15px;
}
.name-entry input {
  width: 100%;
  min-height: 60px;
  padding: 14px 18px;
  border: 1px solid var(--app-tone-hddd, #ddd);
  border-radius: 18px;
  background: var(--app-tone-hf7f7f7, #f7f7f7);
  color: var(--app-tone-h111, #111);
  font: inherit;
  font-size: 21px;
}
.name-entry input:focus-visible {
  outline: 2px solid var(--app-tone-h111, #111);
  outline-offset: 3px;
}
.name-entry .guest-primary {
  margin-top: 18px;
}
.guest-chooser .guest-member-list {
  margin-top: 24px;
}
.guest-chooser .guest-member-list > button {
  min-height: 60px;
  padding: 12px 0;
}
@media (max-height: 650px) {
  .guest-chooser .guest-member-list > button {
    min-height: 48px;
    padding: 6px 0;
  }
}
</style>

<style scoped>
.is-entry-flow .guest-header {
  margin-bottom: 0;
  min-height: 44px;
}
.guest-entry,
.guest-switch-form {
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}
.is-entry-flow .guest-entry,
.is-entry-flow .guest-switch-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px 0 96px;
}
.is-entry-flow .guest-switch-form {
  justify-content: center;
  padding: 32px 0 64px;
}
.guest-page .guest-switch-form form > .guest-primary {
  position: relative;
  bottom: auto;
  margin-top: 48px;
}
.guest-entry h1 {
  text-align: center;
  font-size: clamp(28px, 8vw, 34px);
  margin: 0 0 12px;
}
.entry-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 28px;
}
.entry-heading h1 {
  margin: 0;
}
.guest-switch-form .invite-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.guest-switch-form input {
  min-height: 64px;
  border: 1px solid var(--app-tone-he8e8e8, #e8e8e8);
  border-radius: 20px;
  background: var(--app-tone-hf7f7f7, #f7f7f7);
  text-align: center;
  font-size: 22px;
  letter-spacing: 2px;
  padding: 16px;
}
.guest-switch-form input::placeholder {
  font-size: 18px;
  letter-spacing: 0;
  color: var(--app-tone-haaa, #aaa);
}
.guest-switch-form input:focus {
  outline: none;
  border-color: var(--app-tone-h222, #222);
  box-shadow: 0 0 0 3px #0000000b;
}
.guest-entry .guest-primary,
.guest-entry .guest-secondary,
.guest-switch-form .guest-primary {
  position: relative;
  min-height: 58px;
  border-radius: 20px;
  font-size: 18px;
  margin-top: 14px;
}
.guest-entry .guest-entry-actions {
  margin-top: 24px;
}
.entry-secondary-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  margin-top: 18px;
}
.entry-secondary-actions .guest-demo-link {
  margin: 0;
  font-size: 14px;
}
.guest-form-actions button {
  font-size: 15px;
}
@media (prefers-reduced-motion: no-preference) {
  .guest-entry .guest-primary:active,
  .guest-entry .guest-secondary:active,
  .guest-switch-form .guest-primary:active {
    transform: scaleX(1.02) scaleY(0.94);
  }
}
@media (max-height: 600px) {
  .is-entry-flow .guest-entry,
  .is-entry-flow .guest-switch-form {
    padding: 24px 0 40px;
  }
}
</style>

<style scoped>
.guest-page:has(> .entry-back) {
  position: relative;
  padding-top: calc(env(safe-area-inset-top, 0px) + 76px);
}
</style>

<style scoped>
.companion-entry-title {
  font-size: 22px !important;
  text-align: center;
  margin-bottom: 0 !important;
}
.guest-entry:has([data-companion-login]) {
  justify-content: flex-start;
  padding-top: 4px;
}
.guest-entry:has([data-companion-login]) > h1 {
  order: 0;
}
.guest-entry :deep(.companion-login) {
  margin-top: 12px;
}
</style>

<style scoped>
.entry-appearance {
  position: fixed;
  right: 24px;
  top: calc(env(safe-area-inset-top) + 12px);
  z-index: 5;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: var(--ui-surface-muted);
  color: var(--ui-ink);
  font-size: 22px;
}
</style>
