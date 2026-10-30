// Auth client — cookie-session (httpOnly `fd_session` tại Library server).
// Login bắt buộc ở UI (auth gate), nhưng storage vẫn local-first: data lưu
// localStorage trước, mirror lên server qua serverStore (credentials include).

import { LIBRARY_API_URL } from './config';

export interface AuthUser {
  id: string;
  username: string;
}

const CACHE_KEY = 'fluentdev-auth-user';

/** Username cho UI (cookie là source of truth; giá trị này chỉ để render). */
export function cachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as AuthUser;
    return u && typeof u.username === 'string' ? u : null;
  } catch {
    return null;
  }
}

function cacheUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

interface AuthResponse {
  user?: AuthUser | null;
  error?: string;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

// Timeout cho mọi auth fetch: server "đơ" (không refuse mà treo) không được
// phép treo gate spinner / nút submit vô hạn.
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function authRequest(path: string, body: unknown): Promise<AuthResult> {
  try {
    const r = await fetchWithTimeout(`${LIBRARY_API_URL}/api/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as AuthResponse;
    if (!r.ok || !j?.user) return { ok: false, error: j?.error ?? `Lỗi ${r.status}` };
    saveUser(j.user);
    return { ok: true, user: j.user };
  } catch {
    return { ok: false, error: 'Không kết nối được Library server — kiểm tra `npm run dev:server`.' };
  }
}

function saveUser(user: AuthUser | null): void {
  cacheUser(user);
}

/** Hỏi server user hiện tại (cookie). null nếu chưa login/anonymous. */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const r = await fetchWithTimeout(`${LIBRARY_API_URL}/api/auth/me`, { credentials: 'include' });
    if (!r.ok) return null;
    const j = (await r.json()) as AuthResponse;
    saveUser(j?.user ?? null);
    return j?.user ?? null;
  } catch {
    return cachedUser(); // server không chạy — UI dùng cache, cookie vẫn sống
  }
}

export async function register(username: string, password: string): Promise<AuthResult> {
  return authRequest('register', { username, password });
}

export async function login(username: string, password: string): Promise<AuthResult> {
  return authRequest('login', { username, password });
}

export async function logout(): Promise<void> {
  try {
    await fetchWithTimeout(`${LIBRARY_API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
  saveUser(null);
}
