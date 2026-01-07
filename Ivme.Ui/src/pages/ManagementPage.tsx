import { useState, useEffect } from 'react';
import { taskGroupsApi, taskItemsApi, groupTaskAssignmentsApi, executionHistoryApi } from '../services/api';
import type { TaskGroup, TaskItem } from '../services/api';
import TaskFlowView from '../components/TaskFlowView';
import TaskDashboardView from '../components/TaskDashboardView';
import { sortAllTasksByPrerequisites } from '../utils/taskSorting';

type ViewMode = 'flow' | 'dashboard';

export default function ManagementPage() {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<Record<string, string>>({});
  const [todayStatusesWithErrors, setTodayStatusesWithErrors] = useState<Record<string, { status: string; errorMessage?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000); // Her 2 saniyede bir güncelle
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      const [groupsData, taskItemsData, allAssignmentsData, todayStatusesData, todayStatusesWithErrorsData] = await Promise.all([
        taskGroupsApi.getAll(),
        taskItemsApi.getAll(),
        groupTaskAssignmentsApi.getAll().catch(() => []), // Hata olsa bile devam et
        executionHistoryApi.getTodayStatuses().catch(() => ({})), // Hata olsa bile devam et
        executionHistoryApi.getTodayStatusesWithErrors().catch(() => ({})) // Hata olsa bile devam et
      ]);
      setGroups(groupsData);
      setTaskItems(taskItemsData);
      setAllAssignments(allAssignmentsData);
      setTodayStatuses(todayStatusesData);
      setTodayStatusesWithErrors(todayStatusesWithErrorsData);
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
      const errorMessage = err instanceof Error ? err.message : 'Veri yüklenirken hata oluştu';
      setError(errorMessage);
      // Hata olsa bile loading'i false yap ki sayfa görünsün
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;
  }

  if (error) {
    return (
      <div className="py-4">
        <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg">
          <h3 className="font-semibold mb-2">Hata</h3>
          <p className="mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Tekrar Dene</button>
        </div>
      </div>
    );
  }

  // Task'ları önşartlara göre sırala
  const filteredTaskItems = sortAllTasksByPrerequisites(taskItems, allAssignments);

  return (
    <div className="py-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Görünüm:</label>
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                viewMode === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              onClick={() => setViewMode('dashboard')}
            >
              Pano
            </button>
            <button
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                viewMode === 'flow'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              onClick={() => setViewMode('flow')}
            >
              Akış
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
            Yenile
          </button>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        <TaskDashboardView
          tasks={filteredTaskItems}
          assignments={allAssignments}
          todayStatuses={todayStatuses}
          todayStatusesWithErrors={todayStatusesWithErrors}
          onUpdate={loadData}
          groups={groups}
        />
      ) : (
        <TaskFlowView
          tasks={filteredTaskItems}
          assignments={allAssignments}
          todayStatuses={todayStatuses}
          todayStatusesWithErrors={todayStatusesWithErrors}
          onUpdate={loadData}
          groups={groups}
        />
      )}
    </div>
  );
}

