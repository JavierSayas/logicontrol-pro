<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { supabase } from '../lib/supabase'
import { supabaseOrigen } from '../lib/supabase'
import { supabaseCmi } from '../lib/supabaseCmi'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import Card from './ui/Card.vue'

const FILAS = [
  { cliente: 'Aldi',                  producto: 'Coco 150g',  nombreSap: 'COCO TACOS 06X150 ALDIIFCO',    materialSap: '11001778',                          rowClass: 'bg-white' },
  { cliente: 'Aldi',                  producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 07X540 ALDIIFCO', materialSap: '11001781',                          rowClass: 'bg-white' },
  { cliente: 'Lidl',                  producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 06X540 PRP LIDL', materialSap: '11002133', matchClienteOF: /lidl/i,   rowClass: 'bg-orange-50' },
  { cliente: 'El corte inglés',       producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 06X500 DLM',      materialSap: '11001283',                            rowClass: 'bg-emerald-50' },
  { cliente: 'El corte inglés',       producto: 'Tacos Piña', nombreSap: 'PIÑA TACOS 06X400 DLM',         materialSap: '11002365',                            rowClass: 'bg-emerald-50' },
  { cliente: 'Supermercados Consum',  producto: 'Coco 125g',  nombreSap: 'COCO TACOS 06X125 DLM',         materialSap: '11002288',                            rowClass: 'bg-violet-50' },
  { cliente: 'Supermercados Consum',  producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 06X540 DLM',      materialSap: '11001451', matchClienteOF: /consum/i, rowClass: 'bg-violet-50' },
]

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const fecha = ref(new Date().toLocaleDateString('en-CA'))
const diaSemana = computed(() => {
  const d = new Date(fecha.value + 'T12:00:00')
  return DIAS[d.getDay()]
})
const fechaFormatada = computed(() => {
  const d = new Date(fecha.value + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
const realidadData = ref({})
const realidadAnteriorData = ref({})
const stockInicialOverride = ref({})
const fabricadoData = ref({})
const aldiSalidasData = ref({})
const salidasOverride = ref({})

const ALDI_PEDIDOS_MAP = {
  'Coco 150g': 'Coco Aldi',
  'Cilindro': 'Piña Cilindro Aldi',
}

function esAldi(fila) {
  return fila.cliente === 'Aldi'
}
function esLidl(fila) {
  return fila.cliente === 'Lidl'
}
function esSalidasManual(fila) {
  return !esAldi(fila) && !esLidl(fila)
}
const loading = ref(false)
const errorMsg = ref('')
const saveStatus = ref('idle')
let debounceTimer = null
let isLoadingData = false

const PLATAFORMAS_LIDL = ['Madrid', 'Barcelona', 'Tarragona', 'Valencia', 'Murcia', 'Málaga', 'Narón', 'Vitoria', 'Sevilla', 'Granada', 'Martorell']

const EXP_G1 = ['madrid', 'barcelona', 'tarragona', 'valencia', 'murcia', 'martorell']
const EXP_G2 = ['malaga', 'naron', 'vitoria', 'sevilla', 'granada']
const lidlSalidas = ref(null)

function addDaysISO(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const opcionesFechaEntrega = computed(() => [
  { value: addDaysISO(1), label: new Date(addDaysISO(1) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) },
  { value: addDaysISO(2), label: new Date(addDaysISO(2) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) },
  { value: addDaysISO(3), label: new Date(addDaysISO(3) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) },
])

const pedidoLidl = ref({ plataforma: '', fecha_entrega: '', cantidad: null })

function getStockInicialAuto(fila) {
  const prev = realidadAnteriorData.value[rowKey(fila)]
  if (prev != null) return Number(prev)
  const s = stockData.value[rowKey(fila)]?.stock_inicial
  return s == null ? null : Number(s)
}

function getStockInicial(fila) {
  const ov = stockInicialOverride.value[rowKey(fila)]
  if (ov != null) return ov
  return getStockInicialAuto(fila)
}

function setStockInicial(fila, raw) {
  const k = rowKey(fila)
  stockInicialOverride.value[k] = raw === '' || raw == null ? null : Math.round(Number(raw))
}

function getSalidasPedidos(fila) {
  if (esAldi(fila)) {
    const prodAldi = ALDI_PEDIDOS_MAP[fila.producto]
    return aldiSalidasData.value[prodAldi] ?? null
  }
  if (esLidl(fila)) {
    return lidlSalidas.value
  }
  return salidasOverride.value[rowKey(fila)] ?? null
}

function getSalidasManual(fila) {
  const v = salidasOverride.value[rowKey(fila)]
  return v == null ? '' : v
}

function setSalidasManual(fila, raw) {
  const k = rowKey(fila)
  salidasOverride.value[k] = raw === '' || raw == null ? null : Math.round(Number(raw))
}

function getFabricado(fila) {
  return fabricadoData.value[rowKey(fila)] ?? 0
}

function getCalculo(fila) {
  const si = getStockInicial(fila) ?? 0
  const fab = getFabricado(fila) ?? 0
  const sal = getSalidasPedidos(fila) ?? 0
  return si + fab - sal
}

function getRealidad(fila) {
  const v = realidadData.value[rowKey(fila)]
  return v == null ? '' : v
}

function setRealidad(fila, raw) {
  const k = rowKey(fila)
  realidadData.value[k] = raw === '' || raw == null ? null : Math.round(Number(raw))
}

function focusRealidad(idx) {
  nextTick(() => {
    const inputs = document.querySelectorAll('input[data-realidad-input]')
    const el = inputs[idx]
    if (el) {
      el.focus()
      if (typeof el.select === 'function') el.select()
    }
  })
}

function handleRealidadKeydown(event, idx) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  setRealidad(FILAS[idx], event.target.value)
  const next = event.shiftKey ? idx - 1 : idx + 1
  if (next >= 0 && next < FILAS.length) focusRealidad(next)
}

function focusStock(idx) {
  nextTick(() => {
    const inputs = document.querySelectorAll('input[data-stock-input]')
    const el = inputs[idx]
    if (el) {
      el.focus()
      if (typeof el.select === 'function') el.select()
    }
  })
}

function handleStockKeydown(event, idx) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  const next = event.shiftKey ? idx - 1 : idx + 1
  if (next >= 0 && next < FILAS.length) focusStock(next)
}

function getCuadre(fila) {
  const realidad = realidadData.value[rowKey(fila)]
  if (realidad == null) return null
  const calculo = getCalculo(fila)
  return calculo === realidad ? 'Bien' : 'Mal'
}

async function cargarStock() {
  const { data, error } = await supabaseOrigen
    .from('planificacion_aldi_stock')
    .select('cliente, producto, stock_inicial, expediciones')
    .eq('fecha', fecha.value)
  if (error) throw error
  stockData.value = Object.fromEntries((data || []).map(r => [rowKey(r), r]))
}

async function cargarRealidad() {
  const { data, error } = await supabase
    .from('cuadre_pt_realidad')
    .select('cliente, producto, realidad, stock_inicial, salidas_pedidos')
    .eq('fecha', fecha.value)
  if (error) throw error
  realidadData.value = Object.fromEntries((data || []).map(r => [rowKey(r), r.realidad]))
  stockInicialOverride.value = Object.fromEntries(
    (data || []).map(r => [rowKey(r), r.stock_inicial == null ? null : Number(r.stock_inicial)])
  )
  salidasOverride.value = Object.fromEntries(
    (data || []).map(r => [rowKey(r), r.salidas_pedidos == null ? null : Number(r.salidas_pedidos)])
  )
}

async function cargarLidlSalidas() {
  const d = new Date(fecha.value + 'T12:00:00')
  const dow = d.getDay()
  if (dow === 0 || dow === 6) {
    lidlSalidas.value = null
    return
  }
  const addDias = (n) => {
    const nd = new Date(fecha.value + 'T12:00:00')
    nd.setDate(nd.getDate() + n)
    return nd.toISOString().slice(0, 10)
  }
  const fechas = dow === 5 ? [addDias(1), addDias(3)] : [addDias(1), addDias(2)]

  const { data, error } = await supabaseOrigen
    .from('comercial_plataformas')
    .select('fecha,madrid,barcelona,tarragona,valencia,murcia,martorell,malaga,naron,vitoria,sevilla,granada')
    .eq('tipo', 'operaciones')
    .in('fecha', fechas)
  if (error) throw error

  const byFecha = Object.fromEntries((data || []).map(r => [r.fecha, r]))
  const sum = (row, keys) => keys.reduce((s, k) => {
    const v = parseFloat(String(row?.[k] ?? '').replace(',', '.'))
    return s + (Number.isNaN(v) ? 0 : v)
  }, 0)

  let total = 0
  if (dow === 1) {
    total = sum(byFecha[fechas[0]], [...EXP_G1, ...EXP_G2]) + sum(byFecha[fechas[1]], EXP_G2)
  } else if (dow >= 2 && dow <= 4) {
    total = sum(byFecha[fechas[0]], EXP_G1) + sum(byFecha[fechas[1]], EXP_G2)
  } else {
    total = sum(byFecha[fechas[0]], EXP_G1) + sum(byFecha[fechas[1]], [...EXP_G1, ...EXP_G2])
  }
  lidlSalidas.value = total > 0 ? total : null
}

async function cargarAldiPedidos() {
  const { data, error } = await supabase
    .from('aldi_pedidos_plantilla')
    .select('producto, masquefa, miranda, sagunto')
    .eq('fecha_produccion', fecha.value)
    .eq('tipo', 'diario')
  if (error) throw error
  const map = {}
  for (const row of (data || [])) {
    const total = (Number(row.masquefa) || 0) + (Number(row.miranda) || 0) + (Number(row.sagunto) || 0)
    map[row.producto] = (map[row.producto] || 0) + total
  }
  aldiSalidasData.value = map
}

function fechaMenosUn(fechaStr) {
  const d = new Date(fechaStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

async function cargarRealidadAnterior() {
  const { data, error } = await supabase
    .from('cuadre_pt_realidad')
    .select('cliente, producto, realidad')
    .eq('fecha', fechaMenosUn(fecha.value))
  if (error) throw error
  realidadAnteriorData.value = Object.fromEntries((data || []).map(r => [rowKey(r), r.realidad]))
}

async function cargarFabricado() {
  const codes = [...new Set(FILAS.map(f => Number(f.materialSap)))]

  const { data: prods, error: ep } = await supabaseCmi
    .from('productos')
    .select('id, material_sap')
    .in('material_sap', codes)
  if (ep) throw ep

  const idToMaterial = {}
  const ids = []
  for (const p of (prods || [])) {
    idToMaterial[p.id] = String(p.material_sap)
    ids.push(p.id)
  }
  if (ids.length === 0) {
    fabricadoData.value = {}
    return
  }

  const d = new Date(fecha.value + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const nextDay = d.toISOString().slice(0, 10)

  const { data, error } = await supabaseCmi
    .from('producciones')
    .select('producto_id, cantidad_entregada, numero_orden')
    .in('producto_id', ids)
    .gte('fecha_orden', fecha.value + 'T00:00:00Z')
    .lt('fecha_orden', nextDay + 'T00:00:00Z')
  if (error) throw error

  const ordenes = [...new Set((data || []).map(r => r.numero_orden).filter(v => v != null).map(String))]
  let clientePorOrden = {}
  if (ordenes.length) {
    const { data: ofRows, error: eo } = await supabaseCmi
      .from('ordenes_fabricacion')
      .select('n_orden, cliente')
      .in('n_orden', ordenes)
    if (eo) throw eo
    clientePorOrden = Object.fromEntries((ofRows || []).map(r => [String(r.n_orden), r.cliente || '']))
  }

  const map = {}
  for (const row of (data || [])) {
    const mat = idToMaterial[row.producto_id]
    if (!mat) continue
    const cliente = clientePorOrden[String(row.numero_orden)] || ''
    const fila = FILAS.find(f =>
      f.materialSap === mat &&
      (!f.matchClienteOF || f.matchClienteOF.test(cliente))
    )
    if (!fila) continue
    const valor = Number(row.cantidad_entregada)
    if (Number.isNaN(valor)) continue
    const k = rowKey(fila)
    map[k] = (map[k] || 0) + valor
  }
  fabricadoData.value = map
}

async function cargarPedidoLidl() {
  const { data, error } = await supabase
    .from('cuadre_pt_pedidos_lidl')
    .select('plataforma, fecha_entrega, cantidad')
    .eq('fecha', fecha.value)
    .maybeSingle()
  if (error) throw error
  if (data) {
    pedidoLidl.value = {
      plataforma: data.plataforma ?? '',
      fecha_entrega: data.fecha_entrega ?? '',
      cantidad: data.cantidad,
    }
  } else {
    pedidoLidl.value = { plataforma: '', fecha_entrega: '', cantidad: null }
  }
}

async function cargarDatos() {
  isLoadingData = true
  loading.value = true
  errorMsg.value = ''
  try {
    await Promise.all([cargarStock(), cargarRealidad(), cargarRealidadAnterior(), cargarPedidoLidl(), cargarFabricado(), cargarAldiPedidos(), cargarLidlSalidas()])
  } catch (err) {
    console.error('[Cuadre] Error:', err)
    errorMsg.value = 'Error cargando datos: ' + err.message
  } finally {
    loading.value = false
    await nextTick()
    isLoadingData = false
  }
}

async function guardarTodo() {
  saveStatus.value = 'saving'
  try {
    const rows = FILAS.map(f => ({
      fecha: fecha.value,
      cliente: f.cliente,
      producto: f.producto,
      realidad: realidadData.value[rowKey(f)] ?? null,
      stock_inicial: stockInicialOverride.value[rowKey(f)] ?? null,
      salidas_pedidos: esSalidasManual(f) ? (salidasOverride.value[rowKey(f)] ?? null) : null,
    }))
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase
        .from('cuadre_pt_realidad')
        .upsert(rows, { onConflict: 'fecha,cliente,producto' }),
      supabase
        .from('cuadre_pt_pedidos_lidl')
        .upsert([{
          fecha: fecha.value,
          plataforma: pedidoLidl.value.plataforma || null,
          fecha_entrega: pedidoLidl.value.fecha_entrega || null,
          cantidad: pedidoLidl.value.cantidad == null ? null : Math.round(pedidoLidl.value.cantidad),
        }], { onConflict: 'fecha' }),
    ])
    if (e1) throw e1
    if (e2) throw e2
    saveStatus.value = 'saved'
  } catch (err) {
    console.error('[Cuadre] Error guardando:', err)
    saveStatus.value = 'error'
    errorMsg.value = 'Error guardando: ' + err.message
  }
}

function scheduleAutoSave() {
  if (isLoadingData) return
  clearTimeout(debounceTimer)
  saveStatus.value = 'idle'
  debounceTimer = setTimeout(guardarTodo, 800)
}

watch(realidadData, scheduleAutoSave, { deep: true })
watch(stockInicialOverride, scheduleAutoSave, { deep: true })
watch(salidasOverride, scheduleAutoSave, { deep: true })
watch(pedidoLidl, scheduleAutoSave, { deep: true })
watch(fecha, cargarDatos, { immediate: true })
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-2">Fecha cuadre</span>
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
        <span class="ml-1 text-xs font-medium text-slate-500 px-1">{{ fechaFormatada }}</span>
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
      <Card flush>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cliente</th>
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                <th class="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Nombre SAP</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Stock inicial</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Fabricado</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Salidas pedidos</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Realidad</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cuadre</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(fila, idx) in FILAS" :key="rowKey(fila)" :class="['border-b border-slate-100', fila.rowClass]">
                <td class="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{{ fila.cliente }}</td>
                <td class="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{{ fila.producto }}</td>
                <td class="px-3 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">{{ fila.nombreSap }}</td>
                <td class="p-0.5 bg-sky-50">
                  <input
                    type="number"
                    step="1"
                    data-stock-input
                    :value="getStockInicial(fila)"
                    @change="setStockInicial(fila, $event.target.value)"
                    @keydown="handleStockKeydown($event, idx)"
                    @focus="$event.target.select()"
                    class="w-full min-w-[80px] text-center bg-transparent outline-none focus:bg-sky-100 rounded px-1 py-1 text-sm font-semibold text-slate-900"
                    placeholder="—"
                  />
                </td>
                <td class="px-3 py-2 text-center text-sm font-semibold text-slate-700">{{ getFabricado(fila) }}</td>
                <td v-if="esSalidasManual(fila)" class="p-0.5 bg-amber-50">
                  <input
                    type="number"
                    step="1"
                    :value="getSalidasManual(fila)"
                    @change="setSalidasManual(fila, $event.target.value)"
                    @focus="$event.target.select()"
                    class="w-full min-w-[80px] text-center bg-transparent outline-none focus:bg-amber-100 rounded px-1 py-1 text-sm font-semibold text-slate-900"
                    placeholder="—"
                  />
                </td>
                <td v-else class="px-3 py-2 text-center text-sm font-semibold text-slate-700">{{ getSalidasPedidos(fila) ?? '—' }}</td>
                <td class="p-0.5 bg-amber-50">
                  <input
                    type="number"
                    step="1"
                    data-realidad-input
                    :value="getRealidad(fila)"
                    @change="setRealidad(fila, $event.target.value)"
                    @keydown="handleRealidadKeydown($event, idx)"
                    @focus="$event.target.select()"
                    class="w-full min-w-[80px] text-center bg-transparent outline-none focus:bg-amber-100 rounded px-1 py-1 text-sm font-semibold text-slate-900"
                    placeholder="—"
                  />
                </td>
                <td class="px-3 py-2 text-center text-sm font-bold"
                  :class="{
                    'bg-red-50 text-red-700': getCuadre(fila) === 'Mal',
                    'bg-emerald-50 text-emerald-700': getCuadre(fila) === 'Bien',
                    'text-slate-300': getCuadre(fila) === null,
                  }">
                  {{ getCuadre(fila) ?? '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div class="inline-block">
        <div class="text-center font-bold py-2.5 px-4 text-sm tracking-wider bg-slate-900 text-white rounded-t-lg">
          PEDIDOS A MEDIAS LIDL
        </div>
        <Card flush class="rounded-t-none">
          <table class="border-collapse text-sm w-full">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-xs">
                <th class="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                <th class="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Plataforma</th>
                <th class="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Fecha entrega</th>
                <th class="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="px-3 py-2 text-center font-semibold text-slate-700 whitespace-nowrap border-b border-slate-100">
                  Cilindro
                </td>
                <td class="p-0.5 bg-amber-50 border-b border-slate-100">
                  <select
                    v-model="pedidoLidl.plataforma"
                    class="w-full min-w-[120px] bg-transparent outline-none focus:bg-amber-100 px-2 py-1 text-sm font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">—</option>
                    <option v-for="p in PLATAFORMAS_LIDL" :key="p" :value="p">{{ p }}</option>
                  </select>
                </td>
                <td class="p-0.5 bg-amber-50 border-b border-slate-100">
                  <select
                    v-model="pedidoLidl.fecha_entrega"
                    class="w-full min-w-[140px] bg-transparent outline-none focus:bg-amber-100 px-2 py-1 text-sm font-medium text-slate-900 cursor-pointer"
                  >
                    <option value="">—</option>
                    <option v-for="op in opcionesFechaEntrega" :key="op.value" :value="op.value">{{ op.label }}</option>
                  </select>
                </td>
                <td class="p-0.5 bg-amber-50 border-b border-slate-100">
                  <input
                    type="number"
                    step="1"
                    v-model.number="pedidoLidl.cantidad"
                    class="w-full min-w-[80px] text-center bg-transparent outline-none focus:bg-amber-100 rounded px-1 py-1 text-sm font-semibold text-slate-900"
                    placeholder="0"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </template>
  </div>
</template>
