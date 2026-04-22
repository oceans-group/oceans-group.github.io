import { createRouter, createWebHistory } from 'vue-router'
import DocumentsDashboard from '../views/DocumentsDashboard.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'documents',
      component: DocumentsDashboard,
    },
  ],
})

export default router
