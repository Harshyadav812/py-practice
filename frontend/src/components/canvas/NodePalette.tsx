import type { DragEvent } from 'react';
import {
  Zap, Globe, GitBranch, Printer, Clock, Settings, Merge, Calculator,
} from 'lucide-react';

interface NodeTemplate {
  type: string;
  label: string;
  category: 'trigger' | 'action' | 'logic' | 'output';
  icon: React.ComponentType<{ size?: number; color?: string }>;
}

const NODE_TEMPLATES: NodeTemplate[] = [
  { type: 'manual_trigger', label: 'Manual Trigger', category: 'trigger', icon: Zap },
  { type: 'http', label: 'HTTP Request', category: 'action', icon: Globe },
  { type: 'set', label: 'Set Data', category: 'output', icon: Settings },
  { type: 'if', label: 'IF', category: 'logic', icon: GitBranch },
  { type: 'switch', label: 'Switch', category: 'logic', icon: GitBranch },
  { type: 'merge', label: 'Merge', category: 'logic', icon: Merge },
  { type: 'calculate', label: 'Calculate', category: 'action', icon: Calculator },
  { type: 'delay', label: 'Delay', category: 'action', icon: Clock },
  { type: 'print', label: 'Print', category: 'output', icon: Printer },
];

const categoryColors: Record<string, string> = {
  trigger: 'var(--color-node-trigger)',
  action: 'var(--color-node-action)',
  logic: 'var(--color-node-logic)',
  output: 'var(--color-node-output)',
};

const categoryLabels: Record<string, string> = {
  trigger: 'Triggers',
  action: 'Actions',
  logic: 'Logic',
  output: 'Output',
};

function onDragStart(e: DragEvent, template: NodeTemplate) {
  e.dataTransfer.setData('application/reactflow', JSON.stringify(template));
  e.dataTransfer.effectAllowed = 'move';
}

export function NodePalette() {
  const categories = ['trigger', 'action', 'logic', 'output'] as const;

  return (
    <div
      style={{
        width: 220,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        padding: '16px 12px',
        overflowY: 'auto',
        height: '100%',
      }}
    >
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-muted)',
          margin: '0 0 16px 4px',
        }}
      >
        Node Palette
      </h3>

      {categories.map((cat) => {
        const nodes = NODE_TEMPLATES.filter((n) => n.category === cat);
        if (nodes.length === 0) return null;

        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: categoryColors[cat],
                marginBottom: 6,
                paddingLeft: 4,
              }}
            >
              {categoryLabels[cat]}
            </div>
            {nodes.map((tpl) => (
              <div
                key={tpl.type}
                draggable
                onDragStart={(e) => onDragStart(e, tpl)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'grab',
                  marginBottom: 2,
                  transition: 'background 0.15s',
                  fontSize: 13,
                  color: 'var(--color-text-primary)',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'var(--color-surface-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <div
                  style={{
                    background: `${categoryColors[cat]}22`,
                    borderRadius: 4,
                    padding: 4,
                    display: 'flex',
                  }}
                >
                  <tpl.icon size={14} color={categoryColors[cat]} />
                </div>
                {tpl.label}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
