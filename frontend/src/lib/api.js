// src/lib/api.js
const API_BASE_URL = '/api/chat';

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
  const response = await fetch(`${API_BASE_URL}/auth/login/`, {
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
  await fetch(`${API_BASE_URL}/auth/logout/`, {
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
  
  const response = await fetch(`${API_BASE_URL}/auth/me/`, {
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
};

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

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
