export function isTimingLoggingEnabled(): boolean {
  return process.env.FALANCE_TIMING_LOGS === "true";
}

export function logTiming(
  scope: string,
  startedAt: number,
  fields: Record<string, string | number | undefined> = {},
): void {
  if (!isTimingLoggingEnabled()) return;

  console.info("[Timing]", {
    scope,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...fields,
  });
}

export function logDuration(
  scope: string,
  durationMs: number,
  fields: Record<string, string | number | undefined> = {},
): void {
  if (!isTimingLoggingEnabled()) return;

  console.info("[Timing]", {
    scope,
    durationMs: Math.max(0, Math.round(durationMs)),
    ...fields,
  });
}

export function measureDuration(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
