import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { TaskItem, GroupTaskAssignment, GroupExecutionHistory, GroupSchedule, TaskExecutionHistory } from '../services/api';
import { calculateTaskLevels } from '../utils/taskSorting';
import { executionHistoryApi, groupSchedulesApi, taskGroupsApi, taskItemsApi, flowItemsApi } from '../services/api';
import ProtectedButton from './ProtectedButton';

// Task durumuna göre renk belirleme
const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'Running':
      return '#eab308'; // Sarı - Çalışıyor
    case 'Ready':
      return '#9ca3af'; // Gri - Hazır
    case 'Pending':
      return '#9ca3af'; // Gri - Beklemede
    case 'WaitingRetry':
      return '#f59e0b'; // Turuncu - Yeniden deneme bekliyor
    case 'Paused':
      return '#6b7280'; // Gri - Duraklatıldı
    case 'Completed':
      return '#059669'; // Koyu yeşil - Tamamlandı
    case 'MarkedAsSuccess':
      return '#4ade80'; // Orta ton yeşil - Başarılı Sayıldı
    case 'Failed':
      return '#ef4444'; // Kırmızı - Başarısız
    default:
      return '#9ca3af'; // Varsayılan - Gri
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
  WaitingRetry: 'Yeniden Deneme',
};

// Custom node component
const DashboardTaskNode = ({ data, groupExecutions }: {
  data: {
    task: TaskItem;
    assignment: GroupTaskAssignment;
    order: number;
    level: number;
    status?: string;
    progress?: number;
    errorMessage?: string;
    groupName?: string;
    groupExecutionId?: string;
    onUpdate?: () => void;
  };
  groupExecutions?: GroupExecutionHistory[];
}) => {
  const statusColor = getStatusColor(data.status);
  const borderWidth = data.status === 'Running' ? 3 : 2;
  const [actionLoading, setActionLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<TaskExecutionHistory[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bu işi durdurmak istediğinize emin misiniz?')) {
      return;
    }
    try {
      setActionLoading(true);
      await taskItemsApi.stop(data.task.id);
      if (data.onUpdate) {
        data.onUpdate();
      }
    } catch (err) {
      alert('Durdurma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setActionLoading(false);
    }
  };

  // Logları yükle - sadece son grup execution'ına ait olanları göster
  const loadLogs = async () => {
    if (showLogs && logs.length === 0 && !loadingLogs) {
      setLoadingLogs(true);
      try {
        // Önce groupExecutionId'yi bul
        let finalGroupExecutionId = data.groupExecutionId;

        // Eğer groupExecutionId yoksa, groupExecutions'tan bul
        if (!finalGroupExecutionId && groupExecutions && data.assignment?.groupId) {
          const latestGroupExecution = groupExecutions
            .filter(exec => exec.groupId === data.assignment.groupId)
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
          finalGroupExecutionId = latestGroupExecution?.id;
        }

        if (!finalGroupExecutionId) {
          setLogs([]);
          setLoadingLogs(false);
          return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Bugünkü tüm execution'ları al
        const allHistories = await executionHistoryApi.getTaskHistories({
          taskItemId: data.task.id,
          groupId: data.assignment.groupId,
          startDate: today.toISOString(),
          endDate: tomorrow.toISOString()
        });

        // Sadece son grup execution'ına ait olanları filtrele
        const relevantHistories = allHistories
          .filter(history => history.groupExecutionId === finalGroupExecutionId)
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        setLogs(relevantHistories);
      } catch (err) {
        console.error('Log yükleme hatası:', err);
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  // showLogs değiştiğinde logları yükle
  useEffect(() => {
    if (showLogs) {
      loadLogs();
    }
  }, [showLogs]);

  const handleMarkAsSuccess = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bu işi başarılı olarak işaretlemek istediğinize emin misiniz? Bu işlem sonrası bağımlı işler başlayabilecek.')) {
      return;
    }

    // ÖNEMLİ: groupExecutionId ve groupId kontrolü
    let finalGroupExecutionId = data.groupExecutionId;
    let finalGroupId = data.assignment?.groupId;

    // Eğer groupExecutionId yoksa, groupExecutions'tan bul
    if (!finalGroupExecutionId && groupExecutions && data.assignment?.groupId) {
      const latestGroupExecution = groupExecutions
        .filter(exec => exec.groupId === data.assignment.groupId)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
      finalGroupExecutionId = latestGroupExecution?.id;
    }

    if (!finalGroupExecutionId) {
      alert('Hata: GroupExecutionId bulunamadı. Lütfen sayfayı yenileyin ve tekrar deneyin.');
      return;
    }

    if (!finalGroupId) {
      alert('Hata: GroupId bulunamadı. Lütfen sayfayı yenileyin ve tekrar deneyin.');
      return;
    }

    try {
      setActionLoading(true);
      await taskItemsApi.markAsSuccess(data.task.id, finalGroupExecutionId, finalGroupId);
      // UI'ı güncellemek için gecikme ekle (backend'in veritabanını güncellemesi için)
      // Veritabanı güncellemesinin tamamlanması için biraz daha uzun bekle
      await new Promise(resolve => setTimeout(resolve, 1000));
      // onUpdate'i çağır (bu ManagementPage'deki loadData'yı çağıracak)
      if (data.onUpdate) {
        data.onUpdate();
      }
      // Ek bir gecikme sonrası tekrar güncelle (verilerin tam yüklenmesi için)
      await new Promise(resolve => setTimeout(resolve, 500));
      if (data.onUpdate) {
        data.onUpdate();
      }
    } catch (err) {
      alert('Başarılı işaretleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className="px-3 py-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-md min-w-[200px] max-w-[240px] hover:shadow-lg transition-shadow relative"
      style={{
        borderWidth: `${borderWidth}px`,
        borderColor: statusColor,
        borderStyle: 'solid',
      }}
    >
      {/* Source handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{
          background: statusColor,
          width: 10,
          height: 10,
          border: '2px solid white',
        }}
      />

      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{
          background: statusColor,
          width: 10,
          height: 10,
          border: '2px solid white',
        }}
      />

      <div className="flex items-start justify-between mb-1.5">
        <div className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
          {data.task.name}
        </div>
        <div
          className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium text-white"
          style={{ backgroundColor: statusColor }}
        >
          #{data.order + 1}
        </div>
      </div>

      {data.status && (
        <div className="text-xs font-semibold mb-1.5" style={{ color: statusColor }}>
          {statusLabels[data.status] || data.status}
        </div>
      )}

      {data.errorMessage && (
        <div className="text-xs text-red-600 dark:text-red-400 mb-1.5 font-medium line-clamp-2">
          ⚠️ {data.errorMessage}
        </div>
      )}
      {/*
      {data.task.description && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 line-clamp-2">
          {data.task.description}
        </div>
      )}
      */}
      {/* Butonlar */}
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-1.5">
        {/* Durdurma butonu - sadece Running durumunda göster */}
        {data.status === 'Running' && (
          <ProtectedButton
            permission="actions.task.stop"
            onClick={handleStop}
            disabled={actionLoading}
            className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
          >
            {actionLoading ? 'Durduruluyor...' : 'Durdur'}
          </ProtectedButton>
        )}

        {/* Başarılı Say butonu - sadece Failed durumunda göster */}
        {data.status === 'Failed' && (
          <ProtectedButton
            permission="actions.task.markAsSuccess"
            onClick={handleMarkAsSuccess}
            disabled={actionLoading}
            className="w-full px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
          >
            {actionLoading ? 'İşaretleniyor...' : 'Başarılı Say'}
          </ProtectedButton>
        )}

        {/* Loglar butonu */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowLogs(!showLogs);
          }}
          className="w-full px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-medium transition-colors flex items-center justify-between"
        >
          <span>Loglar</span>
          <svg
            className={`w-3 h-3 transition-transform ${showLogs ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Collapsible Log Bölümü */}
        {showLogs && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs max-h-40 overflow-y-auto">
            {loadingLogs ? (
              <div className="text-center py-2 text-gray-500">Yükleniyor...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-2 text-gray-500">Log bulunamadı</div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
                        style={{ backgroundColor: getStatusColor(log.finalStatus) }}
                      >
                        {statusLabels[log.finalStatus] || log.finalStatus}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {new Date(log.startTime).toLocaleTimeString('tr-TR')}
                      </span>
                      {log.endTime && (
                        <span className="text-gray-500 dark:text-gray-400">
                          - {new Date(log.endTime).toLocaleTimeString('tr-TR')}
                        </span>
                      )}
                    </div>
                    {log.errorMessage && (
                      <div className="text-red-600 dark:text-red-400 line-clamp-2 mt-1">
                        {log.errorMessage}
                      </div>
                    )}
                    {log.duration && (
                      <div className="text-gray-500 dark:text-gray-400 mt-1">
                        Süre: {log.duration}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


interface TaskDashboardViewProps {
  tasks: TaskItem[];
  assignments: GroupTaskAssignment[];
  todayStatuses?: Record<string, string>; // Bugünün execution history'den gelen statüler (groupId-taskId -> status)
  todayStatusesWithErrors?: Record<string, { status: string; errorMessage?: string }>;
  onUpdate: () => void;
  groups?: Array<{ id: string; name: string }>;
}


export default function TaskDashboardView({
  tasks,
  assignments,
  todayStatuses = {},
  todayStatusesWithErrors = {},
  onUpdate,
  groups = []
}: TaskDashboardViewProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeGroupIds, setActiveGroupIds] = useState<string[]>([]);
  const [groupExecutions, setGroupExecutions] = useState<GroupExecutionHistory[]>([]);
  const [allGroups, setAllGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [schedules, setSchedules] = useState<GroupSchedule[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showStartModal, setShowStartModal] = useState(false);
  const [startFromTaskId, setStartFromTaskId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string>('');
  const [loadingExecutionLogs, setLoadingExecutionLogs] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedGroupExecutionId, setSelectedGroupExecutionId] = useState<string | null>(null);
  const manualGroupExecutionRef = useRef<string | null>(null);
  const [flowItems, setFlowItems] = useState<Array<{ id: string; name: string }>>([]);
  const [localTodayStatuses, setLocalTodayStatuses] = useState<Record<string, string> | null>(null);
  const [localTodayStatusesWithErrors, setLocalTodayStatusesWithErrors] = useState<Record<string, { status: string; errorMessage?: string }> | null>(null);

  // nodeTypes'i memoize et (React Flow uyarısını önlemek için)
  // groupExecutions prop'unu DashboardTaskNode'a geçirmek için
  // useRef kullanarak groupExecutions'ı saklıyoruz, böylece callback her zaman aynı referansı kullanır
  const groupExecutionsRef = useRef<GroupExecutionHistory[]>(groupExecutions);

  // groupExecutions değiştiğinde ref'i güncelle
  useEffect(() => {
    groupExecutionsRef.current = groupExecutions;
  }, [groupExecutions]);

  // createDashboardTaskNode'u useCallback ile memoize et, ama dependency olmadan
  // groupExecutions'ı ref'ten alıyoruz, böylece callback referansı değişmez
  const createDashboardTaskNode = useCallback((props: any) => {
    return <DashboardTaskNode {...props} groupExecutions={groupExecutionsRef.current} />;
  }, []); // Boş dependency array - callback referansı hiç değişmez

  const memoizedNodeTypes = useMemo(() => ({
    dashboardTask: createDashboardTaskNode,
  }), [createDashboardTaskNode]);

  // Bugün çalışan/çalışmış ve çalışacak grupları yükle
  useEffect(() => {
    const loadActiveGroups = async () => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        // Tüm grupları ve schedule'ları yükle
        const [executions, groupsData, flowsData] = await Promise.all([
          executionHistoryApi.getGroupHistories({
            startDate: todayStart.toISOString(),
            endDate: todayEnd.toISOString(),
          }),
          taskGroupsApi.getAll(),
          flowItemsApi.getAll().catch(() => []),
        ]);

        setGroupExecutions(executions);
        setAllGroups(groupsData);
        setFlowItems(flowsData);

        // Her grup için schedule'ı kontrol et
        const schedulePromises = groupsData.map(async (group) => {
          try {
            const schedule = await groupSchedulesApi.getByGroup(group.id);
            return schedule;
          } catch {
            return null;
          }
        });
        const scheduleResults = await Promise.all(schedulePromises);
        const activeSchedules = scheduleResults.filter((s): s is GroupSchedule => s !== null && s.isActive);
        setSchedules(activeSchedules);

        // Bugün çalışan/çalışmış unique grup ID'lerini bul
        const executedGroupIds = Array.from(
          new Set(executions.map(exec => exec.groupId))
        );

        // Bugün çalışacak grupları bul (schedule'a göre)
        const todayScheduledGroupIds: string[] = [];

        activeSchedules.forEach(schedule => {
          // Schedule'ın bugün çalışıp çalışmayacağını kontrol et
          // Şimdilik sadece Daily schedule'ları kontrol ediyoruz
          // Weekly ve Monthly için daha detaylı kontrol gerekebilir
          const shouldRunToday = schedule.workPeriod === 'Daily';

          if (shouldRunToday && schedule.isActive) {
            // Bugün bu grup için execution var mı kontrol et
            const hasExecutionToday = executions.some(
              exec => exec.groupId === schedule.groupId
            );

            // Eğer bugün çalışmamışsa, schedule'a göre çalışacak demektir
            if (!hasExecutionToday) {
              todayScheduledGroupIds.push(schedule.groupId);
            }
          }
        });

        // Tüm grup ID'lerini birleştir (çalışan/çalışmış + çalışacak)
        const allActiveGroupIds = Array.from(
          new Set([...executedGroupIds, ...todayScheduledGroupIds])
        );

        setActiveGroupIds(allActiveGroupIds);

        // İlk grubu otomatik seç
        if (allActiveGroupIds.length > 0 && !selectedGroupId) {
          setSelectedGroupId(allActiveGroupIds[0]);
        }
      } catch (error) {
      }
    };

    loadActiveGroups();
    const interval = setInterval(loadActiveGroups, 2000); // Her 2 saniyede bir güncelle
    return () => clearInterval(interval);
  }, [selectedGroupId]);

  // Manuel execution seçimi yapıldığında, o execution'a ait statüleri yükle
  useEffect(() => {
    const loadFilteredStatuses = async () => {
      const execIdToUse = manualGroupExecutionRef.current || selectedGroupExecutionId;
      if (!execIdToUse || !selectedGroupId) {
        setLocalTodayStatuses(null);
        setLocalTodayStatusesWithErrors(null);
        return;
      }

      try {
        const [statuses, statusesWithErrors] = await Promise.all([
          executionHistoryApi.getTodayStatuses({ groupExecutionId: execIdToUse }),
          executionHistoryApi.getTodayStatusesWithErrors({ groupExecutionId: execIdToUse }),
        ]);
        setLocalTodayStatuses(statuses);
        setLocalTodayStatusesWithErrors(statusesWithErrors);
      } catch {
        setLocalTodayStatuses(null);
        setLocalTodayStatusesWithErrors(null);
      }
    };

    if (manualGroupExecutionRef.current) {
      loadFilteredStatuses();
      const interval = setInterval(loadFilteredStatuses, 2000);
      return () => clearInterval(interval);
    } else {
      setLocalTodayStatuses(null);
      setLocalTodayStatusesWithErrors(null);
    }
  }, [selectedGroupExecutionId, selectedGroupId]);

  const handleStartGroup = async () => {
    if (!selectedGroupId) return;

    try {
      setIsStarting(true);

      if (startFromTaskId === null) {
        // Baştan başlat
        await taskGroupsApi.start(selectedGroupId);
        alert('Grup başarıyla baştan başlatıldı.');
      } else {
        // Belirli task'tan başlat
        await taskGroupsApi.start(selectedGroupId, startFromTaskId);
        const task = tasks.find(t => t.id === startFromTaskId);
        alert(`Grup "${task?.name || 'seçilen task'}" task'ından başarıyla başlatıldı.`);
      }

      setShowStartModal(false);
      setStartFromTaskId(null);

      // Verileri yenile - parent component'in loadData fonksiyonunu çağır
      onUpdate();
    } catch (err) {
      alert('Grup başlatma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setIsStarting(false);
    }
  };

  // Etkili statü kaynağını belirle (manuel seçim varsa local, yoksa prop)
  const effectiveTodayStatuses = localTodayStatuses || todayStatuses;
  const effectiveTodayStatusesWithErrors = localTodayStatusesWithErrors || todayStatusesWithErrors;

  // Her grup için ayrı flow oluştur
  const flowsByGroup = useMemo(() => {
    if (groups.length === 0) {
      // Grup yoksa tüm task'ları tek bir flow'da göster
      // Tüm assignment'ları al (filtreleme yok)
      const groupAssignments = assignments;

      if (groupAssignments.length === 0) return {};

      // Grup assignment'larına göre task'ları bul
      const groupTasks = tasks.filter(t =>
        groupAssignments.some(a => a.taskItemId === t.id)
      );

      if (groupTasks.length === 0) return {};

      const taskLevels = calculateTaskLevels(groupTasks, groupAssignments);

      // Maksimum seviye sayısını bul
      let maxLevel = -1;
      taskLevels.forEach((level) => {
        maxLevel = Math.max(maxLevel, level);
      });
      const levelCount = maxLevel + 1; // Seviye sayısı (1-based)

      // Container genişliğini seviye sayısına göre belirle
      // Node genişliği 320px, padding 100px (her iki tarafta 50px)
      // Minimum seviyeler arası mesafe: 350px (node genişliği + boşluk)
      const nodeWidth = 320;
      const horizontalPadding = 100;
      const minLevelSpacing = 350; // Minimum seviyeler arası mesafe

      // Gerekli minimum genişlik: (levelCount - 1) * minLevelSpacing + nodeWidth + horizontalPadding
      const minRequiredWidth = (levelCount - 1) * minLevelSpacing + nodeWidth + horizontalPadding;

      let containerWidth: number;
      if (levelCount >= 1 && levelCount <= 4) {
        // 1-4 seviye için minimum genişlik veya 800px (hangisi büyükse) - 6'lık grid için
        containerWidth = Math.max(minRequiredWidth, 800);
      } else {
        // 5+ seviye için minimum genişlik veya 1400px (hangisi büyükse) - 12'lik grid için
        containerWidth = Math.max(minRequiredWidth, 1400);
      }

      const availableWidth = containerWidth - horizontalPadding - nodeWidth;

      // Seviyeler arası mesafeyi hesapla (minimum spacing'i koru)
      const levelSpacing = levelCount > 1
        ? Math.max(availableWidth / (levelCount - 1), minLevelSpacing)
        : 0;

      // Node'ları oluştur
      const groupNodes: Node[] = [];
      const groupEdges: Edge[] = [];

      const tasksByLevel = new Map<number, GroupTaskAssignment[]>();
      groupAssignments.forEach(assignment => {
        const task = groupTasks.find(t => t.id === assignment.taskItemId);
        if (task) {
          const level = taskLevels.get(task.id) || 0;
          if (!tasksByLevel.has(level)) {
            tasksByLevel.set(level, []);
          }
          tasksByLevel.get(level)!.push(assignment);
        }
      });

      tasksByLevel.forEach((levelAssignments) => {
        levelAssignments.sort((a, b) => a.order - b.order);

        levelAssignments.forEach((assignment, indexInLevel) => {
          const task = groupTasks.find(t => t.id === assignment.taskItemId);
          if (!task) return;

          const level = taskLevels.get(task.id) || 0;
          const statusKey = `${assignment.groupId}-${assignment.taskItemId}`;
          const status = effectiveTodayStatuses[statusKey];
          const statusWithError = effectiveTodayStatusesWithErrors[statusKey];
          const progress = assignment.progress ?? 0;

          const nodesInLevel = levelAssignments.length;
          const spacing = 200; // Aynı seviyedeki tasklar arası mesafe (kartlar küçüldüğü için azaltıldı)
          const startY = 100;
          const totalHeight = (nodesInLevel - 1) * spacing;
          const y = startY + (indexInLevel * spacing) - (totalHeight / 2);

          // Seviye sayısına göre dinamik x pozisyonu
          const x = levelCount > 1
            ? (level * levelSpacing) + 20  // İlk seviye 20px'den başlar (sola yaklaştırıldı: 50 -> 20)
            : 20; // Tek seviye varsa ortada

          // ÖNEMLİ: Her assignment için kendi groupId'sine göre groupExecutionId bul
          const assignmentGroupExecution = groupExecutions
            .filter(exec => exec.groupId === assignment.groupId)
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
          const assignmentGroupExecutionId = assignmentGroupExecution?.id;


          groupNodes.push({
            id: assignment.id,
            type: 'dashboardTask',
            position: {
              x: x,
              y: y,
            },
            data: {
              task,
              assignment,
              order: assignment.order,
              level: level,
              status,
              progress,
              errorMessage: statusWithError?.errorMessage,
              groupExecutionId: assignmentGroupExecutionId, // assignment'ın kendi groupId'sine göre bulunan execution ID
              onUpdate: onUpdate,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
        });
      });

      // Edge'leri oluştur
      groupAssignments.forEach(assignment => {
        assignment.prerequisiteTaskItemIds.forEach(prereqId => {
          const prereqAssignment = groupAssignments.find(a => a.taskItemId === prereqId);
          if (prereqAssignment) {
            groupEdges.push({
              id: `e-${prereqAssignment.id}-${assignment.id}`,
              source: prereqAssignment.id,
              target: assignment.id,
              sourceHandle: 'source',
              targetHandle: 'target',
              type: 'smoothstep',
              animated: status === 'Running',
              style: {
                stroke: getStatusColor(status),
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: getStatusColor(status),
                width: 20,
                height: 20,
              },
            });
          }
        });
      });

      return { 'all': { nodes: groupNodes, edges: groupEdges } };
    }

    // Her grup için ayrı flow
    const flows: Record<string, { nodes: Node[]; edges: Edge[] }> = {};

    groups.forEach(group => {
      // Her grup için tüm assignment'ları al (filtreleme yok)
      const groupAssignments = assignments.filter(
        a => a.groupId === group.id
      );

      if (groupAssignments.length === 0) return;

      // Grup assignment'larına göre task'ları bul
      const groupTasks = tasks.filter(t =>
        groupAssignments.some(a => a.taskItemId === t.id)
      );

      const taskLevels = calculateTaskLevels(groupTasks, groupAssignments);

      // Maksimum seviye sayısını bul
      let maxLevel = -1;
      taskLevels.forEach((level) => {
        maxLevel = Math.max(maxLevel, level);
      });
      const levelCount = maxLevel + 1; // Seviye sayısı (1-based)

      // Container genişliğini seviye sayısına göre belirle
      // Node genişliği 320px, padding 100px (her iki tarafta 50px)
      // Minimum seviyeler arası mesafe: 350px (node genişliği + boşluk)
      const nodeWidth = 320;
      const horizontalPadding = 100;
      const minLevelSpacing = 350; // Minimum seviyeler arası mesafe

      // Gerekli minimum genişlik: (levelCount - 1) * minLevelSpacing + nodeWidth + horizontalPadding
      const minRequiredWidth = (levelCount - 1) * minLevelSpacing + nodeWidth + horizontalPadding;

      let containerWidth: number;
      if (levelCount >= 1 && levelCount <= 4) {
        // 1-4 seviye için minimum genişlik veya 800px (hangisi büyükse) - 6'lık grid için
        containerWidth = Math.max(minRequiredWidth, 800);
      } else {
        // 5+ seviye için minimum genişlik veya 1400px (hangisi büyükse) - 12'lik grid için
        containerWidth = Math.max(minRequiredWidth, 1400);
      }

      const availableWidth = containerWidth - horizontalPadding - nodeWidth;

      // Seviyeler arası mesafeyi hesapla (minimum spacing'i koru)
      const levelSpacing = levelCount > 1
        ? Math.max(availableWidth / (levelCount - 1), minLevelSpacing)
        : 0;

      const groupNodes: Node[] = [];
      const groupEdges: Edge[] = [];

      const tasksByLevel = new Map<number, GroupTaskAssignment[]>();
      groupAssignments.forEach(assignment => {
        const task = groupTasks.find(t => t.id === assignment.taskItemId);
        if (task) {
          const level = taskLevels.get(task.id) || 0;
          if (!tasksByLevel.has(level)) {
            tasksByLevel.set(level, []);
          }
          tasksByLevel.get(level)!.push(assignment);
        }
      });

      tasksByLevel.forEach((levelAssignments) => {
        levelAssignments.sort((a, b) => a.order - b.order);

        levelAssignments.forEach((assignment, indexInLevel) => {
          const task = groupTasks.find(t => t.id === assignment.taskItemId);
          if (!task) return;

          const level = taskLevels.get(task.id) || 0;
          const statusKey = `${assignment.groupId}-${assignment.taskItemId}`;
          const status = effectiveTodayStatuses[statusKey];
          const statusWithError = effectiveTodayStatusesWithErrors[statusKey];
          const progress = assignment.progress ?? 0;

          const nodesInLevel = levelAssignments.length;
          const spacing = 200; // Aynı seviyedeki tasklar arası mesafe (kartlar küçüldüğü için azaltıldı)
          const startY = 100;
          const totalHeight = (nodesInLevel - 1) * spacing;
          const y = startY + (indexInLevel * spacing) - (totalHeight / 2);

          // Seviye sayısına göre dinamik x pozisyonu
          const x = levelCount > 1
            ? (level * levelSpacing) + 20  // İlk seviye 20px'den başlar (sola yaklaştırıldı: 50 -> 20)
            : 20; // Tek seviye varsa ortada

          // ÖNEMLİ: Her assignment için kendi groupId'sine göre groupExecutionId bul
          // assignment.groupId ile group.id eşleşmeli, ama güvenlik için assignment.groupId kullanıyoruz
          const assignmentGroupExecution = groupExecutions
            .filter(exec => exec.groupId === assignment.groupId)
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
          const assignmentGroupExecutionId = assignmentGroupExecution?.id;


          groupNodes.push({
            id: assignment.id,
            type: 'dashboardTask',
            position: {
              x: x,
              y: y,
            },
            data: {
              task,
              assignment,
              order: assignment.order,
              level: level,
              status,
              progress,
              errorMessage: statusWithError?.errorMessage,
              groupName: group.name,
              groupExecutionId: assignmentGroupExecutionId, // assignment'ın kendi groupId'sine göre bulunan execution ID
              onUpdate: onUpdate,
            },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
        });
      });

      // Edge'leri oluştur
      groupAssignments.forEach(assignment => {
        assignment.prerequisiteTaskItemIds.forEach(prereqId => {
          const prereqAssignment = groupAssignments.find(a => a.taskItemId === prereqId);
          if (prereqAssignment) {
            const prereqStatusKey = `${prereqAssignment.groupId}-${prereqAssignment.taskItemId}`;
            const prereqStatus = effectiveTodayStatuses[prereqStatusKey];

            groupEdges.push({
              id: `e-${prereqAssignment.id}-${assignment.id}`,
              source: prereqAssignment.id,
              target: assignment.id,
              sourceHandle: 'source',
              targetHandle: 'target',
              type: 'smoothstep',
              animated: prereqStatus === 'Running',
              style: {
                stroke: getStatusColor(prereqStatus),
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: getStatusColor(prereqStatus),
                width: 20,
                height: 20,
              },
            });
          }
        });
      });

      flows[group.id] = { nodes: groupNodes, edges: groupEdges };
    });

    return flows;
  }, [tasks, assignments, groups, effectiveTodayStatuses, effectiveTodayStatusesWithErrors, groupExecutions, onUpdate]);

  // Seçilen grup için flow'u bul
  const selectedFlow = useMemo(() => {
    if (!selectedGroupId) return null;
    return flowsByGroup[selectedGroupId] || null;
  }, [selectedGroupId, flowsByGroup]);

  // Seçilen grup için nodes ve edges'i güncelle
  useEffect(() => {
    if (selectedFlow) {
      setNodes(selectedFlow.nodes);
      setEdges(selectedFlow.edges);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [selectedFlow]);

  // Execution loglarını yüklemek için fonksiyon
  const loadExecutionLogs = useCallback(async () => {
    if (!selectedGroupId) {
      setExecutionLogs('');
      return;
    }

    setLoadingExecutionLogs(true);
    try {
      // Seçili grubun en son execution'ını bul
      const latestGroupExecution = groupExecutions
        .filter(exec => exec.groupId === selectedGroupId)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];

      if (!latestGroupExecution) {
        setExecutionLogs('');
        return;
      }

      // Bu group execution'a ait tüm task execution'larını al
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const taskHistories = await executionHistoryApi.getTaskHistories({
        groupId: selectedGroupId,
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString()
      });

      // Group execution'ı başlangıç olarak ekle
      const groupName = allGroups.find(g => g.id === selectedGroupId)?.name || groups.find(g => g.id === selectedGroupId)?.name || 'Bilinmeyen Grup';
      const groupStartTime = new Date(latestGroupExecution.startTime).toLocaleString('tr-TR');
      let logLines: string[] = [`${groupStartTime} ${groupName} başladı`];

      // Task execution'larını kronolojik sıraya göre sırala
      const relevantTaskHistories = taskHistories
        .filter(history => (history.groupExecutionId === latestGroupExecution.id) ||
          (history.groupId === selectedGroupId &&
            new Date(history.startTime) >= new Date(latestGroupExecution.startTime)))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      // Her task execution için log satırı oluştur
      relevantTaskHistories.forEach(history => {
        const task = tasks.find(t => t.id === history.taskItemId);
        const taskName = task?.name || 'Bilinmeyen Task';
        const startTime = new Date(history.startTime).toLocaleString('tr-TR');

        // Başlangıç logu
        logLines.push(`${startTime} ${taskName} taskı çalışmaya başladı`);

        // Bitiş logu (eğer varsa)
        if (history.endTime) {
          const endTime = new Date(history.endTime).toLocaleString('tr-TR');

          if (history.finalStatus === 'Failed') {
            logLines.push(`${endTime} ${taskName} taskı hatalı bitti`);
          } else if (history.finalStatus === 'Completed') {
            logLines.push(`${endTime} ${taskName} taskı başarıyla tamamlandı`);
          } else if (history.finalStatus === 'MarkedAsSuccess') {
            logLines.push(`${endTime} ${taskName} taskı başarılı sayıldı`);
          } else {
            const statusLabel = statusLabels[history.finalStatus] || history.finalStatus;
            logLines.push(`${endTime} ${taskName} taskı ${statusLabel} durumunda bitti`);
          }
        }
      });

      // Group execution bitiş logu (eğer varsa)
      if (latestGroupExecution.endTime) {
        const groupEndTime = new Date(latestGroupExecution.endTime).toLocaleString('tr-TR');
        logLines.push(`${groupEndTime} ${groupName} tamamlandı`);
      }

      setExecutionLogs(logLines.join('\n'));
    } catch (err) {
      console.error('Execution log yükleme hatası:', err);
      setExecutionLogs('Log yüklenirken hata oluştu');
    } finally {
      setLoadingExecutionLogs(false);
    }
  }, [selectedGroupId, groupExecutions, tasks, allGroups, groups]);

  // İlk açıldığında veya grup değiştiğinde logları yükle (sadece bir kez)
  useEffect(() => {
    if (selectedGroupId) {
      loadExecutionLogs();
    } else {
      setExecutionLogs('');
    }
  }, [selectedGroupId]); // Sadece selectedGroupId değiştiğinde yükle

  // Aktif grupları isimleriyle birlikte hazırla
  const activeGroupsWithNames = useMemo(() => {
    return activeGroupIds.map(groupId => {
      const group = allGroups.find(g => g.id === groupId) || groups.find(g => g.id === groupId);
      const latestExecution = groupExecutions
        .filter(exec => exec.groupId === groupId)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
      const schedule = schedules.find(s => s.groupId === groupId);

      // Grubun gerçek task sayısını assignments üzerinden al
      const groupAssignments = assignments.filter(a => a.groupId === groupId);
      const realTotalTasks = groupAssignments.length;

      // Bugün çalışan task'ların statülerini hesapla
      let realCompletedTasks = 0;
      let realFailedTasks = 0;

      groupAssignments.forEach(assignment => {
        const statusKey = `${groupId}-${assignment.taskItemId}`;
        const status = effectiveTodayStatuses[statusKey];

        if (status === 'Completed') {
          realCompletedTasks++;
        } else if (status === 'Failed') {
          realFailedTasks++;
        }
      });

      // Eğer execution yoksa ama schedule varsa, bu grup bugün çalışacak demektir
      const isScheduled = !latestExecution && schedule !== undefined;
      const isRunning = latestExecution?.endTime === null || latestExecution?.endTime === undefined;
      const allTasksFinished = (realCompletedTasks + realFailedTasks) === realTotalTasks && realTotalTasks > 0;

      // Grup statüsünü belirle (gerçek task sayılarına göre)
      let groupStatus: 'running' | 'completed' | 'failed' | 'partial' | 'scheduled' = 'scheduled';
      if (latestExecution) {
        // Herhangi bir task başarısızsa, grup statüsü failed veya partial olmalı
        if (realFailedTasks > 0) {
          // Tüm task'lar tamamlandıysa (başarılı + başarısız = toplam) failed
          if (allTasksFinished) {
            groupStatus = 'failed';
          } else {
            // Bazı task'lar hala çalışıyorsa partial
            groupStatus = 'partial';
          }
        } else if (allTasksFinished) {
          // Hiç başarısız yok ve tüm task'lar tamamlandıysa completed
          groupStatus = 'completed';
        } else if (isRunning) {
          // Execution devam ediyor ve henüz başarısız yoksa running
          groupStatus = 'running';
        } else {
          // Execution bitmiş ama task'lar tamamlanmamış (beklenmeyen durum)
          groupStatus = 'partial';
        }
      } else if (isScheduled) {
        groupStatus = 'scheduled';
      }

      return {
        id: groupId,
        name: group?.name || 'Bilinmeyen Grup',
        isRunning: isRunning,
        isScheduled: isScheduled,
        status: groupStatus,
        startTime: latestExecution?.startTime,
        endTime: latestExecution?.endTime,
        scheduleStartTime: schedule?.startTime,
        completedTasks: realCompletedTasks,
        failedTasks: realFailedTasks,
        totalTasks: realTotalTasks,
        groupExecutionId: latestExecution?.id,
        // Bu gruptaki tüm bugünkü execution'lar
        allExecutions: groupExecutions
          .filter(exec => exec.groupId === groupId)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
      };
    });
  }, [activeGroupIds, allGroups, groups, groupExecutions, schedules, assignments, effectiveTodayStatuses, flowItems]);

  if (activeGroupsWithNames.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">
        Bugün çalışan veya çalışmış grup bulunmuyor.
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4 h-[calc(100vh-200px)] overflow-hidden">
      {/* Üst kısım: Sol ve sağ yan yana */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sol taraf: Grup listesi */}
        <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Aktif Gruplar
          </h3>
          <div className="space-y-2">
            {activeGroupsWithNames.map((group) => {
              // Statüye göre renk belirle
              const getStatusColor = (status: string) => {
                if (selectedGroupId === group.id) {
                  // Seçili grup için daha koyu tonlar
                  switch (status) {
                    case 'running':
                      return 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100 border-2 border-green-400';
                    case 'completed':
                      return 'bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 border-2 border-blue-400';
                    case 'failed':
                      return 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 border-2 border-red-400';
                    case 'partial':
                      return 'bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100 border-2 border-orange-400';
                    case 'scheduled':
                      return 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 border-2 border-yellow-400';
                    default:
                      return 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100';
                  }
                } else {
                  // Seçili olmayan grup için açık tonlar
                  switch (status) {
                    case 'running':
                      return 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-green-500';
                    case 'completed':
                      return 'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-blue-500';
                    case 'failed':
                      return 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-red-500';
                    case 'partial':
                      return 'bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-orange-500';
                    case 'scheduled':
                      return 'bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-yellow-500';
                    default:
                      return 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100';
                  }
                }
              };

              return (
                <div key={group.id} className="space-y-0.5">
                <button
                  onClick={() => { setSelectedGroupId(group.id); manualGroupExecutionRef.current = null; setLocalTodayStatuses(null); setLocalTodayStatusesWithErrors(null); }}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${getStatusColor(group.status)}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium truncate">{group.name}</span>
                    <div className="flex items-center gap-1">
                      {group.status === 'running' && (
                        <span className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full animate-pulse ml-2" title="Çalışıyor"></span>
                      )}
                      {group.status === 'completed' && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full ml-2" title="Tamamlandı"></span>
                      )}
                      {group.status === 'failed' && (
                        <span className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full ml-2" title="Başarısız"></span>
                      )}
                      {group.status === 'partial' && (
                        <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full ml-2" title="Kısmen Tamamlandı"></span>
                      )}
                      {group.status === 'scheduled' && (
                        <span className="flex-shrink-0 w-2 h-2 bg-yellow-500 rounded-full ml-2" title="Planlanmış"></span>
                      )}
                    </div>
                  </div>
                  {group.totalTasks > 0 && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {group.completedTasks}/{group.totalTasks} tamamlandı
                      {group.failedTasks > 0 && `, ${group.failedTasks} başarısız`}
                    </div>
                  )}
                  {group.isScheduled && !group.startTime && group.scheduleStartTime && (
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                      Planlanan: {group.scheduleStartTime.substring(0, 5)}
                    </div>
                  )}
                  {group.startTime && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Başlangıç: {new Date(group.startTime).toLocaleTimeString('tr-TR')}
                    </div>
                  )}
                  {group.groupExecutionId && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                      Exec ID: {group.groupExecutionId.substring(0, 8)}...
                    </div>
                  )}
                  {group.endTime && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Bitiş: {new Date(group.endTime).toLocaleTimeString('tr-TR')}
                    </div>
                  )}
                </button>

                {/* Çalışma Geçmişi Toggle */}
                {group.allExecutions && group.allExecutions.length > 0 && (
                  <button
                    onClick={() => setExpandedGroupId(expandedGroupId === group.id ? null : group.id)}
                    className="w-full flex items-center justify-between px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors"
                  >
                    <span>📋 {group.allExecutions.length} çalışma geçmişi</span>
                    <svg className={`w-3 h-3 transition-transform ${expandedGroupId === group.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}

                {/* Collapsible Execution Listesi */}
                {expandedGroupId === group.id && group.allExecutions && (
                  <div className="ml-2 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-600 pl-2">
                    {group.allExecutions.map((exec: any) => {
                      const isSelected = (manualGroupExecutionRef.current === exec.id) || (!manualGroupExecutionRef.current && selectedGroupExecutionId === exec.id);
                      const execStatus = exec.status || (exec.endTime ? (exec.failedTasks > 0 ? 'Failed' : 'Completed') : 'Running');
                      const execStatusColor = execStatus === 'Running' ? '#eab308' : execStatus === 'Completed' ? '#059669' : execStatus === 'Failed' ? '#ef4444' : '#9ca3af';
                      const flowName = exec.flowItemId ? flowItems.find((f: any) => f.id === exec.flowItemId)?.name : null;
                      return (
                        <button
                          key={exec.id}
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            manualGroupExecutionRef.current = exec.id;
                            setSelectedGroupExecutionId(exec.id);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                            isSelected
                              ? 'bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-400 dark:ring-blue-500'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex-shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: execStatusColor }} />
                            <span className="text-gray-700 dark:text-gray-300">
                              {new Date(exec.startTime).toLocaleTimeString('tr-TR')}
                            </span>
                            {exec.endTime && (
                              <span className="text-gray-400 dark:text-gray-500">
                                → {new Date(exec.endTime).toLocaleTimeString('tr-TR')}
                              </span>
                            )}
                          </div>
                          {flowName && (
                            <div className="mt-0.5 text-blue-600 dark:text-blue-400 font-medium">
                              🔗 {flowName}
                            </div>
                          )}
                          <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                            {statusLabels[execStatus] || execStatus}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {/* Sağ taraf: Seçilen grubun flow'u */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {selectedGroupId ? activeGroupsWithNames.find(g => g.id === selectedGroupId)?.name : 'Grup Seçin'}
            </h3>
            <div className="flex items-center gap-4">
              {selectedGroupId && (
                <button
                  onClick={() => setShowStartModal(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  disabled={isStarting}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {isStarting ? 'Başlatılıyor...' : 'Grup Başlat'}
                </button>
              )}
              <div className="flex gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('Running') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Çalışıyor</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('Ready') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Hazır</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('Pending') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Beklemede</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('WaitingRetry') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Yeniden Deneme</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('Completed') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Tamamlandı</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('MarkedAsSuccess') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Başarılı Sayıldı</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('Failed') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Başarısız</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor('Paused') }}></div>
                  <span className="text-gray-600 dark:text-gray-400">Duraklatıldı</span>
                </div>
              </div>
            </div>
          </div>

          {selectedFlow ? (
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col overflow-hidden min-h-0">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={memoizedNodeTypes}
                fitView
                fitViewOptions={{
                  padding: 10, // Padding artırıldı (taskları daha iyi görünür hale getirmek için)
                  minZoom: 1.2, // 2 birim daha yakınlaştırıldı (0.72 -> 1.2)
                  maxZoom: 2,
                }}
                minZoom={0.5}
                maxZoom={3}
                defaultViewport={{ x: 0, y: 0, zoom: 1.2 }} // 2 birim daha yakınlaştırıldı (1.0 -> 1.2)
                className="bg-gray-50 dark:bg-gray-900"
                style={{ width: '100%', height: '100%', minHeight: 0 }}
              >
                <Background />
                <Controls />
                <MiniMap
                  nodeColor={(node) => {
                    const status = node.data?.status;
                    return getStatusColor(status);
                  }}
                />
              </ReactFlow>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow-md text-gray-500 dark:text-gray-400">
              Lütfen sol taraftan bir grup seçin
            </div>
          )}
        </div>
      </div>

      {/* Alt kısım: Kronolojik Execution Logları */}
      {selectedGroupId && (
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              Execution Logları - {activeGroupsWithNames.find(g => g.id === selectedGroupId)?.name || 'Bilinmeyen Grup'}
            </h4>
            <button
              onClick={loadExecutionLogs}
              disabled={loadingExecutionLogs}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors flex items-center gap-1"
            >
              <svg
                className={`w-4 h-4 ${loadingExecutionLogs ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loadingExecutionLogs ? 'Yükleniyor...' : 'Yenile'}
            </button>
          </div>
          {loadingExecutionLogs ? (
            <div className="text-center py-4 text-gray-500">Yükleniyor...</div>
          ) : (
            <textarea
              readOnly
              value={executionLogs || ''}
              className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono text-gray-900 dark:text-gray-100 resize-none"
              placeholder="Seçili grubun execution logları burada görünecek..."
            />
          )}
        </div>
      )}

      {/* Başlatma Modal */}
      {showStartModal && selectedGroupId && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Grup Başlatma Seçenekleri
            </h3>

            <div className="space-y-4 mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="startOption"
                  value="fromBeginning"
                  checked={startFromTaskId === null}
                  onChange={() => setStartFromTaskId(null)}
                  className="w-4 h-4 text-blue-600"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">Baştan Başlat</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Tüm task'ları sıfırlayıp baştan başlatır</div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="startOption"
                  value="fromTask"
                  checked={startFromTaskId !== null}
                  onChange={() => {
                    // İlk task'ı varsayılan olarak seç
                    const groupAssignments = assignments.filter(a => a.groupId === selectedGroupId);
                    if (groupAssignments.length > 0) {
                      const sortedAssignments = [...groupAssignments].sort((a, b) => a.order - b.order);
                      setStartFromTaskId(sortedAssignments[0].taskItemId);
                    }
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-white">Belirli Task'tan Başlat</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Seçilen task ve sonrasındaki task'ları başlatır</div>
                  {startFromTaskId !== null && (
                    <select
                      value={startFromTaskId}
                      onChange={(e) => setStartFromTaskId(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      {(() => {
                        const groupAssignments = assignments.filter(a => a.groupId === selectedGroupId);
                        const sortedAssignments = [...groupAssignments].sort((a, b) => a.order - b.order);
                        return sortedAssignments.map(assignment => {
                          const task = tasks.find(t => t.id === assignment.taskItemId);
                          return (
                            <option key={assignment.id} value={assignment.taskItemId}>
                              #{assignment.order} - {task?.name || 'Bilinmeyen Task'}
                            </option>
                          );
                        });
                      })()}
                    </select>
                  )}
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowStartModal(false);
                  setStartFromTaskId(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                disabled={isStarting}
              >
                İptal
              </button>
              <ProtectedButton
                permission="actions.group.start"
                onClick={handleStartGroup}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                disabled={isStarting}
              >
                {isStarting ? 'Başlatılıyor...' : 'Başlat'}
              </ProtectedButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
