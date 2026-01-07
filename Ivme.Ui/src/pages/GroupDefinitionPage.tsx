import { useState, useEffect } from 'react';
import { taskGroupsApi } from '../services/api';
import type { TaskGroup } from '../services/api';
import CreateGroupForm from '../components/CreateGroupForm';
import GroupEditForm from '../components/GroupEditForm';
import ProtectedButton from '../components/ProtectedButton';
import { useAuth } from '../contexts/AuthContext';

export default function GroupDefinitionPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [editingGroup, setEditingGroup] = useState<TaskGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const groupsData = await taskGroupsApi.getAll();
      setGroups(groupsData);
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
          {user?.role === 'Admin' && <CreateGroupForm onCreated={loadData} />}
          <div className="mt-6 space-y-4">
            {groups.map((group) => (
              <div key={group.id} className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{group.name}</h4>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-3">{group.description}</p>
                <div className="flex gap-2">
                  <ProtectedButton
                    permission="pages.groups.update"
                    onClick={() => setEditingGroup(group)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Düzenle
                  </ProtectedButton>
                  <ProtectedButton
                    permission="pages.groups.delete"
                    onClick={() => handleDeleteGroup(group.id)}
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

      {editingGroup && (
        <GroupEditForm
          group={editingGroup}
          onSave={() => {
            setEditingGroup(null);
            loadData();
          }}
          onCancel={() => setEditingGroup(null)}
        />
      )}
    </div>
  );

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Bu grubu silmek istediğinize emin misiniz?')) {
      return;
    }
    try {
      await taskGroupsApi.delete(groupId);
      loadData();
    } catch (err) {
      alert('Silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  }
}

