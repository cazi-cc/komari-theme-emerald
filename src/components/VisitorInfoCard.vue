<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'

interface VisitorClientData {
  device: string
  browser: string
}

interface VisitorInfoRow {
  value: string
  icon: string
  expandOnly?: boolean
}

const ANDROID_REGEX = /android/i
const IPHONE_OR_IPOD_REGEX = /iphone|ipod/i
const IPAD_REGEX = /ipad/i
const TABLET_REGEX = /tablet/i
const EDGE_VERSION_REGEX = /Edg\/\d+/i
const OPERA_VERSION_REGEX = /OPR\/\d+/i
const CHROME_VERSION_REGEX = /Chrome\/\d+/i
const EDGE_OR_OPERA_REGEX = /Edg|OPR/i
const FIREFOX_VERSION_REGEX = /Firefox\/\d+/i
const SAFARI_REGEX = /Safari/i
const CHROME_REGEX = /Chrome/i

const client = detectClient()
const visitTime = formatVisitTime(new Date())
const expand = ref(false)

const visitorRows = computed<VisitorInfoRow[]>(() => [
  {
    value: '本次访问',
    icon: 'tabler:shield-lock',
  },
  {
    value: client.device,
    icon: 'tabler:device-desktop',
    expandOnly: true,
  },
  {
    value: client.browser,
    icon: 'tabler:browser',
  },
  {
    value: visitTime,
    icon: 'tabler:clock-hour-4',
    expandOnly: true,
  },
])
const visibleRows = computed(() => visitorRows.value.filter(item => expand.value || !item.expandOnly))

function getItemTransitionStyle(index: number): Record<string, string> {
  return {
    '--visitor-pill-delay': `${index * 28}ms`,
  }
}

function formatVisitTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function detectClient(): VisitorClientData {
  const ua = navigator.userAgent

  let device = '桌面设备'
  if (ANDROID_REGEX.test(ua))
    device = TABLET_REGEX.test(ua) ? 'Android 平板' : 'Android 手机'
  else if (IPHONE_OR_IPOD_REGEX.test(ua))
    device = 'iPhone'
  else if (IPAD_REGEX.test(ua))
    device = 'iPad'
  else if (TABLET_REGEX.test(ua))
    device = '平板电脑'

  let browser = '未知浏览器'
  if (EDGE_VERSION_REGEX.test(ua))
    browser = 'Edge'
  else if (OPERA_VERSION_REGEX.test(ua))
    browser = 'Opera'
  else if (CHROME_VERSION_REGEX.test(ua) && !EDGE_OR_OPERA_REGEX.test(ua))
    browser = 'Chrome'
  else if (FIREFOX_VERSION_REGEX.test(ua))
    browser = 'Firefox'
  else if (SAFARI_REGEX.test(ua) && !CHROME_REGEX.test(ua))
    browser = 'Safari'

  return { device, browser }
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-2.5 z-30 flex justify-center">
    <div
      class="pointer-events-auto cursor-default p-1.5 px-3 shadow-[-1px_-1px_0_background,0_0_16px_rgba(0,0,0,0.05)] transition-[border-radius,transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] bg-background/30 backdrop-blur-sm"
      :class="[
        expand
          ? 'rounded-lg -translate-y-1 bg-background/38 shadow-[-1px_-1px_0_background,0_10px_28px_rgba(0,0,0,0.08)]'
          : 'rounded-xl',
      ]"
      title="仅在本机识别设备与浏览器，不查询外部 IP 服务"
      @click="expand = !expand"
    >
      <TransitionGroup
        tag="div"
        name="visitor-pill"
        class="transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        :class="[expand ? 'grid grid-cols-2 items-start justify-start gap-x-3 gap-y-2' : 'flex flex-nowrap items-center justify-center gap-x-3 gap-y-1']"
      >
        <div
          v-for="(item, index) in visibleRows" :key="item.icon"
          class="flex min-w-0 items-center gap-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          :style="getItemTransitionStyle(index)"
        >
          <div class="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Icon :icon="item.icon" :width="14" :height="14" />
          </div>
          <div
            class="min-w-0 transition-[opacity,transform] duration-220 ease-[cubic-bezier(0.22,1,0.36,1)]"
            :class="[expand || !index ? 'block opacity-100 translate-y-0' : 'hidden md:block md:opacity-100', !expand && index ? 'md:translate-y-0' : '']"
          >
            <p class="max-w-30 truncate text-xs font-medium text-muted-foreground sm:max-w-50">
              {{ item.value }}
            </p>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.visitor-pill-enter-active,
.visitor-pill-leave-active,
.visitor-pill-move {
  transition:
    opacity 220ms ease,
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.visitor-pill-enter-active {
  transition-delay: var(--visitor-pill-delay, 0ms);
}

.visitor-pill-enter-from,
.visitor-pill-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}

.visitor-pill-leave-active {
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .visitor-pill-enter-active,
  .visitor-pill-leave-active,
  .visitor-pill-move {
    transition: none;
  }

  .visitor-pill-enter-from,
  .visitor-pill-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
