<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import NetworkComparison from '@/views/NetworkComparison.vue'
import TCPQuality from '@/views/TCPQuality.vue'
import { loadTCPQualityTasks } from '@/utils/tcpQuality'

const route = useRoute()
const router = useRouter()
const activeView = computed(() => route.query.view === 'icmp' ? 'icmp' : 'combined')

async function setView(view: 'combined' | 'icmp') {
  if (view === 'combined') {
    await router.replace({ query: { ...route.query, view: undefined, pingTask: undefined } })
    return
  }
  const tcpTaskId = Number(route.query.task)
  const tasks = await loadTCPQualityTasks()
  const pingTaskId = tasks.find(task => task.id === tcpTaskId)?.icmp_task_id
  await router.replace({ query: { ...route.query, view: 'icmp', pingTask: pingTaskId || undefined } })
}
</script>

<template>
  <div class="space-y-4 px-4 pb-10">
    <header class="mx-auto flex w-full max-w-[1280px] min-w-0 items-center gap-3">
      <Button variant="ghost" size="icon-sm" class="shrink-0 bg-background/60" aria-label="返回首页" @click="router.push('/')">
        <Icon icon="lucide:arrow-left" width="17" height="17" />
      </Button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">网络质量</h1>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">一个任务对应一个线路目标，综合比较 ICMP 与 TCP 实际体验</p>
      </div>
    </header>

    <nav class="mx-auto flex w-full max-w-[1280px] gap-1 rounded-md bg-muted/70 p-1" aria-label="网络质量分析视图">
      <button
        type="button" class="h-9 flex-1 rounded px-3 text-sm font-medium transition-colors"
        :class="activeView === 'combined' ? 'bg-background text-emerald-700 shadow-sm dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'"
        @click="setView('combined')"
      >
        综合评分与 TCP
      </button>
      <button
        type="button" class="h-9 flex-1 rounded px-3 text-sm font-medium transition-colors"
        :class="activeView === 'icmp' ? 'bg-background text-emerald-700 shadow-sm dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'"
        @click="setView('icmp')"
      >
        ICMP 延迟详情
      </button>
    </nav>

    <TCPQuality v-if="activeView === 'combined'" embedded />
    <NetworkComparison v-else embedded />
  </div>
</template>
