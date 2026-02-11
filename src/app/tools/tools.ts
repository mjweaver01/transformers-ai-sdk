import { tool } from 'ai';
import { chartGenerator } from './chartGenerator';
import { forecast } from './forecast';
// import { executor } from './executor';
// import { generateImage } from './generateImage';
// import { generateVideo } from './generateVideo';
import { generativeUi } from './generativeUI';
import { operator } from './operator';
import { urbanDictionary } from './urbanDictionary';
import { webSearch } from './webSearch';
import { wikipedia } from './wikipedia';

export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  // don't care about the input schema and execute function
}

// Original tools with metadata (for API endpoints, prompts, etc.)
export const toolsMetadata: Record<string, ToolMetadata> = {
  urbanDictionary,
  chartGenerator,
  forecast,
  wikipedia,
  generativeUi,
  webSearch,
  operator,
  // generateImage,
  // generateVideo,
  // executor,
};

// Convert tools to AI SDK format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createAISDKTool(toolDef: any) {
  return tool({
    description: toolDef.description,
    inputSchema: toolDef.inputSchema,
    execute: toolDef.execute,
  });
}

// AI SDK compatible tools
export const tools = {
  urbanDictionary: createAISDKTool(urbanDictionary),
  chartGenerator: createAISDKTool(chartGenerator),
  forecast: createAISDKTool(forecast),
  wikipedia: createAISDKTool(wikipedia),
  generativeUi: createAISDKTool(generativeUi),
  webSearch: createAISDKTool(webSearch),
  operator: createAISDKTool(operator),
  // generateImage: createAISDKTool(generateImage),
  // generateVideo: createAISDKTool(generateVideo),
  // executor: createAISDKTool(executor),
};
