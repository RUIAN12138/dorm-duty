import { defineStore } from "pinia";
import { ref } from "vue";
import { api, post } from "../api";
import type { User, Dorm } from "../api/types";
export const useSession = defineStore("session", () => {
  const user = ref<User | null>(null),
    dorm = ref<Dorm | null>(null),
    initialized = ref(false);
  let initPromise: Promise<void> | null = null;
  async function refresh() {
    user.value = await api<User>("/auth/me");
    dorm.value = await api<Dorm | null>("/dorms/current");
  }
  async function init() {
    // Retire the independent creator-device credential. Email grants are
    // reissued only by /email/enter after the cookie is validated.
    localStorage.removeItem("dorm-owner-token");
    if (initialized.value) return;
    if (!initPromise)
      initPromise = (async () => {
        if (!sessionStorage.getItem("dorm-token")) {
          try {
            const ownerToken = localStorage.getItem("dorm-email-admin-grant");
            if (ownerToken) sessionStorage.setItem("dorm-token", ownerToken);
          } catch {
            /* Private browsing can disable persistent storage. */
          }
        }
        if (sessionStorage.getItem("dorm-token")) {
          try {
            await refresh();
          } catch {
            user.value = null;
            dorm.value = null;
            // A connection failure keeps the email-derived grant; retry when service returns.
            if (sessionStorage.getItem("dorm-token")) return;
          }
        }
        initialized.value = true;
      })().finally(() => {
        initPromise = null;
      });
    await initPromise;
  }
  async function login(username: string, password: string) {
    const result = await post<{ access_token: string }>("/auth/login", {
      username,
      password,
    });
    sessionStorage.setItem("dorm-token", result.access_token);
    try {
      localStorage.removeItem("dorm-email-admin-grant");
    } catch {
      /* Optional persistence. */
    }
    await refresh();
    initialized.value = true;
  }
  function clear() {
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
