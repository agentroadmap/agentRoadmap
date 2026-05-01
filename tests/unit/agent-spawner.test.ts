import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { describe, it } from "node:test";

import {
	assertResolvedRouteMetadata,
	buildSpawnProcessEnv,
	liveChildCount,
	renderClosingHint,
	terminateLiveChildren,
	trackLiveChild,
} from "../../src/core/orchestration/agent-spawner.ts";

describe("live-child registry", () => {
	it("starts empty when no children have been spawned", () => {
		assert.equal(liveChildCount(), 0);
	});

	it("terminateLiveChildren is a no-op on empty registry", async () => {
		const result = await terminateLiveChildren({ graceMs: 0 });
		assert.deepEqual(result, { signalled: 0, killed: 0 });
	});

	it("removes tracked children when they close", async () => {
		const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
		trackLiveChild(child);
		assert.equal(liveChildCount(), 1);

		await once(child, "close");

		assert.equal(liveChildCount(), 0);
	});

	it("signals tracked children during termination", async () => {
		const child = spawn(
			process.execPath,
			["-e", "setInterval(() => {}, 1000)"],
			{
				stdio: "ignore",
			},
		);
		trackLiveChild(child);
		assert.equal(liveChildCount(), 1);

		const result = await terminateLiveChildren({
			graceMs: 1000,
			log: () => {},
		});

		assert.equal(result.signalled, 1);
		assert.equal(liveChildCount(), 0);
	});
});

describe("Hermes route compatibility", () => {
	it("accepts DB-shaped Hermes route metadata", () => {
		assert.doesNotThrow(() =>
			assertResolvedRouteMetadata("openclaw", {
				modelName: "xiaomi/mimo-v2-pro",
				routeProvider: "nous",
				agentProvider: "openclaw",
				agentCli: "hermes",
				cliPath: null,
				apiSpec: "openai",
				baseUrl: "https://inference-api.nousresearch.com/v1",
				planType: "token_plan",
				costPer1kInput: 0.0002,
				costPerMillionInput: 0,
				costPerMillionOutput: 0,
				apiKeyEnv: "NOUS_API_KEY",
				apiKeyFallbackEnv: "OPENAI_API_KEY",
				baseUrlEnv: "OPENAI_BASE_URL",
				cliApiKeyEnv: null,
				apiKeyPrimary: null,
				apiKeySecondary: null,
				spawnToolsets:
					"web,browser,terminal,file,code_execution,vision,image_gen,tts,skills,todo,memory,session_search,clarify,cronjob,messaging",
				spawnDelegate: false,
			}),
		);
	});

	it("rejects route metadata that does not match the worktree provider", () => {
		assert.throws(() =>
			assertResolvedRouteMetadata("openclaw", {
				modelName: "xiaomi/mimo-v2-pro",
				routeProvider: "nous",
				agentProvider: "claude",
				agentCli: "claude",
				cliPath: null,
				apiSpec: "openai",
				baseUrl: "https://inference-api.nousresearch.com/v1",
				planType: "token_plan",
				costPer1kInput: 0.0002,
				costPerMillionInput: 0,
				costPerMillionOutput: 0,
				apiKeyEnv: "NOUS_API_KEY",
				apiKeyFallbackEnv: "OPENAI_API_KEY",
				baseUrlEnv: "OPENAI_BASE_URL",
				cliApiKeyEnv: null,
				apiKeyPrimary: null,
				apiKeySecondary: null,
				spawnToolsets:
					"web,browser,terminal,file,code_execution,vision,image_gen,tts,skills,todo,memory,session_search,clarify,cronjob,messaging",
				spawnDelegate: false,
			}),
		);
	});

	it("does not pass Anthropic credentials into Hermes workers", () => {
		const originalAnthropic = process.env.ANTHROPIC_API_KEY;
		const originalNous = process.env.NOUS_API_KEY;
		const originalOpenAI = process.env.OPENAI_API_KEY;
		process.env.ANTHROPIC_API_KEY = "anthropic-secret";
		process.env.NOUS_API_KEY = "nous-secret";
		process.env.OPENAI_API_KEY = "openai-secret";

		try {
			const env = buildSpawnProcessEnv({
				worktree: "openclaw-hermes",
				route: {
					modelName: "xiaomi/mimo-v2-pro",
					routeProvider: "nous",
					agentProvider: "openclaw",
					agentCli: "hermes",
					cliPath: null,
					apiSpec: "openai",
					baseUrl: "https://inference-api.nousresearch.com/v1",
					planType: "token_plan",
					costPer1kInput: 0.0002,
					costPerMillionInput: 0,
					costPerMillionOutput: 0,
					apiKeyEnv: "NOUS_API_KEY",
					apiKeyFallbackEnv: "OPENAI_API_KEY",
					baseUrlEnv: "OPENAI_BASE_URL",
					cliApiKeyEnv: null,
					apiKeyPrimary: null,
					apiKeySecondary: null,
					spawnToolsets:
						"web,browser,terminal,file,code_execution,vision,image_gen,tts,skills,todo,memory,session_search,clarify,cronjob,messaging",
					spawnDelegate: false,
				},
				agentEnv: {
					DATABASE_URL: "postgresql://example",
					NOUS_API_KEY: "nous-secret",
					OPENAI_API_KEY: "openai-secret",
					ANTHROPIC_API_KEY: "anthropic-secret",
				},
				extraEnv: {},
			});

			assert.equal(env.ANTHROPIC_API_KEY, undefined);
			assert.equal(env.OPENAI_API_KEY, undefined);
			assert.equal(env.NOUS_API_KEY, "nous-secret");
			assert.equal(env.AGENT_PROVIDER, "openclaw");
		} finally {
			if (originalAnthropic === undefined) {
				delete process.env.ANTHROPIC_API_KEY;
			} else {
				process.env.ANTHROPIC_API_KEY = originalAnthropic;
			}
			if (originalNous === undefined) {
				delete process.env.NOUS_API_KEY;
			} else {
				process.env.NOUS_API_KEY = originalNous;
			}
			if (originalOpenAI === undefined) {
				delete process.env.OPENAI_API_KEY;
			} else {
				process.env.OPENAI_API_KEY = originalOpenAI;
			}
		}
	});
});

describe("P738 HF-B: closing hint forbids worker-side set_maturity", () => {
	const baseInput = {
		contextPackage: "## Proposal Context\n- Proposal: P999",
		task: "Implement AC-1 through AC-3.",
		proposalId: 999,
	};

	for (const stage of [
		"DRAFT",
		"REVIEW",
		"DEVELOP",
		"MERGE",
		"TRIAGE",
		"FIX",
	]) {
		it(`emits no 'set_maturity' instruction for stage=${stage}`, () => {
			const out = renderClosingHint({ ...baseInput, stage });
			assert.ok(
				!/\bset_maturity\b\s*\(?(action)?[^)]*?\)?\s*to\s+advance/i.test(out),
				`stage=${stage} briefing must not instruct worker to call set_maturity → mature`,
			);
			assert.ok(
				!out.includes(`maturity "mature"`),
				`stage=${stage} briefing must not contain literal 'maturity "mature"' instruction`,
			);
			assert.ok(
				out.includes("spawn_summary_emit"),
				`stage=${stage} briefing must point worker at spawn_summary_emit`,
			);
			assert.ok(
				/DO NOT call .?set_maturity.?/i.test(out),
				`stage=${stage} briefing must explicitly forbid set_maturity`,
			);
		});
	}

	it("emits no closing hint at all for terminal COMPLETE stage", () => {
		const out = renderClosingHint({ ...baseInput, stage: "COMPLETE" });
		assert.ok(!out.includes("## Completion"));
		assert.ok(!out.includes("set_maturity"));
		assert.ok(!out.includes("spawn_summary_emit"));
	});

	it("emits no closing hint at all for terminal DEPLOYED stage", () => {
		const out = renderClosingHint({ ...baseInput, stage: "DEPLOYED" });
		assert.ok(!out.includes("## Completion"));
		assert.ok(!out.includes("set_maturity"));
	});

	it("preserves contextPackage and task content verbatim", () => {
		const out = renderClosingHint({ ...baseInput, stage: "DEVELOP" });
		assert.ok(out.startsWith("## Proposal Context\n- Proposal: P999"));
		assert.ok(out.includes("## Task\nImplement AC-1 through AC-3."));
	});
});
