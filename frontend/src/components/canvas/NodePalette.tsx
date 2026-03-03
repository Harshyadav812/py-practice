import { useState, type DragEvent } from 'react';
import { getNodeTemplates, type Category } from '@/config/nodeDefinitions';
import { Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NodeTemplate {
  type: string;
  label: string;
  category: Category;
  icon: LucideIcon;
  description: string;
}

const categoryColors: Record<string, string> = {
  trigger: '#ff6d5a',
  action: '#3b82f6',
  logic: '#a855f7',
  output: '#10b981',
  ai: '#a78bfa',
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
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? templates.filter(t =>
      t.label.toLowerCase().includes(search.toLowerCase()) ||
      t.type.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    )
    : templates;

  return (
    <div className="w-full h-full bg-surface flex flex-col z-40">
      {/* Header with search */}
      <div className="px-3 pt-3 pb-2 shrink-0 space-y-2">
        <h2 className="text-[13px] font-semibold text-zinc-200 px-1">Nodes</h2>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search nodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 bg-[#18181b] border border-[#2e2e33] rounded-md text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-node-trigger/40 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
        {categories.map((cat) => {
          const nodes = filtered.filter((n) => n.category === cat);
          if (nodes.length === 0) return null;

          return (
            <div key={cat}>
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 px-2 py-1.5">
                {categoryLabels[cat]}
              </h3>

              <div className="space-y-0.5">
                {nodes.map((tpl) => (
                  <div
                    key={tpl.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, tpl)}
                    title={tpl.description}
                    className="group flex gap-2.5 w-full py-2 px-2 rounded-md border border-transparent hover:border-[#2e2e33] hover:bg-white/3 cursor-grab active:cursor-grabbing transition-colors"
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${categoryColors[cat]}12`, color: categoryColors[cat] }}
                    >
                      <tpl.icon size={14} strokeWidth={2} />
                    </div>

                    <div className="flex flex-col items-start justify-center text-left min-w-0">
                      <span className="text-[12px] font-medium text-zinc-300 truncate w-full leading-tight">
                        {tpl.label}
                      </span>
                      {tpl.description && (
                        <span className="text-[10px] text-zinc-600 line-clamp-1 mt-0.5 w-full">
                          {tpl.description}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && search && (
          <div className="text-center py-6 text-zinc-600 text-[12px]">
            No nodes match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}
