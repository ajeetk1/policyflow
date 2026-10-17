"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

type PolicyAuth = {
  configured: boolean;
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  userName: string | null;
  getToken: () => Promise<string | null>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SESSION_KEY = "policyflow-session";

const anonymousAuth: PolicyAuth = {
  configured: true,
  loaded: false,
  signedIn: false,
  userId: null,
  userName: null,
  getToken: async () => null,
  login: async () => {
    throw new Error("Authentication is not ready.");
  },
  signup: async () => {
    throw new Error("Authentication is not ready.");
  },
  logout: async () => {},
};

const PolicyAuthContext = createContext<PolicyAuth>(anonymousAuth);

function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const savedUrl = window.localStorage.getItem("policyflow-api-url");
    if (savedUrl) return savedUrl.replace(/\/+$/, "");
  }

  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
    .replace(/\/+$/, "");
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.detail || body.message || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const saveSession = useCallback((data: AuthResponse) => {
    const session = {
      access_token: data.access_token,
      user: data.user,
    };

    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setToken(data.access_token);
    setUser(data.user);
  }, []);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SESSION_KEY);

      if (saved) {
        const session = JSON.parse(saved) as {
          access_token?: string;
          user?: AuthUser;
        };

        if (session.access_token && session.user?.id && session.user?.email) {
          setToken(session.access_token);
          setUser(session.user);
        } else {
          window.sessionStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      window.sessionStorage.removeItem(SESSION_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  const authenticate = useCallback(
    async (path: "/auth/login" | "/auth/signup", payload: {
      email: string;
      password: string;
      name?: string;
    }) => {
      const response = await fetch(`${getApiBaseUrl()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as AuthResponse;

      if (!data.access_token || !data.user?.id) {
        throw new Error("The server returned an invalid authentication response.");
      }

      saveSession(data);
    },
    [saveSession],
  );

  const login = useCallback(
    (email: string, password: string) =>
      authenticate("/auth/login", { email, password }),
    [authenticate],
  );

  const signup = useCallback(
    (email: string, password: string, name: string) =>
      authenticate("/auth/signup", { email, password, name }),
    [authenticate],
  );

  const getToken = useCallback(async () => token, [token]);

  const logout = useCallback(async () => {
    const currentToken = token;

    try {
      if (currentToken) {
        await fetch(`${getApiBaseUrl()}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      }
    } finally {
      window.sessionStorage.removeItem(SESSION_KEY);
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const value = useMemo<PolicyAuth>(
    () => ({
      configured: true,
      loaded,
      signedIn: Boolean(token && user),
      userId: user?.id ?? null,
      userName: user?.name || user?.email || null,
      getToken,
      login,
      signup,
      logout,
    }),
    [loaded, token, user, getToken, login, signup, logout],
  );

  return (
    <PolicyAuthContext.Provider value={value}>
      {children}
    </PolicyAuthContext.Provider>
  );
}

export function usePolicyAuth() {
  return useContext(PolicyAuthContext);
}
