/** One request at a time; explicit refreshes queue a fresh read after an in-flight read. */
export function createRefreshTask(load: (signal: AbortSignal) => Promise<void>) {
  const controller = new AbortController();
  let pending: Promise<void> | undefined;
  let queued = false;

  function refresh(force = false): Promise<void> {
    if (controller.signal.aborted) return Promise.resolve();
    if (pending) {
      if (force) queued = true;

      return pending;
    }
    pending = Promise.resolve()
      .then(async () => {
        do {
          queued = false;
          if (controller.signal.aborted) return;
          try {
            await load(controller.signal);
          } catch (error) {
            // A mutation may have queued a newer read while this request was failing.
            if (!queued || controller.signal.aborted) throw error;
          }
        } while (queued && !controller.signal.aborted);
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  }

  return { refresh, dispose: () => controller.abort() };
}
