import { z } from 'zod';
import { GoogleGenAI, GeneratedVideo } from '@google/genai';
import OpenAI from 'openai';
import { openaiApiKey, googleApiKey } from '../models';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Video provider: 'veo' (Google) or 'sora' (OpenAI)
type VideoProvider = 'veo' | 'sora';
const VIDEO_PROVIDER: VideoProvider = 'sora';

const VIDEO_MODELS = {
  // veo: 'veo-3.0-generate-preview',
  veo: 'veo-2.0-generate-001',
  sora: 'sora-2',
} as const;

type GenerateVideoParams = {
  prompt: string;
};

// Sora response types (SDK doesn't have these yet)
type SoraVideoData = {
  url?: string;
};

type SoraVideoOutput = {
  type: string;
  result?: { url?: string };
};

type SoraResponse = {
  data?: SoraVideoData[];
  output?: SoraVideoOutput[];
};

// Directory for storing generated videos
const VIDEOS_DIR = path.join(process.cwd(), 'uploads');

// Ensure the directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

async function generateWithVeo(prompt: string): Promise<{ videos: string[] }> {
  if (!googleApiKey) {
    throw new Error(
      'Generate Video (Veo) requires GOOGLE_GENERATIVE_AI_API_KEY or NEXT_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY.'
    );
  }
  const ai = new GoogleGenAI({ apiKey: googleApiKey });

  let operation = await ai.models.generateVideos({
    model: VIDEO_MODELS.veo,
    prompt: prompt,
    config: {
      aspectRatio: '16:9',
      numberOfVideos: 1,
    },
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({
      operation: operation,
    });
  }

  const videoUrls = await Promise.all(
    operation.response?.generatedVideos?.map(
      async (generatedVideo: GeneratedVideo) => {
        if (!generatedVideo.video?.uri) {
          throw new Error('Generated video URI is missing');
        }

        const response = await fetch(
          `${generatedVideo.video.uri}&key=${googleApiKey}`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch video: ${response.statusText}`);
        }

        // Generate a unique filename
        const filename = `${crypto.randomUUID()}.mp4`;
        const filepath = path.join(VIDEOS_DIR, filename);

        // Download and save the video
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(buffer));

        return `/uploads/${filename}`;
      }
    ) ?? []
  );

  return { videos: videoUrls };
}

async function generateWithSora(prompt: string): Promise<{ videos: string[] }> {
  if (!openaiApiKey) {
    throw new Error(
      'Generate Video (Sora) requires OPENAI_API_KEY or NEXT_PUBLIC_OPENAI_API_KEY.'
    );
  }
  const client = new OpenAI({ apiKey: openaiApiKey });

  const response = (await client.responses.create({
    model: VIDEO_MODELS.sora,
    input: prompt,
  })) as SoraResponse;

  const videoUrls: string[] = [];

  if (response.data) {
    for (const item of response.data) {
      if (item.url) {
        const videoResponse = await fetch(item.url);
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const filename = `${crypto.randomUUID()}.mp4`;
        const filepath = path.join(VIDEOS_DIR, filename);

        const buffer = await videoResponse.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(buffer));

        videoUrls.push(`/uploads/${filename}`);
      }
    }
  } else if (response.output) {
    for (const output of response.output) {
      if (output.type === 'video_generation_call' && output.result?.url) {
        const videoResponse = await fetch(output.result.url);
        if (!videoResponse.ok) {
          throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const filename = `${crypto.randomUUID()}.mp4`;
        const filepath = path.join(VIDEOS_DIR, filename);

        const buffer = await videoResponse.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(buffer));

        videoUrls.push(`/uploads/${filename}`);
      }
    }
  }

  return { videos: videoUrls };
}

export const generateVideo = {
  id: 'generateVideo',
  name: 'Generate Video',
  description: `Useful for generating videos based on a prompt (using ${
    VIDEO_PROVIDER === 'sora' ? 'OpenAI Sora' : 'Google Veo'
  })`,
  inputSchema: z.object({
    prompt: z.string().describe('Prompt for the video generation'),
  }),
  execute: async ({ prompt }: GenerateVideoParams) => {
    try {
      if (VIDEO_PROVIDER === 'sora') {
        return await generateWithSora(prompt);
      } else {
        return await generateWithVeo(prompt);
      }
    } catch (error) {
      console.error(`[${VIDEO_PROVIDER}] Video generation error:`, error);
      return { videos: [] };
    }
  },
};
