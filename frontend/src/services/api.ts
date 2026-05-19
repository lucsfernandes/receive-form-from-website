import axios, { AxiosError, AxiosHeaders } from 'axios';
import type {
  ContactMessage,
  NotFoundResponse,
  PaginatedMessages,
} from '../types/contact';

const baseURL = import.meta.env.VITE_API_BASE_URL || '';

/** Name of the CSRF cookie issued by the backend (mirror in `X-CSRF-Token`). */
export const CSRF_COOKIE_NAME = 'rf_csrf';

function readCookie(name: string): string | null {
  // document is always defined in a Vite SPA, but stay defensive for SSR-ish tests.
  if (typeof document === 'undefined') return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split('; ');
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

/**
 * Axios instance preconfigured for the dashboard.
 *
 *  - withCredentials so the HttpOnly session cookie rides on every request.
 *  - X-Requested-With marks the request as fetch-originated, which the server
 *    can use as a soft CSRF signal (in addition to the double-submit token).
 *  - A request interceptor mirrors the CSRF cookie into a header for
 *    non-GET requests, satisfying the server's double-submit check.
 */
export const api = axios.create({
  baseURL,
  timeout: 15_000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head' && method !== 'options') {
    const token = readCookie(CSRF_COOKIE_NAME);
    if (token) {
      // Use AxiosHeaders to keep type-safety in v1.x.
      const headers = AxiosHeaders.from(config.headers);
      headers.set('X-CSRF-Token', token);
      config.headers = headers;
    }
  }
  return config;
});

/**
 * Subscribers notified when the server says we're no longer authenticated.
 * AuthContext registers a listener that wipes its state and redirects.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Attempts to silently rotate the session using the refresh cookie. Returns
 * true if the rotation succeeded and the original request can be retried.
 * Concurrent calls share the same in-flight promise to avoid stampedes.
 */
async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${baseURL}/api/auth/refresh`, null, {
        withCredentials: true,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 10_000,
      })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (err: AxiosError) => {
    const status = err.response?.status;
    const original = err.config as
      | (typeof err.config & { _retried?: boolean; _skipAuthRefresh?: boolean })
      | undefined;

    if (
      status === 401 &&
      original &&
      !original._retried &&
      !original._skipAuthRefresh
    ) {
      original._retried = true;
      const refreshed = await tryRefresh();
      if (refreshed) {
        return api.request(original);
      }
      // Notify listeners exactly once per failed refresh.
      for (const listener of unauthorizedListeners) listener();
    }

    return Promise.reject(err);
  },
);

export type ApiFailureKind = 'not-found' | 'network' | 'server' | 'unauthorized' | 'validation';

export interface ApiFailure {
  kind: ApiFailureKind;
  status?: number;
  message: string;
  fields?: Record<string, string[]>;
}

export function toFailure(err: unknown, notFoundMessage = 'Recurso não encontrado'): ApiFailure {
  const axiosErr = err as AxiosError<NotFoundResponse & { fields?: Record<string, string[]> }>;
  if (axiosErr.response) {
    const status = axiosErr.response.status;
    if (status === 404) {
      return {
        kind: 'not-found',
        status,
        message: axiosErr.response.data?.message ?? notFoundMessage,
      };
    }
    if (status === 401 || status === 403) {
      return {
        kind: 'unauthorized',
        status,
        message: 'Sessão expirada ou acesso negado. Faça login novamente.',
      };
    }
    if (status === 400 && axiosErr.response.data?.fields) {
      return {
        kind: 'validation',
        status,
        message: axiosErr.response.data.message ?? 'Dados inválidos',
        fields: axiosErr.response.data.fields,
      };
    }
    return {
      kind: 'server',
      status,
      message: `Falha no servidor (${status}). Tente novamente em instantes.`,
    };
  }
  return {
    kind: 'network',
    message:
      'Não foi possível alcançar o servidor. Verifique sua conexão e tente novamente.',
  };
}

const MAX_FIELD_LEN = 10_000;

function clamp(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_FIELD_LEN ? value.slice(0, MAX_FIELD_LEN) : value;
}

function isValidRow(row: unknown): row is ContactMessage {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.createdAt === 'string' &&
    r.createdAt.length > 0
  );
}

function normalizeRow(row: ContactMessage): ContactMessage {
  return {
    id: row.id,
    name: clamp(row.name),
    email: clamp(row.email),
    subject: clamp(row.subject),
    message: clamp(row.message),
    createdAt: row.createdAt,
  };
}

export interface ListMessagesParams {
  page?: number;
  pageSize?: number;
  q?: string;
  signal?: AbortSignal;
}

/** GET /api/contact — paginated list of submissions, newest-first. */
export async function listMessages({
  page = 1,
  pageSize = 20,
  q,
  signal,
}: ListMessagesParams = {}): Promise<PaginatedMessages> {
  try {
    const { data } = await api.get<PaginatedMessages>('/api/contact', {
      params: {
        page,
        pageSize,
        ...(q && q.trim().length > 0 ? { q: q.trim() } : {}),
      },
      signal,
    });
    const rows = Array.isArray(data?.data) ? data.data : [];
    return {
      data: rows.filter(isValidRow).map(normalizeRow),
      page: Number(data?.page) || 1,
      pageSize: Number(data?.pageSize) || pageSize,
      total: Number(data?.total) || 0,
      totalPages: Number(data?.totalPages) || 1,
    };
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw toFailure(err);
  }
}

/** GET /api/contact/:id — fetches a single submission by UUID. */
export async function getMessage(
  id: string,
  signal?: AbortSignal,
): Promise<ContactMessage> {
  try {
    const { data } = await api.get<ContactMessage>(`/api/contact/${id}`, {
      signal,
    });
    if (!isValidRow(data)) {
      throw toFailure({ response: { status: 404, data: {} } }, 'Mensagem não encontrada');
    }
    return normalizeRow(data);
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    if (err && typeof err === 'object' && 'kind' in (err as object)) throw err;
    throw toFailure(err, 'Mensagem não encontrada');
  }
}
