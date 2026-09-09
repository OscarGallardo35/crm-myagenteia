import React, { useState, useEffect } from 'react';
import ModelSelector from './ModelSelector';
import { api } from '../lib/api';

// Hook personalizado para manejar el estado de carga correctamente
const useApi = (asyncFunction, deps = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await asyncFunction();
        if (isMounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, [...deps]);

  return { data, loading, error };
};

// Componente base para todas las vistas
const BaseView = ({ title, children, loadingContent = 'Cargando...' }) => {
  const { data, loading, error } = useApi(() => Promise.resolve(children()));
  
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-gray-400">{loadingContent}</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children()}
    </div>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    rateLimits: {},
    agents: [],
    scheduledPosts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-gray-400">Cargando...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg text-red-400 mb-2">Error al cargar el dashboard</h3>
          <p className="text-gray-400">No se pudieron cargar las estadísticas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400 mb-2">CPU Usage</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold text-cyan-400">{stats.cpu}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${stats.cpu}%` }}></div>
          </div>
        </div>

        {/* RAM */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400 mb-2">RAM Usage</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold text-pink-400">{stats.ram}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2.5">
            <div className="bg-pink-500 h-2.5 rounded-full" style={{ width: `${stats.ram}%` }}></div>
          </div>
        </div>

        {/* Rate Limits */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Rate Limits</h3>
          <div className="space-y-2">
            {Object.entries(stats.rateLimits).map(([model, limit]) => (
              <div key={model} className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{model}</span>
                <span className="text-green-400">{limit}/min</span>
              </div>
            ))}
          </div>
        </div>

        {/* Posts */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Posts Programados</h3>
          <div className="text-2xl font-bold text-green-400">{stats.scheduledPosts}</div>
        </div>
      </div>
    </div>
  );
};

const ChatView = () => {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('claude-3-opus');
  const [useMemory, setUseMemory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      setLoadingChats(true);
      const data = await api.getChats();
      setChats(data);
      if (data.length > 0 && !selectedChatId) {
        setSelectedChatId(data[0].id);
        loadMessages(data[0].id);
      }
    } catch (err) {
      console.error('Error loading chats:', err);
      setError(err);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadMessages = async (chatId) => {
    try {
      setLoading(true);
      const data = await api.getChatMessages(chatId);
      setMessages(data);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedChatId) return;

    setLoading(true);
    try {
      await api.sendMessage(selectedChatId, input);
      setInput('');
      loadMessages(selectedChatId);
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loadingChats && !chats.length) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-gray-400">Cargando conversaciones...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white">Conversaciones</h2>
        <div className="flex items-center space-x-3">
          <ModelSelector value={model} onModelChange={setModel} />
          <label className="flex items-center space-x-2 text-gray-300">
            <input
              type="checkbox"
              checked={useMemory}
              onChange={(e) => setUseMemory(e.target.checked)}
              className="h-4 w-4 text-cyan-400"
            />
            Usar memoria de chat anterior
          </label>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Chat list */}
          <div className="w-64 border-r border-gray-800 overflow-y-auto">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => {
                  setSelectedChatId(chat.id);
                  loadMessages(chat.id);
                }}
                className={`cursor-pointer p-3 hover:bg-gray-800 ${selectedChatId === chat.id ? 'bg-gray-800' : ''}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white text-sm">
                    {chat.title?.charAt(0) || 'C'}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{chat.title || 'Sin título'}</h3>
                    <p className="text-xs text-gray-400">{chat.updated_at || ''}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_user ? 'justify-end' : 'justify-start'} max-w-[80%]`}>
                  <div className={`${msg.is_user ? 'bg-cyan-500/20 text-cyan-200' : 'bg-gray-800/50 text-gray-100'} rounded-lg p-3 max-w-xs break-words`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && <div className="text-center text-gray-400">Cargando...</div>}
            </div>
            <div className="border-t border-gray-800 p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim() || !selectedChatId}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg hover:from-cyan-300 hover:to-blue-400 transition"
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LeadsBoard = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draggingLeadId, setDraggingLeadId] = useState(null);

  const statuses = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      setLoading(true);
      const data = await api.getLeads();
      setLeads(data);
    } catch (err) {
      console.error('Error loading leads:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (leadId) => {
    setDraggingLeadId(leadId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (newStatus) => {
    if (!draggingLeadId) return;
    try {
      await api.updateLeadStatus(draggingLeadId, newStatus);
      setDraggingLeadId(null);
      loadLeads();
    } catch (err) {
      console.error('Error updating lead status:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-gray-400">Cargando leads...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg text-red-400 mb-2">Error al cargar leads</h3>
          <p className="text-gray-400">No se pudieron cargar los leads</p>
        </div>
      </div>
    );
  }

  // Group leads by status
  const leadsByStatus = statuses.reduce((acc, status) => {
    acc[status] = leads.filter(lead => lead.status === status);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Pipeline de Leads</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {statuses.map(status => (
          <div
            key={status}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700 min-h-[200px] droptarget"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(status)}
          >
            <h3 className="text-sm font-medium text-gray-300 mb-3 capitalize">
              {status}
            </h3>
            <div className="space-y-2">
              {leadsByStatus[status].map(lead => (
                <div
                  key={lead.id}
                  draggable={true}
                  onDragStart={() => handleDragStart(lead.id)}
                  className="bg-gray-700 rounded-lg p-3 cursor-grab"
                >
                  <h4 className="font-medium text-white">{lead.name}</h4>
                  <p className="text-xs text-gray-400">{lead.company || ''}</p>
                  <p className="text-xs text-gray-400">{lead.source || ''}</p>
                </div>
              ))}
              {leadsByStatus[status].length === 0 && (
                <p className="text-xs text-gray-500 text-center italic">Sin leads</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PostingCalendar = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const data = await api.getScheduledPosts();
      setPosts(data);
    } catch (err) {
      console.error('Error loading scheduled posts:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-gray-400">Cargando calendario...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg text-red-400 mb-2">Error al cargar calendario</h3>
          <p className="text-gray-400">No se pudieron cargar los posts programados</p>
        </div>
      </div>
    );
  }

  // Group posts by date (simplified: assuming posts have a scheduled_at date string)
  const postsByDate = posts.reduce((acc, post) => {
    const date = post.scheduled_at?.split('T')[0] || 'unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  const sortedDates = Object.keys(postsByDate).sort();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Calendario Editorial</h2>
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Hora
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Plataforma
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {sortedDates.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-center text-gray-500" colSpan="5">
                    No hay posts programados
                  </td>
                </tr>
              ) : (
                sortedDates.flatMap(date => {
                  const datePosts = postsByDate[date];
                  return datePosts.map((post, index) => (
                    <tr key={`${date}-${index}`} className="hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {index === 0 ? new Date(date).toLocaleDateString('es-ES') : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {post.scheduled_at ? new Date(post.scheduled_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {post.platform || ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${post.status === 'scheduled' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {post.status === 'scheduled' ? 'Programado' : 'Fallido'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <button className="text-cyan-400 hover:text-cyan-300">
                          Ver
                        </button>
                      </td>
                    </tr>
                  ));
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AgentsPanel = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAgentsStatus();
  }, []);

  const loadAgentsStatus = async () => {
    try {
      setLoading(true);
      const data = await api.getAgentsStatus();
      setAgents(data);
    } catch (err) {
      console.error('Error loading agents status:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-gray-400">Cargando estado de agentes...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg text-red-400 mb-2">Error al cargar agentes</h3>
          <p className="text-gray-400">No se pudieron cargar los agentes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Estado de Sub-agentes</h2>
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
