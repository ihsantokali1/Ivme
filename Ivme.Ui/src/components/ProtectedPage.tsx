import { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { canViewPage } from '../utils/permissions';

interface ProtectedPageProps {
  page: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Sayfa bazlı yetkilendirme component'i
 * Kullanıcının yetkisi yoksa sayfayı gizler
 */
export default function ProtectedPage({ page, children, fallback }: ProtectedPageProps) {
  const { user } = useAuth();
  const userRole = user?.role;

  if (!canViewPage(userRole, page)) {
    return (
      fallback || (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <p className="text-red-600 dark:text-red-400 text-lg font-semibold">
            Bu sayfaya erişim yetkiniz yok.
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}

