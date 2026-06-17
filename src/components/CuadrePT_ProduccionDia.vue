<script setup>
import { ref, computed, onMounted, onActivated, watch } from 'vue'
import { supabaseOrigen } from '../lib/supabase'
import { FileSpreadsheet, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'

const COLUMNAS = [
  { key: 'n_orden',      label: 'Nº orden',     db: 'n_orden',      tipo: 'texto',  align: 'left'  },
  { key: 'producto',     label: 'Producto',     db: 'producto',     tipo: 'texto',  align: 'left'  },
  { key: 'cliente',      label: 'Cliente',      db: 'cliente',      tipo: 'texto',  align: 'left'  },
  { key: 'p_plus',       label: 'P+x',          db: 'p_plus',       tipo: 'texto',  align: 'left'  },
  { key: 'material_sap', label: 'Material SAP', db: 'material_sap', tipo: 'texto',  align: 'left'  },
  { key: 'cajas',        label: 'Cajas',        db: 'cajas',        tipo: 'num',    align: 'right' },
  { key: 'ud_fabricar',  label: 'Ud. fabricar', db: 'ud_fabricar',  tipo: 'num',    align: 'right' },
  { key: 'ud_caja',      label: 'Ud./caja',     db: 'ud_caja',      tipo: 'num',    align: 'right' },
  { key: 'kg_caja',      label: 'Kg/caja',      db: 'kg_caja',      tipo: 'num',    align: 'right' },
  { key: 'kg_neto',      label: 'Kg neto',      db: 'kg_neto',      tipo: 'num',    align: 'right' },
  { key: 'fec_cad',      label: 'Fecha cad.',   db: 'fec_cad',      tipo: 'fecha',  align: 'left'  },
  { key: 'entrega',      label: 'Entrega',      db: 'entrega',      tipo: 'fecha',  align: 'left'  },
  { key: 'otros_datos',  label: 'Otros datos',  db: 'otros_datos',  tipo: 'texto',  align: 'left'  },
]

const COLUMNAS_TOTAL = ['cajas', 'ud_fabricar', 'kg_neto']

const filas = ref([])
const loading = ref(false)
const errorMsg = ref('')
const fecha = ref(new Date().toISOString().slice(0, 10))
const fechasDisponibles = ref([])

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const diaSemana = computed(() => {
  const d = new Date(fecha.value + 'T12:00:00')
  return DIAS[d.getDay()]
})
const esHoy = computed(() => fecha.value === new Date().toISOString().slice(0, 10))

function prevDia() {
  const d = new Date(fecha.value + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  fecha.value = d.toISOString().slice(0, 10)
}
function nextDia() {
  const d = new Date(fecha.value + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  fecha.value = d.toISOString().slice(0, 10)
}
function irAHoy() {
  fecha.value = new Date().toISOString().slice(0, 10)
}

function formatNum(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  return n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

function formatFecha(valor) {
  if (!valor) return ''
  const d = new Date(valor + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return String(valor)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function mostrarCelda(fila, col) {
  const valor = fila[col.key]
  if (col.tipo === 'num') return formatNum(valor)
  if (col.tipo === 'fecha') return formatFecha(valor)
  return valor || ''
}

const totales = computed(() => {
  const acc = {}
  COLUMNAS_TOTAL.forEach(key => { acc[key] = 0 })
  filas.value.forEach(fila => {
    COLUMNAS_TOTAL.forEach(key => {
      const n = Number(fila[key])
      if (!Number.isNaN(n)) acc[key] += n
    })
  })
  return acc
})

async function cargarFechasDisponibles() {
  try {
    const { data, error } = await supabaseOrigen
      .from('ordenes_fabricacion')
      .select('fecha_produccion')
      .order('fecha_produccion', { ascending: false })
    if (error) throw error
    const set = new Set((data || []).map(r => r.fecha_produccion).filter(Boolean))
    fechasDisponibles.value = [...set].slice(0, 30)
  } catch {
    fechasDisponibles.value = []
  }
}

async function cargarDatos() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data, error } = await supabaseOrigen
      .from('ordenes_fabricacion')
      .select('id, fecha_produccion, idx, producto, cliente, p_plus, fec_cad, cajas, ud_fabricar, ud_caja, kg_caja, kg_neto, otros_datos, entrega, n_orden, material_sap')
      .eq('fecha_produccion', fecha.value)
      .order('idx', { ascending: true })
    if (error) throw error
    filas.value = (data || []).map(r => {
      const fila = {}
      COLUMNAS.forEach(col => { fila[col.key] = r[col.db] })
      return fila
    })
    await cargarFechasDisponibles()
  } catch (err) {
    errorMsg.value = 'Error cargando producción: ' + err.message
    filas.value = []
  } finally {
    loading.value = false
  }
}

watch(fecha, cargarDatos)

const hayDatos = computed(() => filas.value.length > 0)

onMounted(cargarDatos)
onActivated(cargarDatos)
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="text-sm font-medium text-slate-500">
        {{ hayDatos ? `${filas.length} órdenes de fabricación` : 'Sin producción para la fecha seleccionada' }}
        · Datos de Origen (solo lectura)
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <div class="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
          <button @click="prevDia" class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ChevronLeft class="w-4 h-4" />
          </button>
          <input
            type="date"
            v-model="fecha"
            class="text-sm font-semibold text-slate-900 border-none outline-none focus:ring-0 bg-transparent"
          />
          <button @click="nextDia" class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ChevronRight class="w-4 h-4" />
          </button>
          <span class="ml-1 text-xs font-semibold text-slate-700 capitalize px-2 py-0.5 rounded bg-slate-100">{{ diaSemana }}</span>
          <button
            v-if="!esHoy"
            @click="irAHoy"
            class="ml-1 text-xs font-semibold text-brand-600 hover:text-brand-700 px-2"
          >
            Hoy
          </button>
        </div>

        <Button variant="secondary" :disabled="loading" @click="cargarDatos">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          Actualizar
        </Button>
      </div>
    </div>

    <div v-if="fechasDisponibles.length > 0" class="flex items-center gap-2 flex-wrap text-xs">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Días con producción:</span>
      <button
        v-for="f in fechasDisponibles"
        :key="f"
        @click="fecha = f"
        :class="[
          'px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
          fecha === f
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
        ]"
      >
        {{ new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) }}
      </button>
    </div>

    <div v-if="errorMsg" class="flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <Card flush>
      <div class="overflow-x-auto max-h-[600px]">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200">
              <th class="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 w-10 border-r border-slate-100">#</th>
              <th
                v-for="col in COLUMNAS"
                :key="col.key"
                class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap"
                :class="col.align === 'right' ? 'text-right' : 'text-left'"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-if="!hayDatos">
              <tr v-for="n in 6" :key="n" :class="n % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'">
                <td class="sticky left-0 px-3 py-2.5 text-center text-slate-200 font-mono font-semibold border-r border-slate-100" :class="n % 2 === 0 ? 'bg-slate-50/60' : 'bg-white'">{{ n }}</td>
                <td v-for="col in COLUMNAS" :key="col.key" class="px-3 py-2.5">
                  <div class="h-3 rounded bg-slate-200/40" :style="{ width: n % 3 === 0 ? '60%' : n % 2 === 0 ? '80%' : '40%' }" />
                </td>
              </tr>
              <tr>
                <td :colspan="COLUMNAS.length + 1" class="py-0">
                  <div class="flex flex-col items-center justify-center py-12 -mt-[calc(6*2.75rem)]">
                    <FileSpreadsheet class="w-10 h-10 text-slate-300 mb-3" />
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sin producción</p>
                    <p class="text-sm font-medium text-slate-500 mt-1">No hay órdenes de fabricación para esta fecha</p>
                  </div>
                </td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="(fila, idx) in filas"
                :key="idx"
                :class="['border-t border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40', 'hover:bg-slate-50/80 transition-colors']"
              >
                <td :class="['sticky left-0 px-3 py-2 text-center text-slate-400 font-mono font-semibold text-xs border-r border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40']">
                  {{ idx + 1 }}
                </td>
                <td
                  v-for="col in COLUMNAS"
                  :key="col.key"
                  class="px-3 py-2 text-xs text-slate-700 whitespace-nowrap"
                  :class="[
                    col.align === 'right' ? 'text-right tabular-nums' : 'text-left',
                    col.key === 'producto' || col.key === 'cliente' ? 'font-semibold text-slate-900' : ''
                  ]"
                >
                  {{ mostrarCelda(fila, col) }}
                </td>
              </tr>

              <tr class="border-t-2 border-slate-200 bg-slate-900 text-white">
                <td class="sticky left-0 z-10 bg-slate-900 px-3 py-3 text-center">
                  <span class="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Σ</span>
                </td>
                <td
                  v-for="col in COLUMNAS"
                  :key="col.key"
                  class="px-3 py-3 text-xs"
                  :class="col.align === 'right' ? 'text-right tabular-nums' : 'text-left'"
                >
                  <span v-if="col.key === 'n_orden'" class="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    {{ filas.length }} órdenes
                  </span>
                  <span v-else-if="COLUMNAS_TOTAL.includes(col.key)" class="font-bold text-blue-300 text-sm">
                    {{ formatNum(totales[col.key]) }}
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.slide-in-enter-active,
.slide-in-leave-active {
  transition: all 0.25s ease;
}
.slide-in-enter-from,
.slide-in-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
