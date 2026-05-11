<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { supabase } from '../lib/supabase'
import { supabaseOrigen } from '../lib/supabase'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import Card from './ui/Card.vue'

const FILAS = [
  { cliente: 'Aldi',                  producto: 'Coco 150g',  nombreSap: 'COCO TACOS 06X150 ALDIIFCO',    matchCliente: /aldi/i,                          matchProducto: /(coco.*150|150.*coco)/i,        rowClass: 'bg-white' },
  { cliente: 'Aldi',                  producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 07X540 ALDIIFCO', matchCliente: /aldi/i,                          matchProducto: /cilindro/i,                     rowClass: 'bg-white' },
  { cliente: 'Lidl',                  producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 06X540 PRP LIDL', matchCliente: /lidl/i,                          matchProducto: /cilindro/i,                     rowClass: 'bg-orange-50' },
  { cliente: 'El corte inglés',       producto: 'Cilindro',   nombreSap: 'PIÑA CILINDRO 06X500 DLM',      matchCliente: /delmonte/i,                      matchProducto: /cilindro/i,                     rowClass: 'bg-emerald-50' },
  { cliente: 'Supermercados Consum',  producto: 'Coco 125g',  nombreSap: 'COCO TACOS 06X125 DLM',         matchCliente: /delmonte/i,                      matchProducto: /(coco.*125|125.*coco)/i,        rowClass: 'bg-violet-50' },
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
const fabricadoData = ref({})
const loading = ref(false)
const errorMsg = ref('')
const saveStatus = ref('idle')
let debounceTimer = null
let isLoadingData = false

const PLATAFORMAS_LIDL = ['Madrid', 'Barcelona', 'Tarragona', 'Valencia', 'Murcia', 'Málaga', 'Narón', 'Vitoria', 'Sevilla', 'Granada', 'Martorell']

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

function getStockInicial(fila) {
  return stockData.value[rowKey(fila)]?.stock_inicial ?? null
}

function getSalidasPedidos(fila) {
  return stockData.value[rowKey(fila)]?.expediciones ?? null
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
  realidadData.value[k] = raw === '' || raw == null ? null : Number(raw)
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
    .select('cliente, producto, realidad')
    .eq('fecha', fecha.value)
  if (error) throw error
  realidadData.value = Object.fromEntries((data || []).map(r => [rowKey(r), r.realidad]))
}

function parseFechaFlexible(str) {
  if (!str) return null
  const s = String(str).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  m = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2})$/)
  if (m) {
    const yy = parseInt(m[3], 10)
    const yyyy = yy < 70 ? 2000 + yy : 1900 + yy
    return `${yyyy}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  }
  return null
}

async function cargarFabricado() {
  const { data, error } = await supabase
    .from('produccion_dia')
    .select('nombre_cliente, desc_fruta, texto_breve_material, cant_notificada, fecha_manip')
  if (error) throw error

  const map = {}
  for (const row of (data || [])) {
    const fechaProd = parseFechaFlexible(row.fecha_manip)
    if (fechaProd !== fecha.value) continue

    const cliente = row.nombre_cliente || ''
    const productoText = `${row.desc_fruta || ''} ${row.texto_breve_material || ''}`

    const fila = FILAS.find(f =>
      f.matchCliente.test(cliente) && f.matchProducto.test(productoText)
    )
    if (!fila) continue

    const valor = parseFloat(String(row.cant_notificada || '').replace(',', '.'))
    if (isNaN(valor)) continue

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
    await Promise.all([cargarStock(), cargarRealidad(), cargarPedidoLidl(), cargarFabricado()])
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
          cantidad: pedidoLidl.value.cantidad ?? null,
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
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 bg-slate-100">SF Viern</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 bg-slate-100">SF Sábad</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Stock inicial</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Fabricado</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Salidas pedidos</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Realidad</th>
                <th class="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cuadre</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fila in FILAS" :key="rowKey(fila)" :class="['border-b border-slate-100', fila.rowClass]">
                <td class="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{{ fila.cliente }}</td>
                <td class="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{{ fila.producto }}</td>
                <td class="px-3 py-2 text-xs font-medium text-slate-500 whitespace-nowrap">{{ fila.nombreSap }}</td>
                <td class="px-3 py-2 text-center bg-slate-50/60"></td>
                <td class="px-3 py-2 text-center bg-slate-50/60"></td>
                <td class="px-3 py-2 text-center text-sm font-semibold text-slate-700">{{ getStockInicial(fila) ?? '—' }}</td>
                <td class="px-3 py-2 text-center text-sm font-semibold text-slate-700">{{ getFabricado(fila) }}</td>
                <td class="px-3 py-2 text-center text-sm font-semibold text-slate-700">{{ getSalidasPedidos(fila) ?? '—' }}</td>
                <td class="p-0.5 bg-amber-50">
                  <input
                    type="number"
                    step="0.01"
                    :value="getRealidad(fila)"
                    @change="setRealidad(fila, $event.target.value)"
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
                    step="0.01"
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
