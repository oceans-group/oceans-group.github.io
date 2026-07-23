import axios from 'axios'

const authClient = axios.create({
  baseURL: import.meta.env.VITE_PROXY_URL,
})

const TOKEN_KEY = 'oceans_auth_token'
const EXPIRES_KEY = 'oceans_auth_expires_at'

export async function login(email: string, password: string): Promise<void> {
  const res = await authClient.post<{ token: string; expires_at: number }>('/login', { email, password })
  localStorage.setItem(TOKEN_KEY, res.data.token)
  localStorage.setItem(EXPIRES_KEY, String(res.data.expires_at))
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  const token = getToken()
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) ?? 0)
  return !!token && Date.now() < expiresAt
}
