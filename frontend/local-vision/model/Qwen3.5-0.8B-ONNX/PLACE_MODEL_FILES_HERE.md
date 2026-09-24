# Copy your Qwen3.5-0.8B ONNX model files here

This directory is intentionally empty except for this note — no fake or
placeholder model files are included. Copy your already-downloaded
Qwen3.5-0.8B ONNX export directly into this folder, matching this layout:

```
frontend/local-vision/model/Qwen3.5-0.8B-ONNX/
├── config.json
├── generation_config.json
├── preprocessor_config.json
├── processor_config.json
├── tokenizer.json
├── tokenizer_config.json
├── chat_template.jinja
└── onnx/
    ├── decoder_model_merged_q4.onnx
    ├── decoder_model_merged_q4.onnx_data
    ├── embed_tokens_q4.onnx
    ├── embed_tokens_q4.onnx_data
    ├── vision_encoder_fp16.onnx
    └── vision_encoder_fp16.onnx_data
```

Once copied, reload the unpacked extension in `chrome://extensions` — no
other setup is required. See the root `README.md` for how to verify Qwen
initializes correctly.
