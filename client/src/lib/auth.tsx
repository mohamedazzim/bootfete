import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  eventId?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string, fullName: string, role: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  async function fetchCurrentUser() {
    // Only a definitive 401 invalidates the session. Transient failures
    // (5xx, network) are retried so a slow backend doesn't log users out
    // on every page refresh.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setIsLoading(false);
          return;
        }

        if (response.status === 401) {
          localStorage.removeItem('token');
          setToken(null);
          setIsLoading(false);
          return;
        }
        // Non-401: fall through to retry
      } catch (error) {
        // Network error: fall through to retry
        console.error('Failed to fetch current user:', error);
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    // All retries exhausted without a 401: keep the token but let the
    // app render unauthenticated rather than purging a valid session.
    setIsLoading(false);
  }

  async function login(username: string, password: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    
    if (data.user.role === 'super_admin') {
      setLocation('/admin/dashboard');
    } else if (data.user.role === 'event_admin') {
      setLocation('/event-admin/dashboard');
    } else if (data.user.role === 'registration_committee') {
      setLocation('/registration-committee/dashboard');
    } else {
      setLocation('/participant/dashboard');
    }
  }

  async function register(username: string, password: string, email: string, fullName: string, role: string) {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password, email, fullName, role })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data = await response.json();
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    
    if (data.user.role === 'super_admin') {
      setLocation('/admin/dashboard');
    } else if (data.user.role === 'event_admin') {
      setLocation('/event-admin/dashboard');
    } else if (data.user.role === 'registration_committee') {
      setLocation('/registration-committee/dashboard');
    } else {
      setLocation('/participant/dashboard');
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setLocation('/login');
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
