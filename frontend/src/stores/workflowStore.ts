import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';

export interface NodeData {
  label: string;
  type: string;
  category: 'trigger' | 'action' | 'logic' | 'output';
  parameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
  [key: string]: unknown;
}

interface WorkflowState {
  workflowId: string | null;
  workflowName: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  selectedNode: Node<NodeData> | null;

  setWorkflowId: (id: string | null) => void;
  setWorkflowName: (name: string) => void;
  setNodes: (nodes: Node<NodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node<NodeData>) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (node: Node<NodeData> | null) => void;
  clear: () => void;

  // Serialize to/from backend format
  serializeToPayload: () => Record<string, unknown>;
  deserializeFromPayload: (data: Record<string, unknown>) => void;
}

let nodeIdCounter = 1;
export function generateNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: null,
  workflowName: 'Untitled Workflow',
  nodes: [],
  edges: [],
  selectedNode: null,

  setWorkflowId: (id) => set({ workflowId: id }),
  setWorkflowName: (name) => set({ workflowName: name }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<NodeData>[] }),
  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) =>
    set({ edges: addEdge({ ...connection, animated: true }, get().edges) }),

  addNode: (node) => set({ nodes: [...get().nodes, node] }),

  updateNodeData: (nodeId, data) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }),

  removeNode: (nodeId) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
      selectedNode:
        get().selectedNode?.id === nodeId ? null : get().selectedNode,
    }),

  selectNode: (node) => set({ selectedNode: node }),

  clear: () =>
    set({
      workflowId: null,
      workflowName: 'Untitled Workflow',
      nodes: [],
      edges: [],
      selectedNode: null,
    }),

  // Convert React Flow state → backend WorkflowPayload
  serializeToPayload: () => {
    const { nodes, edges, workflowName } = get();

    const backendNodes = nodes.map((n) => ({
      id: n.id,
      name: n.data.label,
      type: n.data.type,
      position: [n.position.x, n.position.y],
      parameters: n.data.parameters || {},
      credentials: n.data.credentials || undefined,
      disabled: n.data.disabled || false,
    }));

    // Build connections map from edges
    const connections: Record<
      string,
      { main: Array<Array<{ node: string; type: string; index: number }>> }
    > = {};

    for (const edge of edges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;
      const sourceName = sourceNode.data.label;

      if (!connections[sourceName]) {
        connections[sourceName] = { main: [[]] };
      }

      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!targetNode) continue;

      const outputIndex = parseInt(edge.sourceHandle?.replace('output-', '') || '0');
      while (connections[sourceName].main.length <= outputIndex) {
        connections[sourceName].main.push([]);
      }

      connections[sourceName].main[outputIndex].push({
        node: targetNode.data.label,
        type: 'main',
        index: 0,
      });
    }

    return {
      name: workflowName,
      nodes: backendNodes,
      connections,
    };
  },

  // Convert backend data → React Flow nodes/edges
  deserializeFromPayload: (data: Record<string, unknown>) => {
    const payload = data as {
      name?: string;
      nodes?: Array<{
        id: string;
        name: string;
        type: string;
        position?: number[];
        parameters?: Record<string, unknown>;
        credentials?: Record<string, unknown>;
        disabled?: boolean;
      }>;
      connections?: Record<
        string,
        { main?: Array<Array<{ node: string; type: string; index: number }>> }
      >;
    };

    const getCategory = (type: string): NodeData['category'] => {
      if (type.includes('trigger')) return 'trigger';
      if (type === 'if' || type === 'switch' || type === 'merge' || type === 'condition')
        return 'logic';
      if (type === 'print' || type === 'set') return 'output';
      return 'action';
    };

    const rfNodes: Node<NodeData>[] = (payload.nodes || []).map((n, i) => ({
      id: n.id,
      type: 'workflow',
      position: {
        x: n.position?.[0] ?? 200 + i * 250,
        y: n.position?.[1] ?? 200,
      },
      data: {
        label: n.name,
        type: n.type,
        category: getCategory(n.type),
        parameters: n.parameters || {},
        credentials: n.credentials,
        disabled: n.disabled,
      },
    }));

    const nodesByName = new Map(rfNodes.map((n) => [n.data.label, n]));
    const rfEdges: Edge[] = [];

    if (payload.connections) {
      for (const [sourceName, conn] of Object.entries(payload.connections)) {
        const sourceNode = nodesByName.get(sourceName);
        if (!sourceNode || !conn.main) continue;

        for (let outputIdx = 0; outputIdx < conn.main.length; outputIdx++) {
          for (const target of conn.main[outputIdx]) {
            const targetNode = nodesByName.get(target.node);
            if (!targetNode) continue;

            rfEdges.push({
              id: `e-${sourceNode.id}-${targetNode.id}-${outputIdx}`,
              source: sourceNode.id,
              target: targetNode.id,
              sourceHandle: `output-${outputIdx}`,
              targetHandle: 'input-0',
              animated: true,
            });
          }
        }
      }
    }

    set({
      workflowName: payload.name || 'Untitled Workflow',
      nodes: rfNodes,
      edges: rfEdges,
      selectedNode: null,
    });
  },
}));
