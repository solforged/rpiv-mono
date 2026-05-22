import { afterEach, describe, expect, it } from "vitest";
import { clearChildSession, isChildSession, markChildSession } from "./child-session.js";

describe("child-session marker", () => {
	afterEach(() => {
		clearChildSession();
	});

	it("isChildSession() returns false by default", () => {
		expect(isChildSession()).toBe(false);
	});

	it("markChildSession() flips the flag to true", () => {
		markChildSession();
		expect(isChildSession()).toBe(true);
	});

	it("clearChildSession() resets the flag to false", () => {
		markChildSession();
		clearChildSession();
		expect(isChildSession()).toBe(false);
	});

	it("clearChildSession() is idempotent on an unset flag", () => {
		clearChildSession();
		clearChildSession();
		expect(isChildSession()).toBe(false);
	});

	it("uses Symbol.for so a separate read path sees the same flag", () => {
		// Simulates the inlined predicate in rpiv-advisor — must read the SAME
		// symbol slot the workflow runner writes to. If this test fails, the
		// key strings have drifted out of sync.
		const KEY = Symbol.for("@juicesharp/rpiv-workflow:child-session");
		markChildSession();
		expect(Boolean((globalThis as unknown as Record<symbol, unknown>)[KEY])).toBe(true);
		clearChildSession();
		expect(Boolean((globalThis as unknown as Record<symbol, unknown>)[KEY])).toBe(false);
	});
});
