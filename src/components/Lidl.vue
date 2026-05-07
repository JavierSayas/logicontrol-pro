<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { supabaseOrigen } from '../lib/supabase'
import { Building2 } from 'lucide-vue-next'

const TIPO = 'operaciones'
const tipoOtro = 'comercial'

const PLATAFORMAS = [
  { key: 'madrid',    label: 'Madrid'    },
  { key: 'barcelona', label: 'Barcelona' },
  { key: 'tarragona', label: 'Tarragona' },
  { key: 'valencia',  label: 'Valencia'  },
  { key: 'murcia',    label: 'Murcia'    },
  { key: 'malaga',    label: 'Málaga'    },
  { key: 'naron',     label: 'Narón'     },
  { key: 'vitoria',   label: 'Vitoria'   },
  { key: 'sevilla',   label: 'Sevilla'   },
  { key: 'granada',   label: 'Granada'   },
  { key: 'martorell', label: 'Martorell' },
]

const hoy = new Date().toISOString().slice(0, 10)
const windowOffset = ref(0)

const todasFechas = computed(() => {
  const base = new Date(hoy + 'T12:00:00')
  const fechas = []
  for (let i = -15; i <= 15; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i + windowOffset.value)
    fechas.push(d.toISOString().slice(0, 10))
  }
  return fechas
})

const fechaInicio = computed(() => todasFechas.value[0])
const fechaFin    = computed(() => todasFechas.value[todasFechas.value.length - 1])

const dbPropio = ref({})
const dbOtro   = ref({})
const loading  = ref(true)
const errorMsg = ref('')

const EXP_G1 = ['madrid', 'barcelona', 'tarragona', 'valencia', 'murcia', 'martorell']
const EXP_G2 = ['malaga', 'naron', 'vitoria', 'sevilla', 'granada']

const isExpContributor = (rowFecha, pkey) => {
  const dowHoy = new Date(hoy + 'T12:00:00').getDay()
  if (dowHoy === 0 || dowHoy === 6) return false
  const addHoy = (n) => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  if (dowHoy === 1) {
    if (rowFecha === addHoy(1)) return true
    if (rowFecha === addHoy(2) && EXP_G2.includes(pkey)) return true
  } else if (dowHoy >= 2 && dowHoy <= 4) {
    if (rowFecha === addHoy(1) && EXP_G1.includes(pkey)) return true
    if (rowFecha === addHoy(2) && EXP_G2.includes(pkey)) return true
  } else if (dowHoy === 5) {
    if (rowFecha === addHoy(1) && EXP_G1.includes(pkey)) return true
    if (rowFecha === addHoy(3)) return true
  }
  return false
}

const calcExpediciones = (fecha) => {
  const d   = new Date(fecha + 'T12:00:00')
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return ''

  const addDays = (n) => {
    const nd = new Date(fecha + 'T12:00:00')
    nd.setDate(nd.getDate() + n)
    return nd.toISOString().slice(0, 10)
  }

  const sumKeys = (f, keys) => keys.reduce((s, k) => {
    const raw = getVal(f, k)
    const v = parseFloat(String(raw).replace(',', '.'))
    return s + (isNaN(v) ? 0 : v)
  }, 0)

  const ALL_KEYS = PLATAFORMAS.map(p => p.key)

  let total = 0
  if (dow === 1) {
    total = sumKeys(addDays(1), ALL_KEYS) + sumKeys(addDays(2), EXP_G2)
  } else if (dow >= 2 && dow <= 4) {
    total = sumKeys(addDays(1), EXP_G1) + sumKeys(addDays(2), EXP_G2)
  } else if (dow === 5) {
    total = sumKeys(addDays(1), EXP_G1) + sumKeys(addDays(3), ALL_KEYS)
  }

  return total > 0 ? total : ''
}

const sumaPorColor = computed(() => {
  const result = { yellow: 0, red: 0 }
  for (const fecha of todasFechas.value) {
    for (const p of PLATAFORMAS) {
      const color = getColor(fecha, p.key)
      if (color === 'yellow' || color === 'red') {
        const v = parseFloat(String(getVal(fecha, p.key)).replace(',', '.'))
        if (!isNaN(v)) result[color] += v
      }
    }
  }
  return result
})

const CELL_BG = {
  green:  'rgba(134,239,172,0.35)',
  yellow: 'rgba(253,224,71,0.35)',
  red:    'rgba(252,165,165,0.35)',
}

const getColor = (fecha, pkey) => {
  return dbPropio.value[fecha]?.colores?.[pkey] ?? null
}

const cellBgStyle = (fecha, pkey) => {
  const c = getColor(fecha, pkey)
  return c ? { backgroundColor: CELL_BG[c] } : {}
}

const editKey = (fecha, pkey) => `${fecha}|${pkey}`

const getVal = (fecha, pkey) => {
  const v = dbPropio.value[fecha]?.[pkey]
  if (v === null || v === undefined) return ''
  return String(v)
}

const totalFila = (fecha) =>
  PLATAFORMAS.reduce((sum, p) => {
    const n = parseFloat(String(getVal(fecha, p.key)).replace(',', '.'))
    return sum + (isNaN(n) ? 0 : n)
  }, 0)

const modoSeleccion = ref(false)
const rangos        = ref([])
const selStart      = ref(null)
const selEnd        = ref(null)
const seleccionando = ref(false)

const toRango = (s, e) => ({
  r0: Math.min(s.i, e.i),   r1: Math.max(s.i, e.i),
  c0: Math.min(s.pi, e.pi), c1: Math.max(s.pi, e.pi),
})

const enRangoSel = (i, pi) => {
  const enRango = ({ r0, r1, c0, c1 }) => i >= r0 && i <= r1 && pi >= c0 && pi <= c1
  if (selStart.value && selEnd.value && enRango(toRango(selStart.value, selEnd.value))) return true
  return rangos.value.some(enRango)
}

const sumaRango = ({ r0, r1, c0, c1 }) => {
  let total = 0
  for (let i = r0; i <= r1; i++)
    for (let pi = c0; pi <= c1; pi++) {
      const n = parseFloat(String(getVal(todasFechas.value[i], PLATAFORMAS[pi].key)).replace(',', '.'))
      if (!isNaN(n)) total += n
    }
  return total
}

const sumaSel = computed(() => {
  if (!rangos.value.length && (!selStart.value || !selEnd.value)) return null
  let total = rangos.value.reduce((s, r) => s + sumaRango(r), 0)
  if (selStart.value && selEnd.value) total += sumaRango(toRango(selStart.value, selEnd.value))
  return total
})

const celdasSel = computed(() => {
  let total = rangos.value.reduce((s, { r0, r1, c0, c1 }) => s + (r1-r0+1)*(c1-c0+1), 0)
  if (selStart.value && selEnd.value) {
    const { r0, r1, c0, c1 } = toRango(selStart.value, selEnd.value)
    total += (r1-r0+1)*(c1-c0+1)
  }
  return total
})

const onSelMousedown = (i, pi) => {
  if (!modoSeleccion.value) return
  const idx = rangos.value.findIndex(({ r0, r1, c0, c1 }) => i >= r0 && i <= r1 && pi >= c0 && pi <= c1)
  if (idx !== -1) {
    rangos.value.splice(idx, 1)
    return
  }
  seleccionando.value = true
  selStart.value = { i, pi }
  selEnd.value   = { i, pi }
}
const onSelMouseenter = (i, pi) => {
  if (!modoSeleccion.value || !seleccionando.value) return
  selEnd.value = { i, pi }
}
const onSelMouseup = () => {
  if (seleccionando.value && selStart.value && selEnd.value) {
    rangos.value.push(toRango(selStart.value, selEnd.value))
    selStart.value = null
    selEnd.value   = null
  }
  seleccionando.value = false
}

const limpiarSeleccion = () => { rangos.value = []; selStart.value = null; selEnd.value = null }

const toggleModoSeleccion = () => {
  modoSeleccion.value = !modoSeleccion.value
  if (!modoSeleccion.value) limpiarSeleccion()
}

const indicador = (fecha, pkey) => {
  const propioRaw = getVal(fecha, pkey)
  const otroRaw   = dbOtro.value[fecha]?.[pkey]

  const propio = propioRaw === '' ? null : Number(String(propioRaw).replace(',', '.'))
  const otro   = (otroRaw === null || otroRaw === undefined) ? null : Number(otroRaw)

  const tienePropio = propio !== null && !isNaN(propio) && propio !== 0
  const tieneOtro   = otro   !== null && !isNaN(otro)   && otro   !== 0

  if (!tienePropio && !tieneOtro) return null
  if (tienePropio && tieneOtro)   return propio === otro ? 'green' : 'red'
  return 'yellow'
}

const indicadorClass = (fecha, pkey) => {
  const ind = indicador(fecha, pkey)
  if (ind === 'green')  return 'bg-green-500'
  if (ind === 'yellow') return 'bg-yellow-400'
  if (ind === 'red')    return 'bg-red-500'
  return 'bg-transparent'
}

const cargar = async () => {
  loading.value = true
  errorMsg.value = ''

  try {
    const [resPropio, resOtro] = await Promise.all([
      supabaseOrigen.from('comercial_plataformas').select('*')
        .eq('tipo', TIPO)
        .gte('fecha', fechaInicio.value)
        .lte('fecha', fechaFin.value),
      supabaseOrigen.from('comercial_plataformas').select('*')
        .eq('tipo', tipoOtro)
        .gte('fecha', fechaInicio.value)
        .lte('fecha', fechaFin.value),
    ])

    if (resPropio.error) throw resPropio.error
    const mapaPropio = {}
    ;(resPropio.data || []).forEach(r => { mapaPropio[r.fecha] = r })
    dbPropio.value = mapaPropio

    if (!resOtro.error) {
      const mapaOtro = {}
      ;(resOtro.data || []).forEach(r => { mapaOtro[r.fecha] = r })
      dbOtro.value = mapaOtro
    }
  } catch (err) {
    errorMsg.value = 'Error al cargar: ' + err.message
  } finally {
    loading.value = false
    scrollToHoy()
  }
}

let realtimeChannel = null

const setupRealtime = () => {
  realtimeChannel = supabaseOrigen
    .channel(`lidl_cp_rt`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'comercial_plataformas', filter: `tipo=eq.${TIPO}` },
      (payload) => {
        const row = payload.new ?? payload.old
        if (!row?.fecha) return
        if (payload.eventType === 'DELETE') {
          const m = { ...dbPropio.value }; delete m[row.fecha]; dbPropio.value = m
        } else {
          dbPropio.value = { ...dbPropio.value, [row.fecha]: row }
        }
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'comercial_plataformas', filter: `tipo=eq.${tipoOtro}` },
      (payload) => {
        const row = payload.new ?? payload.old
        if (!row?.fecha) return
        if (payload.eventType === 'DELETE') {
          const m = { ...dbOtro.value }; delete m[row.fecha]; dbOtro.value = m
        } else {
          dbOtro.value = { ...dbOtro.value, [row.fecha]: row }
        }
      }
    )
    .subscribe()
}

onMounted(async () => {
  await cargar()
  setupRealtime()
  window.addEventListener('mouseup', onSelMouseup)
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', onSelMouseup)
  if (realtimeChannel) supabaseOrigen.removeChannel(realtimeChannel)
})

watch(windowOffset, () => cargar())

const manana   = new Date(hoy); manana.setDate(manana.getDate() + 1)
const pasado   = new Date(hoy); pasado.setDate(pasado.getDate() + 2)
const siguiente = new Date(hoy); siguiente.setDate(siguiente.getDate() + 3)
const mananaStr    = manana.toISOString().slice(0, 10)
const pasadoStr    = pasado.toISOString().slice(0, 10)
const siguienteStr = siguiente.toISOString().slice(0, 10)

const fechaBadge = (fecha, par) => {
  if (fecha === mananaStr || fecha === pasadoStr) return 'bg-orange-500 text-white font-semibold'
  if (fecha === siguienteStr) return 'bg-amber-400 text-amber-950 font-semibold'
  return par ? 'bg-white text-slate-600' : 'bg-slate-50 text-slate-600'
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtFecha = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
}

const hoveredRow = ref(null)
const hoveredCol = ref(null)

const tableContainer = ref(null)

const scrollToHoy = async () => {
  await nextTick()
  const el = tableContainer.value?.querySelector(`[data-fecha="${hoy}"]`)
  if (el) el.scrollIntoView({ block: 'center' })
}
</script>

<template>
  <div class="space-y-4">
    <!-- HEADER PRINCIPAL -->
    <div class="flex items-center gap-4">
      <div class="bg-gradient-to-br from-blue-600 to-cyan-700 p-3 rounded-xl">
        <Building2 class="w-6 h-6 text-white" />
      </div>
      <div>
        <h2 class="font-900 text-slate-900 text-lg">Lidl</h2>
        <p class="text-sm text-slate-500 font-medium">Operaciones — vista en tiempo real (solo lectura)</p>
      </div>
    </div>

    <!-- Cabecera secundaria -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1">
          <button @click="windowOffset -= 30"
            class="px-2 py-0.5 rounded text-xs text-slate-500 hover:bg-slate-100 border border-slate-200 leading-none">←</button>
          <span class="text-xs text-slate-400"><span class="font-medium text-slate-600">{{ fechaInicio }}</span> → <span class="font-medium text-slate-600">{{ fechaFin }}</span></span>
          <button @click="windowOffset += 30"
            class="px-2 py-0.5 rounded text-xs text-slate-500 hover:bg-slate-100 border border-slate-200 leading-none">→</button>
          <button v-if="windowOffset !== 0" @click="windowOffset = 0"
            class="px-2 py-0.5 rounded text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 leading-none">Hoy</button>
        </div>
        <span class="text-xs font-medium ml-1 text-blue-600">· Vista Operaciones</span>
        <span class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          Solo lectura
        </span>
        <div class="flex items-center gap-2 ml-4 text-[10px] text-slate-500">
          <span class="flex items-center gap-1"><span class="w-2 h-4 rounded-sm bg-green-500 inline-block"></span>Coincide</span>
          <span class="flex items-center gap-1"><span class="w-2 h-4 rounded-sm bg-yellow-400 inline-block"></span>Solo uno</span>
          <span class="flex items-center gap-1"><span class="w-2 h-4 rounded-sm bg-red-500 inline-block"></span>Difiere</span>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Botón selección suma + indicador -->
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-2 px-3 py-1 rounded-lg text-xs min-w-[180px] h-7"
            :class="sumaSel !== null ? 'bg-emerald-50 border border-emerald-200' : ''">
            <template v-if="sumaSel !== null">
              <span class="text-emerald-600 whitespace-nowrap">{{ celdasSel }} celdas</span>
              <span class="text-emerald-400">·</span>
              <span class="font-bold text-emerald-800 text-sm tabular-nums whitespace-nowrap">Σ {{ sumaSel.toLocaleString('es-ES') }}</span>
              <button @mousedown.stop.prevent="limpiarSeleccion" class="ml-auto text-emerald-400 hover:text-emerald-700" title="Limpiar">✕</button>
            </template>
          </div>
          <button
            @mousedown.stop.prevent="toggleModoSeleccion"
            class="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap"
            :class="modoSeleccion
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400 hover:text-emerald-700'"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7H7a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6"/>
            </svg>
            {{ modoSeleccion ? 'Cancelar' : 'Sumar' }}
          </button>
        </div>

        <!-- Sumas por color (informativas) -->
        <div class="flex items-center gap-1.5">
          <span v-if="sumaPorColor.yellow > 0" class="h-6 w-14 rounded-md bg-yellow-300 flex items-center justify-center" title="Suma celdas amarillas">
            <span class="text-[10px] font-bold text-yellow-900 tabular-nums leading-none">
              {{ sumaPorColor.yellow.toLocaleString('es-ES') }}
            </span>
          </span>
          <span v-if="sumaPorColor.red > 0" class="h-6 w-14 rounded-md bg-red-300 flex items-center justify-center" title="Suma celdas rojas">
            <span class="text-[10px] font-bold text-red-900 tabular-nums leading-none">
              {{ sumaPorColor.red.toLocaleString('es-ES') }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- ERROR -->
    <div v-if="errorMsg" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 font-medium">
      {{ errorMsg }}
    </div>

    <!-- Cargando -->
    <div v-if="loading" class="text-center py-12 text-slate-400 text-sm">Cargando…</div>

    <!-- Tabla -->
    <div v-else class="rounded-lg border border-slate-200 overflow-hidden">
      <div ref="tableContainer" class="overflow-auto max-h-[68vh]">
        <table class="text-xs border-collapse w-full">
          <thead class="sticky top-0 z-20">
            <tr class="bg-blue-50">
              <th class="px-3 py-2.5 font-semibold border-b border-slate-200 text-left sticky left-0 z-30 min-w-[110px] bg-blue-50 text-blue-800">
                Fecha
              </th>
              <th
                v-for="(p, pi) in PLATAFORMAS" :key="p.key"
                class="px-1 py-2.5 font-semibold border-b border-slate-200 whitespace-nowrap text-center min-w-[44px] transition-colors"
                :class="hoveredCol === pi ? 'bg-blue-100 text-blue-900' : 'bg-blue-50 text-blue-700'"
              >
                {{ p.label }}
              </th>
              <th class="px-2 py-2.5 font-bold border-b border-l-2 border-slate-300 whitespace-nowrap text-center min-w-[80px] text-blue-800 bg-blue-50">
                Exp. hoy
              </th>
              <th class="px-2 py-2.5 font-bold border-b border-l-2 border-slate-300 whitespace-nowrap text-center min-w-[52px] text-emerald-800 bg-emerald-50">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(fecha, i) in todasFechas"
              :key="fecha"
              :data-fecha="fecha"
              class="border-b border-slate-100"
              :class="i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'"
              @mouseenter="hoveredRow = i"
              @mouseleave="hoveredRow = null; hoveredCol = null"
            >
              <td class="px-3 py-1.5 sticky left-0 z-10 font-medium whitespace-nowrap border-r border-slate-100 transition-colors"
                :class="[
                  fechaBadge(fecha, i % 2 === 0),
                  hoveredRow === i ? '!bg-blue-100 text-blue-900' : ''
                ]">
                {{ fmtFecha(fecha) }}
                <span v-if="fecha === hoy" class="ml-1 text-[10px] bg-slate-800 text-white font-bold px-1.5 py-0.5 rounded">HOY</span>
              </td>

              <td
                v-for="(p, pi) in PLATAFORMAS" :key="p.key"
                class="py-1 px-1 border-r-[7px] relative"
                :class="[
                  indicadorClass(fecha, p.key) === 'bg-green-500'  ? 'border-r-green-500'
                : indicadorClass(fecha, p.key) === 'bg-yellow-400' ? 'border-r-yellow-400'
                : indicadorClass(fecha, p.key) === 'bg-red-500'    ? 'border-r-red-500'
                : 'border-r-transparent',
                  modoSeleccion ? 'cursor-cell select-none' : '',
                ]"
                :style="[cellBgStyle(fecha, p.key), isExpContributor(fecha, p.key) ? 'outline: 2px dashed #ef4444; outline-offset: -2px;' : '']"
                @mousedown="onSelMousedown(i, pi)"
                @mouseenter="hoveredCol = pi; onSelMouseenter(i, pi)"
              >
                <div
                  v-if="enRangoSel(i, pi)"
                  class="absolute inset-0 pointer-events-none bg-blue-500/30 ring-2 ring-inset ring-blue-600"
                />
                <div
                  class="w-full text-center px-0.5 py-0.5 tabular-nums text-[11px] select-none"
                  :class="getVal(fecha, p.key) ? 'text-slate-800 font-medium' : 'text-slate-300'"
                >
                  {{ getVal(fecha, p.key) || '·' }}
                </div>
              </td>
              <td class="px-2 py-1.5 text-center tabular-nums border-l-2 border-slate-300 text-[11px]"
                :class="[
                  i % 2 === 0 ? 'bg-blue-50/40' : 'bg-blue-50/20',
                  calcExpediciones(fecha) ? 'font-bold text-blue-900' : 'text-slate-300'
                ]"
              >
                {{ calcExpediciones(fecha) }}
              </td>
              <td
                class="px-2 py-1.5 text-center tabular-nums font-bold border-l-2 border-slate-300 text-emerald-800 text-xs"
                :class="i % 2 === 0 ? 'bg-emerald-50/60' : 'bg-emerald-50/40'"
              >
                {{ totalFila(fecha) > 0 ? totalFila(fecha) : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
