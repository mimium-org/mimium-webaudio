import { test, expect } from "@playwright/test";

test("mimium source compiles in AudioWorklet", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type CompileResult = { ok: boolean; reason?: string; outputChannels?: number };

    const runner = (window as unknown as { runMimiumCompileTest: () => Promise<CompileResult> })
      .runMimiumCompileTest;
    return Promise.race([
      runner(),
      new Promise<CompileResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "compile failed").toBeTruthy();
  expect(result.outputChannels).toBe(1);
});
