import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModelSelector from './ModelSelector';
import { api } from '../lib/api';

// Idea cedida de la UX de Claude: sidebar con historial + área central de conversación.
// De fondo: sesiones REALES del agente Hermes (leídas de /root/.hermes/state.db).
// El sidebar es COLAPSABLE (botón < / >) para que en móvil el chat ocupe todo el ancho
// y nunca se apilen las palabras letra a letra.
const INITIAL_VISIBLE = 12;
const DESKTOP = 1024;

const useIsMobile = () => {
  const [mobile, setMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < DESKTOP
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < DESKTOP);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
};

const ChatView = () => {
  const isMobile = useIsMobile();
  // En desktop el sidebar arranca abierto; en móvil colapsado (chat a ancho completo).
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [sessions, setSessions] = useState([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  // Si el usuario cambia de desktop a móvil, reseteamos a colapsado al volver.
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  // Cargar sesiones reales de Hermes
  useEffect(() => {
    let active = true;
    api.getHermesSessions(100)
      .then((data) => {
        if (!active) return;
        if (data && data.ok) {
          setSessions(data.sessions || []);
          if ((data.sessions || []).length > 0) setSelectedId(data.sessions[0].id);
        } else {
          setError('No se pudieron cargar las sesiones');
        }
      })
      .catch(() => setError('Error al cargar sesiones de Hermes'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Cargar mensajes de la sesión seleccionada
  const loadSession = useCallback(async (sid) => {
    setLoadingSession(true);
    setError('');
    try {
      const data = await api.getHermesSessionMessages(sid);
      setMessages(data && data.ok ? (data.messages || []) : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => { if (selectedId) loadSession(selectedId); }, [selectedId, loadSession]);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Al elegir una sesión en móvil, cerramos el sidebar para mostrar el chat completo.
  const handleSelect = (id) => {
    setSelectedId(id);
    if (isMobile) setSidebarOpen(false);
  };

  const visible = sessions.slice(0, visibleCount);
  const total = sessions.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-800">
        <h2 className="text-lg font-semibold min-w-0">Hermes — Historial</h2>
        <div className="flex flex-wrap items-center gap-y-2 ml-auto min-w-0">
          <ModelSelector value={model} onModelChange={setModel} />
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* ====== Sidebar de sesiones (colapsable) ====== */}
        {/* Overlay oscuro en móvil cuando el sidebar está abierto */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`flex-col bg-gray-900 border-r border-gray-800 shrink-0 overflow-hidden ${
            isMobile
              ? `fixed z-40 top-0 bottom-0 left-0 w-72 transition-transform duration-200 ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
              : `${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-200`
          } flex`}
        >
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-gray-400 text-sm">Cargando sesiones…</div>
            ) : error && sessions.length === 0 ? (
              <div className="p-4 text-gray-400 text-sm">{error}</div>
            ) : (
              <div>
                {visible.map((s, i) => (
                  <div
                    key={s.id}
                    onClick={() => handleSelect(s.id)}
                    className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/50 transition ${
                      selectedId === s.id ? 'bg-gray-800/80' : ''
                    } ${i === 0 ? 'bg-gradient-to-r from-cyan-500/10 to-transparent' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {s.pinned && <span className="text-cyan-400 text-xs">📌</span>}
                      <h3 className="font-medium text-white text-sm truncate flex-1">
                        {s.title || '(sin título)'}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{s.preview || '…'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-gray-500">{s.last_activity_display}</span>
                      <span className="text-[11px] text-gray-600">{s.message_count} msgs</span>
                    </div>
                  </div>
                ))}

                {visibleCount < total && (
                  <button
                    onClick={() => setVisibleCount(total)}
                    className="w-full py-3 text-sm text-cyan-400 hover:bg-gray-800/60 transition font-medium"
                  >
                    ▾ Mostrar todas ({total - visibleCount} más)
                  </button>
                )}
                {visibleCount >= total && total > INITIAL_VISIBLE && (
                  <button
                    onClick={() => setVisibleCount(INITIAL_VISIBLE)}
                    className="w-full py-3 text-sm text-gray-500 hover:bg-gray-800/60 transition"
                  >
                    ▴ Mostrar menos
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ====== Botón colapsar sidebar (< / >) ====== */}
        {/* En desktop: pegado al borde derecho del sidebar. En móvil: botón flotante arriba. */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Contraer historial' : 'Expandir historial'}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-6 h-12 flex items-center justify-center
              bg-gray-800 border border-gray-700 rounded-r-lg text-gray-300 hover:text-white
              hover:bg-gray-700 transition select-none"
            style={{ left: sidebarOpen ? 272 : 0 }}
          >
            <span className="text-sm font-bold">{sidebarOpen ? '<' : '>'}</span>
          </button>
        )}

        {/* ====== Área central de conversación (ancho completo cuando sidebar colapsa) ====== */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Botón para abrir historial en móvil (encabezado del área de chat) */}
          {isMobile && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Ver historial"
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition text-sm"
              >
                ☰ Historial
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loadingSession ? (
              <div className="text-center text-gray-400 py-8">Cargando conversación…</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">
                Seleccioná una sesión del historial para ver la conversación.
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] min-w-0 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 text-cyan-100'
                        : msg.role === 'tool'
                        ? 'bg-gray-800/60 font-mono text-xs text-gray-300'
                        : 'bg-gray-800/60 text-gray-100'
                    }`}
                    style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                  >
                    {msg.role !== 'user' && msg.role !== 'assistant' && (
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                        {msg.role}
                      </span>
                    )}
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input inferior — envío hacia Hermes */}
          <div className="border-t border-gray-800 p-3 bg-gray-900/80">
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="text"
                placeholder="Escribí para consultar a Hermes…"
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg hover:from-cyan-300 hover:to-blue-400 transition font-medium"
              >
                Enviar
              </button>
            </form>
            <p className="text-[11px] text-gray-600 mt-2">
              Historial de conversaciones reales del agente Hermes · {total} sesiones
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
