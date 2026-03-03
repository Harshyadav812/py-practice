import { create } from 'zustand';
import * as dagre from "dagre";
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
import { updateWorkflow } from '@/lib/api';
import { toast } from 'sonner';

export interface NodeData {
  label: string;
  type: string;
  category: 'trigger' | 'action' | 'logic' | 'output' | 'ai';
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
  settingsNodeId: string | null;

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
  setSettingsNodeId: (nodeId: string | null) => void;
  renameNode: (nodeId: string, newName: string) => void;
  clear: () => void;
  layoutNodes: () => void;

  saveStatus: 'idle' | 'saving' | 'saved';
  saveWorkflow: () => Promise<void>;

  // Serialize to/from backend format
  serializeToPayload: () => Record<string, unknown>;
  deserializeFromPayload: (data: Record<string, unknown>) => void;
}

let nodeIdCounter = 1;
export function generateNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

export function getUniqueNodeName(requestedName: string, existingNames: string[]): string {
  const trimmedName = requestedName.trim();
  const nameSet = new Set(existingNames);
  if (!nameSet.has(trimmedName)) {
    return trimmedName;
  }

  // Base name extraction: "Run 1" -> "Run", "Run" -> "Run"
  const match = trimmedName.match(/^(.*?)(?:\\s+(\\d+))?$/);
  const baseName = match ? match[1].trim() : trimmedName;

  let counter = 1;
  let newName = `${baseName} ${counter}`;

  while (nameSet.has(newName)) {
    counter++;
    newName = `${baseName} ${counter}`;
  }

  return newName;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowId: null,
  workflowName: 'Untitled Workflow',
  nodes: [],
  edges: [],
  selectedNode: null,
  settingsNodeId: null,

  setWorkflowId: (id) => set({ workflowId: id }),
  setWorkflowName: (name) => set({ workflowName: name }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setSettingsNodeId: (id) => set({ settingsNodeId: id }),

  saveStatus: 'idle',
  saveWorkflow: async () => {
    const { workflowId, workflowName, serializeToPayload } = get();
    if (!workflowId) return;
    set({ saveStatus: 'saving' });
    try {
      const payload = serializeToPayload();
      await updateWorkflow(workflowId, { name: workflowName, data: payload });
      set({ saveStatus: 'saved' });
      toast.success('Workflow saved');
      setTimeout(() => set({ saveStatus: 'idle' }), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      set({ saveStatus: 'idle' });
      toast.error('Failed to save workflow');
    }
  },

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<NodeData>[] }),
  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) =>
    set({ edges: addEdge({ ...connection, animated: true }, get().edges) }),

  addNode: (node) => set((state) => {
    const existingNames = state.nodes.map(n => n.data.label);
    const uniqueName = getUniqueNodeName(node.data.label, existingNames);
    const nodeWithUniqueName = {
      ...node,
      data: {
        ...node.data,
        label: uniqueName
      }
    };
    return { nodes: [...state.nodes, nodeWithUniqueName] };
  }),

  updateNodeData: (nodeId, data) =>
    set((state) => {
      const newNodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      );
      const newSelectedNode =
        state.selectedNode?.id === nodeId
          ? newNodes.find((n) => n.id === nodeId) || null
          : state.selectedNode;
      return { nodes: newNodes, selectedNode: newSelectedNode };
    }),

  renameNode: (nodeId, newName) =>
    set((state) => {
      const otherNames = state.nodes
        .filter(n => n.id !== nodeId)
        .map(n => n.data.label);
      const uniqueName = getUniqueNodeName(newName, otherNames);

      const newNodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label: uniqueName } } : n
      );
      const newSelectedNode =
        state.selectedNode?.id === nodeId
          ? newNodes.find((n) => n.id === nodeId) || null
          : state.selectedNode;
      return { nodes: newNodes, selectedNode: newSelectedNode };
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
      settingsNodeId: null,
    }),

  layoutNodes: () => {
    const { nodes, edges } = get();
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // n8n inspired layout settings
    dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 150 });

    nodes.forEach((node) => {
      // Approximate sizes based on our new node design
      dagreGraph.setNode(node.id, { width: 220, height: 100 });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const newNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        // dagre returns center coordinates, we shift to top-left
        position: {
          x: nodeWithPosition.x - 110,
          y: nodeWithPosition.y - 50,
        },
      };
    });

    set({ nodes: newNodes });
  },

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
      if (type.startsWith('llm_')) return 'ai';
      return 'action';
    };

    const usedNames: string[] = [];
    const nameMap: Record<string, string> = {}; // Mapping from oldName -> uniqueNewName

    const rfNodes: Node<NodeData>[] = (payload.nodes || []).map((n, i) => {
      const originalName = n.name;
      const uniqueName = getUniqueNodeName(originalName, usedNames);
      usedNames.push(uniqueName);
      nameMap[originalName] = uniqueName;

      return {
        id: n.id,
        type: 'workflow',
        position: {
          x: n.position?.[0] ?? 200 + i * 250,
          y: n.position?.[1] ?? 200,
        },
        data: {
          label: uniqueName,
          type: n.type,
          category: getCategory(n.type),
          parameters: n.parameters || {},
          credentials: n.credentials,
          disabled: n.disabled,
        },
      };
    });

    const nodesByName = new Map(rfNodes.map((n) => [n.data.label, n]));
    const rfEdges: Edge[] = [];

    if (payload.connections) {
      for (const [sourceName, conn] of Object.entries(payload.connections)) {
        const uniqueSourceName = nameMap[sourceName] || sourceName;
        const sourceNode = nodesByName.get(uniqueSourceName);
        if (!sourceNode || !conn.main) continue;

        for (let outputIdx = 0; outputIdx < conn.main.length; outputIdx++) {
          for (const target of conn.main[outputIdx]) {
            const uniqueTargetName = nameMap[target.node] || target.node;
            const targetNode = nodesByName.get(uniqueTargetName);
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

    // Auto-layout if nodes seem to be stacked at origin
    if (rfNodes.length > 1 && rfNodes.every(n => n.position.x === 0 && n.position.y === 0)) {
      setTimeout(() => get().layoutNodes(), 50);
    }
  },
}));
