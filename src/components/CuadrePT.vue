<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ClipboardList, Factory, Calculator, FileSpreadsheet, Building2, Boxes } from 'lucide-vue-next'
import CuadrePT_Produccion from './CuadrePT_Produccion.vue'
import CuadrePT_Cuadre from './CuadrePT_Cuadre.vue'
import CuadrePT_ProduccionDia from './CuadrePT_ProduccionDia.vue'
import CuadrePT_PedidosAldi from './CuadrePT_PedidosAldi.vue'
import Lidl from './Lidl.vue'
import PageHeader from './ui/PageHeader.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const subtabs = [
  // 'produccion' oculta: unificada en tiempo real con CMI, ya no hace falta
  // duplicarla aquí. Componente CuadrePT_Produccion.vue se deja sin usar por
  // si hiciera falta reactivarla.
  { id: 'cuadre',        label: 'Cuadre',             icon: Calculator },
  { id: 'pedidosAldi',   label: 'Pedidos Aldi',       icon: Boxes },
  { id: 'produccionDia', label: 'Producción del día', icon: FileSpreadsheet },
  { id: 'lidl',          label: 'Lidl',               icon: Building2 },
]

const SUBPESTANAS_POR_ROL = {
  logistica: ['lidl'],
}

const subtabsVisibles = computed(() => {
  const permitidas = SUBPESTANAS_POR_ROL[auth.role]
  if (!permitidas) return subtabs
  return subtabs.filter(t => permitidas.includes(t.id))
})

const activeSubtab = ref('produccion')

function aplicarPermisosSubtab() {
  if (!subtabsVisibles.value.find(t => t.id === activeSubtab.value)) {
    activeSubtab.value = subtabsVisibles.value[0]?.id || 'produccion'
  }
}

onMounted(aplicarPermisosSubtab)
watch(() => auth.role, aplicarPermisosSubtab)
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      caption="Operaciones"
      :caption-icon="ClipboardList"
      theme="indigo"
      title="Pedidos"
      subtitle="Planificación, cuadre, producción y plataformas Lidl"
    />

    <div v-if="subtabsVisibles.length > 1" class="flex gap-1 border-b border-slate-200 -mt-2">
      <button
        v-for="tab in subtabsVisibles"
        :key="tab.id"
        @click="activeSubtab = tab.id"
        :class="[
          'flex items-center gap-2 px-4 py-2.5 -mb-px font-semibold text-sm transition-colors border-b-2',
          activeSubtab === tab.id
            ? 'border-indigo-600 text-indigo-700'
            : 'border-transparent text-slate-500 hover:text-slate-700'
        ]"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <keep-alive>
      <CuadrePT_Produccion v-if="activeSubtab === 'produccion'" />
      <CuadrePT_Cuadre v-else-if="activeSubtab === 'cuadre'" />
      <CuadrePT_PedidosAldi v-else-if="activeSubtab === 'pedidosAldi'" />
      <CuadrePT_ProduccionDia v-else-if="activeSubtab === 'produccionDia'" />
      <Lidl v-else-if="activeSubtab === 'lidl'" />
    </keep-alive>
  </div>
</template>
