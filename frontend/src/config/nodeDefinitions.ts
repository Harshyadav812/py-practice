import type { LucideIcon } from 'lucide-react';
import {
  Zap, Globe, GitBranch, Printer, Clock, Settings, Merge, Calculator,
  Code2, Repeat, Webhook, FileText, BrainCircuit, Tags, FileSearch,
} from 'lucide-react';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type PropertyType = 'string' | 'number' | 'boolean' | 'options' | 'json' | 'json-array' | 'code' | 'credential';

export type Category = 'trigger' | 'action' | 'logic' | 'output' | 'ai';

export interface NodeProperty {
  name: string;
  displayName: string;
  type: PropertyType;
  default: unknown;
  required?: boolean;        // Shows red asterisk, blocks execution if empty
  placeholder?: string;      // Hint text inside input
  description?: string;      // Help text below field
  options?: { name: string; value: string | number | boolean }[];
  min?: number;              // For number fields
  max?: number;              // For number fields
  pattern?: string;          // Regex validation for string fields
  patternMessage?: string;   // Custom error message when pattern fails
}

export interface NodeDefinition {
  type: string;
  defaultLabel: string;      // Default name when dropped onto canvas
  description: string;       // Shown in palette tooltip + properties header
  category: Category;
  icon: LucideIcon;
  outputCount: number;       // 1 for most, 2 for IF/condition, N for switch
  properties: NodeProperty[];
}

// =============================================================================
// VALIDATION HELPER
// =============================================================================

export interface ValidationError {
  field: string;
  message: string;
}

export function validateNodeParams(
  nodeType: string,
  params: Record<string, unknown>
): ValidationError[] {
  const def = NODE_DEFINITIONS[nodeType];
  if (!def) return [];

  const errors: ValidationError[] = [];

  for (const prop of def.properties) {
    const value = params[prop.name];

    // Required check
    if (prop.required) {
      if (value === undefined || value === null || value === '') {
        errors.push({ field: prop.name, message: `${prop.displayName} is required` });
        continue;
      }
    }

    // Skip further validation if empty and not required
    if (value === undefined || value === null || value === '') continue;

    // Number range checks
    if (prop.type === 'number' && typeof value === 'number') {
      if (prop.min !== undefined && value < prop.min) {
        errors.push({ field: prop.name, message: `${prop.displayName} must be at least ${prop.min}` });
      }
      if (prop.max !== undefined && value > prop.max) {
        errors.push({ field: prop.name, message: `${prop.displayName} must be at most ${prop.max}` });
      }
    }

    // Pattern check
    if (prop.type === 'string' && prop.pattern && typeof value === 'string') {
      const regex = new RegExp(prop.pattern);
      if (!regex.test(value)) {
        errors.push({
          field: prop.name,
          message: prop.patternMessage || `${prop.displayName} has invalid format`,
        });
      }
    }
  }

  return errors;
}

// =============================================================================
// NODE DEFINITIONS REGISTRY
// =============================================================================

export const NODE_DEFINITIONS: Record<string, NodeDefinition> = {

  // ─── TRIGGERS ──────────────────────────────────────────────────────────────

  manual_trigger: {
    type: 'manual_trigger',
    defaultLabel: 'Start',
    description: 'Manually starts the workflow. Every workflow needs at least one trigger.',
    category: 'trigger',
    icon: Zap,
    outputCount: 1,
    properties: [],
  },

  webhook: {
    type: 'webhook',
    defaultLabel: 'Webhook',
    description: 'Starts workflow when an HTTP request is received at the configured path.',
    category: 'trigger',
    icon: Webhook,
    outputCount: 1,
    properties: [
      {
        name: 'path',
        displayName: 'Path',
        type: 'string',
        default: '/my-webhook',
        required: true,
        placeholder: '/my-webhook',
        description: 'URL path that triggers this workflow (e.g. /my-webhook)',
        pattern: '^\\/.*',
        patternMessage: 'Path must start with /',
      },
      {
        name: 'method',
        displayName: 'HTTP Method',
        type: 'options',
        default: 'POST',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
        ],
      },
      {
        name: 'responseCode',
        displayName: 'Response Code',
        type: 'number',
        default: 200,
        min: 100,
        max: 599,
        description: 'HTTP status code to return after triggering',
      },
    ],
  },

  // ─── ACTIONS ───────────────────────────────────────────────────────────────

  http: {
    type: 'http',
    defaultLabel: 'HTTP Request',
    description: 'Make an HTTP request to any API endpoint.',
    category: 'action',
    icon: Globe,
    outputCount: 1,
    properties: [
      {
        name: 'url',
        displayName: 'URL',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://api.example.com/data',
        description: 'The URL to send the request to. Use $NodeName.field for dynamic values.',
        pattern: '^(https?:\\/\\/|\\$).*',
        patternMessage: 'Must be a valid URL (http:// or https://) or a $ variable reference',
      },
      {
        name: 'method',
        displayName: 'Method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
        ],
      },
      {
        name: 'body',
        displayName: 'Body',
        type: 'json',
        default: {},
        placeholder: '{ "key": "value" }',
        description: 'Request body (JSON). Only used for POST/PUT/PATCH.',
      },
      {
        name: 'headers',
        displayName: 'Headers',
        type: 'json',
        default: {},
        placeholder: '{ "Authorization": "Bearer ..." }',
        description: 'Custom HTTP headers to include in the request.',
      },
      {
        name: 'timeout',
        displayName: 'Timeout (seconds)',
        type: 'number',
        default: 60,
        min: 1,
        max: 300,
        description: 'Maximum wait time before the request times out.',
      },
      {
        name: 'retries',
        displayName: 'Retries',
        type: 'number',
        default: 0,
        min: 0,
        max: 10,
        description: 'Number of times to retry on failure.',
      },
      {
        name: 'retry_delay',
        displayName: 'Retry Delay (seconds)',
        type: 'number',
        default: 1,
        min: 0,
        max: 60,
      },
    ],
  },

  calculate: {
    type: 'calculate',
    defaultLabel: 'Calculate',
    description: 'Perform math operations on numbers.',
    category: 'action',
    icon: Calculator,
    outputCount: 1,
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'options',
        default: 'add',
        required: true,
        options: [
          { name: 'Add (+)', value: 'add' },
          { name: 'Subtract (−)', value: 'sub' },
          { name: 'Multiply (×)', value: 'mul' },
          { name: 'Divide (÷)', value: 'divide' },
        ],
      },
      {
        name: 'numbers',
        displayName: 'Numbers',
        type: 'json-array',
        default: [1, 1],
        required: true,
        description: 'Array of numbers. Example: [10, 5, 2]. Use $ references for dynamic values.',
        placeholder: '[10, 5, 2]',
      },
    ],
  },

  delay: {
    type: 'delay',
    defaultLabel: 'Wait',
    description: 'Pause workflow execution for a specified duration.',
    category: 'action',
    icon: Clock,
    outputCount: 1,
    properties: [
      {
        name: 'seconds',
        displayName: 'Seconds',
        type: 'number',
        default: 1,
        required: true,
        min: 0,
        max: 3600,
        description: 'How many seconds to wait before continuing.',
      },
    ],
  },

  code: {
    type: 'code',
    defaultLabel: 'Code',
    description: 'Execute a Python expression. Has access to input data via the "input" variable.',
    category: 'action',
    icon: Code2,
    outputCount: 1,
    properties: [
      {
        name: 'expression',
        displayName: 'Expression',
        type: 'code',
        default: '',
        required: true,
        placeholder: 'len(input) if isinstance(input, list) else input',
        description: 'Python expression to evaluate. The variable "input" contains data from the previous node. Only expressions are allowed (no import, exec, etc).',
      },
      {
        name: 'fallback',
        displayName: 'Fallback Value',
        type: 'string',
        default: '',
        placeholder: 'null',
        description: 'Value to return if the expression throws an error. Leave empty to propagate errors.',
      },
    ],
  },

  // ─── LOGIC ─────────────────────────────────────────────────────────────────

  if: {
    type: 'if',
    defaultLabel: 'IF',
    description: 'Branch workflow based on a condition. TRUE = output 0 (green), FALSE = output 1 (red).',
    category: 'logic',
    icon: GitBranch,
    outputCount: 2,
    properties: [
      {
        name: 'left',
        displayName: 'Value 1 (Left)',
        type: 'string',
        default: '',
        required: true,
        placeholder: "$'Set Data'.count",
        description: 'First comparison value. Use $ syntax to reference other node outputs.',
      },
      {
        name: 'operator',
        displayName: 'Operator',
        type: 'options',
        default: '==',
        required: true,
        options: [
          { name: 'Equals (==)', value: '==' },
          { name: 'Not Equals (!=)', value: '!=' },
          { name: 'Greater Than (>)', value: '>' },
          { name: 'Less Than (<)', value: '<' },
          { name: 'Greater or Equal (>=)', value: '>=' },
          { name: 'Less or Equal (<=)', value: '<=' },
          { name: 'Contains', value: 'contains' },
          { name: 'Starts With', value: 'startswith' },
          { name: 'Ends With', value: 'endswith' },
        ],
      },
      {
        name: 'right',
        displayName: 'Value 2 (Right)',
        type: 'string',
        default: '',
        required: true,
        placeholder: '10',
        description: 'Second comparison value.',
      },
    ],
  },

  condition: {
    type: 'condition',
    defaultLabel: 'Condition',
    description: 'Alias for IF node. Branches TRUE (output 0) / FALSE (output 1).',
    category: 'logic',
    icon: GitBranch,
    outputCount: 2,
    properties: [
      {
        name: 'left',
        displayName: 'Value 1 (Left)',
        type: 'string',
        default: '',
        required: true,
        placeholder: "$'Set Data'.count",
      },
      {
        name: 'operator',
        displayName: 'Operator',
        type: 'options',
        default: '==',
        required: true,
        options: [
          { name: 'Equals (==)', value: '==' },
          { name: 'Not Equals (!=)', value: '!=' },
          { name: 'Greater Than (>)', value: '>' },
          { name: 'Less Than (<)', value: '<' },
          { name: 'Greater or Equal (>=)', value: '>=' },
          { name: 'Less or Equal (<=)', value: '<=' },
          { name: 'Contains', value: 'contains' },
          { name: 'Starts With', value: 'startswith' },
          { name: 'Ends With', value: 'endswith' },
        ],
      },
      {
        name: 'right',
        displayName: 'Value 2 (Right)',
        type: 'string',
        default: '',
        required: true,
        placeholder: '10',
      },
    ],
  },

  switch: {
    type: 'switch',
    defaultLabel: 'Switch',
    description: 'Route to different outputs based on a value matching cases.',
    category: 'logic',
    icon: GitBranch,
    outputCount: 3,
    properties: [
      {
        name: 'value',
        displayName: 'Value to Match',
        type: 'string',
        default: '',
        required: true,
        placeholder: "$'Set Data'.status",
        description: 'The value to compare against each case.',
      },
      {
        name: 'cases',
        displayName: 'Cases',
        type: 'json-array',
        default: [],
        required: true,
        placeholder: '["active", "paused", "stopped"]',
        description: 'Array of values to match. Each case maps to an output index.',
      },
    ],
  },

  merge: {
    type: 'merge',
    defaultLabel: 'Merge',
    description: 'Combine data from multiple incoming branches into one.',
    category: 'logic',
    icon: Merge,
    outputCount: 1,
    properties: [
      {
        name: 'mode',
        displayName: 'Mode',
        type: 'options',
        default: 'append',
        options: [
          { name: 'Append (combine all inputs)', value: 'append' },
        ],
        description: 'How to combine the incoming data.',
      },
    ],
  },

  loop: {
    type: 'loop',
    defaultLabel: 'Loop',
    description: 'Iterate over a list from the previous node. Each item is passed downstream one at a time.',
    category: 'logic',
    icon: Repeat,
    outputCount: 1,
    properties: [
      {
        name: 'listExpression',
        displayName: 'List Source',
        type: 'string',
        default: '',
        required: true,
        placeholder: "$'HTTP Request'.data",
        description: 'Expression that resolves to a list. Each item will be passed as input to the next node.',
      },
      {
        name: 'maxIterations',
        displayName: 'Max Iterations',
        type: 'number',
        default: 100,
        min: 1,
        max: 10000,
        description: 'Safety limit to prevent infinite loops.',
      },
    ],
  },

  // ─── OUTPUT ────────────────────────────────────────────────────────────────

  set: {
    type: 'set',
    defaultLabel: 'Set Data',
    description: 'Store a value that can be referenced by downstream nodes using $ syntax.',
    category: 'output',
    icon: Settings,
    outputCount: 1,
    properties: [
      {
        name: 'value',
        displayName: 'Value',
        type: 'json',
        default: {},
        placeholder: '{ "name": "John", "count": 42 }',
        description: 'The data object to store. Access fields downstream with $\'Set Data\'.name',
      },
    ],
  },

  print: {
    type: 'print',
    defaultLabel: 'Print',
    description: 'Output data to the console. If no content is specified, prints the input from the previous node.',
    category: 'output',
    icon: Printer,
    outputCount: 1,
    properties: [
      {
        name: 'content',
        displayName: 'Content',
        type: 'string',
        default: '',
        placeholder: 'Leave empty to print input data',
        description: 'Static text or $ reference to print. Leave empty to pass through input.',
      },
    ],
  },

  text_template: {
    type: 'text_template',
    defaultLabel: 'Text Template',
    description: 'Build a string by interpolating values from other nodes using $ syntax.',
    category: 'output',
    icon: FileText,
    outputCount: 1,
    properties: [
      {
        name: 'template',
        displayName: 'Template',
        type: 'string',
        default: '',
        required: true,
        placeholder: "Hello $'Set Data'.name, your score is $'Calculate'.result",
        description: 'Text with $ variables. Each $reference is replaced with the actual value at runtime.',
      },
    ],
  },

  // ─── AI / LLM ──────────────────────────────────────────────────────────────

  llm_chat: {
    type: 'llm_chat',
    defaultLabel: 'AI Chat',
    description: 'Send a prompt to any LLM (OpenAI, Anthropic, Google, NVIDIA, Ollama) and get a response.',
    category: 'ai',
    icon: BrainCircuit,
    outputCount: 1,
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'options',
        default: 'openai',
        required: true,
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google Gemini', value: 'google' },
          { name: 'NVIDIA NIM', value: 'nvidia' },
          { name: 'Ollama (local)', value: 'ollama' },
          { name: 'Custom OpenAI-compatible', value: 'custom' },
        ],
        description: 'LLM provider to use.',
      },
      {
        name: 'api_key',
        displayName: 'API Key (direct)',
        type: 'string',
        default: '',
        placeholder: 'sk-...',
        description: 'Paste the API key directly, OR use Credential ID below for encrypted storage. One of the two is required.',
      },
      {
        name: 'credential',
        displayName: 'Credential',
        type: 'credential',
        default: '',
        placeholder: 'Select a saved credential',
        description: 'Choose a saved credential containing your API key. Alternatively, paste the key directly above.',
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'string',
        default: '',
        placeholder: 'gpt-4o-mini',
        description: 'Model name (leave empty for provider default: gpt-4o-mini, claude-sonnet-4-20250514, gemini-2.0-flash, etc).',
      },
      {
        name: 'system_prompt',
        displayName: 'System Prompt',
        type: 'string',
        default: '',
        placeholder: 'You are a helpful assistant...',
        description: 'Optional system prompt to set the LLM\'s behavior.',
      },
      {
        name: 'prompt',
        displayName: 'User Prompt',
        type: 'string',
        default: '',
        required: true,
        placeholder: "Explain $'Set Data'.topic in simple terms",
        description: 'The prompt to send. Use $ syntax for dynamic values. If empty, uses input from the previous node.',
      },
      {
        name: 'temperature',
        displayName: 'Temperature',
        type: 'number',
        default: 0.7,
        min: 0,
        max: 2,
        description: '0 = deterministic, 1 = creative, 2 = max randomness.',
      },
      {
        name: 'max_tokens',
        displayName: 'Max Tokens',
        type: 'number',
        default: 1024,
        min: 1,
        max: 128000,
        description: 'Maximum number of tokens in the response.',
      },
      {
        name: 'base_url',
        displayName: 'Custom Base URL',
        type: 'string',
        default: '',
        placeholder: 'https://my-api.example.com/v1/chat/completions',
        description: 'Override the API endpoint URL (for custom/self-hosted providers).',
      },
    ],
  },

  llm_classify: {
    type: 'llm_classify',
    defaultLabel: 'AI Classify',
    description: 'Classify text into categories using an LLM. Perfect for sentiment analysis, content moderation, intent detection.',
    category: 'ai',
    icon: Tags,
    outputCount: 1,
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'options',
        default: 'openai',
        required: true,
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google Gemini', value: 'google' },
          { name: 'NVIDIA NIM', value: 'nvidia' },
          { name: 'Ollama (local)', value: 'ollama' },
          { name: 'Custom OpenAI-compatible', value: 'custom' },
        ],
      },
      {
        name: 'api_key',
        displayName: 'API Key (direct)',
        type: 'string',
        default: '',
        placeholder: 'sk-...',
        description: 'Paste API key directly, or use Credential ID below.',
      },
      {
        name: 'credential',
        displayName: 'Credential',
        type: 'credential',
        default: '',
        placeholder: 'Select a saved credential',
        description: 'Choose a saved credential containing your API key.',
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'string',
        default: '',
        placeholder: 'gpt-4o-mini',
        description: 'Model name (leave empty for provider default).',
      },
      {
        name: 'text',
        displayName: 'Text to Classify',
        type: 'string',
        default: '',
        placeholder: "$'HTTP Request'.body or paste text here",
        description: 'The text to classify. If empty, uses input from previous node.',
      },
      {
        name: 'categories',
        displayName: 'Categories',
        type: 'json-array',
        default: ['positive', 'negative', 'neutral'],
        required: true,
        placeholder: '["spam", "ham"]',
        description: 'Array of category labels. The LLM picks exactly one.',
      },
      {
        name: 'base_url',
        displayName: 'Custom Base URL',
        type: 'string',
        default: '',
        placeholder: 'https://my-api.example.com/v1/chat/completions',
      },
    ],
  },

  llm_summarize: {
    type: 'llm_summarize',
    defaultLabel: 'AI Summarize',
    description: 'Summarize long text using an LLM. Choose style and length.',
    category: 'ai',
    icon: FileSearch,
    outputCount: 1,
    properties: [
      {
        name: 'provider',
        displayName: 'Provider',
        type: 'options',
        default: 'openai',
        required: true,
        options: [
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google Gemini', value: 'google' },
          { name: 'NVIDIA NIM', value: 'nvidia' },
          { name: 'Ollama (local)', value: 'ollama' },
          { name: 'Custom OpenAI-compatible', value: 'custom' },
        ],
      },
      {
        name: 'api_key',
        displayName: 'API Key (direct)',
        type: 'string',
        default: '',
        placeholder: 'sk-...',
        description: 'Paste API key directly, or use Credential ID below.',
      },
      {
        name: 'credential',
        displayName: 'Credential',
        type: 'credential',
        default: '',
        placeholder: 'Select a saved credential',
        description: 'Choose a saved credential containing your API key.',
      },
      {
        name: 'model',
        displayName: 'Model',
        type: 'string',
        default: '',
        placeholder: 'gpt-4o-mini',
        description: 'Model name (leave empty for provider default).',
      },
      {
        name: 'text',
        displayName: 'Text to Summarize',
        type: 'string',
        default: '',
        placeholder: "$'HTTP Request'.body or paste text here",
        description: 'The text to summarize. If empty, uses input from previous node.',
      },
      {
        name: 'style',
        displayName: 'Style',
        type: 'options',
        default: 'concise',
        options: [
          { name: 'Concise', value: 'concise' },
          { name: 'Detailed', value: 'detailed' },
          { name: 'Bullet Points', value: 'bullet points' },
          { name: 'ELI5 (Simple)', value: 'simple, explain-like-im-5' },
          { name: 'Technical', value: 'technical' },
        ],
        description: 'Summary style.',
      },
      {
        name: 'max_length',
        displayName: 'Max Length',
        type: 'options',
        default: '2-3 sentences',
        options: [
          { name: '1 sentence', value: '1 sentence' },
          { name: '2-3 sentences', value: '2-3 sentences' },
          { name: '1 paragraph', value: '1 paragraph' },
          { name: '3-5 bullet points', value: '3-5 bullet points' },
        ],
        description: 'Approximate length of the summary.',
      },
      {
        name: 'base_url',
        displayName: 'Custom Base URL',
        type: 'string',
        default: '',
        placeholder: 'https://my-api.example.com/v1/chat/completions',
      },
    ],
  },
};

// =============================================================================
// HELPERS
// =============================================================================

/** Get default parameters for a node type (used when dropping from palette) */
export function getDefaultParams(nodeType: string): Record<string, unknown> {
  const def = NODE_DEFINITIONS[nodeType];
  if (!def) return {};

  const params: Record<string, unknown> = {};
  for (const prop of def.properties) {
    if (prop.default !== undefined && prop.default !== '') {
      params[prop.name] = prop.default;
    }
  }
  return params;
}

/** Get all node types available for the palette */
export function getNodeTemplates() {
  return Object.values(NODE_DEFINITIONS).map((def) => ({
    type: def.type,
    label: def.defaultLabel,
    category: def.category,
    icon: def.icon,
    description: def.description,
  }));
}
