// import MimiumProcessorSrc from "./audioprocessor.js?raw";
// const processorBlob = new Blob([MimiumProcessorSrc], {
//   type: "text/javascript",
// });
// const MimiumProcessorUrl = URL.createObjectURL(processorBlob);
// import MimiumProcessorUrl from "./audioprocessor.ts?url";

import "./textencoder.mjs";
import { MimiumProcessorNode } from "./workletnode.ts";
import type { CompileData } from "./workletnode.ts";
import textEncoderPolyfillUrl from "./textencoder.mjs?url";
import wasmurl from "mimium-web/mimium_web_bg.wasm?url";
export type { MimiumProcessorNode };
export type { CompileData } from "./workletnode.ts";

const DEFAULT_GITHUB_LIB_BASE =
  "https://raw.githubusercontent.com/mimium-org/mimium-rs/dev/lib/";

type SetupOptions = {
  libBaseUrl?: string;
  moduleBaseUrl?: string;
};

const STANDARD_LIB_FILES = [
  "core.mmm",
  "delay.mmm",
  "drive.mmm",
  "dynamics.mmm",
  "env.mmm",
  "filter.mmm",
  "math.mmm",
  "mininotation.mmm",
  "modulation.mmm",
  "parser.mmm",
  "noise.mmm",
  "osc.mmm",
  "reactive.mmm",
  "reverb.mmm",
  "pattern.mmm",
] as const;

const stdLibVirtualFilesCache = new Map<
  string,
  Promise<Array<{ path: string; content: string }>>
>();

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

function normalizeVirtualPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

function expandVirtualPathAliases(path: string): string[] {
  const normalized = normalizeVirtualPath(path);
  const strippedLib = normalized.replace(/^lib\//, "");
  return [...new Set([path, strippedLib, `./${strippedLib}`, `lib/${strippedLib}`, `/lib/${strippedLib}`])];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function requestText(url: string): Promise<string> {
  const response = await window.fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function loadStandardLibVirtualFiles(
  libBaseUrl: string
): Promise<Array<{ path: string; content: string }>> {
  const normalizedBase = normalizeBaseUrl(libBaseUrl);
  const cached = stdLibVirtualFilesCache.get(normalizedBase);
  if (cached) {
    return cached;
  }

  const loading = Promise.all(
    STANDARD_LIB_FILES.map(async (libFile) => {
      const url = new URL(libFile, normalizedBase).toString();
      const content = await requestText(url);
      return { path: libFile, content };
    })
  );
  stdLibVirtualFilesCache.set(normalizedBase, loading);
  return loading;
}

async function preloadMimiumLibCacheInternal(
  mimium: typeof import("mimium-web"),
  libBaseUrl: string
): Promise<void> {
  const normalizedBase = normalizeBaseUrl(libBaseUrl);
  const config = mimium.Config.new();
  config.sample_rate = 44100;
  config.buffer_size = 128;
  const context = new mimium.Context(config);
  await context.init_lib_cache_with_base_url(normalizedBase);
  await loadStandardLibVirtualFiles(normalizedBase);
}

export async function preloadMimiumLibCache(
  options: Pick<SetupOptions, "libBaseUrl"> = {}
): Promise<void> {
  const libBaseUrl = normalizeBaseUrl(options.libBaseUrl ?? DEFAULT_GITHUB_LIB_BASE);
  const mimium = await import("mimium-web");
  const response = await window.fetch(wasmurl);
  const wasmBytes = await response.arrayBuffer();
  const wasmModule = await WebAssembly.compile(wasmBytes);
  mimium.initSync({ module: wasmModule });
  await preloadMimiumLibCacheInternal(mimium, libBaseUrl);
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

  const stdlibLoaded = await loadStandardLibVirtualFiles(libBase);
  stdlibLoaded.forEach((file) => files.set(file.path, file.content));

  const getCandidates = (depPath: string): string[] => {
    if (/^(https?:)?\/\//.test(depPath)) {
      return [depPath];
    }
    const moduleCandidate = new URL(depPath, moduleBase).toString();
    const libCandidate = new URL(depPath, libBase).toString();
    return moduleCandidate === libCandidate
      ? [moduleCandidate]
      : [moduleCandidate, libCandidate];
  };

  while (queue.length > 0) {
    const depPath = queue.pop();
    if (!depPath || visited.has(depPath)) {
      continue;
    }
    visited.add(depPath);

    if (files.has(depPath)) {
      const cached = files.get(depPath);
      if (cached) {
        collectDependencies(cached).forEach((nested) => {
          if (!visited.has(nested)) {
            queue.push(nested);
          }
        });
      }
      continue;
    }

    const candidates = getCandidates(depPath);

    let loaded: string | null = null;
    const attemptErrors: string[] = [];
    for (const candidate of candidates) {
      try {
        loaded = await requestText(candidate);
        break;
      } catch (e) {
        attemptErrors.push(
          `${candidate} => ${e instanceof Error ? e.message : String(e)}`
        );
        continue;
      }
    }

    if (!loaded) {
      throw new Error(
        `Failed to resolve dependency: ${depPath}. moduleBaseUrl=${moduleBase} libBaseUrl=${libBase}. Attempts: ${attemptErrors.join(
          " | "
        )}`
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
  mimium: typeof import("mimium-web"),
  wasmBytes: ArrayBuffer,
  src: string,
  samplerate: number,
  buffersize: number,
  options: SetupOptions
): Promise<CompileData> {
  const moduleBaseUrl = options.moduleBaseUrl ?? new URL(".", window.location.href).toString();
  const libBaseUrl = options.libBaseUrl ?? DEFAULT_GITHUB_LIB_BASE;

  const wasmModule = await WebAssembly.compile(wasmBytes);
  mimium.initSync({ module: wasmModule });

  const config = mimium.Config.new();
  config.sample_rate = samplerate;
  config.buffer_size = buffersize;

  const context = new mimium.Context(config);
  context.set_module_base_url(moduleBaseUrl);
  await preloadMimiumLibCacheInternal(mimium, libBaseUrl);
  await context.init_lib_cache_with_base_url(libBaseUrl);
  const stdLibVirtualFiles = await loadStandardLibVirtualFiles(libBaseUrl);
  stdLibVirtualFiles.forEach((file) => {
    expandVirtualPathAliases(file.path).forEach((alias) => {
      context.put_virtual_file_cache(alias, file.content);
    });
  });
  await context.compile(src);

  const virtualFiles = await prepareVirtualFiles(src, moduleBaseUrl, libBaseUrl);
  return {
    src,
    samplerate,
    buffersize,
    moduleBaseUrl,
    libBaseUrl,
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
    const mimium = await import("mimium-web");
    const response = await window.fetch(wasmurl);
    const wasmBytes = await response.arrayBuffer();
    const compileData = await prepareCompileDataOnMainThread(
      mimium,
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
      throw new Error(
        `Failed to load audio analyzer worklet at url: ${MimiumProcessorUrl}. Further info: ${errorToMessage(
          e
        )}`
      );
    }
    let audioNode = new MimiumProcessorNode(ctx, "MimiumProcessor", {
      channelCountMode: "clamped-max",
    });
    audioNode.init(wasmBytes, compileData);
    await audioNode.waitForCompile();
    if (audioNode.channelCount <= 0) {
      throw new Error("compile succeeded but output channel count is zero");
    }
    return audioNode;
  } catch (e) {
    throw new Error(
      `Failed to load audio analyzer WASM module. Further info: ${errorToMessage(e)}`
    );
  }
}
