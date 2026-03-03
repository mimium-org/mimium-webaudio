// import MimiumProcessorSrc from "./audioprocessor.js?raw";
// const processorBlob = new Blob([MimiumProcessorSrc], {
//   type: "text/javascript",
// });
// const MimiumProcessorUrl = URL.createObjectURL(processorBlob);
// import MimiumProcessorUrl from "./audioprocessor.ts?url";

import { MimiumProcessorNode } from "./workletnode.ts";
import type { CompileData } from "./workletnode.ts";
import textEncoderPolyfillUrl from "./textencoder.mjs?url";
import wasmurl from "mimium-web/mimium_web_bg.wasm?url";
import { initSync, Context, Config } from "mimium-web";
export type { MimiumProcessorNode };
export type { CompileData } from "./workletnode.ts";

const DEFAULT_GITHUB_LIB_BASE =
  "https://raw.githubusercontent.com/mimium-org/mimium-rs/dev/lib/";

type SetupOptions = {
  libBaseUrl?: string;
  moduleBaseUrl?: string;
};

function collectDependencies(source: string): string[] {
  const moduleDeps = [...source.matchAll(/^\s*mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/gm)].map(
    (match) => `${match[1]}.mmm`
  );
  const useDeps = [
    ...source.matchAll(/^\s*use\s+([A-Za-z_][A-Za-z0-9_]*)(?:::[^\s]+)?\s*$/gm),
  ].map((match) => `${match[1]}.mmm`);
  const includeDeps = [...source.matchAll(/^\s*include\(\s*"([^"]+)"\s*\)\s*$/gm)].map(
    (match) => match[1]
  );
  return [...new Set([...moduleDeps, ...useDeps, ...includeDeps])];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function requestText(url: string): Promise<string> {
  const response = await window.fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function prepareVirtualFiles(
  src: string,
  moduleBaseUrl: string,
  libBaseUrl: string
): Promise<Array<{ path: string; content: string }>> {
  const moduleBase = normalizeBaseUrl(moduleBaseUrl);
  const libBase = normalizeBaseUrl(libBaseUrl);
  const queue = collectDependencies(src);
  const visited = new Set<string>();
  const files = new Map<string, string>();

  while (queue.length > 0) {
    const depPath = queue.pop();
    if (!depPath || visited.has(depPath)) {
      continue;
    }
    visited.add(depPath);

    const candidates = [new URL(depPath, moduleBase).toString()];
    if (/^[A-Za-z_][A-Za-z0-9_]*\.mmm$/.test(depPath)) {
      candidates.push(new URL(depPath, libBase).toString());
    }

    let loaded: string | null = null;
    for (const candidate of candidates) {
      try {
        loaded = await requestText(candidate);
        break;
      } catch {
        continue;
      }
    }

    if (!loaded) {
      throw new Error(
        `Failed to resolve dependency: ${depPath}. Checked moduleBaseUrl and libBaseUrl.`
      );
    }

    files.set(depPath, loaded);
    collectDependencies(loaded).forEach((nested) => {
      if (!visited.has(nested)) {
        queue.push(nested);
      }
    });
  }

  return [...files.entries()].map(([path, content]) => ({ path, content }));
}

async function prepareCompileDataOnMainThread(
  wasmBytes: ArrayBuffer,
  src: string,
  samplerate: number,
  buffersize: number,
  options: SetupOptions
): Promise<CompileData> {
  const moduleBaseUrl = options.moduleBaseUrl ?? new URL(".", window.location.href).toString();
  const libBaseUrl = options.libBaseUrl ?? DEFAULT_GITHUB_LIB_BASE;

  const wasmModule = await WebAssembly.compile(wasmBytes);
  initSync({ module: wasmModule });

  const config = Config.new();
  config.sample_rate = samplerate;
  config.buffer_size = buffersize;

  const context = new Context(config);
  context.set_module_base_url(moduleBaseUrl);
  await context.init_lib_cache_with_base_url(libBaseUrl);
  await context.compile(src);

  const virtualFiles = await prepareVirtualFiles(src, moduleBaseUrl, libBaseUrl);
  return {
    src,
    samplerate,
    buffersize,
    virtualFiles,
  };
}

export async function setupMimiumAudioWorklet(
  ctx: AudioContext,
  src: string,
  MimiumProcessorUrl: string,
  options: SetupOptions = {}
): Promise<MimiumProcessorNode> {
  try {
    const response = await window.fetch(wasmurl);
    const wasmBytes = await response.arrayBuffer();
    const compileData = await prepareCompileDataOnMainThread(
      wasmBytes,
      src,
      ctx.sampleRate,
      128,
      options
    );
    try {
      await ctx.audioWorklet.addModule(textEncoderPolyfillUrl);
      await ctx.audioWorklet.addModule(MimiumProcessorUrl);
    } catch (e) {
      let err = e as unknown as Error;
      throw new Error(
        `Failed to load audio analyzer worklet at url: ${MimiumProcessorUrl}. Further info: ${err.message}`
      );
    }
    let audioNode = new MimiumProcessorNode(ctx, "MimiumProcessor", {
      channelCountMode: "clamped-max",
    });
    audioNode.init(wasmBytes, compileData);
    await audioNode.waitForCompile();
    return audioNode;
  } catch (e) {
    let err = e as unknown as Error;
    throw new Error(
      `Failed to load audio analyzer WASM module. Further info: ${err.message}`
    );
  }
}
