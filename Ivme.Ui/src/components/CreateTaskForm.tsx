import { useState } from 'react';
import { taskItemsApi } from '../services/api';
import ProtectedButton from './ProtectedButton';

interface CreateTaskFormProps {
  onCreated: () => void;
}

export default function CreateTaskForm({ onCreated }: CreateTaskFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    retryIntervalMinutes: 60,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await taskItemsApi.create({
        ...formData,
        status: 'Pending',
        retryDelayMinutes: 0,
        progress: 0,
      });
      setFormData({
        name: '',
        description: '',
        retryIntervalMinutes: 60,
      });
      setIsOpen(false);
      onCreated();
    } catch (err) {
      alert('Oluşturma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  if (!isOpen) {
    return (
      <ProtectedButton
        permission="pages.tasks.create"
        onClick={() => setIsOpen(true)}
        className="mb-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        fallback={null}
      >
        + Yeni Task Ekle
      </ProtectedButton>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b-2 border-gray-200 dark:border-gray-700 pb-2">Yeni Task Oluştur</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Task Adı"
          required
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Açıklama"
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
        />
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kaç Dakikada Bir Tekrar Çalışması Gerektiği:</span>
          <input
            type="number"
            value={formData.retryIntervalMinutes}
            onChange={(e) =>
              setFormData({ ...formData, retryIntervalMinutes: parseInt(e.target.value) || 60 })
            }
            min="1"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
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

