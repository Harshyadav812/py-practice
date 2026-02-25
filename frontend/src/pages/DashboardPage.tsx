import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
  type WorkflowData,
} from '@/lib/api';
import { Plus, Trash2, LogOut, Zap, Play } from 'lucide-react';

export function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { deserializeFromPayload, setWorkflowId } = useWorkflowStore();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const data = await getWorkflows();
      setWorkflows(data);
    } catch {
      // Will redirect if auth fails
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
      navigate(`/canvas/${wf.id}`);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteWorkflow(id);
      setWorkflows((wfs) => wfs.filter((w) => w.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  function handleOpen(wf: WorkflowData) {
    setWorkflowId(wf.id);
    if (wf.data) {
      deserializeFromPayload(wf.data);
    }
    navigate(`/canvas/${wf.id}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
      {/* Topbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              background: 'var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              padding: 6,
              display: 'flex',
            }}
          >
            <Zap size={16} color="white" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Sentient Flow</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {user?.email}
          </span>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            style={topBtnStyle}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            My Workflows
          </h1>
          <button onClick={handleCreate} style={primaryBtnStyle}>
            <Plus size={16} />
            New Workflow
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 60 }}>
            Loading…
          </div>
        ) : workflows.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 60,
              color: 'var(--color-text-muted)',
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <p style={{ fontSize: 16, marginBottom: 8 }}>No workflows yet</p>
            <p style={{ fontSize: 13 }}>Create your first workflow to get started</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280, 1fr))',
              gap: 12,
            }}
          >
            {workflows.map((wf) => (
              <div
                key={wf.id}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 18,
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--color-border-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = 'var(--color-border)')
                }
                onClick={() => handleOpen(wf)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Play size={14} color="var(--color-accent)" />
                    {wf.name}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(wf.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {wf.description || 'No description'}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-text-muted)',
                    marginTop: 8,
                  }}
                >
                  Created {new Date(wf.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  background: 'var(--color-accent)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  color: 'white',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
