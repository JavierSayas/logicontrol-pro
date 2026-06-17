<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { supabase, supabaseOrigen } from '../lib/supabase'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, History, Trash2, Info } from 'lucide-vue-next'
import Card from './ui/Card.vue'

const PRODUCTOS = [
  { key: 'Coco Aldi',          label: 'Coco Aldi',          miranda: false, rowClass: 'bg-cyan-50' },
  { key: 'Piña Cilindro Aldi', label: 'Piña Cilindro Aldi', miranda: true,  rowClass: 'bg-orange-50' },
]

const PLATAFORMAS = [
  { key: 'masquefa', label: 'A. Masquefa', short: 'MAS' },
  { key: 'miranda',  label: 'A. Miranda',  short: 'MIR' },
  { key: 'sagunto',  label: 'A. Sagunto',  short: 'SAG' },
]

const TABLAS = [
  {
    tipo: 'diario',
    titulo: 'ALDI HACER CADA DÍA',
    subtitulo: '(entrega martes-domingo)',
    headerClass: 'bg-sky-50 text-sky-900 border-sky-200',
  },
  {
    tipo: 'lunes',
    titulo: '+ ALDI HACER VIERNES (PEDIDO ENTREGA LUNES)',
    subtitulo: 'Sino dejar en 0 todo',
    headerClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  },
]

const ESTADO_META = {
  real: { label: 'REAL', class: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  prev: { label: 'PREV', class: 'bg-amber-100 text-amber-700 border-amber-200' },
}

function estadosVacios() {
  return {
    diario: { masquefa: 'real', miranda: 'real', sagunto: 'real' },
    lunes:  { masquefa: 'prev', miranda: 'prev', sagunto: 'prev' },
  }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const fecha = ref(new Date().toLocaleDateString('en-CA'))
const loading = ref(false)
const errorMsg = ref('')
const saveStatus = ref('idle')
let debounceTimer = null
let isLoadingData = false

const diaSemana = computed(() => {
  const d = new Date(fecha.value + 'T12:00:00')
  return DIAS[d.getDay()]
})
const fechaFormatada = computed(() => {
  const d = new Date(fecha.value + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
})
const esHoy = computed(() => fecha.value === new Date().toLocaleDateString('en-CA'))

function addDays(fechaStr, n) {
  const d = new Date(fechaStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function diaDe(fechaStr) {
  return DIAS[new Date(fechaStr + 'T12:00:00').getDay()]
}

function formatoCorto(fechaStr) {
  if (!fechaStr) return '—'
  return new Date(fechaStr + 'T12:00:00')
    .toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    .replace('.', '')
}

function fechaEntrega(tipo) {
  if (tipo !== 'lunes') return addDays(fecha.value, 1)
  const dosDias = addDays(fecha.value, 2)
  const dow = new Date(dosDias + 'T12:00:00').getDay()
  return dow === 0 ? addDays(fecha.value, 3) : dosDias
}

function prevDia() {
  fecha.value = addDays(fecha.value, -1)
}
function nextDia() {
  fecha.value = addDays(fecha.value, 1)
}

function filaVacia() {
  return { masquefa: 0, miranda: 0, sagunto: 0 }
}

function valoresVacios() {
  return Object.fromEntries(
    TABLAS.map(t => [t.tipo, Object.fromEntries(PRODUCTOS.map(p => [p.key, filaVacia()]))])
  )
}

const valores = ref(valoresVacios())
const estados = ref(estadosVacios())

function toggleEstado(tipo, platKey) {
  if (!estados.value[tipo]) estados.value[tipo] = {}
  estados.value[tipo][platKey] = estados.value[tipo][platKey] === 'real' ? 'prev' : 'real'
}

function getValor(tipo, prodKey, platKey) {
  return valores.value[tipo]?.[prodKey]?.[platKey] ?? 0
}

function setValor(tipo, prodKey, platKey, raw) {
  const n = raw === '' || raw == null ? 0 : Math.round(Number(raw))
  if (!valores.value[tipo]) valores.value[tipo] = {}
  if (!valores.value[tipo][prodKey]) valores.value[tipo][prodKey] = filaVacia()
  valores.value[tipo][prodKey][platKey] = Number.isNaN(n) ? 0 : n
}

function totalProducto(tipo, prodKey) {
  const f = valores.value[tipo]?.[prodKey] || filaVacia()
  return PLATAFORMAS.reduce((s, p) => s + (Number(f[p.key]) || 0), 0)
}

function totalTabla(tipo) {
  return PRODUCTOS.reduce((s, p) => s + totalProducto(tipo, p.key), 0)
}

const historico = ref(Object.fromEntries(PRODUCTOS.map(p => [p.key, []])))

async function cargarPlantilla() {
  const { data, error } = await supabase
    .from('aldi_pedidos_plantilla')
    .select('producto, tipo, estado_masquefa, estado_miranda, estado_sagunto, masquefa, miranda, sagunto')
    .eq('fecha_produccion', fecha.value)
  if (error) throw error

  const base = valoresVacios()
  const baseEstados = estadosVacios()
  for (const row of (data || [])) {
    if (base[row.tipo] && base[row.tipo][row.producto]) {
      base[row.tipo][row.producto] = {
        masquefa: row.masquefa ?? 0,
        miranda: row.miranda ?? 0,
        sagunto: row.sagunto ?? 0,
      }
      for (const plat of PLATAFORMAS) {
        const est = row['estado_' + plat.key]
        if (est === 'real' || est === 'prev') {
          baseEstados[row.tipo][plat.key] = est
        }
      }
    }
  }
  valores.value = base
  estados.value = baseEstados
}

async function cargarHistorico() {
  const { data, error } = await supabaseOrigen
    .from('aldi_pedidos')
    .select('fecha_produccion, producto, masquefa, miranda, sagunto')
    .eq('tipo', 'diario')
    .lt('fecha_produccion', fecha.value)
    .order('fecha_produccion', { ascending: false })
    .limit(160)
  if (error) throw error

  const rows = data || []
  const mapa = {}
  for (const row of rows) {
    mapa[row.fecha_produccion + '|' + row.producto] = row
  }

  const SEMANAS = [
    { label: 'S-3', dias: 21 },
    { label: 'S-2', dias: 14 },
    { label: 'S-1', dias: 7 },
  ]
  const hist = Object.fromEntries(PRODUCTOS.map(p => [p.key, []]))
  for (const prod of PRODUCTOS) {
    for (const sem of SEMANAS) {
      const prodDate = addDays(fecha.value, -sem.dias)
      const entrega = addDays(prodDate, 1)
      const row = mapa[prodDate + '|' + prod.key]
      hist[prod.key].push({
        sem: sem.label,
        entrega,
        dia: diaDe(entrega),
        tiene: !!row,
        masquefa: row?.masquefa ?? 0,
        miranda: row?.miranda ?? 0,
        sagunto: row?.sagunto ?? 0,
      })
    }
  }
  historico.value = hist
}

async function cargarDatos() {
  isLoadingData = true
  loading.value = true
  errorMsg.value = ''
  try {
    await Promise.all([cargarPlantilla(), cargarHistorico()])
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
    const rows = []
    for (const t of TABLAS) {
      for (const p of PRODUCTOS) {
        rows.push({
          fecha_produccion: fecha.value,
          producto: p.key,
          tipo: t.tipo,
          estado_masquefa: estados.value[t.tipo]?.masquefa ?? 'real',
          estado_miranda: estados.value[t.tipo]?.miranda ?? 'real',
          estado_sagunto: estados.value[t.tipo]?.sagunto ?? 'real',
          masquefa: valores.value[t.tipo]?.[p.key]?.masquefa ?? 0,
          miranda: p.miranda ? (valores.value[t.tipo]?.[p.key]?.miranda ?? 0) : 0,
          sagunto: valores.value[t.tipo]?.[p.key]?.sagunto ?? 0,
        })
      }
    }
    const { error } = await supabase
      .from('aldi_pedidos_plantilla')
      .upsert(rows, { onConflict: 'fecha_produccion,producto,tipo' })
    if (error) throw error
    saveStatus.value = 'saved'
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

function handleCeldaKeydown(event) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  const inputs = Array.from(document.querySelectorAll('input[data-aldi-cell]'))
  const i = inputs.indexOf(event.target)
  const next = event.shiftKey ? i - 1 : i + 1
  const el = inputs[next]
  if (el) {
    el.focus()
    if (typeof el.select === 'function') el.select()
  }
}

watch(fecha, cargarDatos, { immediate: true })
watch(valores, scheduleAutoSave, { deep: true })
watch(estados, scheduleAutoSave, { deep: true })
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-2">Fecha de producción</span>
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
        <span v-if="esHoy" class="ml-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">Hoy</span>
      </div>

      <span class="text-xs font-medium italic">
        <span v-if="saveStatus === 'saving'" class="text-slate-400">Guardando…</span>
        <span v-else-if="saveStatus === 'saved'" class="text-emerald-600 inline-flex items-center gap-1 not-italic">
          <CheckCircle2 class="w-3.5 h-3.5" />
          Guardado
        </span>
        <span v-else-if="saveStatus === 'error'" class="text-red-600 inline-flex items-center gap-1 not-italic">
          <AlertTriangle class="w-3.5 h-3.5" />
          Error
        </span>
      </span>
    </div>

    <div v-if="errorMsg" class="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      {{ errorMsg }}
    </div>

    <div v-if="loading" class="text-center py-12 text-sm font-medium text-slate-400">Cargando…</div>

    <template v-else>
      <div class="flex flex-col xl:flex-row gap-6 items-start">
        <div class="w-full xl:flex-1 space-y-6">
          <Card v-for="tabla in TABLAS" :key="tabla.tipo" flush>
            <div :class="['flex items-center justify-between gap-3 px-5 py-3 border-b rounded-t-2xl', tabla.headerClass]">
              <div>
                <h3 class="text-sm font-bold uppercase tracking-wide">{{ tabla.titulo }}</h3>
                <p class="text-[11px] font-medium opacity-80">{{ tabla.subtitulo }}</p>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="tabla.tipo === 'lunes'" class="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-200 rounded px-2 py-1">
                  Entrega lunes
                </span>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-200">
                    <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap">Fecha entrega</th>
                    <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Día entrega</th>
                    <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                    <th
                      v-for="plat in PLATAFORMAS"
                      :key="plat.key"
                      class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                    >
                      {{ plat.label }}
                    </th>
                    <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 bg-slate-100 whitespace-nowrap">CJ Pedidas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="prod in PRODUCTOS"
                    :key="prod.key"
                    :class="['border-b border-slate-100', prod.rowClass]"
                  >
                    <td class="px-3 py-2 text-sm font-medium text-slate-700 whitespace-nowrap">{{ fechaFormatada && formatoCorto(fechaEntrega(tabla.tipo)) }}</td>
                    <td class="px-3 py-2 text-sm font-medium text-slate-600 capitalize">{{ diaDe(fechaEntrega(tabla.tipo)) }}</td>
                    <td class="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{{ prod.label }}</td>
                    <td
                      v-for="plat in PLATAFORMAS"
                      :key="plat.key"
                      class="p-0.5"
                      :class="(prod.miranda || plat.key !== 'miranda') ? 'bg-amber-50' : 'bg-slate-100'"
                    >
                      <input
                        v-if="prod.miranda || plat.key !== 'miranda'"
                        type="number"
                        step="1"
                        data-aldi-cell
                        :value="getValor(tabla.tipo, prod.key, plat.key)"
                        @change="setValor(tabla.tipo, prod.key, plat.key, $event.target.value)"
                        @keydown="handleCeldaKeydown"
                        @focus="$event.target.select()"
                        class="w-full min-w-[72px] text-center bg-transparent outline-none focus:bg-amber-100 rounded px-1 py-1 text-sm font-semibold text-slate-900"
                        placeholder="0"
                      />
                      <div v-else class="flex items-center justify-center min-w-[72px] py-1 text-slate-300" title="Coco no se entrega en Miranda">
                        <span class="text-base leading-none">✕</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-center text-sm font-bold text-slate-700 bg-slate-50/60">
                      {{ totalProducto(tabla.tipo, prod.key) }}
                    </td>
                  </tr>

                  <tr class="border-t border-slate-200 bg-slate-50">
                    <td colspan="3" class="px-3 py-2"></td>
                    <td v-for="plat in PLATAFORMAS" :key="plat.key" class="px-3 py-2 text-center">
                      <button
                        type="button"
                        @click="toggleEstado(tabla.tipo, plat.key)"
                        :class="['text-[10px] font-bold uppercase tracking-wider border rounded px-2 py-0.5 transition-colors hover:brightness-95', ESTADO_META[estados[tabla.tipo][plat.key]].class]"
                        title="Clic para alternar REAL / PREV"
                      >
                        {{ ESTADO_META[estados[tabla.tipo][plat.key]].label }}
                      </button>
                    </td>
                    <td class="px-3 py-2 text-center text-sm font-bold text-slate-800 bg-slate-100">
                      {{ totalTabla(tabla.tipo) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <div class="grid sm:grid-cols-2 gap-3">
            <div class="flex items-start gap-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <Trash2 class="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>Borrar pedidos de entrega lunes al acabar.</span>
            </div>
            <div class="flex items-start gap-2 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Info class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>Dejar PIÑA SAGUNTO entrega lunes a medias.</span>
            </div>
          </div>
        </div>

        <div class="w-full xl:w-96 space-y-4">
          <div class="flex items-center gap-2 px-1">
            <History class="w-4 h-4 text-indigo-500" />
            <h3 class="text-[11px] font-bold uppercase tracking-wider text-slate-600">Resumen histórico pedidos</h3>
          </div>

          <Card v-for="prod in PRODUCTOS" :key="prod.key" flush>
            <div :class="['px-4 py-2 border-b border-slate-100 rounded-t-2xl', prod.rowClass]">
              <h4 class="text-xs font-bold text-slate-700">{{ prod.label }}</h4>
              <p class="text-[10px] font-medium uppercase tracking-wider text-slate-500">Entregas {{ diaDe(fechaEntrega('diario')) }}</p>
            </div>
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sem</th>
                  <th class="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Fecha</th>
                  <th class="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">MAS</th>
                  <th class="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">MIR</th>
                  <th class="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">SAG</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="h in historico[prod.key]"
                  :key="h.sem"
                  class="border-b border-slate-100 last:border-b-0"
                  :class="h.tiene ? '' : 'opacity-60'"
                >
                  <td class="px-2 py-1.5">
                    <span class="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded px-1.5 py-0.5">{{ h.sem }}</span>
                  </td>
                  <td class="px-2 py-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">{{ formatoCorto(h.entrega) }}</td>
                  <template v-if="h.tiene">
                    <td class="px-2 py-1.5 text-center text-sm font-semibold text-slate-800">{{ h.masquefa }}</td>
                    <td class="px-2 py-1.5 text-center text-sm font-semibold" :class="prod.miranda ? 'text-slate-800' : 'text-slate-300'">
                      <template v-if="prod.miranda">{{ h.miranda }}</template>
                      <span v-else>✕</span>
                    </td>
                    <td class="px-2 py-1.5 text-center text-sm font-semibold text-slate-800">{{ h.sagunto }}</td>
                  </template>
                  <template v-else>
                    <td class="px-2 py-1.5 text-center text-sm font-medium text-slate-300">—</td>
                    <td class="px-2 py-1.5 text-center text-sm font-medium text-slate-300">—</td>
                    <td class="px-2 py-1.5 text-center text-sm font-medium text-slate-300">—</td>
                  </template>
                </tr>
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>
