import type { User } from './api';

const API_BASE_URL = 'http://localhost:5041/api';
const TOKEN_KEY = 'ivme_auth_token';
const USER_KEY = 'ivme_user';

export type LoginResponse = {
  token: string;
  user: User;
};

export const authService = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Giriş başarısız' }));
      throw new Error(error.message || 'Giriş başarısız');
    }

    const data: LoginResponse = await response.json();
    
    // Token ve kullanıcı bilgisini localStorage'a kaydet
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    
    return data;
  },

  logout: (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser: (): User | null => {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  isAuthenticated: (): boolean => {
    return !!authService.getToken();
  },

  getCurrentUser: async (): Promise<User | null> => {
    const token = authService.getToken();
    if (!token) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          authService.logout();
          return null;
        }
        return null;
      }

      const user: User = await response.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  },
};

