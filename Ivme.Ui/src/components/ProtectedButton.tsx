import { useState, useEffect } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { canPerformAction, hasPermission, getRolePermissions, getCacheVersion } from '../utils/permissions';
import type { Permission } from '../utils/permissions';

interface ProtectedButtonProps {
  permission: Permission | string;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  title?: string;
  fallback?: ReactNode;
}

/**
 * Yetki kontrolü yapan buton component'i
 * Kullanıcının yetkisi yoksa butonu gizler veya disabled yapar
 */
export default function ProtectedButton({
  permission,
  children,
  onClick,
  disabled = false,
  className = '',
  title,
  fallback = null,
}: ProtectedButtonProps) {
  const { user } = useAuth();
  const userRole = user?.role;
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(getCacheVersion());

  // Permissions'ı yükle
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        await getRolePermissions();
        setPermissionsLoaded(true);
        setCacheVersion(getCacheVersion());
      } catch (err) {
        console.warn('Yetkiler yüklenirken hata:', err);
        setPermissionsLoaded(true); // Hata olsa bile varsayılan yetkileri kullan
      }
    };
    
    if (!permissionsLoaded) {
      loadPermissions();
    }
  }, [permissionsLoaded]);

  // Cache versiyonunu periyodik olarak kontrol et (cache temizlendiğinde algılamak için)
  useEffect(() => {
    const checkCacheVersion = () => {
      const currentCacheVersion = getCacheVersion();
      if (currentCacheVersion !== cacheVersion && permissionsLoaded) {
        // Cache versiyonu değiştiyse permissions'ı yeniden yükle
        setPermissionsLoaded(false);
      }
    };
    
    const interval = setInterval(checkCacheVersion, 500); // Her 500ms'de bir kontrol et
    return () => clearInterval(interval);
  }, [cacheVersion, permissionsLoaded]);

  // Permission string ise parse et
  let hasAccess = false;
  if (permissionsLoaded) {
    if (permission.startsWith('pages.')) {
      // pages.tasks.create gibi permission'lar için direkt hasPermission kullan
      hasAccess = hasPermission(userRole, permission as Permission);
    } else if (permission.startsWith('actions.')) {
      const action = permission.replace('actions.', '');
      hasAccess = canPerformAction(userRole, action);
    } else {
      hasAccess = hasPermission(userRole, permission as Permission);
    }
  }

  // Permissions henüz yüklenmediyse fallback göster (veya hiçbir şey gösterme)
  if (!permissionsLoaded) {
    return <>{fallback}</>;
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}

