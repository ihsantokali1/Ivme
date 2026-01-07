import { useMemo, useRef, useEffect } from 'react';
import type { TaskItem, GroupTaskAssignment } from '../services/api';
import TaskCard from './TaskCard';

interface TaskFlowViewProps {
  tasks: TaskItem[];
  assignments: GroupTaskAssignment[];
  todayStatuses?: Record<string, string>; // Bugünün execution history'den gelen statüler (groupId-taskId -> status)
  todayStatusesWithErrors?: Record<string, { status: string; errorMessage?: string }>;
  onUpdate: () => void;
  groups?: Array<{ id: string; name: string }>; // Grup bilgisi (opsiyonel)
}

interface TaskNode {
  task: TaskItem;
  column: number;
  row: number;
  prerequisites: string[];
  dependents: string[];
  groupTaskId: string; // Benzersiz grup-task ID: groupId-taskId
  groupId: string; // Grup ID
}

export default function TaskFlowView({ tasks, assignments, todayStatuses = {}, todayStatusesWithErrors = {}, onUpdate, groups = [] }: TaskFlowViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Task'ları kolonlara ve satırlara ayır
  const taskLayout = useMemo(() => {
    if (tasks.length === 0) return { nodes: [], connections: [] };

    // Dependency graph oluştur - HER GRUP İÇİN AYRI (groupTaskId kullanarak)
    const inDegree = new Map<string, number>(); // groupTaskId -> inDegree
    const graph = new Map<string, string[]>(); // groupTaskId -> [dependent groupTaskIds]
    const reverseGraph = new Map<string, string[]>(); // groupTaskId -> [prerequisite groupTaskIds]

    // Her assignment için node oluştur
    assignments.forEach(assignment => {
      const groupTaskId = `${assignment.groupId}-${assignment.taskItemId}`;
      inDegree.set(groupTaskId, 0);
      graph.set(groupTaskId, []);
      reverseGraph.set(groupTaskId, []);
    });

    // Bağlantıları oluştur - SADECE AYNI GRUP İÇİNDEKİ
    assignments.forEach(assignment => {
      const currentGroupTaskId = `${assignment.groupId}-${assignment.taskItemId}`;
      
      assignment.prerequisiteTaskItemIds.forEach(prereqTaskId => {
        // Önşart task'ın aynı grup içinde olup olmadığını kontrol et
        const prereqAssignment = assignments.find(
          a => a.taskItemId === prereqTaskId && a.groupId === assignment.groupId
        );
        
        if (prereqAssignment) {
          const prereqGroupTaskId = `${prereqAssignment.groupId}-${prereqAssignment.taskItemId}`;
          
          // Graph'a ekle
          const dependents = graph.get(prereqGroupTaskId) || [];
          dependents.push(currentGroupTaskId);
          graph.set(prereqGroupTaskId, dependents);

          const prereqs = reverseGraph.get(currentGroupTaskId) || [];
          prereqs.push(prereqGroupTaskId);
          reverseGraph.set(currentGroupTaskId, prereqs);

          const currentInDegree = inDegree.get(currentGroupTaskId) || 0;
          inDegree.set(currentGroupTaskId, currentInDegree + 1);
        }
      });
    });

    // Kolonları belirle (topological sort ile seviyeleri bul) - groupTaskId bazlı
    const columns = new Map<string, number>(); // groupTaskId -> column
    const queue: string[] = [];

    // İlk seviye (in-degree 0 olanlar)
    inDegree.forEach((degree, groupTaskId) => {
      if (degree === 0) {
        queue.push(groupTaskId);
        columns.set(groupTaskId, 0);
      }
    });

    while (queue.length > 0) {
      const currentGroupTaskId = queue.shift()!;
      const currentColumn = columns.get(currentGroupTaskId) || 0;

      const dependents = graph.get(currentGroupTaskId) || [];
      dependents.forEach(dependentGroupTaskId => {
        const currentInDegree = inDegree.get(dependentGroupTaskId) || 0;
        inDegree.set(dependentGroupTaskId, currentInDegree - 1);

        if (currentInDegree - 1 === 0) {
          queue.push(dependentGroupTaskId);
          columns.set(dependentGroupTaskId, currentColumn + 1);
        }
      });
    }

    // Kalan task'ları (cycle varsa) en son kolona ekle
    assignments.forEach(assignment => {
      const groupTaskId = `${assignment.groupId}-${assignment.taskItemId}`;
      if (!columns.has(groupTaskId)) {
        const maxColumn = Math.max(...Array.from(columns.values()), -1);
        columns.set(groupTaskId, maxColumn + 1);
      }
    });

    // Her grup için ayrı kolonlar oluştur
    const groupColumns = new Map<string, Map<number, Array<{ assignment: GroupTaskAssignment; task: TaskItem }>>>();
    const addedGroupTaskIds = new Set<string>();
    
    assignments.forEach(assignment => {
      const groupTaskId = `${assignment.groupId}-${assignment.taskItemId}`;
      
      if (addedGroupTaskIds.has(groupTaskId)) {
        return;
      }
      
      const columnIndex = columns.get(groupTaskId) || 0;
      const task = tasks.find(t => t.id === assignment.taskItemId);
      
      if (!task) return;
      
      if (!groupColumns.has(assignment.groupId)) {
        groupColumns.set(assignment.groupId, new Map());
      }
      
      const groupColumnMap = groupColumns.get(assignment.groupId)!;
      if (!groupColumnMap.has(columnIndex)) {
        groupColumnMap.set(columnIndex, []);
      }
      
      groupColumnMap.get(columnIndex)!.push({ assignment, task });
      addedGroupTaskIds.add(groupTaskId);
    });

    // Her kolondaki task'ları sırala (order'a göre)
    groupColumns.forEach((columnMap) => {
      columnMap.forEach((taskList) => {
        taskList.sort((a, b) => a.assignment.order - b.assignment.order);
      });
    });

    // Node'ları oluştur
    const nodes: TaskNode[] = [];
    groupColumns.forEach((columnMap) => {
      const sortedColumns = Array.from(columnMap.entries()).sort((a, b) => a[0] - b[0]);
      
      sortedColumns.forEach(([columnIndex, taskList]) => {
        taskList.forEach(({ assignment, task }, row) => {
          const groupTaskId = `${assignment.groupId}-${assignment.taskItemId}`;
          const prereqs = reverseGraph.get(groupTaskId) || [];
          const dependents = graph.get(groupTaskId) || [];
          
          nodes.push({
            task,
            column: columnIndex,
            row,
            prerequisites: prereqs,
            dependents,
            groupTaskId,
            groupId: assignment.groupId,
          });
        });
      });
    });

    // Bağlantıları oluştur - groupTaskId kullanarak
    const connections: Array<{ from: string; to: string }> = [];
    assignments.forEach(assignment => {
      const currentGroupTaskId = `${assignment.groupId}-${assignment.taskItemId}`;
      
      assignment.prerequisiteTaskItemIds.forEach(prereqTaskId => {
        const prereqAssignment = assignments.find(
          a => a.taskItemId === prereqTaskId && a.groupId === assignment.groupId
        );
        
        if (prereqAssignment) {
          const prereqGroupTaskId = `${prereqAssignment.groupId}-${prereqAssignment.taskItemId}`;
          connections.push({
            from: prereqGroupTaskId,
            to: currentGroupTaskId,
          });
        }
      });
    });

    return { nodes, connections };
  }, [tasks, assignments]);

  // Task'ları gruplara göre grupla
  const tasksByGroup = useMemo(() => {
    if (groups.length === 0) {
      return null;
    }

    const grouped = new Map<string, TaskItem[]>();
    
    const groupIds = new Set(groups.map(g => g.id));
    
    groups.forEach(group => {
      grouped.set(group.id, []);
    });
    
    assignments.forEach(assignment => {
      if (groupIds.has(assignment.groupId)) {
        const task = tasks.find(t => t.id === assignment.taskItemId);
        if (task) {
          grouped.get(assignment.groupId)!.push(task);
        }
      }
    });

    if (groups.length > 1) {
      const assignedTaskIds = new Set(assignments.map(a => a.taskItemId));
      const unassignedTasks = tasks.filter(t => !assignedTaskIds.has(t.id));
      if (unassignedTasks.length > 0) {
        grouped.set('unassigned', unassignedTasks);
      }
    }

    return Object.fromEntries(grouped);
  }, [tasks, assignments, groups]);

  // SVG bağlantı çizgilerini çiz
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) {
      return;
    }

    const svg = svgRef.current;
    const container = containerRef.current;

    const drawConnections = () => {
      try {
        svg.innerHTML = '';

        const containerHeight = Math.max(container.scrollHeight, container.clientHeight);
        const containerWidth = Math.max(container.scrollWidth, container.clientWidth);
        svg.setAttribute('width', containerWidth.toString());
        svg.setAttribute('height', containerHeight.toString());
        svg.style.width = containerWidth + 'px';
        svg.style.height = containerHeight + 'px';

        const getStatusColor = (status: string): string => {
          switch (status) {
            case 'Completed': return '#4CAF50';
            case 'Running': return '#2196F3';
            case 'Paused': return '#FF9800';
            case 'Failed': return '#F44336';
            default: return '#9E9E9E';
          }
        };

        const filteredConnections = taskLayout.connections;
        if (!filteredConnections || filteredConnections.length === 0) {
          return;
        }

        const connectionsByTarget = new Map<string, Array<{ from: string; to: string }>>();
        filteredConnections.forEach(conn => {
          if (!connectionsByTarget.has(conn.to)) {
            connectionsByTarget.set(conn.to, []);
          }
          connectionsByTarget.get(conn.to)!.push(conn);
        });

        connectionsByTarget.forEach((connections, targetGroupTaskId) => {
          const toElement = container.querySelector(`[data-group-task-id="${targetGroupTaskId}"]`) as HTMLElement;
          if (!toElement) {
            return;
          }

          const toRect = toElement.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const scrollLeft = container.scrollLeft;
          const scrollTop = container.scrollTop;
          const toX = toRect.left - containerRect.left + scrollLeft;
          const toY = toRect.top - containerRect.top + scrollTop + toRect.height / 2;

          if (connections.length > 1) {
            // Birden fazla önşart varsa, önşartların ortasından hedef task'a çizgi çek
            const fromElements = connections
              .map(conn => {
                const el = container.querySelector(`[data-group-task-id="${conn.from}"]`) as HTMLElement;
                return el;
              })
              .filter(el => el !== null);

            if (fromElements.length === 0) {
              return;
            }

            const fromRects = fromElements.map(el => el.getBoundingClientRect());
            const fromY = fromRects.reduce((sum, rect) => sum + (rect.top - containerRect.top + scrollTop + rect.height / 2), 0) / fromRects.length;
            const fromX = Math.max(...fromRects.map(rect => rect.right - containerRect.left + scrollLeft));

            // Önşartların durumlarını kontrol et (en kötü durumu al)
            // groupTaskId formatı: "groupId-taskId" (her ikisi de GUID, yani 5 parçalı)
            // İlk 5 parçayı (0-4) grup ID, kalanını (5+) task ID olarak al
            const prerequisiteStatuses = connections
              .map(conn => {
                const parts = conn.from.split('-');
                if (parts.length < 6) return undefined; // Geçersiz format
                // İlk 5 parçayı (0-4) grup ID, kalanını (5+) task ID
                const groupId = parts.slice(0, 5).join('-');
                const taskId = parts.slice(5).join('-');
                
                // GroupTaskAssignment'tan durumu al (grup bazlı durum)
                const assignment = assignments.find(a => a.groupId === groupId && a.taskItemId === taskId);
                const task = tasks.find(t => t.id === taskId);
                
                if (!task) return undefined;
                
                // Bugünün execution history'den statüyü al
                const statusKey = assignment ? `${assignment.groupId}-${assignment.taskItemId}` : undefined;
                return statusKey ? (todayStatuses[statusKey] || undefined) : undefined;
              })
              .filter(s => s !== undefined) as string[];

            const validStatuses = prerequisiteStatuses.filter(s => s !== undefined);
            if (validStatuses.length === 0) {
              return;
            }

            const statusPriority: Record<string, number> = {
              'Failed': 4, 'Paused': 3, 'Running': 2, 'Completed': 1,
            };

            const worstStatus = validStatuses.reduce((worst, status) => {
              if (!worst) return status;
              if (!status) return worst;
              const currentPriority = statusPriority[status] || 0;
              const worstPriority = statusPriority[worst] || 0;
              return currentPriority > worstPriority ? status : worst;
            }, validStatuses[0]);

            const lineColor = worstStatus ? getStatusColor(worstStatus) : '#9E9E9E';

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const horizontalDistance = toX - fromX;
            const controlOffset = Math.max(Math.abs(horizontalDistance) * 0.4, 50);
            const path = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`;
            line.setAttribute('d', path);
            line.setAttribute('stroke', lineColor);
            line.setAttribute('stroke-width', '2');
            line.setAttribute('fill', 'none');
            line.style.opacity = '0.7';
            line.style.strokeLinecap = 'round';
            svg.appendChild(line);
          } else {
            // Tek önşart varsa, normal çizgi çiz
            const connection = connections[0];
            const fromElement = container.querySelector(`[data-group-task-id="${connection.from}"]`) as HTMLElement;
            if (!fromElement) {
              return;
            }

            const fromRect = fromElement.getBoundingClientRect();
            const fromX = fromRect.right - containerRect.left + scrollLeft;
            const fromY = fromRect.top - containerRect.top + scrollTop + fromRect.height / 2;

            // groupTaskId formatı: "groupId-taskId" (her ikisi de GUID, yani 5 parçalı)
            const parts = connection.from.split('-');
            if (parts.length < 6) return; // Geçersiz format
            const groupId = parts.slice(0, 5).join('-');
            const taskId = parts.slice(5).join('-');
            
            // Bugünün execution history'den statüyü al
            const assignment = assignments.find(a => a.groupId === groupId && a.taskItemId === taskId);
            const statusKey = assignment ? `${assignment.groupId}-${assignment.taskItemId}` : undefined;
            const taskStatus = statusKey ? todayStatuses[statusKey] : undefined;
            const lineColor = taskStatus ? getStatusColor(taskStatus) : '#9E9E9E';

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const horizontalDistance = toX - fromX;
            const controlOffset = Math.max(Math.abs(horizontalDistance) * 0.4, 50);
            const path = `M ${fromX} ${fromY} C ${fromX + controlOffset} ${fromY}, ${toX - controlOffset} ${toY}, ${toX} ${toY}`;
            line.setAttribute('d', path);
            line.setAttribute('stroke', lineColor);
            line.setAttribute('stroke-width', '2');
            line.setAttribute('fill', 'none');
            line.style.opacity = '0.7';
            line.style.strokeLinecap = 'round';
            svg.appendChild(line);
          }
        });
      } catch (error) {
        console.error('Error in drawConnections:', error);
      }
    };

    let animationFrameId: number;
    const scheduleDraw = () => {
      animationFrameId = requestAnimationFrame(() => {
        setTimeout(drawConnections, 100);
      });
    };
    
    scheduleDraw();

    const handleScroll = () => {
      scheduleDraw();
    };

    const handleResize = () => {
      scheduleDraw();
    };

    container.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [taskLayout, tasks, groups, assignments]);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">
        Henüz task item tanımlanmamış.
      </div>
    );
  }

  if (tasksByGroup && Object.keys(tasksByGroup).length > 0) {
    return (
      <div className="relative w-full min-h-[500px] overflow-x-auto overflow-y-visible py-8" ref={containerRef}>
        <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 overflow-visible" />
        <div className="flex flex-col gap-8 relative z-10 px-8">
          {Object.entries(tasksByGroup).map(([groupId]) => {
            const group = groups.find(g => g.id === groupId);
            const groupName = group ? group.name : (groupId === 'unassigned' ? 'Grup Atanmamış Task\'lar' : 'Bilinmeyen Grup');
            
            const groupNodes = taskLayout.nodes.filter(node => {
              return node.groupTaskId.startsWith(`${groupId}-`);
            });
            
            if (groupNodes.length === 0 && groupId !== 'unassigned') {
              return (
                <div key={groupId} className="border-2 border-blue-600 dark:border-blue-400 rounded-xl p-6 bg-blue-50/50 dark:bg-blue-900/20 relative">
                  <div className="mb-6 pb-3 border-b-2 border-blue-600 dark:border-blue-400">
                    <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400 m-0">{groupName}</h3>
                  </div>
                  <div className="flex gap-6 items-start">
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">Bu grupta task yok.</div>
                  </div>
                </div>
              );
            }
            
            const groupColumns = new Map<number, TaskNode[]>();
            groupNodes.forEach(node => {
              if (!groupColumns.has(node.column)) {
                groupColumns.set(node.column, []);
              }
              groupColumns.get(node.column)!.push(node);
            });
            const sortedColumns = Array.from(groupColumns.entries()).sort((a, b) => a[0] - b[0]);

            return (
              <div key={groupId} className="border-2 border-blue-600 dark:border-blue-400 rounded-xl p-6 bg-blue-50/50 dark:bg-blue-900/20 relative">
                <div className="mb-6 pb-3 border-b-2 border-blue-600 dark:border-blue-400">
                  <h3 className="text-xl font-semibold text-blue-600 dark:text-blue-400 m-0">{groupName}</h3>
                </div>
                <div className="flex gap-6 items-start">
                  {sortedColumns.length > 0 ? (
                    sortedColumns.map(([columnIndex, nodes]) => (
                      <div key={columnIndex} className="flex flex-col items-center min-w-[250px] flex-shrink-0">
                        <div className="w-full text-center py-2 px-4 bg-blue-600 dark:bg-blue-500 text-white rounded-t-lg font-semibold text-sm mb-4">
                          Seviye {columnIndex + 1}
                        </div>
                        <div className="flex flex-col gap-4 w-full">
                          {nodes.map((node) => (
                            <div
                              key={node.groupTaskId}
                              className="relative w-full z-20"
                              data-group-task-id={node.groupTaskId}
                            >
                              <TaskCard
                                task={node.task}
                                onUpdate={onUpdate}
                                showEditButton={false}
                                assignment={assignments.find(a => a.groupId === node.groupId && a.taskItemId === node.task.id)}
                                todayStatus={todayStatuses[`${node.groupId}-${node.task.id}`]}
                                todayError={todayStatusesWithErrors[`${node.groupId}-${node.task.id}`]?.errorMessage}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">Bu grupta task yok.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[500px] overflow-x-auto overflow-y-visible py-8" ref={containerRef}>
      <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 overflow-visible" />
      <div className="flex gap-6 items-start relative z-10 px-4">
        {Array.from(new Map(taskLayout.nodes.map(n => [n.column, n])).entries())
          .sort((a, b) => a[0] - b[0])
          .map(([columnIndex]) => {
            const columnNodes = taskLayout.nodes.filter(n => n.column === columnIndex);
            return (
              <div key={columnIndex} className="flex flex-col items-center min-w-[250px] flex-shrink-0">
                <div className="w-full text-center py-2 px-4 bg-blue-600 dark:bg-blue-500 text-white rounded-t-lg font-semibold text-sm mb-4">
                  Seviye {columnIndex + 1}
                </div>
                <div className="flex flex-col gap-4 w-full">
                  {columnNodes.map((node) => (
                    <div
                      key={node.groupTaskId}
                      className="relative w-full z-20"
                      data-group-task-id={node.groupTaskId}
                    >
                      <TaskCard
                        task={node.task}
                        onUpdate={onUpdate}
                        showEditButton={false}
                        assignment={assignments.find(a => a.groupId === node.groupId && a.taskItemId === node.task.id)}
                        todayStatus={todayStatuses[`${node.groupId}-${node.task.id}`]}
                        todayError={todayStatusesWithErrors[`${node.groupId}-${node.task.id}`]?.errorMessage}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
