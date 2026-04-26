import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  TransformersJSLanguageModel,
  transformersJS,
} from '@browser-ai/transformers-js';
import { TRANSFORMERS_MODELS } from '../app/models';

const MAX_IN_MEMORY_MODEL_CACHE = 1;
const modelInstanceCache = new Map<string, TransformersJSLanguageModel>();
const inFlightModelLoads = new Map<string, Promise<TransformersJSLanguageModel>>();

const touchCachedModel = (modelId: string) => {
  const cachedModel = modelInstanceCache.get(modelId);
  if (!cachedModel) return;
  // Maintain insertion order for simple LRU eviction.
  modelInstanceCache.delete(modelId);
  modelInstanceCache.set(modelId, cachedModel);
};

const evictOldestCachedModels = (protectedModelId: string) => {
  while (modelInstanceCache.size > MAX_IN_MEMORY_MODEL_CACHE) {
    const oldestModelId = modelInstanceCache.keys().next().value as
      | string
      | undefined;
    if (!oldestModelId) return;

    if (oldestModelId === protectedModelId) {
      touchCachedModel(oldestModelId);
      continue;
    }

    modelInstanceCache.delete(oldestModelId);
  }
};

interface ModelStore {
  selectedModel: string;
  downloadedModelIds: string[];
  modelInstanceId: string | null;
  modelInstance: TransformersJSLanguageModel | null;
  setSelectedModel: (modelId: string) => void;
  getModelInstance: () => Promise<TransformersJSLanguageModel>;
  markModelDownloaded: (modelId: string) => void;
  isModelDownloaded: (modelId: string) => boolean;
  clearModelInstance: () => void;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      selectedModel: TRANSFORMERS_MODELS[0].id,
      downloadedModelIds: [],
      modelInstanceId: null,
      modelInstance: null,

      setSelectedModel: (modelId: string) => {
        const state = get();
        if (state.selectedModel === modelId) return;

        const cachedModel = modelInstanceCache.get(modelId) ?? null;
        if (cachedModel) {
          touchCachedModel(modelId);
        }

        set({
          selectedModel: modelId,
          modelInstance: cachedModel,
          modelInstanceId: cachedModel ? modelId : null,
        });
      },

      getModelInstance: async (): Promise<TransformersJSLanguageModel> => {
        const state = get();
        const selectedModelId = state.selectedModel;

        // Return current selected instance if available.
        if (
          state.modelInstance &&
          state.modelInstanceId &&
          state.modelInstanceId === selectedModelId
        ) {
          return state.modelInstance;
        }

        // Return cached instance if this model was loaded earlier.
        const cachedModel = modelInstanceCache.get(selectedModelId);
        if (cachedModel) {
          touchCachedModel(selectedModelId);
          set({
            modelInstance: cachedModel,
            modelInstanceId: selectedModelId,
          });
          return cachedModel;
        }

        // Reuse in-flight model creation to avoid duplicate initializations.
        const inFlightLoad = inFlightModelLoads.get(selectedModelId);
        if (inFlightLoad) {
          const modelInstance = await inFlightLoad;
          set({
            modelInstance,
            modelInstanceId: selectedModelId,
          });
          return modelInstance;
        }

        // Find the selected model config.
        const modelConfig = TRANSFORMERS_MODELS.find(
          model => model.id === selectedModelId
        );
        if (!modelConfig) {
          throw new Error(
            `Model configuration not found for: ${selectedModelId}`
          );
        }

        const { ...modelOptions } = modelConfig;

        // Only use worker if the model supports it.
        const workerConfig = modelConfig.supportsWorker
          ? {
              worker: new Worker(new URL('../app/worker.ts', import.meta.url), {
                type: 'module',
              }),
            }
          : {};

        const modelLoadPromise = Promise.resolve(
          transformersJS(modelConfig.id, {
            ...modelOptions,
            ...workerConfig,
          })
        );

        inFlightModelLoads.set(selectedModelId, modelLoadPromise);

        try {
          const modelInstance = await modelLoadPromise;
          modelInstanceCache.set(selectedModelId, modelInstance);
          touchCachedModel(selectedModelId);
          evictOldestCachedModels(selectedModelId);

          set({
            modelInstance,
            modelInstanceId: selectedModelId,
          });
          return modelInstance;
        } finally {
          inFlightModelLoads.delete(selectedModelId);
        }
      },

      markModelDownloaded: (modelId: string) => {
        const { downloadedModelIds } = get();
        if (downloadedModelIds.includes(modelId)) return;
        set({
          downloadedModelIds: [...downloadedModelIds, modelId],
        });
      },

      isModelDownloaded: (modelId: string) => {
        return get().downloadedModelIds.includes(modelId);
      },

      clearModelInstance: () => {
        const state = get();
        if (state.modelInstanceId) {
          modelInstanceCache.delete(state.modelInstanceId);
          inFlightModelLoads.delete(state.modelInstanceId);
        }
        set({ modelInstance: null, modelInstanceId: null });
      },
    }),
    {
      name: 'model-store',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        selectedModel: state.selectedModel,
        downloadedModelIds: state.downloadedModelIds,
      }),
    }
  )
);
