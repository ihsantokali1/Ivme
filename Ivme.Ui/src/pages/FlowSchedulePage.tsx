import { useState, useEffect } from 'react';
import { flowItemsApi, flowSchedulesApi } from '../services/api';
import type { FlowItem, FlowSchedule } from '../services/api';

export default function FlowSchedulePage() {
    const [flows, setFlows] = useState<FlowItem[]>([]);
    const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
    const [schedule, setSchedule] = useState<FlowSchedule | null>(null);
    const [schedules, setSchedules] = useState<Map<string, FlowSchedule>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedFlowId) {
            loadSchedule();
        } else {
            setSchedule(null);
        }
    }, [selectedFlowId]);

    const loadData = async () => {
        try {
            setLoading(true);
            const flowsData = await flowItemsApi.getAll();
            setFlows(flowsData);

            // Tüm akışlar için schedule'ları yükle
            const schedulesMap = new Map<string, FlowSchedule>();
            for (const flow of flowsData) {
                try {
                    const scheduleData = await flowSchedulesApi.getByFlow(flow.id);
                    if (scheduleData) {
                        schedulesMap.set(flow.id, scheduleData);
                    }
                } catch {
                    // Schedule yoksa atla
                }
            }
            setSchedules(schedulesMap);

            // İlk akışı otomatik seç
            if (flowsData.length > 0 && !selectedFlowId) {
                setSelectedFlowId(flowsData[0].id);
            }
        } catch (err) {
            console.error('Veri yüklenirken hata:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadSchedule = async () => {
        if (!selectedFlowId) return;
        try {
            const scheduleData = await flowSchedulesApi.getByFlow(selectedFlowId);
            setSchedule(scheduleData);
            // Schedule'ı map'e de ekle
            if (scheduleData) {
                setSchedules(prev => new Map(prev).set(selectedFlowId, scheduleData));
            }
        } catch (err) {
            // Schedule yoksa null olacak
            setSchedule(null);
        }
    };

    const handleSave = async (formData: {
        workPeriod: 'Daily' | 'Weekly' | 'Monthly';
        startTime: string;
        restartOnError: boolean;
        isActive: boolean;
    }) => {
        if (!selectedFlowId) return;

        try {
            const scheduleData: FlowSchedule = schedule ? {
                ...schedule,
                workPeriod: formData.workPeriod,
                startTime: formData.startTime,
                restartOnError: formData.restartOnError,
                isActive: formData.isActive,
            } : {
                id: '',
                flowItemId: selectedFlowId,
                workPeriod: formData.workPeriod,
                startTime: formData.startTime,
                restartOnError: formData.restartOnError,
                isActive: formData.isActive,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            await flowSchedulesApi.createOrUpdate(scheduleData);
            const savedSchedule = await flowSchedulesApi.getByFlow(selectedFlowId);
            setSchedule(savedSchedule);
            // Schedule'ı map'e de ekle
            if (savedSchedule) {
                setSchedules(prev => new Map(prev).set(selectedFlowId, savedSchedule));
            }
            alert('Schedule kaydedildi!');
        } catch (err) {
            alert('Kaydetme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;
    }

    if (flows.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 italic">
                Henüz akış tanımlanmamış.
            </div>
        );
    }

    const selectedFlow = flows.find(f => f.id === selectedFlowId);

    return (
        <div className="py-4 flex gap-4 h-[calc(100vh-200px)]">
            {/* Sol taraf: Akış listesi */}
            <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Akışlar
                </h3>
                <div className="space-y-2">
                    {flows.map((flow) => {
                        const flowSchedule = schedules.get(flow.id);
                        const hasSchedule = flowSchedule !== undefined;
                        const isActive = flowSchedule?.isActive ?? false;

                        return (
                            <button
                                key={flow.id}
                                onClick={() => setSelectedFlowId(flow.id)}
                                className={`w-full text-left p-3 rounded-lg transition-colors ${selectedFlowId === flow.id
                                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 border-2 border-blue-400'
                                        : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 border-l-4 ' +
                                        (hasSchedule && isActive
                                            ? 'border-green-500'
                                            : hasSchedule
                                                ? 'border-gray-400'
                                                : 'border-gray-300')
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium truncate">{flow.name}</span>
                                    <div className="flex items-center gap-1">
                                        {hasSchedule && isActive && (
                                            <span className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full ml-2" title="Aktif Schedule"></span>
                                        )}
                                        {hasSchedule && !isActive && (
                                            <span className="flex-shrink-0 w-2 h-2 bg-gray-400 rounded-full ml-2" title="Pasif Schedule"></span>
                                        )}
                                    </div>
                                </div>
                                {hasSchedule && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        {flowSchedule.workPeriod === 'Daily' ? 'Günlük' :
                                            flowSchedule.workPeriod === 'Weekly' ? 'Haftalık' :
                                                'Aylık'} - {flowSchedule.startTime.substring(0, 5)}
                                    </div>
                                )}
                                {!hasSchedule && (
                                    <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                                        Schedule yok
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sağ taraf: Seçilen akışın bilgileri */}
            {selectedFlowId && selectedFlow ? (
                <div className="flex-1 flex flex-col">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex-1 overflow-y-auto">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 border-b-2 border-gray-200 dark:border-gray-700 pb-2">
                            {selectedFlow.name} - Zamanlama Ayarları
                        </h3>

                        {schedule === null ? (
                            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
                                <p className="text-gray-600 dark:text-gray-400 m-0">
                                    Bu akış için zamanlama tanımı yapılmamış. Aşağıdaki formu doldurarak zamanlama tanımı oluşturabilirsiniz.
                                </p>
                            </div>
                        ) : (
                            <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg mb-4">
                                <p className="text-blue-800 dark:text-blue-300 m-0">
                                    ✓ Bu akış için zamanlama tanımı mevcut. Aşağıdaki formdan düzenleyebilirsiniz.
                                </p>
                            </div>
                        )}

                        <ScheduleForm
                            schedule={schedule}
                            onSubmit={handleSave}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow-md text-gray-500 dark:text-gray-400">
                    Lütfen sol taraftan bir akış seçin
                </div>
            )}
        </div>
    );
}

interface ScheduleFormProps {
    schedule: FlowSchedule | null;
    onSubmit: (data: {
        workPeriod: 'Daily' | 'Weekly' | 'Monthly';
        startTime: string;
        restartOnError: boolean;
        isActive: boolean;
    }) => void;
}

function ScheduleForm({ schedule, onSubmit }: ScheduleFormProps) {
    const [formData, setFormData] = useState({
        workPeriod: (schedule?.workPeriod || 'Daily') as 'Daily' | 'Weekly' | 'Monthly',
        startTime: schedule?.startTime ? schedule.startTime.substring(0, 5) : '09:00',
        restartOnError: schedule?.restartOnError ?? false,
        isActive: schedule?.isActive ?? true,
    });

    // Schedule değiştiğinde formData'yı güncelle
    useEffect(() => {
        if (schedule) {
            const timeString = schedule.startTime || '09:00:00';
            const [hours, minutes] = timeString.split(':').slice(0, 2);
            setFormData({
                workPeriod: schedule.workPeriod as 'Daily' | 'Weekly' | 'Monthly',
                startTime: `${hours}:${minutes}`,
                restartOnError: schedule.restartOnError,
                isActive: schedule.isActive,
            });
        } else {
            // Schedule yoksa varsayılan değerler
            setFormData({
                workPeriod: 'Daily',
                startTime: '09:00',
                restartOnError: false,
                isActive: true,
            });
        }
    }, [schedule]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const [hours, minutes] = formData.startTime.split(':');
        const startTimeString = `${hours}:${minutes}:00`;
        onSubmit({
            ...formData,
            startTime: startTimeString,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Çalışma Periyodu:</span>
                <select
                    value={formData.workPeriod}
                    onChange={(e) =>
                        setFormData({ ...formData, workPeriod: e.target.value as any })
                    }
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="Daily">Günlük</option>
                    <option value="Weekly">Haftalık</option>
                    <option value="Monthly">Aylık</option>
                </select>
            </label>

            <label className="block">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Başlangıç Saati:</span>
                <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={formData.restartOnError}
                    onChange={(e) => setFormData({ ...formData, restartOnError: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Hata durumunda baştan başla (işaretli değilse kaldığı yerden devam eder)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Aktif</span>
            </label>

            <div className="flex justify-end mt-6">
                <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors">
                    Kaydet
                </button>
            </div>
        </form>
    );
}
