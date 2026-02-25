import { create } from 'zustand';
import { executeWorkflow } from '@/lib/api';

interface ExecutionState {
  isRunning: boolean;
  results: Record<string, unknown> | null;
  error: string | null;
  execute: (payload: Record<string, unknown>) => Promise<void>;
  clear: () => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  isRunning: false,
  results: null,
  error: null,

  execute: async (payload) => {
    set({ isRunning: true, error: null, results: null });
    try {
      const data = await executeWorkflow(payload);
      set({ results: data.results, isRunning: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Execution failed';
      set({ error: message, isRunning: false });
    }
  },

  clear: () => set({ results: null, error: null }),
}));
