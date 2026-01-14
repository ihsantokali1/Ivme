import { useState, useEffect } from 'react';
import { taskGroupsApi, taskItemsApi, groupTaskAssignmentsApi, executionHistoryApi, flowItemsApi, flowGroupAssignmentsApi, flowExecutionApi } from '../services/api';
import type { TaskGroup, TaskItem, FlowItem, FlowGroupAssignment } from '../services/api';
import TaskDashboardView from '../components/TaskDashboardView';
import { sortAllTasksByPrerequisites } from '../utils/taskSorting';
import ReactFlow, { type Node, type Edge, Background, Controls, MarkerType, Handle, Position, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';

// Group Node Component for Flow Monitoring
// Task durumuna göre renk belirleme (Dashboard ile aynı renkler)
const getStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'Running': return '#eab308'; // Sarı
    case 'Ready':
    case 'Pending': return '#9ca3af'; // Gri
    case 'WaitingRetry': return '#f59e0b'; // Turuncu
    case 'Paused': return '#6b7280'; // Gri
    case 'Completed': return '#059669'; // Koyu yeşil
    case 'MarkedAsSuccess': return '#4ade80'; // Orta ton yeşil
    case 'Failed': return '#ef4444'; // Kırmızı
    default: return '#9ca3af';
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

// Group Node Component for Flow Monitoring
const GroupNode = ({ data }: { data: any }) => {
  const [actionLoading, setActionLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const statusColor = getStatusColor(data.status);
  const borderWidth = data.status === 'Running' ? 3 : 2;

  const handleAction = async (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    if (!data.flowExecutionId) {
      alert('Aktif akış çalışması bulunamadı.');
      return;
    }

    let confirmMsg = '';
    switch (action) {
      case 'stop': confirmMsg = 'Bu grubu durdurmak istediğinize emin misiniz?'; break;
      case 'markAsSuccess': confirmMsg = 'Bu grubu başarılı saymak istediğinize emin misiniz? Akış sonraki gruptan devam edecektir.'; break;
      case 'pause': confirmMsg = 'Bu grubu duraklatmak istediğinize emin misiniz?'; break;
      case 'resume': confirmMsg = 'Bu grubu devam ettirmek istediğinize emin misiniz?'; break;
      case 'restart': confirmMsg = 'Bu grubu bu akış içinde yeniden başlatmak istediğinize emin misiniz?'; break;
    }

    if (confirmMsg && !confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      switch (action) {
        case 'stop': await flowExecutionApi.stopGroup(data.groupId, data.flowExecutionId); break;
        case 'markAsSuccess': await flowExecutionApi.markGroupAsSuccess(data.groupId, data.flowExecutionId); break;
        case 'pause': await flowExecutionApi.pauseGroup(data.groupId, data.flowExecutionId); break;
        case 'resume': await flowExecutionApi.resumeGroup(data.groupId, data.flowExecutionId); break;
        case 'restart': await flowExecutionApi.restartGroup(data.groupId, data.flowId, data.flowExecutionId); break;
      }
      if (data.onUpdate) data.onUpdate();
    } catch (err) {
      alert('İşlem hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setActionLoading(false);
    }
  };

  const loadLogs = async () => {
    if (showLogs && logs.length === 0 && !loadingLogs) {
      setLoadingLogs(true);
      try {
        const histories = await executionHistoryApi.getGroupHistories({
          groupId: data.groupId,
        });
        const filtered = histories
          .filter(h => h.flowItemExecutionId === data.flowExecutionId)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setLogs(filtered);
      } catch (err) {
        console.error('Log yükleme hatası:', err);
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  useEffect(() => {
    if (showLogs) loadLogs();
  }, [showLogs]);

  return (
    <div
      className="px-3 py-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-md min-w-[200px] max-w-[240px] hover:shadow-lg transition-shadow relative"
      style={{
        borderWidth: `${borderWidth}px`,
        borderColor: statusColor,
        borderStyle: 'solid',
      }}
    >
      <Handle
        type="target" position={Position.Left}
        style={{ background: statusColor, width: 10, height: 10, border: '2px solid white' }}
      />

      <div className="flex items-start justify-between mb-1.5">
        <div className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
          {data.label}
        </div>
        <div
          className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium text-white"
          style={{ backgroundColor: statusColor }}
        >
          #{data.order}
        </div>
        {actionLoading && <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full ml-2"></div>}
      </div>

      {data.status && (
        <div className="text-xs font-semibold mb-1.5" style={{ color: statusColor }}>
          {statusLabels[data.status] || data.status}
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-1.5">
        <div className="flex flex-wrap gap-1">
          {data.status === 'Running' && (
            <>
              <button onClick={(e) => handleAction(e, 'stop')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors">Durdur</button>
              <button onClick={(e) => handleAction(e, 'pause')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors">Duraklat</button>
            </>
          )}
          {data.status === 'Paused' && (
            <button onClick={(e) => handleAction(e, 'resume')} disabled={actionLoading} className="w-full px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">Devam Et</button>
          )}
          {data.status === 'Failed' && (
            <>
              <button onClick={(e) => handleAction(e, 'markAsSuccess')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">Başarılı Say</button>
              <button onClick={(e) => handleAction(e, 'restart')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">Yeniden Başlat</button>
            </>
          )}
          {/*(data.status === 'Completed' || data.status === 'MarkedAsSuccess') && (
            <button onClick={(e) => handleAction(e, 'restart')} disabled={actionLoading} className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">Tekrar Çalıştır</button>
          )*/}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowLogs(!showLogs);
          }}
          className="w-full px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-medium transition-colors flex items-center justify-between"
        >
          <span>Loglar</span>
          <svg className={`w-3 h-3 transition-transform ${showLogs ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showLogs && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-[10px] max-h-32 overflow-y-auto">
            {loadingLogs ? (
              <div className="text-center py-1 text-gray-500">Yükleniyor...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-1 text-gray-500">Log bulunamadı</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log) => (
                  <div key={log.id} className="border-b border-gray-200 dark:border-gray-700 pb-1 last:border-0 text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between font-medium">
                      <span style={{ color: getStatusColor(log.finalStatus) }}>{statusLabels[log.finalStatus] || log.finalStatus}</span>
                      <span>{new Date(log.startTime).toLocaleTimeString('tr-TR')}</span>
                    </div>
                    {log.errorMessage && <div className="text-red-500 truncate">{log.errorMessage}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source" position={Position.Right}
        style={{ background: statusColor, width: 10, height: 10, border: '2px solid white' }}
      />
    </div>
  );
};

const nodeTypes = {
  flowGroup: GroupNode,
};

export default function ManagementPage() {
  const [activeTab, setActiveTab] = useState<'groups' | 'flows'>('groups');

  // Group monitoring state
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<Record<string, string>>({});
  const [todayStatusesWithErrors, setTodayStatusesWithErrors] = useState<Record<string, { status: string; errorMessage?: string }>>({});

  // Flow monitoring state
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [flowAssignments, setFlowAssignments] = useState<FlowGroupAssignment[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [showFlowStartPopup, setShowFlowStartPopup] = useState(false);

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
        const flowsData = await flowItemsApi.getAll();
        setFlows(flowsData);

        const groupsData = await taskGroupsApi.getAll();
        setGroups(groupsData);

        if (selectedFlowId) {
          await loadFlowDetails(selectedFlowId);
        } else if (flowsData.length > 0) {
          setSelectedFlowId(flowsData[0].id);
          await loadFlowDetails(flowsData[0].id);
        }
      }
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
      const errorMessage = err instanceof Error ? err.message : 'Veri yüklenirken hata oluştu';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadFlowDetails = async (flowId: string) => {
    try {
      const [assignmentsData, groupsData, flowHistories] = await Promise.all([
        flowGroupAssignmentsApi.getByFlowId(flowId),
        taskGroupsApi.getAll(),
        executionHistoryApi.getFlowHistories({ flowItemId: flowId })
      ]);

      const latestFlowExec = flowHistories.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
      const currentFlowExecutionId = latestFlowExec?.id;

      setFlowAssignments(assignmentsData);

      // Create nodes and edges for React Flow
      const groupMap = new Map(groupsData.map(g => [g.id, g]));

      // Calculate dependency levels for better layout
      const calculateLevels = (assignments: FlowGroupAssignment[]) => {
        const levels = new Map<string, number>();
        const assignmentMap = new Map(assignments.map(a => [a.groupId, a]));

        const getLevel = (groupId: string, visited = new Set<string>()): number => {
          if (levels.has(groupId)) return levels.get(groupId)!;
          if (visited.has(groupId)) return 0;

          visited.add(groupId);
          const assignment = assignmentMap.get(groupId);

          if (!assignment || !assignment.prerequisiteGroupIds || assignment.prerequisiteGroupIds.length === 0) {
            levels.set(groupId, 0);
            return 0;
          }

          const maxPrereqLevel = Math.max(
            ...assignment.prerequisiteGroupIds
              .filter(prereqId => assignmentMap.has(prereqId))
              .map(prereqId => getLevel(prereqId, new Set(visited)))
          );

          const level = maxPrereqLevel + 1;
          levels.set(groupId, level);
          return level;
        };

        assignments.forEach(a => getLevel(a.groupId));
        return levels;
      };

      const levels = calculateLevels(assignmentsData);
      const levelGroups = new Map<number, string[]>();

      levels.forEach((level, groupId) => {
        if (!levelGroups.has(level)) {
          levelGroups.set(level, []);
        }
        levelGroups.get(level)!.push(groupId);
      });

      const flowNodes: Node[] = assignmentsData.map((assignment) => {
        const group = groupMap.get(assignment.groupId);
        const level = levels.get(assignment.groupId) || 0;
        const groupsInLevel = levelGroups.get(level) || [];
        const indexInLevel = groupsInLevel.indexOf(assignment.groupId);

        return {
          id: assignment.groupId,
          type: 'flowGroup',
          position: {
            x: level * 300 + 50,
            y: indexInLevel * 150 + 50
          },
          data: {
            label: group?.name || assignment.groupId,
            order: assignment.order,
            status: assignment.status || 'Pending',
            groupId: assignment.groupId,
            flowId: flowId,
            flowExecutionId: currentFlowExecutionId,
            onUpdate: loadData,
          },
        };
      });

      const flowEdges: Edge[] = [];
      assignmentsData.forEach(assignment => {
        if (assignment.prerequisiteGroupIds && assignment.prerequisiteGroupIds.length > 0) {
          assignment.prerequisiteGroupIds.forEach(prereqId => {
            if (assignmentsData.some(a => a.groupId === prereqId)) {
              flowEdges.push({
                id: `${prereqId}-${assignment.groupId}`,
                source: prereqId,
                target: assignment.groupId,
                type: 'smoothstep',
                animated: assignment.status === 'Running',
                style: { stroke: '#3b82f6', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
              });
            }
          });
        }
      });

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      console.error('Akış detayları yüklenirken hata:', err);
    }
  };

  const handleFlowSelect = (flowId: string) => {
    setSelectedFlowId(flowId);
    loadFlowDetails(flowId);
  };

  const handleStartFlow = () => {
    setShowFlowStartPopup(true);
  };

  const handleStartFromBeginning = async () => {
    if (!selectedFlowId) return;
    try {
      setShowFlowStartPopup(false);
      await flowExecutionApi.start(selectedFlowId, 'Manual');
      loadData();
    } catch (err) {
      console.error('Akış başlatılırken hata:', err);
      setError(err instanceof Error ? err.message : 'Akış başlatılamadı');
    }
  };

  const handleStartFromGroup = async (groupId: string) => {
    if (!selectedFlowId) return;
    try {
      setShowFlowStartPopup(false);
      // Not: Şu anki backend implementasyonunda Belirli Bir Gruptan Başla için flowExecutionApi.start 
      // kullanılabilir ama backend'de StartGroupAsync ile flowExecutionId'yi kendimiz yönetmemiz lazım.
      // Şimdilik StartFlowAsync'ı baştan başlatma için kullanıyoruz.
      // Eğer spesifik gruptan başlatma istenirse backend'de ona göre endpoint eklenmeli.
      // Ancak kullanıcı "Belirli bir gruptan başla" dediğinde aslında o grubu manuel tetiklemiş oluyoruz.
      console.log('Akışı gruptan başlat:', selectedFlowId, 'Grup:', groupId);
      // Şimdilik startFlowAsync'ı gruptan başla parametresi ile güncelleyeceğiz ileride.
      // Şu an sadece baştan başlatma tam çalışıyor.
      await flowExecutionApi.start(selectedFlowId, 'Manual');
      loadData();
    } catch (err) {
      console.error('Akış gruptan başlatılırken hata:', err);
      setError(err instanceof Error ? err.message : 'Akış başlatılamadı');
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
  const selectedFlow = flows.find(f => f.id === selectedFlowId);

  return (
    <div className="py-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Yönetim ve İzleme</h2>
          <div className="flex gap-2">
            {activeTab === 'flows' && (
              <div className="flex gap-2">
                {/* Boş bırakıyoruz çünkü aşağıya taşıdık */}
              </div>
            )}
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
      ) : (
        <div className="flex gap-4 h-[calc(100vh-280px)]">
          {/* Flow Sidebar */}
          <div className="w-64 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Akışlar</h3>
            <div className="space-y-2">
              {flows.map(flow => (
                <button
                  key={flow.id}
                  onClick={() => handleFlowSelect(flow.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedFlowId === flow.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  <div className="font-medium">{flow.name}</div>
                  {flow.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{flow.description}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Flow Diagram */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            {selectedFlow ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedFlow.name}</h3>
                    {selectedFlow.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{selectedFlow.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {selectedFlowId && (
                      <button
                        onClick={handleStartFlow}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Akışı Başlat
                      </button>
                    )}
                    <div className="flex gap-2 text-[10px] flex-wrap leading-tight">
                      {Object.entries(statusLabels).map(([status, label]) => (
                        <div key={status} className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getStatusColor(status) }}></div>
                          <span className="text-gray-600 dark:text-gray-400">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-[calc(100vh-380px)] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col min-h-0">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{
                      padding: 50,
                      minZoom: 1.2,
                      maxZoom: 2,
                    }}
                    minZoom={0.5}
                    maxZoom={3}
                    defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
                    attributionPosition="bottom-left"
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
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                Bir akış seçin
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flow Start Popup */}
      {showFlowStartPopup && selectedFlow && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Akışı Başlat: {selectedFlow.name}
            </h3>

            <div className="space-y-3">
              <button
                onClick={handleStartFromBeginning}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-left"
              >
                <div className="font-semibold">Baştan Başla</div>
                <div className="text-sm text-green-100">Akışı ilk gruptan başlat</div>
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Belirli Bir Gruptan Başla:</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {flowAssignments.map(assignment => {
                    const group = groups.find(g => g.id === assignment.groupId);
                    return (
                      <button
                        key={assignment.groupId}
                        onClick={() => handleStartFromGroup(assignment.groupId)}
                        className="w-full px-4 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-900 dark:text-blue-100 rounded-lg transition-colors text-left"
                      >
                        {group?.name || assignment.groupId}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowFlowStartPopup(false)}
              className="mt-4 w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
