import { useState, useEffect } from 'react';
import { discoverySettingsApi } from '../services/api';

export default function DiscoverySettingsPage() {
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [allDbs, selectedDbs] = await Promise.all([
                discoverySettingsApi.getAllDatabases(),
                discoverySettingsApi.getSelectedDatabases()
            ]);
            setDatabases(allDbs);
            setSelectedDatabases(selectedDbs.map(d => d.databaseName));
        } catch (err) {
            setError('Veritabanı listesi yüklenirken hata oluştu.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleDatabase = (dbName: string) => {
        setSelectedDatabases(prev =>
            prev.includes(dbName)
                ? prev.filter(d => d !== dbName)
                : [...prev, dbName]
        );
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            setError(null);
            await discoverySettingsApi.saveSelectedDatabases(selectedDatabases);
            setSuccess('Ayarlar başarıyla kaydedildi.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Ayarlar kaydedilirken hata oluştu.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!window.confirm('Veritabanlarından prosedür keşfi ve senkronizasyon başlatılsın mı?')) return;

        try {
            setSyncing(true);
            setError(null);
            await discoverySettingsApi.syncProcedures();
            setSuccess('Senkronizasyon başarıyla tamamlandı.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError('Senkronizasyon sırasında hata oluştu.');
            console.error(err);
        } finally {
            setSyncing(false);
        }
    };

    if (loading && databases.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Veritabanı Keşif Ayarları</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Task olarak eklenecek prosedürlerin hangi veritabanlarından taranacağını seçin.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${syncing
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                            }`}
                    >
                        {syncing ? (
                            <>
                                <div className="animate-spin h-4 w-4 border-b-2 border-white rounded-full"></div>
                                Senkronize Ediliyor...
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Şimdi Senkronize Et
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-md transition-all disabled:bg-gray-400"
                    >
                        Kaydet
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-r-lg">
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-6 p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-r-lg">
                    {success}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {databases.map(dbName => (
                    <div
                        key={dbName}
                        onClick={() => handleToggleDatabase(dbName)}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center justify-between ${selectedDatabases.includes(dbName)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700'
                            }`}
                    >
                        <span className={`font-medium ${selectedDatabases.includes(dbName)
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-300'
                            }`}>
                            {dbName}
                        </span>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedDatabases.includes(dbName)
                            ? 'border-blue-500 bg-blue-500 text-white'
                            : 'border-gray-300 dark:border-gray-600'
                            }`}>
                            {selectedDatabases.includes(dbName) && (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {databases.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Veritabanı bulunamadı veya bağlantı hatası oluştu.
                </div>
            )}
        </div>
    );
}
