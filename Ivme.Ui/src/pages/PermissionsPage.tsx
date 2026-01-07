import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Permission } from '../utils/permissions';
import { getRolePermissions, clearPermissionsCache } from '../utils/permissions';
import { permissionsApi, rolesApi } from '../services/api';
import type { Role } from '../services/api';

// Yetki kategorileri ve açıklamaları
const permissionCategories = {
  'Sayfa Yetkileri': {
    'pages.tasks.view': 'Task Sayfasını Görüntüleme',
    'pages.tasks.create': 'Task Oluşturma',
    'pages.tasks.update': 'Task Güncelleme',
    'pages.tasks.delete': 'Task Silme',
    'pages.groups.view': 'Grup Sayfasını Görüntüleme',
    'pages.groups.create': 'Grup Oluşturma',
    'pages.groups.update': 'Grup Güncelleme',
    'pages.groups.delete': 'Grup Silme',
    'pages.configuration.view': 'Konfigürasyon Sayfasını Görüntüleme',
    'pages.configuration.update': 'Konfigürasyon Güncelleme',
    'pages.schedule.view': 'Schedule Sayfasını Görüntüleme',
    'pages.schedule.update': 'Schedule Güncelleme',
    'pages.management.view': 'Yönetim Sayfasını Görüntüleme',
    'pages.history.view': 'Geçmiş Sayfasını Görüntüleme',
    'pages.tv.view': 'TV Görünümü Sayfasını Görüntüleme',
    'pages.users.view': 'Kullanıcı Yönetimi Sayfasını Görüntüleme',
    'pages.users.create': 'Kullanıcı Oluşturma',
    'pages.users.update': 'Kullanıcı Güncelleme',
    'pages.users.delete': 'Kullanıcı Silme',
  },
  'İşlem Yetkileri': {
    'actions.task.start': 'Task Başlatma',
    'actions.task.stop': 'Task Durdurma',
    'actions.task.pause': 'Task Duraklatma',
    'actions.task.resume': 'Task Devam Ettirme',
    'actions.task.complete': 'Task Tamamlama',
    'actions.task.markAsSuccess': 'Task Başarılı İşaretleme',
    'actions.task.fail': 'Task Hata İşaretleme',
    'actions.task.restart': 'Task Yeniden Başlatma',
    'actions.group.start': 'Grup Başlatma',
    'actions.group.stop': 'Grup Durdurma',
  },
};

export default function PermissionsPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [localPermissions, setLocalPermissions] = useState<Record<string, Permission[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const loadRoles = async () => {
    try {
      const data = await rolesApi.getAll();
      setRoles(data.filter(r => r.isActive));
      if (data.length > 0 && !selectedRole) {
        setSelectedRole(data[0].name);
      }
    } catch (err) {
      console.error('Roller yüklenirken hata:', err);
    }
  };

  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const permissions = await getRolePermissions();
      setLocalPermissions(permissions);
    } catch (err) {
      console.error('Yetkiler yüklenirken hata:', err);
      setError(err instanceof Error ? err.message : 'Yetkiler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Tüm yetkileri listele
  const allPermissions = useMemo(() => {
    const perms: Permission[] = [];
    Object.values(permissionCategories).forEach(category => {
      Object.keys(category).forEach(key => {
        perms.push(key as Permission);
      });
    });
    return perms;
  }, []);

  const togglePermission = (role: string, permission: Permission) => {
    setLocalPermissions(prev => {
      const rolePerms = prev[role] || [];
      const hasPermission = rolePerms.includes(permission);
      
      return {
        ...prev,
        [role]: hasPermission
          ? rolePerms.filter(p => p !== permission)
          : [...rolePerms, permission],
      };
    });
  };

  const toggleAllPermissionsInCategory = (role: string, categoryPermissions: Record<string, string>) => {
    setLocalPermissions(prev => {
      const rolePerms = prev[role] || [];
      const categoryPermKeys = Object.keys(categoryPermissions) as Permission[];
      
      // Eğer kategorideki tüm yetkiler seçiliyse, hepsini kaldır
      const allSelected = categoryPermKeys.every(perm => rolePerms.includes(perm));
      
      if (allSelected) {
        // Tümünü kaldır
        return {
          ...prev,
          [role]: rolePerms.filter(p => !categoryPermKeys.includes(p)),
        };
      } else {
        // Tümünü ekle (zaten olanları koru)
        const newPerms = [...rolePerms];
        categoryPermKeys.forEach(perm => {
          if (!newPerms.includes(perm)) {
            newPerms.push(perm);
          }
        });
        return {
          ...prev,
          [role]: newPerms,
        };
      }
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      await permissionsApi.updateRole(selectedRole, localPermissions[selectedRole] || []);
      
      // Cache'i temizle ve yeniden yükle
      clearPermissionsCache();
      await loadPermissions();
      
      // Seçili rolün yetkilerini API'den tekrar yükle (yeni roller için önemli)
      try {
        const rolePermissions = await permissionsApi.getByRole(selectedRole);
        setLocalPermissions(prev => ({
          ...prev,
          [selectedRole]: rolePermissions as Permission[],
        }));
      } catch (err) {
        console.warn('Rol yetkileri yeniden yüklenirken hata:', err);
      }
      
      setSuccess('Yetkiler başarıyla güncellendi!');
      
      // 3 saniye sonra success mesajını kaldır
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Yetkiler güncellenirken hata:', err);
      setError(err instanceof Error ? err.message : 'Yetkiler güncellenirken hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Varsayılan yetkilere dönmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      // Varsayılan yetkileri yükle
      await permissionsApi.initialize();
      
      // Cache'i temizle ve yeniden yükle
      clearPermissionsCache();
      await loadPermissions();
      
      setSuccess('Varsayılan yetkilere dönüldü!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      console.error('Varsayılan yetkiler yüklenirken hata:', err);
      setError(err instanceof Error ? err.message : 'Varsayılan yetkiler yüklenirken hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'Admin') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <p className="text-red-600 dark:text-red-400 text-lg font-semibold">
          Bu sayfaya erişim yetkiniz yok. Sadece Admin kullanıcıları yetki yönetimi yapabilir.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Yetkiler yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Yetki Yönetimi</h2>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {saving ? 'İşleniyor...' : 'Varsayılanlara Dön'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Rol Seçimi */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rol Seçimi</h3>
        <div className="flex gap-4 flex-wrap">
          {roles.map(role => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.name)}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                selectedRole === role.name
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {role.name}
            </button>
          ))}
        </div>
      </div>

      {/* Yetki Listesi */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {selectedRole} Rolü İçin Yetkiler
        </h3>
        
        {Object.entries(permissionCategories).map(([categoryName, permissions]) => {
          const categoryPermKeys = Object.keys(permissions) as Permission[];
          const allSelected = categoryPermKeys.every(perm => localPermissions[selectedRole]?.includes(perm) || false);
          
          return (
          <div key={categoryName} className="mb-6">
            <div className="flex justify-between items-center mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
              <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200">
                {categoryName}
              </h4>
              <button
                onClick={() => toggleAllPermissionsInCategory(selectedRole, permissions)}
                className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors"
              >
                {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(permissions).map(([permission, description]) => {
                const hasPermission = localPermissions[selectedRole]?.includes(permission as Permission) || false;
                return (
                  <label
                    key={permission}
                    className="flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={hasPermission}
                      onChange={() => togglePermission(selectedRole, permission as Permission)}
                      className="w-5 h-5 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {description}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {permission}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

