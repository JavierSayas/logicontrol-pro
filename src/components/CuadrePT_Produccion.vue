<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { supabaseOrigen } from '../lib/supabase'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Badge from './ui/Badge.vue'

const FILAS = [
  { cliente: 'Aldi',                  producto: 'Coco 150g',  rowClass: 'bg-white' },
  { cliente: 'Aldi',                  producto: 'Cilindro',   rowClass: 'bg-white' },
  { cliente: 'Lidl',                  producto: 'Cilindro',   rowClass: 'bg-orange-50' },
  { cliente: 'El corte inglés',       producto: 'Cilindro',   rowClass: 'bg-emerald-50' },
  { cliente: 'El corte inglés',       producto: 'Tacos Piña', rowClass: 'bg-emerald-50' },
  { cliente: 'Supermercados Consum',  producto: 'Coco 125g',  rowClass: 'bg-violet-50' },
  { cliente: 'Supermercados Consum',  producto: 'Cilindro',   rowClass: 'bg-violet-50' },
]

const LINEAS = [
  { linea: 'Cilindro Aldi', labelClass: 'bg-orange-200 text-orange-900' },
  { linea: 'Coco Aldi',     labelClass: 'bg-cyan-200 text-cyan-900' },
  { linea: 'Cilindro Lidl', labelClass: 'bg-amber-200 text-amber-900' },
  { linea: 'MASKOM',        labelClass: 'bg-white text-slate-800 border border-slate-200' },
  { linea: 'MERCADONA',     labelClass: 'bg-emerald-200 text-emerald-900' },
  { linea: 'Consum',        labelClass: 'bg-amber-200 text-amber-900' },
]

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const fecha = ref(new Date().toLocaleDateString('en-CA'))
const diaSemana = computed(() => {
  const d = new Date(fecha.value + 'T12:00:00')
  return DIAS[d.getDay()]
})

const prevDia = () => {
  const d = new Date(fecha.value + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  fecha.value = d.toISOString().split('T')[0]
}
const nextDia = () => {
  const d = new Date(fecha.value + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  fecha.value = d.toISOString().split('T')[0]
}

const rowKey = f => `${f.cliente}|${f.producto}`

const stockData = ref({})
const notasData = ref({})
const planFabricacion = ref({ cilindro: {}, coco: {} })
const planStockFinal  = ref({ cilindro: {}, coco: {} })
const udsCajaAldiCilindro = ref(null)
const udsCajaAldiCoco     = ref(null)
const gramosAldiCoco      = ref(null)
const loading = ref(false)
const errorMsg = ref('')

function getNum(fila, field) {
  const v = stockData.value[rowKey(fila)]?.[field]
  return v == null ? '' : v
}

function carrosKgOf(fila) {
  const ofReal = stockData.value[rowKey(fila)]?.of_real
  if (ofReal == null) return null

  if (fila.cliente === 'Aldi' && fila.producto === 'Cilindro') {
    if (udsCajaAldiCilindro.value == null) return null
    return Math.round((ofReal * udsCajaAldiCilindro.value / 240) * 100) / 100
  }

  if (fila.cliente === 'Aldi' && fila.producto === 'Coco 150g') {
    if (udsCajaAldiCoco.value == null || gramosAldiCoco.value == null) return null
    return Math.round((ofReal * udsCajaAldiCoco.value * gramosAldiCoco.value / 1000) * 100) / 100
  }

  return null
}

function stockFinalPrev(fila) {
  const d = stockData.value[rowKey(fila)]
  if (!d) return null
  const { stock_inicial: s, expediciones: e, of_real: o } = d
  if (s == null && e == null && o == null) return null
  return (s ?? 0) - (e ?? 0) + (o ?? 0)
}

function isActualizado(fila) {
  return stockData.value[rowKey(fila)]?.actualizado ?? false
}

const isAldiRow = fila => fila.cliente === 'Aldi'

function weekStart(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function aldiProd(fila) {
  return fila.producto === 'Cilindro' ? 'cilindro'
       : fila.producto === 'Coco 150g' ? 'coco'
       : null
}

function ofCalculadaPlan(fila) {
  const prod = aldiProd(fila)
  if (!prod) return null
  return planFabricacion.value[prod]?.[diaSemana.value] ?? null
}

function sfIdealPlan(fila) {
  const prod = aldiProd(fila)
  if (!prod) return null
  return planStockFinal.value[prod]?.[diaSemana.value] ?? null
}

async function cargarPlanOf() {
  const { data } = await supabaseOrigen
    .from('aldi_of_calculada_plan')
    .select('producto, fabricacion, stock_final')
    .eq('fecha', weekStart(fecha.value))
  const fab = { cilindro: {}, coco: {} }
  const sf  = { cilindro: {}, coco: {} }
  for (const row of (data || [])) {
    if (fab[row.producto]) {
      fab[row.producto] = row.fabricacion || {}
      sf[row.producto]  = row.stock_final || {}
    }
  }
  planFabricacion.value = fab
  planStockFinal.value  = sf
}

const EXP_G1 = ['madrid', 'barcelona', 'tarragona', 'valencia', 'murcia', 'martorell']
const EXP_G2 = ['malaga', 'naron', 'vitoria', 'sevilla', 'granada']

async function calcExpedicionesLidl(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return 0

  const addDays = (n) => {
    const nd = new Date(fechaStr + 'T12:00:00')
    nd.setDate(nd.getDate() + n)
    return nd.toISOString().slice(0, 10)
  }

  const fechas = dow === 5
    ? [addDays(1), addDays(3)]
    : [addDays(1), addDays(2)]

  const { data } = await supabaseOrigen
    .from('comercial_plataformas')
    .select('fecha,madrid,barcelona,tarragona,valencia,murcia,martorell,malaga,naron,vitoria,sevilla,granada')
    .eq('tipo', 'operaciones')
    .in('fecha', fechas)

  const byFecha = Object.fromEntries((data || []).map(r => [r.fecha, r]))
  const sum = (row, keys) => keys.reduce((s, k) => s + (parseFloat(row?.[k]) || 0), 0)

  if (dow === 1) {
    return sum(byFecha[fechas[0]], [...EXP_G1, ...EXP_G2]) + sum(byFecha[fechas[1]], EXP_G2)
  } else if (dow >= 2 && dow <= 4) {
    return sum(byFecha[fechas[0]], EXP_G1) + sum(byFecha[fechas[1]], EXP_G2)
  } else {
    return sum(byFecha[fechas[0]], EXP_G1) + sum(byFecha[fechas[1]], [...EXP_G1, ...EXP_G2])
  }
}

async function cargarDatos() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [
      { data: stockRows,    error: e1 },
      { data: notasRows,    error: e2 },
      { data: mensajesRows, error: e3 },
      { data: aldiPedidosRows },
      { data: productoRows },
      { data: cocoRows },
    ] = await Promise.all([
      supabaseOrigen.from('planificacion_aldi_stock').select('*').eq('fecha', fecha.value),
      supabaseOrigen.from('planificacion_aldi_notas').select('*').eq('fecha', fecha.value),
      supabaseOrigen.from('aldi_mensajes_semana').select('linea,mensaje').eq('dia_semana', diaSemana.value),
      supabaseOrigen.from('aldi_pedidos').select('producto,masquefa,miranda,sagunto')
        .eq('fecha_produccion', fecha.value),
      supabaseOrigen.from('productos').select('unidades_por_caja').eq('ref', 'Aldi Cilindro TRUE').eq('en_activo', true).eq('pendiente_lanzar', false).limit(1),
      supabaseOrigen.from('productos').select('unidades_por_caja,gramaje_peso_fijo').eq('ref', 'Aldi Coco 150g TRUE').eq('en_activo', true).eq('pendiente_lanzar', false).limit(1),
    ])
    await cargarPlanOf()
    if (udsCajaAldiCilindro.value == null && productoRows?.length) {
      udsCajaAldiCilindro.value = productoRows[0].unidades_por_caja
    }
    if (udsCajaAldiCoco.value == null && cocoRows?.length) {
      udsCajaAldiCoco.value = cocoRows[0].unidades_por_caja
      gramosAldiCoco.value  = cocoRows[0].gramaje_peso_fijo
    }
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3

    stockData.value = Object.fromEntries(
      (stockRows || []).map(r => [rowKey(r), r])
    )

    const aldiTotales = {}
    for (const r of (aldiPedidosRows || [])) {
      aldiTotales[r.producto] = (aldiTotales[r.producto] || 0)
        + (r.masquefa || 0) + (r.miranda || 0) + (r.sagunto || 0)
    }
    const ALDI_EXP_MAP = { 'Aldi|Coco 150g': 'Coco Aldi', 'Aldi|Cilindro': 'Piña Cilindro Aldi' }
    for (const [key, prod] of Object.entries(ALDI_EXP_MAP)) {
      if (stockData.value[key]?.expediciones == null) {
        const total = aldiTotales[prod] || 0
        if (total > 0) {
          if (!stockData.value[key]) stockData.value[key] = {}
          stockData.value[key].expediciones = total
        }
      }
    }

    const keyLidl = 'Lidl|Cilindro'
    if (stockData.value[keyLidl]?.expediciones == null) {
      const expLidl = await calcExpedicionesLidl(fecha.value)
      if (expLidl > 0) {
        if (!stockData.value[keyLidl]) stockData.value[keyLidl] = {}
        stockData.value[keyLidl].expediciones = expLidl
      }
    }

    const defaults  = Object.fromEntries((mensajesRows || []).map(r => [r.linea, r.mensaje ?? '']))
    const overrides = Object.fromEntries((notasRows    || []).map(r => [r.linea, r.descripcion ?? '']))
    notasData.value = { ...defaults, ...overrides }
  } catch (err) {
    console.error('[CuadrePT] Error cargando datos:', err)
    errorMsg.value = 'Error cargando datos: ' + err.message
  } finally {
    loading.value = false
    await nextTick()
  }
}

watch(fecha, cargarDatos, { immediate: true })
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-2">Día de producción</span>
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
      </div>
      <span class="ml-auto text-[11px] font-medium text-slate-400 italic">Solo lectura</span>
    </div>

    <div v-if="errorMsg" class="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      {{ errorMsg }}
    </div>

    <div v-if="loading" class="text-center py-12 text-sm font-medium text-slate-400">Cargando…</div>

    <template v-else>
      <p class="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Plantilla producción</p>

      <Card flush>
        <div class="overflow-x-auto">
          <table class="planificacion-table w-full border-collapse text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-xs">
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cliente</th>
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Stock Inicial</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">¿Actualizado?</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Expediciones</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">OF Real</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Carros/kg OF</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">OF Calculada</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Stock Final Prev</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">SF Ideal</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fila in FILAS" :key="rowKey(fila)" :class="['border-b border-slate-100', fila.rowClass]">
                <td class="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{{ fila.cliente }}</td>
                <td class="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{{ fila.producto }}</td>
                <td class="px-3 py-2 text-center text-sm font-medium text-slate-700">{{ getNum(fila, 'stock_inicial') || '—' }}</td>
                <td class="px-3 py-2 text-center">
                  <Badge :variant="isActualizado(fila) ? 'success' : 'neutral'">
                    {{ isActualizado(fila) ? 'Sí' : 'No' }}
                  </Badge>
                </td>
                <td class="px-3 py-2 text-center text-sm font-medium text-slate-700">{{ getNum(fila, 'expediciones') || '—' }}</td>
                <td class="px-3 py-2 text-center text-sm font-medium text-slate-700"
                  :class="!isAldiRow(fila) ? 'bg-slate-50/60' : ''">
                  <template v-if="isAldiRow(fila)">{{ getNum(fila, 'of_real') || '—' }}</template>
                </td>
                <td class="px-3 py-2 text-center text-sm font-semibold text-slate-700"
                  :class="!isAldiRow(fila) ? 'bg-slate-50/60' : 'bg-slate-50/40'">
                  <template v-if="isAldiRow(fila)">
                    {{ carrosKgOf(fila) ?? (getNum(fila, 'carros_kg_of') || '—') }}
                  </template>
                </td>
                <td class="px-3 py-2 text-center text-sm font-semibold text-slate-700"
                  :class="!isAldiRow(fila) ? 'bg-slate-50/60' : ''">
                  <template v-if="isAldiRow(fila)">{{ ofCalculadaPlan(fila) ?? '—' }}</template>
                </td>
                <td class="px-3 py-2 text-center font-semibold text-slate-700"
                  :class="isAldiRow(fila) ? 'bg-slate-50/40' : 'bg-slate-50/60'">
                  <template v-if="isAldiRow(fila)">{{ stockFinalPrev(fila) ?? '—' }}</template>
                </td>
                <td class="px-3 py-2 text-center text-sm font-semibold"
                  :class="[
                    !isAldiRow(fila) ? 'bg-slate-50/60' : '',
                    sfIdealPlan(fila) != null && sfIdealPlan(fila) < 0 ? 'text-red-600' : 'text-slate-700'
                  ]">
                  <template v-if="isAldiRow(fila)">{{ sfIdealPlan(fila) ?? '—' }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card flush class="max-w-2xl">
        <div class="px-6 py-3 border-b border-slate-100">
          <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notas de producción</h3>
        </div>
        <table class="border-collapse text-sm w-full">
          <tbody>
            <tr v-for="l in LINEAS" :key="l.linea" class="border-b border-slate-100 last:border-b-0">
              <td :class="['px-4 py-2.5 font-bold text-center w-44 whitespace-nowrap text-xs', l.labelClass]">
                {{ l.linea }}
              </td>
              <td class="px-4 py-2.5 text-sm font-medium text-slate-700">
                {{ notasData[l.linea] || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </template>
  </div>
</template>
