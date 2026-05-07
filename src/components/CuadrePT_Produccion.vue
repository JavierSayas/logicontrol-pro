<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { supabaseOrigen } from '../lib/supabase'

const FILAS = [
  { cliente: 'Aldi',                  producto: 'Coco 150g',  rowClass: 'bg-white' },
  { cliente: 'Aldi',                  producto: 'Cilindro',   rowClass: 'bg-white' },
  { cliente: 'Lidl',                  producto: 'Cilindro',   rowClass: 'bg-orange-50' },
  { cliente: 'El corte inglés',       producto: 'Cilindro',   rowClass: 'bg-green-50' },
  { cliente: 'Supermercados Consum',  producto: 'Coco 125g',  rowClass: 'bg-purple-50' },
]

const LINEAS = [
  { linea: 'Cilindro Aldi', labelClass: 'bg-orange-300 text-orange-900' },
  { linea: 'Coco Aldi',     labelClass: 'bg-cyan-200 text-cyan-900' },
  { linea: 'Cilindro Lidl', labelClass: 'bg-yellow-200 text-yellow-900' },
  { linea: 'MASKOM',        labelClass: 'bg-white text-slate-800 border border-slate-200' },
  { linea: 'MERCADONA',     labelClass: 'bg-green-300 text-green-900' },
  { linea: 'Consum',        labelClass: 'bg-yellow-200 text-yellow-900' },
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
  <div class="space-y-4">
    <!-- Fila de cabecera -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-1 border border-slate-300 rounded px-3 py-1.5 bg-white">
        <span class="text-sm font-medium text-slate-600 mr-2">Día de Producción</span>
        <button @click="prevDia" class="px-1 text-slate-500 hover:text-slate-800">◀</button>
        <input
          type="date"
          v-model="fecha"
          class="text-sm border-none outline-none focus:ring-0 bg-transparent"
        />
        <button @click="nextDia" class="px-1 text-slate-500 hover:text-slate-800">▶</button>
        <span class="ml-2 text-sm font-semibold text-slate-700 capitalize">{{ diaSemana }}</span>
      </div>
      <span class="ml-auto text-xs text-slate-400 italic">Solo lectura</span>
    </div>

    <!-- Error -->
    <div v-if="errorMsg" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 font-medium">
      {{ errorMsg }}
    </div>

    <!-- Cargando -->
    <div v-if="loading" class="text-center py-12 text-slate-400 text-sm">Cargando…</div>

    <template v-else>
      <p class="text-center text-xs text-slate-400 italic">plantilla producción</p>

      <!-- Tabla principal -->
      <div class="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
        <table class="planificacion-table w-full border-collapse text-sm">
          <thead>
            <tr class="bg-slate-800 text-white text-xs">
              <th class="border border-slate-600 px-3 py-2 text-left">Cliente</th>
              <th class="border border-slate-600 px-3 py-2 text-left">Producto</th>
              <th class="border border-slate-600 px-3 py-2 text-center">Stock Inicial</th>
              <th class="border border-slate-600 px-3 py-2 text-center">¿Actualizado?</th>
              <th class="border border-slate-600 px-3 py-2 text-center">Expediciones</th>
              <th class="border border-slate-600 px-3 py-2 text-center">OF REAL</th>
              <th class="border border-slate-600 px-3 py-2 text-center">carros/kg OF</th>
              <th class="border border-slate-600 px-3 py-2 text-center">OF calculada</th>
              <th class="border border-slate-600 px-3 py-2 text-center">Stock Final Prev</th>
              <th class="border border-slate-600 px-3 py-2 text-center">SF ideal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in FILAS" :key="rowKey(fila)" :class="fila.rowClass">
              <td class="border border-slate-200 px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">
                {{ fila.cliente }}
              </td>
              <td class="border border-slate-200 px-3 py-1.5 text-slate-700 whitespace-nowrap">
                {{ fila.producto }}
              </td>

              <!-- Stock Inicial -->
              <td class="border border-slate-200 px-3 py-1.5 text-center text-sm text-slate-700">
                {{ getNum(fila, 'stock_inicial') || '—' }}
              </td>

              <!-- ¿Actualizado? -->
              <td class="border border-slate-200 px-3 py-1.5 text-center">
                <span
                  :class="isActualizado(fila)
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-200 text-slate-400'"
                  class="inline-block px-2 py-0.5 rounded text-xs font-semibold select-none"
                >
                  {{ isActualizado(fila) ? 'Sí' : 'No' }}
                </span>
              </td>

              <!-- Expediciones -->
              <td class="border border-slate-200 px-3 py-1.5 text-center text-sm text-slate-700">
                {{ getNum(fila, 'expediciones') || '—' }}
              </td>

              <!-- OF REAL -->
              <td class="border border-slate-200 px-3 py-1.5 text-center text-sm text-slate-700"
                :class="!isAldiRow(fila) ? 'bg-slate-100' : ''">
                <template v-if="isAldiRow(fila)">{{ getNum(fila, 'of_real') || '—' }}</template>
              </td>

              <!-- carros/kg OF -->
              <td class="border border-slate-200 px-3 py-1.5 text-center text-sm font-semibold text-slate-700"
                :class="!isAldiRow(fila) ? 'bg-slate-100' : 'bg-slate-50'">
                <template v-if="isAldiRow(fila)">
                  {{ carrosKgOf(fila) ?? (getNum(fila, 'carros_kg_of') || '—') }}
                </template>
              </td>

              <!-- OF calculada -->
              <td class="border border-slate-200 px-3 py-1.5 text-center text-sm font-semibold text-slate-700"
                :class="!isAldiRow(fila) ? 'bg-slate-100' : ''">
                <template v-if="isAldiRow(fila)">{{ ofCalculadaPlan(fila) ?? '—' }}</template>
              </td>

              <!-- Stock Final Prev (calculado) -->
              <td class="border border-slate-200 px-3 py-1.5 text-center font-semibold text-slate-700"
                :class="isAldiRow(fila) ? 'bg-slate-50' : 'bg-slate-100'">
                <template v-if="isAldiRow(fila)">{{ stockFinalPrev(fila) ?? '—' }}</template>
              </td>

              <!-- SF ideal -->
              <td class="border border-slate-200 px-3 py-1.5 text-center text-sm font-semibold"
                :class="[
                  !isAldiRow(fila) ? 'bg-slate-100' : '',
                  sfIdealPlan(fila) != null && sfIdealPlan(fila) < 0 ? 'text-red-600' : 'text-slate-700'
                ]">
                <template v-if="isAldiRow(fila)">{{ sfIdealPlan(fila) ?? '—' }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Sección de notas de producción -->
      <div class="mt-6 overflow-x-auto">
        <table class="border-collapse text-sm w-full max-w-2xl">
          <tbody>
            <tr v-for="l in LINEAS" :key="l.linea">
              <td :class="['border border-slate-300 px-4 py-2 font-bold text-center w-44 whitespace-nowrap', l.labelClass]">
                {{ l.linea }}
              </td>
              <td class="border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                {{ notasData[l.linea] || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
