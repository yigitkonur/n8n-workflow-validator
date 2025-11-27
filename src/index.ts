export { jsonParse } from './core/json-parser.js';
export { validateWorkflowStructure, type ValidateOptions } from './core/validator.js';
export { fixInvalidOptionsFields } from './core/fixer.js';
export { sanitizeWorkflow } from './core/sanitizer.js';
export { createSourceMap, findSourceLocation, extractSnippet } from './core/source-location.js';
export type { 
  Workflow, 
  WorkflowNode, 
  ValidationResult, 
  ValidationSummary,
  ValidationIssue,
  SourceLocation,
  SourceSnippet,
  IssueSeverity
} from './core/types.js';
