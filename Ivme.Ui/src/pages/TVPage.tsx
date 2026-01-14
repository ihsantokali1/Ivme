import { useState, useEffect, useMemo } from 'react';
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
import { taskGroupsApi, taskItemsApi, groupTaskAssignmentsApi, executionHistoryApi } from '../services/api';
import type { TaskGroup, TaskItem, GroupTaskAssignment, GroupExecutionHistory, TaskExecutionHistory } from '../services/api';
import { calculateTaskLevels } from '../utils/taskSorting';

// Task durumuna göre renk belirleme (ManagementPage ile senkronize)
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

// Custom node component - TV görünümü için
const TVTaskNode = ({ data }: {
  data: {
    task: TaskItem;
    assignment: GroupTaskAssignment;
    order: number;
    level: number;
    status?: string;
    progress?: number;
  }
}) => {
  const statusColor = getStatusColor(data.status);
  const borderWidth = data.status === 'Running' ? 4 : 2;

  return (
    <div
      className="px-4 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg min-w-[220px] max-w-[280px] hover:shadow-xl transition-shadow relative"
      style={{
        borderWidth: `${borderWidth}px`,
        borderColor: statusColor,
        borderStyle: 'solid',
      }}
    >
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
        <div className="text-sm font-bold text-gray-900 dark:text-white flex-1 leading-tight">
          {data.task.name}
        </div>
        <div
          className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap"
          style={{ backgroundColor: statusColor }}
        >
          #{data.order + 1}
        </div>
      </div>

      {data.status && (
        <div className="text-[11px] font-bold mb-2 uppercase tracking-wider" style={{ color: statusColor }}>
          {statusLabels[data.status] || data.status}
        </div>
      )}

      {data.progress !== undefined && data.status === 'Running' && (
        <div className="mb-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-gray-500 font-medium">İlerleme</span>
            <span className="text-[10px] font-bold" style={{ color: statusColor }}>{data.progress}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all duration-500 shadow-sm"
              style={{
                width: `${data.progress}%`,
                backgroundColor: statusColor,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="opacity-70">Seviye:</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{data.level}</span>
        </div>

        {data.task.sourceType === 'StoredProcedure' && (
          <div className="flex items-center gap-1.5 text-[10px] text-purple-600 dark:text-purple-400">
            <span className="opacity-70">🔧 SP:</span>
            <span className="font-semibold truncate max-w-[150px]">{data.task.storedProcedureName}</span>
          </div>
        )}

        {data.assignment.prerequisiteTaskItemIds.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400">
            <span className="opacity-70">📋</span>
            <span className="font-semibold">{data.assignment.prerequisiteTaskItemIds.length} önşart</span>
          </div>
        )}
      </div>

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
    </div>
  );
};

const nodeTypes = {
  tvTask: TVTaskNode,
};

export default function TVPage() {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [groupExecutions, setGroupExecutions] = useState<GroupExecutionHistory[]>([]);
  const [taskExecutions, setTaskExecutions] = useState<Map<string, TaskExecutionHistory[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Her 5 saniyede bir sadece veriyi yenile (sayfayı yenileme)
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Bugünün başlangıcı ve sonu
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [groupsData, taskItemsData, executionsData] = await Promise.all([
        taskGroupsApi.getAll(),
        taskItemsApi.getAll(),
        executionHistoryApi.getGroupHistories({
          startDate: today.toISOString(),
          endDate: tomorrow.toISOString(),
        }),
      ]);

      setGroups(groupsData);
      setTaskItems(taskItemsData);
      setGroupExecutions(executionsData);

      // Her grup execution için task execution'ları yükle
      const taskExecutionsMap = new Map<string, TaskExecutionHistory[]>();
      for (const groupExec of executionsData) {
        try {
          const taskExecs = await executionHistoryApi.getTaskHistories({
            groupId: groupExec.groupId,
            startDate: groupExec.startTime,
            endDate: groupExec.endTime ?? tomorrow.toISOString(),
          });
          // Bu group execution'a ait task execution'ları filtrele
          // (GroupExecutionId ile eşleşenleri al)
          const filteredExecs = taskExecs.filter(te => {
            // Task execution'ların groupExecutionId'si yoksa, startTime'a göre filtrele
            const taskStartTime = new Date(te.startTime);
            const groupStartTime = new Date(groupExec.startTime);
            return taskStartTime >= groupStartTime;
          });
          taskExecutionsMap.set(groupExec.id, filteredExecs);
        } catch (err) {
          console.error(`Task executions yüklenirken hata (${groupExec.id}):`, err);
        }
      }
      setTaskExecutions(taskExecutionsMap);
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  // Bugün çalışan veya çalışmış grupları filtrele
  const activeGroups = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return groupExecutions
      .filter(exec => {
        // Bugün başlamış ve henüz bitmemiş veya bugün bitmiş
        const startDate = new Date(exec.startTime);
        const isToday = startDate >= todayStart;
        if (!isToday) return false;

        if (exec.endTime) {
          const endDate = new Date(exec.endTime);
          return endDate >= todayStart;
        }
        return true; // Henüz bitmemiş
      })
      .map(exec => exec.groupId)
      .filter((groupId, index, self) => self.indexOf(groupId) === index); // Unique
  }, [groupExecutions]);


  /*if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-gray-600 dark:text-gray-400 text-2xl">
        Yükleniyor...
      </div>
    );
  }

  if (loading && activeGroups.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen text-gray-600 dark:text-gray-400 text-2xl">
        Yükleniyor...
      </div>
    );
  }*/

  if (loading && activeGroups.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 text-xl font-medium">Veriler Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (activeGroups.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
          <div className="text-6xl mb-4">📊</div>
          <div className="text-gray-600 dark:text-gray-400 text-2xl font-semibold">
            Bugün çalışan veya çalışmış grup bulunamadı.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-50 dark:bg-gray-900 overflow-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {activeGroups.map(groupId => (
          <div key={groupId} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden" style={{ height: '600px' }}>
            <TVFlowView
              groupId={groupId}
              groups={groups}
              taskItems={taskItems}
              groupExecutions={groupExecutions}
              taskExecutions={taskExecutions}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// TV Flow View Component
function TVFlowView({
  groupId,
  groups,
  taskItems,
  groupExecutions,
  taskExecutions,
}: {
  groupId: string;
  groups: TaskGroup[];
  taskItems: TaskItem[];
  groupExecutions: GroupExecutionHistory[];
  taskExecutions: Map<string, TaskExecutionHistory[]>;
}) {
  const [, setAssignments] = useState<GroupTaskAssignment[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  useEffect(() => {
    loadFlow();
  }, [groupId, groupExecutions, taskExecutions, taskItems]);

  const loadFlow = async () => {
    try {
      setLoading(true);
      const assignmentsData = await groupTaskAssignmentsApi.getByGroup(groupId);
      setAssignments(assignmentsData);

      const groupExec = groupExecutions.find(e => e.groupId === groupId);
      if (!groupExec) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const taskExecs = taskExecutions.get(groupExec.id) || [];

      // Task seviyelerini hesapla
      const groupTasks = assignmentsData
        .map(a => taskItems.find(t => t.id === a.taskItemId))
        .filter(t => t !== undefined) as TaskItem[];

      if (groupTasks.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const taskLevels = calculateTaskLevels(groupTasks, assignmentsData);

      // Her seviyedeki task'ları grupla
      const tasksByLevel = new Map<number, GroupTaskAssignment[]>();
      assignmentsData.forEach(assignment => {
        const task = taskItems.find(t => t.id === assignment.taskItemId);
        if (task) {
          const level = taskLevels.get(task.id) || 0;
          if (!tasksByLevel.has(level)) {
            tasksByLevel.set(level, []);
          }
          tasksByLevel.get(level)!.push(assignment);
        }
      });

      // Node'ları oluştur
      const newNodes: Node[] = [];
      tasksByLevel.forEach((levelAssignments) => {
        levelAssignments.sort((a, b) => a.order - b.order);

        levelAssignments.forEach((assignment, indexInLevel) => {
          const task = taskItems.find(t => t.id === assignment.taskItemId);
          if (!task) return;

          // Bu task için en son execution'ı bul
          const latestExecution = taskExecs
            .filter(e => e.taskItemId === task.id)
            .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];

          const taskLevel = taskLevels.get(task.id) || 0;
          const nodesInLevel = levelAssignments.length;
          const spacing = 180;
          const startY = 100;
          const totalHeight = (nodesInLevel - 1) * spacing;
          const y = startY + (indexInLevel * spacing) - (totalHeight / 2);

          newNodes.push({
            id: assignment.id,
            type: 'tvTask',
            position: {
              x: taskLevel * 350 + 100,
              y: y,
            },
            data: {
              task,
              assignment,
              order: assignment.order,
              level: taskLevel,
              status: latestExecution?.finalStatus || assignment.status || 'Pending',
              progress: latestExecution?.progress || assignment.progress || 0,
            },
          });
        });
      });

      // Edge'leri oluştur
      const newEdges: Edge[] = [];
      assignmentsData.forEach(assignment => {
        assignment.prerequisiteTaskItemIds.forEach(prereqId => {
          const prereqAssignment = assignmentsData.find(a => a.taskItemId === prereqId);
          if (prereqAssignment) {
            newEdges.push({
              id: `e-${prereqAssignment.id}-${assignment.id}`,
              source: prereqAssignment.id,
              target: assignment.id,
              sourceHandle: 'source',
              targetHandle: 'target',
              type: 'smoothstep',
              animated: assignment.status === 'Running',
              style: {
                stroke: '#3b82f6',
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#3b82f6',
              },
            });
          }
        });
      });

      setNodes(newNodes);
      setEdges(newEdges);
    } catch (err) {
      console.error('Flow yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedGroup = groups.find(g => g.id === groupId);
  const groupExec = groupExecutions.find(e => e.groupId === groupId);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 p-3 flex justify-between items-center">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">
            {selectedGroup?.name || 'Grup'}
          </h2>
          {groupExec && (
            <div className="text-xs text-blue-100 mt-1">
              Başlangıç: {new Date(groupExec.startTime).toLocaleString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
              {groupExec.endTime && (
                <> | Bitiş: {new Date(groupExec.endTime).toLocaleString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}</>
              )}
              {groupExec.totalTasks > 0 && (
                <> | {groupExec.completedTasks}/{groupExec.totalTasks} tamamlandı</>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Flow Canvas */}
      <div className="flex-1 relative" style={{ minHeight: '500px' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full text-gray-600 dark:text-gray-400">
            Yükleniyor...
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-500 dark:text-gray-400">
            Bu grupta task bulunamadı.
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={memoizedNodeTypes}
            fitView
            className="bg-gray-50 dark:bg-gray-900"
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
          >
            <Background />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const status = (node.data as any)?.status;
                return getStatusColor(status);
              }}
              maskColor="rgba(0, 0, 0, 0.3)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

