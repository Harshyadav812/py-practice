import { useCallback, useRef, useEffect, useState, type DragEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowNode } from '@/components/canvas/WorkflowNode';
import { DeletableEdge } from '@/components/canvas/DeletableEdge';
import { NodePalette } from '@/components/canvas/NodePalette';
import { PropertiesPanel } from '@/components/canvas/PropertiesPanel';
import {
  useWorkflowStore,
  generateNodeId,
  type NodeData,
} from '@/stores/workflowStore';
import { useExecutionStore } from '@/stores/executionStore';
import { updateWorkflow, getWorkflow } from '@/lib/api';
import { getDefaultParams, NODE_DEFINITIONS } from '@/config/nodeDefinitions';
import { validateWorkflow, type WorkflowError } from '@/lib/validateWorkflow';
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Menu,
} from 'lucide-react';
import { toast } from 'sonner';

const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,
};

const edgeTypes: EdgeTypes = {
  deletable: DeletableEdge,
};

export function CanvasPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [validationErrors, setValidationErrors] = useState<WorkflowError[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

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

  // Clear validation when nodes/edges change
  useEffect(() => {
    if (showErrors) {
      setShowErrors(false);
      setValidationErrors([]);
    }
  }, [nodes, edges]);

  // Drag and drop from palette — with default params
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

      const bounds = wrapper.getBoundingClientRect();
      const position = {
        x: e.clientX - bounds.left - 90,
        y: e.clientY - bounds.top - 30,
      };

      // Get default parameters from node definition
      const defaultParams = getDefaultParams(template.type);
      const def = NODE_DEFINITIONS[template.type];

      const newNode = {
        id: generateNodeId(),
        type: 'workflow',
        position,
        data: {
          label: def?.defaultLabel || template.label,
          type: template.type,
          category: template.category,
          parameters: defaultParams,
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
    setSaveStatus('saving');
    const payload = serializeToPayload();
    try {
      await updateWorkflow(id, {
        name: workflowName,
        data: payload,
      });
      setSaveStatus('saved');
      toast.success('Workflow saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('idle');
      toast.error('Failed to save workflow');
    }
  };

  // Run workflow with pre-validation
  const handleRun = async () => {
    // Validate first
    const result = validateWorkflow(nodes, edges);
    if (!result.valid) {
      setValidationErrors(result.errors);
      setShowErrors(true);
      toast.error(`Validation failed: ${result.errors.length} error(s)`);
      return;
    }

    setShowErrors(false);
    setValidationErrors([]);
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

  // Check if node has validation errors
  const errorNodeIds = new Set(validationErrors.map((e) => e.nodeId));

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
          <button
            onClick={() => setIsPaletteOpen((prev) => !prev)}
            style={topBtnStyle}
            title="Toggle Nodes Palette"
          >
            <Menu size={14} />
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
          {/* Execution status */}
          {results && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: error ? 'var(--color-error)' : 'var(--color-success)',
              }}
            >
              {error ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
              {error ? 'Failed' : 'Complete'}
            </div>
          )}

          {/* Run button */}
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
            {isRunning ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {isRunning ? 'Running…' : 'Run'}
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            style={{
              ...topBtnStyle,
              ...(saveStatus === 'saved'
                ? { color: 'var(--color-success)', borderColor: 'var(--color-success)' }
                : {}),
            }}
          >
            {saveStatus === 'saving' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saveStatus === 'saved' ? (
              <CheckCircle2 size={14} />
            ) : (
              <Save size={14} />
            )}
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Validation errors banner */}
      {showErrors && validationErrors.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'rgba(248, 113, 113, 0.1)',
            borderBottom: '1px solid rgba(248, 113, 113, 0.3)',
            fontSize: 13,
            color: 'var(--color-error)',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={14} />
          <span style={{ fontWeight: 600 }}>
            {validationErrors.length} validation {validationErrors.length === 1 ? 'error' : 'errors'}:
          </span>
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {validationErrors.slice(0, 3).map((e) => e.message).join(' · ')}
            {validationErrors.length > 3 && ` · +${validationErrors.length - 3} more`}
          </span>
          <button
            onClick={() => setShowErrors(false)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Palette */}
        {isPaletteOpen && <NodePalette />}

        {/* Canvas */}
        <div ref={reactFlowWrapper} style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes.map((n) => ({
              ...n,
              style: errorNodeIds.has(n.id)
                ? { outline: '2px solid var(--color-error)', outlineOffset: 2, borderRadius: 'var(--radius-lg)' }
                : undefined,
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => selectNode(node)}
            onPaneClick={() => selectNode(null)}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              animated: true,
              type: 'deletable',
              style: { stroke: 'var(--color-border-hover)', strokeWidth: 2 },
            }}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="var(--color-border)" />
            <Controls
              style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-sm)',
              }}
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
            width: 420,
            maxHeight: 400,
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
            const fullValue = typeof result === 'object'
              ? JSON.stringify(result, null, 2)
              : String(result);
            return (
              <details
                key={node}
                style={{
                  marginBottom: 4,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-background)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              >
                <summary
                  style={{
                    padding: '6px 8px',
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    userSelect: 'none',
                  }}
                >
                  <span style={{
                    fontSize: 8,
                    color: 'var(--color-text-muted)',
                    transition: 'transform 0.15s ease',
                  }}>▶</span>
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
                    {node}
                  </span>
                </summary>
                <pre
                  style={{
                    padding: '6px 8px 8px 22px',
                    margin: 0,
                    color: 'var(--color-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    lineHeight: 1.5,
                    borderTop: '1px solid var(--color-border)',
                  }}
                >
                  {fullValue}
                </pre>
              </details>
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
