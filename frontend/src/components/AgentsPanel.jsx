import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

const TABS = [
  { key: 'live', label: 'Sub-agentes vivos', icon: '🤖' },
  { key: 'tasks', label: 'Tareas', icon: '📋' },
  { key: 'sessions', label: 'Sesiones persistentes', icon: '🧠' },
];

// Cada cuánto refrescar el tab activo (el transcript de los sub-agentes es
// append-only: se re-lee del endpoint mientras el sub-agente trabaja).
const LIVE_POLL_MS = 3000;
const TASKS_POLL_MS = 5000;

function StatusBadge({ status }) {
  const map = {
    running: 'bg-cyan-500/20 text-cyan-300',
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-red-500/20 text-red-300',
    pending: 'bg-yellow-500/20 text-yellow-300',
    cancelled: 'bg-gray-600/20 text-gray-400',
    unknown: 'bg-gray-600/20 text-gray-400',
  };
  const label = { running: 'En ejecución', completed: 'Completado', failed: 'Falló', pending: 'Pendiente', cancelled: 'Cancelado', unknown: '?' }[status] || status;
  return <span className={`px-2 py-0.5 text-[11px] rounded-full ${map[status] || map.unknown}`}>{label}</span>;
}

const AgentsPanel = ({ onOpenSession }) => {
  const [tab, setTab] = useState('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Nivel 1
  const [liveAgents, setLiveAgents] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [liveDetail, setLiveDetail] = useState(null);   // transcript_full del agente expandido
  const [updatedAt, setUpdatedAt] = useState(null);       // última actualización en vivo

  // Nivel 2
  const [tasks, setTasks] = useState([]);
  const [launchGoal, setLaunchGoal] = useState('');
  const [launchName, setLaunchName] = useState('');
  const [spawning, setSpawning] = useState(false);

  // Nivel 3
  const [sessions, setSessions] = useState([]);

  // ref para que el polling lea el id expandido sin closures obsoletos
  const expandedRef = useRef(null);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  const fetchLiveDetail = useCallback(async (id) => {
    if (!id) return;
    try {
      const det = await api.getLiveAgentDetail(id);
      if (det?.ok && det.agent) setLiveDetail(det.agent);
    } catch { /* detalle opcional: la lista ya trae transcript parcial */ }
  }, []);

  const load = useCallback(async (t) => {
    setLoading(true); setError('');
    try {
      if (t === 'live') {
        const d = await api.getLiveAgents();
        setLiveAgents(d?.agents || []);
        setUpdatedAt(new Date());
        if (expandedRef.current) fetchLiveDetail(expandedRef.current);
      } else if (t === 'tasks') {
        const d = await api.getAgentTasks();
        setTasks(d?.tasks || []);
      } else if (t === 'sessions') {
        const d = await api.getAgentSessions();
        setSessions(d?.sessions || []);
      }
    } catch (e) { setError('Error al cargar agentes'); }
    finally { setLoading(false); }
  }, [fetchLiveDetail]);

  useEffect(() => { load(tab); }, [tab, load]);

  // ---- Polling en vivo: refresca el tab activo mientras está montado ----
  useEffect(() => {
    if (tab !== 'live') return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api.getLiveAgents();
        if (!alive) return;
        setLiveAgents(d?.agents || []);
        setUpdatedAt(new Date());
        if (expandedRef.current) {
          const det = await api.getLiveAgentDetail(expandedRef.current);
          if (alive && det?.ok && det.agent) setLiveDetail(det.agent);
        }
      } catch { /* se reintenta en el siguiente tick */ }
    };
    const iv = setInterval(tick, LIVE_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [tab]);

  useEffect(() => {
    if (tab !== 'tasks') return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api.getAgentTasks();
        if (alive) setTasks(d?.tasks || []);
      } catch { /* noop */ }
    };
    const iv = setInterval(tick, TASKS_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [tab]);

  const launchTask = async () => {
    if (!launchGoal.trim()) return;
    setSpawning(true);
    try {
      await api.launchAgentTask({ name: launchName.trim() || 'Tarea de agente', goal: launchGoal.trim(), agent_type: 'custom' });
      setLaunchGoal(''); setLaunchName(''); setSpawning(false); load('tasks');
      alert('Tarea lanzada. Avanzá a la pestaña Tareas para seguir su estado.');
    } catch (e) { setError('Error al lanzar tarea'); }
    finally { setSpawning(false); }
  };

  const spawnSession = async () => {
    setSpawning(true); setNotice('');
    try {
      const res = await api.spawnAgentSession({ title: 'Agente persistente' });
      if (res?.ok && res.session) {
        const sid = res.session?.session?.id || res.session?.id;
        setNotice(`Sesión creada: ${sid || 'ok'}`);
        load('sessions');
      } else {
        setNotice(res?.error || 'Sesión creada');
        load('sessions');
      }
    } catch (e) { setError('Error al crear sesión persistente'); }
    finally { setSpawning(false); }
  };

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); setLiveDetail(null); return; }
    setExpanded(id);
    setLiveDetail(null);
    fetchLiveDetail(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">🤖 Agentes</h2>
          <p className="text-sm text-gray-400 mt-0.5">Sub-agentes reales de Hermes, tareas y sesiones persistentes.</p>
        </div>
        <div className="flex gap-1.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${tab === t.key
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg px-3 py-2 text-sm">{error}</div>}

      {loading ? <div className="text-center text-gray-400 py-8">Cargando…</div> : (
        <>
          {/* Nivel 1: Observabilidad */}
          {tab === 'live' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span>En vivo — se actualiza cada {LIVE_POLL_MS / 1000}s{updatedAt ? ` · ${updatedAt.toLocaleTimeString()}` : ''}</span>
              </div>
              {liveAgents.length === 0 ? (
                <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
                  No hay sub-agentes activos ahora. Se listan cuando el orquestador los dispara.
                </div>
              ) : liveAgents.map(a => {
                const isOpen = expanded === a.id;
                const shown = (isOpen && liveDetail && liveDetail.id === a.id) ? liveDetail : a;
                const transcript = shown.transcript_full || shown.transcript || [];
                return (
                <div key={a.id} className="bg-gray-800/40 border border-gray-700 rounded-xl">
                  <div onClick={() => toggleExpand(a.id)} className="flex flex-wrap items-center gap-3 p-3 cursor-pointer hover:bg-gray-800/60 transition">
                    <StatusBadge status={a.status} />
                    <span className="font-mono text-gray-200 text-sm">{a.id}</span>
                    <span className="text-[11px] text-gray-500">{a.model || ''}</span>
                    <span className="text-[11px] text-gray-500 ml-auto">{a.started || ''}</span>
                    <span className="text-xs text-gray-500">{a.task_count} tarea{a.task_count !== 1 ? 's' : ''}</span>
                  </div>
                  {a.last_text && !isOpen && (
                    <div className="px-3 pb-2 -mt-1">
                      <p className="text-[11px] text-gray-500 truncate">↳ {a.last_text}</p>
                    </div>
                  )}
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-1">
                      <p className="text-xs text-gray-400">{shown.last_text || transcript?.[transcript.length-1]?.text || ''}</p>
                      <div className="text-[11px] font-mono text-gray-500 max-h-64 overflow-y-auto bg-gray-900/60 rounded-lg p-2 space-y-0.5">
                        {transcript.length === 0 ? (
                          <div className="text-gray-600">Sin líneas de transcript todavía…</div>
                        ) : transcript.map((l, i) => (
                          <div key={i}><span className="text-gray-600">{l.time}</span> <span className="text-cyan-400">{l.role}</span> <span className="text-gray-400">{l.text}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );})}
            </div>
          )}

          {/* Nivel 2: Disparar tareas */}
          {tab === 'tasks' && (
            <div className="space-y-4">
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Lanzar sub-agente</h3>
                <div className="flex flex-col gap-2">
                  <input value={launchName} onChange={e => setLaunchName(e.target.value)} placeholder="Nombre (opcional)"
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                  <textarea value={launchGoal} onChange={e => setLaunchGoal(e.target.value)} placeholder="Objetivo del agente (autocontenido)…"
                    rows={3} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none" />
                  <button onClick={launchTask} disabled={spawning || !launchGoal.trim()}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                    {spawning ? 'Lanzando…' : '🚀 Lanzar sub-agente'}
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">Historial de tareas</div>
                {tasks.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">Sin tareas lanzadas aún.</div>
                ) : tasks.map(t => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 border-b border-gray-700/50">
                    <StatusBadge status={t.status} />
                    <span className="text-sm text-gray-200 font-medium">{t.name}</span>
                    <span className="text-[11px] text-gray-500">{t.agent_type}</span>
                    <span className="text-[11px] text-gray-500 ml-auto">{t.created_at?.slice(0, 16)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Nivel 3: Sesiones persistentes */}
          {tab === 'sessions' && (
            <div className="space-y-4">
              {notice && <div className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg px-3 py-2 text-sm">{notice}</div>}
              <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4 flex items-center justify-between gap-3">
                <p className="text-sm text-gray-300">Las sesiones persistentes quedan <span className="text-cyan-400">vivas entre turnos</span> (conservan historial y memoria). Son la base de agentes que "no mueren".</p>
                <button onClick={spawnSession} disabled={spawning}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg text-sm font-medium shrink-0 disabled:opacity-50">
                  {spawning ? 'Creando…' : '🧠 Crear sesión'}
                </button>
              </div>
              {sessions.length === 0 ? (
                <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
                  No hay sesiones persistentes activas.
                </div>
              ) : sessions.map((s, i) => {
                const sid = s.id || s.session_id;
                const open = onOpenSession && sid;
                return (
                <div key={i} onClick={() => open && onOpenSession(sid, s.title || 'Sesión')}
                  className={`bg-gray-800/40 border border-gray-700 rounded-xl p-3 flex flex-wrap items-center gap-3 ${open ? 'cursor-pointer hover:border-cyan-500/40 transition' : ''}`}
                  title={open ? 'Abrir en el chat' : ''}>
                  <span className={`text-sm font-medium ${open ? 'text-cyan-300' : 'text-gray-200'}`}>{s.title || s.session_id || s.id}</span>
                  <span className="text-[11px] text-gray-500 font-mono">{s.session_id || s.id}</span>
                  <StatusBadge status={s.state || 'running'} />
                  {open && <span className="text-[11px] text-cyan-400 ml-auto">Abrir en el chat ↗</span>}
                </div>
              );})}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AgentsPanel;
