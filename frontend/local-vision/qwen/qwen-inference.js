// qwen-inference.js
//
// Runs a single Qwen3.5-0.8B visual-understanding pass: image + text
// instruction in, a short text description out. Qwen never executes browser
// actions here — it has no access to click/type/scroll — it only produces
// text that LocalVisionManager hands back to background.js as an extra,
// informational "visual context" string.

import { loadQwen, isQwenReady } from "./qwen-loader.js";
import { buildQwenInputs, DEFAULT_INSTRUCTION } from "./qwen-processor.js";

const MAX_NEW_TOKENS = 200;

/**
 * @param {string} modelBaseUrl - absolute chrome-extension:// URL to the
 *   local-vision/model/ directory
 * @param {string} imageDataUrl - raw screenshot as a data: URL
 * @param {string} [instruction]
 * @param {(progress:object)=>void} [onProgress]
 */
export async function runQwenInference(modelBaseUrl, imageDataUrl, instruction, onProgress) {
  const { model, processor } = await loadQwen(modelBaseUrl, onProgress);

  const inputs = await buildQwenInputs(processor, imageDataUrl, instruction || DEFAULT_INSTRUCTION);
  const promptTokenLength = inputs?.input_ids?.dims?.at?.(-1) ?? 0;

  const outputs = await model.generate({
    ...inputs,
    do_sample: false,
    max_new_tokens: MAX_NEW_TOKENS,
    repetition_penalty: 1.1,
  });

  let text = "";
  try {
    // outputs is a Tensor of shape [batch, seq_len]; drop the echoed prompt
    // tokens so we only decode what Qwen actually generated.
    const sequence = outputs.tolist ? outputs.tolist()[0] : outputs[0];
    const newTokenIds = sequence.slice(promptTokenLength);
    text = processor.batch_decode([newTokenIds], { skip_special_tokens: true })[0] || "";
  } catch (_err) {
    // Fallback: decode the full sequence if slicing failed for any reason
    // (e.g. a chat template/tokenizer quirk in the provided model files).
    const full = processor.batch_decode(outputs, { skip_special_tokens: true })[0] || "";
    text = full;
  }

  return { text: text.trim() };
}

export function qwenReady() {
  return isQwenReady();
}
