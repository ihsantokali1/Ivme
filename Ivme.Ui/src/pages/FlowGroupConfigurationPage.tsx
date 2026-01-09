
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
import { taskGroupsApi, flowItemsApi, flowGroupAssignmentsApi } from '../services/api';
import type { TaskGroup, FlowItem, FlowGroupAssignment } from '../services/api';
// import { calculateTaskLevels } from '../utils/taskSorting'; // Removed unused
// import ProtectedButton from '../components/ProtectedButton'; // Removed unused

// Custom node component for Groups
// Custom node component for Groups - Visual style must match TaskNode in GroupTaskConfigurationPage
const GroupNode = ({ data }: { data: { group: TaskGroup; assignment: FlowGroupAssignment; order: number; level: number } }) => {
    return (
        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-lg min-w-[200px] max-w-[250px] hover:shadow-xl transition-shadow relative">
            {/* Source handle (right) */}
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
            {/* Target handle (left) */}
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
                    {data.group.name}
                </div>
                <div className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                    #{data.order + 1}
                </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Seviye: {data.level}
            </div>
            {data.group.description && (
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                    {data.group.description}
                </div>
            )}
            {data.assignment.prerequisiteGroupIds.length > 0 && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-medium">
                    📋 {data.assignment.prerequisiteGroupIds.length} önşart
                </div>
            )}
        </div>
    );
};

const nodeTypes = {
    flowGroup: GroupNode,
};

export default function FlowGroupConfigurationPage() {
    const [flows, setFlows] = useState<FlowItem[]>([]);
    const [groups, setGroups] = useState<TaskGroup[]>([]);
    const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
    const [assignments, setAssignments] = useState<FlowGroupAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedGroupToAdd, setSelectedGroupToAdd] = useState<string>('');

    const memoizedNodeTypes = useMemo(() => nodeTypes, []);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedFlowId) {
            loadAssignments();
        } else {
            setAssignments([]);
            setNodes([]);
            setEdges([]);
        }
    }, [selectedFlowId]);

    useEffect(() => {
        if (selectedFlowId && assignments.length > 0 && groups.length > 0) {
            updateFlow();
        } else if (selectedFlowId && assignments.length === 0) {
            setNodes([]);
            setEdges([]);
        }
    }, [selectedFlowId, assignments, groups]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [flowsData, groupsData] = await Promise.all([
                flowItemsApi.getAll(),
                taskGroupsApi.getAll(),
            ]);
            setFlows(flowsData);
            setGroups(groupsData);
        } catch (err) {
            console.error('Veri yüklenirken hata:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadAssignments = async () => {
        if (!selectedFlowId) return;
        try {
            const assignmentsData = await flowGroupAssignmentsApi.getByFlowId(selectedFlowId);
            setAssignments(assignmentsData);
        } catch (err) {
            console.error('Assignments yüklenirken hata:', err);
            setAssignments([]);
        }
    };

    const reorderAssignments = async (flowId: string) => {
        try {
            const assignmentsData = await flowGroupAssignmentsApi.getByFlowId(flowId);
            if (assignmentsData.length === 0) return;

            // Basit seviye hesaplama veya taskSorting.ts adaptasyonu
            // Şimdilik dummy bir level hesaplaması yapabiliriz veya taskSorting logic'ini kullanabiliriz
            // Ancak taskSorting TaskItem ve GroupTaskAssignment bekliyor.
            // Burada FlowItem ve FlowGroupAssignment var. Yapı benzer.

            // Adaptasyon için geçici nesneler oluşturabiliriz veya kendi basit BFS topolojik sort'umuzu yazabiliriz.
            // Basit BFS/Topological sort:

            const inDegree = new Map<string, number>();
            const graph = new Map<string, string[]>();

            assignmentsData.forEach(a => {
                inDegree.set(a.groupId, 0);
                graph.set(a.groupId, []);
            });

            assignmentsData.forEach(a => {
                a.prerequisiteGroupIds.forEach(preId => {
                    // preId bir groupId
                    if (graph.has(preId)) {
                        graph.get(preId)?.push(a.groupId);
                        inDegree.set(a.groupId, (inDegree.get(a.groupId) || 0) + 1);
                    }
                });
            });

            const queue: string[] = [];
            const levels = new Map<string, number>();

            inDegree.forEach((deg, id) => {
                if (deg === 0) {
                    queue.push(id);
                    levels.set(id, 0);
                }
            });

            while (queue.length > 0) {
                const currentId = queue.shift()!;
                const currentLevel = levels.get(currentId) || 0;

                const dependents = graph.get(currentId) || [];
                dependents.forEach(depId => {
                    inDegree.set(depId, (inDegree.get(depId) || 0) - 1);
                    if ((inDegree.get(depId) || 0) === 0) {
                        queue.push(depId);
                        levels.set(depId, currentLevel + 1);
                    }
                });
            }

            // Kalanlar (cycle varsa) için max level + 1
            assignmentsData.forEach(a => {
                if (!levels.has(a.groupId)) {
                    const maxLevel = Math.max(...Array.from(levels.values()), -1);
                    levels.set(a.groupId, maxLevel + 1);
                }
            });

            // Seviye bazlı grupla ve sırala
            const groupsByLevel = new Map<number, FlowGroupAssignment[]>();
            assignmentsData.forEach(a => {
                const level = levels.get(a.groupId) || 0;
                if (!groupsByLevel.has(level)) groupsByLevel.set(level, []);
                groupsByLevel.get(level)!.push(a);
            });

            const sortedAssignments: FlowGroupAssignment[] = [];
            const sortedLevels = Array.from(groupsByLevel.keys()).sort((a, b) => a - b);

            sortedLevels.forEach(level => {
                const levelAssignments = groupsByLevel.get(level)!;
                levelAssignments.sort((a, b) => a.order - b.order); // Mevcut sırayı korumaya çalış
                sortedAssignments.push(...levelAssignments);
            });

            // Update orders
            const updatePromises = sortedAssignments.map((assignment, index) => {
                if (assignment.order !== index) {
                    return flowGroupAssignmentsApi.update({
                        ...assignment,
                        order: index,
                    });
                }
                return Promise.resolve();
            });

            await Promise.all(updatePromises);
            if (flowId === selectedFlowId) {
                await loadAssignments();
            }

        } catch (err) {
            console.error('Order yenileme hatası:', err);
        }
    };

    const updateFlow = (assignmentsToUse?: FlowGroupAssignment[]) => {
        const assignmentsForFlow = assignmentsToUse ?? assignments;
        if (!selectedFlowId || assignmentsForFlow.length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }

        // Level calculation (Copy paste logic from reorder for visual layout)
        const inDegree = new Map<string, number>();
        const graph = new Map<string, string[]>();
        assignmentsForFlow.forEach(a => {
            inDegree.set(a.groupId, 0);
            graph.set(a.groupId, []);
        });
        assignmentsForFlow.forEach(a => {
            a.prerequisiteGroupIds.forEach(preId => {
                if (graph.has(preId)) {
                    graph.get(preId)?.push(a.groupId);
                    inDegree.set(a.groupId, (inDegree.get(a.groupId) || 0) + 1);
                }
            });
        });
        const queue: string[] = [];
        const levels = new Map<string, number>();
        inDegree.forEach((deg, id) => {
            if (deg === 0) {
                queue.push(id);
                levels.set(id, 0);
            }
        });
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const currentLevel = levels.get(currentId) || 0;
            const dependents = graph.get(currentId) || [];
            dependents.forEach(depId => {
                inDegree.set(depId, (inDegree.get(depId) || 0) - 1);
                if ((inDegree.get(depId) || 0) === 0) {
                    queue.push(depId);
                    levels.set(depId, currentLevel + 1);
                }
            });
        }
        assignmentsForFlow.forEach(a => {
            if (!levels.has(a.groupId)) {
                const maxLevel = Math.max(...Array.from(levels.values()), -1);
                levels.set(a.groupId, maxLevel + 1);
            }
        });

        // Create Nodes
        const newNodes: Node[] = [];
        const groupsByLevel = new Map<number, FlowGroupAssignment[]>();
        assignmentsForFlow.forEach(a => {
            const level = levels.get(a.groupId) || 0;
            if (!groupsByLevel.has(level)) groupsByLevel.set(level, []);
            groupsByLevel.get(level)!.push(a);
        });

        groupsByLevel.forEach((levelAssignments, level) => {
            levelAssignments.sort((a, b) => a.order - b.order);
            levelAssignments.forEach((assignment, indexInLevel) => {
                const group = groups.find(g => g.id === assignment.groupId);
                if (!group) return;

                const nodesInLevel = levelAssignments.length;
                const spacing = 180;
                const startY = 100;
                const totalHeight = (nodesInLevel - 1) * spacing;
                const y = startY + (indexInLevel * spacing) - (totalHeight / 2);

                newNodes.push({
                    id: assignment.id,
                    type: 'flowGroup',
                    position: { x: level * 350 + 100, y },
                    data: {
                        group,
                        assignment,
                        order: assignment.order,
                        level,
                    },
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                });
            });
        });

        // Create Edges
        const newEdges: Edge[] = [];
        assignmentsForFlow.forEach(assignment => {
            assignment.prerequisiteGroupIds.forEach(preId => {
                const prereqAssignment = assignmentsForFlow.find(a => a.groupId === preId);
                if (prereqAssignment) {
                    newEdges.push({
                        id: `e-${prereqAssignment.id}-${assignment.id}`,
                        source: prereqAssignment.id,
                        target: assignment.id,
                        sourceHandle: 'source',
                        targetHandle: 'target',
                        type: 'smoothstep',
                        animated: true,
                        style: { stroke: '#3b82f6', strokeWidth: 2 },
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

    const handleAddGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFlowId || !selectedGroupToAdd) return;

        try {
            const maxOrder = assignments.length > 0 ? Math.max(...assignments.map(a => a.order)) : -1;

            await flowGroupAssignmentsApi.create({
                flowItemId: selectedFlowId,
                groupId: selectedGroupToAdd,
                order: maxOrder + 1,
                prerequisiteGroupIds: []
            });

            await reorderAssignments(selectedFlowId);
            const newData = await flowGroupAssignmentsApi.getByFlowId(selectedFlowId);
            setAssignments(newData);
            updateFlow(newData);
            setSelectedGroupToAdd('');
        } catch (err) {
            alert('Grup ekleme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        }
    };

    const handleRemoveGroup = async (assignmentId: string) => {
        if (!confirm('Bu grubu akıştan kaldırmak istediğinize emin misiniz?')) return;
        try {
            await flowGroupAssignmentsApi.delete(assignmentId);
            if (selectedFlowId) {
                await reorderAssignments(selectedFlowId);
                const newData = await flowGroupAssignmentsApi.getByFlowId(selectedFlowId);
                setAssignments(newData);
                updateFlow(newData);
            }
        } catch (err) {
            alert('Grup silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        }
    };

    const onConnect = useCallback(async (params: Connection) => {
        if (!params.source || !params.target || !selectedFlowId) return;

        const sourceAssignment = assignments.find(a => a.id === params.source);
        const targetAssignment = assignments.find(a => a.id === params.target);

        if (sourceAssignment && targetAssignment && sourceAssignment.id !== targetAssignment.id) {
            if (!targetAssignment.prerequisiteGroupIds.includes(sourceAssignment.groupId)) {
                // Add prerequisite
                const newPrereqs = [...targetAssignment.prerequisiteGroupIds, sourceAssignment.groupId];
                try {
                    await flowGroupAssignmentsApi.update({
                        ...targetAssignment,
                        prerequisiteGroupIds: newPrereqs
                    });
                    await reorderAssignments(selectedFlowId);
                    const newData = await flowGroupAssignmentsApi.getByFlowId(selectedFlowId);
                    setAssignments(newData);
                    updateFlow(newData); // Fixed missing updateFlow
                } catch (err) {
                    alert('Bağlantı hatası: ' + (err instanceof Error ? err.message : ''));
                }
            }
        }
    }, [assignments, selectedFlowId]);

    const handleEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
        if (!selectedFlowId) return;
        for (const edge of deletedEdges) {
            const sourceAssignment = assignments.find(a => a.id === edge.source);
            const targetAssignment = assignments.find(a => a.id === edge.target);

            if (sourceAssignment && targetAssignment) {
                if (targetAssignment.prerequisiteGroupIds.includes(sourceAssignment.groupId)) {
                    const newPrereqs = targetAssignment.prerequisiteGroupIds.filter(id => id !== sourceAssignment.groupId);
                    try {
                        await flowGroupAssignmentsApi.update({
                            ...targetAssignment,
                            prerequisiteGroupIds: newPrereqs
                        });
                    } catch (err) {
                        console.error('Bağlantı silme hatası', err);
                    }
                }
            }
        }
        // Refresh
        await reorderAssignments(selectedFlowId);
        const newData = await flowGroupAssignmentsApi.getByFlowId(selectedFlowId);
        setAssignments(newData);
        updateFlow(newData); // Fixed missing updateFlow
    }, [assignments, selectedFlowId]);

    const handleNodeDoubleClick = (_e: React.MouseEvent, node: Node) => {
        const assignment = assignments.find(a => a.id === node.id);
        if (assignment) {
            handleRemoveGroup(assignment.id);
        }
    };

    if (loading) return <div className="text-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;

    const selectedFlow = flows.find(f => f.id === selectedFlowId);
    const assignedGroupIds = assignments.map(a => a.groupId);
    const availableGroups = groups.filter(g => !assignedGroupIds.includes(g.id));

    return (
        <div className="py-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b-2 border-gray-200 dark:border-gray-700 pb-2">
                            Akış Seç
                        </h3>
                        <select
                            value={selectedFlowId || ''}
                            onChange={(e) => setSelectedFlowId(e.target.value || null)}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Akış seçin...</option>
                            {flows.map(flow => (
                                <option key={flow.id} value={flow.id}>{flow.name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedFlowId && availableGroups.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Grup Ekle</h3>
                            <form onSubmit={handleAddGroup}>
                                <select
                                    value={selectedGroupToAdd}
                                    onChange={(e) => setSelectedGroupToAdd(e.target.value)}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
                                >
                                    <option value="">Grup seçin...</option>
                                    {availableGroups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                                <button
                                    disabled={!selectedGroupToAdd}
                                    type="submit"
                                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                                >
                                    Ekle
                                </button>
                            </form>
                        </div>
                    )}

                    {selectedFlowId && assignments.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Bilgiler</h3>
                            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                <div><strong className="text-gray-900 dark:text-white">Akış:</strong> {selectedFlow?.name}</div>
                                <div><strong className="text-gray-900 dark:text-white">Grup Sayısı:</strong> {assignments.length}</div>
                                <div className="text-xs text-gray-500 mt-4">
                                    <p>• Grupları sürükleyerek konumlandırabilirsiniz</p>
                                    <p>• Gruplar arası bağlantı çizmek için sürükleyin</p>
                                    <p>• Bağlantı silmek için seçip Delete'e basın</p>
                                    <p>• Grubu kaldırmak için çift tıklayın</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-3">
                    {selectedFlowId ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4" style={{ height: '800px' }}>
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">{selectedFlow?.name} - Grup Akış Diyagramı</h3>
                            {assignments.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-gray-500">Bu akışa henüz grup eklenmemiş.</div>
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
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center text-gray-500">Lütfen bir akış seçin</div>
                    )}
                </div>
            </div>
        </div>
    );
}
