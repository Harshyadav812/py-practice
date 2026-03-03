import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore';
import { useExecutionStore } from '@/stores/executionStore';
import { validateWorkflow } from '@/lib/validateWorkflow';
import { updateWorkflow } from '@/lib/api';
import { toast } from 'sonner';
import {
  Zap, Globe, GitBranch, Printer, Clock, Settings, Merge, Loader2,
  Code2, Repeat, Webhook, FileText, BrainCircuit, Tags, FileSearch, RotateCcw,
  Trash2, Check, X as XIcon, type LucideIcon
} from 'lucide-react';
import clsx from 'clsx';

const categoryColors: Record<string, string> = {
  trigger: '#ff6d5a',
  action: '#3b82f6',
  logic: '#a855f7',
  output: '#10b981',
  ai: '#a78bfa',
};

const typeIcons: Record<string, LucideIcon> = {
  manual_trigger: Zap,
  webhook: Webhook,
  http: Globe,
  if: GitBranch,
  condition: GitBranch,
  switch: GitBranch,
  print: Printer,
  delay: Clock,
  set: Settings,
  calculate: Settings,
  merge: Merge,
  code: Code2,
  loop: Repeat,
  text_template: FileText,
  llm_chat: BrainCircuit,
  llm_classify: Tags,
  llm_summarize: FileSearch,
};

export function WorkflowNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;
  const runningNode = useExecutionStore(state => state.runningNode);
  const nodeStatuses = useExecutionStore(state => state.nodeStatuses);

  const executionId = useExecutionStore(state => state.executionId);
  const resume = useExecutionStore(state => state.resume);
  const overallStatus = useExecutionStore(state => state.overallStatus);
  const isGlobalRunning = useExecutionStore(state => state.isRunning);

  const {
    nodes,
    edges,
    workflowName,
    workflowId,
    serializeToPayload,
    removeNode,
    setSettingsNodeId,
  } = useWorkflowStore();

  const [isStartingRun, setIsStartingRun] = useState(false);

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!executionId) return;

    const result = validateWorkflow(nodes, edges);
    if (!result.valid) {
      toast.error(`Validation failed: ${result.errors.length} error(s)`);
      return;
    }

    setIsStartingRun(true);
    try {
      const payload = serializeToPayload();
      if (workflowId) {
        await updateWorkflow(workflowId, { name: workflowName, data: payload });
      }
      await resume(executionId);
    } catch {
      toast.error('Failed to save before resuming');
    } finally {
      setIsStartingRun(false);
    }
  };

  const isRunning = runningNode === nodeData.label;
  const status = nodeStatuses[nodeData.label];
  const color = categoryColors[nodeData.category] || '#6366f1';
  const Icon = typeIcons[nodeData.type] || Settings;
  const isLogicNode = nodeData.category === 'logic' && nodeData.type !== 'merge';
  const isTrigger = nodeData.category === 'trigger';

  return (
    <div className="relative group flex flex-col items-center">
      {/* Floating Toolbar (above node, visible on hover/select) */}
      <div className={clsx(
        "absolute -top-9 flex items-center justify-center gap-0.5 transition-opacity duration-150 pointer-events-auto z-10",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        {status === 'error' && overallStatus === 'failed' && executionId && (
          <button
            onClick={handleRetry}
            disabled={isGlobalRunning || isStartingRun}
            className="p-1 hover:bg-surface-hover rounded text-red-400 transition-colors disabled:opacity-50 bg-surface border border-[#2e2e33]"
            title="Retry from this node"
          >
            <RotateCcw size={13} className={isStartingRun ? "animate-spin" : ""} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setSettingsNodeId(id); }}
          className="p-1 hover:bg-surface-hover rounded text-zinc-500 hover:text-zinc-300 transition-colors bg-surface border border-[#2e2e33] shadow-sm"
          title="Settings"
        >
          <Settings size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); removeNode(id); }}
          className="p-1 hover:bg-red-500/15 rounded text-zinc-500 hover:text-red-400 transition-colors bg-surface border border-[#2e2e33] shadow-sm"
          title="Delete Node"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* n8n-style Node Box */}
      <div
        className={clsx(
          "n8n-node relative flex items-center justify-center bg-surface transition-all duration-200",
          "w-25 h-20",
          isTrigger ? "rounded-l-[28px] rounded-r-[14px]" : "rounded-[14px]",
          nodeData.disabled && "opacity-40 grayscale",
          // Status border
          isRunning && "n8n-node-running",
          status === 'success' && !isRunning && "border-2 border-emerald-500",
          status === 'error' && !isRunning && "border-2 border-red-500",
          !status && !isRunning && selected && "border-[1.5px] border-zinc-500 shadow-[0_0_0_4px_rgba(113,113,122,0.15)]",
          !status && !isRunning && !selected && "border-[1.5px] border-[#2e2e33] hover:border-zinc-600",
        )}
      >
        {/* Running animated gradient border */}
        {isRunning && (
          <div
            className={clsx(
              "absolute -inset-0.75 z-[-1] n8n-running-border",
              isTrigger ? "rounded-l-[31px] rounded-r-[17px]" : "rounded-[17px]"
            )}
          />
        )}

        {/* Icon */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}18` }}
        >
          {isRunning ? (
            <Loader2 size={22} className="animate-spin" style={{ color }} />
          ) : (
            <Icon size={22} style={{ color }} strokeWidth={1.8} />
          )}
        </div>

        {/* Disabled Strike-through */}
        {nodeData.disabled && (
          <div className={clsx(
            "absolute top-1/2 -left-1 w-[calc(100%+8px)] h-px pointer-events-none -translate-y-1/2",
            status === 'success' ? "bg-emerald-500/50" : "bg-zinc-500"
          )} />
        )}

        {/* Status badge (bottom-right) */}
        {!isRunning && status && (
          <div className={clsx(
            "absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full border-2 border-[#18181b]",
            status === 'success' && "bg-emerald-500 w-5 h-5",
            status === 'error' && "bg-red-500 w-5 h-5",
          )}>
            {status === 'success' && <Check size={11} className="text-white" strokeWidth={3} />}
            {status === 'error' && <XIcon size={11} className="text-white" strokeWidth={3} />}
          </div>
        )}
      </div>

      {/* Node label (below the node box) */}
      <div className="mt-1.5 max-w-30 text-center">
        <div className="text-[15px] font-medium text-zinc-350 truncate leading-tight">
          {nodeData.label}
        </div>
        <div className="text-[14px] text-zinc-600 truncate mt-0.5">
          {nodeData.disabled ? 'Disabled' : nodeData.type.replace(/_/g, ' ')}
        </div>
      </div>

      {/* Input Handle */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          id="input-0"
          className={clsx(
            "w-2.5! h-2.5! border-2! border-[#18181b]! rounded-full!",
            status === 'success' ? "bg-emerald-500!" : status === 'error' ? "bg-red-400!" : "bg-zinc-500!"
          )}
          style={{ top: '40px' }}
        />
      )}

      {/* Output Handles */}
      {isLogicNode ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="output-0"
            className="w-2.5! h-2.5! bg-emerald-500! border-2! border-[#18181b]! rounded-full!"
            style={{ top: '28px' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output-1"
            className="w-2.5! h-2.5! bg-red-500! border-2! border-[#18181b]! rounded-full!"
            style={{ top: '52px' }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="output-0"
          className={clsx(
            "w-2.5! h-2.5! border-2! border-[#18181b]! rounded-full!",
            status === 'success' ? "bg-emerald-500!" : status === 'error' ? "bg-red-400!" : "bg-zinc-500!"
          )}
          style={{ top: '40px' }}
        />
      )}
    </div>
  );
}
