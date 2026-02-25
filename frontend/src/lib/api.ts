const API_BASE = 'http://localhost:8000';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Auth
export async function login(email: string, password: string) {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(error.detail);
  }
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function register(email: string, password: string) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return request<{ id: string; email: string }>('/auth/me');
}

// Workflows
export interface WorkflowData {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  data: Record<string, unknown>;
  owner_id: string;
  created_at: string;
  updated_at: string | null;
}

export async function getWorkflows() {
  return request<WorkflowData[]>('/workflows/');
}

export async function getWorkflow(id: string) {
  return request<WorkflowData>(`/workflows/${id}`);
}

export async function createWorkflow(payload: {
  name: string;
  description?: string;
  data: Record<string, unknown>;
}) {
  return request<WorkflowData>('/workflows/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateWorkflow(
  id: string,
  payload: Partial<{ name: string; description: string; is_active: boolean; data: Record<string, unknown> }>
) {
  return request<WorkflowData>(`/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteWorkflow(id: string) {
  return request(`/workflows/${id}`, { method: 'DELETE' });
}

// Execute
export async function executeWorkflow(payload: Record<string, unknown>) {
  return request<{ status: string; results: Record<string, unknown> }>(
    '/workflows/execute',
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

export async function runWorkflowById(id: string) {
  return request<{ status: string; results: Record<string, unknown> }>(
    `/workflows/${id}/run`,
    { method: 'POST' }
  );
}

// Credentials
export async function getCredentials() {
  return request<{ id: string; name: string; type: string }[]>('/credentials/');
}
