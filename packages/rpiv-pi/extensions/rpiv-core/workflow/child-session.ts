/**
 * Workflow child-session marker — process-wide flag indicating that the current
 * `session_start` event was triggered by `runWorkflow` spawning an inner stage
 * (not by the user opening a Pi session).
 *
 * `session_start` handlers in rpiv-core (this package) and rpiv-advisor consult
 * this marker to suppress cosmetic, user-facing notifications when re-emitting
 * them inside a workflow chain would double up the parent session's banner.
 * State mutation (advisor model restore, agent sync, root guidance injection)
 * is unaffected — only `ui.notify` calls are gated.
 *
 * Keyed on a `Symbol.for(...)` so any package can read the flag without an
 * import (avoids a circular dep between rpiv-advisor and rpiv-pi). Matches the
 * pattern advisor.ts:152-158 already uses for its tool-inventory cache.
 *
 * Scope: marked for the lifetime of one `runWorkflow` call (covers all stages
 * and implement phases), cleared in a `finally` so an exception in a stage
 * doesn't strand the flag. The runner is serial, so concurrent workflows are
 * not a current concern.
 */

const CHILD_SESSION_KEY = Symbol.for("@juicesharp/rpiv-workflow:child-session");

type Global = Record<symbol, unknown>;

export function markChildSession(): void {
	(globalThis as unknown as Global)[CHILD_SESSION_KEY] = true;
}

export function clearChildSession(): void {
	delete (globalThis as unknown as Global)[CHILD_SESSION_KEY];
}

export function isChildSession(): boolean {
	return Boolean((globalThis as unknown as Global)[CHILD_SESSION_KEY]);
}
