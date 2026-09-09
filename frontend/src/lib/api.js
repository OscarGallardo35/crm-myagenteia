// src/lib/api.js
const API_BASE_URL = '/api/chat';
const AUTH_BASE_URL = '/api';
const SECURITY_BASE_URL = '/api/security';

// Auth helpers
const getToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('auth_token') || null;
  }
  return null;
};

const setToken = (token) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }
};

const removeToken = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
  }
};

// Login function
export const login = async (email, password) => {
  const response = await fetch(`${AUTH_BASE_URL}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Login failed');
  }
  
  const data = await response.json();
  setToken(data.token);
  return data;
};

// Logout function
export const logout = async () => {
  const token = getToken();
  await fetch(`${AUTH_BASE_URL}/auth/logout/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ token }),
  });
  removeToken();
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return getToken() !== null;
};

// Get current user
export const getCurrentUser = async () => {
  const token = getToken();
  if (!token) return null;
  
  const response = await fetch(`${AUTH_BASE_URL}/auth/me/`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    removeToken();
    return null;
  }
  
  return response.json();
};

export const api = {
  // Auth endpoints
  login,
  logout,
  isAuthenticated,
  getCurrentUser,
  
  // Chat endpoints
  sendMessage: async (chatId, message) => {
    return fetchWithAuth(`${API_BASE_URL}/chats/${chatId}/messages/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  },
  getChats: async () => {
    return fetchWithAuth(`${API_BASE_URL}/chats/`);
  },
  getChatMessages: async (chatId) => {
    return fetchWithAuth(`${API_BASE_URL}/chats/${chatId}/messages/`);
  },
  // Dashboard endpoints
  getDashboardStats: async () => {
    return fetchWithAuth(`${API_BASE_URL}/dashboard/stats/`);
  },
  getStats: async () => {
    return fetchWithAuth(`${API_BASE_URL}/dashboard/stats/`);
  },
  // Leads endpoints
  getLeads: async () => {
    return fetchWithAuth(`${API_BASE_URL}/leads/`);
  },
  // Posting endpoints
  getPosts: async () => {
    return fetchWithAuth(`${API_BASE_URL}/posts/`);
  },
  getScheduledPosts: async () => {
    return fetchWithAuth(`${API_BASE_URL}/scheduled/`);
  },
  // Agents endpoints
  getAgents: async () => {
    return fetchWithAuth(`${API_BASE_URL}/agents/`);
  },
  getAgentsStatus: async () => {
    return fetchWithAuth(`${API_BASE_URL}/agents/status/`);
  },

  // Agent panel (Nivel 1-3): sub-agentes vivos, tareas, sesiones persistentes
  // Base /api/agent-ops/ (no /api/agents/, que nginx redirige al mock de chat)
  getLiveAgents: async () => fetchWithAuth('/api/agent-ops/status/'),
  getLiveAgentDetail: async (id) => fetchWithAuth(`/api/agent-ops/live/${id}/`),
  getAgentTasks: async () => fetchWithAuth('/api/agent-ops/tasks/'),
  launchAgentTask: async (payload) => fetchWithAuth('/api/agent-ops/launch/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  getAgentTaskDetail: async (id) => fetchWithAuth(`/api/agent-ops/tasks/${id}/`),
  getAgentSessions: async () => fetchWithAuth('/api/agent-ops/sessions/'),
  spawnAgentSession: async (payload) => fetchWithAuth('/api/agent-ops/sessions/spawn/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
  // Hermes sessions bridge
  getHermesSessions: async (limit = 20) => {
    return fetchWithAuth(`${API_BASE_URL}/hermes/sessions/?limit=${limit}`);
  },
  getHermesSessionMessages: async (sessionId) => {
    return fetchWithAuth(`${API_BASE_URL}/hermes/sessions/${sessionId}/`);
  },
  getHermesModels: async () => {
    return fetchWithAuth(`${API_BASE_URL}/hermes/models/`);
  },

  // CRM conversations (nuevo chat, retomar, renombrar)
  getCrmConversations: async () => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/`);
  },
  createCrmConversation: async (title) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || undefined }),
    });
  },
  getCrmConversation: async (id) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/`);
  },
  renameCrmConversation: async (id, title) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  },
  pinCrmConversation: async (id, pinned) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
  },
  setCrmConversationModel: async (id, model) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/model/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
  },
  uploadCrmAttachments: async (id, formData) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/upload/`, {
      method: 'POST',
      body: formData,
    });
  },
  deleteCrmConversation: async (id) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/`, {
      method: 'DELETE',
    });
  },
  addCrmMessage: async (id, role, content, model) => {
    return fetchWithAuth(`${API_BASE_URL}/conversations/${id}/message/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, model: model || undefined }),
    });
  },

  // Seguridad (vive en /api/security, no bajo /api/chat)
  getSecuritySummary: async () => fetchWithAuth(`${SECURITY_BASE_URL}/summary/`),
  getSecurityAttempts: async (limit = 100) => fetchWithAuth(`${SECURITY_BASE_URL}/attempts/?limit=${limit}`),
  getSecurityBlocks: async () => fetchWithAuth(`${SECURITY_BASE_URL}/blocks/`),
  getSecuritySsh: async (limit = 100) => fetchWithAuth(`${SECURITY_BASE_URL}/ssh/?limit=${limit}`),
  securityGeoRefresh: async () => fetchWithAuth(`${SECURITY_BASE_URL}/geo/refresh/?max=12`),
  securityBlockIp: async (ip) => fetchWithAuth(`${SECURITY_BASE_URL}/block/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }),
  }),
  securityUnblockIp: async (ip) => fetchWithAuth(`${SECURITY_BASE_URL}/unblock/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }),
  }),
};

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
  };
  // fetch() agrega el boundary correcto solo si NO forzamos el Content-Type:
  // con FormData (upload multipart) no debe ir application/json, o el backend
  // responde 415 Unsupported Media Type.
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('No autenticado');
  }

  return response.json();
}
