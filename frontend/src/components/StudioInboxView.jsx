import React from 'react';

// Bandeja Studio — Fase 1 (deep-link).
//
// ¿Qué es? El "chat" de BrightBean Studio (studio.mercadodigital.pro) es su
// Social Inbox: una bandeja unificada de DMs/comentarios/menciones de las redes.
// El inbox real vive en BrightBean (Django server-rendered) y NO puede
// embeberse por iframe: BrightBean envía `X-Frame-Options: DENY` y su CSP no
// permite `frame-ancestors`. Además su auth es cookie de sesión propia (no SSO
// con el CRM).
//
// Fase 1 = acceso directo (deep-link) en pestaña nueva, pre-scopeado al
// workspace. Riesgo cero, sin tocar headers ni auth de BrightBean.
//
// Fase 2 (pendiente) = traer los hilos al CRM de forma nativa: agregar un router
// de Inbox a la Agent API de BrightBean (/api/v1) y proxear desde el backend del
// CRM, renderizando el hilo en React.
//
// WORKSPACE: UUID del workspace de BrightBean que contiene la bandeja.
// Configurable por env en build (VITE_STUDIO_WORKSPACE_ID) con fallback.
const BB_BASE = 'https://studio.mercadodigital.pro';
const BB_WORKSPACE_ID =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_STUDIO_WORKSPACE_ID) ||
  '0478660e-acd9-4128-9485-c77b240b2c89';

const INBOX_URL = `${BB_BASE}/workspace/${BB_WORKSPACE_ID}/inbox/`;

export default function StudioInboxView() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-lg">
        <div className="text-5xl mb-4">🗨️</div>
        <h2 className="text-2xl font-semibold text-white mb-2">Bandeja Studio</h2>
        <p className="text-gray-400 mb-6 text-sm leading-relaxed">
          El chat de <span className="text-gray-200">BrightBean Studio</span> es su Social Inbox:
          una bandeja unificada de mensajes directos, comentarios y menciones de todas las redes.
          Vive en la aplicación de Studio y se abre en una pestaña nueva.
        </p>
        <a
          href={INBOX_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors"
        >
          Abrir Bandeja Studio ↗
        </a>
        <p className="text-gray-600 text-xs mt-6">
          Se abre en <span className="font-mono">studio.mercadodigital.pro</span> (pestaña nueva).
          La conexión es directa con BrightBean; tu sesión de Studio es independiente de la del CRM.
        </p>
      </div>
    </div>
  );
}
