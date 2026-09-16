<script setup>
// Registro Higiénico Sanitario de la sala Muelles y Cámaras, replicado desde
// CMI Operaciones (src/components/higienico/HigienicoSanitarioManager.vue)
// para que se pueda rellenar sin salir de LogisPro.
//
// La configuración (salas, objetos, zonas, plano) sigue viviendo SOLO en
// CMI — aquí no hay copia ni caché: cada carga pide los datos en vivo a
// través de la función serverless `hs-muelles-camaras`, que es la única
// forma de escribir en las tablas hs_* de CMI desde aquí (esas tablas
// exigen un usuario autenticado del PROPIO proyecto de CMI vía RLS, y
// LogisPro autentica a sus usuarios contra su propio proyecto — de ahí el
// proxy con la service_role key, que vive solo en Netlify).
//
// Un registro por día, en dos momentos: al empezar la actividad y al
// acabarla. Al iniciarlo se crea una fila por cada objeto/zona activo, de
// forma que el parte queda congelado con lo que había ese día.

import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { ShieldCheck, CheckCircle2, XCircle } from 'lucide-vue-next'
import PageHeader from './ui/PageHeader.vue'

const auth = useAuthStore()

const N8N_WEBHOOK = import.meta.env.VITE_N8N_HS_WEBHOOK || ''
const enviando = ref(false)

const toast = ref(null)
const toastType = ref('success')
function showToast(message, type = 'success') {
  toast.value = message
  toastType.value = type
  setTimeout(() => { toast.value = null }, 3500)
}
const success = (msg) => showToast(msg, 'success')
const toastError = (msg) => showToast(msg, 'error')

async function confirmar(msg) {
  return window.confirm(msg)
}

async function llamar(action, payload = {}) {
  const res = await fetch('/.netlify/functions/hs-muelles-camaras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  let data = null
  try { data = await res.json() } catch { /* respuesta sin cuerpo JSON */ }
  if (!res.ok) throw new Error(data?.error || 'Error de conexión con CMI')
  return data
}

const sala     = ref(null)
const objetos  = ref([])
const registro = ref(null)
const filas    = ref([])          // hs_registro_objetos del registro de hoy
// Zonas de temperatura de la sala, con su fila en el parte. Muelles y
// Cámaras tiene varias zonas con rangos distintos, así que se comprueba una
// línea por zona, al inicio y al final.
const zonas     = ref([])         // hs_zonas activas de la sala
const filasZona = ref([])         // hs_registro_zonas del registro de hoy
const cargando = ref(true)
const quienInicia   = ref('')
const quienFinaliza = ref('')

// Notas con hora sobre un objeto contado (p.ej. "se ha roto 1" a media
// jornada): no tocan el recuento de inicio ni de fin, que son la foto de esos
// dos momentos. Solo aplican a los que se cuentan, no a los del plano.
const notasPorFila = ref({})      // registro_objeto_id -> [hs_registro_objeto_notas]
const notaAbierta  = ref(new Set())
const notaTexto    = ref({})

// Historial de gafas: el número cambia varias veces al día (entra/sale
// gente), y hace falta ver la secuencia, no solo el último valor.
const gafasLog = ref([])          // [hs_registro_gafas_log], en orden

const hoy = new Date()
const fechaHoy = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000)
  .toISOString().slice(0, 10)

const abierto   = computed(() => !!registro.value && !registro.value.finalizado_en)
const cerrado   = computed(() => !!registro.value?.finalizado_en)
const porNombre = (a, b) =>
  String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base', numeric: true })

const enPlano   = computed(() => objetos.value.filter(o => o.ubicacion_fija).sort(porNombre))
const contados  = computed(() => objetos.value.filter(o => !o.ubicacion_fija).sort(porNombre))

// El inicio se da por hecho a mano, con un botón. El parte de inicio es la
// foto de cómo estaba la sala al empezar, y hasta el cierre se podía
// reescribir entera.
const inicioCerrado = computed(() => !!registro.value?.inicio_cerrado_en)

// Nada del cierre aparece hasta que consta quién lo firma.
const modoFin = computed(() =>
  cerrado.value || (inicioCerrado.value && quienFinaliza.value.trim().length > 0))

// Un parte solo se puede abrir si la sala tiene una configuración publicada
// en CMI: la versión se congela al abrirlo.
const salaPublicada = computed(() => (sala.value?.version ?? 0) > 0)
const parteConVersion = computed(() => (registro.value?.version_config ?? 0) > 0)

// El recuento se hace a toques, no tecleando.
const CANTIDADES = [0, 1, 2, 3]

const inicioBloqueado = computed(() => cerrado.value || inicioCerrado.value)

function claseOk(sel, bloq) {
  if (sel) return bloq ? 'bg-green-100 text-green-700 border-green-200'
                       : 'bg-green-600 text-white border-green-600'
  return bloq ? 'bg-white text-slate-200 border-slate-100'
              : 'bg-white text-slate-400 border-slate-300 hover:border-green-500 hover:text-green-600'
}
function claseNo(sel, bloq) {
  if (sel) return bloq ? 'bg-red-100 text-red-700 border-red-200'
                       : 'bg-red-600 text-white border-red-600'
  return bloq ? 'bg-white text-slate-200 border-slate-100'
              : 'bg-white text-slate-400 border-slate-300 hover:border-red-500 hover:text-red-600'
}
function claseNum(sel, bloq) {
  if (sel) return bloq ? 'bg-slate-200 text-slate-600 border-slate-200'
                       : 'bg-slate-900 text-white border-slate-900'
  return bloq ? 'bg-white text-slate-200 border-slate-100'
              : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
}

// Las gafas van aparte: ahí lo normal no es 1.
const GAFAS = [0, 1, 2, 3, 4, 5]
const libreGafas = ref(false)
const esLibreGafas = computed(() => libreGafas.value)

const libres = ref(new Set())
const claveLibre = (o, fase) => `${o.id}|${fase}`
const esLibre = (o, fase) => libres.value.has(claveLibre(o, fase))
function abrirLibre(o, fase) { libres.value.add(claveLibre(o, fase)) }
function cerrarLibre(o, fase) { libres.value.delete(claveLibre(o, fase)) }

function fueraDeBotones(o, fase) {
  const f = filaDe(o)
  const v = fase === 'inicio' ? f?.inicio_cantidad : f?.fin_cantidad
  return v != null && !CANTIDADES.includes(v)
}

const grados = (v) => Number(v).toLocaleString('es-ES')
function rangoDe(z) {
  if (!z || z.temp_min == null || z.temp_max == null) return null
  return `${grados(z.temp_min)} a ${grados(z.temp_max)} °C`
}

const filaZonaDe  = (z) => filasZona.value.find(f => f.zona_id === z.id) || null
const campoZona   = (fase) => fase === 'inicio' ? 'inicio_ok' : 'fin_ok'
const campoMotivoZona = (fase) => fase === 'inicio' ? 'inicio_motivo' : 'fin_motivo'
const marcaZona   = (z, fase) => filaZonaDe(z)?.[campoZona(fase)] ?? null
const motivoZona  = (z, fase) => filaZonaDe(z)?.[campoMotivoZona(fase)] || ''
const necesitaMotivoZona = (z, fase) => marcaZona(z, fase) === false

const zonasDelParte = computed(() => zonas.value.filter(z => filaZonaDe(z)))
const rangoSala = computed(() => {
  const s = sala.value
  if (!s || s.temp_min == null || s.temp_max == null) return null
  return `${grados(s.temp_min)} a ${grados(s.temp_max)} °C`
})

function filaDe(objeto) {
  return filas.value.find(f => f.objeto_id === objeto.id) || null
}

const esperadaDe = (objeto) => filaDe(objeto)?.cantidad_esperada ?? objeto.cantidad_esperada ?? null

function notasDe(objeto) {
  const f = filaDe(objeto)
  return f ? (notasPorFila.value[f.id] || []) : []
}
function notaEstaAbierta(objeto) { return notaAbierta.value.has(objeto.id) }
function abrirNota(objeto) { notaAbierta.value.add(objeto.id) }
function cerrarNota(objeto) { notaAbierta.value.delete(objeto.id); notaTexto.value[objeto.id] = '' }

async function guardarNota(objeto) {
  const f = filaDe(objeto)
  const texto = (notaTexto.value[objeto.id] || '').trim()
  if (!f || !texto || !registro.value) return
  try {
    const data = await llamar('guardarNota', { registro_id: registro.value.id, fila_id: f.id, nota: texto })
    if (!notasPorFila.value[f.id]) notasPorFila.value[f.id] = []
    notasPorFila.value[f.id].push(data.nota)
    cerrarNota(objeto)
  } catch (e) {
    toastError('No se pudo guardar la nota: ' + e.message)
  }
}

// Aviso por objeto. OJO: nunca dice cuál era la cantidad esperada — no se le
// enseña a quien cuenta, para no condicionar el recuento.
function avisoDe(objeto) {
  const f = filaDe(objeto)
  if (!f) return null
  if (objeto.ubicacion_fija) {
    if (f.inicio_ok === false) return { texto: 'Falla al inicio', fase: 'inicio' }
    if (f.fin_ok === false)    return { texto: 'Falla al final',  fase: 'fin' }
    return null
  }
  const ini = f.inicio_cantidad
  const fin = f.fin_cantidad
  const esperada = esperadaDe(objeto)
  if (ini != null && esperada != null && ini !== esperada) {
    return { texto: 'No cuadra con lo previsto', fase: 'inicio' }
  }
  if (ini != null && fin != null && fin !== ini) {
    const d = fin - ini
    const texto = d === 1 ? 'Sobra 1' : d === -1 ? 'Falta 1'
                : d > 0 ? `Sobran ${d}` : `Faltan ${-d}`
    return { texto, fase: 'fin' }
  }
  return null
}
const aviso = (objeto) => avisoDe(objeto)?.texto ?? null

// ---- No conformidades ------------------------------------------------------
const FASES = ['inicio', 'fin']

function necesitaMotivo(objeto, fase) {
  const f = filaDe(objeto)
  if (!f) return false
  if (objeto.ubicacion_fija) {
    return (fase === 'inicio' ? f.inicio_ok : f.fin_ok) === false
  }
  if (fase === 'inicio') {
    const esperada = esperadaDe(objeto)
    return f.inicio_cantidad != null && esperada != null
        && f.inicio_cantidad !== esperada
  }
  return f.fin_cantidad != null && f.inicio_cantidad != null
      && f.fin_cantidad !== f.inicio_cantidad
}
const campoMotivo = (fase) => fase === 'inicio' ? 'inicio_motivo' : 'fin_motivo'
const motivoDe = (objeto, fase) => filaDe(objeto)?.[campoMotivo(fase)] || ''

function avisoConMotivo(objeto) {
  const a = avisoDe(objeto)
  if (!a) return null
  const m = motivoDe(objeto, a.fase).trim()
  return m ? `${a.texto} - ${m}` : a.texto
}

const CONTROLES = [
  { campo: 'limpieza_ok', motivo: 'limpieza_motivo', fase: 'inicio', etiqueta: 'Sala limpia, sin suciedad ni restos' },
  { campo: 'ropa_ok',     motivo: 'ropa_motivo',     fase: 'inicio', etiqueta: 'Personal con uniforme limpio' },
]
const controlesInicio = CONTROLES.filter(c => c.fase === 'inicio')

const noConformidades = computed(() => {
  if (!registro.value) return []
  const lista = []
  for (const o of objetos.value) {
    const a = avisoConMotivo(o)
    if (a) lista.push(`${o.nombre}: ${a}`)
    for (const n of notasDe(o)) lista.push(`${o.nombre} (${fmtHora(n.anotado_en)}): ${n.nota}`)
  }
  for (const c of CONTROLES) {
    if (registro.value[c.campo] === false) {
      const m = (registro.value[c.motivo] || '').trim()
      lista.push(`${c.etiqueta} - ${c.fase === 'fin' ? 'al finalizar' : 'al inicio'}${m ? `: ${m}` : ''}`)
    }
  }
  for (const z of zonas.value) {
    for (const fase of FASES) {
      if (marcaZona(z, fase) !== false) continue
      const m = motivoZona(z, fase).trim()
      lista.push(`Temperatura ${z.nombre} - ${fase === 'fin' ? 'al finalizar' : 'al inicio'}${m ? `: ${m}` : ''}`)
    }
  }
  return lista
})

const hayAvisos = computed(() => noConformidades.value.length > 0)

function faltan(fase) {
  if (!registro.value) return []
  const lista = []
  for (const c of CONTROLES) {
    if (c.fase === fase && registro.value[c.campo] == null) lista.push(c.etiqueta)
  }
  for (const o of objetos.value) {
    const f = filaDe(o)
    const v = o.ubicacion_fija
      ? (fase === 'inicio' ? f?.inicio_ok : f?.fin_ok)
      : (fase === 'inicio' ? f?.inicio_cantidad : f?.fin_cantidad)
    if (v == null) lista.push(o.nombre)
  }
  for (const z of zonas.value) {
    if (marcaZona(z, fase) == null) lista.push(`Temperatura ${z.nombre}`)
  }
  if (fase === 'inicio' && !gafasLog.value.length) lista.push('Personas con gafas')
  return lista
}

function sinMotivo(fase) {
  if (!registro.value) return []
  const lista = []
  for (const c of CONTROLES) {
    if (c.fase === fase && registro.value[c.campo] === false
        && !(registro.value[c.motivo] || '').trim()) lista.push(c.etiqueta)
  }
  for (const o of objetos.value) {
    if (necesitaMotivo(o, fase) && !motivoDe(o, fase).trim()) lista.push(o.nombre)
  }
  for (const z of zonas.value) {
    if (necesitaMotivoZona(z, fase) && !motivoZona(z, fase).trim()) {
      lista.push(`Temperatura ${z.nombre}`)
    }
  }
  return lista
}

const faltanInicio    = computed(() => faltan('inicio'))
const sinMotivoInicio = computed(() => sinMotivo('inicio'))
const pendientes      = computed(() => faltan('inicio').length + faltan('fin').length)

function listar(a) {
  return a.length <= 3 ? a.join(', ') : `${a.slice(0, 3).join(', ')} y ${a.length - 3} más`
}

// ---- Carga -----------------------------------------------------------------

async function cargar() {
  objetos.value = []; registro.value = null; filas.value = []
  notasPorFila.value = {}; gafasLog.value = []; zonas.value = []; filasZona.value = []
  cargando.value = true
  try {
    const data = await llamar('cargarSala')
    sala.value = data.sala
    objetos.value = data.objetos
    zonas.value = data.zonas
    registro.value = data.registro
    filas.value = data.filas
    filasZona.value = data.filasZona
    gafasLog.value = data.gafasLog
    const map = {}
    for (const n of data.notas) {
      if (!map[n.registro_objeto_id]) map[n.registro_objeto_id] = []
      map[n.registro_objeto_id].push(n)
    }
    notasPorFila.value = map
    if (registro.value) await completarZonas()
  } catch (e) {
    toastError('No se pudo cargar el Higiénico Sanitario: ' + e.message)
  } finally {
    cargando.value = false
  }
}

// Las zonas llegaron después que los partes, así que un parte abierto antes
// puede no tener sus filas. Mientras el inicio siga sin guardar se crean las
// que falten.
async function completarZonas() {
  if (!registro.value || registro.value.inicio_cerrado_en) return
  try {
    const data = await llamar('completarZonas', { registro_id: registro.value.id })
    if (data.nuevas?.length) filasZona.value.push(...data.nuevas)
  } catch {
    // silencioso, como en CMI: no es una acción que inicie el usuario
  }
}

// ---- Abrir y cerrar el registro --------------------------------------------

async function iniciar() {
  const nombre = quienInicia.value.trim()
  if (!nombre) return
  if (!objetos.value.length) { toastError('Esta sala no tiene objetos configurados'); return }
  if (!salaPublicada.value) {
    toastError('Publica la configuración de la sala en Calidad antes de abrir el parte')
    return
  }
  try {
    const data = await llamar('iniciar', { nombre })
    registro.value = data.registro
    filas.value = data.filas
    filasZona.value = data.filasZona
    quienInicia.value = ''
    success('Registro iniciado')
  } catch (e) {
    toastError(e.message)
    await cargar()
  }
}

async function guardarInicio() {
  if (!registro.value || inicioCerrado.value) return

  const falta = faltanInicio.value
  if (falta.length) { toastError(`Falta por marcar: ${listar(falta)}`); return }
  const sin = sinMotivoInicio.value
  if (sin.length) { toastError(`Falta escribir el motivo de: ${listar(sin)}`); return }

  const ok = await confirmar(
    'Al guardar el inicio, lo marcado ya no se podrá cambiar. Durante el turno solo ' +
    'se podrán anotar las gafas y las no conformidades que salgan. ¿Guardar el inicio?')
  if (!ok) return

  try {
    const data = await llamar('guardarInicio', { registro_id: registro.value.id })
    registro.value.inicio_cerrado_en = data.inicio_cerrado_en
    success('Inicio guardado')
  } catch (e) {
    toastError(e.message)
  }
}

// El parte entero, listo para que n8n lo convierta en correo/PDF.
function partePara(envio) {
  const r = registro.value
  return {
    sala: sala.value?.nombre ?? null,
    plano_url: sala.value?.plano_url ?? null,
    fecha: r.fecha,
    temperatura_sala: zonasDelParte.value.length ? null : rangoSala.value,
    zonas: zonasDelParte.value.map(z => ({
      nombre: z.nombre,
      rango: rangoDe(z),
      inicio: marcaZona(z, 'inicio'),
      fin: marcaZona(z, 'fin'),
      inicio_motivo: motivoZona(z, 'inicio') || null,
      fin_motivo: motivoZona(z, 'fin') || null,
    })),
    version_config: r.version_config,
    iniciado_por: r.iniciado_por, iniciado_en: r.iniciado_en,
    inicio_cerrado_en: r.inicio_cerrado_en,
    finalizado_por: r.finalizado_por, finalizado_en: r.finalizado_en,
    limpieza_ok: r.limpieza_ok, ropa_ok: r.ropa_ok,
    frio_inicio_ok: r.frio_inicio_ok, frio_fin_ok: r.frio_fin_ok,
    gafas: r.gafas,
    gafas_historial: gafasLog.value.map(g => ({ hora: g.anotado_en, cantidad: g.cantidad })),
    incidencia: r.incidencia, notas: r.notas,
    objetos: objetos.value.map(o => {
      const f = filaDe(o)
      return {
        nombre: o.nombre,
        tipo: o.ubicacion_fija ? 'plano' : 'contado',
        cantidad_esperada: o.ubicacion_fija ? null : esperadaDe(o),
        inicio: o.ubicacion_fija ? f?.inicio_ok ?? null : f?.inicio_cantidad ?? null,
        fin:    o.ubicacion_fija ? f?.fin_ok    ?? null : f?.fin_cantidad    ?? null,
        aviso: avisoConMotivo(o),
        notas: notasDe(o).map(n => ({ hora: n.anotado_en, texto: n.nota })),
      }
    }),
    avisos: noConformidades.value,
    sin_rellenar: pendientes.value,
    reenvio: envio === 'reenvio',
    autor_email: auth.user?.email ?? null,
  }
}

async function enviarACalidad(tipo = 'cierre') {
  if (!registro.value || enviando.value) return
  if (!N8N_WEBHOOK) { toastError('El envío no está configurado (falta VITE_N8N_HS_WEBHOOK)'); return }
  if (!parteConVersion.value) {
    toastError('Este parte no tiene versión de configuración, así que no se puede enviar')
    return
  }
  enviando.value = true
  try {
    await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(partePara(tipo)),
    })
    success('Parte enviado a calidad')
  } catch (e) {
    console.error('Error enviando el parte:', e)
    toastError('No se pudo enviar el parte')
  } finally {
    enviando.value = false
  }
}

async function finalizar() {
  const nombre = quienFinaliza.value.trim()
  if (!nombre || !registro.value) return

  const sinPorQue = sinMotivo('fin')
  if (sinPorQue.length) { toastError(`Falta escribir el motivo de: ${listar(sinPorQue)}`); return }

  const motivos = []
  if (pendientes.value) motivos.push(`${pendientes.value} comprobación(es) sin rellenar`)
  if (hayAvisos.value)  motivos.push('comprobaciones que no cuadran')
  if (motivos.length) {
    const ok = await confirmar(`Hay ${motivos.join(' y ')}. ¿Cerrar el registro igualmente?`)
    if (!ok) return
  }
  try {
    const data = await llamar('finalizar', {
      registro_id: registro.value.id, nombre, incidencia: hayAvisos.value,
    })
    registro.value.finalizado_por = data.finalizado_por
    registro.value.finalizado_en = data.finalizado_en
    registro.value.incidencia = hayAvisos.value
    quienFinaliza.value = ''
    success('Registro finalizado')
    await enviarACalidad('cierre')
  } catch (e) {
    toastError(e.message)
  }
}

// ---- Guardado ---------------------------------------------------------------
// Cada marca se guarda al momento: la actividad dura horas y nadie va a pulsar
// un botón de guardar al final.

async function guardarRegistro(campo, valor) {
  if (!registro.value) return
  try {
    await llamar('guardarRegistroCampo', { registro_id: registro.value.id, campo, valor })
    registro.value[campo] = valor
  } catch (e) {
    toastError(e.message)
    await cargar()
  }
}

async function guardarGafas(valor) {
  if (!registro.value || valor == null) return
  if (registro.value.gafas === valor && gafasLog.value.length) return
  try {
    const data = await llamar('guardarGafas', { registro_id: registro.value.id, valor })
    registro.value.gafas = data.gafas
    if (data.nuevaEntrada) gafasLog.value.push(data.nuevaEntrada)
  } catch (e) {
    toastError(e.message)
    await cargar()
  }
}

async function guardarFila(objeto, campo, valor) {
  const f = filaDe(objeto)
  if (!f || !registro.value) return
  const v = valor === '' || valor === null ? null : valor
  try {
    await llamar('guardarFilaObjeto', { registro_id: registro.value.id, fila_id: f.id, campo, valor: v })
    f[campo] = v
  } catch (e) {
    toastError(e.message)
    await cargar()
  }
}

async function guardarMotivoFila(objeto, fase, valor) {
  await guardarFila(objeto, campoMotivo(fase), (valor || '').trim() || null)
}

async function guardarFilaZona(z, campo, valor) {
  const f = filaZonaDe(z)
  if (!f || !registro.value) return
  const v = valor === '' || valor === null ? null : valor
  try {
    await llamar('guardarFilaZona', { registro_id: registro.value.id, fila_id: f.id, campo, valor: v })
    f[campo] = v
  } catch (e) {
    toastError(e.message)
    await cargar()
  }
}
const guardarMarcaZona  = (z, fase, valor) => guardarFilaZona(z, campoZona(fase), valor)
const guardarMotivoZona = (z, fase, valor) =>
  guardarFilaZona(z, campoMotivoZona(fase), (valor || '').trim() || null)

const num = (e) => e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value) || 0))

function fmtHora(iso) {
  return iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''
}

onMounted(cargar)
</script>

<template>
  <div class="space-y-8">
    <transition name="slide-in">
      <div
        v-if="toast"
        :class="[
          'fixed top-6 right-6 flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg border z-50',
          toastType === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        ]"
      >
        <component :is="toastType === 'success' ? CheckCircle2 : XCircle" class="w-4 h-4 shrink-0" />
        <span class="font-medium text-sm">{{ toast }}</span>
      </div>
    </transition>

    <PageHeader
      caption="Logística"
      :caption-icon="ShieldCheck"
      theme="emerald"
      title="Higiénico Sanitario"
      subtitle="Muelles y Cámaras — comprobaciones al inicio y al final de la actividad"
    />

    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p v-if="cargando" class="text-sm text-slate-400">Cargando…</p>

      <div v-else-if="!sala" class="border border-dashed border-slate-300 rounded-lg p-8 text-center">
        <p class="text-sm text-slate-500">No se pudo cargar la sala Muelles y Cámaras.</p>
      </div>

      <div v-else>
        <!-- Cabecera -->
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
          <h2 class="text-lg font-bold text-slate-800">{{ sala.nombre }}</h2>
          <span class="text-sm text-slate-500">{{ fechaHoy.split('-').reverse().join('/') }}</span>
          <span v-if="registro" class="text-sm text-slate-500">
            · Inició {{ registro.iniciado_por }} a las {{ fmtHora(registro.iniciado_en) }}
          </span>
          <span v-if="inicioCerrado" class="text-sm text-slate-500">
            · Inicio guardado a las {{ fmtHora(registro.inicio_cerrado_en) }}
          </span>
          <span v-if="cerrado" class="text-sm text-slate-500">
            · Finalizó {{ registro.finalizado_por }} a las {{ fmtHora(registro.finalizado_en) }}
          </span>
          <span v-if="cerrado"
                class="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
            Cerrado
          </span>
          <span v-if="registro && registro.version_config > 0"
                class="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
                title="Versión de la configuración con la que se hizo este parte">
            Configuración V{{ registro.version_config }}
          </span>
          <span v-else-if="registro"
                class="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"
                title="La sala no tenía ninguna configuración publicada al abrir este parte">
            Configuración sin publicar
          </span>
        </div>

        <!-- Sin registro: se abre -->
        <div v-if="!registro && !salaPublicada"
             class="border border-amber-300 bg-amber-50 rounded-lg p-6 text-center">
          <p class="text-sm font-semibold text-amber-900 mb-1">
            La configuración de esta sala no está publicada.
          </p>
          <p class="text-sm text-amber-800">
            Primero hay que publicarla en CMI Operaciones, <strong>Calidad → Higiénico Sanitario</strong>.
            Si no, el parte no podría enviarse a calidad.
          </p>
        </div>

        <div v-else-if="!registro" class="border border-dashed border-slate-300 rounded-lg p-8 text-center">
          <p class="text-sm text-slate-600 mb-4">Todavía no se ha iniciado el registro de hoy.</p>
          <form @submit.prevent="iniciar" class="flex flex-wrap items-center justify-center gap-2">
            <input v-model="quienInicia" type="text" placeholder="Quién inicia"
                   class="border border-slate-300 rounded-lg px-3 py-2 text-sm w-56
                          focus:outline-none focus:ring-1 focus:ring-slate-400" />
            <button type="submit" :disabled="!quienInicia.trim()"
                    class="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium
                           hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-900">
              Iniciar registro
            </button>
          </form>
        </div>

        <template v-else>
          <div v-if="abierto && inicioCerrado"
               class="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-lg border"
               :class="modoFin ? 'border-slate-200 bg-slate-50' : 'border-dashed border-slate-300'">
            <label class="text-sm font-medium text-slate-700">Quién finaliza</label>
            <input v-model="quienFinaliza" type="text" placeholder="Nombre"
                   class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-56
                          focus:outline-none focus:ring-1 focus:ring-slate-400" />
            <span v-if="!modoFin" class="text-xs text-slate-500">
              Escribe el nombre para poder rellenar las comprobaciones de fin.
            </span>
          </div>

          <div v-if="hayAvisos"
               class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-5 px-4 py-3 rounded-lg
                      border border-amber-300 bg-amber-50">
            <span class="text-amber-600 text-lg leading-none">⚠</span>
            <span class="text-sm font-semibold text-amber-900">
              Hay no conformidades ({{ noConformidades.length }})
            </span>
            <span class="text-sm text-amber-800">
              Cada una lleva su motivo escrito en su línea.
            </span>
          </div>

          <div class="border rounded-lg p-4 mb-4"
               :class="inicioBloqueado ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200'">
            <h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">
              Al inicio
              <span v-if="inicioBloqueado" class="ml-1 font-normal normal-case text-slate-400">
                · cerrado, ya no se puede cambiar
              </span>
            </h3>
            <div class="flex flex-wrap gap-x-10 gap-y-4">
              <div v-for="c in controlesInicio" :key="c.campo" class="flex items-start gap-2">
                <div class="flex gap-1">
                  <button type="button" :disabled="cerrado || inicioBloqueado" title="Correcto"
                          @click="guardarRegistro(c.campo, true)"
                          :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                   claseOk(registro[c.campo] === true, cerrado || inicioBloqueado)]">✓</button>
                  <button type="button" :disabled="cerrado || inicioBloqueado" title="No es correcto"
                          @click="guardarRegistro(c.campo, false)"
                          :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                   claseNo(registro[c.campo] === false, cerrado || inicioBloqueado)]">✗</button>
                </div>
                <span class="text-sm text-slate-700 pt-1">
                  {{ c.etiqueta }}
                  <input v-if="registro[c.campo] === false" type="text" :disabled="cerrado"
                         :value="registro[c.motivo]"
                         @change="guardarRegistro(c.motivo, $event.target.value.trim() || null)"
                         placeholder="Motivo (obligatorio)"
                         class="mt-1 block w-60 border border-amber-300 bg-amber-50/40 rounded px-2 py-1
                                text-xs text-amber-900 placeholder-amber-600/70 focus:outline-none
                                focus:ring-1 focus:ring-amber-400 disabled:opacity-60" />
                </span>
              </div>

              <div v-for="z in zonas" :key="'zi' + z.id" class="flex items-start gap-2">
                <div class="flex gap-1">
                  <button type="button" :disabled="cerrado || inicioBloqueado" title="Correcto"
                          @click="guardarMarcaZona(z, 'inicio', true)"
                          :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                   claseOk(marcaZona(z, 'inicio') === true, cerrado || inicioBloqueado)]">✓</button>
                  <button type="button" :disabled="cerrado || inicioBloqueado" title="No es correcto"
                          @click="guardarMarcaZona(z, 'inicio', false)"
                          :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                   claseNo(marcaZona(z, 'inicio') === false, cerrado || inicioBloqueado)]">✗</button>
                </div>
                <span class="text-sm text-slate-700 pt-1">
                  {{ z.nombre }}
                  <span class="block text-xs text-slate-500">
                    Frío conectado<template v-if="rangoDe(z)">, de {{ rangoDe(z) }}</template>
                  </span>
                  <input v-if="necesitaMotivoZona(z, 'inicio')" type="text" :disabled="cerrado"
                         :value="motivoZona(z, 'inicio')"
                         @change="guardarMotivoZona(z, 'inicio', $event.target.value)"
                         placeholder="Motivo (obligatorio)"
                         class="mt-1 block w-60 border border-amber-300 bg-amber-50/40 rounded px-2 py-1
                                text-xs text-amber-900 placeholder-amber-600/70 focus:outline-none
                                focus:ring-1 focus:ring-amber-400 disabled:opacity-60" />
                </span>
              </div>
            </div>
          </div>

          <div v-if="modoFin && zonas.length" class="border border-slate-200 rounded-lg p-4 mb-6">
            <h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Al finalizar</h3>
            <div class="flex flex-wrap gap-x-10 gap-y-4">
              <div v-for="z in zonas" :key="'zf' + z.id" class="flex items-start gap-2">
                <div class="flex gap-1">
                  <button type="button" :disabled="cerrado" title="Correcto"
                          @click="guardarMarcaZona(z, 'fin', true)"
                          :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                   claseOk(marcaZona(z, 'fin') === true, cerrado)]">✓</button>
                  <button type="button" :disabled="cerrado" title="No es correcto"
                          @click="guardarMarcaZona(z, 'fin', false)"
                          :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                   claseNo(marcaZona(z, 'fin') === false, cerrado)]">✗</button>
                </div>
                <span class="text-sm text-slate-700 pt-1">
                  {{ z.nombre }}
                  <span class="block text-xs text-slate-500">
                    Frío conectado<template v-if="rangoDe(z)">, de {{ rangoDe(z) }}</template>
                  </span>
                  <input v-if="necesitaMotivoZona(z, 'fin')" type="text" :disabled="cerrado"
                         :value="motivoZona(z, 'fin')"
                         @change="guardarMotivoZona(z, 'fin', $event.target.value)"
                         placeholder="Motivo (obligatorio)"
                         class="mt-1 block w-60 border border-amber-300 bg-amber-50/40 rounded px-2 py-1
                                text-xs text-amber-900 placeholder-amber-600/70 focus:outline-none
                                focus:ring-1 focus:ring-amber-400 disabled:opacity-60" />
                </span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
            <div class="space-y-6">
              <div v-if="enPlano.length">
                <h3 class="text-xs font-semibold text-slate-500 uppercase mb-2">
                  En el plano — que estén y no estén rotos
                </h3>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <table class="w-full text-sm">
                      <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
                        <tr>
                          <th class="text-left px-3 py-2 font-semibold">Objeto</th>
                          <th class="text-center px-2 py-2 font-semibold w-[70px]">Inicio</th>
                          <th v-if="modoFin" class="text-center px-2 py-2 font-semibold w-[70px]">Fin</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="o in enPlano" :key="o.id" class="border-t border-slate-100">
                          <td class="px-3 py-2 text-slate-700 align-top">
                            {{ o.nombre }}
                            <span v-if="aviso(o)" class="block text-xs text-amber-600">{{ aviso(o) }}</span>
                            <template v-for="fase in FASES" :key="fase">
                              <input v-if="necesitaMotivo(o, fase)" type="text" :disabled="cerrado"
                                     :value="motivoDe(o, fase)"
                                     @change="guardarMotivoFila(o, fase, $event.target.value)"
                                     :placeholder="fase === 'inicio' ? 'Motivo (obligatorio)' : 'Motivo al final (obligatorio)'"
                                     class="mt-1 block w-full max-w-[16rem] border border-amber-300 bg-amber-50/40
                                            rounded px-2 py-1 text-xs text-amber-900 placeholder-amber-600/70
                                            focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-60" />
                            </template>
                            <div v-if="notasDe(o).length" class="mt-0.5 space-y-0.5">
                              <div v-for="n in notasDe(o)" :key="n.id" class="text-xs text-slate-500">
                                {{ fmtHora(n.anotado_en) }} — {{ n.nota }}
                              </div>
                            </div>
                            <div v-if="notaEstaAbierta(o)" class="mt-1 flex items-center gap-1">
                              <input v-model="notaTexto[o.id]" type="text" placeholder="Ej: se ha roto"
                                     @keyup.enter="guardarNota(o)"
                                     class="border border-slate-300 rounded px-2 py-1 text-xs w-40
                                            focus:outline-none focus:ring-1 focus:ring-slate-400" />
                              <button type="button" @click="guardarNota(o)"
                                      class="text-xs font-semibold text-slate-700 hover:underline">Guardar</button>
                              <button type="button" @click="cerrarNota(o)"
                                      class="text-xs text-slate-400 hover:underline">Cancelar</button>
                            </div>
                            <button v-else-if="inicioCerrado && !cerrado" type="button" @click="abrirNota(o)"
                                    class="block mt-0.5 text-xs text-slate-400 hover:text-slate-600 hover:underline">
                              + No conformidad
                            </button>
                          </td>
                          <td class="px-2 py-2">
                            <div class="flex justify-center gap-1">
                              <button type="button" :disabled="cerrado || inicioBloqueado"
                                      title="Está y está entero"
                                      @click="guardarFila(o, 'inicio_ok', true)"
                                      :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                               claseOk(filaDe(o)?.inicio_ok === true, cerrado || inicioBloqueado)]">✓</button>
                              <button type="button" :disabled="cerrado || inicioBloqueado"
                                      title="Falta, está roto o incompleto"
                                      @click="guardarFila(o, 'inicio_ok', false)"
                                      :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                               claseNo(filaDe(o)?.inicio_ok === false, cerrado || inicioBloqueado)]">✗</button>
                            </div>
                          </td>
                          <td v-if="modoFin" class="px-2 py-2">
                            <div class="flex justify-center gap-1">
                              <button type="button" :disabled="cerrado" title="Está y está entero"
                                      @click="guardarFila(o, 'fin_ok', true)"
                                      :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                               claseOk(filaDe(o)?.fin_ok === true, cerrado)]">✓</button>
                              <button type="button" :disabled="cerrado" title="Falta, está roto o incompleto"
                                      @click="guardarFila(o, 'fin_ok', false)"
                                      :class="['w-8 h-8 rounded border text-sm font-bold transition-colors disabled:cursor-default',
                                               claseNo(filaDe(o)?.fin_ok === false, cerrado)]">✗</button>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div v-if="sala.plano_url" class="relative h-full min-h-[160px]">
                    <a :href="sala.plano_url" target="_blank" rel="noopener"
                       class="absolute inset-0 block" title="Abrir el plano a tamaño completo">
                      <img :src="sala.plano_url" alt="Plano de la sala"
                           class="h-full w-full object-contain rounded-lg
                                  border border-slate-200 bg-white hover:border-slate-400" />
                    </a>
                  </div>
                </div>
              </div>

              <div v-if="contados.length">
                <h3 class="text-xs font-semibold text-slate-500 uppercase mb-2">
                  Se cuentan — cantidad del objeto y está en buen estado
                </h3>
                <div class="border border-slate-200 rounded-lg overflow-hidden">
                  <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th class="text-left px-3 py-2 font-semibold">Objeto</th>
                        <th class="text-center px-2 py-2 font-semibold w-[80px]">Inicio</th>
                        <th v-if="modoFin" class="text-center px-2 py-2 font-semibold w-[80px]">Fin</th>
                        <th class="text-left px-3 py-2 font-semibold w-[150px]">Aviso</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="o in contados" :key="o.id" class="border-t border-slate-100">
                        <td class="px-3 py-1.5 text-slate-700 align-top">
                          {{ o.nombre }}
                          <template v-for="fase in FASES" :key="fase">
                            <input v-if="necesitaMotivo(o, fase)" type="text" :disabled="cerrado"
                                   :value="motivoDe(o, fase)"
                                   @change="guardarMotivoFila(o, fase, $event.target.value)"
                                   :placeholder="fase === 'inicio' ? 'Motivo (obligatorio)' : 'Motivo al final (obligatorio)'"
                                   class="mt-1 block w-full max-w-[16rem] border border-amber-300 bg-amber-50/40
                                          rounded px-2 py-1 text-xs text-amber-900 placeholder-amber-600/70
                                          focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-60" />
                          </template>
                          <div v-if="notasDe(o).length" class="mt-0.5 space-y-0.5">
                            <div v-for="n in notasDe(o)" :key="n.id" class="text-xs text-slate-500">
                              {{ fmtHora(n.anotado_en) }} — {{ n.nota }}
                            </div>
                          </div>
                          <div v-if="notaEstaAbierta(o)" class="mt-1 flex items-center gap-1">
                            <input v-model="notaTexto[o.id]" type="text" placeholder="Ej: se ha roto 1"
                                   @keyup.enter="guardarNota(o)"
                                   class="border border-slate-300 rounded px-2 py-1 text-xs w-40
                                          focus:outline-none focus:ring-1 focus:ring-slate-400" />
                            <button type="button" @click="guardarNota(o)"
                                    class="text-xs font-semibold text-slate-700 hover:underline">Guardar</button>
                            <button type="button" @click="cerrarNota(o)"
                                    class="text-xs text-slate-400 hover:underline">Cancelar</button>
                          </div>
                          <button v-else-if="inicioCerrado && !cerrado" type="button" @click="abrirNota(o)"
                                  class="block mt-0.5 text-xs text-slate-400 hover:text-slate-600 hover:underline">
                            + No conformidad
                          </button>
                        </td>
                        <td class="px-2 py-1.5">
                          <div v-if="esLibre(o, 'inicio') || fueraDeBotones(o, 'inicio')" class="flex justify-center">
                            <input type="number" min="0" step="1" inputmode="numeric"
                                   :disabled="cerrado || inicioBloqueado"
                                   :value="filaDe(o)?.inicio_cantidad"
                                   @change="guardarFila(o, 'inicio_cantidad', num($event)); cerrarLibre(o, 'inicio')"
                                   class="w-14 text-center border border-slate-400 rounded px-1 py-1
                                          focus:outline-none focus:ring-1 focus:ring-slate-400
                                          disabled:opacity-50 disabled:border-slate-200
                                          [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                                          [&::-webkit-outer-spin-button]:appearance-none" />
                          </div>
                          <div v-else class="flex justify-center gap-0.5">
                            <button v-for="n in CANTIDADES" :key="n" type="button"
                                    :disabled="cerrado || inicioBloqueado"
                                    @click="guardarFila(o, 'inicio_cantidad', n)"
                                    :class="['w-7 h-8 rounded text-sm font-semibold border transition-colors disabled:cursor-default',
                                             claseNum(filaDe(o)?.inicio_cantidad === n, cerrado || inicioBloqueado)]">
                              {{ n }}
                            </button>
                            <button type="button" :disabled="cerrado || inicioBloqueado"
                                    @click="abrirLibre(o, 'inicio')" title="Otra cantidad"
                                    class="w-7 h-8 rounded text-xs border border-slate-200 text-slate-400
                                           hover:border-slate-400 hover:text-slate-600
                                           disabled:opacity-40 disabled:cursor-default">···</button>
                          </div>
                        </td>
                        <td v-if="modoFin" class="px-2 py-1.5">
                          <div v-if="esLibre(o, 'fin') || fueraDeBotones(o, 'fin')" class="flex justify-center">
                            <input type="number" min="0" step="1" inputmode="numeric" :disabled="cerrado"
                                   :value="filaDe(o)?.fin_cantidad"
                                   @change="guardarFila(o, 'fin_cantidad', num($event)); cerrarLibre(o, 'fin')"
                                   class="w-14 text-center border border-slate-400 rounded px-1 py-1
                                          focus:outline-none focus:ring-1 focus:ring-slate-400
                                          disabled:opacity-50 disabled:border-slate-200
                                          [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                                          [&::-webkit-outer-spin-button]:appearance-none" />
                          </div>
                          <div v-else class="flex justify-center gap-0.5">
                            <button v-for="n in CANTIDADES" :key="n" type="button" :disabled="cerrado"
                                    @click="guardarFila(o, 'fin_cantidad', n)"
                                    :class="['w-7 h-8 rounded text-sm font-semibold border transition-colors disabled:cursor-default',
                                             claseNum(filaDe(o)?.fin_cantidad === n, cerrado)]">
                              {{ n }}
                            </button>
                            <button type="button" :disabled="cerrado" @click="abrirLibre(o, 'fin')"
                                    title="Otra cantidad"
                                    class="w-7 h-8 rounded text-xs border border-slate-200 text-slate-400
                                           hover:border-slate-400 hover:text-slate-600
                                           disabled:opacity-40 disabled:cursor-default">···</button>
                          </div>
                        </td>
                        <td class="px-3 py-1.5 text-xs text-amber-600 align-top">{{ aviso(o) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="border border-slate-200 rounded-lg p-4">
                <p class="text-sm text-slate-700">
                  Personas con gafas
                  <span class="block text-xs text-slate-400">Se comprueba que ninguna esté rota. Mantener al día durante la actividad.</span>
                </p>
                <div v-if="esLibreGafas || !GAFAS.includes(registro.gafas)" class="mt-2">
                  <input type="number" min="0" step="1" inputmode="numeric" :disabled="cerrado"
                         :value="registro.gafas"
                         @change="guardarGafas(num($event) ?? 0); libreGafas = false"
                         class="w-16 text-center border border-slate-400 rounded px-1 py-1
                                focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-60
                                [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                                [&::-webkit-outer-spin-button]:appearance-none" />
                </div>
                <div v-else class="flex gap-1 mt-2">
                  <button v-for="n in GAFAS" :key="n" type="button" :disabled="cerrado"
                          @click="guardarGafas(n)"
                          :class="['w-8 h-8 rounded text-sm font-semibold border transition-colors disabled:opacity-50',
                                   registro.gafas === n
                                     ? 'bg-slate-900 text-white border-slate-900'
                                     : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500']">
                    {{ n }}
                  </button>
                  <button type="button" :disabled="cerrado" @click="libreGafas = true" title="Otra cantidad"
                          class="w-8 h-8 rounded text-xs border border-slate-200 text-slate-400
                                 hover:border-slate-400 hover:text-slate-600 disabled:opacity-50">···</button>
                </div>
                <div v-if="gafasLog.length" class="mt-2 text-xs text-slate-500">
                  <span v-for="(g, i) in gafasLog" :key="g.id">
                    <span v-if="i > 0"> → </span>{{ g.cantidad }} ({{ fmtHora(g.anotado_en) }})
                  </span>
                </div>
              </div>

              <form v-if="abierto && !inicioCerrado" @submit.prevent="guardarInicio"
                    class="border border-slate-200 rounded-lg p-4 space-y-2">
                <h3 class="text-xs font-semibold text-slate-500 uppercase">Guardar el inicio</h3>
                <p class="text-xs text-slate-500">
                  Al guardarlo se bloquea lo marcado al inicio. Durante el turno se podrán
                  anotar las gafas y las no conformidades que salgan.
                </p>
                <p v-if="faltanInicio.length" class="text-xs text-amber-700">
                  Falta por marcar: {{ faltanInicio.join(', ') }}
                </p>
                <p v-else-if="sinMotivoInicio.length" class="text-xs text-amber-700">
                  Falta el motivo de: {{ sinMotivoInicio.join(', ') }}
                </p>
                <button type="submit"
                        class="w-full px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium
                               hover:bg-slate-700">
                  Guardar inicio
                </button>
              </form>

              <form v-if="abierto && modoFin" @submit.prevent="finalizar"
                    class="border border-slate-200 rounded-lg p-4 space-y-2">
                <h3 class="text-xs font-semibold text-slate-500 uppercase">Cerrar el registro</h3>
                <p class="text-xs text-slate-500">Lo cierra {{ quienFinaliza.trim() }}.</p>
                <p v-if="pendientes" class="text-xs text-slate-500">
                  Quedan {{ pendientes }} comprobación(es) sin rellenar.
                </p>
                <button type="submit" :disabled="enviando"
                        class="w-full px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium
                               hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-900">
                  {{ enviando ? 'Enviando…' : 'Finalizar y enviar a calidad' }}
                </button>
              </form>

              <div v-else-if="cerrado" class="border border-slate-200 rounded-lg p-4 space-y-2">
                <h3 class="text-xs font-semibold text-slate-500 uppercase">Parte cerrado</h3>
                <p class="text-xs text-slate-500">
                  Se envió a calidad al cerrarlo. Los partes se guardan 90 días; el correo es el archivo.
                </p>
                <button @click="enviarACalidad('reenvio')" :disabled="enviando"
                        class="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm
                               font-medium hover:bg-slate-50 disabled:opacity-40">
                  {{ enviando ? 'Enviando…' : 'Enviar de nuevo' }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
