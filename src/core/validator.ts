import type { Workflow, ValidationResult, ValidationIssue, IssueSeverity } from './types.js';
import { createSourceMap, findSourceLocation, extractSnippet, type SourceMap } from './source-location.js';

// Known valid parameter keys for common problematic nodes (for context, not for fixing)
const KNOWN_NODE_PARAMETERS: Record<string, string[]> = {
  'n8n-nodes-base.if': ['conditions', 'looseTypeValidation'],
  'n8n-nodes-base.switch': ['rules', 'fallbackOutput'],
  'n8n-nodes-base.code': ['mode', 'jsCode', 'language', 'workflowMode'],
  'n8n-nodes-base.webhook': ['path', 'responseMode', 'responseCode', 'responseData', 'options', 'authentication', 'httpMethod'],
};

interface IssueBuilder {
  code: string;
  severity: IssueSeverity;
  message: string;
  location?: ValidationIssue['location'];
  context?: ValidationIssue['context'];
  validAlternatives?: string[];
  hint?: string;
}

function enrichWithSourceInfo(
  issue: IssueBuilder,
  sourceMap: SourceMap | undefined,
  path: string
): ValidationIssue {
  const result: ValidationIssue = {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    location: issue.location,
    context: issue.context,
    validAlternatives: issue.validAlternatives,
    hint: issue.hint,
  };

  if (sourceMap && path) {
    const srcLoc = findSourceLocation(sourceMap, path);
    if (srcLoc) {
      result.sourceLocation = srcLoc;
      result.sourceSnippet = extractSnippet(sourceMap, srcLoc.line, 3);
    }
  }

  return result;
}

export interface ValidateOptions {
  rawSource?: string;  // Original JSON source for line number extraction
}

export function validateWorkflowStructure(data: unknown, options?: ValidateOptions): ValidationResult {
  const issues: ValidationIssue[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeTypeIssues: string[] = [];

  // Create source map if raw source provided
  const sourceMap = options?.rawSource ? createSourceMap(options.rawSource) : undefined;

  if (typeof data !== 'object' || data === null) {
    const issue = enrichWithSourceInfo({
      code: 'INVALID_JSON_TYPE',
      severity: 'error',
      message: 'Workflow must be a JSON object',
      context: { 
        value: typeof data, 
        expected: 'object',
      }
    }, sourceMap, '');
    issues.push(issue);
    errors.push(issue.message);
    return { valid: false, errors, warnings, issues, nodeTypeIssues };
  }

  const wf = data as Workflow;

  // Validate 'nodes' property
  if (wf.nodes === undefined) {
    const issue = enrichWithSourceInfo({
      code: 'MISSING_PROPERTY',
      severity: 'error',
      message: 'Missing required property: nodes',
      location: { path: 'nodes' },
      context: {
        expected: 'Array of node objects',
      }
    }, sourceMap, '');
    issues.push(issue);
    errors.push(issue.message);
  } else if (!Array.isArray(wf.nodes)) {
    const issue = enrichWithSourceInfo({
      code: 'INVALID_TYPE',
      severity: 'error',
      message: 'Property "nodes" must be an array',
      location: { path: 'nodes' },
      context: { value: typeof wf.nodes, expected: 'array' }
    }, sourceMap, 'nodes');
    issues.push(issue);
    errors.push(issue.message);
  }

  // Validate 'connections' property
  if (wf.connections === undefined) {
    const issue = enrichWithSourceInfo({
      code: 'MISSING_PROPERTY',
      severity: 'error',
      message: 'Missing required property: connections',
      location: { path: 'connections' },
      context: {
        expected: 'Object mapping node names to their output connections',
      }
    }, sourceMap, '');
    issues.push(issue);
    errors.push(issue.message);
  } else if (typeof wf.connections !== 'object' || wf.connections === null) {
    const issue = enrichWithSourceInfo({
      code: 'INVALID_TYPE',
      severity: 'error',
      message: 'Property "connections" must be an object',
      location: { path: 'connections' },
      context: { value: typeof wf.connections, expected: 'object' }
    }, sourceMap, 'connections');
    issues.push(issue);
    errors.push(issue.message);
  } else if (Array.isArray(wf.connections)) {
    const issue = enrichWithSourceInfo({
      code: 'INVALID_TYPE',
      severity: 'error',
      message: 'Property "connections" must be an object, not an array',
      location: { path: 'connections' },
      context: { value: 'array', expected: 'object' }
    }, sourceMap, 'connections');
    issues.push(issue);
    errors.push(issue.message);
  }

  // Validate individual nodes
  if (Array.isArray(wf.nodes)) {
    for (let i = 0; i < wf.nodes.length; i++) {
      const node = wf.nodes[i];
      const nodePath = `nodes[${i}]`;
      
      if (!node || typeof node !== 'object') {
        const issue = enrichWithSourceInfo({
          code: 'INVALID_NODE_TYPE',
          severity: 'error',
          message: `Node at index ${i} is not an object`,
          location: { path: nodePath, nodeIndex: i },
          context: { value: typeof node, expected: 'object' }
        }, sourceMap, nodePath);
        issues.push(issue);
        errors.push(issue.message);
        continue;
      }

      const nodeName = node.name || 'unnamed';
      const nodeType = node.type || 'unknown';
      const baseLocation = {
        nodeName,
        nodeId: node.id,
        nodeType,
        nodeIndex: i,
        path: nodePath
      };

      // Check 'type'
      if (!node.type) {
        const issue = enrichWithSourceInfo({
          code: 'MISSING_NODE_TYPE',
          severity: 'error',
          message: `Node at index ${i} (${nodeName}) missing required field: type`,
          location: { ...baseLocation, path: `${nodePath}.type` },
          context: { fullObject: node }
        }, sourceMap, nodePath);
        issues.push(issue);
        errors.push(issue.message);
      } else if (typeof node.type !== 'string') {
        const issue = enrichWithSourceInfo({
          code: 'INVALID_NODE_TYPE_FORMAT',
          severity: 'error',
          message: `Node at index ${i} (${nodeName}) field 'type' must be a string`,
          location: { ...baseLocation, path: `${nodePath}.type` },
          context: { value: typeof node.type, fullObject: node }
        }, sourceMap, `${nodePath}.type`);
        issues.push(issue);
        errors.push(issue.message);
      } else {
        if (!node.type.includes('.')) {
          const issue = enrichWithSourceInfo({
            code: 'INVALID_NODE_TYPE_FORMAT',
            severity: 'warning',
            message: `Node "${nodeName}" has invalid type "${node.type}" - must include package prefix (e.g., "n8n-nodes-base.webhook")`,
            location: { ...baseLocation, path: `${nodePath}.type` },
            context: { value: node.type, expected: 'Format: "package-name.nodeName"', fullObject: node }
          }, sourceMap, `${nodePath}.type`);
          issues.push(issue);
          nodeTypeIssues.push(issue.message);
        } else if (node.type.startsWith('nodes-base.')) {
          const issue = enrichWithSourceInfo({
            code: 'DEPRECATED_NODE_TYPE_PREFIX',
            severity: 'warning',
            message: `Node "${nodeName}" has invalid type "${node.type}" - should be "n8n-${node.type}"`,
            location: { ...baseLocation, path: `${nodePath}.type` },
            context: { value: node.type, expected: `n8n-${node.type}`, fullObject: node }
          }, sourceMap, `${nodePath}.type`);
          issues.push(issue);
          nodeTypeIssues.push(issue.message);
        }
      }

      // Check 'name'
      if (!node.name) {
        const issue = enrichWithSourceInfo({
          code: 'MISSING_NODE_NAME',
          severity: 'warning',
          message: `Node at index ${i} (type: ${nodeType}) missing 'name' field - will be auto-generated`,
          location: { ...baseLocation, path: `${nodePath}.name` },
          context: { fullObject: node }
        }, sourceMap, nodePath);
        issues.push(issue);
        warnings.push(issue.message);
      }

      // Check 'typeVersion'
      if (node.typeVersion === undefined) {
        const issue = enrichWithSourceInfo({
          code: 'MISSING_TYPE_VERSION',
          severity: 'error',
          message: `Node "${nodeName}" missing required field: typeVersion`,
          location: { ...baseLocation, path: `${nodePath}.typeVersion` },
          context: { fullObject: node }
        }, sourceMap, nodePath);
        issues.push(issue);
        errors.push(issue.message);
      } else if (typeof node.typeVersion !== 'number') {
        const issue = enrichWithSourceInfo({
          code: 'INVALID_TYPE_VERSION',
          severity: 'error',
          message: `Node "${nodeName}" field 'typeVersion' must be a number`,
          location: { ...baseLocation, path: `${nodePath}.typeVersion` },
          context: { value: typeof node.typeVersion, fullObject: node }
        }, sourceMap, `${nodePath}.typeVersion`);
        issues.push(issue);
        errors.push(issue.message);
      }

      // Check 'position'
      if (!node.position) {
        const issue = enrichWithSourceInfo({
          code: 'MISSING_POSITION',
          severity: 'error',
          message: `Node "${nodeName}" missing required field: position`,
          location: { ...baseLocation, path: `${nodePath}.position` },
          context: { fullObject: node }
        }, sourceMap, nodePath);
        issues.push(issue);
        errors.push(issue.message);
      } else if (!Array.isArray(node.position) || node.position.length !== 2) {
        const issue = enrichWithSourceInfo({
          code: 'INVALID_POSITION',
          severity: 'error',
          message: `Node "${nodeName}" field 'position' must be an array of [x, y]`,
          location: { ...baseLocation, path: `${nodePath}.position` },
          context: { value: node.position, expected: '[number, number]', fullObject: node }
        }, sourceMap, `${nodePath}.position`);
        issues.push(issue);
        errors.push(issue.message);
      }

      // Check 'parameters'
      if (node.parameters === undefined) {
        const issue = enrichWithSourceInfo({
          code: 'MISSING_PARAMETERS',
          severity: 'error',
          message: `Node "${nodeName}" missing required field: parameters`,
          location: { ...baseLocation, path: `${nodePath}.parameters` },
          context: { fullObject: node }
        }, sourceMap, nodePath);
        issues.push(issue);
        errors.push(issue.message);
      } else if (typeof node.parameters !== 'object' || node.parameters === null) {
        const issue = enrichWithSourceInfo({
          code: 'INVALID_PARAMETERS',
          severity: 'error',
          message: `Node "${nodeName}" field 'parameters' must be an object`,
          location: { ...baseLocation, path: `${nodePath}.parameters` },
          context: { value: typeof node.parameters, fullObject: node }
        }, sourceMap, `${nodePath}.parameters`);
        issues.push(issue);
        errors.push(issue.message);
      } else {
        // Deep Check: Invalid 'options' in parameters for IF/Switch nodes
        if (node.type === 'n8n-nodes-base.if' || node.type === 'n8n-nodes-base.switch') {
          if ('options' in node.parameters && 
              typeof node.parameters.options === 'object' &&
              node.parameters.options !== null &&
              Object.keys(node.parameters.options).length === 0) {
            
            const knownParams = KNOWN_NODE_PARAMETERS[node.type] || [];
            const actualParamKeys = Object.keys(node.parameters);
            
            const issue = enrichWithSourceInfo({
              code: 'INVALID_IF_SWITCH_OPTIONS_ROOT',
              severity: 'error',
              message: `Node "${nodeName}" (${nodeType}): Found unexpected "options" key at parameters root level.`,
              location: { ...baseLocation, path: `${nodePath}.parameters.options` },
              context: { 
                value: node.parameters.options,
                expected: `This node type does not define "options" as a root-level parameter. The "options" key found here with value {} is not recognized by n8n's parameter schema for ${nodeType}.`,
                n8nError: 'Could not find property option',
                fullObject: node.parameters
              },
              validAlternatives: knownParams,
              hint: `Observed parameter keys: [${actualParamKeys.join(', ')}]. Known valid keys for ${nodeType}: [${knownParams.join(', ')}]. The key "options" is not among the valid root-level parameters.`
            }, sourceMap, `${nodePath}.parameters.options`);
            issues.push(issue);
            errors.push(issue.message);
          }
        }
      }
    }
  }

  return { 
    valid: errors.length === 0, 
    errors, 
    warnings, 
    issues,
    nodeTypeIssues: nodeTypeIssues.length > 0 ? nodeTypeIssues : undefined 
  };
}

