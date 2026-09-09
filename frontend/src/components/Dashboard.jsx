import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

// Helpers de presentación
const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
const gb = (v) => (v == null ? '—' : `${v} GB`);

function barColor(v, mid = 70, high = 90) {
  if (v == null) return 'bg-gray-600';
  if (v >= high) return 'bg-red-500';
  if (v >= mid) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function semColor(ok) {
  return ok ? 'bg-emerald-500' : 'bg-red-500';
}

const Card = ({ title, children, className = '' }) => (
  <div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 ${className}`}>
    <h3 className="text-sm font-medium text-gray-400 mb-2">{title}</h3>
    {children}
  </div>
);

const Bar = ({ value, color }) => (
  <div className="w-full bg-gray-700 rounded-full h-2.5">
    <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${Math.min(value ?? 0, 100)}%` }}></div>
  </div>
);

const Stat = ({ label, value, sub, accent }) => (
  <div className="flex flex-col">
    <span className="text-lg font-bold text-white">{value}</span>
    <span className="text-xs text-gray-400">{label}</span>
    {sub && <span className="text-[11px] text-gray-500 mt-0.5">{sub}</span>}
  </div>
);

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  const loadStats = useCallback(async () => {
    try {
      const d = await api.getDashboardStats();
      setData(d);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      console.error('Error loading dashboard stats:', e);
      setError('No se pudo cargar el estado del sistema.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    intervalRef.current = setInterval(loadStats, 3000);
    return () => clearInterval(intervalRef.current);
  }, [loadStats]);

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Cargando panel del sistema...</div>;
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-2">No hay datos del sistema disponibles.</p>
        {error && <p className="text-gray-400 text-sm">{error}</p>}
        <button onClick={loadStats} className="mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-white text-sm">
          Reintentar
        </button>
      </div>
    );
  }

  const host = data.host || {};
  const ram = host.ram || {};
  const disk = host.disk || {};
  const load = host.load || [];
  const containers = data.containers || [];
  const domains = data.domains || [];
  const ds = data.domains_summary || {};
  const gateway = data.gateway || {};
  const business = data.business || {};
  const rateLimits = data.rateLimits || [];
  const alerts = data.alerts || [];
  const cores = host.cores || 1;

  // solo contenedores relevantes en una primera vista
  const keyContainers = containers.filter((c) =>
    /crm-|coolify|brightbean|n8n|coda-dind|redis|proxy/.test(c.name || '')
  ).slice(0, 12);

  // modelos rate limit top
  const topModels = rateLimits.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Encabezado: timestamp + refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white">Panel del Sistema</h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>LIVE · 3s</span>
          </span>
          <span>{lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es-AR')}` : ''}</span>
          <button onClick={loadStats} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white">
            Actualizar
          </button>
        </div>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
              a.level === 'risk' ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-yellow-900/30 border-yellow-700 text-yellow-300'
            }`}>
              <span>⚠️</span><span>{a.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* FILA 1 — VPS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="CPU · VPS">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold text-cyan-400">{pct(host.cpu_percent)}</span>
            <span className="text-[11px] text-gray-500">load {load.length ? load[0].toFixed(2) : '—'} / {cores} cores</span>
          </div>
          <Bar value={host.cpu_percent} color={barColor(host.cpu_percent, 70, 90)} />
        </Card>

        <Card title="RAM · VPS">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold text-pink-400">{pct(ram.percent)}</span>
            <span className="text-[11px] text-gray-500">{gb(ram.used_gb)} / {gb(ram.total_gb)} · swap {ram.swap_used_mb ?? '—'}MB</span>
          </div>
          <Bar value={ram.percent} color={barColor(ram.percent, 70, 90)} />
        </Card>

        <Card title="Disco · VPS">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-lg font-bold ${disk.percent >= 80 ? 'text-red-400' : 'text-white'}`}>{pct(disk.percent)}</span>
            <span className="text-[11px] text-gray-500">{gb(disk.used_gb)} / {gb(disk.total_gb)}</span>
          </div>
          <Bar value={disk.percent} color={barColor(disk.percent, 75, 88)} />
        </Card>

        <Card title="Uptime · Contenedores">
          <Stat label="Uptime" value={host.uptime_days != null ? `${host.uptime_days}d` : '—'} accent="white" />
          <div className="mt-2 text-xs text-gray-400">
            {containers.filter((c) => c.state === 'running').length} running ·{' '}
            {containers.filter((c) => c.state !== 'running').length} caídos
          </div>
        </Card>
      </div>

      {/* FILA 2 — Estado de sistemas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Gateway Hermes">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${semColor(gateway.state === 'running')}`}></span>
              <span className="text-white font-medium capitalize">{gateway.state || '—'}</span>
            </div>
            <span className="text-xs text-gray-400">{gateway.active_agents ?? 0} agentes activos</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(gateway.platforms || []).map((p) => (
              <span key={p} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">🟢 {p}</span>
            ))}
          </div>
        </Card>

        <Card title={`Túnel · Dominios (${ds.healthy ?? 0}/${ds.total ?? 0} sanos)`}>
          <div className="grid grid-cols-2 gap-2">
            {domains.slice(0, 12).map((d) => (
              <div key={d.hostname} className="flex items-center justify-between text-xs bg-gray-700/40 rounded px-2 py-1">
                <span className={`w-2 h-2 rounded-full ${semColor(d.healthy)}`}></span>
                <span className="text-gray-300 truncate">{d.hostname}</span>
                <span className="text-gray-500">{d.http || '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* FILA 3 — Contenedores clave */}
      <Card title="Contenedores">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {keyContainers.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-xs bg-gray-700/40 rounded px-2 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${semColor(c.state === 'running')}`}></span>
                <span className="truncate text-gray-200">{c.name}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500 flex-shrink-0">
                {c.state !== 'running' && <span className="text-red-400">{c.state}</span>}
                <span>{c.cpu || '—'}</span>
                <span>{c.mem?.split(' /')[0] || ''}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* FILA 4 — Modelos */}
      <Card title="Modelos · Estado real">
        {topModels.length === 0 ? (
          <p className="text-sm text-gray-400">Sin datos de uso de modelos todavía.</p>
        ) : (
          <div className="space-y-2">
            {topModels.map((m) => (
              <div key={m.model} className="flex items-center justify-between text-xs bg-gray-700/40 rounded px-2 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    m.free ? 'bg-emerald-900/40 text-emerald-300' : 'bg-blue-900/40 text-blue-300'
                  }`}>{m.free ? 'FREE' : 'PAGO'}</span>
                  <span className="truncate text-gray-200">{m.model}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={m.consecutive_failures > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    ✓{m.success_count}
                  </span>
                  <span className={m.consecutive_failures > 0 ? 'text-red-400' : 'text-gray-500'}>
                    ✗{m.failure_count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* FILA 5 — Negocio */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card title="Leads totales"><Stat label="CRM" value={business.leads_total ?? '—'} /></Card>
        <Card title="Leads hoy"><Stat label="últimas 24h" value={business.new_leads_24h ?? '—'} /></Card>
        <Card title="Conversaciones"><Stat label="activas 24h" value={business.conversations_active ?? '—'} /></Card>
        <Card title="Mensajes"><Stat label="últimas 24h" value={business.messages_24h ?? '—'} /></Card>
        <Card title="Posts progr."><Stat label="programados" value={business.posts_scheduled ?? '—'} /></Card>
        <Card title="Agentes"><Stat label={`${business.agent_tasks_running ?? 0} en ejecución`} value={business.agent_tasks_completed ?? '—'} sub="completados" /></Card>
      </div>

      {/* Footer informativo */}
      <p className="text-[11px] text-gray-600 text-center">
        Datos del VPS recolectados en el host cada 30s · fuente: hermes-host · {data.source}
      </p>
    </div>
  );
};

export default Dashboard;
