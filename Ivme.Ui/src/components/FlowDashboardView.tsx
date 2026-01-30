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
import type { TaskGroup, FlowItem, FlowGroupAssignment, FlowExecutionHistory, GroupExecutionHistory } from '../services/api';
import { calculateTaskLevels as calculateGroupLevels } from '../utils/taskSorting'; // We reuse this since the interface is compatible enough (levels chart)
import { executionHistoryApi, flowExecutionApi, flowItemsApi, flowGroupAssignmentsApi, taskGroupsApi } from '../services/api';
import ProtectedButton from './ProtectedButton';

// Status colors match TaskDashboardView
const getStatusColor = (status: string | undefined): string => {
    switch (status) {
        case 'Running':
            return '#eab308'; // Yellow - Running
        case 'Ready':
            return '#9ca3af'; // Gray - Ready
        case 'Pending':
            return '#9ca3af'; // Gray - Pending
        case 'WaitingRetry':
            return '#f59e0b'; // Orange - Waiting Retry
        case 'Paused':
            return '#6b7280'; // Gray - Paused
        case 'Completed':
            return '#059669'; // Dark Green - Completed
        case 'MarkedAsSuccess':
            return '#4ade80'; // Light Green - Marked as Success
        case 'Failed':
            return '#ef4444'; // Red - Failed
        default:
            return '#9ca3af'; // Default - Gray
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

// Custom node component for Groups in a Flow
const DashboardGroupNode = ({ data, flowExecutions }: {
    data: {
        group: TaskGroup;
        assignment: FlowGroupAssignment;
        order: number;
        level: number;
        status?: string;
        flowName?: string;
        flowExecutionId?: string;
        onUpdate?: () => void;
    };
    flowExecutions?: FlowExecutionHistory[];
}) => {
    const statusColor = getStatusColor(data.status);
    const borderWidth = data.status === 'Running' ? 3 : 2;
    const [actionLoading, setActionLoading] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState<GroupExecutionHistory[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

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
                case 'stop': await flowExecutionApi.stopGroup(data.group.id, data.flowExecutionId); break;
                case 'markAsSuccess': await flowExecutionApi.markGroupAsSuccess(data.group.id, data.flowExecutionId); break;
                case 'pause': await flowExecutionApi.pauseGroup(data.group.id, data.flowExecutionId); break;
                case 'resume': await flowExecutionApi.resumeGroup(data.group.id, data.flowExecutionId); break;
                case 'restart': await flowExecutionApi.restartGroup(data.group.id, data.assignment.flowItemId, data.flowExecutionId); break;
            }
            if (data.onUpdate) data.onUpdate();
        } catch (err) {
            alert('İşlem hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        } finally {
            setActionLoading(false);
        }
    };

    // Load logs for this group in the context of the flow execution
    const loadLogs = async () => {
        if (showLogs && logs.length === 0 && !loadingLogs) {
            setLoadingLogs(true);
            try {
                if (!data.flowExecutionId) {
                    setLogs([]);
                    setLoadingLogs(false);
                    return;
                }

                // Fetch group histories specifically for this flow execution
                const histories = await executionHistoryApi.getGroupHistories({
                    groupId: data.group.id,
                    flowItemExecutionId: data.flowExecutionId
                });

                const sortedHistories = histories
                    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

                setLogs(sortedHistories);
            } catch (err) {
                console.error('Log yükleme hatası:', err);
            } finally {
                setLoadingLogs(false);
            }
        }
    };

    useEffect(() => {
        if (showLogs) {
            loadLogs();
        }
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
            <Handle type="source" position={Position.Right} id="source" style={{ background: statusColor, width: 10, height: 10, border: '2px solid white' }} />
            <Handle type="target" position={Position.Left} id="target" style={{ background: statusColor, width: 10, height: 10, border: '2px solid white' }} />

            <div className="flex items-start justify-between mb-1.5">
                <div className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
                    {data.group.name}
                </div>
                <div
                    className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: statusColor }}
                >
                    #{data.order}
                </div>
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
                            <ProtectedButton permission="actions.group.stop" onClick={(e) => handleAction(e, 'stop')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors">Durdur</ProtectedButton>
                            <ProtectedButton permission="actions.group.stop" onClick={(e) => handleAction(e, 'pause')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors">Duraklat</ProtectedButton>
                        </>
                    )}
                    {data.status === 'Paused' && (
                        <ProtectedButton permission="actions.group.start" onClick={(e) => handleAction(e, 'resume')} disabled={actionLoading} className="w-full px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">Devam Et</ProtectedButton>
                    )}
                    {data.status === 'Failed' && (
                        <>
                            <ProtectedButton permission="actions.group.start" onClick={(e) => handleAction(e, 'markAsSuccess')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">Başarılı Say</ProtectedButton>
                            <ProtectedButton permission="actions.group.start" onClick={(e) => handleAction(e, 'restart')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">Yeniden Başlat</ProtectedButton>
                        </>
                    )}
                </div>

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
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-gray-500 dark:text-gray-400">
                                                {new Date(log.startTime).toLocaleTimeString('tr-TR')}
                                            </span>
                                            {log.endTime && (
                                                <span className="text-gray-500 dark:text-gray-400">
                                                    - {new Date(log.endTime).toLocaleTimeString('tr-TR')}
                                                </span>
                                            )}
                                        </div>
                                        {/* Hata ve Task Metrikleri */}
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                            Top: {log.totalTasks} | OK: {log.completedTasks} | Fail: {log.failedTasks}
                                        </div>
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

interface FlowDashboardViewProps {
    flows: FlowItem[];
    groups: TaskGroup[]; // Used for resolving names
    onUpdate: () => void;
}

export default function FlowDashboardView({
    flows,
    groups,
    onUpdate,
}: FlowDashboardViewProps) {
    const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
    const [activeFlowIds, setActiveFlowIds] = useState<string[]>([]);
    const [flowExecutions, setFlowExecutions] = useState<FlowExecutionHistory[]>([]);
    const [activeGroupStatuses, setActiveGroupStatuses] = useState<Map<string, string>>(new Map());
    const [flowAssignments, setFlowAssignments] = useState<FlowGroupAssignment[]>([]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const [showStartModal, setShowStartModal] = useState(false);
    const [startFromGroupId, setStartFromGroupId] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    const [executionLogs, setExecutionLogs] = useState<string>('');
    const [loadingExecutionLogs, setLoadingExecutionLogs] = useState(false);
    const [taskItems, setTaskItems] = useState<any[]>([]);

    // Ref for node callback
    const flowExecutionsRef = useRef<FlowExecutionHistory[]>(flowExecutions);

    useEffect(() => {
        flowExecutionsRef.current = flowExecutions;
    }, [flowExecutions]);

    // Load Task Items once for names in logs
    useEffect(() => {
        import('../services/api').then(m => m.taskItemsApi.getAll().then(setTaskItems));
    }, []);

    const createDashboardGroupNode = useCallback((props: any) => {
        return <DashboardGroupNode {...props} flowExecutions={flowExecutionsRef.current} />;
    }, []);

    const memoizedNodeTypes = useMemo(() => ({
        dashboardGroup: createDashboardGroupNode,
    }), [createDashboardGroupNode]);

    // Load Active Flows (Executions in last 24h OR all available flows)
    // Matching TaskDashboardView approach: Periodic refresh
    useEffect(() => {
        const loadActiveFlows = async () => {
            try {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(todayStart);
                todayEnd.setDate(todayEnd.getDate() + 1);

                // Fetch executions for sidebar status
                const executions = await executionHistoryApi.getFlowHistories({
                    startDate: todayStart.toISOString(),
                    endDate: todayEnd.toISOString(),
                });

                setFlowExecutions(executions);
                // We show ALL flows in the sidebar regardless of execution status, 
                // similar to how TaskDashboardView shows "Active Groups" but we want to be able to select ANY flow.
                setActiveFlowIds(flows.map(f => f.id));

                // Auto-select first flow if none selected
                if (flows.length > 0 && !selectedFlowId) {
                    setSelectedFlowId(flows[0].id);
                }
            } catch (error) {
                console.error("Error loading active flows", error);
            }
        };

        loadActiveFlows();
        const interval = setInterval(loadActiveFlows, 3000);
        return () => clearInterval(interval);
    }, [flows, selectedFlowId]); // Refetch when flows or selection changes (to update logs/status)

    // Fetch Assignments AND Statuses when Selected Flow Changes or refreshes
    // This logic must be robust to prevent "disappearing groups"
    useEffect(() => {
        if (!selectedFlowId) return;

        let isMounted = true;

        const loadFlowData = async () => {
            try {
                // Parallel fetch: Assignments + execution history for this flow
                const [assignmentsData, rawFlowHistories] = await Promise.all([
                    flowGroupAssignmentsApi.getByFlowId(selectedFlowId),
                    executionHistoryApi.getFlowHistories({ flowItemId: selectedFlowId }) // Fetch all recent histories to find latest
                ]);

                if (!isMounted) return;

                // Find Latest Execution (active or completed)
                // Sort descending by start time
                const latestExecution = rawFlowHistories.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];

                // Map statuses if there's an execution
                const statusMap = new Map<string, string>();
                if (latestExecution) {
                    const groupHistories = await executionHistoryApi.getGroupHistories({ flowItemExecutionId: latestExecution.id });
                    if (isMounted) {
                        groupHistories.forEach(h => {
                            statusMap.set(h.groupId, h.finalStatus);
                        });
                    }
                }

                if (isMounted) {
                    setFlowAssignments(assignmentsData);
                    setActiveGroupStatuses(statusMap);
                    // Also trigger log update
                    loadFlowLogs(latestExecution, assignmentsData);
                }

            } catch (err) {
                console.error("Error loading flow data", err);
            }
        };

        loadFlowData();
        const interval = setInterval(loadFlowData, 3000); // Poll for status updates
        return () => {
            isMounted = false;
            clearInterval(interval);
        }
    }, [selectedFlowId]); // Only restart polling if Flow ID changes.

    // Build Diagram
    // Recalculate ONLY when assignments or Statuses change.
    useEffect(() => {
        if (!selectedFlowId || flowAssignments.length === 0) {
            if (!selectedFlowId) {
                setNodes([]);
                setEdges([]);
            }
            return;
        }

        const buildDiagram = () => {
            const flowId = selectedFlowId;
            const currentAssignments = flowAssignments;

            // Use the statuses map we fetched
            const latestExecution = flowExecutions.find(e => e.flowItemId === flowId); // Just for ID reference if needed in node data, but ideally passed from loadFlowData
            // Actually, we need the exact execution ID corresponding to the statuses.
            // Let's re-find it properly or use the one from state if we stored it.
            // For simplicity, re-finding locally is safe enough given the data freshness.

            // Better: We need the execution ID to pass to nodes for Actions.
            // The one in `activeGroupStatuses` comes from `latestExecution` found in `loadFlowData`.
            // We should store `currentFlowExecutionId` in state to be precise.
            // But finding it from `flowExecutions` (which is refreshed) is also acceptable.

            // Find latest execution for this flow from the global list (updated every 3s)
            const currentFlowExecution = flowExecutions
                .filter(e => e.flowItemId === flowId)
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];

            const flowExecutionId = currentFlowExecution?.id;

            // Calculate levels
            // Logic adapted from TaskDashboardView -> calculateTaskLevels
            // Here we do "calculateGroupLevels" manually since we are dealing with Groups not Tasks, 
            // but the graph structure is identical (ID + Prereqs).
            // Assignments have `prerequisiteGroupIds`.

            const levels = new Map<string, number>();
            const assignmentMap = new Map(currentAssignments.map(a => [a.groupId, a]));

            const getLevel = (groupId: string, visited = new Set<string>()): number => {
                if (levels.has(groupId)) return levels.get(groupId)!;
                if (visited.has(groupId)) return 0;
                visited.add(groupId);

                const assignment = assignmentMap.get(groupId);
                if (!assignment || !assignment.prerequisiteGroupIds?.length) {
                    levels.set(groupId, 0);
                    return 0;
                }

                const maxPrereqLevel = Math.max(
                    ...assignment.prerequisiteGroupIds
                        .filter(pid => assignmentMap.has(pid))
                        .map(pid => getLevel(pid, new Set(visited)))
                );

                const level = maxPrereqLevel + 1;
                levels.set(groupId, level);
                return level;
            };

            currentAssignments.forEach(a => getLevel(a.groupId));

            const levelGroups = new Map<number, string[]>();
            levels.forEach((lvl, gid) => {
                if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
                levelGroups.get(lvl)!.push(gid);
            });

            // Layout constants
            const levelSpacing = 350;

            const newNodes: Node[] = currentAssignments.map(assignment => {
                const group = groups.find(g => g.id === assignment.groupId);

                // Status Logic
                // 1. Get from activeGroupStatuses (realtime)
                let status = activeGroupStatuses.get(assignment.groupId);
                // 2. Fallback
                if (!status) status = 'Pending';

                const level = levels.get(assignment.groupId) || 0;
                const groupsInLevel = levelGroups.get(level) || [];
                // Sort by order within level for consistent vertical position
                groupsInLevel.sort((a, b) => {
                    const assignA = assignmentMap.get(a);
                    const assignB = assignmentMap.get(b);
                    return (assignA?.order || 0) - (assignB?.order || 0);
                });
                const index = groupsInLevel.indexOf(assignment.groupId);

                return {
                    id: assignment.groupId,
                    type: 'dashboardGroup',
                    position: { x: level * levelSpacing + 50, y: index * 200 + 50 },
                    data: {
                        group: group || { id: assignment.groupId, name: 'Unknown' },
                        assignment,
                        order: assignment.order,
                        level,
                        status: status,
                        flowName: flows.find(f => f.id === flowId)?.name,
                        flowExecutionId: flowExecutionId,
                        onUpdate: onUpdate
                    }
                };
            });

            const newEdges: Edge[] = [];
            currentAssignments.forEach(assignment => {
                assignment.prerequisiteGroupIds?.forEach(prereqId => {
                    if (currentAssignments.some(a => a.groupId === prereqId)) {
                        const prereqStatus = activeGroupStatuses.get(prereqId) || 'Pending';
                        const isAnimated = prereqStatus === 'Running';

                        newEdges.push({
                            id: `${prereqId}-${assignment.groupId}`,
                            source: prereqId,
                            target: assignment.groupId,
                            type: 'smoothstep',
                            animated: isAnimated,
                            style: { stroke: getStatusColor(prereqStatus), strokeWidth: 2 },
                            markerEnd: { type: MarkerType.ArrowClosed, color: getStatusColor(prereqStatus) }
                        });
                    }
                });
            });

            setNodes(newNodes);
            setEdges(newEdges);
        };

        buildDiagram();
    }, [selectedFlowId, flowAssignments, activeGroupStatuses, groups, flowExecutions /* triggers edge anim updates */]);


    // Separate function for Logs to be called by polling
    // We accept params to avoid dependency on state if called from closure
    const loadFlowLogs = async (latestFlowExecParam?: FlowExecutionHistory, assignmentsParam?: FlowGroupAssignment[]) => {
        if (!selectedFlowId) return;

        // If not provided, fetch (fallback) - but mainly we use the polling loop's data
        let latestFlowExec = latestFlowExecParam;

        if (!latestFlowExec) {
            try {
                const flowHistories = await executionHistoryApi.getFlowHistories({ flowItemId: selectedFlowId });
                latestFlowExec = flowHistories.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
            } catch (e) { console.error(e); }
        }

        if (!latestFlowExec) {
            setExecutionLogs('Henüz işlem kaydı bulunmuyor.');
            return;
        }

        try {
            setLoadingExecutionLogs(true);

            const [taskHistories, groupHistories] = await Promise.all([
                executionHistoryApi.getTaskHistories({ flowItemExecutionId: latestFlowExec.id }),
                executionHistoryApi.getGroupHistories({ flowItemExecutionId: latestFlowExec.id })
            ]);

            if (taskHistories.length === 0 && groupHistories.length === 0) {
                setExecutionLogs('Henüz detaylı işlem kaydı bulunmuyor.');
                setLoadingExecutionLogs(false);
                return;
            }

            type LogEvent = { time: Date; message: string; type: 'task' | 'group' | 'flow' };
            const events: LogEvent[] = [];
            const flowName = flows.find(f => f.id === selectedFlowId)?.name || 'Bilinmeyen Akış';

            events.push({
                time: new Date(latestFlowExec.startTime),
                message: `${new Date(latestFlowExec.startTime).toLocaleString('tr-TR')} ${flowName} akışı başladı`,
                type: 'flow'
            });

            groupHistories.forEach(g => {
                const gName = groups.find(x => x.id === g.groupId)?.name || 'Bilinmeyen Grup';
                events.push({
                    time: new Date(g.startTime),
                    message: `${new Date(g.startTime).toLocaleString('tr-TR')} ${gName} grubu başladı`,
                    type: 'group'
                });
                if (g.endTime) {
                    events.push({
                        time: new Date(g.endTime),
                        message: `${new Date(g.endTime).toLocaleString('tr-TR')} ${gName} grubu tamamlandı`,
                        type: 'group'
                    });
                }
            });

            // Use locally cached task items for names
            taskHistories.forEach(h => {
                const tName = taskItems.find(t => t.id === h.taskItemId)?.name || h.taskItemId;
                events.push({
                    time: new Date(h.startTime),
                    message: `${new Date(h.startTime).toLocaleString('tr-TR')} ${tName} taskı çalışmaya başladı`,
                    type: 'task'
                });
                if (h.endTime) {
                    const statusLabel = statusLabels[h.finalStatus] || h.finalStatus;
                    let msg = `${new Date(h.endTime).toLocaleString('tr-TR')} ${tName} taskı ${statusLabel} durumunda bitti`;
                    if (h.finalStatus === 'Failed') msg += `: ${h.errorMessage}`;
                    events.push({
                        time: new Date(h.endTime),
                        message: msg,
                        type: 'task'
                    });
                }
            });

            if (latestFlowExec.endTime) {
                events.push({
                    time: new Date(latestFlowExec.endTime),
                    message: `${new Date(latestFlowExec.endTime).toLocaleString('tr-TR')} ${flowName} akışı ${statusLabels[latestFlowExec.status] || latestFlowExec.status} durumunda tamamlandı`,
                    type: 'flow'
                });
            }

            events.sort((a, b) => a.time.getTime() - b.time.getTime());
            setExecutionLogs(events.map(e => e.message).join('\n'));

        } catch (err) {
            console.error('Log error', err);
            setExecutionLogs('Log yüklenirken hata.');
        } finally {
            setLoadingExecutionLogs(false);
        }
    };

    const activeFlowsList = useMemo(() => {
        return activeFlowIds.map(fid => {
            const flow = flows.find(f => f.id === fid);
            // Find specific execution for this flow in the list
            const latestExec = flowExecutions
                .filter(e => e.flowItemId === fid)
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];

            let status = 'scheduled';
            if (latestExec) {
                status = latestExec.endTime ? 'completed' : 'running';
                if (latestExec.status === 'Failed') status = 'failed';
            }

            let statusClass = 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white';
            if (selectedFlowId === fid) {
                switch (status) {
                    case 'running': statusClass = 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100 border-2 border-green-400'; break;
                    case 'completed': statusClass = 'bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 border-2 border-blue-400'; break;
                    case 'failed': statusClass = 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 border-2 border-red-400'; break;
                    default: statusClass = 'bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 border-2 border-blue-400'; break;
                }
            } else {
                switch (status) {
                    case 'running': statusClass = 'bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500'; break;
                    case 'completed': statusClass = 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500'; break;
                    case 'failed': statusClass = 'bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500'; break;
                    default: statusClass = 'bg-gray-50 dark:bg-gray-700'; break;
                }
            }

            return {
                id: fid,
                name: flow?.name || 'Unknown',
                status: status,
                class: statusClass
            };
        });
    }, [activeFlowIds, flows, flowExecutions, selectedFlowId]);

    const handleStartFlow = async () => {
        if (!selectedFlowId) return;
        try {
            setIsStarting(true);
            if (startFromGroupId) {
                console.log("Starting from group not fully implemented in backend yet, doing simple start");
                await flowExecutionApi.start(selectedFlowId);
            } else {
                await flowExecutionApi.start(selectedFlowId); // Assumes Manual start by default in backend? Api signature: flowId, triggerType?
                // Checking api.ts for signature of flowExecutionApi.start(flowId, string?)
                // It seems to be (flowId).
            }
            setShowStartModal(false);
            // Immediate update request
            onUpdate();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <div className="p-4 flex flex-col gap-4 h-[calc(100vh-200px)] overflow-hidden">
            <div className="flex gap-4 flex-1 min-h-0">
                {/* Sidebar */}
                <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Akışlar</h3>
                    <div className="space-y-2">
                        {activeFlowsList.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setSelectedFlowId(item.id)}
                                className={`w-full text-left p-3 rounded-lg transition-colors ${item.class}`}
                            >
                                <div className="font-medium truncate text-gray-900 dark:text-white">{item.name}</div>
                                <div className="text-xs text-gray-500 capitalize">{item.status}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {flows.find(f => f.id === selectedFlowId)?.name || 'Akış Seçin'}
                        </h3>
                        <div className="flex items-center gap-4">
                            {selectedFlowId && (
                                <button
                                    onClick={() => setShowStartModal(true)}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                                >
                                    Akış Başlat
                                </button>
                            )}
                            {/* Legend */}
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

                    {selectedFlowId ? (
                        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 flex flex-col overflow-hidden min-h-0">
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                nodeTypes={memoizedNodeTypes}
                                fitView
                            >
                                <Background />
                                <Controls />
                                <MiniMap
                                    nodeColor={(node) => getStatusColor(node.data?.status)}
                                />
                            </ReactFlow>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg">
                            Bir akış seçin
                        </div>
                    )}
                </div>
            </div>

            {/* Logs */}
            {selectedFlowId && (
                <div className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                            Execution Logları - {flows.find(f => f.id === selectedFlowId)?.name}
                        </h4>
                        <button onClick={() => loadFlowLogs()} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Yenile</button>
                    </div>
                    <textarea
                        readOnly
                        value={executionLogs}
                        className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono text-gray-900 dark:text-gray-100 resize-none"
                        placeholder="Seçili akışın execution logları burada görünecek..."
                    />
                </div>
            )}

            {/* Start Modal */}
            {showStartModal && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Akışı Başlat</h3>
                        <div className="space-y-4">
                            <button
                                onClick={handleStartFlow}
                                disabled={isStarting}
                                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-left"
                            >
                                <div className="font-semibold">Baştan Başla</div>
                                <div className="text-xs text-green-100">Akışı ilk gruptan başlat</div>
                            </button>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowStartModal(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded text-gray-900 dark:text-white">İptal</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
