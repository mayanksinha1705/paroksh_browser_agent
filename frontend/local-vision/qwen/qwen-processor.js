// qwen-processor.js
//
// Turns a screenshot (data URL) + text instruction into proper multimodal
// model input for Qwen3.5-0.8B, using Qwen's own chat template and image
// processor via Transformers.js — Qwen is a Vision-Language Model, not a
// plain image classifier, so this always goes through the chat-template +
// processor(image, prompt) flow, never a bare pixel-in/label-out call.

import { load_image } from "@huggingface/transformers";

export const DEFAULT_INSTRUCTION =
  "Analyze this screenshot and identify the important visual regions and UI context. " +
  "Briefly describe the page layout, the key interactive elements (buttons, fields, " +
  "menus), and what task-relevant content is visible. Do not transcribe any personal " +
  "or sensitive information verbatim; only note that something sensitive is present " +
  "and roughly where.";

/**
 * @param {*} processor - the AutoProcessor instance from qwen-loader.js
 * @param {string} imageDataUrl - a data: URL (the RAW screenshot; this
 *   module never sees or produces anything that leaves the browser)
 * @param {string} [instruction] - what to ask Qwen to look for
 * @returns {Promise<object>} model-ready inputs for model.generate()
 */
export async function buildQwenInputs(processor, imageDataUrl, instruction) {
  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    throw new Error("Local Vision processor received an invalid screenshot.");
  }
  if (!processor) {
    throw new Error("Local Vision processor is not loaded.");
  }

  const image = await load_image(imageDataUrl);

  const messages = [
    {
      role: "user",
      content: [{ type: "image" }, { type: "text", text: instruction || DEFAULT_INSTRUCTION }],
    },
  ];

  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(image, prompt, { add_special_tokens: false });
  return inputs;
}
