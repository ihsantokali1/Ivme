export type UserRole = 'Admin' | 'User';

export type Permission = 
  // Sayfa bazlı
  | 'pages.tasks.view'
  | 'pages.tasks.create'
  | 'pages.tasks.update'
  | 'pages.tasks.delete'
  | 'pages.groups.view'
  | 'pages.groups.create'
  | 'pages.groups.update'
  | 'pages.groups.delete'
  | 'pages.configuration.view'
  | 'pages.configuration.update'
  | 'pages.schedule.view'
  | 'pages.schedule.update'
  | 'pages.management.view'
  | 'pages.history.view'
  | 'pages.tv.view'
  | 'pages.users.view'
  | 'pages.users.create'
  | 'pages.users.update'
  | 'pages.users.delete'
  // Action bazlı
  | 'actions.task.start'
  | 'actions.task.stop'
  | 'actions.task.pause'
  | 'actions.task.resume'
  | 'actions.task.complete'
  | 'actions.task.markAsSuccess'
  | 'actions.task.fail'
  | 'actions.task.restart'
  | 'actions.group.start'
  | 'actions.group.stop';

// Varsayılan yetki matrisi (fallback için)
const defaultRolePermissions: Record<UserRole, Permission[]> = {
  Admin: [
    'pages.tasks.view', 'pages.tasks.create', 'pages.tasks.update', 'pages.tasks.delete',
    'pages.groups.view', 'pages.groups.create', 'pages.groups.update', 'pages.groups.delete',
    'pages.configuration.view', 'pages.configuration.update',
    'pages.schedule.view', 'pages.schedule.update',
    'pages.management.view', 'pages.history.view', 'pages.tv.view',
    'pages.users.view', 'pages.users.create', 'pages.users.update', 'pages.users.delete',
    'actions.task.start', 'actions.task.stop', 'actions.task.pause', 'actions.task.resume',
    'actions.task.complete', 'actions.task.markAsSuccess', 'actions.task.fail', 'actions.task.restart',
    'actions.group.start', 'actions.group.stop'
  ],
  User: [
    'pages.tasks.view', 'pages.groups.view', 'pages.configuration.view',
    'pages.schedule.view', 'pages.management.view', 'pages.history.view', 'pages.tv.view',
    'actions.task.start', 'actions.task.stop', 'actions.task.pause', 'actions.task.resume',
    'actions.task.complete', 'actions.task.markAsSuccess', 'actions.task.fail', 'actions.task.restart',
    'actions.group.start', 'actions.group.stop'
  ],
};

// Cache için
let cachedRolePermissions: Record<string, Permission[]> | null = null;
let cacheTimestamp: number = 0;
let cacheVersion: number = 0; // Cache versiyonu (cache temizlendiğinde artar)
const CACHE_DURATION = 60000; // 1 dakika

// Cache versiyonunu export et (ProtectedButton'lar için)
export function getCacheVersion(): number {
  return cacheVersion;
}

// API'den yetkileri çek
async function fetchRolePermissions(): Promise<Record<string, Permission[]>> {
  try {
    const { permissionsApi } = await import('../services/api');
    const allPermissions = await permissionsApi.getAll();
    
    // API'den gelen tüm rolleri kullan, yoksa varsayılan yetkileri kullan
    const result: Record<string, Permission[]> = {};
    
    // Admin ve User için varsayılan yetkileri ekle
    result['Admin'] = (allPermissions['Admin'] || defaultRolePermissions.Admin) as Permission[];
    result['User'] = (allPermissions['User'] || defaultRolePermissions.User) as Permission[];
    
    // API'den gelen diğer rolleri de ekle
    Object.keys(allPermissions).forEach(role => {
      if (role !== 'Admin' && role !== 'User') {
        result[role] = allPermissions[role] as Permission[];
      }
    });
    
    cachedRolePermissions = result as Record<UserRole, Permission[]>;
    cacheTimestamp = Date.now();
    return result;
  } catch (error) {
    console.warn('Yetkiler API\'den çekilemedi, varsayılan yetkiler kullanılıyor:', error);
    return defaultRolePermissions as Record<string, Permission[]>;
  }
}

// Yetkileri getir (cache'den veya API'den)
export async function getRolePermissions(): Promise<Record<string, Permission[]>> {
  const now = Date.now();
  
  // Cache geçerliyse cache'den dön
  if (cachedRolePermissions && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRolePermissions as Record<string, Permission[]>;
  }
  
  // Cache geçersizse API'den çek
  return await fetchRolePermissions();
}

// Cache'i temizle (yetki güncellemesi sonrası)
export function clearPermissionsCache() {
  cachedRolePermissions = null;
  cacheTimestamp = 0;
  cacheVersion++; // Cache versiyonunu artır
}

// Export için (geriye dönük uyumluluk)
export const rolePermissions = defaultRolePermissions;

/**
 * Kullanıcının belirli bir yetkiye sahip olup olmadığını kontrol eder
 */
export async function hasPermissionAsync(userRole: UserRole | string | undefined, permission: Permission): Promise<boolean> {
  if (!userRole) return false;
  
  const role = userRole as string;
  const rolePerms = await getRolePermissions();
  const permissions = rolePerms[role] || [];
  
  return permissions.includes(permission);
}

/**
 * Kullanıcının belirli bir yetkiye sahip olup olmadığını kontrol eder (sync versiyon - cache kullanır)
 */
export function hasPermission(userRole: UserRole | string | undefined, permission: Permission): boolean {
  if (!userRole) return false;
  
  const role = userRole as string;
  // Cache varsa kullan, yoksa varsayılan yetkileri kullan
  const permissions = cachedRolePermissions?.[role] || defaultRolePermissions[role as UserRole] || [];
  
  return permissions.includes(permission);
}

/**
 * Kullanıcının belirli bir sayfayı görüntüleyip görüntüleyemeyeceğini kontrol eder
 */
export function canViewPage(userRole: UserRole | string | undefined, page: string): boolean {
  return hasPermission(userRole, `pages.${page}.view` as Permission);
}

/**
 * Kullanıcının belirli bir action'ı gerçekleştirip gerçekleştiremeyeceğini kontrol eder
 */
export function canPerformAction(userRole: UserRole | string | undefined, action: string): boolean {
  return hasPermission(userRole, `actions.${action}` as Permission);
}

