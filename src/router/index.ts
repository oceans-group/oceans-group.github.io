import { createRouter, createWebHistory } from 'vue-router'
import DocumentsDashboard from '../views/DocumentsDashboard.vue'
import ProductsDashboard from '../views/ProductsDashboard.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'documents',
      component: DocumentsDashboard,
    },
    {
      path: '/productos',
      name: 'products',
      component: ProductsDashboard,
    },
  ],
})

export default router
