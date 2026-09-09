import React, { useEffect, useRef, useState } from 'react';

// Tarjeta de artefacto tipo Claude (code / mermaid / markdown / txt / html)
function ArtifactCard({ artifact }) {
  const [copied, setCopied] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState(null);
  const [mermaidErr, setMermaidErr] = useState(null);
  const [mermaidLoading, setMermaidLoading] = useState(false);
  const mermaidRef = useRef(null);
  const { type, title, content, lang } = artifact;

  // Renderizar Mermaid on-demand
  useEffect(() => {
    if (type !== 'mermaid' || !content) return;
    let cancelled = false;
    setMermaidLoading(true);
    setMermaidErr(null);
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        if (cancelled) return;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        let svg = '';
        try {
          svg = await mermaid.render('a' + Math.random().toString(36).slice(2, 8), content);
        } catch (e) {
          // fallback: render directo
          const el = document.createElement('div');
          el.textContent = content;
          svg = await mermaid.render('a' + Math.random().toString(36).slice(2, 8), content);
        }
        svg = typeof svg === 'object' && svg.svg ? svg.svg : String(svg);
        if (!cancelled) setMermaidSvg(svg);
      } catch (e) {
        if (!cancelled) setMermaidErr(String(e?.message || e));
      } finally {
        if (!cancelled) setMermaidLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [type, content]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* ignore */ }
  };

  const header = (
    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 rounded-t-lg">
      <span className="text-[11px] font-medium text-gray-400 truncate">
        {title}{lang ? ` · ${lang}` : ''}
      </span>
      <button
        onClick={copy}
        className="text-[11px] text-gray-500 hover:text-cyan-400 transition px-1 py-0.5"
      >
        {copied ? '✓ Copiado' : '⧉ Copiar'}
      </button>
    </div>
  );

  return (
    <div className="mt-1.5 rounded-lg border border-gray-700/70 overflow-hidden bg-[#0d1117]">
      {header}
      {type === 'mermaid' ? (
        <div className="p-3 overflow-auto" style={{ maxHeight: 380 }}>
          {mermaidLoading && <div className="text-xs text-gray-500">Generando diagrama…</div>}
          {mermaidErr && (
            <div>
              <div className="text-[11px] text-amber-400 mb-1">No se pudo renderizar el diagrama</div>
              <pre className="text-[11px] text-gray-400 whitespace-pre-wrap font-mono">{content}</pre>
            </div>
          )}
          {mermaidSvg && (
            <div
              className="flex justify-center"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              ref={mermaidRef}
            />
          )}
        </div>
      ) : type === 'markdown' ? (
        <div className="p-3 text-xs text-gray-300 whitespace-pre-wrap font-sans" style={{ wordBreak: 'break-word' }}>
          {content}
        </div>
      ) : (
        <pre className="p-3 text-[11.5px] leading-relaxed text-gray-200 font-mono whitespace-pre overflow-auto" style={{ maxHeight: 380 }}>{content}</pre>
      )}
    </div>
  );
}

export default ArtifactCard;
