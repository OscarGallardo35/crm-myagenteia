import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const AgentsPanel = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgentsStatus();
  }, []);

  const loadAgentsStatus = async () => {
    try {
      const data = await api.getAgentsStatus();
      setAgents(data);
    } catch (error) {
      console.error('Error loading agents status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando estado de agentes...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">Estado de Sub-agentes</h2>
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        {agents.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay agentes activos</p>
        ) : (
          <div className="space-y-3">
            {agents.map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white text-sm">
                    {agent.name?.charAt(0) || 'A'}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{agent.name || 'Agente desconocido'}</h4>
                    <p className="text-xs text-gray-400">{agent.type || ''}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 text-xs rounded-full ${agent.status === 'active' ? 'bg-green-500/20 text-green-400' : agent.status === 'idle' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                    {agent.status === 'active' ? 'Activo' : agent.status === 'idle' ? 'Inactivo' : 'Error'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentsPanel;