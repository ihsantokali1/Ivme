import { useState } from 'react';
import { taskGroupsApi } from '../services/api';
import type { TaskGroup } from '../services/api';

interface GroupEditFormProps {
  group: TaskGroup;
  onSave: () => void;
  onCancel: () => void;
}

export default function GroupEditForm({ group, onSave, onCancel }: GroupEditFormProps) {
  const [formData, setFormData] = useState({
    name: group.name,
    description: group.description,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await taskGroupsApi.update({
        ...group,
        name: formData.name,
        description: formData.description,
      });
      onSave();
    } catch (err) {
      alert('Güncelleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex justify-center items-center z-50">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Grup Düzenle</h3>
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
              Kaydet
            </button>
            <button type="button" onClick={onCancel} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors">
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

