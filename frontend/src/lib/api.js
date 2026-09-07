// src/lib/api.js
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const api = {
  // Chat endpoints
  sendMessage: async (chatId, message) => {
    const response = await fetch(`${API_BASE_URL}/chats/${chatId}/messages/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return response.json();
  },
  getChats: async () => {
    const response = await fetch(`${API_BASE_URL}/chats/`);
    return response.json();
  },
  getChatMessages: async (chatId) => {
    const response = await fetch(`${API_BASE_URL}/chats/${chatId}/messages/`);
    return response.json();
  },
  // Model endpoints
  getModels: async () => {
    const response = await fetch(`${API_BASE_URL}/models/`);
    return response.json();
  },
  // Dashboard endpoints
  getDashboardStats: async () => {
    const response = await fetch(`${API_BASE_URL}/dashboard/`);
    return response.json();
  },
  // Leads endpoints
  getLeads: async () => {
    const response = await fetch(`${API_BASE_URL}/leads/`);
    return response.json();
  },
  updateLeadStatus: async (leadId, status) => {
    const response = await fetch(`${API_BASE_URL}/leads/${leadId}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return response.json();
  },
  // Posting calendar endpoints
  getScheduledPosts: async () => {
    const response = await fetch(`${API_BASE_URL}/posts/scheduled/`);
    return response.json();
  },
  createPost: async (postData) => {
    const response = await fetch(`${API_BASE_URL}/posts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData),
    });
    return response.json();
  },
  // Agents endpoints
  getAgentsStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/agents/status/`);
    return response.json();
  },
};