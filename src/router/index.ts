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
      path: '/network-quality',
      name: 'network-quality',
      component: () => import('@/views/NetworkQuality.vue'),
    },
    {
      path: '/network-comparison',
      name: 'network-comparison',
      redirect: to => ({ name: 'network-quality', query: { ...to.query, view: 'icmp' } }),
    },
    {
      path: '/tcp-quality',
      name: 'tcp-quality',
      redirect: to => ({ name: 'network-quality', query: to.query }),
    },
    {
      path: '/unlock-quality',
      name: 'unlock-quality',
      component: () => import('@/views/UnlockQuality.vue'),
    },
  ],
})

router.afterEach((to) => {
  const route = typeof to.name === 'string' ? to.name : ''
  void recordVisitorPageView(to.path, route)
})

export default router
