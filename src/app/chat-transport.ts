import {
  ChatTransport,
  UIMessageChunk,
  streamText,
  convertToModelMessages,
  ChatRequestOptions,
  createUIMessageStream,
  stepCountIs,
  wrapLanguageModel,
  extractReasoningMiddleware,
} from 'ai';
import {
  TransformersJSLanguageModel,
  TransformersUIMessage,
} from '@browser-ai/transformers-js';
import { useModelStore } from '../store/store';
import { createDefaultSystemPrompt } from './prompts';
import { tools, toolsMetadata } from './tools/tools';
import { TRANSFORMERS_MODELS } from './models';

/**
 * Client-side chat transport AI SDK implementation that handles AI model communication
 * with in-browser AI capabilities.
 */
export class TransformersChatTransport implements ChatTransport<TransformersUIMessage> {
  private tools = tools;

  private estimateTokensFromText(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  private async getModel(): Promise<TransformersJSLanguageModel> {
    return useModelStore.getState().getModelInstance();
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: TransformersUIMessage[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: 'submit-message' | 'submit-tool-result' | 'regenerate-message';
      messageId: string | undefined;
    } & ChatRequestOptions
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options;
    const prompt = await convertToModelMessages(messages);
    const model = await this.getModel();

    return createUIMessageStream<TransformersUIMessage>({
      execute: async ({ writer }) => {
        let downloadProgressId: string | undefined;
        const selectedModel = useModelStore.getState().selectedModel;
        const availability = await model.availability();

        // Only track progress if model needs downloading
        if (availability !== 'available') {
          await model.createSessionWithProgress((progress: number) => {
            const percent = Math.round(progress * 100);

            if (progress >= 1) {
              if (downloadProgressId) {
                writer.write({
                  type: 'data-modelDownloadProgress',
                  id: downloadProgressId,
                  data: {
                    status: 'complete',
                    progress: 100,
                    message:
                      'Model finished downloading! Getting ready for inference...',
                  },
                });
              }
              return;
            }

            if (!downloadProgressId) {
              downloadProgressId = `download-${Date.now()}`;
            }

            writer.write({
              type: 'data-modelDownloadProgress',
              id: downloadProgressId,
              data: {
                status: 'downloading',
                progress: percent,
                message: `Downloading browser AI model... ${percent}%`,
              },
              transient: !downloadProgressId,
            });
          });
          useModelStore.getState().markModelDownloaded(selectedModel);
        } else {
          useModelStore.getState().markModelDownloaded(selectedModel);
        }

        const generationStart = performance.now();
        let generatedText = '';
        const selectedModelConfig = TRANSFORMERS_MODELS.find(
          modelConfig => modelConfig.id === selectedModel
        );
        const supportsTools = selectedModelConfig?.supportsTools === true;

        const result = streamText({
          model: wrapLanguageModel({
            model,
            middleware: extractReasoningMiddleware({
              tagName: 'think',
            }),
          }),
          system: createDefaultSystemPrompt(
            supportsTools ? toolsMetadata : undefined
          ),
          tools: supportsTools ? this.tools : undefined,
          // Prevent provider warning spam for unsupported toolChoice.
          toolChoice: supportsTools ? 'auto' : undefined,
          // Keep local model follow-up generations bounded after tool execution.
          maxOutputTokens: 512,
          stopWhen: stepCountIs(5),
          messages: prompt,
          abortSignal,
          onChunk: event => {
            if (event.chunk.type === 'text-delta' && downloadProgressId) {
              writer.write({
                type: 'data-modelDownloadProgress',
                id: downloadProgressId,
                data: { status: 'complete', progress: 100, message: '' },
              });
              downloadProgressId = undefined;
            }

            if (event.chunk.type === 'text-delta') {
              generatedText += event.chunk.text;
            }
          },
          onFinish: (event: any) => {
            const elapsedMs = Math.max(
              Math.round(performance.now() - generationStart),
              1
            );
            const usage = event?.usage;
            const outputTokens =
              typeof usage?.outputTokens === 'number'
                ? usage.outputTokens
                : this.estimateTokensFromText(generatedText);
            const inputTokens =
              typeof usage?.inputTokens === 'number'
                ? usage.inputTokens
                : undefined;
            const totalTokens =
              typeof usage?.totalTokens === 'number'
                ? usage.totalTokens
                : inputTokens !== undefined
                  ? inputTokens + outputTokens
                  : undefined;

            const statParts: string[] = [];
            const tokPerSecond =
              outputTokens > 0
                ? (outputTokens / (elapsedMs / 1000)).toFixed(2)
                : '0.00';
            statParts.push(`${tokPerSecond} tok/s`);
            statParts.push(`${outputTokens.toLocaleString()} out`);
            if (typeof inputTokens === 'number') {
              statParts.push(`${inputTokens.toLocaleString()} in`);
            }
            if (typeof totalTokens === 'number') {
              statParts.push(`${totalTokens.toLocaleString()} total`);
            }
            statParts.push(`${(elapsedMs / 1000).toFixed(2)}s`);
            if (!usage?.outputTokens) {
              statParts.push('tokens estimated');
            }

            writer.write({
              type: 'data-notification',
              data: {
                level: 'info',
                message: `Stats: ${statParts.join(' · ')}`,
              },
            });
          },
        });

        writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    });
  }

  async reconnectToStream(
    options: {
      chatId: string;
    } & ChatRequestOptions
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Client-side AI doesn't support stream reconnection
    return null;
  }
}
