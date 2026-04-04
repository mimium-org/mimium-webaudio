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

test("mimium compile failure is catchable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type FailResult = { ok: boolean; reason?: string };

    const runner = (
      window as unknown as { runMimiumCompileFailTest: () => Promise<FailResult> }
    ).runMimiumCompileFailTest;
    return Promise.race([
      runner(),
      new Promise<FailResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "compile error was not caught").toBeTruthy();
  expect(result.reason).toMatch(/Failed to load audio analyzer WASM module|compile|unknown/i);
});

test("mimium use playback smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type SmokeResult = {
      ok: boolean;
      reason?: string;
      elapsed?: number;
      outputChannels?: number;
    };

    const runner = (
      window as unknown as { runMimiumPlaybackSmokeTest: () => Promise<SmokeResult> }
    ).runMimiumPlaybackSmokeTest;

    return Promise.race([
      runner(),
      new Promise<SmokeResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "playback smoke failed").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
  expect((result.elapsed ?? 0) > 0).toBeTruthy();
});

test("mimium multi-use playback smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type SmokeResult = {
      ok: boolean;
      reason?: string;
      elapsed?: number;
      outputChannels?: number;
    };

    const runner = (
      window as unknown as { runMimiumMultiUsePlaybackSmokeTest: () => Promise<SmokeResult> }
    ).runMimiumMultiUsePlaybackSmokeTest;

    return Promise.race([
      runner(),
      new Promise<SmokeResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "multi-use playback smoke failed").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
  expect((result.elapsed ?? 0) > 0).toBeTruthy();
});
