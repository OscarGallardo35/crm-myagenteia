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

  // Deriva nombre de archivo + extensión según el tipo
  const LANG_EXT = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', c: 'c', cpp: 'cpp', 'c++': 'cpp', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', bash: 'sh', shell: 'sh', sh: 'sh', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yml', xml: 'xml', css: 'css', html: 'html', jsx: 'jsx', tsx: 'tsx', markdown: 'md', md: 'md' };
  const extFor = (t, l) => {
    if (t === 'code' && l) return LANG_EXT[l.toLowerCase()] || l.replace(/[^a-z0-9]/gi, '') || 'txt';
    const map = {
      code: 'txt', mermaid: 'mmd', markdown: 'md', md: 'md',
      txt: 'txt', text: 'txt', html: 'html', svg: 'svg',
    };
    return map[t] || 'txt';
  };
  const mimeFor = (t) => {
    const map = { svg: 'image/svg+xml', html: 'text/html', markdown: 'text/markdown', md: 'text/markdown', mermaid: 'text/plain', code: 'text/plain', txt: 'text/plain' };
    return map[t] || 'text/plain';
  };

  const download = () => {
    try {
      const base = (title || '').replace(/\.[a-z0-9]+$/i, '') || 'artefacto';
      const safe = base.replace(/[^a-z0-9-_ ]/gi, '_').replace(/\s+/g, '_').slice(0, 60) || 'artefacto';
      const ext = extFor(type, lang);
      const filename = `${safe}.${ext}`;
      let blobUrl = null;
      try {
        const blob = new Blob([content], { type: mimeFor(type) + ';charset=utf-8' });
        blobUrl = URL.createObjectURL(blob);
      } catch (e) {
        // fallback: data URI si el blob falla
        blobUrl = 'data:' + mimeFor(type) + ';charset=utf-8,' + encodeURIComponent(content || '');
      }
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      // mantener el anchor en el DOM hasta que la descarga arranque
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
      }, 1500);
    } catch (e) { /* ignore */ }
  };

  const btnBase = 'flex items-center gap-1 text-[11px] text-gray-500 hover:text-cyan-400 transition px-1.5 py-0.5';

  const header = (
    <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 rounded-t-lg">
      <span className="text-[11px] font-medium text-gray-400 truncate">
        {title}{lang ? ` · ${lang}` : ''}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={download} className={btnBase} title="Descargar archivo">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Descargar
        </button>
        <button onClick={copy} className={btnBase} title="Copiar contenido">
          {copied ? '✓ Copiado' : '⧉ Copiar'}
        </button>
      </div>
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
