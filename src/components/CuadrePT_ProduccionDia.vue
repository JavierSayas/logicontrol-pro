<script setup>
import { ref, computed, onMounted, onActivated, watch, nextTick } from 'vue'
import { supabase } from '../lib/supabase'
import { FileSpreadsheet, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-vue-next'

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
    showToast('❌ No hay datos para pegar', 'error')
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
    showToast('❌ No se encontraron filas válidas', 'error')
    return
  }

  filas.value = filasParseadas
  hayDatosGuardados.value = true
  showToast(`✅ ${filasParseadas.length} filas pegadas`, 'success')
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
  <div class="space-y-4">
    <!-- TOAST -->
    <transition name="slide-in">
      <div
        v-if="toast"
        :class="[
          'fixed top-6 right-6 flex items-center gap-3 px-6 py-4 rounded-xl shadow-lg border z-50',
          toastType === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-red-50 border-red-200 text-red-900'
        ]"
      >
        <component :is="toastType === 'success' ? CheckCircle : XCircle" class="w-5 h-5" />
        <span class="font-medium text-sm">{{ toast }}</span>
      </div>
    </transition>

    <!-- HEADER -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <div class="bg-gradient-to-br from-purple-600 to-fuchsia-700 p-2.5 rounded-xl">
          <FileSpreadsheet class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-bold text-slate-900 text-base">Producción del día</h3>
          <p class="text-xs text-slate-500">
            {{ hayDatos ? `${filas.length} filas cargadas` : 'Haz clic en la tabla y pega los datos (Ctrl+V)' }}
            · Se conservan 10 días
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <!-- NAVEGACIÓN FECHA -->
        <div class="flex items-center gap-1 border border-slate-300 rounded-lg px-3 py-1.5 bg-white">
          <button @click="prevDia" class="px-1 text-slate-500 hover:text-slate-800 font-bold">◀</button>
          <input
            type="date"
            v-model="fecha"
            class="text-sm border-none outline-none focus:ring-0 bg-transparent"
          />
          <button @click="nextDia" class="px-1 text-slate-500 hover:text-slate-800 font-bold">▶</button>
          <span class="ml-2 text-xs font-semibold text-slate-700 capitalize">{{ diaSemana }}</span>
          <button
            v-if="!esHoy"
            @click="irAHoy"
            class="ml-2 text-xs font-semibold text-purple-600 hover:text-purple-800"
          >
            Hoy
          </button>
        </div>

        <span class="text-xs italic">
          <span v-if="saveStatus === 'saving'" class="text-slate-500">Guardando…</span>
          <span v-else-if="saveStatus === 'saved'" class="text-green-600">Guardado ✓</span>
          <span v-else-if="saveStatus === 'error'" class="text-red-500">Error al guardar</span>
        </span>
        <button
          v-if="hayDatos"
          @click="limpiar"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          <RefreshCw class="w-4 h-4" />
          Limpiar
        </button>
      </div>
    </div>

    <!-- DÍAS CON DATOS -->
    <div v-if="fechasDisponibles.length > 0" class="flex items-center gap-2 flex-wrap text-xs">
      <span class="text-slate-500 font-semibold">Días con datos:</span>
      <button
        v-for="f in fechasDisponibles"
        :key="f"
        @click="fecha = f"
        :class="[
          'px-2.5 py-1 rounded-full font-semibold border transition-all',
          fecha === f
            ? 'bg-purple-600 text-white border-purple-600'
            : 'bg-white text-slate-700 border-slate-300 hover:border-purple-400 hover:text-purple-700'
        ]"
      >
        {{ new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) }}
      </button>
    </div>

    <!-- ERROR -->
    <div v-if="errorMsg" class="flex items-center gap-2 text-red-600 text-sm font-semibold bg-red-50 px-4 py-3 rounded-lg border border-red-200">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- TABLA -->
    <div
      class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md"
      @paste="handlePaste"
    >
      <div class="overflow-x-auto max-h-[600px]">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th class="sticky left-0 z-10 bg-slate-200 text-black font-bold uppercase tracking-wide px-3 py-3 text-center w-10 border-r border-slate-400">#</th>
              <th
                v-for="col in COLUMNAS"
                :key="col.key"
                class="bg-slate-200 text-black font-bold uppercase tracking-wide px-3 py-3 text-left whitespace-nowrap border-r border-slate-400 last:border-r-0 text-xs"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-if="!hayDatos">
              <tr v-for="n in 6" :key="n" :class="n % 2 === 0 ? 'bg-slate-50' : 'bg-white'">
                <td class="sticky left-0 px-3 py-3 text-center text-slate-200 font-mono font-bold border-r border-slate-100" :class="n % 2 === 0 ? 'bg-slate-50' : 'bg-white'">{{ n }}</td>
                <td v-for="col in COLUMNAS" :key="col.key" class="px-3 py-3 border-r border-slate-100 last:border-r-0">
                  <div class="h-3 rounded bg-slate-200/50" :style="{ width: n % 3 === 0 ? '60%' : n % 2 === 0 ? '80%' : '40%' }" />
                </td>
              </tr>
              <tr>
                <td :colspan="COLUMNAS.length + 1" class="py-0">
                  <div class="flex flex-col items-center justify-center py-16 -mt-[calc(6*2.75rem)]">
                    <FileSpreadsheet class="w-12 h-12 text-purple-300 mb-3" />
                    <p class="font-bold text-slate-600 uppercase tracking-widest text-sm">Sin datos</p>
                    <p class="text-slate-500 text-sm mt-2 font-medium">Haz clic aquí y pega tus datos (Ctrl+V)</p>
                  </div>
                </td>
              </tr>
            </template>
            <template v-else>
              <tr
                v-for="(fila, idx) in filas"
                :key="idx"
                :class="['border-t border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60', 'hover:bg-purple-50/40']"
              >
                <td :class="['sticky left-0 px-3 py-2 text-center text-slate-400 font-mono font-semibold text-xs border-r border-slate-100', idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60']">
                  {{ idx + 1 }}
                </td>
                <td
                  v-for="col in COLUMNAS"
                  :key="col.key"
                  class="border-r border-slate-100 last:border-r-0 p-0"
                >
                  <input
                    v-model="fila[col.key]"
                    type="text"
                    class="w-full px-3 py-2 text-xs text-slate-700 bg-transparent outline-none focus:bg-purple-50 focus:ring-1 focus:ring-purple-300 transition-colors"
                  />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
