import axios from 'axios'
import { getToken, logout } from './auth'

// Cliente del proxy: el token de facturaofitec vive solo en el proxy, nunca en el bundle.
const api = axios.create({
  baseURL: import.meta.env.VITE_PROXY_URL,
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      logout()
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  },
)

export default api
