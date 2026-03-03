import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkflowStore } from '@/stores/workflowStore';
import {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
  type WorkflowData,
} from '@/lib/api';
import { Plus, Trash2, Upload, Loader2, Workflow, Search } from 'lucide-react';
import { ImportWorkflowModal } from '@/components/ImportWorkflowModal';
import { Button } from '@/components/ui/button';

export function DashboardPage() {
  const { deserializeFromPayload, setWorkflowId } = useWorkflowStore();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const data = await getWorkflows();
      setWorkflows(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load workflows');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const wf = await createWorkflow({
        name: 'New Workflow',
        data: {
          name: 'New Workflow',
          nodes: [
            {
              id: 'node_1',
              name: 'Start',
              type: 'manual_trigger',
              position: [200, 250],
              parameters: {},
            },
          ],
          connections: {},
        },
      });
      toast.success('Workflow created');
      navigate(`/canvas/${wf.id}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create workflow');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWorkflow(id);
      setWorkflows((wfs) => wfs.filter((w) => w.id !== id));
      toast.success('Workflow deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete workflow');
    }
  }

  function handleOpen(wf: WorkflowData) {
    setWorkflowId(wf.id);
    if (wf.data) {
      deserializeFromPayload(wf.data);
    }
    navigate(`/canvas/${wf.id}`);
  }

  const filteredWorkflows = workflows.filter(wf =>
    wf.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const nodeCount = (wf: WorkflowData) => {
    try {
      return wf.data?.nodes?.length || 0;
    } catch { return 0; }
  };

  return (
    <div className="min-h-full bg-[#18181b] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
              Workflows
            </h1>
            <p className="text-[13px] text-zinc-500 mt-0.5">
              {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImport(true)}
              className="border-[#2e2e33] bg-transparent text-zinc-400 hover:bg-white/4 hover:text-zinc-200 h-8 text-[12px]"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              className="bg-node-trigger hover:bg-accent-hover text-white h-8 text-[12px] shadow-sm"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New Workflow
            </Button>
          </div>
        </div>

        {/* Search bar */}
        {workflows.length > 0 && (
          <div className="mb-5 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search workflows…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full max-w-sm h-9 pl-9 pr-3 bg-[#1f1f23] border border-[#2e2e33] rounded-lg text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-[#ff6d5a]/40 transition-colors"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-zinc-500">
            <Loader2 className="h-6 w-6 animate-spin text-[#ff6d5a] mb-3" />
            <p className="text-[13px]">Loading workflows…</p>
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-[#2e2e33] bg-[#1f1f23]/50 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#2a2a2f] mb-4">
              <Workflow className="h-7 w-7 text-zinc-500" />
            </div>
            <h3 className="text-base font-medium text-zinc-200 mb-1.5">No workflows yet</h3>
            <p className="text-[13px] text-zinc-500 max-w-xs mb-5">
              Create your first workflow to start automating tasks.
            </p>
            <Button
              size="sm"
              onClick={handleCreate}
              className="bg-[#ff6d5a] hover:bg-[#e85a48] text-white h-8 text-[12px]"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Workflow
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_100px_80px_40px] gap-3 px-4 py-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              <span>Name</span>
              <span>Created</span>
              <span>Nodes</span>
              <span>ID</span>
              <span></span>
            </div>

            {/* Workflow rows */}
            {filteredWorkflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => handleOpen(wf)}
                className="group grid grid-cols-[1fr_120px_100px_80px_40px] gap-3 items-center px-4 py-3 rounded-lg cursor-pointer transition-all hover:bg-white/[0.03] border border-transparent hover:border-[#2e2e33]"
              >
                {/* Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ff6d5a]/10">
                    <Workflow className="h-4 w-4 text-[#ff6d5a]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-zinc-200 truncate">
                      {wf.name}
                    </div>
                    {wf.description && (
                      <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                        {wf.description}
                      </div>
                    )}
                  </div>
                </div>

                {/* Created */}
                <div className="text-[12px] text-zinc-500">
                  {new Date(wf.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>

                {/* Nodes */}
                <div className="text-[12px] text-zinc-500">
                  {nodeCount(wf)} node{nodeCount(wf) !== 1 ? 's' : ''}
                </div>

                {/* ID */}
                <div className="text-[11px] text-zinc-600 font-mono">
                  {wf.id.slice(0, 6)}
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(wf.id);
                    }}
                    title="Delete workflow"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {filteredWorkflows.length === 0 && searchQuery && (
              <div className="text-center py-12 text-zinc-500 text-[13px]">
                No workflows match "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      <ImportWorkflowModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={loadWorkflows}
      />
    </div>
  );
}
