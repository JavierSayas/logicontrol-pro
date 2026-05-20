<script setup>
import { ref } from 'vue'
import { FileText, Receipt } from 'lucide-vue-next'
import Albaranes_Manual from './Albaranes_Manual.vue'
import Albaranes_ECI from './Albaranes_ECI.vue'

const subtabs = [
  { id: 'manual', label: 'Albarán Manual', icon: FileText },
  { id: 'eci',    label: 'Albarán ECI',    icon: Receipt },
]

const activeSubtab = ref('manual')
</script>

<template>
  <div class="space-y-6">
    <div class="no-print flex gap-1 border-b border-slate-200">
      <button
        v-for="tab in subtabs"
        :key="tab.id"
        @click="activeSubtab = tab.id"
        :class="[
          'flex items-center gap-2 px-4 py-2.5 -mb-px font-semibold text-sm transition-colors border-b-2',
          activeSubtab === tab.id
            ? 'border-amber-600 text-amber-700'
            : 'border-transparent text-slate-500 hover:text-slate-700'
        ]"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <Albaranes_Manual v-if="activeSubtab === 'manual'" />
    <Albaranes_ECI v-else-if="activeSubtab === 'eci'" />
  </div>
</template>
