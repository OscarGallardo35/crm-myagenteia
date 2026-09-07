import React from 'react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import Dashboard from './components/Dashboard';
import LeadsBoard from './components/LeadsBoard';
import PostingCalendar from './components/PostingCalendar';
import AgentsPanel from './components/AgentsPanel';

function App() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 dark-mode">
      <Sidebar className="w-64 border-r border-gray-800" />
      <div className="flex-1 flex flex-col">
        <ChatView className="flex-1 border-r border-gray-800" />
        <div className="flex h-96 border-t border-gray-800">
          <Dashboard className="flex-1 border-r border-gray-800 p-4" />
          <LeadsBoard className="flex-1 border-r border-gray-800 p-4" />
          <PostingCalendar className="flex-1 border-r border-gray-800 p-4" />
          <AgentsPanel className="flex-1 p-4" />
        </div>
      </div>
    </div>
  );
}

export default App;