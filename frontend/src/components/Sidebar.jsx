import React from 'react';

const Sidebar = () => {
  return (
    <div className="flex flex-col h-full p-4 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
          <span className="text-white text-bold">M</span>
        </div>
        <h1 className="text-xl font-bold text-gradient">MyAgenteIA</h1>
      </div>
      
      <nav className="flex-1 flex flex-col space-y-4">
        <button className="flex items-center space-x-3 w-full text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg p-3 transition">
          <span className="text-cyan-400">💬</span>
          <span>Chats</span>
        </button>
        <button className="flex items-center space-x-3 w-full text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg p-3 transition">
          <span className="text-cyan-400">📊</span>
          <span>Dashboard</span>
        </button>
        <button className="flex items-center space-x-3 w-full text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg p-3 transition">
          <span className="text-cyan-400">🎯</span>
          <span>Leads</span>
        </button>
        <button className="flex items-center space-x-3 w-full text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg p-3 transition">
          <span className="text-cyan-400">📅</span>
          <span>Calendario</span>
        </button>
        <button className="flex items-center space-x-3 w-full text-left text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg p-3 transition">
          <span className="text-cyan-400">🤖</span>
          <span>Agentes</span>
        </button>
      </nav>
      
      <div className="mt-auto border-t border-gray-700 pt-4">
        <button className="w-full flex items-center space-x-3 text-gray-400 hover:text-white">
          <span className="text-cyan-400">⚙️</span>
          <span>Configuración</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;