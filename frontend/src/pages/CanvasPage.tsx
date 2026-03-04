import { useCallback, useRef, useEffect, useState, type DragEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowNode } from '@/components/canvas/WorkflowNode';
import { DeletableEdge } from '@/components/canvas/DeletableEdge';
import { NodePalette } from '@/components/canvas/NodePalette';
import { PropertiesPanel } from '@/components/canvas/PropertiesPanel';
import { ExecutionPanel } from '@/components/canvas/ExecutionPanel';
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
  Play,
  Loader2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  Save,
  Check,
  PanelLeftOpen,
  PanelLeftClose,
  PanelBottomOpen,
  PanelBottomClose,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';

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

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isExecutionPanelOpen, setIsExecutionPanelOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<WorkflowError[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);

  const {
    nodes,
    edges,
    workflowName,
    saveStatus,
    setWorkflowId,
    setWorkflowName,
    saveWorkflow,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    selectNode,
    settingsNodeId,
    serializeToPayload,
    deserializeFromPayload,
  } = useWorkflowStore();

  const { isRunning, execute, clear } = useExecutionStore();
  const overallStatus = useExecutionStore(s => s.overallStatus);

  // Auto-open execution panel when running starts
  useEffect(() => {
    if (isRunning) setIsExecutionPanelOpen(true);
  }, [isRunning]);

  // Load workflow from API
  useEffect(() => {
    if (id) {
      clear(); // Reset execution state when switching workflows
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
  }, [id, clear, setWorkflowId, deserializeFromPayload, setWorkflowName]);

  // Clear validation when nodes/edges change
  useEffect(() => {
    if (showErrors) {
      setShowErrors(false);
      setValidationErrors([]);
    }
  }, [nodes, edges, showErrors]);

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveWorkflow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveWorkflow]);

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

  // Run workflow with pre-validation
  const handleRun = async () => {
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
    setIsStartingRun(true);

    try {
      const payload = serializeToPayload();
      if (id) {
        try {
          await updateWorkflow(id, { name: workflowName, data: payload });
        } catch {
          toast.error('Failed to save before running');
          setIsStartingRun(false);
          return;
        }
      }

      await execute(payload, id);
    } finally {
      setIsStartingRun(false);
    }
  };

  const errorNodeIds = new Set(validationErrors.map((e) => e.nodeId));
  const isPropertiesPanelOpen = !!settingsNodeId;

  return (
    <div className="w-full h-full flex flex-col bg-[#18181b] overflow-hidden">
      {/* ── n8n-style Top Header Bar ── */}
      <div className="n8n-canvas-header flex items-center h-13 px-2 border-b border-[#2e2e33] bg-surface shrink-0 z-50">
        {/* Left: Back + Workflow Name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors shrink-0"
            title="Back to workflows"
          >
            <ChevronLeft size={18} />
          </button>

          <input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            onBlur={() => saveWorkflow()}
            className="bg-transparent text-[14px] font-semibold text-zinc-100 outline-none border-none px-1.5 py-1 rounded-md hover:bg-white/4 focus:bg-white/6 transition-colors min-w-0 max-w-70 truncate"
            spellCheck={false}
          />

          {/* Save status indicator */}
          <div className="flex items-center gap-1 text-[11px] shrink-0 ml-1">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                Saving…
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-500">
                <Check size={12} />
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Save Button */}
          <button
            onClick={() => saveWorkflow()}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            title="Save (Ctrl+S)"
          >
            <Save size={14} />
          </button>

          {/* Palette Toggle */}
          <button
            onClick={() => setIsPaletteOpen((prev) => !prev)}
            className={clsx(
              "flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors",
              isPaletteOpen
                ? "text-node-trigger bg-node-trigger/10 hover:bg-node-trigger/15"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            )}
            title="Toggle node palette"
          >
            {isPaletteOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            <span className="hidden sm:inline">Nodes</span>
          </button>

          {/* Execution Panel Toggle */}
          <button
            onClick={() => setIsExecutionPanelOpen((prev) => !prev)}
            className={clsx(
              "flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors",
              isExecutionPanelOpen
                ? "text-node-trigger bg-node-trigger/10 hover:bg-node-trigger/15"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
            )}
            title="Toggle execution panel"
          >
            {isExecutionPanelOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
            <span className="hidden sm:inline">Runs</span>
            {overallStatus === 'success' && !isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
            {overallStatus === 'failed' && !isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            )}
            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-node-trigger animate-pulse" />
            )}
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-[#2e2e33] mx-0.5" />

          {/* Execute Button */}
          <button
            onClick={handleRun}
            disabled={isRunning || isStartingRun}
            className={clsx(
              "flex items-center gap-2 h-8 px-4 rounded-lg text-[13px] font-semibold transition-all",
              (isRunning || isStartingRun)
                ? "bg-surface-hover text-zinc-500 cursor-not-allowed"
                : "bg-node-trigger hover:bg-accent-hover text-white shadow-[0_0_12px_rgba(255,109,90,0.2)] hover:shadow-[0_0_20px_rgba(255,109,90,0.35)]"
            )}
          >
            {(isRunning || isStartingRun) ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} className="fill-current" />
            )}
            {isRunning ? 'Running…' : 'Execute'}
          </button>
        </div>
      </div>

      {/* ── Validation Errors Banner (below header) ── */}
      {showErrors && validationErrors.length > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-2 bg-red-500/8 border-b border-red-500/20 text-[12px] text-red-400 shrink-0">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="font-medium shrink-0">
            {validationErrors.length} {validationErrors.length === 1 ? 'error' : 'errors'}
          </span>
          <span className="text-red-300/80 truncate">
            {validationErrors.slice(0, 2).map((e) => e.message).join(' · ')}
            {validationErrors.length > 2 && ` +${validationErrors.length - 2} more`}
          </span>
          <button
            onClick={() => setShowErrors(false)}
            className="ml-auto text-red-400/60 hover:text-red-300 p-0.5"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Node Palette (n8n-style left panel) */}
        <div
          className={clsx(
            "n8n-palette-panel h-full border-r border-[#2e2e33] bg-surface transition-all duration-300 overflow-hidden shrink-0",
            isPaletteOpen ? "w-65" : "w-0 border-r-0"
          )}
        >
          <NodePalette />
        </div>

        {/* Center: Canvas + Execution Panel stacked vertically */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Canvas Area */}
          <div className="flex-1 relative min-h-0" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes.map((n) => ({
                ...n,
                style: errorNodeIds.has(n.id)
                  ? { outline: '2px solid var(--color-error)', outlineOffset: 4, borderRadius: '0.75rem' }
                  : undefined,
              }))}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => selectNode(node)}
              onNodeDoubleClick={(_, node) => {
                const { setSettingsNodeId } = useWorkflowStore.getState();
                setSettingsNodeId(node.id);
              }}
              onPaneClick={() => selectNode(null)}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{
                type: 'deletable',
                style: { stroke: '#3a3a40', strokeWidth: 1.5 },
              }}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
              fitViewOptions={{ maxZoom: 1 }}
              proOptions={{ hideAttribution: true }}
              className="n8n-canvas"
              colorMode="dark"
            >
              <Background gap={24} size={1.5} color="#27272a" />
              <Controls
                className="n8n-controls"
                position="bottom-left"
                showInteractive={false}
              />
              <MiniMap
                nodeColor={() => '#3a3a40'}
                maskColor="rgba(24,24,27,0.85)"
                className="n8n-minimap"
                position="bottom-right"
                pannable
                zoomable
              />
            </ReactFlow>

            {/* Properties Panel — slides over canvas from right */}
            {isPropertiesPanelOpen && <PropertiesPanel />}
          </div>

          {/* Bottom: Execution Panel */}
          <ExecutionPanel
            isOpen={isExecutionPanelOpen}
            onToggle={() => setIsExecutionPanelOpen(prev => !prev)}
          />
        </div>
      </div>
    </div>
  );
}
