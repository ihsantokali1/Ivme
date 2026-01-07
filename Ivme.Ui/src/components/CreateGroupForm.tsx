import { useState } from 'react';
import { taskGroupsApi } from '../services/api';
import type { TaskGroup } from '../services/api';

interface CreateGroupFormProps {
  onCreated: () => void;
}

export default function CreateGroupForm({ onCreated }: CreateGroupFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await taskGroupsApi.create(formData);
      setFormData({
        name: '',
        description: '',
      });
      setIsOpen(false);
      onCreated();
    } catch (err) {
      alert('Oluşturma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)} 
        className="mb-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
      >
        + Yeni Grup Oluştur
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b-2 border-gray-200 dark:border-gray-700 pb-2">Yeni Grup Oluştur</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Grup Adı"
          required
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Açıklama"
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
        />
        <div className="flex gap-2 justify-end">
          <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors">
            Oluştur
          </button>
          <button type="button" onClick={() => setIsOpen(false)} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors">
            İptal
          </button>
        </div>
      </form>
    </div>
  );
}

