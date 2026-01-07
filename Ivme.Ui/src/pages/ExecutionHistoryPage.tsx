import { useState, useEffect } from 'react';
import type { TaskExecutionHistory, GroupExecutionHistory, TaskItem, TaskGroup, User } from '../services/api';
import { executionHistoryApi, taskItemsApi, taskGroupsApi, usersApi } from '../services/api';

export default function ExecutionHistoryPage() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'groups'>('tasks');
  const [taskHistories, setTaskHistories] = useState<TaskExecutionHistory[]>([]);
  const [groupHistories, setGroupHistories] = useState<GroupExecutionHistory[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtreler
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'tasks') {
      loadTaskHistories();
    } else {
      loadGroupHistories();
    }
  }, [activeTab, selectedTaskId, selectedGroupId, startDate, endDate]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, groupsData, usersData] = await Promise.all([
        taskItemsApi.getAll(),
        taskGroupsApi.getAll(),
        usersApi.getAll(),
      ]);
      setTasks(tasksData);
      setGroups(groupsData);
      setUsers(usersData);
    } catch (err) {
      setError('Veriler yüklenirken hata oluştu');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTaskHistories = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (selectedTaskId) params.taskItemId = selectedTaskId;
      if (selectedGroupId) params.groupId = selectedGroupId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = `${endDate}T23:59:59`;
      const data = await executionHistoryApi.getTaskHistories(params);
      setTaskHistories(data);
    } catch (err) {
      setError('Task geçmişi yüklenirken hata oluştu');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupHistories = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (selectedGroupId) params.groupId = selectedGroupId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = `${endDate}T23:59:59`;
      const data = await executionHistoryApi.getGroupHistories(params);
      setGroupHistories(data);
    } catch (err) {
      setError('Grup geçmişi yüklenirken hata oluştu');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (duration?: string) => {
    if (!duration) return '-';
    try {
      const parts = duration.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);
        if (hours > 0) return `${hours}s ${minutes}dk ${seconds}sn`;
        if (minutes > 0) return `${minutes}dk ${seconds}sn`;
        return `${seconds}sn`;
      }
      return duration;
    } catch {
      return duration;
    }
  };

  const formatDateTime = (dateTime?: string) => {
    if (!dateTime) return '-';
    try {
      return new Date(dateTime).toLocaleString('tr-TR');
    } catch {
      return dateTime;
    }
  };

  const getTaskName = (taskId: string) => {
    return tasks.find(t => t.id === taskId)?.name || taskId;
  };

  const getGroupName = (groupId: string) => {
    return groups.find(g => g.id === groupId)?.name || groupId;
  };

  const getUserName = (userId?: string) => {
    if (!userId || userId === 'System') return null;
    const user = users.find(u => u.id === userId);
    return user?.username || null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return '#28a745';
      case 'Failed': return '#dc3545';
      case 'Running': return '#007bff';
      case 'Paused': return '#ffc107';
      default: return '#6c757d';
    }
  };

  return (
    <div className="py-4">
      <div className="flex gap-2 mb-6">
        <button
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'tasks'
              ? 'bg-blue-600 text-white shadow-md border-2 border-blue-600'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
          onClick={() => setActiveTab('tasks')}
        >
          Task Geçmişi
        </button>
        <button
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'groups'
              ? 'bg-blue-600 text-white shadow-md border-2 border-blue-600'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
          onClick={() => setActiveTab('groups')}
        >
          Grup Geçmişi
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6 flex flex-wrap gap-4 items-end">
        {activeTab === 'tasks' && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Task:</label>
            <select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm Task'lar</option>
              {tasks.map(task => (
                <option key={task.id} value={task.id}>{task.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Grup:</label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tüm Gruplar</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Başlangıç Tarihi:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bitiş Tarihi:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button 
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          onClick={activeTab === 'tasks' ? loadTaskHistories : loadGroupHistories}
        >
          Filtrele
        </button>
      </div>

      {error && <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg mb-4">{error}</div>}

      {loading && <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>}

      {activeTab === 'tasks' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Task</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Grup</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Başlangıç Zamanı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Bitiş Zamanı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Süre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Durum</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Hata Sayısı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Son Hata</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Retry Başlangıç</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">İlerleme</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Tetikleyen</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Parametreler</th>
              </tr>
            </thead>
            <tbody>
              {taskHistories.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {loading ? 'Yükleniyor...' : 'Kayıt bulunamadı'}
                  </td>
                </tr>
              ) : (
                taskHistories.map(history => (
                  <tr key={history.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{getTaskName(history.taskItemId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{history.groupId ? getGroupName(history.groupId) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDateTime(history.startTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDateTime(history.endTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDuration(history.duration)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getStatusColor(history.finalStatus) }}
                      >
                        {history.finalStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{history.errorCount}</td>
                    <td className="px-4 py-3 text-sm">
                      {history.errorMessage ? (
                        <span title={history.errorMessage} className="text-red-600 dark:text-red-400">
                          {history.errorMessage.length > 50
                            ? history.errorMessage.substring(0, 50) + '...'
                            : history.errorMessage}
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDateTime(history.retryStartTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{history.progress}%</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {history.triggeredBy === 'System' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                          Sistem
                        </span>
                      ) : history.triggeredBy ? (
                        (() => {
                          const userName = getUserName(history.triggeredBy);
                          return userName ? (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300" title={`Kullanıcı ID: ${history.triggeredBy}`}>
                              {userName}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400" title={`Kullanıcı bulunamadı (ID: ${history.triggeredBy})`}>
                              -
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {history.taskParameterValues && Object.keys(history.taskParameterValues).length > 0 ? (
                        <div className="space-y-1">
                          {Object.entries(history.taskParameterValues).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <span className="font-medium text-gray-700 dark:text-gray-300">{key}:</span>{' '}
                              <span className="text-gray-600 dark:text-gray-400">
                                {value === null ? (
                                  <span className="italic text-gray-500 dark:text-gray-500">NULL</span>
                                ) : value.length > 30 ? (
                                  <span title={value}>{value.substring(0, 30)}...</span>
                                ) : (
                                  value
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Grup</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Başlangıç Zamanı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Bitiş Zamanı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Süre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Toplam Task</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Tamamlanan</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Başarısız</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Toplam Hata</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white border-b-2 border-gray-300 dark:border-gray-600">Tetikleyen</th>
              </tr>
            </thead>
            <tbody>
              {groupHistories.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {loading ? 'Yükleniyor...' : 'Kayıt bulunamadı'}
                  </td>
                </tr>
              ) : (
                groupHistories.map(history => (
                  <tr key={history.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{getGroupName(history.groupId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDateTime(history.startTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDateTime(history.endTime)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDuration(history.duration)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{history.totalTasks}</td>
                    <td className="px-4 py-3 text-sm font-bold text-green-600 dark:text-green-400">
                      {history.completedTasks}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-red-600 dark:text-red-400">
                      {history.failedTasks}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{history.totalErrors}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {history.triggeredBy === 'System' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                          Sistem
                        </span>
                      ) : history.triggeredBy ? (
                        (() => {
                          const userName = getUserName(history.triggeredBy);
                          return userName ? (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300" title={`Kullanıcı ID: ${history.triggeredBy}`}>
                              {userName}
                            </span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400" title={`Kullanıcı bulunamadı (ID: ${history.triggeredBy})`}>
                              -
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

