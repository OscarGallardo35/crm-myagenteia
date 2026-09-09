import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

// 🔒 Apartado Seguridad del CRM
// Detecta intentos de login fallidos, bloqueo camuflado (3 fallos -> misma respuesta
// pero nunca autentica), y eventos SSH del host.

const TABS = [
  { key: 'overview', label: 'Resumen', icon: '📊' },
  { key: 'attempts', label: 'Intentos', icon: '🚪' },
  { key: 'blocks', label: 'IPs bloqueadas', icon: '⛔' },
  { key: 'ssh', label: 'SSH', icon: '🔑' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function StatusBadge({ status }) {
  const map = {
    blocked: 'text-red-400 bg-red-500/10 border-red-500/30',
    quiet: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${map[status] || map.quiet}`}>
      {status === 'blocked' ? '⛔ Bloqueada' : '● Quiet'}
    </span>
  );
}

function ModeTag({ mode }) {
  const map = { auto: 'auto', manual: '👤 manual', ssh: '🔑 ssh' };
  return <span className="text-[11px] text-gray-500">{map[mode] || mode}</span>;
}

export default function SecurityPanel() {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [ssh, setSsh] = useState(null);
  const [acting, setActing] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [s, a, b, h] = await Promise.all([
        api.getSecuritySummary(), api.getSecurityAttempts(150),
        api.getSecurityBlocks(), api.getSecuritySsh(150),
      ]);
      if (s && s.ok) setSummary(s);
      if (a && a.ok) setAttempts(a.attempts || []);
      if (b && b.ok) setBlocks(b.blocks || []);
      if (h && h.ok) setSsh(h);
    } catch (e) {
      setError('Error al cargar datos de seguridad');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const manualBlock = async (ip) => {
    if (!ip || !window.confirm(`¿Bloquear manualmente ${ip}?`)) return;
    setActing('block');
    try { await api.securityBlockIp(ip); await loadAll(); } catch { setError('No se pudo bloquear'); }
    setActing('');
  };

  const unblock = async (ip) => {
    if (!window.confirm(`¿Desbloquear ${ip}?`)) return;
    setActing('unblock');
    try { await api.securityUnblockIp(ip); await loadAll(); } catch { setError('No se pudo desbloquear'); }
    setActing('');
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">🔒 Seguridad</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Detección de intentos de login y de conexión SSH. Tras {summary?.threshold ?? 3} intentos fallidos, la IP se
            bloquea de forma <span className="text-cyan-400">silenciosa</span> (sigue mostrando "credenciales inválidas" pero nunca autentica).
          </p>
        </div>
        <button onClick={loadAll} disabled={loading}
          className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 disabled:opacity-50">
          {loading ? 'Cargando…' : '↻ Refrescar'}
        </button>
      </div>

      {error && <div className="mb-3 bg-red-500/15 text-red-300 border border-red-500/30 rounded-lg px-3 py-2 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${tab === t.key
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'}`}>
            <span className="mr-1">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* RESUMEN */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Metric label="Intentos fallidos (1h)" value={summary?.login_attempts_1h ?? '—'} warn={summary?.login_attempts_1h > 0} />
          <Metric label="Intentos fallidos (24h)" value={summary?.login_attempts_24h ?? '—'} warn={summary?.login_attempts_24h > 0} />
          <Metric label="Logins exitosos (1h)" value={summary?.login_success_1h ?? '—'} />
          <Metric label="IPs bloqueadas" value={summary?.blocked_ips ?? '—'} warn={summary?.blocked_ips > 0} />
          <Metric label="IPs únicas atacando (24h)" value={summary?.unique_ips_24h ?? '—'} warn={summary?.unique_ips_24h > 0} />
          <Metric
            label="Intentos SSH detectados"
            value={ssh ? (ssh.events?.length ?? 0) : '—'}
            warn={(ssh?.events?.length ?? 0) > 0}
          />
        </div>
      )}

      {/* INTENTOS */}
      {tab === 'attempts' && (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">Intentos de login registrados</div>
          <div className="max-h-[60vh] overflow-y-auto">
            {attempts.length === 0 ? <Empty text="Todavía no hay intentos registrados." /> : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-800 text-gray-400 text-left">
                  <tr>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Resultado</th>
                    <th className="px-3 py-2">Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map(a => (
                    <tr key={a.id} className="border-t border-gray-700/60">
                      <td className="px-3 py-2 font-mono text-gray-300">{a.ip}</td>
                      <td className="px-3 py-2 text-gray-300">{a.email || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${a.success
                          ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                          {a.success ? 'Éxito' : 'Fallido'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-400">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* BLOQUEOS */}
      {tab === 'blocks' && (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">
            IPs con bloqueo (detalle de fallos)
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {blocks.length === 0 ? <Empty text="No hay IPs bloqueadas." /> : (
              <div className="space-y-2 p-3">
                {blocks.map(b => (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                    <span className="font-mono text-gray-200">{b.ip}</span>
                    <StatusBadge status={b.status} />
                    <ModeTag mode={b.mode} />
                    <span className="text-[11px] text-gray-500">{b.fail_count} fallos</span>
                    <span className="text-[11px] text-gray-500 ml-auto">último: {fmtDate(b.last_attempt_at)}</span>
                    {b.mode === 'manual' ? (
                      <button onClick={() => unblock(b.ip)} disabled={!!acting}
                        className="text-[11px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50">
                        Desbloquear
                      </button>
                    ) : (
                      <>
                        <button onClick={() => unblock(b.ip)} disabled={!!acting}
                          className="text-[11px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50">
                          Desbloquear
                        </button>
                        <button onClick={() => manualBlock(b.ip)} disabled={!!acting}
                          className="text-[11px] px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50">
                          👤 Fijar manual
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SSH */}
      {tab === 'ssh' && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300">
              Log accesible: {ssh?.log_available ? '✅' : '❌'}
            </span>
            <span className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300">
              Auto-bloqueos SSH: {ssh?.blocked_ssh ?? 0}
            </span>
          </div>
          <div className="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">
              Intentos SSH recientes (auth.log / fail2ban)
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {!ssh?.log_available ? <Empty text="auth.log no accesible desde el contenedor." /> :
               (ssh.events?.length === 0 ? <Empty text="Sin intentos SSH detectados en el período." /> : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-800 text-gray-400 text-left">
                    <tr><th className="px-3 py-2">IP</th><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Hora</th></tr>
                  </thead>
                  <tbody>
                    {(ssh.events || []).map((e, i) => (
                      <tr key={i} className="border-t border-gray-700/60">
                        <td className="px-3 py-2 font-mono text-gray-300">{e.ip}</td>
                        <td className="px-3 py-2 text-gray-300">{e.username}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${e.event_type === 'failed_password'
                            ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{e.event_type}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{fmtDate(e.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, warn }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${warn ? 'bg-red-500/10 border-red-500/30' : 'bg-gray-800/40 border-gray-700'}`}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${warn ? 'text-red-400' : 'text-cyan-300'}`}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div className="px-4 py-8 text-center text-gray-500 text-sm">{text}</div>;
}
