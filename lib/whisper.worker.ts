import { createModelLoader } from "./modelFactories";
import { MessageTypes, ModelNames } from "./whisper.utils";

const modelLoaders: { [key: string]: any } = {};
for (const model_name of ModelNames) {
  modelLoaders[model_name] = createModelLoader(model_name);
}

self.addEventListener("message", async (event) => {
  const { type, audio, model_name } = event.data;
  if (type === MessageTypes.INFERENCE_REQUEST) {
    await transcribe(audio, model_name);
  }
});

async function transcribe(audio: any, model_name: string) {
  // check if model_name is not in modelLoaders
  sendLoadingMessage("loading", "");

  if (!modelLoaders[model_name]) {
    console.log("Model not found");
    sendLoadingMessage("error", `Model not found: ${model_name}`);
    return;
  }

  const pipeline = await modelLoaders[model_name]({
    callback_function: load_model_callback,
  });
  sendLoadingMessage("success");

  const isDistilWhisper = model_name.includes("distil-whisper");
  const stride_length_s = isDistilWhisper ? 3 : 5;
  const generationTracker = new GenerationTracker(pipeline, stride_length_s);

  await pipeline(audio, {
    top_k: 0,
    do_sample: false,
    chunk_length_s: isDistilWhisper ? 20 : 30,
    stride_length_s: stride_length_s,
    return_timestamps: true,
    force_full_sequences: false,
    callback_function:
      generationTracker.callbackFunction.bind(generationTracker),
    chunk_callback: generationTracker.chunkCallback.bind(generationTracker),
  });
  generationTracker.sendFinalResult();
}

async function load_model_callback(data: any) {
  const { status } = data;
  if (status === "progress") {
    const { file, progress, loaded, total } = data;
    sendDownloadingMessage(file, progress, loaded, total);
  }
  if (status === "done") {
    // Do nothing
  }
  if (status === "loaded") {
    // Do nothing
  }
}

function sendLoadingMessage(status: string, message?: string) {
  self.postMessage({
    type: MessageTypes.LOADING,
    status,
    message,
  });
}

function sendDownloadingMessage(file: any, progress: any, loaded: any, total: any) {
  self.postMessage({
    type: MessageTypes.DOWNLOADING,
    file,
    progress,
    loaded,
    total,
  });
}

class GenerationTracker {
  pipeline: any;
  stride_length_s: any;
  chunks: any[];
  time_precision: number;
  processed_chunks: any[];
  callbackFunctionCounter: number;

  constructor(pipeline: any, stride_length_s: any) {
    this.pipeline = pipeline;
    this.stride_length_s = stride_length_s;
    this.chunks = [];
    this.time_precision =
      pipeline.processor.feature_extractor.config.chunk_length /
      pipeline.model.config.max_source_positions;
    this.processed_chunks = [];
    this.callbackFunctionCounter = 0;
  }

  sendFinalResult() {
    self.postMessage({ type: MessageTypes.INFERENCE_DONE });
  }

  callbackFunction(beams: any) {
    this.callbackFunctionCounter += 1;
    if (this.callbackFunctionCounter % 10 !== 0) {
      return;
    }

    const bestBeam = beams[0];
    let text = this.pipeline.tokenizer.decode(bestBeam.output_token_ids, {
      skip_special_tokens: true,
    });

    const result = {
      text,
      start: this.getLastChuckTimestamp(),
      end: undefined,
    };
    createPartialResultMessage(result);
  }

  chunkCallback(data: any) {
    this.chunks.push(data);
    const [text, { chunks }] = this.pipeline.tokenizer._decode_asr(
      this.chunks,
      {
        time_precision: this.time_precision,
        return_timestamps: true,
        force_full_sequences: false,
      }
    );
    // const newpProcessedChunks = chunks.map(this.processChunk.bind(this));
    this.processed_chunks = chunks.map((chunk: any, index: number) =>
      this.processChunk(chunk, index)
    );
    // this.processed_chunks = this.processed_chunks.concat(newpProcessedChunks);
    createResultMessage(
      this.processed_chunks,
      false,
      this.getLastChuckTimestamp()
    );
  }

  getLastChuckTimestamp() {
    if (this.processed_chunks.length === 0) {
      return 0;
    }
    return this.processed_chunks[this.processed_chunks.length - 1].end;
  }

  processChunk(chunk: any, index: number) {
    const { text, timestamp } = chunk;
    const [start, end] = timestamp;

    return {
      index,
      text: `${text.trim()} `,
      start: Math.round(start),
      end: Math.round(end) || Math.round(start + 0.9 * this.stride_length_s),
    };
  }
}

function createResultMessage(results: any, isDone: boolean, completedUntilTimestamp: number) {
  self.postMessage({
    type: MessageTypes.RESULT,
    results,
    isDone,
    completedUntilTimestamp,
  });
}

function createPartialResultMessage(result: any) {
  self.postMessage({
    type: MessageTypes.RESULT_PARTIAL,
    result,
  });
}

function removeOverlap(s1: string, s2: string) {
  let overlap = Math.min(s1.length, s2.length);
  while (overlap > 0) {
    if (s2.startsWith(s1.substring(s1.length - overlap))) {
      return s2.substring(overlap);
    }
    overlap--;
  }
  return s2;
}
