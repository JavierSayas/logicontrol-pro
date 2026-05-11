<script setup>
import { ref, computed, onMounted, onActivated, watch, nextTick } from 'vue'
import { supabase } from '../lib/supabase'
import { FileSpreadsheet, RefreshCw, AlertCircle, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'

const COLUMNAS = [
  { key: 'fecha_manip',          label: 'Fecha manip',           db: 'fecha_manip' },
  { key: 'fecha_cad',            label: 'Fecha cad',             db: 'fecha_cad' },
  { key: 'cl_orden',             label: 'Cl orden',              db: 'cl_orden' },
  { key: 'desc_fruta',           label: 'Desc fruta',            db: 'desc_fruta' },
  { key: 'texto_breve_material', label: 'Texto breve material',  db: 'texto_breve_material' },
  { key: 'nombre_cliente',       label: 'Nombre cliente',        db: 'nombre_cliente' },
  { key: 'cant_orden',           label: 'cant orden',            db: 'cant_orden' },
  { key: 'p_x',                  label: 'p+x',                   db: 'p_x' },
  { key: 'cant_notificada',      label: 'cant notificada',       db: 'cant_notificada' },
  { key: 'estado',               label: 'estado',                db: 'estado' },
  { key: 'num_orden',            label: 'nº orden',              db: 'num_orden' },
  { key: 'linea',                label: 'línea',                 db: 'linea' },
  { key: 'unidad',               label: 'unidad',                db: 'unidad' },
  { key: 'lote',                 label: 'lote',                  db: 'lote' },
  { key: 'destinatario',         label: 'Destinatario',          db: 'destinatario' },
]

const filas = ref([])
const loading = ref(false)
const errorMsg = ref('')
const toast = ref(null)
const toastType = ref('success')
const saveStatus = ref('idle')
const hayDatosGuardados = ref(false)
const fecha = ref(new Date().toISOString().slice(0, 10))
const fechasDisponibles = ref([])
let debounceTimer = null
let isLoadingData = false

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

function showToast(message, type = 'success') {
  toast.value = message
  toastType.value = type
  setTimeout(() => { toast.value = null }, 3500)
}

function handlePaste(event) {
  event.preventDefault()
  errorMsg.value = ''

  const texto = event.clipboardData.getData('text')
  const lineas = texto.trim().split(/[\r\n]+/).filter(l => l.trim())

  if (lineas.length === 0) {
    showToast('No hay datos para pegar', 'error')
    return
  }

  if (hayDatosGuardados.value) {
    const fechaSel = new Date(fecha.value + 'T12:00:00').toLocaleDateString('es-ES')
    const ok = window.confirm(`Ya hay datos guardados para el ${fechaSel}.\n\n¿Quieres reemplazarlos con los datos que estás pegando?`)
    if (!ok) {
      showToast('Pegado cancelado', 'error')
      return
    }
  }

  const sep = lineas[0].includes('\t') ? '\t' : '|'
  const filasParseadas = []

  const [yyyy, mm, dd] = fecha.value.split('-')
  const fechaManipFormateada = `${dd}.${mm}.${yyyy}`

  for (const linea of lineas) {
    const celdas = linea.split(sep).map(c => c.trim())
    if (celdas.length === 0) continue

    const fila = {}
    COLUMNAS.forEach((col, idx) => {
      fila[col.key] = idx < celdas.length ? celdas[idx] : ''
    })

    fila.fecha_manip = fechaManipFormateada

    if (Object.values(fila).some(v => v !== '' && v !== fechaManipFormateada)) {
      filasParseadas.push(fila)
    }
  }

  if (filasParseadas.length === 0) {
    showToast('No se encontraron filas válidas', 'error')
    return
  }

  filas.value = filasParseadas
  hayDatosGuardados.value = true
  showToast(`${filasParseadas.length} filas pegadas`, 'success')
}

async function cargarFechasDisponibles() {
  try {
    const { data, error } = await supabase
      .from('produccion_dia')
      .select('fecha_subida')
      .order('fecha_subida', { ascending: false })
    if (error) throw error
    const set = new Set((data || []).map(r => r.fecha_subida))
    fechasDisponibles.value = [...set]
  } catch {
    fechasDisponibles.value = []
  }
}

async function cargarDatos() {
  isLoadingData = true
  loading.value = true
  errorMsg.value = ''
  try {
    const { data, error } = await supabase
      .from('produccion_dia')
      .select('*')
      .eq('fecha_subida', fecha.value)
      .order('created_at')
    if (error) throw error
    filas.value = (data || []).map(r => {
      const fila = {}
      COLUMNAS.forEach(col => { fila[col.key] = r[col.db] || '' })
      return fila
    })
    hayDatosGuardados.value = filas.value.length > 0
    await cargarFechasDisponibles()
  } catch (err) {
    errorMsg.value = 'Error cargando datos: ' + err.message
  } finally {
    loading.value = false
    await nextTick()
    isLoadingData = false
  }
}

async function guardar() {
  saveStatus.value = 'saving'
  errorMsg.value = ''
  try {
    const { error: deleteError } = await supabase
      .from('produccion_dia')
      .delete()
      .eq('fecha_subida', fecha.value)
    if (deleteError) throw deleteError

    if (filas.value.length > 0) {
      const rows = filas.value.map(f => {
        const row = { fecha_subida: fecha.value }
        COLUMNAS.forEach(col => { row[col.db] = f[col.key] || null })
        return row
      })
      const { error } = await supabase.from('produccion_dia').insert(rows)
      if (error) throw error
    }
    saveStatus.value = 'saved'
    await cargarFechasDisponibles()
  } catch (err) {
    saveStatus.value = 'error'
    errorMsg.value = 'Error guardando: ' + err.message
  }
}

function scheduleAutoSave() {
  if (isLoadingData) return
  clearTimeout(debounceTimer)
  saveStatus.value = 'idle'
  debounceTimer = setTimeout(guardar, 800)
}

function limpiar() {
  filas.value = []
  hayDatosGuardados.value = false
  errorMsg.value = ''
}

watch(filas, scheduleAutoSave, { deep: true })
watch(fecha, cargarDatos)

const hayDatos = computed(() => filas.value.length > 0)

onMounted(cargarDatos)
onActivated(cargarDatos)
</script>

<template>
  <div class="space-y-5">
    <transition name="slide-in">
      <div
        v-if="toast"
        :class="[
          'fixed top-6 right-6 flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg border z-50',
          toastType === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        ]"
      >
        <component :is="toastType === 'success' ? CheckCircle2 : XCircle" class="w-4 h-4 shrink-0" />
        <span class="font-medium text-sm">{{ toast }}</span>
      </div>
    </transition>

    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="text-sm font-medium text-slate-500">
        {{ hayDatos ? `${filas.length} filas cargadas` : 'Haz clic en la tabla y pega los datos (Ctrl+V)' }}
        · Se conservan 10 días
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

        <span class="text-xs font-medium italic">
          <span v-if="saveStatus === 'saving'" class="text-slate-400">Guardando…</span>
          <span v-else-if="saveStatus === 'saved'" class="text-emerald-600 inline-flex items-center gap-1 not-italic">
            <CheckCircle2 class="w-3.5 h-3.5" />
            Guardado
          </span>
          <span v-else-if="saveStatus === 'error'" class="text-red-600 not-italic">Error al guardar</span>
        </span>

        <Button v-if="hayDatos" variant="secondary" @click="limpiar">
          <RefreshCw class="w-4 h-4" />
          Limpiar
        </Button>
      </div>
    </div>

    <div v-if="fechasDisponibles.length > 0" class="flex items-center gap-2 flex-wrap text-xs">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Días con datos:</span>
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

    <Card flush @paste="handlePaste">
      <div class="overflow-x-auto max-h-[600px]">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200">
              <th class="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 w-10 border-r border-slate-100">#</th>
              <th
                v-for="col in COLUMNAS"
                :key="col.key"
                class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap"
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
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sin datos</p>
                    <p class="text-sm font-medium text-slate-500 mt-1">Haz clic aquí y pega tus datos (Ctrl+V)</p>
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
                  class="p-0"
                >
                  <input
                    v-model="fila[col.key]"
                    type="text"
                    class="w-full px-3 py-2 text-xs text-slate-700 bg-transparent outline-none focus:bg-amber-50 transition-colors"
                  />
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
