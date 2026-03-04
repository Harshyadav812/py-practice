import { useState, useMemo, useEffect } from 'react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { X, Trash2, Plus, Code, List, Settings2, SlidersHorizontal } from 'lucide-react';
import { NODE_DEFINITIONS, validateNodeParams, type ValidationError } from '@/config/nodeDefinitions';
import { getCredentials } from '@/lib/api';
import clsx from 'clsx';

type PanelTab = 'params' | 'settings';

export function PropertiesPanel() {
  const { nodes, settingsNodeId, setSettingsNodeId, updateNodeData, removeNode, renameNode } =
    useWorkflowStore();

  const [activeTab, setActiveTab] = useState<PanelTab>('params');
  const [isRawMode, setIsRawMode] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  // state to capture the name when the input is focused:
  const [originalName, setOriginalName] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ id: string; name: string; type: string }[]>([]);

  // Fetch user's credentials for the credential dropdown
  useEffect(() => {
    getCredentials().then(setCredentials).catch(() => setCredentials([]));
  }, []);

  const settingsNode = useMemo(() => nodes.find((n) => n.id === settingsNodeId), [nodes, settingsNodeId]);

  const data = settingsNode?.data;
  const params = useMemo(
    () => (data?.parameters || {}) as Record<string, unknown>,
    [data?.parameters]
  );
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

  if (!settingsNode || !data) return null;

  const def = NODE_DEFINITIONS[data.type];
  const schemaProps = def?.properties || [];
  const mappedKeys = new Set(schemaProps.map(p => p.name));
  const extraParamKeys = Object.keys(params).filter(k => !mappedKeys.has(k));

  const handleParamChange = (key: string, value: unknown) => {
    updateNodeData(settingsNode.id, {
      ...data,
      parameters: { ...params, [key]: value },
    });
  };

  const handleParamBlur = (key: string, value: string) => {
    if (value.trim() === '') return;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') {
        updateNodeData(settingsNode.id, {
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
    updateNodeData(settingsNode.id, {
      ...data,
      parameters: { ...params, [newKey.trim()]: finalValue },
    });
    setNewKey('');
    setNewValue('');
  };

  const handleRemoveParam = (k: string) => {
    const nextParams = { ...params };
    delete nextParams[k];
    updateNodeData(settingsNode.id, { ...data, parameters: nextParams });
  };

  return (
    <>
      {/* Click-away backdrop (canvas area only, not full-screen) */}
      <div
        className="absolute inset-0 z-90"
        onClick={() => setSettingsNodeId(null)}
      />

      {/* Slide-in Panel from right */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 z-100 animate-in slide-in-from-right duration-200 w-full max-w-105 h-full bg-surface border-l border-[#2e2e33] flex flex-col shadow-[-8px_0_30px_rgba(0,0,0,0.4)]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#2e2e33]">
          <div className="flex-1 min-w-0">
            <input
              value={data.label}
              onFocus={() => setOriginalName(data.label)}
              onChange={(e) => updateNodeData(settingsNode.id, { label: e.target.value })}
              onBlur={(e) => {
                if (originalName && originalName !== e.target.value) {
                  // Revert the label to the old name first, then let renameNode do it properly
                  updateNodeData(settingsNode.id, { label: originalName });
                  renameNode(settingsNode.id, e.target.value);
                }
                setOriginalName(null);
              }}
              className="n8n-input"
            />
            {def && (
              <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {def.description}
              </div>
            )}
          </div>
          <button
            onClick={() => setSettingsNodeId(null)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-surface-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2e2e33] px-4">
          <button
            onClick={() => setActiveTab('params')}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px",
              activeTab === 'params'
                ? "border-node-trigger text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            <SlidersHorizontal size={13} />
            Parameters
            {validationErrors.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[10px] font-bold rounded-full">
                {validationErrors.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px",
              activeTab === 'settings'
                ? "border-node-trigger text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Settings2 size={13} />
            Settings
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'params' && (
            <div className="p-4">
              {/* Mode toggle */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {isRawMode ? 'JSON Editor' : 'Properties'}
                </span>
                <button
                  onClick={() => setIsRawMode(!isRawMode)}
                  className="flex items-center gap-1 text-[11px] text-node-trigger hover:text-accent-hover transition-colors bg-transparent border-none cursor-pointer p-0"
                >
                  {isRawMode ? <List size={12} /> : <Code size={12} />}
                  {isRawMode ? 'UI Editor' : 'JSON'}
                </button>
              </div>

              {isRawMode ? (
                <textarea
                  value={JSON.stringify(params, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      updateNodeData(settingsNode.id, { parameters: parsed });
                    } catch {
                      // Allow partial editing
                    }
                  }}
                  rows={12}
                  className="n8n-input font-mono text-[12px] leading-relaxed resize-y"
                />
              ) : (
                <div className="space-y-4">
                  {/* Schema-defined Properties */}
                  {schemaProps.map((prop) => {
                    const value = params[prop.name] ?? prop.default;
                    const error = errorsByField.get(prop.name);
                    const hasError = !!error;

                    return (
                      <div key={prop.name}>
                        <label className="n8n-label">
                          {prop.displayName}
                          {prop.required && (
                            <span className="text-red-400 ml-0.5">*</span>
                          )}
                        </label>

                        {/* Options (select) */}
                        {prop.type === 'options' && (
                          <select
                            value={String(value)}
                            onChange={(e) => handleParamChange(prop.name, e.target.value)}
                            className={clsx("n8n-input", hasError && "n8n-input-error")}
                          >
                            {prop.options?.map((opt) => (
                              <option key={String(opt.value)} value={String(opt.value)}>
                                {opt.name}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Credential (dropdown) */}
                        {prop.type === 'credential' && (
                          <select
                            value={String(value || '')}
                            onChange={(e) => handleParamChange(prop.name, e.target.value)}
                            className={clsx("n8n-input", hasError && "n8n-input-error")}
                          >
                            <option value="">None</option>
                            {credentials.map((cred) => (
                              <option key={cred.id} value={cred.id}>
                                {cred.name} ({cred.type})
                              </option>
                            ))}
                          </select>
                        )}

                        {/* Boolean (toggle-style) */}
                        {prop.type === 'boolean' && (
                          <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={!!value}
                                onChange={(e) => handleParamChange(prop.name, e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4.5 bg-[#2e2e33] rounded-full peer-checked:bg-node-trigger transition-colors" />
                              <div className="absolute left-0.75 top-0.75 w-3 h-3 bg-zinc-400 rounded-full peer-checked:translate-x-3.5 peer-checked:bg-white transition-all" />
                            </div>
                            <span className="text-[11px] text-zinc-400">
                              {value ? 'Enabled' : 'Disabled'}
                            </span>
                          </label>
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
                            className={clsx("n8n-input", hasError && "n8n-input-error")}
                          />
                        )}

                        {/* String */}
                        {prop.type === 'string' && (
                          <input
                            type="text"
                            value={value as string}
                            onChange={(e) => handleParamChange(prop.name, e.target.value)}
                            placeholder={prop.placeholder}
                            className={clsx("n8n-input", hasError && "n8n-input-error")}
                          />
                        )}

                        {/* Code */}
                        {prop.type === 'code' && (
                          <textarea
                            value={(value as string) || ''}
                            onChange={(e) => handleParamChange(prop.name, e.target.value)}
                            placeholder={prop.placeholder}
                            rows={4}
                            className={clsx("n8n-input font-mono text-[12px] leading-relaxed resize-y", hasError && "n8n-input-error")}
                          />
                        )}

                        {/* JSON / JSON-Array */}
                        {(prop.type === 'json' || prop.type === 'json-array') && (
                          <textarea
                            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '')}
                            onChange={(e) => handleParamChange(prop.name, e.target.value)}
                            onBlur={(e) => handleParamBlur(prop.name, e.target.value)}
                            placeholder={prop.placeholder}
                            className={clsx("n8n-input font-mono text-[12px] leading-relaxed resize-y min-h-15", hasError && "n8n-input-error")}
                          />
                        )}

                        {/* Validation error */}
                        {hasError && (
                          <p className="text-[11px] text-red-400 mt-1 font-medium">
                            ⚠ {error.message}
                          </p>
                        )}

                        {/* Description */}
                        {prop.description && !hasError && (
                          <p className="text-[10px] text-zinc-600 mt-1">
                            {prop.description}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Extra / Custom Parameters */}
                  {extraParamKeys.length > 0 && (
                    <div className={clsx(schemaProps.length > 0 && "border-t border-[#2e2e33] pt-3")}>
                      <label className="n8n-label mb-2">Additional Parameters</label>
                      {extraParamKeys.map((k) => {
                        const v = params[k];
                        return (
                          <div key={k} className="flex gap-2 mb-2 items-center">
                            <div className="flex-1 text-[12px] text-zinc-400 truncate" title={k}>{k}</div>
                            <input
                              value={typeof v === 'string' ? v : JSON.stringify(v)}
                              onChange={(e) => handleParamChange(k, e.target.value)}
                              onBlur={(e) => handleParamBlur(k, e.target.value)}
                              className="n8n-input flex-2 py-1.5! px-2! text-[12px]!"
                            />
                            <button
                              onClick={() => handleRemoveParam(k)}
                              className="p-1 text-zinc-600 hover:text-red-400 transition-colors bg-transparent border-none cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add New Parameter */}
                  <div className={clsx(
                    "flex gap-2 pt-3",
                    schemaProps.length > 0 && extraParamKeys.length === 0 && "border-t border-[#2e2e33]"
                  )}>
                    <input
                      placeholder="Key"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="n8n-input flex-1 py-1.5! px-2! text-[12px]!"
                    />
                    <input
                      placeholder="Value"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddParam()}
                      className="n8n-input flex-1 py-1.5! px-2! text-[12px]!"
                    />
                    <button
                      onClick={handleAddParam}
                      disabled={!newKey.trim()}
                      className={clsx(
                        "p-1.5 rounded-md flex items-center justify-center border-none transition-colors",
                        newKey.trim()
                          ? "bg-node-trigger text-white cursor-pointer hover:bg-accent-hover"
                          : "bg-[#2e2e33] text-zinc-600 cursor-not-allowed"
                      )}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-4 space-y-4">
              {/* Node Name */}
              <div>
                <label className="n8n-label">Node Name</label>
                <input
                  value={data.label}
                  onChange={(e) => updateNodeData(settingsNode.id, { label: e.target.value })}
                  onBlur={(e) => renameNode(settingsNode.id, e.target.value)}
                  className="n8n-input"
                />
              </div>

              {/* Node Type (read-only) */}
              <div>
                <label className="n8n-label">Type</label>
                <div className="n8n-input bg-surface-hover! text-zinc-500! cursor-default!">
                  {data.type.replace(/_/g, ' ')}
                </div>
              </div>

              {/* Disabled toggle */}
              <div>
                <label className="n8n-label">Node Status</label>
                <label className="flex items-center gap-2.5 cursor-pointer mt-1.5">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={data.disabled || false}
                      onChange={(e) => updateNodeData(settingsNode.id, { disabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4.5 bg-[#2e2e33] rounded-full peer-checked:bg-red-500/80 transition-colors" />
                    <div className="absolute left-0.75 top-0.75 w-3 h-3 bg-zinc-400 rounded-full peer-checked:translate-x-3.5 peer-checked:bg-white transition-all" />
                  </div>
                  <span className="text-[12px] text-zinc-400">
                    {data.disabled ? 'Disabled — node will be skipped' : 'Enabled'}
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#2e2e33]">
          <button
            onClick={() => {
              removeNode(settingsNode.id);
              setSettingsNodeId(null);
            }}
            className="w-full py-2 px-3 bg-red-500/8 text-red-400 border border-red-500/15 rounded-lg cursor-pointer text-[12px] font-medium flex items-center justify-center gap-1.5 hover:bg-red-500/15 transition-colors"
          >
            <Trash2 size={13} />
            Delete Node
          </button>
        </div>
      </div>
    </>
  );
}
