import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

// Fallback offline: fleet real de Hermes
const FALLBACK_MODELS = [
  { id: 'deepseek/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash', provider: 'DeepSeek' },
  { id: 'meituan/longcat-2.0:free', label: 'LongCat 2.0', provider: 'Nous' },
  { id: 'poolside/laguna-s-2.1:free', label: 'Laguna-S 2.1', provider: 'Nous' },
  { id: 'poolside/laguna-xs-2.1:free', label: 'Laguna-XS 2.1', provider: 'Nous' },
  { id: 'inclusionai/ling-3.0-flash-fin:free', label: 'Ling 3.0 Flash', provider: 'OpenRouter' },
  { id: 'minimax/minimax-m3:free', label: 'MiniMax M3', provider: 'OpenRouter' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', provider: 'OpenRouter' },
];

function labelFor(m) {
  if (m.label) return m.label;
  const id = m.id || m.model || m;
  return String(id).split('/').pop().replace(':free', '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function idFor(m) {
  return m.id || m.model || String(m);
}

const ModelSelector = ({ value, onModelChange }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHermesModels()
      .then((data) => {
        if (data && data.ok && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        } else {
          setModels(FALLBACK_MODELS);
        }
      })
      .catch(() => setModels(FALLBACK_MODELS))
      .finally(() => setLoading(false));
  }, []);

  const options = models.length > 0 ? models : FALLBACK_MODELS;
  const current = value || idFor(options[0]);

  // Evitar provider duplicado: si el label ya contiene el provider, no lo repetir
  const labelFull = (m) => {
    const p = m.provider || 'hermes';
    const l = labelFor(m);
    return l.toLowerCase().includes(p.toLowerCase()) ? l : `${l} (${p})`;
  };

  return (
    <div className="relative w-full min-w-[180px]">
      <label className="block text-sm font-medium text-gray-300 mb-1">Modelo (Hermes)</label>
      <div className="relative">
        <select
          value={current}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent appearance-none truncate"
        >
          <option value="" disabled>Seleccionar modelo…</option>
          {options.map((m) => (
            <option key={idFor(m)} value={idFor(m)} title={idFor(m)}>
              {labelFull(m)}
            </option>
          ))}
        </select>
        {loading && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-gray-500">…</span>}
        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ModelSelector;
