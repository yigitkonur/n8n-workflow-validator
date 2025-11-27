export interface WorkflowNode {
  id?: string;
  name?: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
  webhookId?: string;
  [key: string]: unknown;
}

export interface Workflow {
  name?: string;
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
  active?: boolean;
  settings?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface SourceLocation {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  offset?: number;
  length?: number;
}

export interface SourceSnippet {
  lines: Array<{
    lineNumber: number;
    content: string;
    isHighlighted: boolean;
  }>;
  startLine: number;
  endLine: number;
  highlightLine: number;
}

export interface SuggestedFix {
  action: 'delete' | 'replace' | 'add' | 'move';
  description: string;
  target?: string;          // What to modify (e.g., "line 126" or "parameters.options")
  before?: string;          // Current state (for replace)
  after?: string;           // Desired state (for replace/add)
}

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  
  // Location in the workflow structure
  location?: {
    nodeName?: string;
    nodeId?: string;
    nodeType?: string;
    nodeIndex?: number;
    path?: string;            // JSON path like "nodes[4].parameters.options"
  };
  
  // Source file location (line/column)
  sourceLocation?: SourceLocation;
  
  // Actual source code snippet around the error
  sourceSnippet?: SourceSnippet;
  
  // Contextual information about the error
  context?: {
    value?: unknown;          // The actual problematic value
    expected?: string;        // What was expected
    n8nError?: string;        // The equivalent n8n runtime error message
    fullObject?: unknown;     // The full node/object for context (e.g., entire node JSON)
  };
  
  // What ARE the valid options (for "invalid option" type errors)
  validAlternatives?: string[];
  
  // How to fix this issue
  suggestedFix?: SuggestedFix;
  
  // Human-readable hint
  hint?: string;
  
  // Documentation reference
  docsUrl?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[]; // Legacy, kept for simple checks
  warnings: string[]; // Legacy
  issues: ValidationIssue[]; // New rich issues
  nodeTypeIssues?: string[];
}

export interface ValidationSummary {
  input: string;
  sourceType: 'file' | 'url' | 'stdin';
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[]; // New rich issues
  sanitized: boolean;
  fixed?: number;
}
