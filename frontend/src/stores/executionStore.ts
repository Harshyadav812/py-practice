import { create } from 'zustand';
import { toast } from 'sonner';

interface ExecutionState {
  isRunning: boolean;
  runningNode: string | null;
  nodeStatuses: Record<string, 'success' | 'error' | 'skipped'>;
  results: Record<string, unknown> | null;
  error: string | null;
  execute: (payload: Record<string, unknown>) => Promise<void>;
  clear: () => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  isRunning: false,
  runningNode: null,
  nodeStatuses: {},
  results: null,
  error: null,

  execute: async (payload) => {
    set({ isRunning: true, runningNode: null, nodeStatuses: {}, error: null, results: null });
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`http://localhost:8000/workflows/execute/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok || !res.body) {
        throw new Error('Execution streaming failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.type === 'node_start') {
              set({ runningNode: data.node });
            } else if (data.type === 'node_end') {
              set(state => ({
                nodeStatuses: { ...state.nodeStatuses, [data.node]: data.status }
              }));
              if (data.status === 'error' && data.error) {
                toast.error(`${data.node}: ${data.error}`);
              }
            } else if (data.type === 'workflow_end') {
              set({ results: data.results });
            } else if (data.type === 'error') {
              set({ error: data.message });
              toast.error(data.message);
            }
          } catch (e) {
            console.error('Failed to parse SSE chunk', e, line);
          }
        }
      }

      set({ isRunning: false, runningNode: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Execution failed';
      set({ error: message, isRunning: false, runningNode: null });
      toast.error(message);
    }
  },

  clear: () => set({ results: null, error: null, runningNode: null, nodeStatuses: {} }),
}));
