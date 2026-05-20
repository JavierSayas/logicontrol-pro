<script setup>
import { ref } from 'vue'
import { Receipt, ClipboardPaste } from 'lucide-vue-next'
import Albaranes_ECI_Albaran from './Albaranes_ECI_Albaran.vue'
import Albaranes_ECI_Pegar from './Albaranes_ECI_Pegar.vue'

const subsubtabs = [
  { id: 'albaran', label: 'Albarán',     icon: Receipt },
  { id: 'pegar',   label: 'Pegar datos', icon: ClipboardPaste },
]

const activeSubsubtab = ref('albaran')
</script>

<template>
  <div class="space-y-4">
    <div class="no-print flex gap-1 border-b border-slate-200">
      <button
        v-for="tab in subsubtabs"
        :key="tab.id"
        @click="activeSubsubtab = tab.id"
        :class="[
          'flex items-center gap-2 px-4 py-2 -mb-px font-medium text-sm transition-colors border-b-2',
          activeSubsubtab === tab.id
            ? 'border-slate-700 text-slate-900'
            : 'border-transparent text-slate-500 hover:text-slate-700'
        ]"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <Albaranes_ECI_Albaran v-if="activeSubsubtab === 'albaran'" />
    <Albaranes_ECI_Pegar v-else-if="activeSubsubtab === 'pegar'" @ir-albaran="activeSubsubtab = 'albaran'" />
  </div>
</template>
