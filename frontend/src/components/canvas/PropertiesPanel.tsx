import { useWorkflowStore } from '@/stores/workflowStore';
import { X, Trash2 } from 'lucide-react';

export function PropertiesPanel() {
  const { selectedNode, updateNodeData, removeNode, selectNode } =
    useWorkflowStore();

  if (!selectedNode) return null;

  const data = selectedNode.data;
  const params = (data.parameters || {}) as Record<string, unknown>;

  const handleParamChange = (key: string, value: string) => {
    updateNodeData(selectedNode.id, {
      parameters: { ...params, [key]: value },
    });
  };

  return (
    <div
      style={{
        width: 320,
        background: 'var(--color-surface)',
        borderLeft: '1px solid var(--color-border)',
        padding: 0,
        overflowY: 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          {data.label}
        </h3>
        <button
          onClick={() => selectNode(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: 16, flex: 1 }}>
        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name</label>
          <input
            value={data.label}
            onChange={(e) =>
              updateNodeData(selectedNode.id, { label: e.target.value })
            }
            style={inputStyle}
          />
        </div>

        {/* Type */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Type</label>
          <div
            style={{
              ...inputStyle,
              background: 'var(--color-surface-active)',
              color: 'var(--color-text-secondary)',
              cursor: 'default',
            }}
          >
            {data.type}
          </div>
        </div>

        {/* Parameters */}
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Parameters (JSON)</label>
          <textarea
            value={JSON.stringify(params, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                updateNodeData(selectedNode.id, { parameters: parsed });
              } catch {
                // Allow partial editing — only update on valid JSON
              }
            }}
            rows={8}
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          />
        </div>

        {/* Disabled toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <input
            type="checkbox"
            checked={data.disabled || false}
            onChange={(e) =>
              updateNodeData(selectedNode.id, { disabled: e.target.checked })
            }
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Disabled
          </span>
        </div>

        {/* Quick parameter fields for known types */}
        {data.type === 'http' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>URL</label>
              <input
                value={(params.url as string) || ''}
                onChange={(e) => handleParamChange('url', e.target.value)}
                placeholder="https://api.example.com"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Method</label>
              <select
                value={(params.method as string) || 'GET'}
                onChange={(e) => handleParamChange('method', e.target.value)}
                style={inputStyle}
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
            </div>
          </>
        )}

        {data.type === 'delay' && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Seconds</label>
            <input
              type="number"
              value={(params.seconds as number) || 1}
              onChange={(e) => handleParamChange('seconds', e.target.value)}
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {/* Delete button */}
      <div style={{ padding: 16, borderTop: '1px solid var(--color-border)' }}>
        <button
          onClick={() => {
            removeNode(selectedNode.id);
            selectNode(null);
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'var(--color-error)15',
            color: 'var(--color-error)',
            border: '1px solid var(--color-error)33',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Trash2 size={14} />
          Delete Node
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-muted)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-primary)',
  fontSize: 13,
  outline: 'none',
};
