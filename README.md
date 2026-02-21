validates n8n workflow JSON the same way the n8n editor does on import. loads the actual n8n runtime packages (`n8n-workflow` + `n8n-nodes-base`), runs `NodeHelpers.getNodeParameters()` and `getNodeParametersIssues()` against every node. catches what JSON schema validation can't.

```bash
npx n8n-workflow-validator workflow.json
```

[![npm](https://img.shields.io/npm/v/n8n-workflow-validator.svg?style=flat-square)](https://www.npmjs.com/package/n8n-workflow-validator)
[![node](https://img.shields.io/badge/node-18+-93450a.svg?style=flat-square)](https://nodejs.org/)
[![license](https://img.shields.io/badge/license-MIT-grey.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## what it does

- **n8n-native validation** — uses the same `NodeHelpers` functions the editor uses, not a custom schema
- **structural checks** — missing nodes/connections, bad types, invalid positions, missing parameters
- **parameter-level checks** — catches `fixedCollection` key mismatches, missing required fields, wrong `typeVersion` shapes
- **LLM fixer** — `--fix` auto-removes known bad patterns LLMs hallucinate (empty `options: {}` on if/switch nodes)
- **sanitizer** — regenerates node IDs, deduplicates webhook paths, auto-names unnamed nodes
- **source locations** — errors include line numbers, column offsets, and source snippets from your JSON
- **flexible input** — local file, remote URL, or stdin
- **CI-friendly** — `--json` for machine-readable output, exit code 0/1

## install

```bash
npm install -g n8n-workflow-validator
```

or just run it:

```bash
npx n8n-workflow-validator workflow.json
```

from source:

```bash
git clone https://github.com/yigitkonur/n8n-workflow-validator.git
cd n8n-workflow-validator
pnpm install && pnpm build
node dist/cli.js workflow.json
```

requires Node.js 18+.

## usage

```bash
# validate a local file
n8n-validate workflow.json

# fix LLM-generated issues and write output
n8n-validate workflow.json --fix --out fixed.json

# validate from URL
n8n-validate "https://example.com/workflow.json"

# pipe from stdin, get JSON output
cat workflow.json | n8n-validate --json

# handle malformed JSON from LLMs
n8n-validate workflow.json --repair --accept-js-object

# skip sanitization
n8n-validate workflow.json --no-sanitize --no-regenerate-ids
```

## CLI flags

```
USAGE:
    n8n-validate <file-or-url> [options]

OPTIONS:
    --fix                  auto-fix known LLM patterns (empty options on if/switch)
    --repair               attempt to repair malformed JSON before parsing
    --accept-js-object     accept JS object literal syntax (not strict JSON)
    --out <FILE>           write fixed/sanitized workflow to file (only if valid)
    --json                 output machine-readable JSON instead of human-readable text
    --no-sanitize          skip workflow sanitization
    --no-regenerate-ids    skip UUID regeneration for node IDs
    -h, --help             print usage
```

exit codes: `0` = valid, `1` = invalid or parse failure.

## what it catches

two layers of validation:

### structural

| code | severity | what |
|:---|:---|:---|
| `INVALID_JSON_TYPE` | error | root is not an object |
| `MISSING_PROPERTY` | error | missing `nodes` or `connections` |
| `INVALID_TYPE` | error | `nodes` not an array, `connections` not an object |
| `MISSING_NODE_TYPE` | error | node missing `type` field |
| `INVALID_NODE_TYPE_FORMAT` | error/warning | `type` not a string or missing package prefix |
| `DEPRECATED_NODE_TYPE_PREFIX` | warning | `nodes-base.x` instead of `n8n-nodes-base.x` |
| `MISSING_TYPE_VERSION` | error | missing `typeVersion` |
| `INVALID_TYPE_VERSION` | error | `typeVersion` not a number |
| `MISSING_POSITION` | error | missing `position` |
| `INVALID_POSITION` | error | `position` not a `[x, y]` array |
| `MISSING_PARAMETERS` | error | missing `parameters` |
| `INVALID_PARAMETERS` | error | `parameters` not an object |

### n8n-native

| code | severity | what |
|:---|:---|:---|
| `UNKNOWN_NODE_TYPE` | warning | node type not in registry (community/custom nodes) |
| `N8N_PARAMETER_VALIDATION_ERROR` | error | `NodeHelpers.getNodeParameters()` threw |
| `N8N_PARAMETER_ISSUE` | error | `NodeHelpers.getNodeParametersIssues()` found problems |

## auto-fixers

`--fix` currently applies one fixer:

- **`empty-options-if-switch`** — removes `parameters.options: {}` from if/switch nodes. LLMs love to hallucinate this. n8n throws `"Could not find property option"` because `options` is a `fixedCollection` and an empty object has no recognized keys.

two more fixers are available as library API only (not via CLI):

- **`switch-v3-rule-conditions-options`** — fills missing `conditions.options` with defaults on Switch v3+ nodes
- **`switch-v3-fallback-output-location`** — moves `fallbackOutput` from `parameters.rules` to `parameters.options`

## library usage

```typescript
import {
  jsonParse,
  validateWorkflowStructure,
  validateNodeWithN8n,
  nodeRegistry,
  fixInvalidOptionsFields,
  applyExperimentalFixes,
  sanitizeWorkflow,
  createSourceMap,
  findSourceLocation,
} from 'n8n-workflow-validator';
```

full TypeScript types exported.

## project structure

```
src/
  cli.ts                    — entry point, arg parsing
  index.ts                  — library exports
  core/
    types.ts                — all TypeScript interfaces
    validator.ts            — structural validation
    n8n-native-validator.ts — wraps n8n NodeHelpers
    n8n-loader.ts           — scans n8n-nodes-base, builds node registry
    fixer.ts                — auto-fix rules
    sanitizer.ts            — ID regen, name assignment, webhook dedup
    source-location.ts      — JSON AST → line/col mapping, snippet extraction
    json-parser.ts          — JSON / JS object / jsonrepair parsing
  utils/
    input-reader.ts         — file / URL / stdin input handling
    output.ts               — human-readable and JSON output formatting
```

## how it works

1. reads input (file, URL, or stdin)
2. parses JSON (with optional repair or JS object mode)
3. applies fixers if `--fix`
4. runs structural checks on the raw object
5. for each node that passes structural checks: looks up its type in the n8n node registry (built by scanning the installed `n8n-nodes-base` package), then runs the same `NodeHelpers` validation the n8n editor uses
6. sanitizes the workflow (ID regen, name assignment, webhook dedup) unless `--no-sanitize`
7. outputs results and optionally writes the fixed workflow to disk

## license

MIT
