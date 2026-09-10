import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const STATUS_META = {
  scheduled: { label: 'Programado', cls: 'bg-green-500/20 text-green-400' },
  draft: { label: 'Borrador', cls: 'bg-yellow-500/20 text-yellow-400' },
  posted: { label: 'Publicado', cls: 'bg-blue-500/20 text-blue-400' },
  published: { label: 'Publicado', cls: 'bg-blue-500/20 text-blue-400' },
  failed: { label: 'Fallido', cls: 'bg-red-500/20 text-red-400' },
};

const statusMeta = (status) =>
  STATUS_META[status] || { label: status || '—', cls: 'bg-gray-500/20 text-gray-300' };

const PostingCalendar = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const data = await api.getScheduledPosts();
      setPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading scheduled posts:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando calendario...</div>;
  }

  // Agrupar por fecha (scheduled_at viene como ISO string)
  const postsByDate = posts.reduce((acc, post) => {
    const date = post.scheduled_at?.split('T')[0] || 'unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  const sortedDates = Object.keys(postsByDate).sort();

  const TH = ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
      {children}
    </th>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">Calendario Editorial</h2>
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-900">
              <tr>
                <TH>Fecha</TH>
                <TH>Hora</TH>
                <TH>Plataforma</TH>
                <TH>Origen</TH>
                <TH>Contenido</TH>
                <TH>Estado</TH>
                <TH>Acción</TH>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {sortedDates.length === 0 ? (
                <tr>
                  <td className="px-6 py-4 text-center text-gray-500" colSpan="7">
                    No hay posts programados
                  </td>
                </tr>
              ) : (
                sortedDates.flatMap((date) => {
                  const datePosts = postsByDate[date];
                  return datePosts.map((post, index) => {
                    const meta = statusMeta(post.status);
                    return (
                      <tr key={`${date}-${index}`} className="hover:bg-gray-700">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                          {index === 0 ? new Date(date).toLocaleDateString('es-ES') : ''}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                          {post.scheduled_at
                            ? new Date(post.scheduled_at).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                          {post.platform || ''}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              post.source === 'bb'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-cyan-500/20 text-cyan-300'
                            }`}
                          >
                            {post.source === 'bb' ? 'BrightBean' : 'CRM'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-300 max-w-xs truncate" title={post.title || ''}>
                          {post.title || ''}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                          <button className="text-cyan-400 hover:text-cyan-300">Ver</button>
                        </td>
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PostingCalendar;
