import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModelSelector from './ModelSelector';
import { api } from '../lib/api';

// Inspirado en la UX de Claude: sidebar con historial + área central de conversación.
// De fondo: sesiones REALES del agente Hermes (leídas de /root/.hermes/state.db).
const INITIAL_VISIBLE = 12;

const ChatView = () => {
  const [sessions, setSessions] = useState([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

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
          if ((data.sessions || []).length > 0) {
            setSelectedId(data.sessions[0].id);
          }
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
      if (data && data.ok) {
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadSession(selectedId);
  }, [selectedId, loadSession]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const visible = sessions.slice(0, visibleCount);
  const total = sessions.length;

  const handleSend = async (e) => {
    e.preventDefault();
    // Envío delegado a Hermes: por ahora queda como placeholder — el historial es de lectura.
    // TODO: conectar con el proxy Hermes (puerto 8645) para generar respuesta real.
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-800">
        <h2 className="text-lg font-semibold min-w-0">Hermes — Historial</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 ml-auto min-w-0">
          <ModelSelector value={model} onModelChange={setModel} />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ===== Sidebar de sesiones (estilo Claude) ===== */}
        <div className="w-72 border-r border-gray-800 flex flex-col min-h-0 shrink-0">
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
                    onClick={() => setSelectedId(s.id)}
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
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {s.preview || '…'}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-gray-500">{s.last_activity_display}</span>
                      <span className="text-[11px] text-gray-600">{s.message_count} msgs</span>
                    </div>
                  </div>
                ))}

                {/* Botón mostrar todas */}
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
        </div>

        {/* ===== Área central de conversación ===== */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 text-cyan-100'
                        : msg.role === 'tool'
                        ? 'bg-gray-850 bg-gray-800/60 font-mono text-xs text-gray-300'
                        : 'bg-gray-800/60 text-gray-100'
                    }`}
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
            <form className="flex gap-2" onSubmit={handleSend}>
              <input
                type="text"
                placeholder="Escribí para consultar a Hermes…"
                className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
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
