<script setup>
import { ref, computed } from 'vue'
import { ClipboardPaste, Trash2, Eraser, TriangleAlert, Check, FileText } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import Button from './ui/Button.vue'
import PageHeader from './ui/PageHeader.vue'
import { useAlbaranEciStore } from '../stores/albaranEci'

const eciStore = useAlbaranEciStore()
const { filasPegadas, albaranes } = storeToRefs(eciStore)

const emit = defineEmits(['ir-formulario'])

const columnas = [
  { key: 'salida',     label: 'Salida' },
  { key: 'sm',         label: 'SM' },
  { key: 'tpte',       label: 'Tpte' },
  { key: 'entrega',    label: 'Entrega' },
  { key: 'destino2',   label: 'Destino 2' },
  { key: 'mped',       label: 'Mped' },
  { key: 'material',   label: 'Material' },
  { key: 'cajas',      label: 'Cajas' },
  { key: 'um',         label: 'UM' },
  { key: 'id',         label: 'Id' },
  { key: 'nEntrega',   label: 'Nº entrega' },
  { key: 'nPedido',    label: 'Nº pedido' },
  { key: 'alm',        label: 'Alm' },
  { key: 'agente',     label: 'Agente' },
  { key: 'cliente',    label: 'Cliente' },
  { key: 'docVentas',  label: 'doc. Ventas' },
  { key: 'posicion',   label: 'Posición' },
]

const error = ref('')
const toast = ref(null)
const toastType = ref('success')

const filas = filasPegadas

function showToast(message, type = 'success') {
  toast.value = message
  toastType.value = type
  setTimeout(() => { toast.value = null }, 3500)
}

function esCabecera(celdas) {
  const primera = (celdas[0] || '').toLowerCase()
  return primera === 'salida' || primera.startsWith('salida ')
}

function handlePaste(event) {
  event.preventDefault()
  error.value = ''

  const texto = event.clipboardData.getData('text')
  const lineas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim())

  if (lineas.length === 0) {
    error.value = 'Pega al menos una fila de datos.'
    showToast('No hay datos para pegar', 'error')
    return
  }

  const sep = lineas[0].includes('\t') ? '\t' : '|'
  const nuevasFilas = []

  for (let i = 0; i < lineas.length; i++) {
    const celdas = lineas[i].split(sep).map(c => c.trim())
    if (celdas.length === 0) continue
    if (i === 0 && esCabecera(celdas)) continue

    const fila = {}
    columnas.forEach((col, idx) => {
      fila[col.key] = idx < celdas.length ? celdas[idx] : ''
    })

    if (Object.values(fila).some(v => v !== '')) {
      nuevasFilas.push(fila)
    }
  }

  if (nuevasFilas.length === 0) {
    error.value = 'No se han encontrado filas con datos.'
    showToast('No se encontraron datos válidos', 'error')
    return
  }

  eciStore.aplicarFilasPegadas(nuevasFilas)
  showToast(`${nuevasFilas.length} filas cargadas — ${eciStore.cantidadAlbaranes} albarán(es) generado(s)`, 'success')
}

function limpiar() {
  eciStore.limpiarPegado()
  error.value = ''
  showToast('Datos limpiados', 'success')
}

function eliminarFila(i) {
  const nuevas = filas.value.slice()
  nuevas.splice(i, 1)
  eciStore.aplicarFilasPegadas(nuevas)
}

function irAAlbaran(i) {
  eciStore.setActive(i)
  emit('ir-formulario')
}

function continuarAFormulario() {
  emit('ir-formulario')
}

const hayDatos = computed(() => filas.value.length > 0)
const hayAlgunError = computed(() => albaranes.value.some(a => a.errorTransporte || a.errorAlbaran))
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      caption="Documentación"
      :caption-icon="ClipboardPaste"
      theme="slate"
      title="Pegar datos"
      subtitle="Pegar entregas exportadas de SAP (TAB o |) — se generará un albarán por cada Nº de pedido distinto"
    >
      <template #actions>
        <Button v-if="hayDatos" variant="secondary" @click="limpiar">
          <Eraser class="w-4 h-4" />
          Limpiar
        </Button>
      </template>
    </PageHeader>

    <div
      v-if="!hayDatos"
      class="border-2 border-dashed border-slate-300 bg-slate-50 rounded-xl p-10 text-center cursor-text"
      tabindex="0"
      @paste="handlePaste"
    >
      <ClipboardPaste class="w-10 h-10 mx-auto text-slate-400 mb-3" />
      <p class="font-semibold text-slate-700">Pega aquí los datos</p>
      <p class="text-xs text-slate-500 mt-1">Selecciona las filas en SAP/Excel y pulsa Ctrl+V sobre esta zona</p>
      <p v-if="error" class="text-xs text-red-600 mt-2">{{ error }}</p>
    </div>

    <div v-if="hayDatos" class="space-y-3">
      <div class="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <FileText class="w-4 h-4" />
        {{ albaranes.length }} albarán{{ albaranes.length === 1 ? '' : 'es' }} generado{{ albaranes.length === 1 ? '' : 's' }}
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div
          v-for="(alb, i) in albaranes"
          :key="i"
          :class="[
            'rounded-lg border p-3 text-xs',
            (alb.errorTransporte || alb.errorAlbaran) ? 'bg-red-50 border-red-300' : 'bg-emerald-50 border-emerald-300'
          ]"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2 font-semibold" :class="(alb.errorTransporte || alb.errorAlbaran) ? 'text-red-700' : 'text-emerald-700'">
              <component :is="(alb.errorTransporte || alb.errorAlbaran) ? TriangleAlert : Check" class="w-4 h-4" />
              Albarán {{ i + 1 }}
            </div>
            <button @click="irAAlbaran(i)" class="text-[11px] underline text-slate-600 hover:text-slate-900">Abrir →</button>
          </div>
          <div class="space-y-1 text-slate-800">
            <div>
              <span class="text-slate-500">Nº pedido:</span>
              <span class="font-mono font-semibold ml-1">{{ alb.numPedido || '—' }}</span>
            </div>
            <div :class="alb.errorAlbaran ? 'text-red-700' : ''">
              <span class="text-slate-500">Nº albarán:</span>
              <span class="font-mono font-semibold ml-1">{{ alb.errorAlbaran ? `${alb.valoresAlbaran.length} distintos` : (alb.numAlbaran || '—') }}</span>
              <span v-if="alb.errorAlbaran" class="block text-[11px] mt-0.5">{{ alb.valoresAlbaran.join(', ') }}</span>
            </div>
            <div :class="alb.errorTransporte ? 'text-red-700' : ''">
              <span class="text-slate-500">Nº transporte:</span>
              <span class="font-mono font-semibold ml-1">{{ alb.errorTransporte ? `${alb.valoresTransporte.length} distintos` : (alb.numTransporte || '—') }}</span>
              <span v-if="alb.errorTransporte" class="block text-[11px] mt-0.5">{{ alb.valoresTransporte.join(', ') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="hayDatos && hayAlgunError"
      class="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700"
    >
      <TriangleAlert class="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>Algún albarán tiene más de 2 valores distintos de transporte o entrega. Revísalo — esos campos no se han copiado automáticamente.</span>
    </div>

    <div v-if="hayDatos" class="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead class="bg-slate-100 sticky top-0">
            <tr>
              <th
                v-for="col in columnas"
                :key="col.key"
                class="px-2 py-2 text-left font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap"
              >{{ col.label }}</th>
              <th class="px-2 py-2 border-b border-slate-200 w-8"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filas" :key="i" class="hover:bg-slate-50">
              <td
                v-for="col in columnas"
                :key="col.key"
                class="px-2 py-1.5 border-b border-slate-100 whitespace-nowrap text-slate-700"
              >{{ f[col.key] }}</td>
              <td class="px-2 py-1.5 border-b border-slate-100 text-center">
                <button @click="eliminarFila(i)" class="text-slate-400 hover:text-red-600" title="Eliminar fila">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
        <span>{{ filas.length }} {{ filas.length === 1 ? 'fila' : 'filas' }}</span>
        <span class="text-slate-400">Pega de nuevo para sobrescribir los datos</span>
      </div>
    </div>

    <div
      v-if="hayDatos"
      class="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-lg p-4 text-center text-xs text-slate-500 cursor-text"
      tabindex="0"
      @paste="handlePaste"
    >
      Pega aquí para reemplazar los datos
    </div>

    <div
      v-if="hayDatos"
      class="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
    >
      <div class="text-sm text-emerald-900">
        <span class="font-semibold">Listo.</span>
        {{ albaranes.length }} albarán{{ albaranes.length === 1 ? '' : 'es' }} preparado{{ albaranes.length === 1 ? '' : 's' }}. Continúa al formulario para añadir productos y completar los datos manuales.
      </div>
      <Button @click="continuarAFormulario">
        Ir al formulario →
      </Button>
    </div>

    <transition name="fade">
      <div
        v-if="toast"
        :class="[
          'fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium',
          toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        ]"
      >{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
