import { randomUUID } from 'node:crypto';

/** Unique, readable names so tests never collide, even in parallel against the same instance. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

/**
 * A date safely in the past for the server (YYYY-MM-DD). Using "today" is a trap: the CI runner is UTC
 * and the app runs in America/Sao_Paulo, so "today" on the runner can be "tomorrow" for the server,
 * and a future transaction does not count towards the current balance.
 */
export function pastDate(daysAgo = 2): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** A date in the future (YYYY-MM-DD), for periods that must include "now". */
export function futureDate(daysAhead: number): string {
  return pastDate(-daysAhead);
}
