import React, { useState } from 'react';
import { api } from '../lib/api';

const LeadsBoard = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggingLeadId, setDraggingLeadId] = useState(null);

  const statuses = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const data = await api.getLeads();
      setLeads(data);
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (leadId) => {
    setDraggingLeadId(leadId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (newStatus) => {
    if (!draggingLeadId) return;
    try {
      await api.updateLeadStatus(draggingLeadId, newStatus);
      setDraggingLeadId(null);
      loadLeads(); // Refresh leads
    } catch (error) {
      console.error('Error updating lead status:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando leads...</div>;
  }

  // Group leads by status
  const leadsByStatus = statuses.reduce((acc, status) => {
    acc[status] = leads.filter(lead => lead.status === status);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">Pipeline de Leads</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {statuses.map(status => (
          <div
            key={status}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700 min-h-[200px] droptarget"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(status)}
          >
            <h3 className="text-sm font-medium text-gray-300 mb-3 capitalize">
              {status}
            </h3>
            <div className="space-y-2">
              {leadsByStatus[status].map(lead => (
                <div
                  key={lead.id}
                  draggable={true}
                  onDragStart={() => handleDragStart(lead.id)}
                  className="bg-gray-700 rounded-lg p-3 cursor-grab"
                >
                  <h4 className="font-medium text-white">{lead.name}</h4>
                  <p className="text-xs text-gray-400">{lead.company || ''}</p>
                  <p className="text-xs text-gray-400">{lead.source || ''}</p>
                </div>
              ))}
              {leadsByStatus[status].length === 0 && (
                <p className="text-xs text-gray-500 text-center italic">Sin leads</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeadsBoard;