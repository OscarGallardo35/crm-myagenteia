import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModelSelector from './ModelSelector';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactCard from './ArtifactCard';
import { api } from '../lib/api';

// Chat tipo Claude con Hermes de fondo.
// Features (Fase 1): nueva conversación, retomar, renombrar, copiar, markdown,
// búsqueda (Ctrl+K), fijar y borrar/archivar.
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

  const [hermesSessions, setHermesSessions] = useState([]);
  const [crmConvos, setCrmConvos] = useState([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeTitle, setActiveTitle] = useState('');

  const [model, setModel] = useState('');
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [agentWorking, setAgentWorking] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  // Búsqueda
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // Renombrar
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Menu de la conversación activa
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);
  const titleInputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [isMobile]);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (agentWorking) scrollToBottom(); }, [agentWorking, scrollToBottom]);

  // Atajo Ctrl+K (búsqueda) + Escape
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') { setSearchOpen(false); setMenuOpen(false); setEditingTitle(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Cargar datos iniciales
  useEffect(() => {
    let activeFlag = true;
    Promise.all([api.getHermesSessions(100), api.getCrmConversations()])
      .then(([hs, cs]) => {
        if (!activeFlag) return;
        setHermesSessions(hs && hs.ok ? (hs.sessions || []) : []);
        setCrmConvos(cs && cs.ok ? (cs.conversations || []) : []);
        const firstCrm = (cs?.conversations || [])[0];
        const firstH = (hs?.sessions || [])[0];
        if (firstCrm) selectSession('crm', firstCrm.id, firstCrm.title);
        else if (firstH) selectSession('hermes', firstH.id, firstH.title);
      })
      .catch(() => setError('Error al cargar las sesiones'))
      .finally(() => { if (activeFlag) setLoadingInit(false); });
    return () => { activeFlag = false; };
  }, []);

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
    setMenuOpen(false);
    if (isMobile) setSidebarOpen(false);
    await loadMessages(type, id);
  }, [isMobile, loadMessages]);

  // ---- Nueva conversación ----
  const handleNewChat = useCallback(async () => {
    try {
      const data = await api.createCrmConversation();
      if (data && data.ok && data.conversation) {
        const c = { ...data.conversation, pinned: false };
        setCrmConvos((prev) => [c, ...prev]);
        setMessages([]);
        setActive({ type: 'crm', id: c.id });
        setActiveTitle('Nueva conversación');
        setInput('');
        if (isMobile) setSidebarOpen(false);
      }
    } catch { setError('Error al crear conversación'); }
  }, [isMobile]);

  // ---- Cambiar modelo (aplica el session model lock al instante) ----
  const handleModelChange = useCallback(async (newModel) => {
    setModel(newModel);
    // si hay una conversación CRM activa, cambia el modelo de su sesión de agente
    if (active && active.type === 'crm') {
      try {
        await api.setCrmConversationModel(active.id, newModel);
      } catch { /* no crítico, el próximo envío usa el modelo igualmente */ }
    }
  }, [active]);

  // ---- Enviar mensaje (background job + polling: el agente corre en un hilo) ----
  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !active || active.type !== 'crm') return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setAgentWorking(true);
    setError('');
    try {
      const chosenModel = model || '';  // si vacío, el backend usa su default (deepseek v4 flash via commandcode)
      const data = await api.addCrmMessage(active.id, 'user', text, chosenModel);
      if (data && data.ok) {
        // actualizar mensaje user y preview
        setMessages((prev) => [...prev.slice(0, -1), { role: 'user', content: text }]);
        setCrmConvos((prev) => prev.map(c => c.id === active.id
          ? { ...c, preview: text.slice(0, 80), message_count: (c.message_count || 0) + 1 }
          : c));
        // el agente corre en background -> hacer polling hasta que aparezca la respuesta
        if (data.agent_pending) {
          pollForAssistant(active.id, text);
        } else if (data.assistant_message) {
          setMessages((prev) => [...prev, data.assistant_message]);
          setCrmConvos((prev) => prev.map(c => c.id === active.id
            ? { ...c, message_count: (c.message_count || 0) + 1 }
            : c));
          setAgentWorking(false);
        }
      } else if (data && !data.ok) { setError(data.error || 'Error al enviar'); setAgentWorking(false); }
    } catch { setError('Error al enviar mensaje'); setAgentWorking(false); }
  }, [input, active, model]);

  // ---- Polling: consulta la conversación hasta que Hermes termine ----
  const pollForAssistant = useCallback(async (cid, userText) => {
    const deadline = Date.now() + 15 * 60 * 1000; // máx 15 min
    let running = true;
    const tick = async () => {
      if (!running) return;
      if (Date.now() > deadline) { setError('El agente no respondió a tiempo.'); setAgentWorking(false); return; }
      try {
        const data = await api.getCrmConversation(cid);
        if (data && data.ok) {
          const msgs = data.messages || [];
          const assistantCount = msgs.filter(m => m.role === 'assistant').length;
          if (assistantCount > 0) {
            // ya está la respuesta -> reemplazar el estado con lo persistido
            setMessages(msgs);
            setCrmConvos((prev) => prev.map(c => c.id === cid
              ? { ...c, preview: userText.slice(0, 80), message_count: msgs.length }
              : c));
            setAgentWorking(false);
            return;
          }
        }
      } catch { /* seguir intentando */ }
      setTimeout(tick, 4000);
    };
    setTimeout(tick, 4000);
    setAgentWorking(true);
    // limpiar el loop si el componente se desmonta
    return () => { running = false; };
  }, []);

  // ---- Renombrar ----
  const startRename = () => {
    if (!active || active.type !== 'crm') return;
    setTitleDraft(activeTitle || '');
    setEditingTitle(true);
    setMenuOpen(false);
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

  // ---- Copiar mensaje ----
  const copyMessage = async (content, idx) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(idx);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard no disponible */ }
  };

  // ---- Fijar / Desfijar ----
  const togglePin = async (id, pinned) => {
    try {
      const data = await api.pinCrmConversation(id, !pinned);
      if (data && data.ok) {
        setCrmConvos((prev) => prev.map(c => c.id === id ? { ...c, pinned: data.pinned } : c));
      }
    } catch { }
  };

  // ---- Borrar / archivar ----
  const deleteConversation = async () => {
    if (!active || active.type !== 'crm') return;
    const id = active.id;
    try {
      await api.deleteCrmConversation(id);
      const remaining = crmConvos.filter(c => c.id !== id);
      setCrmConvos(remaining);
      setMenuOpen(false);
      if (remaining.length > 0) {
        selectSession('crm', remaining[0].id, remaining[0].title);
      } else if (hermesSessions.length > 0) {
        selectSession('hermes', hermesSessions[0].id, hermesSessions[0].title);
      } else {
        setMessages([]); setActive(null); setActiveTitle('');
      }
    } catch { setError('Error al borrar la conversación'); }
  };

  // ---- Filtro de búsqueda ----
  const queryLower = query.trim().toLowerCase();
  const filterCrm = queryLower
    ? crmConvos.filter(c => (c.title || '').toLowerCase().includes(queryLower) || (c.preview || '').toLowerCase().includes(queryLower))
    : crmConvos;
  const filterHermes = queryLower
    ? hermesSessions.filter(s => (s.title || '').toLowerCase().includes(queryLower) || (s.preview || '').toLowerCase().includes(queryLower))
    : hermesSessions;

  const totalVisible = filterCrm.length + filterHermes.length;
  const visibleCrm = filterCrm.slice(0, visibleCount);
  const visibleHermes = filterHermes.slice(0, Math.max(0, visibleCount - visibleCrm.length));
  const moreCount = Math.max(0, totalVisible - visibleCount);

  const isActive = (type, id) => active && active.type === type && String(active.id) === String(id);
  const activeIsCrm = active && active.type === 'crm';
  const activeIsPinned = activeIsCrm && (crmConvos.find(c => c.id === active.id)?.pinned || false);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-gray-800">
        <h2 className="text-lg font-semibold min-w-0">Hermes — Historial</h2>
        <div className="flex flex-wrap items-center gap-y-2 ml-auto min-w-0">
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50); }}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/70 border border-gray-700 rounded-lg text-gray-300 hover:text-white hover:border-gray-600 transition text-sm"
            title="Buscar en el historial (Ctrl+K)"
          >
            <span>🔍</span>
            <span className="hidden sm:inline">Buscar…</span>
            <kbd className="hidden sm:inline text-[10px] bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">⌘K</kbd>
          </button>
          <ModelSelector value={model} onModelChange={handleModelChange} />
        </div>
      </div>

      {/* Barra de búsqueda */}
      {searchOpen && (
        <div className="px-3 py-2 border-b border-gray-800 bg-gray-900/80">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversaciones y sesiones… (Esc para cerrar)"
            className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
      )}

      <div className="flex-1 flex min-h-0 relative">
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ===== Sidebar sesiones ===== */}
        <aside
          className={`flex-col bg-gray-900 border-r border-gray-800 shrink-0 overflow-hidden ${
            isMobile
              ? `fixed z-40 top-0 bottom-0 left-0 w-72 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
              : `${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-200`
          } flex`}
        >
          <div className="flex-1 overflow-y-auto">
            {loadingInit ? (
              <div className="p-4 text-gray-400 text-sm">Cargando sesiones…</div>
            ) : error && totalVisible === 0 ? (
              <div className="p-4 text-gray-400 text-sm">{error}</div>
            ) : (
              <div>
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-2 px-3 py-3 text-cyan-400 hover:bg-cyan-500/10 transition font-medium border-b border-gray-800/60"
                >
                  <span className="text-lg leading-none">+</span>
                  <span className="text-sm">Nueva conversación</span>
                </button>

                {/* Conversaciones CRM */}
                {visibleCrm.map((c) => (
                  <div
                    key={`crm-${c.id}`}
                    onClick={() => selectSession('crm', c.id, c.title)}
                    className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/50 transition ${isActive('crm', c.id) ? 'bg-gray-800/80' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {c.pinned && <span className="text-cyan-400 text-xs">📌</span>}
                      <h3 className="font-medium text-white text-sm truncate flex-1">{c.title || 'Nueva conversación'}</h3>
                      {isActive('crm', c.id) && <span className="text-[10px] text-cyan-400 font-medium">●</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{c.preview || 'Sin mensajes aún'}</p>
                    <span className="text-[11px] text-gray-600">{c.message_count} msgs</span>
                  </div>
                ))}

                {/* Sesiones Hermes */}
                {visibleCrm.length > 0 && visibleHermes.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500">Sesiones de Hermes</div>
                )}
                {visibleHermes.map((s, i) => (
                  <div
                    key={`h-${s.id}`}
                    onClick={() => selectSession('hermes', s.id, s.title)}
                    className={`px-3 py-2.5 border-b border-gray-800/60 cursor-pointer hover:bg-gray-800/50 transition ${isActive('hermes', s.id) ? 'bg-gray-800/80' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {s.pinned && <span className="text-cyan-400 text-xs">📌</span>}
                      <h3 className="font-medium text-white text-sm truncate flex-1">{s.title || '(sin título)'}</h3>
                      {isActive('hermes', s.id) && <span className="text-[10px] text-cyan-400 font-medium">●</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{s.preview || '…'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-gray-500">{s.last_activity_display}</span>
                      <span className="text-[11px] text-gray-600">{s.message_count} msgs</span>
                    </div>
                  </div>
                ))}

                {moreCount > 0 && (
                  <button onClick={() => setVisibleCount(visibleCount + INITIAL_VISIBLE)} className="w-full py-3 text-sm text-cyan-400 hover:bg-gray-800/60 transition font-medium">
                    ▾ Mostrar más ({moreCount})
                  </button>
                )}
                {moreCount <= 0 && totalVisible > INITIAL_VISIBLE && !queryLower && (
                  <button onClick={() => setVisibleCount(INITIAL_VISIBLE)} className="w-full py-3 text-sm text-gray-500 hover:bg-gray-800/60 transition">
                    ▴ Mostrar menos
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Botón colapsar desktop */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Contraer historial' : 'Expandir historial'}
            className="absolute top-1/2 -translate-y-1/2 z-20 w-6 h-12 flex items-center justify-center bg-gray-800 border border-gray-700 rounded-r-lg text-gray-300 hover:text-white hover:bg-gray-700 transition select-none"
            style={{ left: sidebarOpen ? 272 : 0 }}
          >
            <span className="text-sm font-bold">{sidebarOpen ? '<' : '>'}</span>
          </button>
        )}

        {/* ===== Área central ===== */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {isMobile && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 lg:hidden">
              <button onClick={() => setSidebarOpen(true)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition text-sm">☰ Historial</button>
            </div>
          )}

          {/* Título + menú de la conversación activa */}
          {active && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/60">
              {editingTitle && activeIsCrm ? (
                <form className="flex-1 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); commitRename(); }}>
                  <input ref={titleInputRef} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Escape') setEditingTitle(false); }} className="flex-1 px-2 py-1 bg-gray-800 border border-cyan-500 rounded text-sm text-white focus:outline-none" />
                </form>
              ) : (
                <>
                  <h3 className="text-sm font-medium text-gray-100 truncate">{activeTitle || 'Conversación'}</h3>
                  {activeIsCrm && (
                    <button onClick={startRename} className="text-gray-500 hover:text-cyan-400 transition text-sm" title="Renombrar">✎</button>
                  )}
                </>
              )}

              <div className="ml-auto relative">
                {activeIsCrm && (
                  <button onClick={() => setMenuOpen(!menuOpen)} className="text-gray-500 hover:text-white transition px-1 text-lg leading-none" title="Opciones">⋯</button>
                )}
                {menuOpen && activeIsCrm && (
                  <div className="absolute right-0 top-7 z-30 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                    <button onClick={() => { togglePin(active.id, activeIsPinned); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition">
                      {activeIsPinned ? '📌 Desfijar' : '📌 Fijar'}
                    </button>
                    <button onClick={() => { startRename(); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition">✎ Renombrar</button>
                    <button onClick={deleteConversation} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition">🗑 Borrar conversación</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg px-3 py-2 text-sm">{error}</div>
            )}
            {loadingMsgs ? (
              <div className="text-center text-gray-400 py-8">Cargando conversación…</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">
                {activeIsCrm ? 'Conversación nueva. Escribí tu primer mensaje para iniciar.' : 'Seleccioná una sesión para ver la conversación.'}
              </div>
            ) : (
              <>
              {messages.map((msg, i) => (
                <div key={i} className="group">
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] min-w-0 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user' ? 'bg-cyan-500/20 text-cyan-100'
                        : msg.role === 'tool' ? 'bg-gray-800/60 font-mono text-xs text-gray-300'
                        : 'bg-gray-800/60 text-gray-100'
                      }`}
                      style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                    >
                      {msg.role !== 'user' && msg.role !== 'assistant' && (
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">{msg.role}</span>
                      )}
                      {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                      {/* Artefactos tipo Claude */}
                      {msg.role === 'assistant' && Array.isArray(msg.artifacts) && msg.artifacts.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {msg.artifacts.map((a, j) => <ArtifactCard key={j} artifact={a} />)}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Acciones: copiar */}
                  <div className={`flex mt-0.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <button
                      onClick={() => copyMessage(msg.content, i)}
                      className="text-[11px] text-gray-500 hover:text-cyan-400 transition pr-1"
                      title="Copiar mensaje"
                    >
                      {copiedId === i ? '✓ Copiado' : '⧉ Copiar'}
                    </button>
                  </div>
                </div>
              ))}
              {/* Burbuja del agente trabajando — dentro del flujo, después del último mensaje */}
              {agentWorking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2.5 max-w-[85%] rounded-xl px-3.5 py-3 bg-gray-800/60 border border-cyan-500/20">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '240ms' }} />
                    </span>
                    <span className="text-sm text-gray-300">Hermes está trabajando…</span>
                  </div>
                </div>
              )}
              </>
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
                placeholder={agentWorking ? 'El agente está respondiendo…' : (activeIsCrm ? 'Escribí tu mensaje…' : 'Seleccioná una conversación para responder')}
                disabled={!activeIsCrm || agentWorking}
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent disabled:opacity-50"
              />
              <button type="submit" disabled={!activeIsCrm || agentWorking || !input.trim()} className="px-4 py-2.5 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg hover:from-cyan-300 hover:to-blue-400 transition font-medium disabled:opacity-50">Enviar</button>
            </form>
            <p className="text-[11px] text-gray-600 mt-2">{totalVisible} conversaciones · Hermes de fondo · <kbd className="text-gray-500">⌘K</kbd> buscar</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
