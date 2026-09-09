import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Dashboard from './components/Dashboard';
import LeadsBoard from './components/LeadsBoard';
import PostingCalendar from './components/PostingCalendar';
import AgentsPanel from './components/AgentsPanel';
import Login from './components/Login';

const VIEWS = {
  chat: { label: 'Chats', icon: '💬', Component: ChatView },
  dashboard: { label: 'Dashboard', icon: '📊', Component: Dashboard },
  leads: { label: 'Leads', icon: '🎯', Component: LeadsBoard },
  calendar: { label: 'Calendario', icon: '📅', Component: PostingCalendar },
  agents: { label: 'Agentes', icon: '🤖', Component: AgentsPanel },
};

function AppShell() {
  const [activeView, setActiveView] = useState('chat');
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const viewInfo = VIEWS[activeView] || VIEWS.chat;
  const ViewComponent = viewInfo.Component;

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} userId={user?.id} />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
          <h2 className="text-lg font-semibold text-white">{viewInfo.label}</h2>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <ViewComponent />
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
