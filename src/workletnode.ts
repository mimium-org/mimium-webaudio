export type CompileData = {
  samplerate: number;
  buffersize: number;
  src: string;
  virtualFiles: Array<{ path: string; content: string }>;
};
export class MimiumProcessorNode extends AudioWorkletNode {
  private data: CompileData | null = null;
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
        break;
      case "compile_error":
        console.error(`compile error: ${event.data.message}`);
        break;
    }
  }
}
