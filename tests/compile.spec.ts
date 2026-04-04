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

test("mimium core import compile smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type CompileResult = { ok: boolean; reason?: string; outputChannels?: number };

    const runner = (
      window as unknown as { runMimiumCoreUseCompileTest: () => Promise<CompileResult> }
    ).runMimiumCoreUseCompileTest;

    return Promise.race([
      runner(),
      new Promise<CompileResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "core import compile failed").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
});

test("mimium core wildcard import compile smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type CompileResult = { ok: boolean; reason?: string; outputChannels?: number };

    const runner = (
      window as unknown as { runMimiumCoreWildcardCompileTest: () => Promise<CompileResult> }
    ).runMimiumCoreWildcardCompileTest;

    return Promise.race([
      runner(),
      new Promise<CompileResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "core wildcard import compile failed").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
});

test("mimium core macro import compile smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type CompileResult = { ok: boolean; reason?: string; outputChannels?: number };

    const runner = (
      window as unknown as { runMimiumCoreMacroCompileTest: () => Promise<CompileResult> }
    ).runMimiumCoreMacroCompileTest;

    return Promise.race([
      runner(),
      new Promise<CompileResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "core macro import compile failed").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
});

test("mimium core import compile smoke (default options)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type CompileResult = { ok: boolean; reason?: string; outputChannels?: number };

    const runner = (
      window as unknown as { runMimiumCoreUseCompileDefaultOptionsTest: () => Promise<CompileResult> }
    ).runMimiumCoreUseCompileDefaultOptionsTest;

    return Promise.race([
      runner(),
      new Promise<CompileResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "core import compile failed with default options").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
});

test("mimium noise import compile smoke", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/tests/fixtures/compile.html");

  const result = await page.evaluate(async () => {
    type CompileResult = { ok: boolean; reason?: string; outputChannels?: number };

    const runner = (
      window as unknown as { runMimiumNoiseUseCompileTest: () => Promise<CompileResult> }
    ).runMimiumNoiseUseCompileTest;

    return Promise.race([
      runner(),
      new Promise<CompileResult>((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, reason: "runner timeout" });
        }, 60_000);
      }),
    ]);
  });

  expect(result.ok, result.reason ?? "noise import compile failed").toBeTruthy();
  expect(result.outputChannels).toBeGreaterThan(0);
});
