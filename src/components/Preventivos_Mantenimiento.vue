<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { notificarIncidencia } from '../lib/emailjs'
import { useAuthStore } from '../stores/auth'
import {
  Wrench,
  Search,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Camera,
  X,
  Clock,
  Filter,
  Truck,
  RefreshCw,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  Plus,
  Check,
  Trash2,
  Inbox,
  MessageSquare,
  CheckCheck,
  RotateCcw,
} from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import PageHeader from './ui/PageHeader.vue'

const auth = useAuthStore()

const vistaActiva = ref('lista')

const maquinas = ref([])
const vencidasPorMaquina = ref({})
const totalTareas = ref(0)
const loadingListado = ref(false)
const filtroTipo = ref('todos')
const filtroBusqueda = ref('')
const maquinaSeleccionada = ref(null)

const estadoTareas = ref([])
const loadingEstado = ref(false)

const tareaSeleccionada = ref(null)
const registroForm = ref({
  realizado_por: '',
  fecha_realizada: new Date().toISOString().split('T')[0],
})
const guardandoRegistro = ref(false)

const incidenciaForm = ref({
  reportado_por: '',
  fecha_reporte: new Date().toISOString().split('T')[0],
  descripcion: '',
  foto_file: null,
  foto_preview: null,
})
const guardandoIncidencia = ref(false)

const incidencias = ref([])
const loadingIncidencias = ref(false)
const filtroEstadoIncidencias = ref('abierta')
const conteoIncidenciasAbiertas = ref(0)
const incidenciaSeleccionada = ref(null)
const incidenciaFotoUrl = ref('')
const editIncidencia = ref({
  comentarios: '',
  resuelta_por: '',
})
const guardandoEdicionIncidencia = ref(false)

const operarios = ref([])
const mostrarFormularioOperario = ref(false)
const nuevoOperario = ref('')
const guardandoOperario = ref(false)
const quitandoOperarioId = ref(null)

const puedeGestionarOperarios = computed(() => auth.role === 'user' || auth.role === 'admin')

const errorMsg = ref('')
const successMsg = ref('')

const tipos = computed(() => {
  const set = new Set(maquinas.value.map(m => m.tipo).filter(Boolean))
  return [...set].sort()
})

const maquinasFiltradas = computed(() => {
  const q = filtroBusqueda.value.trim().toLowerCase()
  return maquinas.value.filter(m => {
    if (filtroTipo.value !== 'todos' && m.tipo !== filtroTipo.value) return false
    if (!q) return true
    const haystack = [m.nombre_palet, m.matricula, m.n_serie, m.modelo, m.proveedor, m.accionamiento, m.tipo]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

const totalVencidas = computed(() =>
  Object.values(vencidasPorMaquina.value).reduce((a, b) => a + b, 0)
)
const maquinasConVencidas = computed(() =>
  Object.values(vencidasPorMaquina.value).filter(n => n > 0).length
)
const porcentajeVencidas = computed(() => {
  if (totalTareas.value === 0) return 0
  return (totalVencidas.value / totalTareas.value) * 100
})
const porcentajeMaquinasAfectadas = computed(() => {
  if (maquinas.value.length === 0) return 0
  return (maquinasConVencidas.value / maquinas.value.length) * 100
})

const tareasVencidasMaquina = computed(() => estadoTareas.value.filter(t => t.vencida).length)
const tareasOkMaquina = computed(() => estadoTareas.value.filter(t => !t.vencida).length)

const FRACTTAL_URL = 'https://one.fracttal.com/signin'

function esToyota(m) {
  return (m?.proveedor || '').trim().toUpperCase() === 'TOYOTA'
}

onMounted(async () => {
  await Promise.all([cargarListado(), cargarOperarios(), cargarConteoIncidencias()])
})

async function cargarOperarios() {
  try {
    const { data, error } = await supabase
      .from('operarios')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
    if (error) throw error
    operarios.value = data || []
  } catch (err) {
    console.error('Error cargando operarios:', err.message)
  }
}

async function anadirOperario() {
  const nombre = nuevoOperario.value.trim()
  if (!nombre) return
  guardandoOperario.value = true
  try {
    const { data, error } = await supabase
      .from('operarios')
      .insert({
        nombre,
        created_by: auth.user?.id || null,
        updated_by: auth.user?.id || null,
      })
      .select('id, nombre')
      .single()
    if (error) throw error
    operarios.value = [...operarios.value, data].sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (vistaActiva.value === 'registrar-tarea') {
      registroForm.value.realizado_por = data.nombre
    } else if (vistaActiva.value === 'incidencia') {
      incidenciaForm.value.reportado_por = data.nombre
    }
    nuevoOperario.value = ''
    mostrarFormularioOperario.value = false
  } catch (err) {
    mostrarError('No se pudo añadir el operario: ' + err.message)
  } finally {
    guardandoOperario.value = false
  }
}

function cancelarAnadirOperario() {
  nuevoOperario.value = ''
  mostrarFormularioOperario.value = false
}

async function quitarOperario(op) {
  if (!puedeGestionarOperarios.value) return
  if (!confirm(`¿Quitar al operario "${op.nombre}"?\n\nDejará de aparecer en los desplegables. Los registros antiguos conservarán su nombre.`)) return
  quitandoOperarioId.value = op.id
  try {
    const { error } = await supabase
      .from('operarios')
      .update({ activo: false, updated_by: auth.user?.id || null })
      .eq('id', op.id)
    if (error) throw error
    operarios.value = operarios.value.filter(o => o.id !== op.id)
    if (registroForm.value.realizado_por === op.nombre) {
      registroForm.value.realizado_por = ''
    }
    if (incidenciaForm.value.reportado_por === op.nombre) {
      incidenciaForm.value.reportado_por = ''
    }
    mostrarExito(`Operario "${op.nombre}" quitado`)
  } catch (err) {
    mostrarError('No se pudo quitar el operario: ' + err.message)
  } finally {
    quitandoOperarioId.value = null
  }
}

async function cargarListado() {
  loadingListado.value = true
  errorMsg.value = ''
  try {
    const [maqRes, tareasRes] = await Promise.all([
      supabase
        .from('maquinaria_logistica')
        .select('*')
        .eq('activo', true)
        .order('tipo')
        .order('nombre_palet')
        .order('n_serie'),
      supabase
        .from('v_estado_tareas_maquinas')
        .select('maquina_id, vencida'),
    ])
    if (maqRes.error) throw maqRes.error
    if (tareasRes.error) throw tareasRes.error

    maquinas.value = maqRes.data || []
    const todasTareas = tareasRes.data || []
    totalTareas.value = todasTareas.length
    const conteo = {}
    for (const row of todasTareas) {
      if (row.vencida) {
        conteo[row.maquina_id] = (conteo[row.maquina_id] || 0) + 1
      }
    }
    vencidasPorMaquina.value = conteo
  } catch (err) {
    mostrarError('Error cargando listado: ' + err.message)
  } finally {
    loadingListado.value = false
  }
}

async function cargarConteoIncidencias() {
  try {
    const { count, error } = await supabase
      .from('incidencias_maquinaria')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'abierta')
    if (error) throw error
    conteoIncidenciasAbiertas.value = count || 0
  } catch (err) {
    console.error('Error contando incidencias:', err.message)
  }
}

async function cargarEstadoTareas() {
  if (!maquinaSeleccionada.value) return
  loadingEstado.value = true
  try {
    const { data, error } = await supabase
      .from('v_estado_tareas_maquinas')
      .select('*')
      .eq('maquina_id', maquinaSeleccionada.value.id)
      .order('vencida', { ascending: false })
      .order('siguiente_fecha', { ascending: true, nullsFirst: true })
    if (error) throw error
    estadoTareas.value = data || []
  } catch (err) {
    mostrarError('Error cargando tareas: ' + err.message)
  } finally {
    loadingEstado.value = false
  }
}

async function cargarIncidencias() {
  loadingIncidencias.value = true
  try {
    let query = supabase
      .from('incidencias_maquinaria')
      .select('id, maquina_id, reportado_por, fecha_reporte, descripcion, foto_url, estado, resuelta_at, resuelta_por, comentarios, created_at')
      .order('created_at', { ascending: false })
    if (filtroEstadoIncidencias.value !== 'todas') {
      query = query.eq('estado', filtroEstadoIncidencias.value)
    }
    const { data, error } = await query
    if (error) throw error

    const ids = [...new Set((data || []).map(i => i.maquina_id).filter(Boolean))]
    let maquinasMap = {}
    if (ids.length > 0) {
      const { data: maqData, error: maqErr } = await supabase
        .from('maquinaria_logistica')
        .select('id, tipo, nombre_palet, n_serie, matricula, modelo, proveedor, accionamiento')
        .in('id', ids)
      if (maqErr) throw maqErr
      maquinasMap = Object.fromEntries((maqData || []).map(m => [m.id, m]))
    }

    incidencias.value = (data || []).map(i => ({
      ...i,
      maquina: maquinasMap[i.maquina_id] || null,
    }))
  } catch (err) {
    mostrarError('Error cargando incidencias: ' + err.message)
  } finally {
    loadingIncidencias.value = false
  }
}

function nombreMaquina(m) {
  if (!m) return ''
  return [m.tipo, m.nombre_palet, m.n_serie || m.matricula].filter(Boolean).join(' · ')
}

async function abrirDetalleTareas(m) {
  maquinaSeleccionada.value = m
  vistaActiva.value = 'tareas'
  await cargarEstadoTareas()
}

function abrirRegistrarTarea(tarea) {
  tareaSeleccionada.value = tarea
  registroForm.value = {
    realizado_por: operarioSugerido(),
    fecha_realizada: new Date().toISOString().split('T')[0],
  }
  mostrarFormularioOperario.value = false
  nuevoOperario.value = ''
  vistaActiva.value = 'registrar-tarea'
}

function abrirRegistrarIncidencia(m) {
  if (!esToyota(m)) {
    window.open(FRACTTAL_URL, '_blank', 'noopener,noreferrer')
    return
  }
  maquinaSeleccionada.value = m
  incidenciaForm.value = {
    reportado_por: '',
    fecha_reporte: new Date().toISOString().split('T')[0],
    descripcion: '',
    foto_file: null,
    foto_preview: null,
  }
  mostrarFormularioOperario.value = false
  nuevoOperario.value = ''
  vistaActiva.value = 'incidencia'
}

async function abrirIncidencias() {
  vistaActiva.value = 'incidencias-lista'
  filtroEstadoIncidencias.value = 'abierta'
  await cargarIncidencias()
}

async function cambiarFiltroIncidencias(valor) {
  filtroEstadoIncidencias.value = valor
  await cargarIncidencias()
}

async function abrirDetalleIncidencia(inc) {
  incidenciaSeleccionada.value = inc
  editIncidencia.value = {
    comentarios: inc.comentarios || '',
    resuelta_por: inc.resuelta_por || auth.user?.email || '',
  }
  incidenciaFotoUrl.value = ''
  mostrarFormularioOperario.value = false
  nuevoOperario.value = ''
  vistaActiva.value = 'incidencia-detalle'
  if (inc.foto_url) {
    try {
      const { data } = await supabase.storage
        .from('incidencias-fotos')
        .createSignedUrl(inc.foto_url, 60 * 60)
      if (data?.signedUrl) incidenciaFotoUrl.value = data.signedUrl
    } catch (err) {
      console.error('Error generando URL de foto:', err.message)
    }
  }
}

async function volverALista() {
  vistaActiva.value = 'lista'
  maquinaSeleccionada.value = null
  tareaSeleccionada.value = null
  estadoTareas.value = []
  incidenciaSeleccionada.value = null
  incidenciaFotoUrl.value = ''
  await Promise.all([cargarListado(), cargarConteoIncidencias()])
}

function volverATareas() {
  tareaSeleccionada.value = null
  vistaActiva.value = 'tareas'
}

async function volverAIncidencias() {
  incidenciaSeleccionada.value = null
  incidenciaFotoUrl.value = ''
  vistaActiva.value = 'incidencias-lista'
  await cargarIncidencias()
}

async function volverAtras() {
  if (vistaActiva.value === 'registrar-tarea') {
    volverATareas()
  } else if (vistaActiva.value === 'incidencia-detalle') {
    await volverAIncidencias()
  } else if (vistaActiva.value === 'incidencias-lista') {
    await volverALista()
  } else {
    await volverALista()
  }
}

async function guardarRegistro() {
  if (!tareaSeleccionada.value || !maquinaSeleccionada.value) return
  if (!registroForm.value.realizado_por.trim() || !registroForm.value.fecha_realizada) return
  guardandoRegistro.value = true
  errorMsg.value = ''
  try {
    const payload = {
      maquina_id: maquinaSeleccionada.value.id,
      tarea_id: tareaSeleccionada.value.tarea_id,
      realizado_por: registroForm.value.realizado_por.trim(),
      fecha_realizada: registroForm.value.fecha_realizada,
      created_by: auth.user?.id || null,
      updated_by: auth.user?.id || null,
    }
    const { error } = await supabase.from('registros_preventivos').insert(payload)
    if (error) throw error
    mostrarExito('Tarea registrada correctamente')
    volverATareas()
    await cargarEstadoTareas()
  } catch (err) {
    mostrarError('No se pudo guardar el registro: ' + err.message)
  } finally {
    guardandoRegistro.value = false
  }
}

function onFotoChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    mostrarError('Solo se admiten imágenes')
    event.target.value = ''
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    mostrarError('La foto supera el tamaño máximo (8 MB)')
    event.target.value = ''
    return
  }
  incidenciaForm.value.foto_file = file
  const reader = new FileReader()
  reader.onload = (e) => {
    incidenciaForm.value.foto_preview = e.target.result
  }
  reader.readAsDataURL(file)
}

function quitarFoto() {
  incidenciaForm.value.foto_file = null
  incidenciaForm.value.foto_preview = null
}

async function guardarIncidencia() {
  if (!maquinaSeleccionada.value) return
  if (!incidenciaForm.value.reportado_por.trim()) return
  if (!incidenciaForm.value.fecha_reporte) return
  if (!incidenciaForm.value.descripcion.trim()) return
  guardandoIncidencia.value = true
  errorMsg.value = ''
  try {
    let fotoPath = null
    if (incidenciaForm.value.foto_file) {
      const file = incidenciaForm.value.foto_file
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `private/${maquinaSeleccionada.value.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('incidencias-fotos')
        .upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) throw upErr
      fotoPath = path
    }
    const payload = {
      maquina_id: maquinaSeleccionada.value.id,
      reportado_por: incidenciaForm.value.reportado_por.trim(),
      fecha_reporte: incidenciaForm.value.fecha_reporte,
      descripcion: incidenciaForm.value.descripcion.trim(),
      foto_url: fotoPath,
      created_by: auth.user?.id || null,
      updated_by: auth.user?.id || null,
    }
    const { data, error } = await supabase
      .from('incidencias_maquinaria')
      .insert(payload)
      .select('id')
      .single()
    if (error) throw error

    try {
      let fotoUrl = ''
      let fotoAlt = 'Sin foto adjunta'
      if (fotoPath) {
        const { data: signed } = await supabase.storage
          .from('incidencias-fotos')
          .createSignedUrl(fotoPath, 60 * 60 * 24)
        if (signed?.signedUrl) {
          fotoUrl = signed.signedUrl
          fotoAlt = 'Foto de la incidencia'
        } else {
          fotoAlt = 'Foto adjunta — abrir en la app'
        }
      }
      await notificarIncidencia({
        incidencia_id: data.id,
        maquina_titulo: nombreMaquina(maquinaSeleccionada.value),
        maquina_proveedor: maquinaSeleccionada.value.proveedor || '—',
        maquina_modelo: maquinaSeleccionada.value.modelo || '—',
        reportado_por: incidenciaForm.value.reportado_por.trim(),
        fecha_reporte: new Date(incidenciaForm.value.fecha_reporte + 'T00:00:00').toLocaleDateString('es-ES'),
        descripcion: incidenciaForm.value.descripcion.trim(),
        foto_url: fotoUrl,
        foto_alt: fotoAlt,
      })
    } catch (emailErr) {
      console.error('Notificación email falló (incidencia ya guardada):', {
        status: emailErr?.status,
        text: emailErr?.text,
        raw: emailErr,
      })
    }

    mostrarExito(`Incidencia #${data.id} registrada`)
    await volverALista()
  } catch (err) {
    mostrarError('No se pudo registrar la incidencia: ' + err.message)
  } finally {
    guardandoIncidencia.value = false
  }
}

async function guardarComentariosIncidencia() {
  if (!incidenciaSeleccionada.value) return
  guardandoEdicionIncidencia.value = true
  errorMsg.value = ''
  try {
    const comentariosLimpio = editIncidencia.value.comentarios.trim()
    const { error } = await supabase
      .from('incidencias_maquinaria')
      .update({
        comentarios: comentariosLimpio || null,
        updated_by: auth.user?.id || null,
      })
      .eq('id', incidenciaSeleccionada.value.id)
    if (error) throw error
    incidenciaSeleccionada.value.comentarios = comentariosLimpio || null
    mostrarExito('Comentario guardado')
  } catch (err) {
    mostrarError('No se pudo guardar el comentario: ' + err.message)
  } finally {
    guardandoEdicionIncidencia.value = false
  }
}

async function marcarIncidenciaResuelta() {
  if (!incidenciaSeleccionada.value) return
  const usuarioEmail = auth.user?.email || ''
  if (!usuarioEmail) {
    mostrarError('No se ha podido identificar el usuario autenticado')
    return
  }
  guardandoEdicionIncidencia.value = true
  errorMsg.value = ''
  try {
    const comentariosLimpio = editIncidencia.value.comentarios.trim()
    const ahora = new Date().toISOString()
    const { error } = await supabase
      .from('incidencias_maquinaria')
      .update({
        estado: 'resuelta',
        resuelta_at: ahora,
        resuelta_por: usuarioEmail,
        comentarios: comentariosLimpio || null,
        updated_by: auth.user?.id || null,
      })
      .eq('id', incidenciaSeleccionada.value.id)
    if (error) throw error
    mostrarExito(`Incidencia #${incidenciaSeleccionada.value.id} marcada como resuelta`)
    await cargarConteoIncidencias()
    await volverAIncidencias()
  } catch (err) {
    mostrarError('No se pudo resolver la incidencia: ' + err.message)
  } finally {
    guardandoEdicionIncidencia.value = false
  }
}

async function reabrirIncidencia() {
  if (!incidenciaSeleccionada.value) return
  guardandoEdicionIncidencia.value = true
  errorMsg.value = ''
  try {
    const { error } = await supabase
      .from('incidencias_maquinaria')
      .update({
        estado: 'abierta',
        resuelta_at: null,
        resuelta_por: null,
        updated_by: auth.user?.id || null,
      })
      .eq('id', incidenciaSeleccionada.value.id)
    if (error) throw error
    incidenciaSeleccionada.value.estado = 'abierta'
    incidenciaSeleccionada.value.resuelta_at = null
    incidenciaSeleccionada.value.resuelta_por = null
    editIncidencia.value.resuelta_por = auth.user?.email || ''
    mostrarExito('Incidencia reabierta')
    await cargarConteoIncidencias()
  } catch (err) {
    mostrarError('No se pudo reabrir la incidencia: ' + err.message)
  } finally {
    guardandoEdicionIncidencia.value = false
  }
}

function nombreSugerido() {
  const email = auth.user?.email || ''
  return email ? email.split('@')[0] : ''
}

function operarioSugerido() {
  const sugerido = nombreSugerido().toLowerCase().trim()
  if (!sugerido) return ''
  const match = operarios.value.find(op => {
    const nombre = (op.nombre || '').toLowerCase()
    return nombre === sugerido || nombre.includes(sugerido) || sugerido.includes(nombre)
  })
  return match ? match.nombre : ''
}

function mostrarExito(msg) {
  successMsg.value = msg
  setTimeout(() => { successMsg.value = '' }, 4000)
}

function mostrarError(msg) {
  errorMsg.value = msg
  setTimeout(() => { errorMsg.value = '' }, 8000)
}

function formatFecha(f) {
  if (!f) return null
  const d = new Date(f)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatFechaHora(f) {
  if (!f) return null
  const d = new Date(f)
  if (isNaN(d.getTime())) return null
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function textoFrecuencia(dias) {
  if (dias == null) return ''
  return `cada ${dias} día${dias === 1 ? '' : 's'}`
}
</script>

<template>
  <div class="space-y-8">
    <PageHeader
      v-if="vistaActiva === 'lista'"
      caption="Mantenimiento"
      :caption-icon="Wrench"
      theme="amber"
      title="Preventivos maquinaria"
      :subtitle="`${maquinas.length} máquinas activas`"
    >
      <template #actions>
        <div class="flex flex-col items-center">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Tareas vencidas</p>
          <svg
            v-if="totalTareas > 0"
            viewBox="0 0 36 36"
            class="w-20 h-20"
            :aria-label="`${totalVencidas} de ${totalTareas} tareas vencidas`"
          >
            <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" stroke-width="5" />
            <circle
              v-if="totalVencidas > 0"
              cx="18" cy="18" r="14"
              fill="none"
              stroke="#ef4444"
              stroke-width="5"
              :stroke-dasharray="`${porcentajeVencidas.toFixed(2)} 100`"
              pathLength="100"
              transform="rotate(-90 18 18)"
              stroke-linecap="butt"
            />
            <text
              x="18" y="18"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="11"
              font-weight="700"
              :fill="totalVencidas > 0 ? '#dc2626' : '#059669'"
            >{{ totalVencidas }}</text>
          </svg>
          <div v-else class="w-20 h-20 flex items-center justify-center">
            <span class="text-2xl font-bold text-slate-300">—</span>
          </div>
        </div>
        <div class="flex flex-col items-center">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Máquinas afectadas</p>
          <svg
            v-if="maquinas.length > 0"
            viewBox="0 0 36 36"
            class="w-20 h-20"
            :aria-label="`${maquinasConVencidas} de ${maquinas.length} máquinas afectadas`"
          >
            <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" stroke-width="5" />
            <circle
              v-if="maquinasConVencidas > 0"
              cx="18" cy="18" r="14"
              fill="none"
              stroke="#ef4444"
              stroke-width="5"
              :stroke-dasharray="`${porcentajeMaquinasAfectadas.toFixed(2)} 100`"
              pathLength="100"
              transform="rotate(-90 18 18)"
              stroke-linecap="butt"
            />
            <text
              x="18" y="18"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="11"
              font-weight="700"
              :fill="maquinasConVencidas > 0 ? '#dc2626' : '#059669'"
            >{{ maquinasConVencidas }}</text>
          </svg>
          <div v-else class="w-20 h-20 flex items-center justify-center">
            <span class="text-2xl font-bold text-slate-300">—</span>
          </div>
        </div>
        <Button variant="secondary" @click="abrirIncidencias">
          <Inbox class="w-4 h-4" />
          Incidencias
          <span
            v-if="conteoIncidenciasAbiertas > 0"
            class="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] font-bold"
          >
            {{ conteoIncidenciasAbiertas }}
          </span>
        </Button>
        <Button variant="secondary" @click="cargarListado">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loadingListado }" />
          Recargar
        </Button>
      </template>
    </PageHeader>

    <PageHeader
      v-else-if="vistaActiva === 'tareas' && maquinaSeleccionada"
      caption="Mantenimiento · Tareas preventivas"
      :caption-icon="Wrench"
      theme="amber"
      :title="nombreMaquina(maquinaSeleccionada)"
      show-back
      @back="volverAtras"
    >
      <template #meta>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-xs font-medium text-slate-500">
          <span v-if="maquinaSeleccionada.matricula">Matrícula: <span class="text-slate-700">{{ maquinaSeleccionada.matricula }}</span></span>
          <span v-if="maquinaSeleccionada.n_serie">Nº serie: <span class="text-slate-700">{{ maquinaSeleccionada.n_serie }}</span></span>
          <span v-if="maquinaSeleccionada.modelo">Modelo: <span class="text-slate-700">{{ maquinaSeleccionada.modelo }}</span></span>
          <span v-if="maquinaSeleccionada.proveedor">Proveedor: <span class="text-slate-700">{{ maquinaSeleccionada.proveedor }}</span></span>
        </div>
      </template>
      <template #actions>
        <div class="text-right">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vencidas</p>
          <p class="text-2xl font-bold tracking-tight" :class="tareasVencidasMaquina > 0 ? 'text-red-600' : 'text-emerald-600'">
            {{ tareasVencidasMaquina }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Al día</p>
          <p class="text-2xl font-bold tracking-tight text-emerald-600">{{ tareasOkMaquina }}</p>
        </div>
      </template>
    </PageHeader>

    <PageHeader
      v-else-if="vistaActiva === 'registrar-tarea' && tareaSeleccionada"
      caption="Mantenimiento · Registrar tarea"
      :caption-icon="Wrench"
      theme="amber"
      :title="tareaSeleccionada.tarea_nombre"
      :subtitle="`${nombreMaquina(maquinaSeleccionada)} · ${textoFrecuencia(tareaSeleccionada.frecuencia_dias)}`"
      show-back
      @back="volverAtras"
    />

    <PageHeader
      v-else-if="vistaActiva === 'incidencia' && maquinaSeleccionada"
      caption="Mantenimiento · Registrar incidencia"
      :caption-icon="ShieldAlert"
      theme="amber"
      :title="nombreMaquina(maquinaSeleccionada)"
      subtitle="Reportar nueva incidencia sobre esta máquina"
      show-back
      @back="volverAtras"
    />

    <PageHeader
      v-else-if="vistaActiva === 'incidencias-lista'"
      caption="Mantenimiento · Incidencias Toyota"
      :caption-icon="Inbox"
      theme="amber"
      title="Incidencias"
      :subtitle="`${incidencias.length} ${filtroEstadoIncidencias === 'abierta' ? 'abierta(s)' : filtroEstadoIncidencias === 'resuelta' ? 'resuelta(s)' : 'en total'}`"
      show-back
      @back="volverAtras"
    >
      <template #actions>
        <Button variant="secondary" @click="cargarIncidencias">
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loadingIncidencias }" />
          Recargar
        </Button>
      </template>
    </PageHeader>

    <PageHeader
      v-else-if="vistaActiva === 'incidencia-detalle' && incidenciaSeleccionada"
      caption="Mantenimiento · Incidencia"
      :caption-icon="ShieldAlert"
      theme="amber"
      :title="`Incidencia #${incidenciaSeleccionada.id}`"
      :subtitle="incidenciaSeleccionada.maquina ? nombreMaquina(incidenciaSeleccionada.maquina) : 'Máquina no encontrada'"
      show-back
      @back="volverAtras"
    />

    <div v-if="errorMsg" class="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
      <AlertTriangle class="w-4 h-4 shrink-0" />
      <span class="flex-1">{{ errorMsg }}</span>
      <button @click="errorMsg = ''" class="text-red-500 hover:text-red-700"><X class="w-4 h-4" /></button>
    </div>
    <div v-if="successMsg" class="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-2">
      <CheckCircle2 class="w-4 h-4 shrink-0" />
      <span>{{ successMsg }}</span>
    </div>

    <div v-if="vistaActiva === 'lista'" class="space-y-6">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <Search class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            v-model="filtroBusqueda"
            type="text"
            placeholder="Buscar por matrícula, nº serie, modelo..."
            class="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
          />
        </div>
        <div class="relative">
          <Filter class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            v-model="filtroTipo"
            class="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all min-w-[200px]"
          >
            <option value="todos">Todos los tipos</option>
            <option v-for="t in tipos" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
      </div>

      <div v-if="loadingListado && maquinas.length === 0" class="text-center py-16 text-sm font-medium text-slate-400">
        Cargando máquinas...
      </div>
      <Card v-else-if="maquinasFiltradas.length === 0" padding="lg">
        <div class="text-center py-10">
          <Truck class="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p class="text-sm font-medium text-slate-500">Sin resultados con los filtros actuales</p>
        </div>
      </Card>

      <Card v-else flush>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="m in maquinasFiltradas"
            :key="m.id"
            class="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors"
          >
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-slate-900 truncate">
                {{ nombreMaquina(m) }}<span v-if="m.accionamiento" class="ml-2 font-medium text-slate-400">{{ m.accionamiento }}</span>
              </h3>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-0.5 mt-1 text-xs font-medium text-slate-500">
                <span v-if="m.matricula && m.n_serie">{{ m.matricula }}</span>
                <span v-if="m.modelo">{{ m.modelo }}</span>
                <span v-if="m.proveedor">{{ m.proveedor }}</span>
              </div>
            </div>

            <button
              @click="abrirDetalleTareas(m)"
              :class="[
                'shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors',
                (vencidasPorMaquina[m.id] || 0) > 0
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              ]"
            >
              <AlertTriangle v-if="(vencidasPorMaquina[m.id] || 0) > 0" class="w-4 h-4" />
              <CheckCircle2 v-else class="w-4 h-4" />
              <span v-if="(vencidasPorMaquina[m.id] || 0) > 0">
                {{ vencidasPorMaquina[m.id] }} vencida{{ vencidasPorMaquina[m.id] === 1 ? '' : 's' }}
              </span>
              <span v-else>Al día</span>
            </button>

            <Button
              @click="abrirRegistrarIncidencia(m)"
              :title="esToyota(m) ? 'Reportar incidencia interna' : 'Abrir Fracttal en pestaña nueva'"
            >
              <ShieldAlert v-if="esToyota(m)" class="w-4 h-4" />
              <ExternalLink v-else class="w-4 h-4" />
              {{ esToyota(m) ? 'Incidencia' : 'Fracttal' }}
            </Button>
          </li>
        </ul>
      </Card>
    </div>

    <Card v-else-if="vistaActiva === 'tareas' && maquinaSeleccionada" flush>
      <div v-if="loadingEstado" class="text-center py-16 text-sm font-medium text-slate-400">Cargando tareas...</div>
      <div v-else-if="estadoTareas.length === 0" class="text-center py-16 text-sm font-medium text-slate-400">
        Esta máquina no tiene tareas preventivas asociadas a su familia
      </div>
      <ul v-else class="divide-y divide-slate-100">
        <li v-for="t in estadoTareas" :key="t.tarea_id">
          <button
            @click="abrirRegistrarTarea(t)"
            :class="[
              'w-full flex items-center gap-4 px-6 py-4 text-left transition-colors',
              t.vencida ? 'hover:bg-red-50/50' : 'hover:bg-slate-50/60'
            ]"
          >
            <div
              class="shrink-0 w-1 h-12 rounded-full"
              :class="t.vencida ? 'bg-red-500' : 'bg-emerald-500'"
            ></div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <AlertTriangle v-if="t.vencida" class="w-4 h-4 text-red-600 shrink-0" />
                <span
                  class="font-semibold text-sm truncate"
                  :class="t.vencida ? 'text-red-700' : 'text-slate-900'"
                >
                  {{ t.tarea_nombre }}
                </span>
                <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
                  {{ textoFrecuencia(t.frecuencia_dias) }}
                </span>
              </div>
              <p v-if="t.tarea_descripcion" class="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">
                {{ t.tarea_descripcion }}
              </p>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-0.5 mt-1.5 text-xs font-medium">
                <span class="inline-flex items-center gap-1 text-slate-500">
                  <Clock class="w-3 h-3" />
                  Última:
                  <span :class="t.ultima_fecha ? 'text-slate-700' : 'text-slate-400 italic'">
                    {{ formatFecha(t.ultima_fecha) || 'nunca' }}
                  </span>
                </span>
                <span class="inline-flex items-center gap-1 text-slate-500">
                  <Calendar class="w-3 h-3" />
                  Próxima:
                  <span :class="!t.siguiente_fecha ? 'text-slate-400 italic' : (t.vencida ? 'text-red-700' : 'text-slate-700')">
                    {{ formatFecha(t.siguiente_fecha) || 'pendiente' }}
                  </span>
                </span>
              </div>
            </div>

            <div class="shrink-0 flex items-center gap-3">
              <Badge v-if="t.vencida" variant="danger" size="lg">
                <AlertTriangle class="w-3 h-3" />
                Vencida
              </Badge>
              <ChevronRight class="w-5 h-5 text-slate-300" />
            </div>
          </button>
        </li>
      </ul>
    </Card>

    <Card v-else-if="vistaActiva === 'registrar-tarea' && maquinaSeleccionada && tareaSeleccionada" padding="lg" class="max-w-2xl">
      <div class="space-y-5">
        <div v-if="tareaSeleccionada.tarea_descripcion" class="text-sm font-medium text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3">
          {{ tareaSeleccionada.tarea_descripcion }}
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Fecha realizada</label>
            <input
              v-model="registroForm.fecha_realizada"
              type="date"
              class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
            />
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Realizado por <span class="text-red-500">*</span>
            </label>
            <div class="flex gap-2">
              <select
                v-model="registroForm.realizado_por"
                required
                class="flex-1 min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
              >
                <option value="" disabled>Selecciona un operario...</option>
                <option v-for="op in operarios" :key="op.id" :value="op.nombre">{{ op.nombre }}</option>
              </select>
              <button
                type="button"
                @click="mostrarFormularioOperario = !mostrarFormularioOperario"
                class="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors"
                :title="mostrarFormularioOperario ? 'Cancelar' : 'Añadir nuevo operario'"
              >
                <X v-if="mostrarFormularioOperario" class="w-4 h-4" />
                <Plus v-else class="w-4 h-4" />
              </button>
            </div>
            <div v-if="mostrarFormularioOperario" class="mt-2 space-y-3">
              <div class="flex gap-2">
                <input
                  v-model="nuevoOperario"
                  type="text"
                  placeholder="Nombre completo del nuevo operario"
                  @keydown.enter.prevent="anadirOperario"
                  class="flex-1 min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
                />
                <button
                  type="button"
                  @click="anadirOperario"
                  :disabled="!nuevoOperario.trim() || guardandoOperario"
                  :class="[
                    'shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                    !nuevoOperario.trim() || guardandoOperario
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  ]"
                >
                  <Check class="w-4 h-4" />
                  Añadir
                </button>
              </div>
              <div v-if="puedeGestionarOperarios && operarios.length > 0" class="border-t border-slate-100 pt-3">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Operarios actuales</p>
                <ul class="space-y-1 max-h-48 overflow-y-auto pr-1">
                  <li
                    v-for="op in operarios"
                    :key="op.id"
                    class="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-100"
                  >
                    <span class="text-sm font-medium text-slate-700 truncate">{{ op.nombre }}</span>
                    <button
                      type="button"
                      @click="quitarOperario(op)"
                      :disabled="quitandoOperarioId === op.id"
                      :class="[
                        'shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors',
                        quitandoOperarioId === op.id
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                      ]"
                      :title="`Quitar a ${op.nombre}`"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 justify-end pt-4 border-t border-slate-100">
          <Button variant="ghost" @click="volverATareas">Cancelar</Button>
          <Button
            :disabled="guardandoRegistro || !registroForm.realizado_por.trim() || !registroForm.fecha_realizada"
            :loading="guardandoRegistro"
            @click="guardarRegistro"
          >
            {{ guardandoRegistro ? 'Guardando...' : 'Guardar registro' }}
          </Button>
        </div>
      </div>
    </Card>

    <Card v-else-if="vistaActiva === 'incidencia' && maquinaSeleccionada" padding="lg" class="max-w-2xl">
      <div class="space-y-5">
        <div class="space-y-4">
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Reportado por <span class="text-red-500">*</span>
            </label>
            <div class="flex gap-2">
              <select
                v-model="incidenciaForm.reportado_por"
                required
                class="flex-1 min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
              >
                <option value="" disabled>Selecciona un operario...</option>
                <option v-for="op in operarios" :key="op.id" :value="op.nombre">{{ op.nombre }}</option>
              </select>
              <button
                type="button"
                @click="mostrarFormularioOperario = !mostrarFormularioOperario"
                class="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors"
                :title="mostrarFormularioOperario ? 'Cancelar' : 'Añadir nuevo operario'"
              >
                <X v-if="mostrarFormularioOperario" class="w-4 h-4" />
                <Plus v-else class="w-4 h-4" />
              </button>
            </div>
            <div v-if="mostrarFormularioOperario" class="mt-2 space-y-3">
              <div class="flex gap-2">
                <input
                  v-model="nuevoOperario"
                  type="text"
                  placeholder="Nombre completo del nuevo operario"
                  @keydown.enter.prevent="anadirOperario"
                  class="flex-1 min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
                />
                <button
                  type="button"
                  @click="anadirOperario"
                  :disabled="!nuevoOperario.trim() || guardandoOperario"
                  :class="[
                    'shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors',
                    !nuevoOperario.trim() || guardandoOperario
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  ]"
                >
                  <Check class="w-4 h-4" />
                  Añadir
                </button>
              </div>
              <div v-if="puedeGestionarOperarios && operarios.length > 0" class="border-t border-slate-100 pt-3">
                <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Operarios actuales</p>
                <ul class="space-y-1 max-h-48 overflow-y-auto pr-1">
                  <li
                    v-for="op in operarios"
                    :key="op.id"
                    class="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-100"
                  >
                    <span class="text-sm font-medium text-slate-700 truncate">{{ op.nombre }}</span>
                    <button
                      type="button"
                      @click="quitarOperario(op)"
                      :disabled="quitandoOperarioId === op.id"
                      :class="[
                        'shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors',
                        quitandoOperarioId === op.id
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                      ]"
                      :title="`Quitar a ${op.nombre}`"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Fecha de reporte</label>
            <input
              v-model="incidenciaForm.fecha_reporte"
              type="date"
              class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
            />
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Descripción <span class="text-red-500">*</span>
            </label>
            <textarea
              v-model="incidenciaForm.descripcion"
              rows="5"
              placeholder="Describe la incidencia, síntomas, ubicación..."
              required
              class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all resize-none"
            ></textarea>
          </div>
          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Foto (opcional)</label>
            <div v-if="!incidenciaForm.foto_preview" class="border-2 border-dashed border-slate-200 rounded-lg px-4 py-8 text-center bg-slate-50/50">
              <Camera class="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <input
                id="foto-incidencia-input"
                type="file"
                accept="image/*"
                capture="environment"
                @change="onFotoChange"
                class="hidden"
              />
              <label
                for="foto-incidencia-input"
                class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs text-slate-700 bg-white border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
              >
                <Camera class="w-3.5 h-3.5" />
                Tomar / subir foto
              </label>
              <p class="text-[11px] text-slate-400 font-medium mt-2">JPG/PNG · máx. 8 MB</p>
            </div>
            <div v-else class="relative">
              <img :src="incidenciaForm.foto_preview" alt="Vista previa" class="w-full max-h-72 object-cover rounded-lg border border-slate-200" />
              <button
                @click="quitarFoto"
                class="absolute top-2 right-2 p-1.5 rounded-full bg-white/95 text-slate-700 hover:bg-white shadow-sm"
                title="Quitar foto"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 justify-end pt-4 border-t border-slate-100">
          <Button variant="ghost" @click="volverALista">Cancelar</Button>
          <Button
            :disabled="guardandoIncidencia || !incidenciaForm.reportado_por.trim() || !incidenciaForm.fecha_reporte || !incidenciaForm.descripcion.trim()"
            :loading="guardandoIncidencia"
            @click="guardarIncidencia"
          >
            {{ guardandoIncidencia ? 'Guardando...' : 'Reportar incidencia' }}
          </Button>
        </div>
      </div>
    </Card>

    <div v-else-if="vistaActiva === 'incidencias-lista'" class="space-y-6">
      <div class="flex items-center gap-2">
        <button
          @click="cambiarFiltroIncidencias('abierta')"
          :class="[
            'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors',
            filtroEstadoIncidencias === 'abierta'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
          ]"
        >
          <AlertTriangle class="w-4 h-4" />
          Abiertas
        </button>
        <button
          @click="cambiarFiltroIncidencias('resuelta')"
          :class="[
            'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors',
            filtroEstadoIncidencias === 'resuelta'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
          ]"
        >
          <CheckCheck class="w-4 h-4" />
          Resueltas
        </button>
        <button
          @click="cambiarFiltroIncidencias('todas')"
          :class="[
            'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors',
            filtroEstadoIncidencias === 'todas'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
          ]"
        >
          Todas
        </button>
      </div>

      <div v-if="loadingIncidencias && incidencias.length === 0" class="text-center py-16 text-sm font-medium text-slate-400">
        Cargando incidencias...
      </div>
      <Card v-else-if="incidencias.length === 0" padding="lg">
        <div class="text-center py-10">
          <ShieldAlert class="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p class="text-sm font-medium text-slate-500">
            No hay incidencias {{ filtroEstadoIncidencias === 'abierta' ? 'abiertas' : filtroEstadoIncidencias === 'resuelta' ? 'resueltas' : '' }}
          </p>
        </div>
      </Card>
      <Card v-else flush>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="inc in incidencias"
            :key="inc.id"
            class="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 cursor-pointer transition-colors"
            @click="abrirDetalleIncidencia(inc)"
          >
            <div
              class="shrink-0 w-1 h-12 rounded-full"
              :class="inc.estado === 'resuelta' ? 'bg-emerald-500' : 'bg-amber-500'"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-bold text-slate-900">#{{ inc.id }}</span>
                <span class="text-sm font-semibold text-slate-700 truncate">
                  {{ inc.maquina ? nombreMaquina(inc.maquina) : 'Máquina no encontrada' }}
                </span>
              </div>
              <p class="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">{{ inc.descripcion }}</p>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs font-medium text-slate-500">
                <span>Reportada por <span class="text-slate-700">{{ inc.reportado_por }}</span></span>
                <span>{{ formatFecha(inc.fecha_reporte) }}</span>
                <span v-if="inc.comentarios" class="inline-flex items-center gap-1 text-slate-700">
                  <MessageSquare class="w-3 h-3" />
                  Con comentarios
                </span>
              </div>
            </div>
            <Badge :variant="inc.estado === 'resuelta' ? 'success' : 'warning'" size="lg">
              {{ inc.estado === 'resuelta' ? 'Resuelta' : 'Abierta' }}
            </Badge>
            <ChevronRight class="w-5 h-5 text-slate-300" />
          </li>
        </ul>
      </Card>
    </div>

    <Card v-else-if="vistaActiva === 'incidencia-detalle' && incidenciaSeleccionada" padding="lg" class="max-w-2xl">
      <div class="space-y-5">
        <div class="bg-slate-50 border border-slate-100 rounded-lg p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Reporte original</p>
            <Badge :variant="incidenciaSeleccionada.estado === 'resuelta' ? 'success' : 'warning'" size="md">
              {{ incidenciaSeleccionada.estado === 'resuelta' ? 'Resuelta' : 'Abierta' }}
            </Badge>
          </div>
          <div class="text-sm font-medium text-slate-700">
            <span class="text-slate-500">Reportada por:</span>
            <span class="text-slate-900 font-semibold ml-1">{{ incidenciaSeleccionada.reportado_por }}</span>
            <span class="text-slate-500 ml-3">Fecha:</span>
            <span class="text-slate-900 font-semibold ml-1">{{ formatFecha(incidenciaSeleccionada.fecha_reporte) }}</span>
          </div>
          <p class="text-sm text-slate-800 whitespace-pre-wrap">{{ incidenciaSeleccionada.descripcion }}</p>
          <div v-if="incidenciaSeleccionada.foto_url">
            <img
              v-if="incidenciaFotoUrl"
              :src="incidenciaFotoUrl"
              alt="Foto de la incidencia"
              class="w-full max-h-72 object-cover rounded-lg border border-slate-200"
            />
            <div v-else class="text-xs font-medium text-slate-400 italic">Cargando foto...</div>
          </div>
        </div>

        <div
          v-if="incidenciaSeleccionada.estado === 'resuelta'"
          class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-1"
        >
          <div class="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
            <CheckCheck class="w-4 h-4" />
            Resuelta
          </div>
          <div class="text-sm font-medium text-emerald-800">
            Por <span class="font-bold">{{ incidenciaSeleccionada.resuelta_por }}</span>
            · {{ formatFechaHora(incidenciaSeleccionada.resuelta_at) }}
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            <MessageSquare class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Comentarios / seguimiento
          </label>
          <textarea
            v-model="editIncidencia.comentarios"
            :readonly="incidenciaSeleccionada.estado === 'resuelta'"
            rows="5"
            placeholder="Notas sobre la intervención: si vino el técnico, qué hizo, qué queda pendiente..."
            :class="[
              'w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all resize-none',
              incidenciaSeleccionada.estado === 'resuelta' ? 'bg-slate-50 cursor-default' : 'bg-white'
            ]"
          ></textarea>
          <p class="text-[11px] text-slate-400 font-medium mt-1">
            Los comentarios se sobreescriben con cada cambio (no se guarda historial).
          </p>
        </div>

        <div v-if="incidenciaSeleccionada.estado === 'abierta'" class="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 text-sm font-medium text-slate-600">
          Al marcar como resuelta se registrará por:
          <span class="text-slate-900 font-semibold ml-1">{{ auth.user?.email || '—' }}</span>
        </div>

        <div class="flex flex-wrap items-center gap-2 justify-end pt-4 border-t border-slate-100">
          <Button variant="ghost" @click="volverAIncidencias">Cancelar</Button>
          <template v-if="incidenciaSeleccionada.estado === 'abierta'">
            <Button
              variant="secondary"
              :disabled="guardandoEdicionIncidencia"
              :loading="guardandoEdicionIncidencia"
              @click="guardarComentariosIncidencia"
            >
              <MessageSquare class="w-4 h-4" />
              Guardar comentario
            </Button>
            <Button
              :disabled="guardandoEdicionIncidencia || !auth.user?.email"
              :loading="guardandoEdicionIncidencia"
              @click="marcarIncidenciaResuelta"
            >
              <CheckCheck class="w-4 h-4" />
              Marcar como resuelta
            </Button>
          </template>
          <Button
            v-else
            variant="secondary"
            :disabled="guardandoEdicionIncidencia"
            :loading="guardandoEdicionIncidencia"
            @click="reabrirIncidencia"
          >
            <RotateCcw class="w-4 h-4" />
            Reabrir
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>
