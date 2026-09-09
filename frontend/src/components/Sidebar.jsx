import React, { useState } from 'react';

const Sidebar = ({ activeView, onViewChange }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { key: 'chat', label: 'Chats', icon: '💬' },
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'leads', label: 'Leads', icon: '🎯' },
    { key: 'calendar', label: 'Calendario', icon: '📅' },
    { key: 'agents', label: 'Agentes', icon: '🤖' },
  ];

  React.useEffect(() => {
    setMobileOpen(false);
  }, [activeView]);

  return (
    <>
      {/* Botón hamburger - solo visible en móvil (< lg) */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 border border-gray-700 text-white hover:bg-gray-700 transition"
        aria-label="Abrir menú"
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* Overlay para móvil - solo visible cuando mobileOpen es true */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar: en desktop es flex child. En móvil es overlay fijo (superpuesto, no empuja). */}
      <aside
        className={`flex flex-col bg-gray-900 border-r border-gray-800 transition-transform duration-200 z-50 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } fixed top-0 left-0 h-full lg:relative lg:top-auto lg:left-auto lg:h-screen`}
        style={{
          // Desktop: ancho fijo. Móvil: mismo ancho pero fijo y superpuesto al contenido
          width: '256px',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div className="flex items-center space-x-3 p-4 border-b border-gray-700">
          <div className="w-10 h-10 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">M</span>
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            MyAgenteIA
          </h1>
        </div>

        {/* Navegación */}
        <nav className="flex-1 flex flex-col space-y-2 p-3">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => {
                onViewChange(item.key);
                setMobileOpen(false);
              }}
              className={`flex items-center space-x-3 w-full text-left px-3 py-3 rounded-lg transition ${
                activeView === item.key
                  ? 'bg-gray-800 text-white border-l-4 border-cyan-400 shadow-lg shadow-cyan-500/20'
                  : 'text-gray-300 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
              {activeView === item.key && (
                <span className="ml-auto text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
                  ●
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Configuración (placeholder) */}
        <div className="p-3 border-t border-gray-700">
          <button className="flex items-center space-x-3 w-full text-left px-3 py-3 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition">
            <span className="text-lg">⚙️</span>
            <span>Configuración</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
