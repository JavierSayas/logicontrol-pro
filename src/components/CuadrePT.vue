<script setup>
import { ref } from 'vue'
import { ClipboardList, Factory, Calculator, FileSpreadsheet } from 'lucide-vue-next'
import CuadrePT_Produccion from './CuadrePT_Produccion.vue'
import CuadrePT_Cuadre from './CuadrePT_Cuadre.vue'
import CuadrePT_ProduccionDia from './CuadrePT_ProduccionDia.vue'

const subtabs = [
  { id: 'produccion',    label: 'Producción',         icon: Factory },
  { id: 'cuadre',        label: 'Cuadre',             icon: Calculator },
  { id: 'produccionDia', label: 'Producción del día', icon: FileSpreadsheet },
]

const activeSubtab = ref('produccion')
</script>

<template>
  <div class="space-y-4">
    <!-- HEADER -->
    <div class="flex items-center gap-4">
      <div class="bg-gradient-to-br from-purple-600 to-fuchsia-700 p-3 rounded-xl">
        <ClipboardList class="w-6 h-6 text-white" />
      </div>
      <div>
        <h2 class="font-900 text-slate-900 text-lg">Cuadre PT</h2>
        <p class="text-sm text-slate-500 font-medium">Planificación, cuadre y producción</p>
      </div>
    </div>

    <!-- SUB-TABS -->
    <div class="flex gap-1 border-b border-slate-200">
      <button
        v-for="tab in subtabs"
        :key="tab.id"
        @click="activeSubtab = tab.id"
        :class="[
          'flex items-center gap-2 px-4 py-2.5 -mb-px font-semibold text-sm transition-all duration-150 border-b-2',
          activeSubtab === tab.id
            ? 'border-purple-600 text-purple-700'
            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
        ]"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- CONTENIDO -->
    <keep-alive>
      <CuadrePT_Produccion v-if="activeSubtab === 'produccion'" />
      <CuadrePT_Cuadre v-else-if="activeSubtab === 'cuadre'" />
      <CuadrePT_ProduccionDia v-else-if="activeSubtab === 'produccionDia'" />
    </keep-alive>
  </div>
</template>
