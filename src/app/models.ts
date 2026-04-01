import { WorkerLoadOptions } from '@browser-ai/transformers-js';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface ModelConfig extends Omit<WorkerLoadOptions, 'modelId'> {
  id: string;
  name: string;
  supportsWorker?: boolean;
}

export const TRANSFORMERS_MODELS: ModelConfig[] = [
  {
    id: 'onnx-community/Qwen3-0.6B-ONNX',
    name: 'Qwen3 0.6B',
    device: 'webgpu',
    dtype: 'q4f16',
    supportsWorker: true,
  },
  {
    id: 'onnx-community/granite-4.0-350m-ONNX-web',
    name: 'Granite 4.0 350M',
    device: 'webgpu',
    dtype: 'fp16',
    supportsWorker: false,
  },
  {
    id: 'onnx-community/granite-4.0-micro-ONNX-web',
    name: 'Granite 4.0 Micro',
    device: 'webgpu',
    dtype: 'q4f16',
    supportsWorker: false,
  },
  {
    id: 'onnx-community/LFM2-1.2B-Tool-ONNX',
    name: 'LFM2 1.2B-Tool',
    device: 'webgpu',
    dtype: 'fp16',
    supportsWorker: false,
  },
  {
    id: 'onnx-community/gpt-oss-20b-ONNX',
    name: 'GPT-OSS 20B',
    device: 'webgpu',
    dtype: 'q4f16',
    supportsWorker: true,
  },
];

const checkApiKey = (key: string | undefined, provider: string): boolean => {
  const exists = !!key;
  if (!exists) {
    console.warn(
      `[API] ${provider}_API_KEY is not set in environment variables`
    );
  }
  return exists;
};

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

export const anthropic = createAnthropic({
  apiKey:
    process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
});

export const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY,
});

export const openaiApiKey =
  process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
export const googleApiKey =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY;

export const CLOUD_MODELS = [
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini (OpenAI)',
    available: checkApiKey(
      process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      'OPENAI'
    ),
    model: openai.responses('gpt-5-mini'),
  },
  {
    id: 'claude-4.5-sonnet',
    name: 'Claude 4.5 Sonnet (Anthropic)',
    available: checkApiKey(
      process.env.ANTHROPIC_API_KEY ||
        process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
      'ANTHROPIC'
    ),
    model: anthropic.messages('claude-sonnet-4-5-20250929'),
  },
];
