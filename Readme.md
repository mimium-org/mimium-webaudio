# mimium-webaudio

Webaudio audioworklet module to run mimium code on web browser.

https://mimium.org

The main entrypoint of compiler on web platform is [`mimium-web`](https://www.npmjs.com/package/mimium-web), which is directory exported from Rust code using wasm-pack.

The reason to split package for audioworklet module is because wasm-pack is not fully compatible with WebAudio AudioWorklet and need to write some wrapper code to load wasm modules.

## Installation

```bash
npm install @mimium/mimium-webaudio
```

## Basic usage

```ts
import { setupMimiumAudioWorklet } from "@mimium/mimium-webaudio";
import processorUrl from "@mimium/mimium-webaudio/dist/audioprocessor.mjs?url";

const ctx = new AudioContext();

const src = `
fn dsp(){
	(0.0, 0.0)
}
`;

const node = await setupMimiumAudioWorklet(ctx, src, processorUrl);
node.connect(ctx.destination);
```

`setupMimiumAudioWorklet` returns `MimiumProcessorNode` (`AudioWorkletNode`).

## API

```ts
setupMimiumAudioWorklet(
	ctx: AudioContext,
	src: string,
	MimiumProcessorUrl: string,
	options?: {
		libBaseUrl?: string;
		moduleBaseUrl?: string;
	}
): Promise<MimiumProcessorNode>
```

- `libBaseUrl`: Base URL for standard mimium libraries (default: `https://raw.githubusercontent.com/mimium-org/mimium-rs/dev/lib/`).
- `moduleBaseUrl`: Base URL for user modules resolved by `mod` / `include` (default: current page base URL).

## Notes

- Compilation and library/module fetch are done on the main thread.
- AudioWorklet uses preloaded virtual file cache and does not fetch files directly.

## Testing (Playwright)

```bash
npx playwright install chromium
npx playwright test tests/compile.spec.ts
```

This test opens a browser page, creates `AudioContext` + `AudioWorklet`, compiles a mimium source, and verifies compile completion.