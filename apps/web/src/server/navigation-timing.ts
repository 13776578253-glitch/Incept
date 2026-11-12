import 'server-only';

type TraceNavigation = <T>(phase: string, work: () => T | PromiseLike<T>) => Promise<T>;
const traceKey = Symbol.for('incept.navigationTiming');

export async function traceNavigation<T>(phase: string, work: () => T | PromiseLike<T>): Promise<T> {
  const trace = (globalThis as typeof globalThis & Record<symbol, TraceNavigation | undefined>)[traceKey];
  return trace ? trace(phase, work) : work();
}
