import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const Dashboard = () => {
  const [stats, setStats] = useState({
    cpu: 0,
    ram: 0,
    rateLimits: {},
    agents: [],
    scheduledPosts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* CPU Widget */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-2">CPU Usage</h3>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-cyan-400">{stats.cpu}%</span>
          <div className="w-full bg-gray-700 rounded-full h-2.5 mt-1">
            <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${stats.cpu}%` }}></div>
          </div>
        </div>
      </div>

      {/* RAM Widget */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-2">RAM Usage</h3>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-pink-400">{stats.ram}%</span>
          <div className="w-full bg-gray-700 rounded-full h-2.5 mt-1">
            <div className="bg-pink-500 h-2.5 rounded-full" style={{ width: `${stats.ram}%` }}></div>
          </div>
        </div>
      </div>

      {/* Rate Limits Widget */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Rate Limits</h3>
        <div className="space-y-2">
          {Object.entries(stats.rateLimits).map(([model, limit]) => (
            <div key={model} className="flex items-center justify-between text-xs">
              <span className="text-gray-300">{model}</span>
              <span className="text-green-400">{limit}/min</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scheduled Posts Widget */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Posts Programados</h3>
        <div className="text-2xl font-bold text-green-400">{stats.scheduledPosts}</div>
      </div>
    </div>
  );
};

export default Dashboard;