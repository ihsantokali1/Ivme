import { useState, useEffect } from 'react';
import { rolesApi } from '../services/api';
import type { Role } from '../services/api';

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rolesApi.getAll();
      setRoles(data);
    } catch (err) {
      console.error('Roller yüklenirken hata:', err);
      setError(err instanceof Error ? err.message : 'Roller yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingRole(null);
    setFormData({ name: '', description: '', isActive: true });
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setIsCreating(false);
    setFormData({
      name: role.name,
      description: role.description || '',
      isActive: role.isActive,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingRole(null);
    setFormData({ name: '', description: '', isActive: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      setSuccess(null);

      if (editingRole) {
        await rolesApi.update(editingRole.id, formData);
        setSuccess('Rol başarıyla güncellendi!');
      } else {
        await rolesApi.create(formData);
        setSuccess('Rol başarıyla oluşturuldu!');
      }

      await loadRoles();
      handleCancel();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Rol kaydedilirken hata:', err);
      setError(err instanceof Error ? err.message : 'Rol kaydedilirken hata oluştu');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`'${name}' rolünü silmek istediğinize emin misiniz? Bu rolü kullanan kullanıcılar varsa silinemez.`)) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      await rolesApi.delete(id);
      setSuccess('Rol başarıyla silindi!');
      await loadRoles();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Rol silinirken hata:', err);
      setError(err instanceof Error ? err.message : 'Rol silinirken hata oluştu');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center py-8 text-gray-600 dark:text-gray-400">Yükleniyor...</div>;
  }

  return (
    <div className="py-4">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Rol Yönetimi</h2>
        <button
          onClick={handleCreate}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          + Yeni Rol Ekle
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-100 dark:bg-green-900 border border-green-400 text-green-700 dark:text-green-300 rounded-lg">
          {success}
        </div>
      )}

      {(isCreating || editingRole) && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {editingRole ? 'Rol Düzenle' : 'Yeni Rol Oluştur'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Rol Adı *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Manager, Editor"
                required
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Açıklama
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Rolün açıklaması"
                rows={3}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isActive" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Aktif
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                {editingRole ? 'Güncelle' : 'Oluştur'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Rol Adı
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Açıklama
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Durum
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                İşlemler
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  {role.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {role.description || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      role.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    }`}
                  >
                    {role.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(role)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDelete(role.id, role.name)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      disabled={role.name === 'Admin' || role.name === 'User'}
                      title={role.name === 'Admin' || role.name === 'User' ? 'Varsayılan roller silinemez' : ''}
                    >
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {roles.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Henüz rol tanımlanmamış.
          </div>
        )}
      </div>
    </div>
  );
}

