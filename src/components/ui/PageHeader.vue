<script setup>
import { computed } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'

const props = defineProps({
  caption: { type: String, default: '' },
  captionIcon: { type: [Object, Function], default: null },
  theme: { type: String, default: 'slate' },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  showBack: { type: Boolean, default: false },
})

defineEmits(['back'])

const themePalette = {
  slate:  { icon: 'text-slate-600',  caption: 'text-slate-600' },
  blue:   { icon: 'text-blue-600',   caption: 'text-blue-700' },
  indigo: { icon: 'text-indigo-600', caption: 'text-indigo-700' },
  cyan:   { icon: 'text-cyan-600',   caption: 'text-cyan-700' },
  violet: { icon: 'text-violet-600', caption: 'text-violet-700' },
  amber:  { icon: 'text-amber-600',  caption: 'text-amber-700' },
  emerald:{ icon: 'text-emerald-600',caption: 'text-emerald-700' },
}

const palette = computed(() => themePalette[props.theme] || themePalette.slate)
</script>

<template>
  <header class="flex items-end justify-between gap-4 border-b border-slate-200 pb-6">
    <div class="flex items-start gap-3 min-w-0">
      <button
        v-if="showBack"
        @click="$emit('back')"
        class="shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        title="Volver"
      >
        <ArrowLeft class="w-4 h-4" />
      </button>
      <div class="min-w-0">
        <div v-if="caption" class="flex items-center gap-2 mb-1">
          <component v-if="captionIcon" :is="captionIcon" class="w-3.5 h-3.5" :class="palette.icon" />
          <p class="text-[11px] font-semibold uppercase tracking-wider" :class="palette.caption">
            {{ caption }}
          </p>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight truncate">{{ title }}</h1>
        <p v-if="subtitle" class="text-sm font-medium text-slate-500 mt-1">{{ subtitle }}</p>
        <slot name="meta" />
      </div>
    </div>
    <div class="flex items-end gap-6 shrink-0">
      <slot name="actions" />
    </div>
  </header>
</template>
