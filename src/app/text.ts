import { UIMessage } from 'ai';

// Helper function to extract text content from UIMessage parts
export function extractTextContent(message: UIMessage): string {
  return (
    message.parts
      ?.filter(
        (part): part is { type: 'text'; text: string } => part.type === 'text'
      )
      ?.map(part => part.text)
      ?.join('') || ''
  );
}
