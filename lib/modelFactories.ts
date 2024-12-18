import { pipeline } from "@xenova/transformers";

function createModelLoader(model_name: string): any {
  let model: any = null;
  const load_model = async ({ progress_callback = undefined }) => {
    if (model === null) {
      model = await pipeline("automatic-speech-recognition", model_name, {
        quantized: true,
        progress_callback,
      });
    }
    return model;
  };
  return load_model;
}

export { createModelLoader };
