import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NodeData } from '@/stores/workflowStore';
import {
  Zap, Globe, GitBranch, Printer, Clock, Settings, Merge,
} from 'lucide-react';

const categoryColors: Record<string, string> = {
  trigger: 'var(--color-node-trigger)',
  action: 'var(--color-node-action)',
  logic: 'var(--color-node-logic)',
  output: 'var(--color-node-output)',
};

const typeIcons: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  manual_trigger: Zap,
  http: Globe,
  if: GitBranch,
  condition: GitBranch,
  switch: GitBranch,
  print: Printer,
  delay: Clock,
  set: Settings,
  calculate: Settings,
  merge: Merge,
};

export function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeData;
  const color = categoryColors[nodeData.category] || 'var(--color-accent)';
  const Icon = typeIcons[nodeData.type] || Settings;
  const isLogicNode = nodeData.category === 'logic' && nodeData.type !== 'merge';

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: `2px solid ${selected ? color : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '0',
        minWidth: 180,
        boxShadow: selected ? `0 0 20px ${color}33` : '0 2px 8px #0004',
        opacity: nodeData.disabled ? 0.5 : 1,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Input handle */}
      {nodeData.type !== 'manual_trigger' && nodeData.type !== 'manualtrigger' && (
        <Handle
          type="target"
          position={Position.Left}
          id="input-0"
          style={{
            background: color,
            width: 10,
            height: 10,
            border: '2px solid var(--color-surface)',
          }}
        />
      )}

      {/* Node header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            background: `${color}22`,
            borderRadius: 'var(--radius-sm)',
            padding: 6,
            display: 'flex',
          }}
        >
          <Icon size={16} color={color} />
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              lineHeight: 1.2,
            }}
          >
            {nodeData.label}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              marginTop: 2,
            }}
          >
            {nodeData.type}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
        {nodeData.disabled ? '⏸ Disabled' : '● Ready'}
      </div>

      {/* Output handles */}
      {isLogicNode ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="output-0"
            style={{
              background: 'var(--color-success)',
              width: 10,
              height: 10,
              border: '2px solid var(--color-surface)',
              top: '35%',
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="output-1"
            style={{
              background: 'var(--color-error)',
              width: 10,
              height: 10,
              border: '2px solid var(--color-surface)',
              top: '65%',
            }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          id="output-0"
          style={{
            background: color,
            width: 10,
            height: 10,
            border: '2px solid var(--color-surface)',
          }}
        />
      )}
    </div>
  );
}
