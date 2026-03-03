import { create } from "zustand";
import { toast } from "sonner";

export interface NodeResult {
  status: "success" | "error" | "skipped";
  result?: unknown;
  input?: unknown;
  error?: string;
}

interface ExecutionState {
  isRunning: boolean;
  executionId: string | null;
  overallStatus: "success" | "failed" | null;
  runningNode: string | null;
  nodeStatuses: Record<string, "success" | "error" | "skipped">;
  nodeResults: Record<string, NodeResult>;
  results: Record<string, unknown> | null;
  error: string | null;
  execute: (
    payload: Record<string, unknown>,
    workflowId?: string,
  ) => Promise<void>;
  resume: (executionId: string) => Promise<void>;
  clear: () => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

// Generation counter: incremented on clear()/new execute()/new resume().
// The reader loop captures its generation at start. If the counter advances
// (meaning a different workflow was opened or a new execution started),
// the loop silently discards all further SSE events instead of updating state.
// This lets the HTTP stream finish normally so the backend completes execution
// and commits the final status, while preventing stale data leaking into the UI.
let streamGeneration = 0;

export const useExecutionStore = create<ExecutionState>((set) => ({
  isRunning: false,
  executionId: null,
  overallStatus: null,
  runningNode: null,
  nodeStatuses: {},
  nodeResults: {},
  results: null,
  error: null,

  execute: async (payload, workflowId) => {
    // Advance generation to detach any previous in-flight stream
    const myGeneration = ++streamGeneration;

    set({
      isRunning: true,
      executionId: null,
      overallStatus: null,
      runningNode: null,
      nodeStatuses: {},
      nodeResults: {},
      error: null,
      results: null,
    });
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Use the saved-workflow route when we have an ID (enables execution logging)
      const url = workflowId
        ? `${API_BASE}/workflows/${workflowId}/run/stream`
        : `${API_BASE}/workflows/execute/stream`;

      const res = await fetch(url, {
        method: "POST",
        headers,
        // The ID-based route doesn't need a body
        ...(workflowId ? {} : { body: JSON.stringify(payload) }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Execution streaming failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // If generation advanced (user navigated away), discard but keep reading
        // so the HTTP stream finishes and the backend completes execution.
        if (myGeneration !== streamGeneration) continue;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.type === "execution_start") {
              set({ executionId: data.execution_id });
            } else if (data.type === "node_start") {
              set({ runningNode: data.node });
            } else if (data.type === "node_end") {
              set((state) => ({
                nodeStatuses: {
                  ...state.nodeStatuses,
                  [data.node]: data.status,
                },
                nodeResults: {
                  ...state.nodeResults,
                  [data.node]: {
                    status: data.status,
                    result: data.result,
                    input: data.input,
                    error: data.error,
                  },
                },
              }));
              if (data.status === "error" && data.error) {
                toast.error(`${data.node}: ${data.error}`);
              }
            } else if (data.type === "workflow_end") {
              set({
                results: data.results,
                overallStatus: data.status === "failed" ? "failed" : "success",
              });
            } else if (data.type === "error") {
              set({ error: data.message, overallStatus: "failed" });
              toast.error(data.message);
            }
          } catch (e) {
            console.error("Failed to parse SSE chunk", e, line);
          }
        }
      }

      // Only update final state if this stream is still the active one
      if (myGeneration === streamGeneration) {
        set({ isRunning: false, runningNode: null });
        if (useExecutionStore.getState().overallStatus === null) {
          set({ overallStatus: "failed" });
        }
      }
    } catch (err) {
      // Silently ignore abort errors (triggered by clear/navigation)
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (myGeneration !== streamGeneration) return;
      const message = err instanceof Error ? err.message : "Execution failed";
      set({
        error: message,
        isRunning: false,
        runningNode: null,
        overallStatus: "failed",
      });
      toast.error(message);
    }
  },

  resume: async (executionId) => {
    // Advance generation to detach any previous in-flight stream
    const myGeneration = ++streamGeneration;

    set((state) => {
      const newNodeStatuses = { ...state.nodeStatuses };
      const newNodeResults = { ...state.nodeResults };
      const newResults = { ...(state.results || {}) };

      // Remove error states from nodes so they reset to 'Ready'
      Object.keys(newNodeStatuses).forEach((node) => {
        if (newNodeStatuses[node] === "error") {
          delete newNodeStatuses[node];
          delete newNodeResults[node];
          delete newResults[node];
        }
      });

      return {
        isRunning: true,
        executionId: null,
        overallStatus: null,
        runningNode: null,
        error: null,
        nodeStatuses: newNodeStatuses,
        nodeResults: newNodeResults,
        results: Object.keys(newResults).length > 0 ? newResults : null,
      };
    });
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const url = `${API_BASE}/executions/${executionId}/resume`;
      const res = await fetch(url, { method: "POST", headers });

      if (!res.ok || !res.body) {
        throw new Error("Resume streaming failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // If generation advanced (user navigated away), discard but keep reading
        if (myGeneration !== streamGeneration) continue;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            if (data.type === "execution_start") {
              set({ executionId: data.execution_id });
            } else if (data.type === "node_start") {
              set({ runningNode: data.node });
            } else if (data.type === "node_end") {
              set((state) => ({
                nodeStatuses: {
                  ...state.nodeStatuses,
                  [data.node]: data.status,
                },
                nodeResults: {
                  ...state.nodeResults,
                  [data.node]: {
                    status: data.status,
                    result: data.result,
                    input: data.input,
                    error: data.error,
                  },
                },
              }));
              if (data.status === "error" && data.error) {
                toast.error(`${data.node}: ${data.error}`);
              }
            } else if (data.type === "workflow_end") {
              set({
                results: data.results,
                overallStatus: data.status === "failed" ? "failed" : "success",
              });
            } else if (data.type === "error") {
              set({ error: data.message, overallStatus: "failed" });
              toast.error(data.message);
            }
          } catch (e) {
            console.error("Failed to parse SSE chunk", e, line);
          }
        }
      }

      if (myGeneration === streamGeneration) {
        set({ isRunning: false, runningNode: null });
        if (useExecutionStore.getState().overallStatus === null) {
          set({ overallStatus: "failed" });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (myGeneration !== streamGeneration) return;
      const message = err instanceof Error ? err.message : "Resume failed";
      set({
        error: message,
        isRunning: false,
        runningNode: null,
        overallStatus: "failed",
      });
      toast.error(message);
    }
  },

  clear: () => {
    // Advance generation so any in-flight reader loop stops updating state.
    // The HTTP stream keeps running so the backend finishes execution normally.
    streamGeneration++;
    set({
      isRunning: false,
      results: null,
      error: null,
      runningNode: null,
      nodeStatuses: {},
      nodeResults: {},
      executionId: null,
      overallStatus: null,
    });
  },
}));
