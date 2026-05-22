<script setup>
import { ref } from 'vue'
import { ClipboardList, Eye, ClipboardPaste } from 'lucide-vue-next'
import Albaranes_ECI_Formulario from './Albaranes_ECI_Formulario.vue'
import Albaranes_ECI_Albaran from './Albaranes_ECI_Albaran.vue'
import Albaranes_ECI_Pegar from './Albaranes_ECI_Pegar.vue'

const subsubtabs = [
  { id: 'pegar',       label: '1. Pegar datos',  icon: ClipboardPaste },
  { id: 'formulario',  label: '2. Formulario',   icon: ClipboardList },
  { id: 'vistaPrevia', label: '3. Vista previa', icon: Eye },
]

const activeSubsubtab = ref('pegar')
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

    <Albaranes_ECI_Pegar v-if="activeSubsubtab === 'pegar'" @ir-formulario="activeSubsubtab = 'formulario'" />
    <Albaranes_ECI_Formulario v-else-if="activeSubsubtab === 'formulario'" @ir-vista-previa="activeSubsubtab = 'vistaPrevia'" />
    <Albaranes_ECI_Albaran v-else-if="activeSubsubtab === 'vistaPrevia'" />
  </div>
</template>
