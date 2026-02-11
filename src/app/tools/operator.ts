import { z } from 'zod';
import OpenAI from 'openai';
import { openaiApiKey } from '../models';

const OPERATOR_MODEL_ID = 'computer-use-preview';

type OperatorParams = {
  website: string;
  action: string;
};

const operator = {
  id: 'operator',
  name: 'Operator',
  description:
    'Visit a website and perform an action using computer automation.',
  inputSchema: z.object({
    website: z
      .string()
      .describe(
        'The website to visit. If not provided, the default is google.com. Should be a valid URL.'
      ),
    action: z.string().describe('The action to perform on the website.'),
  }),
  execute: async ({ website, action }: OperatorParams) => {
    console.log(
      `[Operator Tool] Request received. Visiting ${website} and performing "${action}"`
    );

    try {
      if (!openaiApiKey) {
        throw new Error(
          'Operator requires OPENAI_API_KEY or NEXT_PUBLIC_OPENAI_API_KEY.'
        );
      }
      const client = new OpenAI({ apiKey: openaiApiKey });
      const targetUrl =
        website && website.trim().length > 0 ? website : 'https://google.com';

      const userTask = `Visit: ${targetUrl}\nGoal: ${action}`;

      const response = await client.responses.create({
        model: OPERATOR_MODEL_ID,
        tools: [
          {
            type: 'computer_use_preview',
            display_width: 1024,
            display_height: 768,
            environment: 'browser',
          },
        ],
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: userTask,
              },
            ],
          },
        ],
        reasoning: {
          summary: 'concise',
        },
        truncation: 'auto',
      });

      // Return the response output which contains the automation results
      if (response.output && response.output.length > 0) {
        const lastOutput = response.output[response.output.length - 1];

        // If there's text content, return it
        if (lastOutput.type === 'message') {
          return lastOutput.content;
        }

        // If there are computer calls, return a summary
        if (lastOutput.type === 'computer_call') {
          return `Successfully performed computer automation task.`;
        }
      }

      // Fallback to full response if no specific output found
      return JSON.stringify(response.output, null, 2);
    } catch (error) {
      console.error('[Operator Tool] Error:', error);
      return `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`;
    }
  },
};

export { operator };
