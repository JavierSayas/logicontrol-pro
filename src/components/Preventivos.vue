<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Wrench, ListChecks, Settings } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import Preventivos_Mantenimiento from './Preventivos_Mantenimiento.vue'
import Preventivos_Gestion from './Preventivos_Gestion.vue'

const auth = useAuthStore()

const subtabs = [
  { id: 'mantenimiento', label: 'Mantenimiento', icon: ListChecks },
  { id: 'gestion',       label: 'Gestión',       icon: Settings },
]

const SUBPESTANAS_POR_ROL = {
  user: ['mantenimiento', 'gestion'],
  admin: ['mantenimiento', 'gestion'],
  logistica: ['mantenimiento'],
}

const subtabsVisibles = computed(() => {
  const permitidas = SUBPESTANAS_POR_ROL[auth.role] || ['mantenimiento']
  return subtabs.filter(t => permitidas.includes(t.id))
})

const activeSubtab = ref('mantenimiento')

function aplicarPermisosSubtab() {
  if (!subtabsVisibles.value.find(t => t.id === activeSubtab.value)) {
    activeSubtab.value = subtabsVisibles.value[0]?.id || 'mantenimiento'
  }
}

onMounted(aplicarPermisosSubtab)
watch(() => auth.role, aplicarPermisosSubtab)
</script>

<template>
  <div class="space-y-6">
    <div v-if="subtabsVisibles.length > 1" class="flex gap-1 border-b border-slate-200">
      <button
        v-for="tab in subtabsVisibles"
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

    <keep-alive>
      <Preventivos_Mantenimiento v-if="activeSubtab === 'mantenimiento'" />
      <Preventivos_Gestion v-else-if="activeSubtab === 'gestion'" />
    </keep-alive>
  </div>
</template>
