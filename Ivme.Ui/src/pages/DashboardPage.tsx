import { useState, useEffect } from 'react';
import { executionHistoryApi, taskItemsApi } from '../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const [stats, setStats] = useState<{ completed: number; failed: number; running: number }>({ completed: 0, failed: 0, running: 0 });
  const [recentErrors, setRecentErrors] = useState<{ taskName: string; error: string; time: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // 30 saniyede bir yenile
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      // Dashboard metrics'i API'den al
      const metrics = await executionHistoryApi.getDashboardMetrics();

      setStats({
        completed: Number(metrics?.SuccessfulTasksToday || 0),
        failed: Number((metrics?.TotalTasksToday || 0) - (metrics?.SuccessfulTasksToday || 0)),
        running: Number(metrics?.ActiveTasks || 0),
      });

      const errors = (metrics?.FailedLastAttemptToday || [])
        .map((it) => ({
          taskName: it.Type + " : " + (it.Name || it.Id),
          error: it.ErrorMessage || 'Bilinmeyen Hata',
          time: it.LastAttemptTime ? new Date(it.LastAttemptTime).toLocaleTimeString() : new Date().toLocaleTimeString(),
        }))
        .slice(0, 5);

      setRecentErrors(errors);
    } catch (error) {
      console.error('Dashboard yüklenirken hata:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const data = [
    { name: 'Başarılı', value: stats.completed, color: '#10B981' }, // Green
    { name: 'Hatalı', value: stats.failed, color: '#EF4444' },    // Red
    { name: 'Çalışıyor', value: stats.running, color: '#3B82F6' }, // Blue
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Genel Durum Paneli</h1>
      
      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-l-4 border-green-500">
          <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Başarılı Görevler (Bugün)</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-white mt-2">{stats.completed}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-l-4 border-red-500">
          <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Hatalı Görevler (Bugün)</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-white mt-2">{stats.failed}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-l-4 border-blue-500">
          <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium">Aktif Görevler</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-white mt-2">{stats.running}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grafik */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Günlük Başarı Dağılımı</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Son Hatalar */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Son Hatalar</h3>
          <div className="space-y-4">
            {recentErrors.length > 0 ? (
              recentErrors.map((err, idx) => (
                <div key={idx} className="flex gap-3 items-start p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-red-500 mt-1">⚠️</div>
                  <div>
                    <h4 className="font-semibold text-gray-800 dark:text-white text-sm">{err.taskName}</h4>
                    <p className="text-red-600 text-xs mt-1">{err.error}</p>
                    <span className="text-gray-400 text-xs mt-2 block">{err.time}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8">
                Bugün henüz hata kaydı yok. Harika! 🎉
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
