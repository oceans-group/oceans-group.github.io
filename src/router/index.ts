import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import { isAuthenticated } from '../services/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login, meta: { public: true } },
    // Vistas con carga diferida: cada una (y sus librerías de gráficos/Excel) se descarga al abrirla
    { path: '/api', name: 'documents', component: () => import('../views/DocumentsDashboard.vue') },
    { path: '/', name: 'analytics', component: () => import('../views/AnalyticsDashboard.vue') },
    { path: '/clientes', name: 'lifecycle', component: () => import('../views/CustomerLifecycle.vue') },
  ],
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!isAuthenticated()) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
