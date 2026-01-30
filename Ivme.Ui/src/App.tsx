import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import TaskItemDefinitionPage from './pages/TaskItemDefinitionPage';
import GroupDefinitionPage from './pages/GroupDefinitionPage';
import FlowDefinitionPage from './pages/FlowDefinitionPage';
import FlowGroupConfigurationPage from './pages/FlowGroupConfigurationPage';
import FlowSchedulePage from './pages/FlowSchedulePage';
import GroupTaskConfigurationPage from './pages/GroupTaskConfigurationPage';
import TVPage from './pages/TVPage';
import GroupSchedulePage from './pages/GroupSchedulePage';
import ManagementPage from './pages/ManagementPage';
import ExecutionHistoryPage from './pages/ExecutionHistoryPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import PermissionsPage from './pages/PermissionsPage';
import RolesPage from './pages/RolesPage';
import DashboardPage from './pages/DashboardPage';
import DiscoverySettingsPage from './pages/DiscoverySettingsPage';
import { canViewPage } from './utils/permissions';

type TabType = 'dashboard' | 'tasks' | 'groups' | 'flows' | 'flow-groups' | 'configuration' | 'schedule' | 'flow-schedule' | 'management' | 'history' | 'tv' | 'users' | 'permissions' | 'roles' | 'discovery-settings';

function NavDropdown({ label, children, active, icon }: { label: string, children: React.ReactNode, active: boolean, icon: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative group">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onBlur={(e) => {
          // Close if clicking outside
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setTimeout(() => setIsOpen(false), 200);
          }
        }}
        className={`px-6 py-3 rounded-lg font-medium transition-all flex items-center gap-2 ${active
          ? 'bg-white text-blue-600 shadow-lg font-semibold'
          : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
          }`}
      >
        <span>{icon}</span> {label}
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
          <div className="py-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ label, active, onClick, icon }: { label: string, active: boolean, onClick: () => void, icon?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${active
        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
    >
      {icon && <span>{icon}</span>} {label}
    </button>
  );
}

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
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
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
              {canViewPage(user?.role, 'dashboard') && (
                <button
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'dashboard'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                    }`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  📊 Dashboard
                </button>
              )}

              {/* Tanımlama Grubu */}
              <NavDropdown
                label="Tanımlama"
                icon="📝"
                active={['tasks', 'groups', 'flows'].includes(activeTab)}
              >
                {canViewPage(user?.role, 'tasks') && (
                  <NavItem label="1. Task Tanımlama" active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} />
                )}
                {canViewPage(user?.role, 'groups') && (
                  <NavItem label="2. Grup Tanımlama" active={activeTab === 'groups'} onClick={() => setActiveTab('groups')} />
                )}
                {canViewPage(user?.role, 'flow') && (
                  <NavItem label="3. Akış Tanımlama" active={activeTab === 'flows'} onClick={() => setActiveTab('flows')} />
                )}
              </NavDropdown>

              {/* İlişki Grubu */}
              <NavDropdown
                label="İlişki"
                icon="🔗"
                active={['flow-groups', 'configuration'].includes(activeTab)}
              >
                {canViewPage(user?.role, 'flow') && (
                  <NavItem label="4. Akış-Grup İlişkisi" active={activeTab === 'flow-groups'} onClick={() => setActiveTab('flow-groups')} />
                )}
                {canViewPage(user?.role, 'configuration') && (
                  <NavItem label="5. Grup-Task İlişkisi ve Sıralama" active={activeTab === 'configuration'} onClick={() => setActiveTab('configuration')} />
                )}
              </NavDropdown>

              {/* Zamanlama Grubu */}
              <NavDropdown
                label="Zamanlama"
                icon="🕒"
                active={['schedule', 'flow-schedule'].includes(activeTab)}
              >
                {canViewPage(user?.role, 'schedule') && (
                  <NavItem label="6. Grup Yönetimi" active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} />
                )}
                {canViewPage(user?.role, 'flow') && (
                  <NavItem label="7. Akış Yönetimi" active={activeTab === 'flow-schedule'} onClick={() => setActiveTab('flow-schedule')} />
                )}
              </NavDropdown>

              {canViewPage(user?.role, 'management') && (
                <button
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'management'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                    }`}
                  onClick={() => setActiveTab('management')}
                >
                  📈 Yönetim ve İzleme
                </button>
              )}

              {canViewPage(user?.role, 'history') && (
                <button
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'history'
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                    }`}
                  onClick={() => setActiveTab('history')}
                >
                  📜 Çalışma Geçmişi
                </button>
              )}

              {canViewPage(user?.role, 'tv') && (
                <button
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${activeTab === ('tv' as TabType)
                    ? 'bg-white text-blue-600 shadow-lg font-semibold'
                    : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20'
                    }`}
                  onClick={() => setActiveTab('tv' as TabType)}
                >
                  📺 TV Görünümü
                </button>
              )}

              {/* Ayarlar Grubu */}
              <NavDropdown
                label="Ayarlar"
                icon="⚙️"
                active={['users', 'roles', 'permissions', 'discovery-settings'].includes(activeTab)}
              >
                {canViewPage(user?.role, 'users') && (
                  <NavItem label="Kullanıcı Yönetimi" icon="👥" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
                )}
                {user?.role === 'Admin' && (
                  <NavItem label="Rol Yönetimi" icon="🎭" active={activeTab === 'roles'} onClick={() => setActiveTab('roles')} />
                )}
                {user?.role === 'Admin' && (
                  <NavItem label="Yetki Yönetimi" icon="🔐" active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')} />
                )}
                {user?.role === 'Admin' && (
                  <NavItem label="Keşif Ayarları" icon="⚙️" active={activeTab === 'discovery-settings'} onClick={() => setActiveTab('discovery-settings')} />
                )}
              </NavDropdown>
            </nav>
          </div>
        </header>
      )}
      {activeTab === ('tv' as TabType) ? (
        <TVPage />
      ) : (
        <main className="mx-auto px-8 pb-8">
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'tasks' && <TaskItemDefinitionPage />}
          {activeTab === 'groups' && <GroupDefinitionPage />}
          {activeTab === 'flows' && <FlowDefinitionPage />}
          {activeTab === 'flow-groups' && <FlowGroupConfigurationPage />}
          {activeTab === 'configuration' && <GroupTaskConfigurationPage />}
          {activeTab === 'schedule' && <GroupSchedulePage />}
          {activeTab === 'flow-schedule' && <FlowSchedulePage />}
          {activeTab === 'management' && <ManagementPage />}
          {activeTab === 'history' && <ExecutionHistoryPage />}
          {activeTab === 'users' && <UsersPage />}
          {activeTab === 'roles' && <RolesPage />}
          {activeTab === 'permissions' && <PermissionsPage />}
          {activeTab === 'discovery-settings' && <DiscoverySettingsPage />}
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
