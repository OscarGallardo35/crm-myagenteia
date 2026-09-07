import React from 'react';

const ModelSelector = ({ onModelChange, value }) => {
  const models = [
    { id: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
    { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
    { id: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
    { id: 'gpt-4', label: 'GPT-4', provider: 'OpenAI' },
    { id: 'gpt-3-5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
    { id: 'deepseek-coder', label: 'DeepSeek Coder', provider: 'DeepSeek' },
    { id: 'deepseek-chat', label: 'DeepSeek Chat', provider: 'DeepSeek' },
  ];

  return (
    <div className="relative w-full">
      <label className="block text-sm font-medium text-gray-300 mb-1">Modelo</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onModelChange(e.target.value)}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
        >
          {models.map(model => (
            <option key={model.id} value={model.id}>
              {model.label} ({model.provider})
            </option>
          ))}
        </select>
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