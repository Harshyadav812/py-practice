import type { DragEvent } from 'react';
import { getNodeTemplates, type Category } from '@/config/nodeDefinitions';
import type { LucideIcon } from 'lucide-react';

interface NodeTemplate {
  type: string;
  label: string;
  category: Category;
  icon: LucideIcon;
  description: string;
}

const categoryColors: Record<string, string> = {
  trigger: 'var(--color-node-trigger)',
  action: 'var(--color-node-action)',
  logic: 'var(--color-node-logic)',
  output: 'var(--color-node-output)',
  ai: 'var(--color-node-ai, #a78bfa)',
};

const categoryLabels: Record<string, string> = {
  trigger: 'Triggers',
  action: 'Actions',
  logic: 'Logic',
  output: 'Output',
  ai: 'AI / LLM',
};

function onDragStart(e: DragEvent, template: NodeTemplate) {
  e.dataTransfer.setData('application/reactflow', JSON.stringify({
    type: template.type,
    label: template.label,
    category: template.category,
  }));
  e.dataTransfer.effectAllowed = 'move';
}

export function NodePalette() {
  const templates = getNodeTemplates() as NodeTemplate[];
  const categories = ['trigger', 'action', 'logic', 'output', 'ai'] as const;

  return (
    <div
      style={{
        width: 240,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        padding: '24px 16px',
        overflowY: 'auto',
        height: '100%',
        boxShadow: '4px 0 24px rgba(0,0,0,0.2)',
        zIndex: 10,
      }}
    >
      <h3
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-text-primary)',
          margin: '0 0 20px 4px',
        }}
      >
        Nodes
      </h3>

      {categories.map((cat) => {
        const nodes = templates.filter((n) => n.category === cat);
        if (nodes.length === 0) return null;

        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-text-muted)',
                marginBottom: 8,
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
                title={tpl.description}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'grab',
                  marginBottom: 4,
                  transition: 'all 0.15s ease',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.0)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-surface-hover)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.0)';
                }}
              >
                <div
                  style={{
                    background: `${categoryColors[cat]}15`,
                    borderRadius: 'var(--radius-sm)',
                    padding: 6,
                    display: 'flex',
                    color: categoryColors[cat],
                  }}
                >
                  <tpl.icon size={16} style={{ strokeWidth: 1.5 }} />
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
