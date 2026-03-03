import { useState, useMemo } from 'react';
import { useExecutionStore } from '@/stores/executionStore';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Minus,
  X,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import clsx from 'clsx';

interface ExecutionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function ExecutionPanel({ isOpen, onToggle }: ExecutionPanelProps) {
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);

  const {
    isRunning,
    overallStatus,
    nodeStatuses,
    nodeResults,
    runningNode,
    error: executionError,
  } = useExecutionStore();

  // Build node list for current execution
  const currentNodes = useMemo(() => {
    return Object.entries(nodeStatuses).map(([name, status]) => ({
      name,
      status,
      result: nodeResults[name],
    }));
  }, [nodeStatuses, nodeResults]);

  // Currently selected node data
  const selectedCurrentNode = useMemo(() => {
    if (!selectedNodeName) return null;
    return nodeResults[selectedNodeName] || null;
  }, [selectedNodeName, nodeResults]);

  const statusIcon = (status: string, size = 13) => {
    switch (status) {
      case 'completed':
      case 'success':
        return <CheckCircle2 size={size} className="text-emerald-400" />;
      case 'failed':
      case 'error':
        return <XCircle size={size} className="text-red-400" />;
      case 'running':
        return <Clock size={size} className="text-node-trigger animate-pulse" />;
      case 'skipped':
        return <Minus size={size} className="text-zinc-600" />;
      default:
        return <Clock size={size} className="text-zinc-500" />;
    }
  };

  const hasData = currentNodes.length > 0 || overallStatus !== null;

  return (
    <div className={clsx(
      "n8n-execution-panel border-t border-[#2e2e33] bg-surface flex flex-col transition-all duration-300",
      isOpen ? "h-80" : "h-0"
    )}>
      {/* Panel Header */}
      {isOpen && (
        <div className="flex items-center h-9 px-3 border-b border-[#2e2e33] shrink-0 gap-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-zinc-100">
            {isRunning ? (
              <Clock size={12} className="text-node-trigger animate-pulse" />
            ) : overallStatus === 'success' ? (
              <CheckCircle2 size={12} className="text-emerald-400" />
            ) : overallStatus === 'failed' ? (
              <XCircle size={12} className="text-red-400" />
            ) : (
              <RotateCcw size={12} />
            )}
            Current Run
          </div>

          <div className="flex-1" />

          {/* Execution status summary */}
          {overallStatus && (
            <span className={clsx(
              "text-[10px] font-medium px-2 py-0.5 rounded-full",
              overallStatus === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            )}>
              {overallStatus === 'success' ? 'Completed' : 'Failed'}
            </span>
          )}
          {isRunning && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-node-trigger/10 text-node-trigger">
              Running…
            </span>
          )}

          <button
            onClick={onToggle}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Panel Content */}
      {isOpen && (
        <div className="flex-1 flex min-h-0">
          {!hasData ? (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-[12px]">
              Execute the workflow to see results here
            </div>
          ) : (
            <>
              {/* Node list (left) */}
              <div className="w-50 border-r border-[#2e2e33] overflow-y-auto shrink-0">
                {currentNodes.map(({ name, status }) => (
                  <button
                    key={name}
                    onClick={() => setSelectedNodeName(name)}
                    className={clsx(
                      "w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors border-b border-[#2e2e33]/40",
                      selectedNodeName === name
                        ? "bg-white/6 text-zinc-100"
                        : "text-zinc-400 hover:bg-white/3 hover:text-zinc-300"
                    )}
                  >
                    {name === runningNode
                      ? statusIcon('running', 12)
                      : statusIcon(status, 12)}
                    <span className="truncate font-medium">{name}</span>
                  </button>
                ))}
                {executionError && (
                  <div className="px-3 py-2 text-[10px] text-red-400 flex items-center gap-1.5">
                    <AlertTriangle size={11} />
                    <span className="truncate">{executionError}</span>
                  </div>
                )}
              </div>

              {/* Input / Output (right) */}
              <div className="flex-1 flex min-w-0">
                {selectedCurrentNode ? (
                  <NodeIOView
                    input={selectedCurrentNode.input}
                    output={selectedCurrentNode.result}
                    error={selectedCurrentNode.error}
                    status={selectedCurrentNode.status}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-600 text-[12px]">
                    <ArrowRight size={14} className="mr-2 text-zinc-700" />
                    Select a node to view its output
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Node Input/Output Viewer ── */
function NodeIOView({
  input,
  output,
  error,
  status,
}: {
  input: unknown;
  output: unknown;
  error?: string | null;
  status: string;
}) {
  const [viewTab, setViewTab] = useState<'output' | 'input'>('output');

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* IO Tabs */}
      <div className="flex items-center h-8 px-3 border-b border-[#2e2e33] gap-2 shrink-0">
        <button
          onClick={() => setViewTab('output')}
          className={clsx(
            "text-[11px] font-medium px-2 py-0.5 rounded transition-colors",
            viewTab === 'output'
              ? "bg-white/6 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          Output
        </button>
        {input !== null && input !== undefined && (
          <button
            onClick={() => setViewTab('input')}
            className={clsx(
              "text-[11px] font-medium px-2 py-0.5 rounded transition-colors",
              viewTab === 'input'
                ? "bg-white/6 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Input
          </button>
        )}

        {/* Status badge */}
        <div className="ml-auto">
          {status === 'error' && error && (
            <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full font-medium truncate max-w-50 inline-block">
              {error}
            </span>
          )}
          {(status === 'success' || status === 'completed') && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-medium">
              Success
            </span>
          )}
          {status === 'skipped' && (
            <span className="text-[10px] text-zinc-500 bg-zinc-500/10 px-2 py-0.5 rounded-full font-medium">
              Skipped
            </span>
          )}
        </div>
      </div>

      {/* Data display */}
      <div className="flex-1 overflow-auto p-3">
        <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap wrap-break-word leading-relaxed">
          {viewTab === 'output'
            ? formatData(output, error)
            : formatData(input, null)}
        </pre>
      </div>
    </div>
  );
}

function formatData(data: unknown, error?: string | null): string {
  if (error && (data === null || data === undefined)) {
    return `Error: ${error}`;
  }
  if (data === null || data === undefined) return 'No data';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
