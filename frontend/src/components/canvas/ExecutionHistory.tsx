import { useState, useEffect, useRef } from 'react';
import { getExecutions, getExecutionDetail, type ExecutionData, type ExecutionDetailData } from '@/lib/api';
import { useExecutionStore } from '@/stores/executionStore';
import { History, CheckCircle2, XCircle, Clock, Minus, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface ExecutionHistoryProps {
  workflowId: string | undefined;
}

export function ExecutionHistory({ workflowId }: ExecutionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [executions, setExecutions] = useState<ExecutionData[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<ExecutionDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const { nodeStatuses } = useExecutionStore();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Refresh list whenever the panel opens or execution statuses change
  const nodeStatusesLength = Object.keys(nodeStatuses).length;
  useEffect(() => {
    if (isOpen && workflowId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      getExecutions(workflowId)
        .then(setExecutions)
        .catch(() => setExecutions([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, workflowId, nodeStatusesLength]);

  const handleSelectExecution = async (exec: ExecutionData) => {
    if (!workflowId) return;
    if (selectedDetail?.id === exec.id) {
      setSelectedDetail(null);
      return;
    }
    try {
      const detail = await getExecutionDetail(workflowId, exec.id);
      setSelectedDetail(detail);
    } catch {
      setSelectedDetail(null);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 size={12} className="text-emerald-400" />;
      case 'failed': return <XCircle size={12} className="text-red-400" />;
      case 'running': return <Clock size={12} className="text-node-trigger" />;
      default: return <Minus size={12} className="text-zinc-500" />;
    }
  };

  const nodeStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle2 size={10} className="text-emerald-400" />;
      case 'error': return <XCircle size={10} className="text-red-400" />;
      case 'skipped': return <Minus size={10} className="text-zinc-600" />;
      default: return <Clock size={10} className="text-[#ff6d5a]" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Success';
      case 'failed': return 'Failed';
      case 'running': return 'Running';
      default: return 'Pending';
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const getDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors",
          isOpen
            ? "text-[#ff6d5a] bg-[#ff6d5a]/10"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
        )}
      >
        <History size={14} />
        <span className="hidden sm:inline">Runs</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[380px] max-h-[480px] overflow-hidden bg-[#1f1f23] border border-[#2e2e33] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] z-[200] flex flex-col animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#2e2e33] flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-zinc-200">Execution History</h3>
            <span className="text-[10px] text-zinc-600">{executions.length} runs</span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Loading */}
            {loading && (
              <div className="py-8 text-center text-zinc-600 text-[12px]">Loading…</div>
            )}

            {/* Empty state */}
            {!loading && executions.length === 0 && (
              <div className="py-8 text-center text-zinc-600 text-[12px]">
                No executions yet
              </div>
            )}

            {/* Execution list */}
            {executions.map((exec) => (
              <div key={exec.id}>
                <button
                  onClick={() => handleSelectExecution(exec)}
                  className={clsx(
                    "w-full flex items-center gap-2 px-4 py-2.5 text-left border-b border-[#2e2e33]/60 transition-colors",
                    selectedDetail?.id === exec.id
                      ? "bg-white/[0.04]"
                      : "hover:bg-white/[0.02]"
                  )}
                >
                  {statusIcon(exec.status)}
                  <span className={clsx(
                    "text-[12px] font-medium",
                    exec.status === 'completed' && "text-emerald-400",
                    exec.status === 'failed' && "text-red-400",
                    exec.status === 'running' && "text-[#ff6d5a]",
                    !['completed', 'failed', 'running'].includes(exec.status) && "text-zinc-400"
                  )}>
                    {statusLabel(exec.status)}
                  </span>
                  <span className="text-[10px] text-zinc-600 ml-auto">
                    {formatTime(exec.started_at || exec.created_at)}
                  </span>
                  <span className="text-[10px] text-zinc-600 min-w-[40px] text-right tabular-nums">
                    {getDuration(exec.started_at, exec.finished_at)}
                  </span>
                  <ChevronRight size={12} className={clsx(
                    "text-zinc-600 transition-transform",
                    selectedDetail?.id === exec.id && "rotate-90"
                  )} />
                </button>

                {/* Node detail */}
                {selectedDetail?.id === exec.id && (
                  <div className="px-4 py-2.5 bg-[#18181b] border-b border-[#2e2e33]/60">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                      Node Results
                    </div>
                    {selectedDetail.nodes.length === 0 && (
                      <div className="text-[10px] text-zinc-600">No node data recorded.</div>
                    )}
                    {selectedDetail.nodes.map((node) => (
                      <details key={node.id} className="mb-0.5 group/detail">
                        <summary className="flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded-md hover:bg-white/[0.03] text-[11px] list-none">
                          {nodeStatusIcon(node.status)}
                          <span className="font-medium font-mono text-zinc-300">
                            {node.node_name}
                          </span>
                          {node.error_message && (
                            <span className="text-red-400 text-[9px] ml-auto truncate max-w-[140px]">
                              {node.error_message}
                            </span>
                          )}
                        </summary>
                        <pre className="px-2 py-1.5 ml-5 text-[10px] font-mono text-zinc-500 whitespace-pre-wrap break-words leading-relaxed">
                          {JSON.stringify(node.output_data || node.error_message || '—', null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
