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
} from "ai";
import {
  TransformersJSLanguageModel,
  TransformersUIMessage,
} from "@browser-ai/transformers-js";
import { useModelStore } from "../store/store";
import { createDefaultSystemPrompt } from "./prompts";
import { tools, toolsMetadata } from "./tools/tools";

/**
 * Client-side chat transport AI SDK implementation that handles AI model communication
 * with in-browser AI capabilities.
 */
export class TransformersChatTransport implements ChatTransport<TransformersUIMessage> {
  private tools = tools;


  private async getModel(): Promise<TransformersJSLanguageModel> {
    return useModelStore.getState().getModelInstance();
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: TransformersUIMessage[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: "submit-message" | "submit-tool-result" | "regenerate-message";
      messageId: string | undefined;
    } & ChatRequestOptions,
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
        if (availability !== "available") {
          await model.createSessionWithProgress(
            (progress: number) => {
              const percent = Math.round(progress * 100);

              if (progress >= 1) {
                if (downloadProgressId) {
                  writer.write({
                    type: "data-modelDownloadProgress",
                    id: downloadProgressId,
                    data: {
                      status: "complete",
                      progress: 100,
                      message:
                        "Model finished downloading! Getting ready for inference...",
                    },
                  });
                }
                return;
              }

              if (!downloadProgressId) {
                downloadProgressId = `download-${Date.now()}`;
              }

              writer.write({
                type: "data-modelDownloadProgress",
                id: downloadProgressId,
                data: {
                  status: "downloading",
                  progress: percent,
                  message: `Downloading browser AI model... ${percent}%`,
                },
                transient: !downloadProgressId,
              });
            },
          );
          useModelStore.getState().markModelDownloaded(selectedModel);
        } else {
          useModelStore.getState().markModelDownloaded(selectedModel);
        }

        const result = streamText({
          model: wrapLanguageModel({
            model,
            middleware: extractReasoningMiddleware({
              tagName: "think",
            }),
          }),
          system: createDefaultSystemPrompt(toolsMetadata),
          tools: this.tools,
          toolChoice: undefined,
          stopWhen: stepCountIs(5),
          messages: prompt,
          abortSignal,
          onChunk: (event) => {
            if (event.chunk.type === "text-delta" && downloadProgressId) {
              writer.write({
                type: "data-modelDownloadProgress",
                id: downloadProgressId,
                data: { status: "complete", progress: 100, message: "" },
              });
              downloadProgressId = undefined;
            }
          },
        });

        writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    });
  }

  async reconnectToStream(
    options: {
      chatId: string;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Client-side AI doesn't support stream reconnection
    return null;
  }
}
