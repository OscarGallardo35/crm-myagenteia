import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModelSelector from './ModelSelector';
import { api } from '../lib/api';

// Chat tipo Claude pero con Hermes de fondo:
// - Sidebar colapsable de sesiones (Hermes reales + conversaciones nuevas del CRM)
// - Botón "+ Nueva conversación" (crea sesión nueva en el CRM)
// - Retomar cualquier conversación cambia la sesión activa y carga sus mensajes
// - Renombrar la sesión in-place (lápiz en el hover / título de la conversación activa)
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
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  // Fuentes del historial
  const [hermesSessions, setHermesSessions] = useState([]);
  const [crmConvos, setCrmConvos] = useState([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // Sesión activa: { type: 'hermes'|'crm', id }
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeTitle, setActiveTitle] = useState('');

  const [model, setModel] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  // Renombrar
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const messagesEndRef = useRef(null);
  const titleInputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [isMobile]);

  // Cargar sesiones de Hermes + conversaciones del CRM
  useEffect(() => {
    let active = true;
    Promise.all([api.getHermesSessions(100), api.getCrmConversations()])
      .then(([hs, cs]) => {
        if (!active) return;
        setHermesSessions(hs && hs.ok ? (hs.sessions || []) : []);
        setCrmConvos(cs && cs.ok ? (cs.conversations || []) : []);
        const firstH = (hs?.sessions || [])[0];
        if (firstH) selectSession('hermes', firstH.id, firstH.title);
      })
      .catch(() => setError('Error al cargar las sesiones'))
      .finally(() => { if (active) setLoadingInit(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Cargar mensajes de la sesión activa
  const loadMessages = useCallback(async (type, id) => {
    setLoadingMsgs(true);
    setError('');
    try {
      const data = type === 'hermes'
        ? await api.getHermesSessionMessages(id)
        : await api.getCrmConversation(id);
      setMessages(data && data.ok ? (data.messages || []) : []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const selectSession = useCallback(async (type, id, title) => {
    setActive({ type, id });
    setActiveTitle(title || '');
    setEditingTitle(false);
    if (isMobile) setSidebarOpen(false);
    await loadMessages(type, id);
  }, [isMobile, loadMessages]);

  // ---- Nueva conversación (crea sesión nueva en el CRM) ----
  const handleNewChat = useCallback(async () => {
    try {
      const data = await api.createCrmConversation();
      if (data && data.ok && data.conversation) {
        const c = data.conversation;
        setCrmConvos((prev) => [c, ...prev]);
        setMessages([]);
        setActive({ type: 'crm', id: c.id });
        setActiveTitle('Nueva conversación');
        setInput('');
        if (isMobile) setSidebarOpen(false);
      } else if (data && !data.ok) {
        setError(data.error || 'No se pudo crear');
      }
    } catch (e) {
      setError('Error al crear conversación');
    }
  }, [isMobile]);

  // ---- Enviar mensaje (chat bidireccional: guarda user + obtiene respuesta de Hermes) ----
  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !active || active.type !== 'crm') return;
    setLoadingMsgs(true);
    setError('');
    try {
      const data = await api.addCrmMessage(active.id, 'user', text);
      setInput('');
      if (data && data.ok) {
        const newMsgs = [data.message];
        if (data.assistant_message) newMsgs.push(data.assistant_message);
        setMessages((prev) => [...prev, ...newMsgs]);
        if (data.assistant_error) setError('No se pudo obtener respuesta (revisá el proxy Hermes).');
      } else if (data && !data.ok) {
        setError(data.error || 'Error al enviar');
      }
    } catch (err) {
      setError('Error al enviar mensaje');
    } finally {
      setLoadingMsgs(false);
    }
  }, [input, active]);

  // ---- Renombrar conversación ----
  const startRename = () => {
    if (!active || active.type !== 'crm') return;
    setTitleDraft(activeTitle || '');
    setEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };
  const commitRename = async () => {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!active || active.type !== 'crm' || !t || t === activeTitle) return;
    try {
      const data = await api.renameCrmConversation(active.id, t);
      if (data && data.ok) {
        setActiveTitle(data.title);
        setCrmConvos((prev) => prev.map(c => c.id === active.id ? { ...c, title: data.title } : c));
      }
    } catch { /* mantener */ }
  };

  const total = hermesSessions.length + crmConvos.length;
  const visibleHermes = hermesSessions.slice(0, Math.max(0, visibleCount - crmConvos.length));
  const visibleCrm = crmConvos.slice(0, visibleCount);
  const moreCount = total - visibleCount;

  const isActive = (type, id) => active && active.type === type && String(active.id) === String(id);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-800">
        <h2 className="text-lg font-semibold min-w-0">Hermes — Historial</h2>
        <div className="flex flex-wrap items-center gap-y-2 ml-auto min-w-0">
          <ModelSelector value={model} onModelChange={setModel} />
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Overlay oscuro en móvil */}
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ===== Sidebar sesiones (colapsable) ===== */}
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
            {loadingInit ? (
              <div className="p-4 text-gray-400 text-sm">Cargando sesiones…</div>
            ) : error && total === 0 ? (
              <div className="p-4 text-gray-400 text-sm">{error}</div>
            ) : (
              <div>
                {/* Botón Nueva conversación */}
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-3 py-3 text-cyan-400 hover:bg-cyan-500/10 transition font-medium border-b border-gray-800/60"
                >
                  <span className="text-lg leading-none">+</span>
                  <span className="text-sm">Nueva conversación</span>
                </button>

                {/* Conversaciones nuevas del CRM */}
                {visibleCrm.map((c) => (
                  <div
                    key={`crm-${c.id}`}
                    onClick={() => selectSession('crm', c.id, c.title)}
                    className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/50 transition ${
                      isActive('crm', c.id) ? 'bg-gray-800/80' : ''
                    }`}
                  >
                    <h3 className="font-medium text-white text-sm truncate">{c.title || 'Nueva conversación'}</h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{c.preview || 'Sin mensajes aún'}</p>
                    <span className="text-[11px] text-gray-600">{c.message_count} msgs</span>
                  </div>
                ))}

                {/* Sesiones reales de Hermes */}
                {visibleCrm.length > 0 && visibleHermes.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500">
                    Sesiones de Hermes
                  </div>
                )}
                {visibleHermes.map((s, i) => (
                  <div
                    key={`h-${s.id}`}
                    onClick={() => selectSession('hermes', s.id, s.title)}
                    className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/50 transition ${
                      isActive('hermes', s.id) ? 'bg-gray-800/80' : ''
                    } ${i === 0 && visibleCrm.length === 0 ? 'bg-gradient-to-r from-cyan-500/10 to-transparent' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {s.pinned && <span className="text-cyan-400 text-xs">📌</span>}
                      <h3 className="font-medium text-white text-sm truncate flex-1">{s.title || '(sin título)'}</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{s.preview || '…'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-gray-500">{s.last_activity_display}</span>
                      <span className="text-[11px] text-gray-600">{s.message_count} msgs</span>
                    </div>
                  </div>
                ))}

                {/* Botón mostrar todas */}
                {moreCount > 0 && (
                  <button
                    onClick={() => setVisibleCount(total)}
                    className="w-full py-3 text-sm text-cyan-400 hover:bg-gray-800/60 transition font-medium"
                  >
                    ▾ Mostrar todas ({moreCount} más)
                  </button>
                )}
                {moreCount <= 0 && total > INITIAL_VISIBLE && (
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

        {/* Botón colapsar en desktop */}
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

        {/* ===== Área central ===== */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {isMobile && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 lg:hidden">
              <button
                onClick={() => setSidebarOpen(true)}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition text-sm"
                aria-label="Ver historial"
              >
                ☰ Historial
              </button>
            </div>
          )}

          {/* Título de la conversación activa + renombrar */}
          {active && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/60">
              {editingTitle && active.type === 'crm' ? (
                <form
                  className="flex-1 flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); commitRename(); }}
                >
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingTitle(false); }}
                    className="flex-1 px-2 py-1 bg-gray-800 border border-cyan-500 rounded text-sm text-white focus:outline-none"
                  />
                </form>
              ) : (
                <>
                  <h3 className="text-sm font-medium text-gray-100 truncate">{activeTitle || 'Conversación'}</h3>
                  {active.type === 'crm' && (
                    <button
                      onClick={startRename}
                      className="text-gray-500 hover:text-cyan-400 transition text-sm"
                      aria-label="Renombrar conversación"
                      title="Renombrar"
                    >
                      ✎
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
            )}
            {loadingMsgs ? (
              <div className="text-center text-gray-400 py-8">Cargando conversación…</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">
                {active && active.type === 'crm'
                  ? 'Conversación nueva. Escribí tu primer mensaje para iniciar.'
                  : 'Seleccioná una sesión para ver la conversación.'}
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">{msg.role}</span>
                    )}
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input inferior */}
          <div className="border-t border-gray-800 p-3 bg-gray-900/80">
            <form className="flex gap-2" onSubmit={handleSend}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={active && active.type === 'crm'
                  ? 'Escribí tu mensaje…'
                  : 'Seleccioná una conversación para responder'}
                disabled={!active || active.type !== 'crm'}
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!active || active.type !== 'crm' || !input.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg hover:from-cyan-300 hover:to-blue-400 transition font-medium disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
            <p className="text-[11px] text-gray-600 mt-2">
              {total} conversaciones · Hermes de fondo
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
