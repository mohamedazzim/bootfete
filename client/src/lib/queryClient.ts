import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    // Attach structured error fields (code, invalidMembers, department, ...)
    // from the JSON body so callers can react to machine-readable errors.
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = null;
    }

    if (json && typeof json === 'object' && typeof json.message === 'string') {
      const error = new Error(json.message) as Error & Record<string, unknown>;
      Object.assign(error, json);
      throw error;
    }

    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  // GET and HEAD requests cannot have a body
  const shouldIncludeBody = method !== 'GET' && method !== 'HEAD' && data;

  const res = await fetch(url, {
    method,
    headers,
    body: shouldIncludeBody ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      };

      const res = await fetch(queryKey.join("/") as string, {
        headers,
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true, // Enable reconnect refetch for real-time app
      staleTime: 30 * 1000, // 30 seconds - reduced for faster WebSocket-triggered refetches
      gcTime: 5 * 60 * 1000, // 5 minutes - garbage collection time
      retry: 1, // Retry once on failure
    },
    mutations: {
      retry: false,
    },
  },
});
