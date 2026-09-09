import React, { useMemo } from 'react';

// Mini renderizador de Markdown (sin dependencias externas) para las respuestas de Hermes.
// Cubre: títulos, código (bloques y inline), listas, bold, itálicas, links, blockquote.

const escapateHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const renderInline = (text) => {
  let t = escapateHtml(text);
  // code inline
  t = t.replace(/`([^`]+)`/g, '<code class="bg-gray-900 text-cyan-300 px-1 py-0.5 rounded text-[0.9em]">$1</code>');
  // bold
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  // italica
  t = t.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  // links
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cyan-400 underline hover:text-cyan-300">$1</a>');
  return t;
};

const MarkdownRenderer = ({ content }) => {
  const html = useMemo(() => {
    if (!content) return '<p class="text-gray-500">…</p>';
    // separar bloques de código
    const codeBlocks = [];
    const text = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const token = `\u0000CODE${codeBlocks.length}\u0000`;
      codeBlocks.push({ lang, code: code.replace(/\n$/, '') });
      return token;
    });

    const lines = text.split('\n');
    const out = [];
    let inList = false;
    let inQuote = false;

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (line.startsWith('\u0000CODE')) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (inQuote) { out.push('</blockquote>'); inQuote = false; }
        const idx = Number(line.replace(/\D/g, ''));
        const cb = codeBlocks[idx];
        out.push(
          `<pre class="bg-gray-950 border border-gray-700 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono text-green-300 whitespace-pre-wrap"><code>${escapateHtml(cb.code)}</code></pre>`
        );
        return;
      }

      // títulos
      const h = line.match(/^(#{1,6})\s+(.*)/);
      if (h) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (inQuote) { out.push('</blockquote>'); inQuote = false; }
        const level = Math.min(h[1].length, 4);
        const sizes = { 1: 'text-lg font-bold', 2: 'text-base font-semibold', 3: 'text-sm font-semibold', 4: 'text-sm font-medium' };
        out.push(`<h${level} class="${sizes[level] || 'text-sm font-medium'} text-white mt-2 mb-1">${renderInline(h[2])}</h${level}>`);
        return;
      }

      // listas
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul class="list-disc pl-5 my-1 space-y-0.5">'); inList = true; }
        out.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`);
        return;
      }
      if (/^\d+\.\s+/.test(line)) {
        if (!inList) { out.push('<ol class="list-decimal pl-5 my-1 space-y-0.5">'); inList = true; }
        out.push(`<li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`);
        return;
      }
      if (inList) { out.push('</ul>'); inList = false; }

      // blockquote
      if (/^>\s?/.test(line)) {
        if (!inQuote) { out.push('<blockquote class="border-l-4 border-cyan-500/50 pl-3 my-1 text-gray-300 italic">'); inQuote = true; }
        out.push(renderInline(line.replace(/^>\s?/, '')));
        return;
      }
      if (inQuote) { out.push('</blockquote>'); inQuote = false; }

      // separador
      if (/^(---+|\*\*\*+)$/.test(trimmed)) {
        out.push('<hr class="border-gray-700 my-2" />');
        return;
      }

      // párrafo (solo si hay contenido)
      if (trimmed) {
        out.push(`<p class="my-1">${renderInline(line)}</p>`);
      }
    });

    if (inList) out.push('</ul>');
    if (inQuote) out.push('</blockquote>');

    return out.join('\n');
  }, [content]);

  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
};

export default MarkdownRenderer;
