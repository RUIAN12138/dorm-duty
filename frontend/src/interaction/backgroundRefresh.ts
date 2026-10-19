export type RefreshReason = "poll" | "foreground" | "online";

// Only background reads pass this gate. User writes and explicit refreshes stay
// immediate; foreground recovery bypasses polling backoff but coalesces bursts.
export function createBackgroundRefresh(
  refresh: () => Promise<boolean>,
  now: () => number = Date.now,
) {
  let lastStarted = -Infinity,
    nextPoll = -Infinity,
    failures = 0;
  let running: Promise<boolean> | null = null;
  let disposed = false,
    successfulEpoch = 0;
  function run(reason: RefreshReason): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (running) return running;
    const time = now();
    if (
      (time - lastStarted < 1500 && !(reason === "online" && failures > 0)) ||
      (reason === "poll" && time < nextPoll)
    )
      return Promise.resolve(false);
    lastStarted = time;
    const epoch = successfulEpoch;
    const promise = Promise.resolve()
      .then(() => (disposed || epoch !== successfulEpoch ? false : refresh()))
      .catch(() => false)
      .then((success) => {
        if (!disposed && epoch === successfulEpoch) {
          failures = success ? 0 : failures + 1;
          const delay = success
            ? 10000
            : Math.min(60000, 10000 * 2 ** Math.min(failures, 3));
          nextPoll = success ? -Infinity : now() + delay;
        }
        return success;
      })
      .finally(() => {
        if (running === promise) running = null;
      });
    running = promise;
    return promise;
  }
  return {
    run,
    interrupt() {
      if (disposed) return;
      successfulEpoch++;
      running = null;
      lastStarted = -Infinity;
    },
    markSuccessful() {
      if (disposed) return;
      successfulEpoch++;
      failures = 0;
      nextPoll = -Infinity;
      lastStarted = now();
    },
    dispose() {
      disposed = true;
    },
  };
}

// A board read is frequent; binding the same push device on every read is not
// necessary. In-flight work is shared, success/unsupported results are briefly
// cached, failures can retry on the next board refresh. Explicit readiness and
// network-recovery signals invalidate this optimization.
export function createPushSyncGate(
  sync: (token: string) => Promise<boolean>,
  now: () => number = Date.now,
) {
  let identity = "",
    lastFinished = -Infinity,
    cached = false;
  let pending: Promise<boolean> | null = null;
  let epoch = 0,
    disposed = false;
  function run(token: string, force = false): Promise<boolean> {
    if (disposed || !token) return Promise.resolve(false);
    if (token !== identity) {
      identity = token;
      lastFinished = -Infinity;
      pending = null;
      epoch++;
    }
    if (pending) return pending;
    if (!force && now() - lastFinished < 60000) return Promise.resolve(cached);
    const current = epoch;
    const promise = Promise.resolve()
      .then(() => {
        if (disposed || current !== epoch) return false;
        return sync(token);
      })
      .then((result) => {
        if (!disposed && current === epoch) {
          cached = result;
          lastFinished = now();
        }
        return result;
      })
      .catch(() => false)
      .finally(() => {
        if (current === epoch && pending === promise) pending = null;
      });
    pending = promise;
    return promise;
  }
  return {
    run,
    dispose() {
      disposed = true;
      epoch++;
      pending = null;
    },
  };
}
