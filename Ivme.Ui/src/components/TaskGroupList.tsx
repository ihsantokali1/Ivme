import { useState, useEffect } from 'react';
import { taskGroupsApi } from '../services/api';
import type { TaskGroup } from '../services/api';
import TaskGroupCard from './TaskGroupCard';
import CreateGroupForm from './CreateGroupForm';

export default function TaskGroupList() {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const data = await taskGroupsApi.getAll();
      setGroups(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gruplar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Yükleniyor...</div>;
  }

  if (error) {
    return <div className="error">Hata: {error}</div>;
  }

  return (
    <div className="task-group-list">
      <h2>Task Grupları</h2>
      <CreateGroupForm onCreated={loadGroups} />
      <div className="groups-grid">
        {groups.map((group) => (
          <TaskGroupCard key={group.id} group={group} onUpdate={loadGroups} />
        ))}
      </div>
    </div>
  );
}

