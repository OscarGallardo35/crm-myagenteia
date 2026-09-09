import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const TABS = [
  { key: 'live', label: 'Sub-agentes vivos', icon: '🤖' },
  { key: 'tasks', label: 'Tareas', icon: '📋' },
  { key: 'sessions', label: 'Sesiones persistentes', icon: '🧠' },
];

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

const AgentsPanel = () => {
  const [tab, setTab] = useState('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Nivel 1
  const [liveAgents, setLiveAgents] = useState([]);
  const [expanded, setExpanded] = useState(null);

  // Nivel 2
  const [tasks, setTasks] = useState([]);
  const [launchGoal, setLaunchGoal] = useState('');
  const [launchName, setLaunchName] = useState('');
  const [spawning, setSpawning] = useState(false);

  // Nivel 3
  const [sessions, setSessions] = useState([]);

  const load = useCallback(async (t) => {
    setLoading(true); setError('');
    try {
      if (t === 'live') {
        const d = await api.getLiveAgents();
        setLiveAgents(d?.agents || []);
      } else if (t === 'tasks') {
        const d = await api.getAgentTasks();
        setTasks(d?.tasks || []);
      } else if (t === 'sessions') {
        const d = await api.getAgentSessions();
        setSessions(d?.sessions || []);
      }
    } catch (e) { setError('Error al cargar agentes'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

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
    setSpawning(true);
    try {
      await api.spawnAgentSession({ title: 'Agente persistente' });
      load('sessions');
    } catch (e) { setError('Error al crear sesión persistente'); }
    finally { setSpawning(false); }
  };

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try { await api.getLiveAgentDetail(id); } catch {}
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
              {liveAgents.length === 0 ? (
                <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 text-center text-gray-500 text-sm">
                  No hay sub-agentes activos ahora. Se listan cuando el orquestador los dispara.
                </div>
              ) : liveAgents.map(a => (
                <div key={a.id} className="bg-gray-800/40 border border-gray-700 rounded-xl">
                  <div onClick={() => toggleExpand(a.id)} className="flex flex-wrap items-center gap-3 p-3 cursor-pointer hover:bg-gray-800/60 transition">
                    <StatusBadge status={a.status} />
                    <span className="font-mono text-gray-200 text-sm">{a.id}</span>
                    <span className="text-[11px] text-gray-500">{a.model || ''}</span>
                    <span className="text-[11px] text-gray-500 ml-auto">{a.started || ''}</span>
                    <span className="text-xs text-gray-500">{a.task_count} tarea{a.task_count !== 1 ? 's' : ''}</span>
                  </div>
                  {expanded === a.id && (
                    <div className="px-3 pb-3 space-y-1">
                      <p className="text-xs text-gray-400">{a.last_text || a.transcript?.[a.transcript.length-1]?.text || ''}</p>
                      <div className="text-[11px] font-mono text-gray-500 max-h-64 overflow-y-auto bg-gray-900/60 rounded-lg p-2 space-y-0.5">
                        {(a.transcript || []).map((l, i) => (
                          <div key={i}><span className="text-gray-600">{l.time}</span> <span className="text-cyan-400">{l.role}</span> <span className="text-gray-400">{l.text}</span></div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
              ) : sessions.map((s, i) => (
                <div key={i} className="bg-gray-800/40 border border-gray-700 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-200 font-medium">{s.title || s.session_id || s.id}</span>
                  <span className="text-[11px] text-gray-500 font-mono">{s.session_id || s.id}</span>
                  <StatusBadge status={s.state || 'running'} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AgentsPanel;
