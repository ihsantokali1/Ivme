import { useState } from 'react';
import { taskItemsApi } from '../services/api';
import type { TaskItem } from '../services/api';

interface TaskItemEditFormProps {
  taskItem: TaskItem;
  onSave: () => void;
  onCancel: () => void;
}

export default function TaskItemEditForm({
  taskItem,
  onSave,
  onCancel,
}: TaskItemEditFormProps) {
  const [formData, setFormData] = useState({
    name: taskItem.name,
    description: taskItem.description,
    retryIntervalMinutes: taskItem.retryIntervalMinutes,
    storedProcedureDatabase: taskItem.storedProcedureDatabase || '',
    storedProcedureSchema: taskItem.storedProcedureSchema || 'dbo',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await taskItemsApi.update({
        ...taskItem,
        name: formData.name,
        description: formData.description,
        retryIntervalMinutes: formData.retryIntervalMinutes,
        storedProcedureDatabase: formData.storedProcedureDatabase,
        storedProcedureSchema: formData.storedProcedureSchema,
      });
      onSave();
    } catch (err) {
      alert('Güncelleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex justify-center items-center z-50">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Task Item Düzenle</h3>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Veritabanı:</span>
              <input
                type="text"
                value={formData.storedProcedureDatabase}
                onChange={(e) => setFormData({ ...formData, storedProcedureDatabase: e.target.value })}
                placeholder="Örn: IvmeDB"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Şema:</span>
              <input
                type="text"
                value={formData.storedProcedureSchema}
                onChange={(e) => setFormData({ ...formData, storedProcedureSchema: e.target.value })}
                placeholder="Örn: dbo"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
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

