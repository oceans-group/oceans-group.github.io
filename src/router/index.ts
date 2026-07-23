import { createRouter, createWebHashHistory } from 'vue-router'
import DocumentsDashboard from '../views/DocumentsDashboard.vue'
import ProductsDashboard from '../views/ProductsDashboard.vue'
import CustomerLifecycle from '../views/CustomerLifecycle.vue'
import Login from '../views/Login.vue'
import { isAuthenticated } from '../services/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login, meta: { public: true } },
    { path: '/api', name: 'documents', component: DocumentsDashboard },
    { path: '/', name: 'products', component: ProductsDashboard },
    { path: '/clientes', name: 'lifecycle', component: CustomerLifecycle },
  ],
})

router.beforeEach((to) => {
  if (to.meta.public) return true
  if (!isAuthenticated()) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
