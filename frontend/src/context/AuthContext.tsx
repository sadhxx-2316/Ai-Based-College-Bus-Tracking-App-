import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authApi, RegisterParams } from '../api/auth';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, role?: UserRole) => Promise<User>;
  register: (params: RegisterParams) => Promise<{ user: User; message?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      const profile = await authApi.getMe();
      setUser(profile);
      setError(null);
    } catch (err: any) {
      console.warn('Could not fetch user profile:', err);
      setUser(null);
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string, role?: UserRole): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login({ email, password, role });
      localStorage.setItem('token', res.access_token);
      setToken(res.access_token);
      setUser(res.user);
      return res.user;
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (params: RegisterParams): Promise<{ user: User; message?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.register(params);
      // If student (active immediately), set token
      if (res?.user?.account_status === 'active' && res?.access_token) {
        localStorage.setItem('token', res.access_token);
        setToken(res.access_token);
        setUser(res.user);
      }
      return { user: res?.user, message: res?.message };
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setError(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchProfile();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
