import { defineStore } from "pinia";
import { ref } from "vue";
import { api, post } from "../api";
import type { User, Dorm } from "../api/types";
export const useSession = defineStore("session", () => {
  const user = ref<User | null>(null),
    dorm = ref<Dorm | null>(null),
    initialized = ref(false);
  let initPromise: Promise<void> | null = null;
  let initToken: string | null = null;
  let validatedToken: string | null | undefined;
  let lifecycle = 0,
    requestId = 0;
  let pending: { token: string | null; promise: Promise<void> } | null = null;
  function refresh(): Promise<void> {
    const token = sessionStorage.getItem("dorm-token");
    if (pending?.token === token) return pending.promise;
    const id = ++requestId;
    if (validatedToken !== undefined && validatedToken !== token) {
      user.value = null;
      dorm.value = null;
      initialized.value = false;
    }
    // Pin both reads to one identity and commit the pair together.
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const promise = Promise.all([
      api<User>("/auth/me", { headers }),
      api<Dorm | null>("/dorms/current", { headers }),
    ])
      .then(([nextUser, nextDorm]) => {
        if (id !== requestId || sessionStorage.getItem("dorm-token") !== token)
          return;
        user.value = nextUser;
        dorm.value = nextDorm;
        validatedToken = token;
        initialized.value = true;
      })
      .finally(() => {
        if (pending?.promise === promise) pending = null;
      });
    pending = { token, promise };
    return promise;
  }
  async function init(): Promise<void> {
    // Independent creator credentials are retired; restore only an email grant.
    try {
      localStorage.removeItem("dorm-owner-token");
    } catch {
      /* Optional persistence. */
    }
    let token = sessionStorage.getItem("dorm-token");
    if (!token) {
      try {
        token = localStorage.getItem("dorm-email-admin-grant");
        if (token) sessionStorage.setItem("dorm-token", token);
      } catch {
        /* Optional persistence. */
      }
    }
    if (validatedToken !== token) {
      user.value = null;
      dorm.value = null;
      initialized.value = false;
    }
    if (initialized.value && validatedToken === token) return;
    if (initPromise && initToken === token) return initPromise;
    const epoch = lifecycle;
    const promise = (async () => {
      if (token) {
        try {
          await refresh();
        } catch {
          if (epoch !== lifecycle) return;
          if (sessionStorage.getItem("dorm-token") !== token) return init();
          user.value = null;
          dorm.value = null;
          // Keep the email grant on connection failure so the next init retries.
          if (sessionStorage.getItem("dorm-token")) return;
        }
      }
      if (epoch === lifecycle && sessionStorage.getItem("dorm-token") !== token)
        return init();
      if (
        epoch === lifecycle &&
        sessionStorage.getItem("dorm-token") === token
      ) {
        validatedToken = token;
        initialized.value = true;
      }
    })().finally(() => {
      if (initPromise === promise) initPromise = null;
    });
    initToken = token;
    initPromise = promise;
    return promise;
  }
  async function login(username: string, password: string) {
    const epoch = ++lifecycle;
    const result = await post<{ access_token: string }>("/auth/login", {
      username,
      password,
    });
    if (epoch !== lifecycle) return false;
    sessionStorage.setItem("dorm-token", result.access_token);
    try {
      localStorage.removeItem("dorm-email-admin-grant");
    } catch {
      /* Optional persistence. */
    }
    await refresh();
    if (
      epoch === lifecycle &&
      sessionStorage.getItem("dorm-token") === result.access_token
    ) {
      initialized.value = true;
      return true;
    }
    return false;
  }
  function clear() {
    lifecycle++;
    requestId++;
    pending = null;
    initPromise = null;
    initialized.value = false;
    validatedToken = undefined;
    sessionStorage.removeItem("dorm-token");
    try {
      localStorage.removeItem("dorm-email-admin-grant");
    } catch {
      /* Optional persistence. */
    }
    user.value = null;
    dorm.value = null;
  }
  return { user, dorm, initialized, init, refresh, login, clear };
});
