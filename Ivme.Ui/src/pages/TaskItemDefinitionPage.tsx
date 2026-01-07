import { useState, useEffect } from 'react';
import { taskItemsApi, groupTaskAssignmentsApi } from '../services/api';
import type { TaskItem } from '../services/api';
import CreateTaskForm from '../components/CreateTaskForm';
import TaskItemEditForm from '../components/TaskItemEditForm';
import { sortAllTasksByPrerequisites } from '../utils/taskSorting';
import ProtectedButton from '../components/ProtectedButton';
import { useAuth } from '../contexts/AuthContext';

export default function TaskItemDefinitionPage() {
  const { user } = useAuth();
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [editingTaskItem, setEditingTaskItem] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [taskItemsData, assignmentsData] = await Promise.all([
        taskItemsApi.getAll(),
        groupTaskAssignmentsApi.getAll().catch(() => []) // Hata olsa bile devam et
      ]);
      setTaskItems(taskItemsData);
      setAllAssignments(assignmentsData);
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;
  }

  return (
    <div className="py-4">
      <div className="grid grid-cols-1 gap-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <CreateTaskForm onCreated={loadData} />
          <div className="mt-6 space-y-4">
            {sortAllTasksByPrerequisites(taskItems, allAssignments).map((taskItem) => (
              <div key={taskItem.id} className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{taskItem.name}</h4>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-2">{taskItem.description}</p>
                <div className="text-sm text-gray-500 dark:text-gray-500 mb-3">
                  <span>Tekrar Çalışma Aralığı: {taskItem.retryIntervalMinutes} dk</span>
                </div>
                <div className="flex gap-2">
                  <ProtectedButton
                    permission="pages.tasks.update"
                    onClick={() => setEditingTaskItem(taskItem)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Düzenle
                  </ProtectedButton>
                  <ProtectedButton
                    permission="pages.tasks.delete"
                    onClick={() => handleDeleteTaskItem(taskItem.id)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Sil
                  </ProtectedButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingTaskItem && (
        <TaskItemEditForm
          taskItem={editingTaskItem}
          onSave={() => {
            setEditingTaskItem(null);
            loadData();
          }}
          onCancel={() => setEditingTaskItem(null)}
        />
      )}
    </div>
  );

  async function handleDeleteTaskItem(taskItemId: string) {
    if (!confirm('Bu task itemı silmek istediğinize emin misiniz?')) {
      return;
    }
    try {
      await taskItemsApi.delete(taskItemId);
      loadData();
    } catch (err) {
      alert('Silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  }
}

