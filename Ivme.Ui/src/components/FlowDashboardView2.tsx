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
import { executionHistoryApi, flowExecutionApi, flowGroupAssignmentsApi, flowSchedulesApi } from '../services/api';
import ProtectedButton from './ProtectedButton';

// Helper function to calculate group status from GroupExecutionHistory
const calculateGroupStatus = (history: GroupExecutionHistory): string => {
    if (history.status) return history.status;
    if (!history.endTime) return 'Running';
    if (history.failedTasks > 0) return 'Failed';
    if (history.completedTasks === history.totalTasks) return 'Completed';
    return 'Completed';
};

// Status colors (same as TaskDashboardView)
const getStatusColor = (status: string | undefined): string => {
    switch (status) {
        case 'Running': return '#eab308';
        case 'Ready': return '#9ca3af';
        case 'Pending': return '#9ca3af';
        case 'WaitingRetry': return '#f59e0b';
        case 'Paused': return '#6b7280';
        case 'Completed': return '#059669';
        case 'MarkedAsSuccess': return '#4ade80';
        case 'Failed': return '#ef4444';
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

// Custom node for Groups (displayed in Flow diagram)
const DashboardGroupNode = ({ data }: {
    data: {
        group: TaskGroup;
        assignment: FlowGroupAssignment;
        order: number;
        level: number;
        status?: string;
        errorMessage?: string;
        flowExecutionId?: string;
        onUpdate?: () => void;
    };
}) => {
    const statusColor = getStatusColor(data.status);
    const borderWidth = data.status === 'Running' ? 3 : 2;
    const [actionLoading, setActionLoading] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState<GroupExecutionHistory[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const handleAction = async (action: string) => {
        if (!data.flowExecutionId) {
            alert('Aktif akış çalışması bulunamadı.');
            return;
        }

        let confirmMsg = '';
        switch (action) {
            case 'stop': confirmMsg = 'Bu grubu durdurmak istediğinize emin misiniz?'; break;
            case 'markAsSuccess': confirmMsg = 'Bu grubu başarılı saymak istediğinize emin misiniz? Akış sonraki gruptan devam edecektir.'; break;
            case 'restart': confirmMsg = 'Bu grubu bu akış içinde yeniden başlatmak istediğinize emin misiniz?'; break;
        }

        if (confirmMsg && !confirm(confirmMsg)) return;

        try {
            setActionLoading(true);
            switch (action) {
                case 'stop': await flowExecutionApi.stopGroup(data.group.id, data.flowExecutionId); break;
                case 'markAsSuccess': await flowExecutionApi.markGroupAsSuccess(data.group.id, data.flowExecutionId); break;
                case 'restart': await flowExecutionApi.restartGroup(data.group.id, data.assignment.flowItemId, data.flowExecutionId); break;
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
                if (!data.flowExecutionId) {
                    setLogs([]);
                    setLoadingLogs(false);
                    return;
                }

                const histories = await executionHistoryApi.getGroupHistories({
                    groupId: data.group.id,
                    flowItemExecutionId: data.flowExecutionId
                });

                setLogs(histories.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()));
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
            style={{ borderWidth: `${borderWidth}px`, borderColor: statusColor, borderStyle: 'solid' }}
        >
            <Handle type="source" position={Position.Right} id="source" style={{ background: statusColor, width: 10, height: 10, border: '2px solid white' }} />
            <Handle type="target" position={Position.Left} id="target" style={{ background: statusColor, width: 10, height: 10, border: '2px solid white' }} />

            <div className="flex items-start justify-between mb-1.5">
                <div className="text-sm font-semibold text-gray-900 dark:text-white flex-1">{data.group.name}</div>
                <div className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: statusColor }}>
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

            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-1.5">
                {data.status === 'Running' && (
                    <ProtectedButton permission="actions.group.stop" onClick={() => handleAction('stop')} disabled={actionLoading} className="w-full px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors">
                        {actionLoading ? 'Durduruluyor...' : 'Durdur'}
                    </ProtectedButton>
                )}

                {data.status === 'Failed' && (
                    <div className="flex gap-1">
                        <ProtectedButton permission="actions.group.start" onClick={() => handleAction('markAsSuccess')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium transition-colors">
                            {actionLoading ? 'İşaretleniyor...' : 'Başarılı Say'}
                        </ProtectedButton>
                        <ProtectedButton permission="actions.group.start" onClick={() => handleAction('restart')} disabled={actionLoading} className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors">
                            {actionLoading ? 'Başlatılıyor...' : 'Yeniden Başlat'}
                        </ProtectedButton>
                    </div>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); setShowLogs(!showLogs); }}
                    className="w-full px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs font-medium transition-colors flex items-center justify-between"
                >
                    <span>Loglar</span>
                    <svg className={`w-3 h-3 transition-transform ${showLogs ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {showLogs && (
                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs max-h-40 overflow-y-auto">
                        {loadingLogs ? (
                            <div className="text-center py-2 text-gray-500">Yükleniyor...</div>
                        ) : logs.length === 0 ? (
                            <div className="text-center py-2 text-gray-500">Log bulunamadı</div>
                        ) : (
                            <div className="space-y-2">
                                {logs.map((log) => {
                                    const logStatus = calculateGroupStatus(log);
                                    return (
                                        <div key={log.id} className="border-b border-gray-200 dark:border-gray-700 pb-2 last:border-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="px-1.5 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: getStatusColor(logStatus) }}>
                                                    {statusLabels[logStatus] || logStatus}
                                                </span>
                                                <span className="text-gray-500 dark:text-gray-400">{new Date(log.startTime).toLocaleTimeString('tr-TR')}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

interface FlowDashboardView2Props {
    flows: FlowItem[];
    groups: TaskGroup[];
    onUpdate: () => void;
}

export default function FlowDashboardView2({ flows, groups, onUpdate }: FlowDashboardView2Props) {
    const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
    const [selectedFlowExecutionId, setSelectedFlowExecutionId] = useState<string | null>(null);
    const [activeFlowIds, setActiveFlowIds] = useState<string[]>([]);
    const [flowExecutions, setFlowExecutions] = useState<FlowExecutionHistory[]>([]);
    // groupStatuses artık flowExecutionId-groupId kombinasyonu ile key'leniyor
    // Bu sayede aynı grup farklı akışlarda farklı statülere sahip olabilir
    const [groupStatuses, setGroupStatuses] = useState<Record<string, string>>({});
    const [groupStatusesWithErrors, setGroupStatusesWithErrors] = useState<Record<string, { status: string; errorMessage?: string }>>({});
    const [allFlowAssignments, setAllFlowAssignments] = useState<FlowGroupAssignment[]>([]);
    const [schedules, setSchedules] = useState<any[]>([]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [showStartModal, setShowStartModal] = useState(false);
    const [startFromGroupId, setStartFromGroupId] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [executionLogs, setExecutionLogs] = useState<string>('');
    const [loadingExecutionLogs, setLoadingExecutionLogs] = useState(false);
    const [expandedFlowId, setExpandedFlowId] = useState<string | null>(null);
    const manualExecutionRef = useRef<string | null>(null);

    const createDashboardGroupNode = useCallback((props: any) => {
        return <DashboardGroupNode {...props} />;
    }, []);

    const memoizedNodeTypes = useMemo(() => ({
        dashboardGroup: createDashboardGroupNode,
    }), [createDashboardGroupNode]);

    // Load active flows (executed today or scheduled)
    useEffect(() => {
        const loadActiveFlows = async () => {
            try {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(todayStart);
                todayEnd.setDate(todayEnd.getDate() + 1);

                const [executions, flowAssignments] = await Promise.all([
                    executionHistoryApi.getFlowHistories({
                        startDate: todayStart.toISOString(),
                        endDate: todayEnd.toISOString(),
                    }),
                    Promise.all(flows.map(f => flowGroupAssignmentsApi.getByFlowId(f.id).catch(() => [])))
                ]);

                setFlowExecutions(executions);
                setAllFlowAssignments(flowAssignments.flat());

                // Load schedules for each flow
                const schedulePromises = flows.map(async (flow) => {
                    try {
                        const schedule = await flowSchedulesApi.getByFlow(flow.id);
                        return schedule;
                    } catch { return null; }
                });
                const scheduleResults = await Promise.all(schedulePromises);
                setSchedules(scheduleResults.filter(s => s !== null && s.isActive));

                // Find active flow IDs (executed or scheduled)
                const executedFlowIds = Array.from(new Set(executions.map(exec => exec.flowItemId)));
                const scheduledFlowIds = scheduleResults
                    .filter(s => s !== null && s.isActive && !executedFlowIds.includes(s.flowItemId))
                    .map(s => s!.flowItemId);

                const allActiveFlowIds = Array.from(new Set([...executedFlowIds, ...scheduledFlowIds]));
                setActiveFlowIds(allActiveFlowIds);

                if (allActiveFlowIds.length > 0 && !selectedFlowId) {
                    setSelectedFlowId(allActiveFlowIds[0]);
                }

                // Load group statuses for selected flow
                if (selectedFlowId) {
                    const flowExecs = executions
                        .filter(e => e.flowItemId === selectedFlowId)
                        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

                    // Kullanıcı manuel bir execution seçtiyse onu kullan, yoksa en son olanı
                    const manualExec = manualExecutionRef.current
                        ? flowExecs.find(e => e.id === manualExecutionRef.current)
                        : null;
                    const execToUse = manualExec || flowExecs[0];

                    if (execToUse) {
                        const groupHistories = await executionHistoryApi.getGroupHistories({
                            flowItemExecutionId: execToUse.id
                        });

                        const latestPerGroup = new Map<string, GroupExecutionHistory>();
                        groupHistories.forEach(h => {
                            const existing = latestPerGroup.get(h.groupId);
                            if (!existing || new Date(h.startTime) > new Date(existing.startTime)) {
                                latestPerGroup.set(h.groupId, h);
                            }
                        });

                        const statuses: Record<string, string> = {};
                        const statusesWithErrors: Record<string, { status: string; errorMessage?: string }> = {};
                        latestPerGroup.forEach((h, groupId) => {
                            const status = calculateGroupStatus(h);
                            statuses[groupId] = status;
                            statusesWithErrors[groupId] = { status, errorMessage: undefined };
                        });

                        setSelectedFlowExecutionId(execToUse.id);
                        setGroupStatuses(statuses);
                        setGroupStatusesWithErrors(statusesWithErrors);
                    } else {
                        setSelectedFlowExecutionId(null);
                        setGroupStatuses({});
                        setGroupStatusesWithErrors({});
                    }
                }
            } catch (error) {
                console.error('Error loading active flows:', error);
            }
        };

        loadActiveFlows();
        const interval = setInterval(loadActiveFlows, 2000);
        return () => clearInterval(interval);
    }, [flows, selectedFlowId]);

    const handleStartFlow = async () => {
        if (!selectedFlowId) return;

        try {
            setIsStarting(true);

            if (startFromGroupId === null) {
                await flowExecutionApi.start(selectedFlowId);
                alert('Akış başarıyla baştan başlatıldı.');
            } else {
                // Start from specific group - if backend supports it
                await flowExecutionApi.start(selectedFlowId);
                const group = groups.find(g => g.id === startFromGroupId);
                alert(`Akış "${group?.name || 'seçilen grup'}" grubundan başarıyla başlatıldı.`);
            }

            setShowStartModal(false);
            setStartFromGroupId(null);
            onUpdate();
        } catch (err) {
            alert('Akış başlatma hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        } finally {
            setIsStarting(false);
        }
    };

    // Build flow diagram (groups as nodes)
    const flowsByFlowId = useMemo(() => {
        const result: Record<string, { nodes: Node[]; edges: Edge[] }> = {};

        flows.forEach(flow => {
            const flowAssignments = allFlowAssignments.filter(a => a.flowItemId === flow.id);
            if (flowAssignments.length === 0) return;

            // Calculate levels based on prerequisites
            const levels = new Map<string, number>();
            const assignmentMap = new Map(flowAssignments.map(a => [a.groupId, a]));

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

            flowAssignments.forEach(a => getLevel(a.groupId));

            // Get latest flow execution for this flow
            const latestExec = flowExecutions
                .filter(e => e.flowItemId === flow.id)
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
            const flowExecutionId = latestExec?.id;

            const levelGroups = new Map<number, FlowGroupAssignment[]>();
            flowAssignments.forEach(assignment => {
                const level = levels.get(assignment.groupId) || 0;
                if (!levelGroups.has(level)) levelGroups.set(level, []);
                levelGroups.get(level)!.push(assignment);
            });

            const levelSpacing = 350;
            const flowNodes: Node[] = [];
            const flowEdges: Edge[] = [];

            levelGroups.forEach((levelAssignments, level) => {
                levelAssignments.sort((a, b) => a.order - b.order);

                levelAssignments.forEach((assignment, indexInLevel) => {
                    const group = groups.find(g => g.id === assignment.groupId);
                    if (!group) return;

                    const statusKey = assignment.groupId;
                    const status = groupStatuses[statusKey];
                    const statusWithError = groupStatusesWithErrors[statusKey];

                    const nodesInLevel = levelAssignments.length;
                    const spacing = 200;
                    const startY = 100;
                    const totalHeight = (nodesInLevel - 1) * spacing;
                    const y = startY + (indexInLevel * spacing) - (totalHeight / 2);
                    const x = (level * levelSpacing) + 20;

                    flowNodes.push({
                        id: assignment.id,
                        type: 'dashboardGroup',
                        position: { x, y },
                        data: {
                            group,
                            assignment,
                            order: assignment.order,
                            level,
                            status,
                            errorMessage: statusWithError?.errorMessage,
                            flowExecutionId,
                            onUpdate,
                        },
                        sourcePosition: Position.Right,
                        targetPosition: Position.Left,
                    });
                });
            });

            // Create edges
            flowAssignments.forEach(assignment => {
                assignment.prerequisiteGroupIds?.forEach(prereqId => {
                    const prereqAssignment = flowAssignments.find(a => a.groupId === prereqId);
                    if (prereqAssignment) {
                        const prereqStatus = groupStatuses[prereqId];

                        flowEdges.push({
                            id: `e-${prereqAssignment.id}-${assignment.id}`,
                            source: prereqAssignment.id,
                            target: assignment.id,
                            sourceHandle: 'source',
                            targetHandle: 'target',
                            type: 'smoothstep',
                            animated: prereqStatus === 'Running',
                            style: { stroke: getStatusColor(prereqStatus), strokeWidth: 2 },
                            markerEnd: { type: MarkerType.ArrowClosed, color: getStatusColor(prereqStatus), width: 20, height: 20 },
                        });
                    }
                });
            });

            result[flow.id] = { nodes: flowNodes, edges: flowEdges };
        });

        return result;
    }, [flows, allFlowAssignments, groups, groupStatuses, groupStatusesWithErrors, flowExecutions, onUpdate, selectedFlowId, selectedFlowExecutionId]);

    const selectedFlow = useMemo(() => {
        if (!selectedFlowId) return null;
        return flowsByFlowId[selectedFlowId] || null;
    }, [selectedFlowId, flowsByFlowId]);

    useEffect(() => {
        if (selectedFlow) {
            setNodes(selectedFlow.nodes);
            setEdges(selectedFlow.edges);
        } else {
            setNodes([]);
            setEdges([]);
        }
    }, [selectedFlow]);

    // Load execution logs
    const loadExecutionLogs = useCallback(async () => {
        if (!selectedFlowId) {
            setExecutionLogs('');
            return;
        }

        setLoadingExecutionLogs(true);
        try {
            const latestExec = flowExecutions
                .filter(exec => exec.flowItemId === selectedFlowId)
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];

            if (!latestExec) {
                setExecutionLogs('');
                return;
            }

            const groupHistories = await executionHistoryApi.getGroupHistories({
                flowItemExecutionId: latestExec.id
            });

            const flowName = flows.find(f => f.id === selectedFlowId)?.name || 'Bilinmeyen Akış';
            const flowStartTime = new Date(latestExec.startTime).toLocaleString('tr-TR');
            let logLines: string[] = [`${flowStartTime} ${flowName} başladı`];

            // Sort by newest first for display
            const relevantHistories = groupHistories.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

            relevantHistories.forEach(history => {
                const group = groups.find(g => g.id === history.groupId);
                const groupName = group?.name || 'Bilinmeyen Grup';
                const startTime = new Date(history.startTime).toLocaleString('tr-TR');

                logLines.push(`${startTime} ${groupName} grubu çalışmaya başladı`);

                if (history.endTime) {
                    const endTime = new Date(history.endTime).toLocaleString('tr-TR');
                    const historyStatus = calculateGroupStatus(history);

                    if (historyStatus === 'Failed') {
                        logLines.push(`${endTime} ${groupName} grubu hatalı bitti`);
                    } else if (historyStatus === 'Completed') {
                        logLines.push(`${endTime} ${groupName} grubu başarıyla tamamlandı`);
                    } else {
                        const statusLabel = statusLabels[historyStatus] || historyStatus;
                        logLines.push(`${endTime} ${groupName} grubu ${statusLabel} durumunda bitti`);
                    }
                }
            });

            if (latestExec.endTime) {
                const flowEndTime = new Date(latestExec.endTime).toLocaleString('tr-TR');
                logLines.push(`${flowEndTime} ${flowName} tamamlandı`);
            }

            setExecutionLogs(logLines.join('\n'));
        } catch (err) {
            console.error('Execution log yükleme hatası:', err);
            setExecutionLogs('Log yüklenirken hata oluştu');
        } finally {
            setLoadingExecutionLogs(false);
        }
    }, [selectedFlowId, flowExecutions, groups, flows]);

    useEffect(() => {
        if (selectedFlowId) {
            loadExecutionLogs();
        } else {
            setExecutionLogs('');
        }
    }, [selectedFlowId]);

    // Active flows with status info
    const activeFlowsWithNames = useMemo(() => {
        return activeFlowIds.map(flowId => {
            const flow = flows.find(f => f.id === flowId);
            const latestExecution = flowExecutions
                .filter(exec => exec.flowItemId === flowId)
                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
            const schedule = schedules.find(s => s?.flowItemId === flowId);

            // groupStatuses SADECE seçili akış için geçerlidir, bu yüzden burada diğer akışlar için kullanılamaz.
            // Diğer akışların detaylı grup durumlarını (kaç grup bitti vs) bilmek için her biri için ayrı sorgu gerekir.
            // Bu performans açısından maliyetli olacağından, liste görünümünde sadece genel flow durumunu göstereceğiz.

            const isScheduled = !latestExecution && schedule !== undefined;
            const isRunning = latestExecution?.endTime === null || latestExecution?.endTime === undefined;

            let flowStatus: 'running' | 'completed' | 'failed' | 'partial' | 'scheduled' = 'scheduled';

            if (latestExecution) {
                if (latestExecution.status === 'Running') {
                    flowStatus = 'running';
                } else if (latestExecution.status === 'Completed') {
                    flowStatus = 'completed';
                } else if (latestExecution.status === 'Failed') {
                    flowStatus = 'failed';
                } else {
                    flowStatus = 'partial';
                }
            } else if (isScheduled) {
                flowStatus = 'scheduled';
            }

            return {
                id: flowId,
                name: flow?.name || 'Bilinmeyen Akış',
                isRunning,
                isScheduled,
                status: flowStatus,
                startTime: latestExecution?.startTime,
                endTime: latestExecution?.endTime,
                scheduleStartTime: schedule?.startTime,
                // groupStatuses kullanılamadığı için bu detayları şimdilik göstermiyoruz veya sadece seçili akışsa gösteriyoruz
                completedGroups: selectedFlowId === flowId && latestExecution?.id === selectedFlowExecutionId ? Object.values(groupStatuses).filter(s => s === 'Completed' || s === 'MarkedAsSuccess').length : 0,
                failedGroups: selectedFlowId === flowId && latestExecution?.id === selectedFlowExecutionId ? Object.values(groupStatusesWithErrors).filter(s => s.status === 'Failed').length : 0,
                totalGroups: allFlowAssignments.filter(a => a.flowItemId === flowId).length,
                flowExecutionId: latestExecution?.id,
            };
        });
    }, [activeFlowIds, flows, flowExecutions, schedules, allFlowAssignments, groupStatuses, selectedFlowId, selectedFlowExecutionId, groupStatusesWithErrors]);

    if (activeFlowsWithNames.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">
                Bugün çalışan veya çalışmış akış bulunmuyor.
            </div>
        );
    }

    return (
        <div className="p-4 flex flex-col gap-4 h-[calc(100vh-200px)] overflow-hidden">
            <div className="flex gap-4 flex-1 min-h-0">
                {/* Sol taraf: Akış listesi */}
                <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Aktif Akışlar</h3>
                    <div className="space-y-2">
                        {activeFlowsWithNames.map((flow) => {
                            const getFlowStatusColor = (status: string) => {
                                if (selectedFlowId === flow.id) {
                                    switch (status) {
                                        case 'running': return 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100 border-2 border-green-400';
                                        case 'completed': return 'bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 border-2 border-blue-400';
                                        case 'failed': return 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 border-2 border-red-400';
                                        case 'partial': return 'bg-orange-200 dark:bg-orange-800 text-orange-900 dark:text-orange-100 border-2 border-orange-400';
                                        case 'scheduled': return 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 border-2 border-yellow-400';
                                        default: return 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100';
                                    }
                                } else {
                                    switch (status) {
                                        case 'running': return 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-green-500';
                                        case 'completed': return 'bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-blue-500';
                                        case 'failed': return 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-red-500';
                                        case 'partial': return 'bg-orange-50 dark:bg-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-orange-500';
                                        case 'scheduled': return 'bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 text-gray-900 dark:text-gray-100 border-l-4 border-yellow-500';
                                        default: return 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100';
                                    }
                                }
                            };

                            // Bu akışın bugünkü tüm execution'ları
                            const flowExecs = flowExecutions
                                .filter(e => e.flowItemId === flow.id)
                                .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
                            const isExpanded = expandedFlowId === flow.id;

                            return (
                                <div key={flow.id} className="space-y-0.5">
                                    <button
                                        onClick={() => { setSelectedFlowId(flow.id); manualExecutionRef.current = null; }}
                                        className={`w-full text-left p-3 rounded-lg transition-colors ${getFlowStatusColor(flow.status)}`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-medium truncate">{flow.name}</span>
                                            <div className="flex items-center gap-1">
                                                {flow.status === 'running' && <span className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full animate-pulse ml-2" title="Çalışıyor"></span>}
                                                {flow.status === 'completed' && <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full ml-2" title="Tamamlandı"></span>}
                                                {flow.status === 'failed' && <span className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full ml-2" title="Başarısız"></span>}
                                                {flow.status === 'partial' && <span className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full ml-2" title="Kısmen Tamamlandı"></span>}
                                                {flow.status === 'scheduled' && <span className="flex-shrink-0 w-2 h-2 bg-yellow-500 rounded-full ml-2" title="Planlanmış"></span>}
                                            </div>
                                        </div>
                                        {flow.totalGroups > 0 && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                {flow.completedGroups}/{flow.totalGroups} tamamlandı
                                                {flow.failedGroups > 0 && `, ${flow.failedGroups} başarısız`}
                                            </div>
                                        )}
                                        {flow.scheduleStartTime && (
                                            <div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                                                Planlanan Zaman: {flow.scheduleStartTime.substring(0, 5)}
                                            </div>
                                        )}
                                        {flow.startTime && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                Başlangıç: {new Date(flow.startTime).toLocaleTimeString('tr-TR')}
                                            </div>
                                        )}
                                        {flow.endTime && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                Bitiş: {new Date(flow.endTime).toLocaleTimeString('tr-TR')}
                                            </div>
                                        )}
                                    </button>

                                    {/* Çalışma Geçmişi Toggle */}
                                    {flowExecs.length > 0 && (
                                        <button
                                            onClick={() => setExpandedFlowId(isExpanded ? null : flow.id)}
                                            className="w-full flex items-center justify-between px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors"
                                        >
                                            <span>📋 {flowExecs.length} çalışma geçmişi</span>
                                            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    )}

                                    {/* Collapsible Execution Listesi */}
                                    {isExpanded && (
                                        <div className="ml-2 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-600 pl-2">
                                            {flowExecs.map(exec => {
                                                const isSelected = selectedFlowExecutionId === exec.id && selectedFlowId === flow.id;
                                                const execStatusColor = exec.status === 'Running' ? '#eab308' : exec.status === 'Completed' ? '#059669' : exec.status === 'Failed' ? '#ef4444' : '#9ca3af';
                                                return (
                                                    <button
                                                        key={exec.id}
                                                        onClick={() => {
                                                            setSelectedFlowId(flow.id);
                                                            manualExecutionRef.current = exec.id;
                                                            setSelectedFlowExecutionId(exec.id);
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
                                                        <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                                                            {statusLabels[exec.status] || exec.status}
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

                {/* Sağ taraf: Seçilen akışın flow'u */}
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {selectedFlowId ? activeFlowsWithNames.find(f => f.id === selectedFlowId)?.name : 'Akış Seçin'}
                        </h3>
                        <div className="flex items-center gap-4">
                            {selectedFlowId && (
                                <button
                                    onClick={() => setShowStartModal(true)}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                    disabled={isStarting}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {isStarting ? 'Başlatılıyor...' : 'Akış Başlat'}
                                </button>
                            )}
                            <div className="flex gap-2 text-xs flex-wrap">
                                {Object.entries(statusLabels).map(([status, label]) => (
                                    <div key={status} className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getStatusColor(status) }}></div>
                                        <span className="text-gray-600 dark:text-gray-400">{label}</span>
                                    </div>
                                ))}
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
                                fitViewOptions={{ padding: 0, minZoom: 1.2, maxZoom: 2 }}
                                minZoom={0.5}
                                maxZoom={3}
                                defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
                                className="bg-gray-50 dark:bg-gray-900"
                                style={{ width: '100%', height: '100%', minHeight: 0 }}
                            >
                                <Background />
                                <Controls />
                                <MiniMap nodeColor={(node) => getStatusColor(node.data?.status)} />
                            </ReactFlow>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow-md text-gray-500 dark:text-gray-400">
                            Lütfen sol taraftan bir akış seçin
                        </div>
                    )}
                </div>
            </div>

            {/* Alt kısım: Execution Logları */}
            {selectedFlowId && (
                <div className="flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                            Execution Logları - {activeFlowsWithNames.find(f => f.id === selectedFlowId)?.name || 'Bilinmeyen Akış'}
                        </h4>
                        <button
                            onClick={loadExecutionLogs}
                            disabled={loadingExecutionLogs}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <svg className={`w-4 h-4 ${loadingExecutionLogs ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            placeholder="Seçili akışın execution logları burada görünecek..."
                        />
                    )}
                </div>
            )}

            {/* Başlatma Modal */}
            {showStartModal && selectedFlowId && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Akış Başlatma Seçenekleri
                        </h3>

                        <div className="space-y-4 mb-6">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="radio"
                                    name="startOption"
                                    value="fromBeginning"
                                    checked={startFromGroupId === null}
                                    onChange={() => setStartFromGroupId(null)}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <div>
                                    <div className="font-medium text-gray-900 dark:text-white">Baştan Başlat</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">Tüm grupları sıfırlayıp baştan başlatır</div>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="radio"
                                    name="startOption"
                                    value="fromGroup"
                                    checked={startFromGroupId !== null}
                                    onChange={() => {
                                        const flowAssignments = allFlowAssignments.filter(a => a.flowItemId === selectedFlowId);
                                        if (flowAssignments.length > 0) {
                                            const sortedAssignments = [...flowAssignments].sort((a, b) => a.order - b.order);
                                            setStartFromGroupId(sortedAssignments[0].groupId);
                                        }
                                    }}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900 dark:text-white">Belirli Gruptan Başlat</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Seçilen grup ve sonrasındaki grupları başlatır</div>
                                    {startFromGroupId !== null && (
                                        <select
                                            value={startFromGroupId}
                                            onChange={(e) => setStartFromGroupId(e.target.value)}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        >
                                            {(() => {
                                                const flowAssignments = allFlowAssignments.filter(a => a.flowItemId === selectedFlowId);
                                                const sortedAssignments = [...flowAssignments].sort((a, b) => a.order - b.order);
                                                return sortedAssignments.map(assignment => {
                                                    const group = groups.find(g => g.id === assignment.groupId);
                                                    return (
                                                        <option key={assignment.id} value={assignment.groupId}>
                                                            #{assignment.order} - {group?.name || 'Bilinmeyen Grup'}
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
                                onClick={() => { setShowStartModal(false); setStartFromGroupId(null); }}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                                disabled={isStarting}
                            >
                                İptal
                            </button>
                            <ProtectedButton
                                permission="actions.group.start"
                                onClick={handleStartFlow}
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
