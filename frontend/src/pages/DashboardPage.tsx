import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
  type WorkflowData,
} from '@/lib/api';
import { Plus, Trash2, LogOut, Play, Workflow, Key, Upload } from 'lucide-react';
import { CredentialsModal } from '@/components/CredentialsModal';
import { ImportWorkflowModal } from '@/components/ImportWorkflowModal';

export function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { deserializeFromPayload, setWorkflowId } = useWorkflowStore();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showImport, setShowImport] = useState(false);

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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)' }}>
      {/* Topbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid var(--color-border)',
          background: 'rgba(24, 24, 27, 0.7)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))',
              borderRadius: 'var(--radius-sm)',
              padding: 6,
              display: 'flex',
              boxShadow: '0 2px 8px var(--color-accent-glow)',
            }}
          >
            <Workflow size={18} color="white" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Sentient Flow</span>
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => setShowCredentials(true)} style={topBtnStyle}>
              <Key size={14} /> Credentials
            </button>
            <button onClick={() => setShowImport(true)} style={topBtnStyle}>
              <Upload size={14} /> Import JSON
            </button>
            <button onClick={handleCreate} style={primaryBtnStyle}>
              <Plus size={16} />
              New Workflow
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '100px 0' }}>
            <div style={{ display: 'inline-block', border: '2px solid var(--color-border)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
          </div>
        ) : workflows.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 80,
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px dashed var(--color-border-hover)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
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
                  borderRadius: 'var(--radius-lg)',
                  padding: 24,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                }}
                onClick={() => handleOpen(wf)}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
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
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, flex: 1 }}>
                  {wf.description || 'No description provided.'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                    marginTop: 'auto',
                    paddingTop: 12,
                    borderTop: '1px solid var(--color-border-subtle)',
                  }}
                >
                  Created {new Date(wf.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {showCredentials && <CredentialsModal onClose={() => setShowCredentials(false)} />}
      {showImport && (
        <ImportWorkflowModal 
          onClose={() => setShowImport(false)} 
          onSuccess={loadWorkflows} 
        />
      )}
    </div>
  );
}

const topBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  transition: 'all 0.2s',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  background: 'var(--color-text-primary)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-background)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  transition: 'transform 0.1s, opacity 0.2s',
  boxShadow: '0 2px 10px rgba(255,255,255,0.1)',
};
