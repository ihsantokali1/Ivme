import { useState, useEffect } from 'react';
import { flowItemsApi } from '../services/api';
import type { FlowItem } from '../services/api';
import CreateFlowForm from '../components/CreateFlowForm';
import FlowEditForm from '../components/FlowEditForm';
import ProtectedButton from '../components/ProtectedButton';
import { useAuth } from '../contexts/AuthContext';

export default function FlowDefinitionPage() {
  const { user } = useAuth();
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [editingFlow, setEditingFlow] = useState<FlowItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const flowsData = await flowItemsApi.getAll();
      setFlows(flowsData);
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
          {user?.role === 'Admin' && <CreateFlowForm onCreated={loadData} />}
          <div className="mt-6 space-y-4">
            {flows.map((flow) => (
              <div key={flow.id} className="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{flow.name}</h4>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-3">{flow.description}</p>
                <div className="flex gap-2">
                  <ProtectedButton
                    permission="pages.flow.update"
                    onClick={() => setEditingFlow(flow)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Düzenle
                  </ProtectedButton>
                  <ProtectedButton
                    permission="pages.flow.delete"
                    onClick={() => handleDeleteFlow(flow.id)}
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

      {editingFlow && (
        <FlowEditForm
          flow={editingFlow}
          onSave={() => {
            setEditingFlow(null);
            loadData();
          }}
          onCancel={() => setEditingFlow(null)}
        />
      )}
    </div>
  );

  async function handleDeleteFlow(flowId: string) {
    if (!confirm('Bu akışı silmek istediğinize emin misiniz?')) {
      return;
    }
    try {
      await flowItemsApi.delete(flowId);
      loadData();
    } catch (err) {
      alert('Silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  }
}
