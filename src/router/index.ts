import { createRouter, createWebHistory } from 'vue-router'
import { recordVisitorPageView } from '@/utils/visitorAudit'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/instance/:id',
      name: 'instance-detail',
      component: () => import('@/views/InstanceDetail.vue'),
    },
    {
      path: '/network-comparison',
      name: 'network-comparison',
      component: () => import('@/views/NetworkComparison.vue'),
    },
    {
      path: '/tcp-quality',
      name: 'tcp-quality',
      component: () => import('@/views/TCPQuality.vue'),
    },
  ],
})

router.afterEach((to) => {
  const route = typeof to.name === 'string' ? to.name : ''
  void recordVisitorPageView(to.path, route)
})

export default router
