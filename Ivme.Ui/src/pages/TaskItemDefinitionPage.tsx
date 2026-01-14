import { useState, useEffect } from 'react';
import { taskItemsApi, groupTaskAssignmentsApi } from '../services/api';
import type { TaskItem, TaskTableDependency } from '../services/api';
import CreateTaskForm from '../components/CreateTaskForm';
import TaskItemEditForm from '../components/TaskItemEditForm';
import { sortAllTasksByPrerequisites } from '../utils/taskSorting';
import ProtectedButton from '../components/ProtectedButton';

export default function TaskItemDefinitionPage() {
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [tableDependencies, setTableDependencies] = useState<TaskTableDependency[]>([]);
  const [editingTaskItem, setEditingTaskItem] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'report'>('list');

  // Filtreleme state'leri (Task Listesi)
  const [filters, setFilters] = useState({
    name: '',
    description: '',
    database: '',
    schema: ''
  });

  // Filtreleme state'leri (Rapor)
  const [reportFilters, setReportFilters] = useState({
    database: '',
    schema: '',
    procedure: '',
    table: '',
    usage: ''
  });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'list') {
        const [taskItemsData, assignmentsData] = await Promise.all([
          taskItemsApi.getAll(),
          groupTaskAssignmentsApi.getAll().catch(() => [])
        ]);
        setTaskItems(taskItemsData);
        setAllAssignments(assignmentsData);
      } else {
        const deps = await taskItemsApi.getTableDependencies();
        setTableDependencies(deps);
      }
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = sortAllTasksByPrerequisites(taskItems, allAssignments).filter(task => {
    return (
      task.name.toLowerCase().includes(filters.name.toLowerCase()) &&
      (task.description || '').toLowerCase().includes(filters.description.toLowerCase()) &&
      (task.storedProcedureDatabase || '').toLowerCase().includes(filters.database.toLowerCase()) &&
      (task.storedProcedureSchema || '').toLowerCase().includes(filters.schema.toLowerCase())
    );
  });

  const filteredReport = tableDependencies.filter(dep => {
    return (
      dep.databaseName.toLowerCase().includes(reportFilters.database.toLowerCase()) &&
      dep.schemaName.toLowerCase().includes(reportFilters.schema.toLowerCase()) &&
      dep.procedureName.toLowerCase().includes(reportFilters.procedure.toLowerCase()) &&
      dep.tableName.toLowerCase().includes(reportFilters.table.toLowerCase()) &&
      dep.usageType.toLowerCase().includes(reportFilters.usage.toLowerCase())
    );
  });

  if (loading && (taskItems.length === 0 && tableDependencies.length === 0)) {
    return <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;
  }

  return (
    <div className="py-4">
      {/* Tab Navigasyonu */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'list'
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
            }`}
        >
          📋 Task Listesi
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'report'
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
            }`}
        >
          📊 Tablo Bağımlılık Raporu
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        {activeTab === 'list' ? (
          <>
            <CreateTaskForm onCreated={loadData} />

            <div className="mt-8 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700/50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                      <div className="flex flex-col gap-2">
                        <span>Task Adı</span>
                        <input
                          type="text"
                          placeholder="Filtrele..."
                          className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                          value={filters.name}
                          onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                      <div className="flex flex-col gap-2">
                        <span>Açıklama</span>
                        <input
                          type="text"
                          placeholder="Filtrele..."
                          className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                          value={filters.description}
                          onChange={(e) => setFilters({ ...filters, description: e.target.value })}
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                      <div className="flex flex-col gap-2">
                        <span>Veritabanı</span>
                        <input
                          type="text"
                          placeholder="Filtrele..."
                          className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                          value={filters.database}
                          onChange={(e) => setFilters({ ...filters, database: e.target.value })}
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                      <div className="flex flex-col gap-2">
                        <span>Şema</span>
                        <input
                          type="text"
                          placeholder="Filtrele..."
                          className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                          value={filters.schema}
                          onChange={(e) => setFilters({ ...filters, schema: e.target.value })}
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                      Tekrar Aralığı
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                      İşlemler
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 font-medium">
                        Task bulunamadı
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((taskItem) => (
                      <tr key={taskItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{taskItem.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={taskItem.description}>
                          {taskItem.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {taskItem.storedProcedureDatabase || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {taskItem.storedProcedureSchema || 'dbo'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-500">
                          {taskItem.retryIntervalMinutes} dk
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <ProtectedButton
                              permission="pages.tasks.update"
                              onClick={() => setEditingTaskItem(taskItem)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
                            >
                              Düzenle
                            </ProtectedButton>
                            <ProtectedButton
                              permission="pages.tasks.delete"
                              onClick={() => handleDeleteTaskItem(taskItem.id)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold transition-colors"
                            >
                              Sil
                            </ProtectedButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700/50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col gap-2">
                      <span>Veritabanı</span>
                      <input
                        type="text"
                        placeholder="Filtrele..."
                        className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                        value={reportFilters.database}
                        onChange={(e) => setReportFilters({ ...reportFilters, database: e.target.value })}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col gap-2">
                      <span>Şema</span>
                      <input
                        type="text"
                        placeholder="Filtrele..."
                        className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                        value={reportFilters.schema}
                        onChange={(e) => setReportFilters({ ...reportFilters, schema: e.target.value })}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col gap-2">
                      <span>SP Adı</span>
                      <input
                        type="text"
                        placeholder="Filtrele..."
                        className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                        value={reportFilters.procedure}
                        onChange={(e) => setReportFilters({ ...reportFilters, procedure: e.target.value })}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col gap-2">
                      <span>Tablo Adı</span>
                      <input
                        type="text"
                        placeholder="Filtrele..."
                        className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                        value={reportFilters.table}
                        onChange={(e) => setReportFilters({ ...reportFilters, table: e.target.value })}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">
                    <div className="flex flex-col gap-2">
                      <span>Yöntem</span>
                      <input
                        type="text"
                        placeholder="Filtrele..."
                        className="p-1 text-xs font-normal border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                        value={reportFilters.usage}
                        onChange={(e) => setReportFilters({ ...reportFilters, usage: e.target.value })}
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredReport.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 font-medium">
                      Bağımlılık kaydı bulunamadı
                    </td>
                  </tr>
                ) : (
                  filteredReport.map((dep) => (
                    <tr key={dep.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{dep.databaseName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{dep.schemaName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{dep.procedureName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-medium">{dep.tableName}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${dep.usageType.includes('Update') || dep.usageType.includes('Insert') || dep.usageType.includes('Delete')
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          }`}>
                          {dep.usageType}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
