<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  choreRequest,
  claimChoreIdentity,
  savedChoreToken,
  saveChoreToken,
} from "../api/chores";
import ChoreBoard from "../components/ChoreBoard.vue";
import MarkerPicker from "../components/MarkerPicker.vue";
import MemberMark from "../components/MemberMark.vue";
import ChoreBottomNav from "../components/ChoreBottomNav.vue";
import { showToast } from "vant";
import { useSession } from "../stores/session";
import {
  guestApi,
  createGuestDorm,
  type GuestDorm,
  type GuestMember,
} from "../api/guest";

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
function startRequest() {
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
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
) {
  const { id, signal } = startRequest();
  try {
    const result = await guestApi<GuestDorm>(
      "/guest/dorm",
      { invite_code: code || undefined },
      signal,
    );
    const restored =
      result.members.find((m) => m.user_id === restoreId) || null;
    const token =
      restored && code
        ? knownOwnerToken ||
          (await creatorToken(restored, code)) ||
          savedChoreToken(code, restored.user_id)
        : "";
    if (!isCurrent(id, signal)) return false;
    // Commit only after the room is valid. Opening/cancelling a switch never logs out.
    dorm.value = result;
    inviteCode.value = code;
    viewMode.value = code ? "dorm" : "demo";
    member.value = restored;
    choreToken.value = token;
    choosingMember.value = false;
    pendingPerson.value = null;
    notice.value =
      restoreId && !restored ? "这位室友已不在当前宿舍，请重新选择。" : "";
    if (restored && code && !token) {
      pendingPerson.value = restored;
      choiceMarker.value = restored.marker_id || "pixel-01";
      member.value = null;
    }
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
  pendingPerson.value = person;
  choiceMarker.value = person.marker_id || "pixel-01";
}
async function confirmChoice() {
  if (!pendingPerson.value || loading.value || !choiceMarker.value) return;
  const person = pendingPerson.value;
  const { id, signal } = startRequest();
  try {
    const owner = await creatorToken(person);
    if (!isCurrent(id, signal)) return;
    if (owner) {
      if (choiceMarker.value !== person.marker_id)
        await choreRequest("/chores/marker", owner, {
          method: "PATCH",
          body: JSON.stringify({ marker_id: choiceMarker.value }),
          signal,
        });
      if (!isCurrent(id, signal)) return;
      member.value = { ...person, marker_id: choiceMarker.value };
      choreToken.value = owner;
    } else {
      const result = await claimChoreIdentity(
        {
          invite_code: inviteCode.value,
          member_id: person.user_id,
          marker_id: choiceMarker.value,
        },
        signal,
      );
      if (!isCurrent(id, signal)) return;
      member.value = result.member;
      choreToken.value = result.access_token;
      saveChoreToken(inviteCode.value, person.user_id, result.access_token);
    }
    pendingPerson.value = null;
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
  error.value = "";
}
function identityExpired() {
  if (member.value) saveChoreToken(inviteCode.value, member.value.user_id, "");
  cancelSelection();
  member.value = null;
  choreToken.value = "";
  notice.value = "这台设备的身份已失效，请重新选择你的名字。";
}
function changeMember() {
  cancelSelection();
  choosingMember.value = true;
  notice.value = "";
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
  cancelSelection();
  notice.value = "";
  createdInvite.value = "";
  draftCode.value = "";
  changingDorm.value = true;
}
function openCreate() {
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
      localStorage.setItem("dorm-owner-token", result.access_token);
    } catch {
      /* This device can still manage in its current session. */
    }
    try {
      await session.refresh();
    } catch {
      /* The created room and owner token remain usable after reconnecting. */
    }
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
      query: { invite_code: result.invite_code },
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
    query: code ? { invite_code: code } : {},
  });
}
function visibleRefresh() {
  if (
    document.visibilityState === "visible" &&
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
watch(
  () => route.query.invite_code,
  (value) => {
    const code = normalizeCode(Array.isArray(value) ? value[0] : value);
    // Notification URLs and back/forward navigation may omit the invite query.
    // Absence is not a request to leave the saved room.
    if (code && code !== inviteCode.value) {
      const saved = storedChoice();
      void loadDorm(
        code,
        code === saved.invite_code ? saved.member_id : undefined,
      );
    }
  },
);

onMounted(() => {
  const saved = storedChoice();
  const queryCode = route.query.invite_code;
  const code =
    queryCode !== undefined
      ? normalizeCode(Array.isArray(queryCode) ? queryCode[0] : queryCode) ||
        saved.invite_code
      : saved.invite_code;
  inviteCode.value = code;
  if (code || saved.guest_mode === "demo")
    void loadDorm(
      code,
      code === saved.invite_code ? saved.member_id : undefined,
    );
  document.addEventListener("visibilitychange", visibleRefresh);
  window.addEventListener("focus", visibleRefresh);
  window.addEventListener("online", visibleRefresh);
});
onUnmounted(() => {
  controller?.abort();
  document.removeEventListener("visibilitychange", visibleRefresh);
  window.removeEventListener("focus", visibleRefresh);
  window.removeEventListener("online", visibleRefresh);
});
</script>

<template>
  <main class="guest-page" :class="{ 'has-chore-nav': navVisible }">
    <header v-if="!navVisible" class="guest-header">
      <div class="guest-brand-line">
        <span class="guest-brand">轮到<span aria-hidden="true">.</span></span>
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
      <h1 id="create-title">创建你的宿舍</h1>
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
        <p v-if="error" class="guest-create-error" role="alert">{{ error }}</p>
        <button
          type="submit"
          class="guest-primary"
          data-testid="guest-create-submit"
          :disabled="loading"
        >
          {{ loading ? "正在创建…" : "创建宿舍" }}
        </button>
      </form>
      <p class="guest-create-note">此设备将保存管理权限。</p>
      <div class="guest-form-actions">
        <button :disabled="loading" @click="cancelSelection">返回</button>
      </div>
    </section>
    <section
      v-else-if="changingDorm"
      class="guest-dorm-form"
      aria-labelledby="switch-title"
    >
      <h1 id="switch-title">加入你的宿舍</h1>
      <form @submit.prevent="switchDorm()">
        <label for="guest-invite">宿舍邀请码</label>
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
        <button :disabled="loading" @click="switchDorm(true)">游客体验</button>
        <button @click="cancelSelection">
          {{ member ? "返回当前任务" : "取消" }}
        </button>
      </div>
    </section>
    <template v-else>
      <div v-if="loading" class="guest-loading" role="status">
        <van-loading size="20px" color="#111111" />正在查看安排
      </div>
      <div v-if="error && !pendingPerson" class="guest-error" role="alert">
        <h1>暂时无法查看</h1>
        <p>{{ error }}</p>
        <button class="guest-primary" :disabled="loading" @click="refresh">
          重新加载
        </button>
      </div>
      <section
        v-else-if="viewMode === 'entry' && !loading"
        class="guest-entry"
        aria-labelledby="entry-title"
      >
        <h1 id="entry-title">先找到你的宿舍</h1>
        <div class="guest-entry-actions">
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
        <button
          class="guest-demo-link"
          data-testid="guest-demo-entry"
          @click="switchDorm(true)"
        >
          游客体验<van-icon name="arrow" aria-hidden="true" />
        </button>
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
                : "你是哪位室友？"
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
                error = '';
              "
            >
              重新选择名字
            </button>
          </template>
          <p v-if="notice" class="guest-notice" role="status">{{ notice }}</p>
          <div
            v-if="!pendingPerson && dorm.members.length"
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
            v-else-if="!pendingPerson && !dorm.members.length"
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
            :key="`${inviteCode}:${member.user_id}:${choreToken}`"
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
    <ChoreBottomNav v-if="navVisible" :section="section" :invite="inviteCode" />
  </main>
</template>

<style scoped>
.guest-page.has-chore-nav {
  padding-bottom: calc(104px + env(safe-area-inset-bottom));
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
