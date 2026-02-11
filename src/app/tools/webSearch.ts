import { generateText } from 'ai';
import { z } from 'zod';
import { openai } from '../models';

type WebSearchParameters = {
  prompt: string;
};

const webSearch = {
  id: 'webSearch',
  name: 'Web Search',
  description: 'Search the web for information',
  inputSchema: z.object({
    prompt: z.string().describe('The prompt to search the web for'),
  }),
  execute: async ({ prompt }: WebSearchParameters) => {
    const { text } = await generateText({
      model: openai.responses('gpt-4o-mini'),
      prompt: prompt,
      tools: {
        // @ts-ignore
        web_search_preview: openai.tools.webSearchPreview({
          searchContextSize: 'medium',
        }),
      },
    });

    return text;
  },
};

export { webSearch };
