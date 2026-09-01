/** Distinguishes "the timeout elapsed" from any legitimate resolved value, including `null`. */
export const TIMED_OUT = Symbol('timed-out');

/**
 * Resolves with whatever `promise` resolves to, or `TIMED_OUT` if `ms`
 * elapses first. The loser keeps running — this races for a first result, it
 * never cancels `promise` — so the caller decides what "losing" means (stay
 * loading and keep awaiting it, or move on and let it finish in the
 * background).
 */
export const raceWithDelay = <T>(
  promise: Promise<T>,
  ms: number
): Promise<T | typeof TIMED_OUT> => {
  let timer: ReturnType<typeof setTimeout>;
  const delay = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, delay]).finally(() => clearTimeout(timer));
};
