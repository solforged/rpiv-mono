/**
 * Internal utilities shared across the rpiv-workflow package.
 *
 * Not part of the public surface — not re-exported from `index.ts`. If a
 * helper graduates into the documented authoring or embedding contract,
 * move it out of here and into the appropriate domain module.
 */

import { isAbsolute, join } from "node:path";
import type { RunState } from "./types.js";

/** Exhaustiveness guard for discriminated-union switches. */
export function assertNever(value: never): never {
	throw new Error(`assertNever: unreachable value ${String(value)}`);
}

/**
 * Canonical accessor for "the artifact path the chain is currently carrying."
 * Prefers `state.manifest?.artifact_path` (set by artifact-emit stages with a
 * structured frontmatter manifest); falls back to `state.fallbackArtifactPath`,
 * which is only written when (a) an `agent-end` stage extracted a bare path
 * without a manifest, or (b) a phase row committed an artifact. Replaces the
 * load-bearing `state.artifactPath` mirror from earlier versions — the helper
 * IS the invariant.
 */
export function currentArtifactPath(state: RunState): string | undefined {
	return state.manifest?.artifact_path ?? state.fallbackArtifactPath;
}

/**
 * Race a promise against `ms`. The inner promise is NOT cancelled — Pi's
 * `ctx.waitForIdle()` has no abort signal today; the dangling promise becomes
 * inert when the next stage's `newSession` replaces the ctx.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), ms);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

/**
 * Resolve `p` against `cwd`. Returns `p` unchanged if it is already absolute;
 * otherwise joins `cwd + p` with the platform path separator. Uses
 * `path.isAbsolute` so Windows drive-letter paths are handled correctly
 * (POSIX-only `startsWith("/")` checks miss `C:\...`).
 */
export function resolveUnderCwd(cwd: string, p: string): string {
	return isAbsolute(p) ? p : join(cwd, p);
}
