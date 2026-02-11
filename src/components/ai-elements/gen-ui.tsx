import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { useLocation } from 'react-router';
import { LiveProvider, LiveError, LivePreview } from 'react-live';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import './gen-ui.css';

interface GenerativeUIProps {
  jsxString: string;
  onError?: (error: Error) => void;
  isLoading?: boolean;
}

// Error boundary component to catch runtime errors
class ComponentErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: {
    children: React.ReactNode;
    onError?: (error: Error) => void;
  }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('Component Error Boundary caught error:', error);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-destructive/10 border border-destructive/20 p-4">
          <h3 className="text-destructive font-semibold mb-2">
            Component Error
          </h3>
          <p className="text-destructive/80 text-sm mb-2">
            The generated component encountered a runtime error:
          </p>
          <pre className="text-xs bg-destructive/5 p-2 overflow-x-auto">
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Helper to load external scripts dynamically
const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if script already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

// Helper to load CSS dynamically
const loadCSS = (href: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
    document.head.appendChild(link);
  });
};

// Safe scope - only these imports/functions are available to generated components
const createSafeScope = () => ({
  // React essentials
  React,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,

  // React-live render function (this is provided by LiveProvider)
  render: (element: React.ReactElement) => element,

  // Safe utility functions
  console: {
    log: console.log,
    warn: console.warn,
    error: console.error,
  },

  // Math and formatting utilities
  Math,
  parseInt,
  parseFloat,
  Number,
  String,
  Array,
  Object,
  JSON,
  Date,

  // Intl for formatting (currency, dates, etc.)
  Intl,

  // Common array methods that are safe
  map: (arr: unknown[], fn: (item: unknown, index: number) => unknown) =>
    arr.map(fn),
  filter: (arr: unknown[], fn: (item: unknown) => boolean) => arr.filter(fn),
  reduce: (
    arr: unknown[],
    fn: (acc: unknown, item: unknown, index: number) => unknown,
    initial: unknown
  ) => arr.reduce(fn, initial),

  // Safe setTimeout/setInterval (with limits)
  setTimeout: (fn: () => void, delay: number) => {
    if (delay < 10000) {
      // Max 10 second delay
      return setTimeout(fn, delay);
    }
  },
  clearTimeout,

  // Dynamic loading utilities for external libraries
  loadScript,
  loadCSS,

  // Window access for loaded libraries (Three.js, etc.)
  window: typeof window !== 'undefined' ? window : {},

  // Promise for async operations
  Promise,
});

const GenerativeUI: React.FC<GenerativeUIProps> = ({
  jsxString,
  onError,
  isLoading,
}) => {
  const location = useLocation();
  const pathname = location.pathname;
  const [isReady, setIsReady] = useState(false);

  // Memoize the safe scope to avoid recreation on every render
  const scope = useMemo(() => createSafeScope(), []);

  // Wait for jsxString to be available before rendering
  useEffect(() => {
    if (jsxString && jsxString.trim() && !isLoading) {
      // Small delay to ensure the component is fully mounted
      const timer = setTimeout(() => {
        setIsReady(true);
      }, 100);
      return () => clearTimeout(timer);
    } else if (isLoading) {
      // Reset ready state when loading starts
      setIsReady(false);
    }
  }, [jsxString, isLoading]);

  const openInViewer = () => {
    // Store the JSX string in localStorage as backup
    try {
      localStorage.setItem('genui-viewer-jsx', jsxString);
      localStorage.setItem('genui-viewer-title', 'Generated UI Component');
    } catch (error) {
      console.error('Failed to store in localStorage:', error);
    }

    // Get current conversation ID from URL
    const getCurrentConversationId = (): string | null => {
      if (typeof window === 'undefined') return null;
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('conversation');
    };

    // Navigate to the viewer page with only conversation ID
    const conversationId = getCurrentConversationId();
    let url = `/genui-viewer`;

    if (conversationId) {
      url += `?conversation=${encodeURIComponent(conversationId)}`;
    }

    window.open(url, '_blank');
  };

  // SIMPLIFIED Clean and prepare the code string
  const cleanCode = useMemo(() => {
    let code = jsxString?.trim() ?? '';

    // Test code removed - issue resolved

    // Remove markdown code block wrapper if present - more robust approach
    // Handle various markdown block formats
    code = code
      .replace(/^```(?:jsx|javascript|js)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '');

    // Remove any remaining backticks and dollar signs that might be artifacts
    code = code.replace(/```[\s\S]*$/g, '').replace(/\$\s*$/g, '');

    // Clean up any trailing artifacts
    code = code.trim();

    // Remove any imports as they're not needed (everything is in scope)
    code = code.replace(/^import\s+.*?from\s+['"][^'"]*['"];?\s*/gm, '');

    // Comprehensive sanitization of problematic characters
    code = code
      // Remove BOM and other invisible characters
      .replace(/\uFEFF/g, '') // BOM (Byte Order Mark)
      .replace(/\u200B/g, '') // Zero-width space
      .replace(/\u200C/g, '') // Zero-width non-joiner
      .replace(/\u200D/g, '') // Zero-width joiner
      .replace(/\u2060/g, '') // Word joiner
      // Fix dashes and quotes
      .replace(/–/g, '-') // Em dash to hyphen
      .replace(/—/g, '-') // Em dash to hyphen
      .replace(/‑/g, '-') // Non-breaking hyphen to hyphen
      .replace(/'/g, "'") // Smart quote to regular quote
      .replace(/'/g, "'") // Smart quote to regular quote
      .replace(/"/g, '"') // Smart quote to regular quote
      .replace(/"/g, '"') // Smart quote to regular quote
      .replace(/…/g, '...') // Ellipsis to three dots
      // Fix spaces
      .replace(/\u00A0/g, ' ') // Non-breaking space to regular space
      .replace(/\u2000/g, ' ') // En quad
      .replace(/\u2001/g, ' ') // Em quad
      .replace(/\u2002/g, ' ') // En space
      .replace(/\u2003/g, ' ') // Em space
      .replace(/\u2004/g, ' ') // Three-per-em space
      .replace(/\u2005/g, ' ') // Four-per-em space
      .replace(/\u2006/g, ' ') // Six-per-em space
      .replace(/\u2007/g, ' ') // Figure space
      .replace(/\u2008/g, ' ') // Punctuation space
      .replace(/\u2009/g, ' ') // Thin space
      .replace(/\u200A/g, ' ') // Hair space
      .replace(/\u3000/g, ' '); // Ideographic space

    // Simple processing - let the AI generate proper code from the start

    // IIFE APPROACH: Wrap component in immediately invoked function expression
    const componentMatch = code.match(/(?:const|function)\s+(\w+)/);
    if (componentMatch) {
      const componentName = componentMatch[1];
      // console.log('🔍 Detected component name:', componentName);
      // Remove export default
      code = code.replace(/^export\s+default\s+\w+;?\s*$/gm, '').trim();

      // Wrap in IIFE pattern that react-live expects
      code = `(() => {
      ${code}
        return <${componentName} />;
      })()`;
    } else if (code.trim().startsWith('<')) {
      // Pure JSX, wrap it in IIFE
      code = `(() => {
        const GeneratedComponent = () => {
          return (
      ${code}
          );
        };
        return <GeneratedComponent />;
      })()`;
    }

    // Debug logs removed - issue resolved
    return code || 'render(<div>No content provided</div>);';
  }, [jsxString]);

  // Don't render until we have valid code and component is ready
  if (!jsxString || !jsxString.trim() || !isReady) {
    return (
      <div className="mb-4 border overflow-hidden rounded-md">
        <div className="bg-muted/50 border-b px-4 py-2">
          <span className="text-sm font-medium text-muted-foreground">
            Generated UI Component
          </span>
        </div>
        <div className="p-8 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">
            Loading component...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 border overflow-hidden rounded-md">
        {/* Add key to force re-mount when code changes */}
        <LiveProvider key={cleanCode} code={cleanCode} scope={scope}>
          <div className="bg-muted/50 border-b px-4 py-2 flex justify-between items-center">
            <span className="text-sm font-medium text-muted-foreground">
              Generated UI Component
            </span>
            {!pathname.includes('genui-viewer') && (
              <Button
                onClick={openInViewer}
                variant="outline"
                size="sm"
                className="gap-2 text-xs h-8"
              >
                <ExternalLink className="h-3 w-3" />
                View Full Screen
              </Button>
            )}
          </div>

          {/* Show the rendered component */}
          <ComponentErrorBoundary onError={onError}>
            <div className="w-full dark:text-background">
              <LivePreview />
            </div>
          </ComponentErrorBoundary>

          {/* Show any errors */}
          <LiveError className="bg-destructive/10 text-destructive p-4 text-sm font-mono whitespace-pre-wrap" />

          {/* Show the code */}
          <details className="bg-muted/50 border-t">
            <summary className="cursor-pointer p-2 text-sm text-muted-foreground hover:bg-muted">
              Show Generated Code
            </summary>
            <pre className="p-4 text-xs overflow-x-auto">
              <code>{cleanCode}</code>
            </pre>
          </details>
        </LiveProvider>
      </div>
    </div>
  );
};

export default GenerativeUI;
