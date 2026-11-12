// -----------------------------------------------------------------------------
// A controllable clock and timer pair for NissanService: time only moves when
// a test says so, and the delayed confirmations run when the test asks.
// -----------------------------------------------------------------------------

export function createFakeClock(start = Date.parse('2026-11-12T10:00:00Z')) {
  let now = start;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
    setTimer(callback, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    get pending() {
      return timers.size;
    },
    /** Run every timer due by now (after advancing the clock as needed). */
    async runDue() {
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          await timer.callback();
        }
      }
    },
  };
}
