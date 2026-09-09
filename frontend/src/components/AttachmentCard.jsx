// AttachmentCard: visor de adjuntos multimedia (audio, documento, imagen)
export default function AttachmentCard({ att }) {
  const type = att.type || '';

  if (type === 'audio') {
    return (
      <div className="flex items-center gap-2 my-1 p-2 rounded-lg bg-gray-800/60 border border-gray-700/50">
        <span className="text-lg">🎵</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate">{att.name}</p>
          <audio controls src={att.url} className="w-full h-8 mt-1" preload="metadata">
            Tu navegador no soporta audio.
          </audio>
        </div>
      </div>
    );
  }

  if (type === 'document') {
    const sizeKb = att.size ? `${(att.size / 1024).toFixed(1)} KB` : '';
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer"
         className="flex items-center gap-2 my-1 p-2 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:border-cyan-500/40 transition">
        <span className="text-lg">📄</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 truncate">{att.name}</p>
          {sizeKb && <p className="text-[11px] text-gray-500">{sizeKb}</p>}
        </div>
        <span className="text-xs text-cyan-400">Abrir ↗</span>
      </a>
    );
  }

  if (type === 'image') {
    const src = att.thumbnail || att.url;
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer"
         className="inline-block my-1 rounded-lg overflow-hidden border border-gray-700/50 hover:border-cyan-500/40 transition max-w-[200px]">
        <img src={src} alt={att.name} className="w-full h-auto object-cover" loading="lazy" />
      </a>
    );
  }

  return null;
}
