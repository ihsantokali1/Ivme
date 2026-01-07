import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import TaskItemDefinitionPage from './pages/TaskItemDefinitionPage';
import GroupDefinitionPage from './pages/GroupDefinitionPage';
import GroupTaskConfigurationPage from './pages/GroupTaskConfigurationPage';
import TVPage from './pages/TVPage';
import GroupSchedulePage from './pages/GroupSchedulePage';
import ManagementPage from './pages/ManagementPage';
import ExecutionHistoryPage from './pages/ExecutionHistoryPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import PermissionsPage from './pages/PermissionsPage';
import RolesPage from './pages/RolesPage';
import { canViewPage } from './utils/permissions';

type TabType = 'tasks' | 'groups' | 'configuration' | 'schedule' | 'management' | 'history' | 'tv' | 'users' | 'permissions' | 'roles';

function LogoutButton() {
  const { logout, user } = useAuth();
  
  return (
    <div className="flex items-center gap-2">
      {user && (
        <span className="text-white text-sm">
          {user.username} ({user.role})
        </span>
      )}
      <button
        onClick={logout}
        className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white backdrop-blur-sm transition-all text-sm font-medium"
        title="Çıkış Yap"
      >
        Çıkış
      </button>
    </div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [darkMode, setDarkMode] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    // Sistem tercihini kontrol et
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const savedMode = localStorage.getItem('darkMode');
    
    let initialDarkMode = false;
    if (savedMode !== null) {
      initialDarkMode = savedMode === 'true';
    } else {
      initialDarkMode = prefersDark;
    }
    
    setDarkMode(initialDarkMode);
    
    // İlk yüklemede dark class'ını ekle
    if (initialDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Loading durumunda
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Login sayfası
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {activeTab !== ('tv' as TabType) && (
      <header className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-700 dark:via-indigo-700 dark:to-purple-700 shadow-lg mb-8">
        <div className="px-8 py-6">
          {/* Top section with logo and title */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 dark:bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                <img src="/logo.svg" alt="Logo" className="w-10 h-10 text-white" style={{ filter: 'brightness(0) invert(1)' }} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">İvme - Task Yönetim Sistemi</h1>
                <p className="text-blue-100 text-sm mt-1">Hızlı ve Etkili Görev Yönetimi</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleDarkMode}
                className="p-3 rounded-lg bg-white/20 dark:bg-white/10 text-white hover:bg-white/30 dark:hover:bg-white/20 backdrop-blur-sm transition-all"
                aria-label="Dark mode toggle"
              >
                {darkMode ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <LogoutButton />
            </div>
          </div>
          {/* Navigation centered */}
          <nav className="flex gap-2 flex-wrap justify-center">
            {canViewPage(user?.role, 'tasks') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'tasks'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('tasks')}
              >
                1. Task Tanımlama
              </button>
            )}
            {canViewPage(user?.role, 'groups') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'groups'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('groups')}
              >
                2. Grup Tanımlama
              </button>
            )}
            {canViewPage(user?.role, 'configuration') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'configuration'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('configuration')}
              >
                3. Grup-Task İlişkisi ve Sıralama
              </button>
            )}
            {canViewPage(user?.role, 'schedule') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'schedule'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('schedule')}
              >
                4. Grup Yönetimi
              </button>
            )}
            {canViewPage(user?.role, 'management') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'management'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('management')}
              >
                5. Yönetim ve İzleme
              </button>
            )}
            {canViewPage(user?.role, 'history') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'history'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('history')}
              >
                6. Çalışma Geçmişi
              </button>
            )}
            {canViewPage(user?.role, 'tv') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === ('tv' as TabType)
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('tv' as TabType)}
              >
                📺 TV Görünümü
              </button>
            )}
            {canViewPage(user?.role, 'users') && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'users'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('users')}
              >
                👥 Kullanıcı Yönetimi
              </button>
            )}
            {user?.role === 'Admin' && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'roles'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('roles')}
              >
                🎭 Rol Yönetimi
              </button>
            )}
            {user?.role === 'Admin' && (
              <button
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === 'permissions'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                }`}
                onClick={() => setActiveTab('permissions')}
              >
                🔐 Yetki Yönetimi
              </button>
            )}
          </nav>
        </div>
      </header>
      )}
      {activeTab === ('tv' as TabType) ? (
        <TVPage />
      ) : (
        <main className="mx-auto px-8 pb-8">
          {activeTab === 'tasks' && <TaskItemDefinitionPage />}
          {activeTab === 'groups' && <GroupDefinitionPage />}
          {activeTab === 'configuration' && <GroupTaskConfigurationPage />}
          {activeTab === 'schedule' && <GroupSchedulePage />}
          {activeTab === 'management' && <ManagementPage />}
          {activeTab === 'history' && <ExecutionHistoryPage />}
          {activeTab === 'users' && <UsersPage />}
          {activeTab === 'roles' && <RolesPage />}
          {activeTab === 'permissions' && <PermissionsPage />}
        </main>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App
