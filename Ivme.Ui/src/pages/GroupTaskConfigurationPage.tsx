import { useState, useEffect, useCallback, useMemo } from 'react';
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
  type Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { taskGroupsApi, taskItemsApi, groupTaskAssignmentsApi } from '../services/api';
import type { TaskGroup, TaskItem, GroupTaskAssignment } from '../services/api';
import { calculateTaskLevels } from '../utils/taskSorting';
import TaskAddForm from '../components/TaskAddForm';

// Custom node component
const TaskNode = ({ data }: { data: { task: TaskItem; assignment: GroupTaskAssignment; order: number; level: number } }) => {
  return (
    <div className="px-4 py-3 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-lg min-w-[200px] max-w-[250px] hover:shadow-xl transition-shadow relative">
      {/* Source handle (sağ tarafta - bağlantı çıkışı) */}
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ 
          background: '#3b82f6',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />
      
      {/* Target handle (sol tarafta - bağlantı girişi) */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ 
          background: '#3b82f6',
          width: 12,
          height: 12,
          border: '2px solid white',
        }}
      />

      <div className="flex items-start justify-between mb-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
          {data.task.name}
        </div>
        <div className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
          #{data.order + 1}
        </div>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Seviye: {data.level}
      </div>
      {data.task.description && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
          {data.task.description}
        </div>
      )}
      {data.assignment.prerequisiteTaskItemIds.length > 0 && (
        <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
          📋 {data.assignment.prerequisiteTaskItemIds.length} önşart
        </div>
      )}
      {data.task.sourceType === 'StoredProcedure' && (
        <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
          🔧 SP: {data.task.storedProcedureName}
        </div>
      )}
    </div>
  );
};

// nodeTypes objesini component dışında tanımla (her render'da yeniden oluşturulmasını önlemek için)
const nodeTypes = {
  task: TaskNode,
};

export default function GroupTaskConfigurationPage() {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskItems, setTaskItems] = useState<TaskItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<GroupTaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // nodeTypes'i memoize et (React Flow uyarısını önlemek için)
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      loadAssignments();
    } else {
      setAssignments([]);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (selectedGroupId && assignments.length > 0 && taskItems.length > 0) {
      updateFlow();
    } else if (selectedGroupId && assignments.length === 0) {
      // Tüm task'lar silindiğinde node'ları ve edge'leri temizle
      setNodes([]);
      setEdges([]);
    } else if (!selectedGroupId) {
      setNodes([]);
      setEdges([]);
    }
  }, [selectedGroupId, assignments, taskItems]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupsData, taskItemsData] = await Promise.all([
        taskGroupsApi.getAll(),
        taskItemsApi.getAll(),
      ]);
      setGroups(groupsData);
      setTaskItems(taskItemsData);
    } catch (err) {
      console.error('Veri yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    if (!selectedGroupId) return;
    try {
      const assignmentsData = await groupTaskAssignmentsApi.getByGroup(selectedGroupId);
      setAssignments(assignmentsData);
    } catch (err) {
      console.error('Assignment\'lar yüklenirken hata:', err);
      setAssignments([]);
    }
  };

  // Order'ları yeniden sırala (görsel pozisyona göre - soldan sağa, seviye bazlı)
  const reorderAssignments = async (groupId: string) => {
    try {
      const assignmentsData = await groupTaskAssignmentsApi.getByGroup(groupId);
      if (assignmentsData.length === 0) return;

      // Task seviyelerini hesapla (görsel sıralama için)
      const groupTasks = assignmentsData
        .map(a => taskItems.find(t => t.id === a.taskItemId))
        .filter(t => t !== undefined) as TaskItem[];
      
      if (groupTasks.length === 0) return;

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

      // Seviyeleri sırala ve her seviyedeki task'ları order'a göre sırala
      const sortedLevels = Array.from(tasksByLevel.keys()).sort((a, b) => a - b);
      const sortedAssignments: GroupTaskAssignment[] = [];
      
      sortedLevels.forEach(level => {
        const levelAssignments = tasksByLevel.get(level)!;
        // Aynı seviyedeki task'ları order'a göre sırala
        levelAssignments.sort((a, b) => a.order - b.order);
        sortedAssignments.push(...levelAssignments);
      });

      // Order'ları görsel sıralamaya göre 0'dan başlayarak yeniden atama
      const updatePromises = sortedAssignments.map((assignment, index) => {
        if (assignment.order !== index) {
          return groupTaskAssignmentsApi.update({
            ...assignment,
            order: index,
          });
        }
        return Promise.resolve(assignment);
      });

      await Promise.all(updatePromises);
      
      // Assignments'ı yeniden yükle
      if (groupId === selectedGroupId) {
        await loadAssignments();
      }
    } catch (err) {
      console.error('Order yenileme hatası:', err);
    }
  };

  const updateFlow = (assignmentsToUse?: GroupTaskAssignment[]) => {
    const assignmentsForFlow = assignmentsToUse ?? assignments;
    
    if (!selectedGroupId || assignmentsForFlow.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Task seviyelerini hesapla
    const groupTasks = assignmentsForFlow
      .map(a => taskItems.find(t => t.id === a.taskItemId))
      .filter(t => t !== undefined) as TaskItem[];
    
    const taskLevels = calculateTaskLevels(groupTasks, assignmentsForFlow);

    // Her seviyedeki task'ları grupla
    const tasksByLevel = new Map<number, GroupTaskAssignment[]>();
    assignmentsForFlow.forEach(assignment => {
      const task = taskItems.find(t => t.id === assignment.taskItemId);
      if (task) {
        const level = taskLevels.get(task.id) || 0;
        if (!tasksByLevel.has(level)) {
          tasksByLevel.set(level, []);
        }
        tasksByLevel.get(level)!.push(assignment);
      }
    });

    // Node'ları oluştur - seviyeye göre dikey, aynı seviyedeki task'ları yatay sırala
    const newNodes: Node[] = [];
    
    tasksByLevel.forEach((levelAssignments) => {
      // Aynı seviyedeki task'ları order'a göre sırala
      levelAssignments.sort((a, b) => a.order - b.order);
      
      levelAssignments.forEach((assignment, indexInLevel) => {
        const task = taskItems.find(t => t.id === assignment.taskItemId);
        if (!task) return;

        const taskLevel = taskLevels.get(task.id) || 0;
        const nodesInLevel = levelAssignments.length;
        const spacing = 180; // Node'lar arası mesafe
        const startY = 100;
        const totalHeight = (nodesInLevel - 1) * spacing;
        const y = startY + (indexInLevel * spacing) - (totalHeight / 2);

        newNodes.push({
          id: assignment.id,
          type: 'task',
          position: {
            x: taskLevel * 350 + 100,
            y: y,
          },
          data: {
            task,
            assignment,
            order: assignment.order,
            level: taskLevel,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });
    });

    // Edge'leri oluştur (önşart ilişkileri)
    const newEdges: Edge[] = [];
    assignmentsForFlow.forEach(assignment => {
      assignment.prerequisiteTaskItemIds.forEach(prereqId => {
        const prereqAssignment = assignmentsForFlow.find(a => a.taskItemId === prereqId);
        if (prereqAssignment) {
          newEdges.push({
            id: `e-${prereqAssignment.id}-${assignment.id}`,
            source: prereqAssignment.id,
            target: assignment.id,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'smoothstep',
            animated: true,
            style: { 
              stroke: '#3b82f6', 
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#3b82f6',
              width: 20,
              height: 20,
            },
            label: 'önşart',
            labelStyle: { fill: '#3b82f6', fontWeight: 600, fontSize: 12 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          });
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

  const handleAddTask = async (taskItemId: string, parameterValues?: Record<string, string>) => {
    if (!selectedGroupId) return;
    
    const maxOrder = assignments.length > 0 
      ? Math.max(...assignments.map(a => a.order)) 
      : -1;
    
    try {
      await groupTaskAssignmentsApi.create({
        groupId: selectedGroupId,
        taskItemId: taskItemId,
        order: maxOrder + 1,
        prerequisiteTaskItemIds: [],
        taskParameterValues: parameterValues || {},
      });
      // Order'ları yeniden sırala
      await reorderAssignments(selectedGroupId);
      // Assignments'ı yeniden yükle
      const assignmentsData = await groupTaskAssignmentsApi.getByGroup(selectedGroupId);
      setAssignments(assignmentsData);
      // updateFlow'u yeni assignments ile çağır
      updateFlow(assignmentsData);
    } catch (err) {
      alert('Task ekleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  const handleRemoveTask = async (assignmentId: string) => {
    if (!confirm('Bu task\'ı gruptan kaldırmak istediğinize emin misiniz?')) {
      return;
    }
    try {
      await groupTaskAssignmentsApi.delete(assignmentId);
      // Silme işleminden sonra order'ları yeniden sırala
      if (selectedGroupId) {
        await reorderAssignments(selectedGroupId);
        // Assignments'ı yeniden yükle
        const assignmentsData = await groupTaskAssignmentsApi.getByGroup(selectedGroupId);
        setAssignments(assignmentsData);
        // updateFlow'u yeni assignments ile çağır
        updateFlow(assignmentsData);
      }
    } catch (err) {
      alert('Task kaldırma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      
      // Yeni bağlantı oluşturulduğunda önşart olarak ekle
      const sourceAssignment = assignments.find(a => a.id === params.source);
      const targetAssignment = assignments.find(a => a.id === params.target);
      
      if (sourceAssignment && targetAssignment && sourceAssignment.id !== targetAssignment.id) {
        // Eğer zaten önşart olarak eklenmişse ekleme
        if (!targetAssignment.prerequisiteTaskItemIds.includes(sourceAssignment.taskItemId)) {
          handleTogglePrerequisite(targetAssignment.id, sourceAssignment.taskItemId);
        }
      }
    },
    [assignments]
  );

  const handleTogglePrerequisite = async (assignmentId: string, prerequisiteTaskId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment || !selectedGroupId) return;

    const newPrerequisites = assignment.prerequisiteTaskItemIds.includes(prerequisiteTaskId)
      ? assignment.prerequisiteTaskItemIds.filter(id => id !== prerequisiteTaskId)
      : [...assignment.prerequisiteTaskItemIds, prerequisiteTaskId];

    try {
      await groupTaskAssignmentsApi.update({
        ...assignment,
        prerequisiteTaskItemIds: newPrerequisites,
      });
      // Order'ları yeniden sırala
      await reorderAssignments(selectedGroupId);
      // Assignments'ı yeniden yükle
      await loadAssignments();
    } catch (err) {
      alert('Önşart güncelleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    }
  };

  const handleEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      if (!selectedGroupId) return;
      
      for (const edge of deletedEdges) {
        // Edge'in source ve target property'lerini kullan
        const sourceId = edge.source;
        const targetId = edge.target;
        
        if (sourceId && targetId) {
          const sourceAssignment = assignments.find(a => a.id === sourceId);
          const targetAssignment = assignments.find(a => a.id === targetId);
          
          if (sourceAssignment && targetAssignment && sourceAssignment.id !== targetAssignment.id) {
            // Önşart ilişkisini kaldır (eğer varsa)
            if (targetAssignment.prerequisiteTaskItemIds.includes(sourceAssignment.taskItemId)) {
              const assignment = assignments.find(a => a.id === targetAssignment.id);
              if (assignment) {
                const newPrerequisites = assignment.prerequisiteTaskItemIds.filter(
                  id => id !== sourceAssignment.taskItemId
                );

                try {
                  await groupTaskAssignmentsApi.update({
                    ...assignment,
                    prerequisiteTaskItemIds: newPrerequisites,
                  });
                } catch (err) {
                  console.error('Önşart kaldırma hatası:', err);
                  alert('Önşart kaldırma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
                  return; // Hata durumunda dur
                }
              }
            }
          }
        }
      }
      // Tüm silme işlemleri tamamlandıktan sonra order'ları yeniden sırala
      try {
        await reorderAssignments(selectedGroupId);
        // Assignments'ı yeniden yükle
        const assignmentsData = await groupTaskAssignmentsApi.getByGroup(selectedGroupId);
        setAssignments(assignmentsData);
      } catch (err) {
        console.error('Assignment\'lar yüklenirken hata:', err);
      }
    },
    [assignments, selectedGroupId]
  );

  const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
    const assignment = assignments.find(a => a.id === node.id);
    if (assignment && confirm('Bu task\'ı gruptan kaldırmak istediğinize emin misiniz?')) {
      handleRemoveTask(assignment.id);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;
  }

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const assignedTaskItemIds = assignments.map(a => a.taskItemId);
  const availableTaskItems = taskItems.filter(t => !assignedTaskItemIds.includes(t.id));

  return (
    <div className="py-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sol panel - Grup seçimi ve task ekleme */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b-2 border-gray-200 dark:border-gray-700 pb-2">
              Grup Seç
            </h3>
            <select
              value={selectedGroupId || ''}
              onChange={(e) => setSelectedGroupId(e.target.value || null)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Grup seçin...</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {selectedGroupId && availableTaskItems.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Task Ekle
              </h3>
              <TaskAddForm
                taskItems={availableTaskItems}
                onAddTask={handleAddTask}
              />
            </div>
          )}

          {selectedGroupId && assignments.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Bilgiler
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <div>
                  <strong className="text-gray-900 dark:text-white">Grup:</strong> {selectedGroup?.name}
                </div>
                <div>
                  <strong className="text-gray-900 dark:text-white">Task Sayısı:</strong> {assignments.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                  <p>• Task'ları sürükleyerek konumlandırabilirsiniz</p>
                  <p>• Task'lar arasında bağlantı çizmek için bir task'tan diğerine sürükleyin</p>
                  <p>• Bağlantıyı seçip Delete/Backspace tuşuna basarak silebilirsiniz</p>
                  <p>• Task'a çift tıklayarak kaldırabilirsiniz</p>
                  <p>• Mavi çizgiler önşart ilişkilerini gösterir</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sağ panel - React Flow canvas */}
        <div className="lg:col-span-3">
          {selectedGroupId ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4" style={{ height: '800px' }}>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {selectedGroup?.name} - Task Akış Diyagramı
              </h3>
              {assignments.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  Bu gruba henüz task eklenmemiş.
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onEdgesDelete={handleEdgesDelete}
                  onNodeDoubleClick={handleNodeDoubleClick}
                  nodeTypes={memoizedNodeTypes}
                  fitView
                  className="bg-gray-50 dark:bg-gray-900"
                  deleteKeyCode={['Backspace', 'Delete']}
                >
                  <Background />
                  <Controls />
                  <MiniMap />
                </ReactFlow>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center text-gray-500 dark:text-gray-400">
              Lütfen bir grup seçin
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
