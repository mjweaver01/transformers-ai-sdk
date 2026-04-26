import { generateText } from 'ai';
import { z } from 'zod';
import { openai } from '../models';

type WebSearchParameters = {
  prompt: string;
};

const webSearch = {
  id: 'webSearch',
  name: 'Web Search',
  description:
    'Search the live web for current events, recent updates, trends, and factual research',
  inputSchema: z.object({
    prompt: z.string().describe('The prompt to search the web for'),
  }),
  execute: async ({ prompt }: WebSearchParameters) => {
    try {
      const resultPromise = generateText({
        model: openai.responses('gpt-4o-mini'),
        prompt,
        tools: {
          // @ts-ignore
          web_search_preview: openai.tools.webSearchPreview({
            searchContextSize: 'medium',
          }),
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Web search timed out')), 25000);
      });

      const { text } = await Promise.race([resultPromise, timeoutPromise]);
      return text?.trim() ? text : 'Web search returned no content.';
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown web search error';
      return `Web search failed: ${errorMessage}`;
    }
  },
};

export { webSearch };
