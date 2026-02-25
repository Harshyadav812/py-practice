import { NODE_DEFINITIONS, validateNodeParams, type ValidationError } from '@/config/nodeDefinitions';
import type { NodeData } from '@/stores/workflowStore';
import type { Node, Edge } from '@xyflow/react';

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowError[];
}

export interface WorkflowError {
  nodeId: string;
  nodeName: string;
  field?: string;
  message: string;
}

export function validateWorkflow(
  nodes: Node<NodeData>[],
  edges: Edge[]
): WorkflowValidationResult {
  const errors: WorkflowError[] = [];

  // 1. Must have at least one node
  if (nodes.length === 0) {
    errors.push({
      nodeId: '',
      nodeName: '',
      message: 'Workflow has no nodes. Add at least one node.',
    });
    return { valid: false, errors };
  }

  // 2. Must have at least one trigger node
  const triggerNodes = nodes.filter(
    (n) => n.data.category === 'trigger'
  );
  if (triggerNodes.length === 0) {
    errors.push({
      nodeId: '',
      nodeName: '',
      message: 'Workflow needs at least one trigger node (e.g. Manual Trigger, Webhook).',
    });
  }

  // 3. Validate each node's parameters
  for (const node of nodes) {
    if (node.data.disabled) continue;

    const def = NODE_DEFINITIONS[node.data.type];
    if (!def) continue;

    const paramErrors: ValidationError[] = validateNodeParams(
      node.data.type,
      (node.data.parameters || {}) as Record<string, unknown>
    );

    for (const err of paramErrors) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        field: err.field,
        message: `${node.data.label}: ${err.message}`,
      });
    }
  }

  // 4. Check for non-trigger nodes without any incoming connections
  const nodesWithIncoming = new Set(edges.map((e) => e.target));
  for (const node of nodes) {
    if (node.data.disabled) continue;
    if (node.data.category === 'trigger') continue;

    if (!nodesWithIncoming.has(node.id)) {
      errors.push({
        nodeId: node.id,
        nodeName: node.data.label,
        message: `${node.data.label}: No incoming connection. This node will never execute.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
