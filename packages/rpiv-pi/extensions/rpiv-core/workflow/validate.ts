/**
 * Load-time graph validation for `Workflow` objects.
 *
 * Catches the wiring mistakes a TS type system can't reach on its own:
 * unknown edge sources/targets, unreachable nodes, missing terminals,
 * predicate functions that return targets outside the node set.
 *
 * `validateWorkflow` returns a flat array of `ValidationIssue`s — errors
 * for problems that would crash the runner, warnings for shapes that
 * work but probably aren't what the author intended (unreachable nodes,
 * implicit terminals via missing edges). The load pipeline can choose
 * to halt on any error and surface warnings non-fatally.
 *
 * No I/O, no throws — purely a graph walk + predicate probe.
 */

import type { EdgeContext, EdgeFn, EdgeTarget, Workflow } from "./api.js";

// ===========================================================================
// Issue shape
// ===========================================================================

export interface ValidationIssue {
	workflow: string;
	node?: string;
	severity: "error" | "warning";
	message: string;
}

const STOP = "stop";

// ===========================================================================
// Public — validateWorkflow
// ===========================================================================

/**
 * Validate one workflow. Aggregates all issues; never short-circuits. Caller
 * decides what's fatal — `severity === "error"` is the runner-blocking set.
 */
export function validateWorkflow(workflow: Workflow): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!workflow.nodes[workflow.start]) {
		issues.push(error(workflow.name, undefined, `start node "${workflow.start}" is not declared in nodes`));
	}

	checkEdgeKeys(workflow, issues);
	checkEdgeTargets(workflow, issues);
	checkMissingEdges(workflow, issues);
	checkReachability(workflow, issues);

	return issues;
}

// ===========================================================================
// Individual checks
// ===========================================================================

/** Every key in `edges` must be a declared node. */
function checkEdgeKeys(w: Workflow, issues: ValidationIssue[]): void {
	for (const from of Object.keys(w.edges)) {
		if (!w.nodes[from]) {
			issues.push(error(w.name, from, `edges["${from}"] references a node that's not declared in nodes`));
		}
	}
}

/**
 * Every edge target must resolve to a declared node or the `"stop"` sentinel.
 * String targets are checked directly. `EdgeFn` targets are checked via
 * `.targets` metadata when present, or by probing — see `enumerateEdgeFnTargets`.
 */
function checkEdgeTargets(w: Workflow, issues: ValidationIssue[]): void {
	for (const [from, target] of Object.entries(w.edges)) {
		for (const candidate of enumerateTargets(target, w.name, from, issues)) {
			if (candidate === STOP) continue;
			if (!w.nodes[candidate]) {
				issues.push(
					error(w.name, from, `edges["${from}"] resolves to "${candidate}" which is not declared in nodes`),
				);
			}
		}
	}
}

/** Nodes with no outgoing edge are implicit terminals — usually a missing connection. */
function checkMissingEdges(w: Workflow, issues: ValidationIssue[]): void {
	for (const name of Object.keys(w.nodes)) {
		if (!(name in w.edges)) {
			issues.push(
				warning(
					w.name,
					name,
					`node "${name}" has no edge — treated as terminal; declare \`${name}: "stop"\` to be explicit`,
				),
			);
		}
	}
}

/**
 * BFS from `start`; every declared node should be reachable. Orphans aren't
 * a runner error (they can't fire) but they're almost always a mistake worth
 * surfacing.
 */
function checkReachability(w: Workflow, issues: ValidationIssue[]): void {
	if (!w.nodes[w.start]) return; // already reported by start-check

	const reachable = new Set<string>();
	const frontier: string[] = [w.start];
	while (frontier.length > 0) {
		const cur = frontier.shift()!;
		if (reachable.has(cur)) continue;
		reachable.add(cur);

		const target = w.edges[cur];
		if (target === undefined || target === STOP) continue;

		for (const next of enumerateTargets(target, w.name, cur, [])) {
			if (next !== STOP && w.nodes[next] && !reachable.has(next)) frontier.push(next);
		}
	}

	for (const name of Object.keys(w.nodes)) {
		if (!reachable.has(name)) {
			issues.push(warning(w.name, name, `node "${name}" is unreachable from start "${w.start}"`));
		}
	}
}

// ===========================================================================
// Edge-target enumeration
// ===========================================================================

/**
 * Returns the set of possible string targets an `EdgeTarget` could resolve to.
 *
 * - String → singleton.
 * - `EdgeFn` with `.targets` metadata → declared targets (e.g. `threshold()`).
 * - `EdgeFn` without metadata → probe with a synthetic `EdgeContext`; if the
 *   probe throws or returns a non-string, record an issue and fall back to
 *   nothing (we can't see the full target set).
 *
 * Issues collected via the `issues` array — pass an empty array when you're
 * only interested in enumeration (reachability traversal).
 */
function enumerateTargets(target: EdgeTarget, workflow: string, from: string, issues: ValidationIssue[]): string[] {
	if (typeof target === "string") return [target];
	if (Array.isArray(target.targets) && target.targets.length > 0) return [...target.targets];
	return probeEdgeFn(target, workflow, from, issues);
}

/** Best-effort: invoke the edge function once with a minimal context. */
function probeEdgeFn(fn: EdgeFn, workflow: string, from: string, issues: ValidationIssue[]): string[] {
	const ctx = syntheticEdgeContext();
	try {
		const result = fn(ctx);
		if (typeof result === "string") return [result];
		issues.push(
			warning(
				workflow,
				from,
				`edge function for "${from}" returned a non-string value (${typeof result}); cannot verify target set`,
			),
		);
		return [];
	} catch (e) {
		issues.push(
			warning(
				workflow,
				from,
				`edge function for "${from}" threw during probe (${(e as Error).message}); cannot verify target set — add a \`targets\` field or use threshold()`,
			),
		);
		return [];
	}
}

function syntheticEdgeContext(): EdgeContext {
	return {
		manifest: undefined,
		// State shape is structurally typed; we hand the EdgeFn a frozen empty.
		state: Object.freeze({
			originalInput: "",
			artifactPath: undefined,
			manifest: undefined,
			stagesCompleted: 0,
			lastStageNumber: 0,
			success: false,
			error: undefined,
			backwardJumps: 0,
		}) as EdgeContext["state"],
	};
}

// ===========================================================================
// Issue constructors
// ===========================================================================

function error(workflow: string, node: string | undefined, message: string): ValidationIssue {
	return { workflow, node, severity: "error", message };
}

function warning(workflow: string, node: string | undefined, message: string): ValidationIssue {
	return { workflow, node, severity: "warning", message };
}
