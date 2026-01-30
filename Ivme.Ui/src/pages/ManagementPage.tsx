import { useState, useEffect } from 'react';
import { taskGroupsApi, taskItemsApi, groupTaskAssignmentsApi, executionHistoryApi, flowItemsApi } from '../services/api';
import type { TaskGroup, TaskItem, FlowItem } from '../services/api';
import TaskDashboardView from '../components/TaskDashboardView';
import FlowDashboardView from '../components/FlowDashboardView';
import FlowDashboardView2 from '../components/FlowDashboardView2';
import { sortAllTasksByPrerequisites } from '../utils/taskSorting';
import 'reactflow/dist/style.css';

export default function ManagementPage() {
  const [activeTab, setActiveTab] = useState<'groups' | 'flows' | 'flows2'>('groups');

  // Groups tab data
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<Record<string, string>>({});
  const [todayStatusesWithErrors, setTodayStatusesWithErrors] = useState<Record<string, { status: string; errorMessage?: string }>>({});

  // Flows tab data
  const [flows, setFlows] = useState<FlowItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const loadData = async () => {
    try {
      setError(null);

      if (activeTab === 'groups') {
        // Grup izleme sekmesinde şimdilik tümünü getiriyoruz, ileride filtreleme eklenebilir
        const [groupsData, taskItemsData, allAssignmentsData, todayStatusesData, todayStatusesWithErrorsData] = await Promise.all([
          taskGroupsApi.getAll(),
          taskItemsApi.getAll(),
          groupTaskAssignmentsApi.getAll().catch(() => []),
          executionHistoryApi.getTodayStatuses().catch(() => ({})),
          executionHistoryApi.getTodayStatusesWithErrors().catch(() => ({}))
        ]);
        setGroups(groupsData);
        setTaskItems(taskItemsData);
        setAllAssignments(allAssignmentsData);
        setTodayStatuses(todayStatusesData);
        setTodayStatusesWithErrors(todayStatusesWithErrorsData);
      } else {
        const [flowsData, groupsData] = await Promise.all([
          flowItemsApi.getAll(),
          taskGroupsApi.getAll(),
        ]);
        setFlows(flowsData);
        setGroups(groupsData);
      }
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
      const errorMessage = err instanceof Error ? err.message : 'Veri yüklenirken hata oluştu';
      setError(errorMessage);
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

  const filteredTaskItems = sortAllTasksByPrerequisites(taskItems, allAssignments);

  return (
    <div className="py-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Yönetim ve İzleme</h2>
          <div className="flex gap-2">
            <button onClick={loadData} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
              Yenile
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'groups'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Grup İzleme
          </button>
          <button
            onClick={() => setActiveTab('flows')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'flows'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Akış İzleme
          </button>
          <button
            onClick={() => setActiveTab('flows2')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'flows2'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Akış İzleme2
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'groups' ? (
        <TaskDashboardView
          tasks={filteredTaskItems}
          assignments={allAssignments}
          todayStatuses={todayStatuses}
          todayStatusesWithErrors={todayStatusesWithErrors}
          onUpdate={loadData}
          groups={groups}
        />
      ) : activeTab === 'flows' ? (
        <FlowDashboardView
          flows={flows}
          groups={groups}
          onUpdate={loadData}
        />
      ) : (
        <FlowDashboardView2
          flows={flows}
          groups={groups}
          onUpdate={loadData}
        />
      )}
    </div>
  );
}
