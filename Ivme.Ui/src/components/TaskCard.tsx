import { useState, useEffect } from 'react';
import { taskItemsApi } from '../services/api';
import type { TaskItem, GroupTaskAssignment } from '../services/api';
import ProtectedButton from './ProtectedButton';

interface TaskCardProps {
  task: TaskItem;
  onUpdate: () => void;
  showEditButton?: boolean;
  assignment?: GroupTaskAssignment; // Grup bazlı durum için
  todayStatus?: string; // Bugünün execution history'den gelen statü
  todayError?: string; // Bugünün execution history'den gelen error message
}

export default function TaskCard({ task, onUpdate, showEditButton = true, assignment, todayStatus, todayError }: TaskCardProps) {
  // Task durumunu bugünün execution history'den al, yoksa boş göster
  // NOT: assignment.status kullanmıyoruz, sadece bugünün execution history'den gelen statüyü kullanıyoruz
  const taskStatus = todayStatus || undefined;
  // Progress ve diğer bilgileri assignment'tan al (execution history'de yok)
  const taskProgress = assignment?.progress ?? 0;
  const taskStartTime = assignment?.startTime;
  const taskEndTime = assignment?.endTime;
  // Error message'ı execution history'den al (assignment'tan değil)
  const taskErrorMessage = todayError;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(task);
  const [actionLoading, setActionLoading] = useState(false);
  const [allTaskItems, setAllTaskItems] = useState<TaskItem[]>([]);

  useEffect(() => {
    if (isEditing || isExpanded) {
      loadTaskItems();
    }
  }, [isEditing, isExpanded]);

  useEffect(() => {
    setEditData(task);
  }, [task]);

  const loadTaskItems = async () => {
    try {
      const taskItems = await taskItemsApi.getAll();
      // Kendi task'ını filtrele
      setAllTaskItems(taskItems.filter(t => t.id !== task.id));
    } catch (err) {
      console.error('Task itemlar yüklenemedi:', err);
    }
  };

  const statusLabels: Record<string, string> = {
    Pending: 'Beklemede',
    Ready: 'Hazır',
    Running: 'Çalışıyor',
    Paused: 'Duraklatıldı',
    Completed: 'Tamamlandı',
    MarkedAsSuccess: 'Başarılı Sayıldı',
    Failed: 'Başarısız',
    WaitingRetry: 'Yeniden Deneme Bekliyor',
  };

  const statusColors: Record<string, string> = {
    Pending: '#gray',
    Ready: '#4CAF50',
    Running: '#2196F3',
    Paused: '#FF9800',
    Completed: '#4CAF50',
    MarkedAsSuccess: '#22c55e',
    Failed: '#F44336',
    WaitingRetry: '#FFC107',
  };

  const handleAction = async (action: () => Promise<any>) => {
    try {
      setActionLoading(true);
      await action();
      onUpdate();
    } catch (err) {
      alert('İşlem hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = () => handleAction(() => taskItemsApi.start(task.id));
  const handlePause = () => handleAction(() => taskItemsApi.pause(task.id));
  const handleResume = () => handleAction(() => taskItemsApi.resume(task.id));
  const handleStop = () => handleAction(() => taskItemsApi.stop(task.id));
  const handleComplete = () => handleAction(() => taskItemsApi.complete(task.id));
  const handleFail = () => {
    const errorMsg = prompt('Hata mesajını girin:');
    if (errorMsg) {
      handleAction(() => taskItemsApi.fail(task.id, errorMsg));
    }
  };
  const handleRestart = () => handleAction(() => taskItemsApi.restart(task.id, assignment?.groupId));


  const handleSave = async () => {
    try {
      await taskItemsApi.update(editData);
      setIsEditing(false);
      onUpdate();
    } catch (err) {
      alert('Güncelleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  const handleDelete = async () => {
    if (!confirm('Bu task itemı silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await taskItemsApi.delete(task.id);
      onUpdate();
    } catch (err) {
      alert('Silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  const borderColor = taskStatus ? statusColors[taskStatus] : '#9E9E9E';
  
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md mb-3 overflow-hidden border-l-4 transition-all`} style={{ borderLeftColor: borderColor }}>
      <div className="p-3 cursor-pointer flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex-1 flex items-center gap-3">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white m-0">{task.name}</h4>
          {taskStatus ? (
            <span
              className="px-2 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: statusColors[taskStatus] }}
            >
              {statusLabels[taskStatus]}
            </span>
          ) : (
            <span className="px-2 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: '#9E9E9E', opacity: 0.5 }}>
              -
            </span>
          )}
          {taskProgress > 0 && (
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">%{taskProgress}</span>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {showEditButton && (
            <ProtectedButton
              permission="pages.tasks.update"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setIsEditing(!isEditing);
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
            >
              {isEditing ? 'İptal' : 'Düzenle'}
            </ProtectedButton>
          )}
          {showEditButton && (
            <ProtectedButton
              permission="pages.tasks.delete"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
            >
              Sil
            </ProtectedButton>
          )}
          <span className="text-gray-600 dark:text-gray-400 text-sm ml-1">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {isEditing ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
            placeholder="Task Adı"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            placeholder="Açıklama"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
          />
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kaç Dakikada Bir Tekrar Çalışması Gerektiği:</span>
            <input
              type="number"
              value={editData.retryIntervalMinutes}
              onChange={(e) =>
                setEditData({ ...editData, retryIntervalMinutes: parseInt(e.target.value) || 60 })
              }
              min="1"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hata Sonrası Bekleme Süresi (dakika):</span>
            <input
              type="number"
              value={editData.retryDelayMinutes}
              onChange={(e) =>
                setEditData({ ...editData, retryDelayMinutes: parseInt(e.target.value) || 60 })
              }
              min="1"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <ProtectedButton
            permission="pages.tasks.update"
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Kaydet
          </ProtectedButton>
        </div>
      ) : (
        <div className="px-4 pb-3 text-gray-600 dark:text-gray-400 text-sm">{task.description}</div>
      )}

      {isExpanded && (
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 text-sm" onClick={(e) => e.stopPropagation()}>
          {taskProgress > 0 && (
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${taskProgress}%` }}
              ></div>
            </div>
          )}

          {taskErrorMessage && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg mb-3 text-sm">
              <strong>Hata:</strong> {taskErrorMessage}
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400 mb-3 space-y-1">
            <div>Tekrar Çalışma Aralığı: {task.retryIntervalMinutes} dakika</div>
            <div>Hata Sonrası Bekleme: {task.retryDelayMinutes} dakika</div>
            {taskStartTime && <div>Başlangıç: {new Date(taskStartTime).toLocaleString('tr-TR')}</div>}
            {taskEndTime && <div>Bitiş: {new Date(taskEndTime).toLocaleString('tr-TR')}</div>}
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            {(!taskStatus || taskStatus === 'Pending' || taskStatus === 'Ready' || taskStatus === 'WaitingRetry') ? (
              <ProtectedButton
                permission="actions.task.start"
                onClick={handleStart}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
              >
                Başlat
              </ProtectedButton>
            ) : null}
            {taskStatus === 'Running' && (
              <>
                <ProtectedButton
                  permission="actions.task.pause"
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                >
                  Duraklat
                </ProtectedButton>
                <ProtectedButton
                  permission="actions.task.stop"
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                >
                  Durdur
                </ProtectedButton>
              </>
            )}
            {taskStatus === 'Paused' && (
              <>
                <ProtectedButton
                  permission="actions.task.resume"
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                >
                  Devam Et
                </ProtectedButton>
                <ProtectedButton
                  permission="actions.task.stop"
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
                >
                  Durdur
                </ProtectedButton>
              </>
            )}
            {taskStatus === 'Running' && (
              <ProtectedButton
                permission="actions.task.complete"
                onClick={handleComplete}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
              >
                Tamamla
              </ProtectedButton>
            )}
            {taskStatus === 'Running' && (
              <ProtectedButton
                permission="actions.task.fail"
                onClick={handleFail}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
              >
                Hata İşaretle
              </ProtectedButton>
            )}
            {taskStatus === 'Failed' && (
              <ProtectedButton
                permission="actions.task.restart"
                onClick={handleRestart}
                disabled={actionLoading}
                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-gray-900 rounded text-sm font-medium transition-colors"
              >
                Baştan Başlat
              </ProtectedButton>
            )}
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
            {task.startTime && (
              <div>Başlangıç: {new Date(task.startTime).toLocaleString('tr-TR')}</div>
            )}
            {task.endTime && (
              <div>Bitiş: {new Date(task.endTime).toLocaleString('tr-TR')}</div>
            )}
            {task.lastErrorTime && (
              <div>Son Hata: {new Date(task.lastErrorTime).toLocaleString('tr-TR')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

