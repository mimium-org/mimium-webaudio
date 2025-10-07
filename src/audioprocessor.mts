import "./textencoder.mjs";

import { initSync, Context, Config } from "mimium-web";

export class MimiumProcessor extends AudioWorkletProcessor {
  context: Context | null;
  interleaved_input: Float32Array = new Float32Array();
  interleaved_output: Float32Array = new Float32Array();

  constructor() {
    super();
    this.context = null;
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
            let _res = initSync({ module: wasm });
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
        this.compile(
          event.data.samplerate,
          event.data.buffersize,
          event.data.src
        );
      case "recompile":
        this.recompile(event.data.src);
        break;
    }
  }
  public compile(samplerate: number, buffersize: number, src: string) {
    let config = Config.new();
    config.sample_rate = samplerate;
    config.buffer_size = buffersize;
    this.context = new Context(config); //io channel is written in context.config
    this.context.compile(src);
    // console.log(`input: ${this.context.get_input_channels()}`);
    // console.log(`output: ${this.context.get_output_channels()}`);

    this.interleaved_input = new Float32Array(
      buffersize * this.context.get_input_channels()
    );
    this.interleaved_output = new Float32Array(
      buffersize * this.context.get_output_channels()
    );
    // console.log(`interleaved_output: ${this.interleaved_output}`);

    this.port.postMessage({
      type: "compile_finished",
      data: { output_channels: this.context.get_output_channels() || 0 },
    });
  }
  public recompile(new_src: string) {
    if (!this.context) {
      return this.compile;
    } else {
      this.context.recompile(new_src);
      this.port.postMessage({
        type: "re-compiled",
        data: { output_channels: this.context.get_output_channels() || 0 },
      });
    }
  }
  public process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameter: Record<string, Float32Array>
  ) {
    if (this.context) {
      const ichannels = this.context.get_input_channels();
      const ochannels = this.context.get_output_channels();
      const input = inputs[0];
      const output = outputs[0];
      input.forEach((input, ich) => {
        for (let i = 0; i < input.length; i++) {
          this.interleaved_input[ichannels * i + ich] = input[i];
        }
      });
      this.interleaved_output.fill(0);
      this.context.process(this.interleaved_input, this.interleaved_output);
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
