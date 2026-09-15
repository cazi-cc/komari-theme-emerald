<script setup lang="ts">
import type { WeightedScoreItem } from '@/utils/scoreBreakdown'

withDefaults(defineProps<{
  items: WeightedScoreItem[]
  compact?: boolean
}>(), {
  compact: false,
})

function formatPoints(value: number | null, digits = 2): string {
  return value === null ? '--' : value.toFixed(digits)
}
</script>

<template>
  <div class="min-w-0 text-xs">
    <div v-if="!compact" class="hidden grid-cols-[minmax(130px,1.5fr)_72px_94px_112px] gap-2 border-b border-border/60 px-2 pb-1.5 text-[10px] text-muted-foreground sm:grid">
      <span>评分项 / 原始值</span>
      <span class="text-right">分项分</span>
      <span class="text-right">权重</span>
      <span class="text-right">贡献 / 扣分</span>
    </div>
    <div
      v-for="item in items"
      :key="item.key"
      class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-border/45 px-2 py-2 last:border-b-0 sm:grid-cols-[minmax(130px,1.5fr)_72px_94px_112px] sm:items-center"
      :class="compact ? 'sm:grid-cols-[minmax(120px,1.5fr)_64px_84px_104px]' : ''"
    >
      <div class="min-w-0">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span class="font-medium text-foreground">{{ item.label }}</span>
          <span v-if="item.raw" class="tabular-nums text-muted-foreground">{{ item.raw }}</span>
        </div>
        <p v-if="item.note" class="mt-0.5 text-[10px] leading-4 text-muted-foreground">
          {{ item.note }}
        </p>
      </div>
      <div class="text-right tabular-nums" :class="item.score !== null && item.score < 80 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'">
        {{ item.score === null ? '--' : item.score.toFixed(1) }}
      </div>
      <div class="col-span-2 flex flex-wrap justify-end gap-x-3 text-[10px] text-muted-foreground sm:col-span-1 sm:block sm:text-right">
        <template v-if="item.counted">
          <span>配置 {{ item.configuredWeight.toFixed(1) }}</span>
          <span class="sm:block">本级满分 {{ item.maxPoints.toFixed(2) }}</span>
        </template>
        <span v-else-if="item.score !== null">诊断项，不计分</span>
        <span v-else>数据不足，不计分</span>
      </div>
      <div class="col-span-2 flex justify-end gap-2 tabular-nums sm:col-span-1 sm:block sm:text-right">
        <template v-if="item.counted">
          <span class="text-foreground">得 {{ formatPoints(item.earnedPoints) }}</span>
          <span class="text-red-600 dark:text-red-400 sm:ml-1">扣 {{ formatPoints(item.deductedPoints) }}</span>
        </template>
        <span v-else class="text-muted-foreground">--</span>
      </div>
    </div>
  </div>
</template>
