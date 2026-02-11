import { UIMessage } from 'ai';
import { memory } from './tools/memory';
import { extractTextContent } from './text';

/**
 * Represents a chat message
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  id?: string;
  name?: string;
}

/**
 * Options for storing chat memory
 */
export interface ChatMemoryOptions {
  /**
   * Whether to store system messages
   * @default false
   */
  includeSystemMessages?: boolean;

  /**
   * Maximum message content length to store
   * @default 2000
   */
  maxContentLength?: number;
}

const defaultOptions: ChatMemoryOptions = {
  includeSystemMessages: false,
  maxContentLength: 2000,
};

/**
 * Store chat messages in memory
 *
 * @param userId Unique identifier for the user
 * @param messages Array of chat messages
 * @param options Storage options
 * @returns Array of memory IDs for stored messages
 */
export async function storeChatToMemory(
  userId: string,
  messages: ChatMessage[],
  options: ChatMemoryOptions = {}
): Promise<string[]> {
  // Merge with default options
  const opts = { ...defaultOptions, ...options };
  const memoryIds: string[] = [];

  try {
    console.log(
      `[CHAT_MEMORY] Storing ${messages.length} messages for user ${userId}`
    );

    // Process each message
    for (const message of messages) {
      // Skip system messages if not explicitly included
      if (message.role === 'system' && !opts.includeSystemMessages) {
        continue;
      }

      // Skip empty messages
      if (!message.content || message.content.trim() === '') {
        continue;
      }

      // Truncate content if needed
      const maxLength =
        opts.maxContentLength !== undefined
          ? opts.maxContentLength
          : (defaultOptions.maxContentLength as number);
      const content =
        message.content.length > maxLength
          ? message.content.substring(0, maxLength) + '...'
          : message.content;

      // Format the memory entry
      const memoryContent = `${message.role}: ${content}`;

      // Store in memory
      const result = await memory.execute({
        operation: 'store',
        userId,
        content: memoryContent,
      });

      const response = JSON.parse(result);
      if (response.success && response.memoryId) {
        memoryIds.push(response.memoryId);
      } else {
        console.error(
          `[CHAT_MEMORY] Failed to store message: ${JSON.stringify(message)}`
        );
      }
    }

    console.log(
      `[CHAT_MEMORY] Successfully stored ${memoryIds.length} messages`
    );
    return memoryIds;
  } catch (error) {
    console.error('[CHAT_MEMORY] Error storing chat messages:', error);
    return memoryIds;
  }
}

/**
 * Search for previous chat messages based on a query
 *
 * @param userId Unique identifier for the user
 * @param query Search query
 * @param limit Maximum number of results to return
 * @returns Array of relevant chat messages with similarity scores
 */
export async function searchChatMemory(
  userId: string,
  query: string,
  limit: number = 5
) {
  try {
    console.log(
      `[CHAT_MEMORY] Searching for "${query}" in chat history for user ${userId}`
    );

    const result = await memory.execute({
      operation: 'search',
      userId,
      content: query,
      limit,
    });

    const response = JSON.parse(result);
    if (response.success && response.results) {
      return response.results;
    } else {
      console.error(
        '[CHAT_MEMORY] Search failed:',
        response.error || 'Unknown error'
      );
      return [];
    }
  } catch (error) {
    console.error('[CHAT_MEMORY] Error searching chat memory:', error);
    return [];
  }
}

/**
 * Integrate chat memory into the regular chat flow
 * This can be used as a middleware in your chat handling logic
 */
export function createChatMemoryMiddleware(options: ChatMemoryOptions = {}) {
  return async (
    userId: string,
    messages: ChatMessage[],
    next: () => Promise<unknown>
  ) => {
    try {
      // Store messages in memory (don't await to avoid blocking)
      storeChatToMemory(userId, messages, options).catch(err =>
        console.error('[CHAT_MEMORY] Background memory storage failed:', err)
      );

      // Continue with the normal chat flow
      return await next();
    } catch (error) {
      console.error('[CHAT_MEMORY] Middleware error:', error);
      throw error;
    }
  };
}

// Helper function to convert UIMessage to ChatMessage
export function convertToChatMessageFormat(
  messages: UIMessage[]
): ChatMessage[] {
  return messages.map(msg => ({
    role:
      msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
        ? msg.role
        : 'system',
    content: extractTextContent(msg),
    ...(msg.id ? { id: msg.id } : {}),
  })) as ChatMessage[];
}

// Helper function to search and filter memories
export async function getRelevantMemories(
  userId: string,
  query: string,
  recentMessages: UIMessage[]
): Promise<string> {
  if (userId === 'anonymous' || !query) {
    return '';
  }

  try {
    console.log(
      `[Memory] Searching for user ${userId} with query: ${query.substring(0, 50)}...`
    );

    const memorySearchResult = await searchChatMemory(userId, query, 5);
    let memories: { content: string }[] = [];

    // Handle different response types from searchChatMemory
    if (typeof memorySearchResult === 'string') {
      try {
        memories = JSON.parse(memorySearchResult);
      } catch {
        return '';
      }
    } else if (Array.isArray(memorySearchResult)) {
      memories = memorySearchResult;
    } else if (
      memorySearchResult?.results &&
      Array.isArray(memorySearchResult.results)
    ) {
      memories = memorySearchResult.results;
    }

    if (!Array.isArray(memories) || memories.length === 0) {
      return '';
    }

    // Get recent message content to avoid duplication
    const recentContent = new Set<string>();
    recentMessages.slice(-6).forEach(msg => {
      const content = extractTextContent(msg).trim();
      if (content) recentContent.add(content);
    });

    // Filter memories
    const filteredMemories = memories.filter(memory => {
      if (!memory?.content || typeof memory.content !== 'string') {
        return false;
      }

      const contentParts = memory.content.split(': ');
      if (contentParts.length < 2) return false;

      const role = contentParts[0];
      const content = contentParts.slice(1).join(': ').trim();

      if (!content) return false;

      // Skip recent duplicates
      if (recentContent.has(content)) return false;

      // Skip assistant tool responses
      if (
        role === 'assistant' &&
        (content.includes('✅') || content.includes('Calling'))
      ) {
        return false;
      }

      return true;
    });

    if (filteredMemories.length === 0) {
      return '';
    }

    console.log(`[Memory] Found ${filteredMemories.length} relevant memories`);

    const memoryItems = filteredMemories
      .map(memory => `- ${memory.content}`)
      .join('\n');

    return `\n\nRelevant information from previous conversations:\n${memoryItems}`;
  } catch (error) {
    console.error('[Memory] Error searching memories:', error);
    return '';
  }
}

// Helper function to store chat to memory with timeout
export async function storeToMemoryAsync(
  userId: string,
  messages: UIMessage[]
): Promise<void> {
  if (userId === 'anonymous') return;

  try {
    const chatMessages = convertToChatMessageFormat(messages);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Memory storage timeout')), 5000);
    });

    await Promise.race([
      storeChatToMemory(userId, chatMessages),
      timeoutPromise,
    ]);
  } catch (error) {
    console.error('[Memory] Error storing chat:', error);
  }
}
