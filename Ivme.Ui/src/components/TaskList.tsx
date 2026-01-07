import { useState, useEffect } from 'react';
import { taskItemsApi, groupTaskAssignmentsApi } from '../services/api';
import type { TaskItem } from '../services/api';
import TaskCard from './TaskCard';

interface TaskListProps {
  groupId: string;
}

export default function TaskList({ groupId }: TaskListProps) {
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTaskItems();
    const interval = setInterval(loadTaskItems, 2000); // Her 2 saniyede bir güncelle
    return () => clearInterval(interval);
  }, [groupId]);

  const loadTaskItems = async () => {
    try {
      const assignments = await groupTaskAssignmentsApi.getByGroup(groupId);
      const taskItemIds = assignments.map(a => a.taskItemId);
      if (taskItemIds.length === 0) {
        setTaskItems([]);
      } else {
        const allTaskItems = await taskItemsApi.getAll();
        const groupTaskItems = allTaskItems.filter(t => taskItemIds.includes(t.id));
        setTaskItems(groupTaskItems);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task itemlar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (loading && taskItems.length === 0) {
    return <div className="loading">Task itemlar yükleniyor...</div>;
  }

  return (
    <div className="task-list">
      {error && <div className="error">Hata: {error}</div>}
      {taskItems.length === 0 ? (
        <div className="no-tasks">Bu grupta henüz task item yok.</div>
      ) : (
        taskItems.map((taskItem) => (
          <TaskCard key={taskItem.id} task={taskItem} onUpdate={loadTaskItems} />
        ))
      )}
    </div>
  );
}

