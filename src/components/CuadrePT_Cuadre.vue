<script setup>
import { ref, computed, watch, nextTick, onActivated } from 'vue'
import { supabase } from '../lib/supabase'
import { supabaseOrigen } from '../lib/supabase'
import { supabaseCmi } from '../lib/supabaseCmi'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Settings, Plus, Trash2, X, History } from 'lucide-vue-next'
import Card from './ui/Card.vue'

const COLORES = {
  blanco:   { label: 'Sin color', rowClass: 'bg-white' },
  naranja:  { label: 'Naranja',   rowClass: 'bg-orange-50' },
  verde:    { label: 'Verde',     rowClass: 'bg-emerald-50' },
  violeta:  { label: 'Violeta',   rowClass: 'bg-violet-50' },
  azul:     { label: 'Azul',      rowClass: 'bg-sky-50' },
  amarillo: { label: 'Amarillo',  rowClass: 'bg-amber-50' },
  rosa:     { label: 'Rosa',      rowClass: 'bg-rose-50' },
  cian:     { label: 'Cian',      rowClass: 'bg-cyan-50' },
  indigo:   { label: 'Índigo',    rowClass: 'bg-indigo-50' },
  gris:     { label: 'Gris',      rowClass: 'bg-slate-100' },
}
const rowClassDeColor = (color) => COLORES[color]?.rowClass || COLORES.blanco.rowClass

// El material/nombre SAP de cada fila tiene historial por fecha de vigencia:
// al cambiar el producto de una fila, el valor anterior sigue aplicando para
// las fechas de cuadre ya pasadas, y el nuevo solo aplica desde su vigencia.
function ordenarPorVigencia(entries) {
  return [...entries].sort((a, b) => (a.vigente_desde || '').localeCompare(b.vigente_desde || ''))
}

function sapVigenteEn(entries, fechaStr) {
  if (entries.length === 0) return null
  const ordenadas = ordenarPorVigencia(entries)
  const aplicables = ordenadas.filter(h => !h.vigente_desde || h.vigente_desde <= fechaStr)
  return aplicables.length > 0 ? aplicables[aplicables.length - 1] : ordenadas[0]
}

const HOY = () => new Date().toLocaleDateString('en-CA')

const productosBase = ref([])
const historialSap = ref([])
const cargandoProductos = ref(false)
const errorProductos = ref('')

function construirFila(p, fechaStr) {
  const entries = historialSap.value.filter(h => h.producto_id === p.id)
  const vigente = sapVigenteEn(entries, fechaStr)
  return {
    id: p.id,
    cliente: p.cliente,
    producto: p.producto,
    nombreSap: vigente?.nombre_sap || '',
    materialSap: vigente?.material_sap || '',
    matchClienteOf: p.match_cliente_of || '',
    color: p.color || 'blanco',
    rowClass: rowClassDeColor(p.color),
  }
}

const filas = computed(() => productosBase.value.map(p => construirFila(p, fecha.value)))

async function cargarConfiguracionProductos() {
  cargandoProductos.value = true
  errorProductos.value = ''
  try {
    const [{ data: base, error: eBase }, { data: hist, error: eHist }] = await Promise.all([
      supabase.from('cuadre_pt_productos').select('id, orden, cliente, producto, match_cliente_of, color').order('orden', { ascending: true }),
      supabase.from('cuadre_pt_productos_sap_historial').select('id, producto_id, material_sap, nombre_sap, vigente_desde'),
    ])
    if (eBase) throw eBase
    if (eHist) throw eHist
    productosBase.value = base || []
    historialSap.value = hist || []
  } catch (err) {
    errorProductos.value = 'Error cargando productos del cuadre: ' + err.message
    productosBase.value = []
    historialSap.value = []
  } finally {
    cargandoProductos.value = false
  }
}

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
  setRealidad(filas.value[idx], event.target.value)
  const next = event.shiftKey ? idx - 1 : idx + 1
  if (next >= 0 && next < filas.value.length) focusRealidad(next)
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
  if (next >= 0 && next < filas.value.length) focusStock(next)
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
  const { data, error } = await supabaseCmi
    .from('aldi_pedidos')
    .select('producto, masquefa, miranda, sagunto')
    .eq('fecha_produccion', fecha.value)
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
  const codes = [...new Set(filas.value.map(f => Number(f.materialSap)))]

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
    const clienteNorm = cliente.toLowerCase()
    const fila = filas.value.find(f =>
      f.materialSap === mat &&
      (!f.matchClienteOf || clienteNorm.includes(f.matchClienteOf.toLowerCase()))
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
    const rows = filas.value.map(f => ({
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
watch(fecha, cargarDatos)

async function init() {
  await cargarConfiguracionProductos()
  await cargarDatos()
}
init()

// La pestaña vive dentro de un <keep-alive>: al volver desde otra sub-pestaña
// (p.ej. Pedidos Aldi tras actualizar cantidades) hay que recargar los datos.
onActivated(cargarDatos)

const mostrarEditor = ref(false)
const editRows = ref([])
const guardandoProductos = ref(false)
const errorEditor = ref('')

function nuevaFilaVacia() {
  return { id: null, cliente: '', producto: '', nombreSap: '', materialSap: '', matchClienteOf: '', color: 'blanco', vigenteDesde: HOY() }
}

// Snapshot del material/nombre SAP vigente HOY para cada fila al abrir el
// editor, para poder detectar si el usuario lo cambió al guardar.
let sapOriginalPorId = {}

function abrirEditor() {
  const hoy = HOY()
  editRows.value = productosBase.value.map(p => {
    const fila = construirFila(p, hoy)
    return { ...fila, vigenteDesde: hoy }
  })
  sapOriginalPorId = Object.fromEntries(
    editRows.value.filter(f => f.id != null).map(f => [f.id, { materialSap: f.materialSap, nombreSap: f.nombreSap }])
  )
  errorEditor.value = ''
  mostrarEditor.value = true
}

function cerrarEditor() {
  mostrarEditor.value = false
  historialAbiertoId.value = null
}

const historialAbiertoId = ref(null)
const historialEdit = ref([])
const guardandoHistorial = ref(false)
const errorHistorial = ref('')

function toggleHistorial(productoId) {
  if (historialAbiertoId.value === productoId) {
    historialAbiertoId.value = null
    return
  }
  historialEdit.value = ordenarPorVigencia(historialSap.value.filter(h => h.producto_id === productoId))
    .map(h => ({ id: h.id, materialSap: h.material_sap, nombreSap: h.nombre_sap, vigenteDesde: h.vigente_desde || '' }))
  errorHistorial.value = ''
  historialAbiertoId.value = productoId
}

function agregarVersionHistorial() {
  historialEdit.value.push({ id: null, materialSap: '', nombreSap: '', vigenteDesde: HOY() })
}

function eliminarVersionHistorial(idx) {
  historialEdit.value.splice(idx, 1)
}

async function guardarHistorial(productoId) {
  if (productoId == null) return
  guardandoHistorial.value = true
  errorHistorial.value = ''
  try {
    const validas = historialEdit.value.filter(h => h.materialSap.trim())
    if (validas.length === 0) {
      errorHistorial.value = 'Tiene que quedar al menos una versión con Material SAP.'
      return
    }

    const idsActuales = new Set(validas.filter(h => h.id != null).map(h => h.id))
    const idsAEliminar = historialSap.value
      .filter(h => h.producto_id === productoId && !idsActuales.has(h.id))
      .map(h => h.id)
    if (idsAEliminar.length > 0) {
      const { error: eDel } = await supabase.from('cuadre_pt_productos_sap_historial').delete().in('id', idsAEliminar)
      if (eDel) throw eDel
    }

    for (const h of validas) {
      const payload = {
        producto_id: productoId,
        material_sap: h.materialSap.trim(),
        nombre_sap: h.nombreSap.trim(),
        vigente_desde: h.vigenteDesde || null,
      }
      if (h.id != null) {
        const { error: eUpd } = await supabase.from('cuadre_pt_productos_sap_historial').update(payload).eq('id', h.id)
        if (eUpd) throw eUpd
      } else {
        const { error: eIns } = await supabase.from('cuadre_pt_productos_sap_historial').insert(payload)
        if (eIns) throw eIns
      }
    }

    await cargarConfiguracionProductos()
    await cargarDatos()
    historialAbiertoId.value = null
  } catch (err) {
    errorHistorial.value = 'Error guardando historial: ' + err.message
  } finally {
    guardandoHistorial.value = false
  }
}

function agregarFilaEditor() {
  editRows.value.push(nuevaFilaVacia())
}

function eliminarFilaEditor(idx) {
  editRows.value.splice(idx, 1)
}

async function guardarConfiguracionProductos() {
  guardandoProductos.value = true
  errorEditor.value = ''
  try {
    const filasValidas = editRows.value.filter(f => f.cliente.trim() && f.producto.trim() && f.materialSap.trim())

    const idsActuales = new Set(filasValidas.filter(f => f.id != null).map(f => f.id))
    const idsAEliminar = productosBase.value.map(p => p.id).filter(id => !idsActuales.has(id))
    if (idsAEliminar.length > 0) {
      const { error: eDel } = await supabase.from('cuadre_pt_productos').delete().in('id', idsAEliminar)
      if (eDel) throw eDel
    }

    for (let idx = 0; idx < filasValidas.length; idx++) {
      const f = filasValidas[idx]
      const base = {
        orden: idx + 1,
        cliente: f.cliente.trim(),
        producto: f.producto.trim(),
        match_cliente_of: f.matchClienteOf.trim() || null,
        color: f.color || 'blanco',
      }
      const nombreSap = f.nombreSap.trim()
      const materialSap = f.materialSap.trim()

      if (f.id != null) {
        const { error: eUpd } = await supabase.from('cuadre_pt_productos').update(base).eq('id', f.id)
        if (eUpd) throw eUpd

        const original = sapOriginalPorId[f.id]
        const cambioSap = !original || original.materialSap !== materialSap || original.nombreSap !== nombreSap
        if (cambioSap) {
          const { error: eHist } = await supabase.from('cuadre_pt_productos_sap_historial').insert({
            producto_id: f.id,
            material_sap: materialSap,
            nombre_sap: nombreSap,
            vigente_desde: f.vigenteDesde || HOY(),
          })
          if (eHist) throw eHist
        }
      } else {
        const { data: nuevo, error: eIns } = await supabase.from('cuadre_pt_productos').insert(base).select('id').single()
        if (eIns) throw eIns
        const { error: eHist } = await supabase.from('cuadre_pt_productos_sap_historial').insert({
          producto_id: nuevo.id,
          material_sap: materialSap,
          nombre_sap: nombreSap,
          vigente_desde: null,
        })
        if (eHist) throw eHist
      }
    }

    await cargarConfiguracionProductos()
    await cargarDatos()
    mostrarEditor.value = false
  } catch (err) {
    errorEditor.value = 'Error guardando productos: ' + err.message
  } finally {
    guardandoProductos.value = false
  }
}
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

      <button
        @click="abrirEditor"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 hover:text-slate-800 transition-colors"
      >
        <Settings class="w-4 h-4" />
        Editar productos
      </button>

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
              <tr v-for="(fila, idx) in filas" :key="rowKey(fila)" :class="['border-b border-slate-100', fila.rowClass]">
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

    <div v-if="mostrarEditor" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide">Editar productos del cuadre</h3>
          <button @click="cerrarEditor" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="overflow-auto px-5 py-4 flex-1">
          <div v-if="errorEditor" class="mb-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            {{ errorEditor }}
          </div>

          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cliente</th>
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Nombre SAP</th>
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Material SAP</th>
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Vigente desde</th>
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Coincide con (opcional)</th>
                <th class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Color</th>
                <th class="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(fila, idx) in editRows" :key="idx">
              <tr class="border-b border-slate-100">
                <td class="p-1">
                  <input v-model="fila.cliente" type="text" placeholder="Cliente" class="w-full min-w-[110px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400" />
                </td>
                <td class="p-1">
                  <input v-model="fila.producto" type="text" placeholder="Producto" class="w-full min-w-[110px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400" />
                </td>
                <td class="p-1">
                  <input v-model="fila.nombreSap" type="text" placeholder="Nombre SAP" class="w-full min-w-[160px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400" />
                </td>
                <td class="p-1">
                  <input v-model="fila.materialSap" type="text" placeholder="Material SAP" class="w-full min-w-[110px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400" />
                </td>
                <td class="p-1">
                  <input
                    v-model="fila.vigenteDesde"
                    type="date"
                    :disabled="fila.id == null"
                    :title="fila.id == null ? 'Fila nueva: aplica siempre' : 'Solo se usa si cambias Nombre SAP o Material SAP'"
                    class="w-full min-w-[130px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
                <td class="p-1">
                  <input v-model="fila.matchClienteOf" type="text" placeholder="ej: lidl" class="w-full min-w-[100px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400" />
                </td>
                <td class="p-1">
                  <select v-model="fila.color" class="w-full min-w-[100px] px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:outline-none focus:border-slate-400">
                    <option v-for="(def, key) in COLORES" :key="key" :value="key">{{ def.label }}</option>
                  </select>
                </td>
                <td class="p-1 text-center whitespace-nowrap">
                  <button
                    v-if="fila.id != null"
                    @click="toggleHistorial(fila.id)"
                    class="p-1.5 rounded-lg transition-colors"
                    :class="historialAbiertoId === fila.id ? 'text-slate-900 bg-slate-100' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'"
                    title="Ver / corregir historial de fechas"
                  >
                    <History class="w-4 h-4" />
                  </button>
                  <button @click="eliminarFilaEditor(idx)" class="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Eliminar fila">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
              <tr v-if="fila.id != null && historialAbiertoId === fila.id" class="bg-slate-50 border-b border-slate-200">
                <td colspan="7" class="p-3">
                  <div v-if="errorHistorial" class="mb-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {{ errorHistorial }}
                  </div>
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Historial de {{ fila.cliente }} · {{ fila.producto }} — corrige aquí la fecha desde la que aplica cada versión
                  </p>
                  <table class="w-full border-collapse text-sm mb-2">
                    <thead>
                      <tr class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th class="text-left px-2 py-1">Nombre SAP</th>
                        <th class="text-left px-2 py-1">Material SAP</th>
                        <th class="text-left px-2 py-1">Vigente desde</th>
                        <th class="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(h, hIdx) in historialEdit" :key="hIdx">
                        <td class="p-1">
                          <input v-model="h.nombreSap" type="text" class="w-full min-w-[160px] px-2 py-1.5 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:border-slate-400" />
                        </td>
                        <td class="p-1">
                          <input v-model="h.materialSap" type="text" class="w-full min-w-[110px] px-2 py-1.5 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:border-slate-400" />
                        </td>
                        <td class="p-1">
                          <input
                            v-model="h.vigenteDesde"
                            type="date"
                            placeholder="Siempre"
                            title="Vacío = aplica desde siempre"
                            class="w-full min-w-[130px] px-2 py-1.5 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:border-slate-400"
                          />
                        </td>
                        <td class="p-1 text-center">
                          <button @click="eliminarVersionHistorial(hIdx)" class="p-1.5 rounded-lg text-red-500 hover:bg-red-100 transition-colors" title="Eliminar versión">
                            <Trash2 class="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div class="flex items-center justify-between">
                    <button
                      @click="agregarVersionHistorial"
                      class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                    >
                      <Plus class="w-3.5 h-3.5" />
                      Añadir versión
                    </button>
                    <button
                      @click="guardarHistorial(fila.id)"
                      :disabled="guardandoHistorial"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                      {{ guardandoHistorial ? 'Guardando…' : 'Guardar historial' }}
                    </button>
                  </div>
                </td>
              </tr>
              </template>
            </tbody>
          </table>

          <button
            @click="agregarFilaEditor"
            class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            <Plus class="w-4 h-4" />
            Añadir fila
          </button>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button @click="cerrarEditor" class="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button
            @click="guardarConfiguracionProductos"
            :disabled="guardandoProductos"
            class="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {{ guardandoProductos ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
