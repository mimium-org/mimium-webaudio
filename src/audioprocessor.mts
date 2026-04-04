import "./textencoder.mjs";
import { initSync, Context, Config } from "mimium-web";

const STANDARD_LIB_FILES = [
  "core.mmm",
  "delay.mmm",
  "env.mmm",
  "filter.mmm",
  "math.mmm",
  "noise.mmm",
  "osc.mmm",
  "reactive.mmm",
  "reverb.mmm",
];

function normalizeVirtualPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

function expandVirtualPathAliases(path: string): string[] {
  const normalized = normalizeVirtualPath(path);
  const strippedLib = normalized.replace(/^lib\//, "");
  return [...new Set([path, strippedLib, `./${strippedLib}`, `lib/${strippedLib}`, `/lib/${strippedLib}`])];
}

export class MimiumProcessor extends AudioWorkletProcessor {
  context: Context | null;
  isCompiled: boolean;
  interleaved_input: Float32Array = new Float32Array();
  interleaved_output: Float32Array = new Float32Array();

  constructor() {
    super();
    this.context = null;
    this.isCompiled = false;
    this.port.onmessage = (event) => {
      this.onmessage(event.data);
    };
  }
  onmessage(event: MessageEvent<any>) {
    console.log("onmessage ", event);
    switch (event.type) {
      case "send-wasm-module": {
        console.log("start_loading");
        const wasmBinary = event.data as ArrayBuffer; //this is invalid conversion for workaround.
        WebAssembly.compile(wasmBinary)
          .then((wasm) => {
            initSync({ module: wasm });
            console.log("wasm module loaded,sending message");
            this.port.postMessage({ type: "wasm-module-loaded" });
          })
          .catch((e) => {
            console.error("wasm module load error, ", e);
            this.port.postMessage({ type: "error_wasm_load", data: e });
          });

        break;
      }
      case "compile":
        void this.compile(
          event.data.samplerate,
          event.data.buffersize,
          event.data.src,
          event.data.moduleBaseUrl,
          event.data.libBaseUrl,
          event.data.virtualFiles
        );
        break;
    }
  }
  public async compile(
    samplerate: number,
    buffersize: number,
    src: string,
    moduleBaseUrl: string = "",
    libBaseUrl: string = "https://raw.githubusercontent.com/mimium-org/mimium-rs/main/lib/",
    virtualFiles: Array<{ path: string; content: string }> = []
  ) {
    this.isCompiled = false;
    this.context = null;
    this.interleaved_input = new Float32Array();
    this.interleaved_output = new Float32Array();

    let config = Config.new();
    config.sample_rate = samplerate;
    config.buffer_size = buffersize;
    const nextContext = new Context(config); //io channel is written in context.vonfig

    let compileMessage: {
      type: "compile_finished" | "compile_error";
      data: { output_channels?: number; message?: string };
    } = {
      type: "compile_error",
      data: { message: "compile did not complete." },
    };

    try {
      if (moduleBaseUrl) {
        nextContext.set_module_base_url(moduleBaseUrl);
      }
      const virtualFileNames = new Set(
        virtualFiles.map((file) => normalizeVirtualPath(file.path).replace(/^lib\//, ""))
      );
      const hasStdLibVirtualFiles = STANDARD_LIB_FILES.every((libFile) =>
        virtualFileNames.has(libFile)
      );

      if (!hasStdLibVirtualFiles) {
        const missing = STANDARD_LIB_FILES.filter((libFile) => !virtualFileNames.has(libFile));
        throw new Error(
          `virtual lib cache is incomplete. missing=[${missing.join(", ")}]. worklet does not fetch libs; preload on main thread is required. baseUrl=${libBaseUrl}`
        );
      }

      virtualFiles.forEach((file) => {
        expandVirtualPathAliases(file.path).forEach((alias) => {
          nextContext.put_virtual_file_cache(alias, file.content);
        });
      });
      await nextContext.compile(src);

      const outputChannels = nextContext.get_output_channels() || 0;
      if (outputChannels <= 0) {
        this.context = null;
        this.isCompiled = false;
        this.interleaved_input = new Float32Array();
        this.interleaved_output = new Float32Array();
        compileMessage = {
          type: "compile_error",
          data: { message: "compile failed: compile finished with zero output channels." },
        };
        return;
      }

      this.interleaved_input = new Float32Array(
        buffersize * nextContext.get_input_channels()
      );
      this.interleaved_output = new Float32Array(
        buffersize * outputChannels
      );
      this.context = nextContext;
      this.isCompiled = true;

      compileMessage = {
        type: "compile_finished",
        data: { output_channels: outputChannels },
      };
    } catch (e) {
      this.context = null;
      this.isCompiled = false;
      this.interleaved_input = new Float32Array();
      this.interleaved_output = new Float32Array();

      compileMessage = {
        type: "compile_error",
        data: {
          message: `compile failed: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    } finally {
      this.port.postMessage(compileMessage);
    }
  }
  public process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameter: Record<string, Float32Array>
  ) {
    if (this.context && this.isCompiled) {
      const ichannels = this.context.get_input_channels();
      const ochannels = this.context.get_output_channels();
      const input = inputs[0];
      const output = outputs[0];
      if (
        this.interleaved_input.length !== (input?.[0]?.length ?? 0) * ichannels ||
        this.interleaved_output.length !== (output?.[0]?.length ?? 0) * ochannels
      ) {
        return true;
      }
      input.forEach((input, ich) => {
        for (let i = 0; i < input.length; i++) {
          this.interleaved_input[ichannels * i + ich] = input[i];
        }
      });
      this.interleaved_output.fill(0);
      try {
        this.context.process(this.interleaved_input, this.interleaved_output);
      } catch (e) {
        this.context = null;
        this.isCompiled = false;
        this.port.postMessage({
          type: "runtime_error",
          data: { message: e instanceof Error ? e.message : String(e) },
        });
        return true;
      }
      output.forEach((output, och) => {
        for (let i = 0; i < output.length; i++) {
          output[i] = this.interleaved_output[ochannels * i + och];
        }
      });
    }
    return true;
  }
}

registerProcessor("MimiumProcessor", MimiumProcessor);
