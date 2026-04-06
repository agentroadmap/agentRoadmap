import assert from "node:assert";
import { describe, test } from "node:test";
import { box } from "../ui/blessed.ts";
import { createScreen } from "../ui/tui.ts";

describe("Unicode rendering", () => {
	test("Chinese characters display without replacement", () => {
		const screen = createScreen({ smartCSR: false });
		const content = "测试中文";
		const b = box({ parent: screen, content });
		screen.render();
		const rendered = String(b.content).replaceAll("\u0003", "");
		assert.strictEqual(rendered, content);
		screen.destroy();
	});
});
