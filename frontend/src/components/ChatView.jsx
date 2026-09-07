import React, { useState, useEffect } from 'react';
import ModelSelector from './ModelSelector';
import { api } from '../lib/api';

const ChatView = () => {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState('claude-3-opus');
  const [useMemory, setUseMemory] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const data = await api.getChats();
      setChats(data);
      if (data.length > 0 && !selectedChatId) {
        setSelectedChatId(data[0].id);
        loadMessages(data[0].id);
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  const loadMessages = async (chatId) => {
    try {
      setLoading(true);
      const data = await api.getChatMessages(chatId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedChatId) return;

    setLoading(true);
    try {
      // In a real app, we would send the message and then update the list
      // For now, we just clear the input and reload messages
      await api.sendMessage(selectedChatId, input);
      setInput('');
      loadMessages(selectedChatId);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold">Conversaciones</h2>
        <div className="flex items-center space-x-3">
          <ModelSelector value={model} onModelChange={setModel} />
          <label className="flex items-center space-x-2 text-gray-300">
            <input
              type="checkbox"
              checked={useMemory}
              onChange={(e) => setUseMemory(e.target.checked)}
              className="h-4 w-4 text-cyan-400"
            />
            Usar memoria de chat anterior
          </label>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Chat list */}
          <div className="w-64 border-r border-gray-800 overflow-y-auto">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => {
                  setSelectedChatId(chat.id);
                  loadMessages(chat.id);
                }}
                className={`cursor-pointer p-3 hover:bg-gray-800 ${selectedChatId === chat.id ? 'bg-gray-800' : ''}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center text-white text-sm">
                    {chat.title?.charAt(0) || 'C'}
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{chat.title || 'Sin título'}</h3>
                    <p className="text-xs text-gray-400">{chat.updated_at || ''}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_user ? 'justify-end' : 'justify-start'} max-w-[80%]`}>
                  <div className={`${msg.is_user ? 'bg-cyan-500/20 text-cyan-200' : 'bg-gray-800/50 text-gray-100'} rounded-lg p-3 max-w-xs break-words`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && <div className="text-center text-gray-400">Cargando...</div>}
            </div>
            <div className="border-t border-gray-800 p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim() || !selectedChatId}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-blue-500 text-white rounded-lg hover:from-cyan-300 hover:to-blue-400 transition"
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;