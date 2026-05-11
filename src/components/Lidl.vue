<script setup>
import { ref, computed, watch, onMounted, onActivated, onBeforeUnmount, nextTick } from 'vue'
import { supabaseOrigen } from '../lib/supabase'
import { ChevronLeft, ChevronRight, MousePointer, X } from 'lucide-vue-next'

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

onActivated(() => scrollToHoy())

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
  return par ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-800'
}

const DIAS  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtFecha = (iso) => {
  const d = new Date(iso + 'T00:00:00')
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
}

const hoveredRow = ref(null)
const hoveredCol = ref(null)
const filaSeleccionada = ref(null)

function toggleFilaSeleccionada(i) {
  filaSeleccionada.value = filaSeleccionada.value === i ? null : i
}

const tableContainer = ref(null)

const scrollToHoy = async () => {
  await nextTick()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const container = tableContainer.value
      if (!container) return
      const el = container.querySelector(`[data-fecha="${hoy}"]`)
      if (!el) return
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const elTopInContainer = container.scrollTop + (elRect.top - containerRect.top)
      const targetScroll = elTopInContainer - (container.clientHeight / 2) + (el.clientHeight / 2)
      container.scrollTop = Math.max(0, targetScroll)
    })
  })
}
</script>

<template>
  <div class="flex flex-col gap-3 overflow-hidden" style="height: calc(100vh - 280px)">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1.5 py-1 shadow-sm">
          <button @click="windowOffset -= 30" class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>
          <span class="text-[11px] font-medium text-slate-500 px-1">
            <span class="text-slate-700 font-semibold">{{ fechaInicio }}</span>
            <span class="text-slate-300 mx-1">→</span>
            <span class="text-slate-700 font-semibold">{{ fechaFin }}</span>
          </span>
          <button @click="windowOffset += 30" class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
          <button v-if="windowOffset !== 0" @click="windowOffset = 0"
            class="text-xs font-semibold text-brand-600 hover:text-brand-700 px-2">Hoy</button>
        </div>
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          Solo lectura
        </span>
        <div class="flex items-center gap-3 text-[11px] font-medium text-slate-500">
          <span class="flex items-center gap-1.5"><span class="w-2 h-3.5 rounded-sm bg-emerald-500 inline-block"></span>Coincide</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-3.5 rounded-sm bg-amber-400 inline-block"></span>Solo uno</span>
          <span class="flex items-center gap-1.5"><span class="w-2 h-3.5 rounded-sm bg-red-500 inline-block"></span>Difiere</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div v-if="sumaSel !== null"
          class="inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs h-7 bg-emerald-50 border border-emerald-200">
          <span class="text-emerald-700 whitespace-nowrap font-medium">{{ celdasSel }} celdas</span>
          <span class="text-emerald-300">·</span>
          <span class="font-bold text-emerald-800 text-sm tabular-nums whitespace-nowrap">Σ {{ sumaSel.toLocaleString('es-ES') }}</span>
          <button @mousedown.stop.prevent="limpiarSeleccion" class="text-emerald-400 hover:text-emerald-700" title="Limpiar">
            <X class="w-3 h-3" />
          </button>
        </div>
        <button
          @mousedown.stop.prevent="toggleModoSeleccion"
          class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap"
          :class="modoSeleccion
            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'"
        >
          <MousePointer class="w-3.5 h-3.5" />
          {{ modoSeleccion ? 'Cancelar' : 'Sumar' }}
        </button>

        <div class="flex items-center gap-1">
          <span v-if="sumaPorColor.yellow > 0" class="h-6 px-2 rounded-md bg-amber-100 text-amber-800 inline-flex items-center" title="Suma celdas amarillas">
            <span class="text-[10px] font-bold tabular-nums leading-none">
              {{ sumaPorColor.yellow.toLocaleString('es-ES') }}
            </span>
          </span>
          <span v-if="sumaPorColor.red > 0" class="h-6 px-2 rounded-md bg-red-100 text-red-800 inline-flex items-center" title="Suma celdas rojas">
            <span class="text-[10px] font-bold tabular-nums leading-none">
              {{ sumaPorColor.red.toLocaleString('es-ES') }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <div v-if="errorMsg" class="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      {{ errorMsg }}
    </div>

    <div v-if="loading" class="text-center py-12 text-sm font-medium text-slate-400">Cargando…</div>

    <div v-else class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex-1 min-h-0">
      <div ref="tableContainer" class="overflow-auto h-full">
        <table class="text-xs border-collapse w-full table-fixed">
          <thead class="sticky top-0 z-20">
            <tr>
              <th class="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-800 border-b-2 border-slate-300 text-left sticky left-0 z-30 w-[110px] min-w-[110px] max-w-[110px] bg-slate-200">
                Fecha
              </th>
              <th
                v-for="(p, pi) in PLATAFORMAS" :key="p.key"
                class="px-1 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b-2 border-slate-300 whitespace-nowrap text-center w-[72px] min-w-[72px] max-w-[72px] transition-colors"
                :class="hoveredCol === pi ? 'bg-slate-300 text-slate-900' : 'bg-slate-200 text-slate-800'"
              >
                {{ p.label }}
              </th>
              <th class="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b-2 border-l border-slate-300 whitespace-nowrap text-center w-[72px] min-w-[72px] max-w-[72px] text-slate-800 bg-slate-200">
                Exp. hoy
              </th>
              <th class="px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider border-b-2 border-l border-slate-300 whitespace-nowrap text-center w-[72px] min-w-[72px] max-w-[72px] text-emerald-800 bg-emerald-100">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(fecha, i) in todasFechas"
              :key="fecha"
              :data-fecha="fecha"
              class="border-b border-slate-200 transition-colors"
              :class="[
                filaSeleccionada === i
                  ? 'bg-slate-300'
                  : (i % 2 === 0 ? 'bg-white' : 'bg-slate-100')
              ]"
              @mouseenter="hoveredRow = i"
              @mouseleave="hoveredRow = null; hoveredCol = null"
            >
              <td
                @click="toggleFilaSeleccionada(i)"
                class="px-3 py-1.5 sticky left-0 z-10 font-semibold text-xs whitespace-nowrap border-r border-slate-200 transition-colors cursor-pointer select-none"
                :class="[
                  fechaBadge(fecha, i % 2 === 0),
                  filaSeleccionada === i
                    ? '!bg-slate-800 !text-white font-bold shadow-md ring-2 ring-slate-900 ring-inset'
                    : (hoveredRow === i ? '!bg-slate-100 text-slate-900' : '')
                ]"
                :title="filaSeleccionada === i ? 'Click para desmarcar la fila' : 'Click para marcar la fila'"
              >
                {{ fmtFecha(fecha) }}
                <span v-if="fecha === hoy" class="ml-1 text-[10px] bg-slate-900 text-white font-bold px-1.5 py-0.5 rounded">HOY</span>
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
                  class="absolute inset-0 pointer-events-none bg-emerald-500/25 ring-2 ring-inset ring-emerald-500"
                />
                <div
                  class="w-full text-center px-0.5 py-0.5 tabular-nums text-[11px] select-none"
                  :class="getVal(fecha, p.key) ? 'text-slate-900 font-semibold' : 'text-slate-400'"
                >
                  {{ getVal(fecha, p.key) || '·' }}
                </div>
              </td>
              <td class="px-2 py-1.5 text-center tabular-nums border-l-2 border-slate-300 text-[11px]"
                :class="[
                  i % 2 === 0 ? 'bg-slate-100' : 'bg-slate-200/60',
                  calcExpediciones(fecha) ? 'font-bold text-slate-900' : 'text-slate-400'
                ]"
              >
                {{ calcExpediciones(fecha) }}
              </td>
              <td
                class="px-2 py-1.5 text-center tabular-nums font-bold border-l-2 border-slate-300 text-emerald-900 text-xs"
                :class="i % 2 === 0 ? 'bg-emerald-100' : 'bg-emerald-200/70'"
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
