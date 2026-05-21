import { createRouter, createWebHashHistory } from 'vue-router'
import DocumentsDashboard from '../views/DocumentsDashboard.vue'
import ProductsDashboard from '../views/ProductsDashboard.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/api',
      name: 'documents',
      component: DocumentsDashboard,
    },
    {
      path: '/',
      name: 'products',
      component: ProductsDashboard,
    },
  ],
})

export default router
