/**
 * Manifest types — the inter-stage data channel. A manifest is extracted
 * by the runner (not authored by the agent), flows through RunState, and
 * is persisted to the JSONL audit log.
 *
 * Audience: predicate authors and downstream-node authors reading
 * `manifest.data`. The extractor authoring surface (the API a custom
 * `Extractor` implements) lives in `extractor-types.ts`.
 */

import type { ExtractorPayload } from "./extractor-types.js";
import type { GitCommitData } from "./extractors/git-commit.js";

// ---------------------------------------------------------------------------
// Manifest envelope
// ---------------------------------------------------------------------------

export interface ManifestMeta {
	skill: string;
	/** 1-based; matches `WorkflowStage.stageNumber`. */
	stageNumber: number;
	/** ISO-8601. */
	ts: string;
	/** Duplicated from header for ergonomic JSONL reads. */
	runId: string;
}

export interface Manifest<K extends string = string, D = unknown> {
	kind: K;
	/** Present when the stage produced a file consumable by downstream stages. */
	artifact_path?: string;
	data: D;
	meta: ManifestMeta;
}

// ---------------------------------------------------------------------------
// Built-in manifest kinds
//
// Aliases enable consumer-side tagged-union narrowing on `manifest.kind` —
// the value of the abstraction is the narrowing pattern, not the count of
// current importers. Data shapes live with their producing extractors;
// `GitCommitData` is sourced from `extractors/git-commit.ts` (type-only
// import — no runtime cycle).
// ---------------------------------------------------------------------------

export type ArtifactMdManifest = Manifest<"artifact-md", Record<string, unknown>>;
export type SideEffectManifest = Manifest<"side-effect", Record<string, never>>;
export type GitCommitManifest = Manifest<"git-commit", GitCommitData>;

// ---------------------------------------------------------------------------
// Extractor types — re-exported here so consumers can `import { Extractor,
// ExtractorCtx, ... } from "../manifest.js"` without rewriting every site.
// The canonical definitions live in `extractor-types.ts`; new code can
// import from there directly.
// ---------------------------------------------------------------------------

export type {
	Extractor,
	ExtractorCtx,
	ExtractorFn,
	ExtractorPayload,
	ExtractorResult,
	SnapshotCtx,
	SnapshotFn,
} from "./extractor-types.js";

// ---------------------------------------------------------------------------
// Manifest construction
// ---------------------------------------------------------------------------

/** Single source of manifest metadata authorship. */
export function finalizeManifest(payload: ExtractorPayload, meta: ManifestMeta): Manifest {
	return {
		kind: payload.kind,
		artifact_path: payload.artifact_path,
		data: payload.data,
		meta,
	};
}
