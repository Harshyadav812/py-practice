import { useCallback, useRef, useEffect, type DragEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowNode } from '@/components/canvas/WorkflowNode';
import { NodePalette } from '@/components/canvas/NodePalette';
import { PropertiesPanel } from '@/components/canvas/PropertiesPanel';
import {
  useWorkflowStore,
  generateNodeId,
  type NodeData,
} from '@/stores/workflowStore';
import { NODE_DEFINITIONS } from '@/config/nodeDefinitions';
import { useExecutionStore } from '@/stores/executionStore';
import { updateWorkflow, getWorkflow } from '@/lib/api';
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  LayoutTemplate,
} from 'lucide-react';

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
};

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const {
    nodes,
    edges,
    workflowName,
    setWorkflowId,
    setWorkflowName,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    serializeToPayload,
    deserializeFromPayload,
    layoutNodes,
  } = useWorkflowStore();

  const { isRunning, results, error, execute, clear } = useExecutionStore();

  // Load workflow from API
  useEffect(() => {
    if (id) {
      setWorkflowId(id);
      getWorkflow(id)
        .then((wf) => {
          if (wf.data) {
            deserializeFromPayload(wf.data);
          }
          setWorkflowName(wf.name);
        })
        .catch(console.error);
    }
  }, [id]);

  // Drag and drop from palette
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/reactflow');
      if (!data) return;

      const template = JSON.parse(data) as {
        type: string;
        label: string;
        category: NodeData['category'];
      };

      const wrapper = reactFlowWrapper.current;
      if (!wrapper) return;

      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const def = NODE_DEFINITIONS[template.type];
      const initialParams: Record<string, unknown> = {};
      if (def && def.properties) {
        def.properties.forEach(prop => {
          initialParams[prop.name] = prop.default;
        });
      }

      const newNode = {
        id: generateNodeId(),
        type: 'workflow',
        position,
        data: {
          label: template.label,
          type: template.type,
          category: template.category,
          parameters: initialParams,
        } as NodeData,
      };

      addNode(newNode);
    },
    [addNode]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Save workflow
  const handleSave = async () => {
    if (!id) return;
    const payload = serializeToPayload();
    try {
      await updateWorkflow(id, {
        name: workflowName,
        data: payload,
      });
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  // Run workflow
  const handleRun = async () => {
    clear();
    const payload = serializeToPayload();
    await execute(payload);
  };

  // Get execution status for a node
  const getNodeStatus = (label: string) => {
    if (!results) return null;
    const r = results[label] as Record<string, unknown> | undefined;
    if (!r) return null;
    if (r.status === 'skipped') return 'skipped';
    if (r.error) return 'error';
    return 'success';
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            style={topBtnStyle}
            title="Back to Dashboard"
          >
            <ArrowLeft size={14} />
          </button>
          <input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-primary)',
              fontSize: 15,
              fontWeight: 600,
              outline: 'none',
              width: 250,
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={layoutNodes} style={topBtnStyle} title="Auto Layout Nodes">
            <LayoutTemplate size={14} />
            Auto Layout
          </button>
          {results && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: error
                  ? 'var(--color-error)'
                  : 'var(--color-success)',
              }}
            >
              {error ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
              {error ? 'Failed' : 'Complete'}
            </div>
          )}
          <button
            onClick={handleRun}
            disabled={isRunning}
            style={{
              ...topBtnStyle,
              background: isRunning
                ? 'var(--color-surface-active)'
                : 'var(--color-success)',
              color: isRunning ? 'var(--color-text-muted)' : 'white',
              border: 'none',
              fontWeight: 600,
            }}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {isRunning ? 'Running…' : 'Run'}
          </button>
          <button onClick={handleSave} style={topBtnStyle}>
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Palette */}
        <NodePalette />

        {/* Canvas */}
        <div ref={reactFlowWrapper} style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => selectNode(node)}
            onPaneClick={() => selectNode(null)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: 'var(--color-border-hover)', strokeWidth: 2 },
            }}
          >
            <Background
              gap={20}
              size={1}
              color="var(--color-border)"
            />
            <Controls
              style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' }}
            />
            <MiniMap
              style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-sm)',
              }}
              maskColor="var(--color-background)bb"
              nodeColor="var(--color-accent)"
            />
          </ReactFlow>
        </div>

        {/* Properties panel */}
        <PropertiesPanel />
      </div>

      {/* Execution results toast */}
      {results && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            maxWidth: 400,
            maxHeight: 300,
            overflowY: 'auto',
            boxShadow: '0 8px 32px #000a',
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              Execution Results
            </span>
            <button
              onClick={clear}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
          </div>
          {Object.entries(results).map(([node, result]) => {
            const status = getNodeStatus(node);
            return (
              <div
                key={node}
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                <span
                  style={{
                    color:
                      status === 'error'
                        ? 'var(--color-error)'
                        : status === 'skipped'
                        ? 'var(--color-text-muted)'
                        : 'var(--color-success)',
                    fontWeight: 600,
                  }}
                >
                  {node}:
                </span>{' '}
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {typeof result === 'object'
                    ? JSON.stringify(result, null, 1).slice(0, 100)
                    : String(result)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const topBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  background: 'var(--color-surface-hover)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-primary)',
  cursor: 'pointer',
  fontSize: 13,
};
