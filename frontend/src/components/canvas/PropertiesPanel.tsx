import { useState, useMemo } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { X, Trash2, Plus, Code, List } from 'lucide-react';
import { NODE_DEFINITIONS, validateNodeParams, type ValidationError } from '@/config/nodeDefinitions';

export function PropertiesPanel() {
  const { selectedNode, updateNodeData, removeNode, selectNode } =
    useWorkflowStore();

  const [isRawMode, setIsRawMode] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const data = selectedNode?.data;
  const params = (data?.parameters || {}) as Record<string, unknown>;
  const nodeType = data?.type || '';

  // Live validation — hooks must run unconditionally (Rules of Hooks)
  const validationErrors = useMemo(
    () => (nodeType ? validateNodeParams(nodeType, params) : []),
    [nodeType, params]
  );
  const errorsByField = useMemo(() => {
    const map = new Map<string, ValidationError>();
    for (const err of validationErrors) {
      map.set(err.field, err);
    }
    return map;
  }, [validationErrors]);

  if (!selectedNode || !data) return null;

  const def = NODE_DEFINITIONS[data.type];
  const schemaProps = def?.properties || [];
  const mappedKeys = new Set(schemaProps.map(p => p.name));
  const extraParamKeys = Object.keys(params).filter(k => !mappedKeys.has(k));

  const handleParamChange = (key: string, value: unknown) => {
    updateNodeData(selectedNode.id, {
      ...data,
      parameters: { ...params, [key]: value },
    });
  };

  const handleParamBlur = (key: string, value: string) => {
    if (value.trim() === '') return;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') {
        updateNodeData(selectedNode.id, {
          ...data,
          parameters: { ...params, [key]: parsed },
        });
      }
    } catch {
      // Valid string, leave as string
    }
  };

  const handleAddParam = () => {
    if (!newKey.trim()) return;
    let finalValue: unknown = newValue;
    try {
      if (newValue.trim() !== '') {
        finalValue = JSON.parse(newValue);
      }
    } catch {
      finalValue = newValue;
    }
    updateNodeData(selectedNode.id, {
      ...data,
      parameters: { ...params, [newKey.trim()]: finalValue },
    });
    setNewKey('');
    setNewValue('');
  };

  const handleRemoveParam = (k: string) => {
    const nextParams = { ...params };
    delete nextParams[k];
    updateNodeData(selectedNode.id, { ...data, parameters: nextParams });
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
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            {data.label}
          </h3>
          {def && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {def.description}
            </div>
          )}
        </div>
        <button
          onClick={() => selectNode(null)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            padding: 4,
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Validation summary */}
      {validationErrors.length > 0 && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '8px 10px',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--color-error)',
          }}
        >
          {validationErrors.length} validation {validationErrors.length === 1 ? 'error' : 'errors'}
        </div>
      )}

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
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Parameters</label>
            <button
              onClick={() => setIsRawMode(!isRawMode)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-accent)',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 0,
              }}
            >
              {isRawMode ? <List size={14} /> : <Code size={14} />}
              {isRawMode ? 'UI Editor' : 'Raw JSON'}
            </button>
          </div>

          {isRawMode ? (
            <textarea
              value={JSON.stringify(params, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  updateNodeData(selectedNode.id, { parameters: parsed });
                } catch {
                  // Allow partial editing
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
          ) : (
            <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              
              {/* Schema-defined Properties */}
              {schemaProps.map((prop) => {
                const value = params[prop.name] ?? prop.default;
                const error = errorsByField.get(prop.name);
                const hasError = !!error;

                return (
                  <div key={prop.name} style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>
                      {prop.displayName}
                      {prop.required && (
                        <span style={{ color: 'var(--color-error)', marginLeft: 2 }}>*</span>
                      )}
                    </label>

                    {/* Options (select) */}
                    {prop.type === 'options' && (
                      <select
                        value={String(value)}
                        onChange={(e) => handleParamChange(prop.name, e.target.value)}
                        style={{
                          ...inputStyle,
                          ...(hasError ? errorInputStyle : {}),
                        }}
                      >
                        {prop.options?.map((opt) => (
                          <option key={String(opt.value)} value={String(opt.value)}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Boolean (checkbox) */}
                    {prop.type === 'boolean' && (
                      <input
                        type="checkbox"
                        checked={!!value}
                        onChange={(e) => handleParamChange(prop.name, e.target.checked)}
                        style={{ accentColor: 'var(--color-accent)' }}
                      />
                    )}

                    {/* Number */}
                    {prop.type === 'number' && (
                      <input
                        type="number"
                        value={value as number}
                        min={prop.min}
                        max={prop.max}
                        onChange={(e) => handleParamChange(prop.name, parseFloat(e.target.value) || 0)}
                        placeholder={prop.placeholder}
                        style={{
                          ...inputStyle,
                          ...(hasError ? errorInputStyle : {}),
                        }}
                      />
                    )}

                    {/* String */}
                    {prop.type === 'string' && (
                      <input
                        type="text"
                        value={value as string}
                        onChange={(e) => handleParamChange(prop.name, e.target.value)}
                        placeholder={prop.placeholder}
                        style={{
                          ...inputStyle,
                          ...(hasError ? errorInputStyle : {}),
                        }}
                      />
                    )}

                    {/* Code */}
                    {prop.type === 'code' && (
                      <textarea
                        value={(value as string) || ''}
                        onChange={(e) => handleParamChange(prop.name, e.target.value)}
                        placeholder={prop.placeholder}
                        rows={4}
                        style={{
                          ...inputStyle,
                          resize: 'vertical',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          lineHeight: 1.5,
                          ...(hasError ? errorInputStyle : {}),
                        }}
                      />
                    )}

                    {/* JSON / JSON-Array */}
                    {(prop.type === 'json' || prop.type === 'json-array') && (
                      <textarea
                        value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')}
                        onChange={(e) => handleParamChange(prop.name, e.target.value)}
                        onBlur={(e) => handleParamBlur(prop.name, e.target.value)}
                        placeholder={prop.placeholder}
                        style={{
                          ...inputStyle,
                          resize: 'vertical',
                          fontFamily: 'monospace',
                          fontSize: 12,
                          lineHeight: 1.5,
                          minHeight: 60,
                          ...(hasError ? errorInputStyle : {}),
                        }}
                      />
                    )}

                    {/* Validation error */}
                    {hasError && (
                      <div style={{
                        fontSize: 11,
                        color: 'var(--color-error)',
                        marginTop: 4,
                        fontWeight: 500,
                      }}>
                        ⚠ {error.message}
                      </div>
                    )}

                    {/* Description / help text */}
                    {prop.description && !hasError && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                        {prop.description}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Extra / Custom Parameters */}
              {extraParamKeys.length > 0 && (
                <div style={{
                  marginTop: schemaProps.length > 0 ? 16 : 0,
                  borderTop: schemaProps.length > 0 ? '1px solid var(--color-border)' : 'none',
                  paddingTop: schemaProps.length > 0 ? 12 : 0,
                }}>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>Additional Parameters</label>
                  {extraParamKeys.map((k) => {
                    const v = params[k];
                    return (
                      <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, fontSize: 13, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>
                          {k}
                        </div>
                        <input
                          value={typeof v === 'string' ? v : JSON.stringify(v)}
                          onChange={(e) => handleParamChange(k, e.target.value)}
                          onBlur={(e) => handleParamBlur(k, e.target.value)}
                          style={{ ...inputStyle, flex: 2, padding: '6px 8px', fontSize: 13 }}
                        />
                        <button
                          onClick={() => handleRemoveParam(k)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add New Parameter */}
              <div style={{
                display: 'flex', gap: 8,
                marginTop: schemaProps.length > 0 && extraParamKeys.length === 0 ? 16 : 12,
                borderTop: schemaProps.length > 0 && extraParamKeys.length === 0 ? '1px solid var(--color-border)' : 'none',
                paddingTop: schemaProps.length > 0 && extraParamKeys.length === 0 ? 12 : 0,
              }}>
                <input
                  placeholder="New Key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 13 }}
                />
                <input
                  placeholder="Value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddParam()}
                  style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 13 }}
                />
                <button
                  onClick={handleAddParam}
                  disabled={!newKey.trim()}
                  style={{
                    background: newKey.trim() ? 'var(--color-text-primary)' : 'var(--color-surface-active)',
                    color: 'var(--color-background)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: newKey.trim() ? 'pointer' : 'not-allowed',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Disabled toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
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
            background: 'rgba(248, 113, 113, 0.08)',
            color: 'var(--color-error)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
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
  transition: 'border-color 0.15s',
};

const errorInputStyle: React.CSSProperties = {
  borderColor: 'var(--color-error)',
  boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.3)',
};
