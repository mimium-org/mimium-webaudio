export type CompileData = {
  samplerate: number;
  buffersize: number;
  src: string;
  virtualFiles: Array<{ path: string; content: string }>;
};
export class MimiumProcessorNode extends AudioWorkletNode {
  private data: CompileData | null = null;
  private resolveCompileReady: (() => void) | null = null;
  private rejectCompileReady: ((reason?: unknown) => void) | null = null;
  private compileReady: Promise<void>;

  constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
    super(context, name, options);
    this.compileReady = new Promise<void>((resolve, reject) => {
      this.resolveCompileReady = resolve;
      this.rejectCompileReady = reject;
    });
  }

  waitForCompile(): Promise<void> {
    return this.compileReady;
  }

  init(wasmBinary: ArrayBuffer, data: CompileData) {
    this.data = data;

    // console.log(
    //   `Compiledata : ${data.samplerate}, ${data.buffersize}, ${data.src}`
    // );
    this.port.onmessage = (event: MessageEvent) => {
      this.onmessage(event.data);
    };
    this.port.postMessage({
      type: "send-wasm-module",
      data: wasmBinary,
    });
    // Handle an uncaught exception thrown in the Processor.
    this.onprocessorerror = (err) => {
      console.log(
        `An error from AudioWorkletProcessor.process() occurred: ${err}`
      );
    };
  }

  onmessage(event: MessageEvent) {
    switch (event.type) {
      case "start_loading": {
        console.log("start loading wasm module");
        break;
      }
      case "wasm-module-loaded": {
        console.log("wasm module loaded");
        this.port.postMessage({
          type: "compile",
          data: this.data,
        });
        break;
      }
      case "stop": {
        this.disconnect();
        break;
      }
      case "compile_finished":
        this.channelCount = event.data.output_channels;
        console.log(`output channels: ${this.channelCount}`);
        this.resolveCompileReady?.();
        this.resolveCompileReady = null;
        this.rejectCompileReady = null;
        break;
      case "compile_error":
        console.error(`compile error: ${event.data.message}`);
        this.rejectCompileReady?.(new Error(event.data.message));
        this.resolveCompileReady = null;
        this.rejectCompileReady = null;
        break;
      case "error_wasm_load":
        this.rejectCompileReady?.(
          new Error(event.data?.data?.message ?? "failed to load wasm module")
        );
        this.resolveCompileReady = null;
        this.rejectCompileReady = null;
        break;
    }
  }
}
