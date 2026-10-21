import { computed, ref } from "vue";
import { appPath } from "../api/path";

export const installedVersion = import.meta.env.VITE_RELEASE_VERSION || "";
export const updateReady = ref(false);
export const updatePhase = ref<
  "idle" | "checking" | "current" | "available" | "error" | "installing"
>("idle");
export const updateError = ref("");
export const latestVersion = ref("");
export const updateBusy = computed(() =>
  ["checking", "installing"].includes(updatePhase.value),
);
let registration: ServiceWorkerRegistration | undefined;
let fallbackReload = false;
let checkFlight: Promise<void> | undefined;
let installFlight: Promise<void> | undefined;

export function configureUpdates(options: {
  registration?: ServiceWorkerRegistration;
}) {
  if (options.registration) registration = options.registration;
}
export function announceUpdate() {
  updateReady.value = true;
  if (!updateBusy.value) updatePhase.value = "available";
}
function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("检查更新超时，请稍后重试")),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
function installation(worker: ServiceWorker) {
  return new Promise<void>((resolve, reject) => {
    const check = () => {
      if (worker.state === "installed" || worker.state === "activated") done();
      else if (worker.state === "redundant")
        done(new Error("新版本下载失败，请重新检查"));
    };
    const timer = setTimeout(
      () => done(new Error("新版本正在准备，请稍后重新检查")),
      5000,
    );
    function done(error?: Error) {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      if (error) reject(error);
      else resolve();
    }
    worker.addEventListener("statechange", check);
    check();
  });
}
async function inspect() {
  updatePhase.value = "checking";
  updateError.value = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    if (!navigator.onLine) throw new Error("当前离线，请联网后检查更新");
    // Fetch the deployed version, never the stale precached application shell.
    const response = await fetch(appPath("/health"), {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const health = await response.json();
    if (
      !response.ok ||
      typeof health.release?.version !== "string" ||
      !health.release.version
    )
      throw new Error("暂时无法检查版本，请稍后重试");
    latestVersion.value = health.release.version;
    clearTimeout(timer);
    const changed =
      !!installedVersion && latestVersion.value !== installedVersion;
    if ("serviceWorker" in navigator) {
      registration ||= await bounded(
        navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL),
        1500,
      );
      if (registration) {
        await bounded(registration.update(), 5000);
        if (registration.installing)
          await installation(registration.installing);
        if (registration.waiting) announceUpdate();
      }
    }
    fallbackReload =
      changed &&
      !registration?.waiting &&
      !("serviceWorker" in navigator && navigator.serviceWorker.controller);
    if (fallbackReload) announceUpdate();
    if (changed && !updateReady.value)
      throw new Error("新版本正在准备，请稍后重新检查");
    updatePhase.value = updateReady.value ? "available" : "current";
  } catch (error) {
    updateError.value = controller.signal.aborted
      ? "检查更新超时，请稍后重试"
      : error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
        ? error.message
        : "检查更新失败，请检查网络后重试";
    updatePhase.value = updateReady.value ? "available" : "error";
  } finally {
    clearTimeout(timer);
  }
}
export function checkForUpdates() {
  if (installFlight) return installFlight;
  if (!checkFlight)
    checkFlight = inspect().finally(() => {
      checkFlight = undefined;
    });
  return checkFlight;
}
async function install() {
  updatePhase.value = "installing";
  updateError.value = "";
  try {
    if (!navigator.onLine) throw new Error("当前离线，请联网后更新");
    if (fallbackReload) {
      window.location.reload();
      return;
    }
    if (!registration && "serviceWorker" in navigator)
      registration = await bounded(
        navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL),
        1500,
      );
    const worker = registration?.waiting;
    if (!worker) {
      if (
        registration?.active &&
        latestVersion.value &&
        latestVersion.value !== installedVersion
      ) {
        window.location.reload();
        return;
      }
      updateReady.value = false;
      throw new Error("更新状态已变化，请重新检查");
    }
    // skipWaiting alone need not claim this document: reload after the worker
    // becomes active, rather than waiting forever for controllerchange.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => done(new Error("更新未完成，请重试")),
        10000,
      );
      const changed = () => {
        if (worker.state === "activated") done();
        else if (worker.state === "redundant")
          done(new Error("更新失败，请重新检查"));
      };
      function done(error?: Error) {
        clearTimeout(timer);
        worker?.removeEventListener("statechange", changed);
        if (error) reject(error);
        else resolve();
      }
      worker.addEventListener("statechange", changed);
      try {
        worker.postMessage({ type: "SKIP_WAITING" });
        changed();
      } catch {
        done(new Error("更新失败，请重试"));
      }
    });
    window.location.reload();
  } catch (error) {
    updateError.value =
      error instanceof Error ? error.message : "更新失败，请重试";
    updatePhase.value = updateReady.value ? "available" : "error";
    throw error;
  }
}
export function installUpdate() {
  if (!updateReady.value || checkFlight)
    return checkFlight || Promise.resolve();
  if (!installFlight)
    installFlight = install().finally(() => {
      installFlight = undefined;
    });
  return installFlight;
}
