import type { NetworkQualitySummary, NetworkQualitySummaryTask } from '@/utils/tcpQuality'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { loadNetworkQualitySummary } from '@/utils/tcpQuality'

export function useHomeNetworkScore() {
  const appStore = useAppStore()
  const summary = ref<NetworkQualitySummary | null>(null)
  const activeIndex = ref(0)
  const loading = ref(false)
  let carouselTimer: ReturnType<typeof setInterval> | undefined
  let refreshTimer: ReturnType<typeof setInterval> | undefined

  const mode = computed(() => appStore.themeSettings.homeNetworkScoreMode)
  const selectedTasks = computed(() => {
    const tasks = summary.value?.tasks ?? []
    if (mode.value === 'fixed')
      return tasks
    const configured = appStore.themeSettings.homeNetworkScoreTaskIds
    if (configured.length === 0)
      return tasks
    const byId = new Map(tasks.map(task => [task.id, task]))
    return configured.map(id => byId.get(id)).filter((task): task is NetworkQualitySummaryTask => Boolean(task))
  })
  const currentTask = computed<NetworkQualitySummaryTask | null>(() => {
    if (mode.value === 'off')
      return null
    const tasks = selectedTasks.value
    if (tasks.length === 0)
      return null
    if (mode.value === 'fixed') {
      return tasks.find(task => task.id === appStore.themeSettings.homeNetworkScoreFixedTaskId) ?? tasks[0] ?? null
    }
    return tasks[activeIndex.value % tasks.length] ?? null
  })

  async function load(force = false) {
    loading.value = true
    try {
      summary.value = await loadNetworkQualitySummary(appStore.themeSettings.homeNetworkScoreHours, force)
      if (activeIndex.value >= selectedTasks.value.length)
        activeIndex.value = 0
    }
    catch {
      summary.value = null
    }
    finally {
      loading.value = false
    }
  }

  function restartCarousel() {
    if (carouselTimer)
      clearInterval(carouselTimer)
    carouselTimer = undefined
    if (mode.value !== 'carousel' || selectedTasks.value.length <= 1)
      return
    carouselTimer = setInterval(() => {
      if (!document.hidden)
        activeIndex.value = (activeIndex.value + 1) % selectedTasks.value.length
    }, appStore.themeSettings.homeNetworkScoreCarouselSeconds * 1000)
  }

  watch(() => appStore.themeSettings.homeNetworkScoreHours, () => void load(true))
  watch([
    mode,
    () => appStore.themeSettings.homeNetworkScoreCarouselSeconds,
    () => appStore.themeSettings.homeNetworkScoreTaskIds.join(','),
    () => selectedTasks.value.length,
  ], () => {
    activeIndex.value = 0
    restartCarousel()
  })

  onMounted(() => {
    void load()
    restartCarousel()
    refreshTimer = setInterval(() => void load(true), 5 * 60 * 1000)
  })
  onUnmounted(() => {
    if (carouselTimer)
      clearInterval(carouselTimer)
    if (refreshTimer)
      clearInterval(refreshTimer)
  })

  return { currentTask, selectedTasks, loading, refresh: () => load(true) }
}
