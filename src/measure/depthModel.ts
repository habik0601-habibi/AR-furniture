/**
 * Depth model used by the AI assist. Verified on the Hugging Face Hub
 * (pipeline_tag depth-estimation, library transformers.js, ONNX weights incl.
 * model_quantized.onnx ~27 MB and model_fp16.onnx ~50 MB).
 */
export const DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small'
