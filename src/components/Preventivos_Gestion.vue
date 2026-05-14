<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import {
  Truck,
  Wrench,
  Plus,
  Pencil,
  X,
  Check,
  Trash2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
} from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import PageHeader from './ui/PageHeader.vue'

const auth = useAuthStore()

const seccion = ref('maquinas')

const errorMsg = ref('')
const successMsg = ref('')

function mostrarExito(msg) {
  successMsg.value = msg
  setTimeout(() => { successMsg.value = '' }, 4000)
}
function mostrarError(msg) {
  errorMsg.value = msg
  setTimeout(() => { errorMsg.value = '' }, 8000)
}

const maquinas = ref([])
const loadingMaquinas = ref(false)
const filtroMaquinas = ref('activas')
const busquedaMaquinas = ref('')
const modoMaquina = ref(null)
const maquinaForm = ref(null)
const guardandoMaquina = ref(false)

const formMaquinaVacio = () => ({
  id: null,
  tipo: '',
  nombre_palet: '',
  accionamiento: '',
  modelo: '',
  n_serie: '',
  matricula: '',
  proveedor: '',
  ano_fabricacion: '',
  capacidad_nominal: '',
  capacidad_unidad: '',
  adquisicion: '',
  orden_sap: '',
})

const maquinasFiltradas = computed(() => {
  const q = busquedaMaquinas.value.trim().toLowerCase()
  return maquinas.value.filter(m => {
    if (filtroMaquinas.value === 'activas' && !m.activo) return false
    if (filtroMaquinas.value === 'inactivas' && m.activo) return false
    if (!q) return true
    const haystack = [m.tipo, m.nombre_palet, m.accionamiento, m.modelo, m.n_serie, m.matricula, m.proveedor]
      .filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

async function cargarMaquinas() {
  loadingMaquinas.value = true
  try {
    const { data, error } = await supabase
      .from('maquinaria_logistica')
      .select('*')
      .order('activo', { ascending: false })
      .order('tipo')
      .order('nombre_palet')
    if (error) throw error
    maquinas.value = data || []
  } catch (err) {
    mostrarError('Error cargando máquinas: ' + err.message)
  } finally {
    loadingMaquinas.value = false
  }
}

function abrirNuevaMaquina() {
  modoMaquina.value = 'nueva'
  maquinaForm.value = formMaquinaVacio()
}

function abrirEditarMaquina(m) {
  modoMaquina.value = 'editar'
  maquinaForm.value = {
    id: m.id,
    tipo: m.tipo || '',
    nombre_palet: m.nombre_palet || '',
    accionamiento: m.accionamiento || '',
    modelo: m.modelo || '',
    n_serie: m.n_serie || '',
    matricula: m.matricula || '',
    proveedor: m.proveedor || '',
    ano_fabricacion: m.ano_fabricacion ?? '',
    capacidad_nominal: m.capacidad_nominal ?? '',
    capacidad_unidad: m.capacidad_unidad || '',
    adquisicion: m.adquisicion || '',
    orden_sap: m.orden_sap || '',
  }
}

function cancelarMaquina() {
  modoMaquina.value = null
  maquinaForm.value = null
}

async function guardarMaquina() {
  if (!maquinaForm.value) return
  const f = maquinaForm.value
  if (!f.tipo.trim() || !f.accionamiento.trim()) {
    mostrarError('Tipo y accionamiento son obligatorios')
    return
  }
  guardandoMaquina.value = true
  try {
    const payload = {
      tipo: f.tipo.trim(),
      nombre_palet: f.nombre_palet.trim() || null,
      accionamiento: f.accionamiento.trim(),
      modelo: f.modelo.trim() || null,
      n_serie: f.n_serie.trim() || null,
      matricula: f.matricula.trim() || null,
      proveedor: f.proveedor.trim() || null,
      ano_fabricacion: f.ano_fabricacion === '' ? null : Number(f.ano_fabricacion),
      capacidad_nominal: f.capacidad_nominal === '' ? null : Number(f.capacidad_nominal),
      capacidad_unidad: f.capacidad_unidad.trim() || null,
      adquisicion: f.adquisicion.trim() || null,
      orden_sap: f.orden_sap.trim() || null,
      updated_by: auth.user?.id || null,
    }
    if (modoMaquina.value === 'nueva') {
      payload.created_by = auth.user?.id || null
      const { error } = await supabase.from('maquinaria_logistica').insert(payload)
      if (error) throw error
      mostrarExito('Máquina creada')
    } else {
      const { error } = await supabase
        .from('maquinaria_logistica')
        .update(payload)
        .eq('id', f.id)
      if (error) throw error
      mostrarExito('Máquina actualizada')
    }
    cancelarMaquina()
    await cargarMaquinas()
  } catch (err) {
    mostrarError('No se pudo guardar la máquina: ' + err.message)
  } finally {
    guardandoMaquina.value = false
  }
}

async function darBajaMaquina(m) {
  if (!confirm(`¿Dar de baja la máquina "${nombreMaquina(m)}"?\n\nNo aparecerá en los listados de mantenimiento. Los registros históricos se conservan.`)) return
  try {
    const { error } = await supabase
      .from('maquinaria_logistica')
      .update({ activo: false, fecha_baja: new Date().toISOString(), updated_by: auth.user?.id || null })
      .eq('id', m.id)
    if (error) throw error
    mostrarExito('Máquina dada de baja')
    await cargarMaquinas()
  } catch (err) {
    mostrarError('No se pudo dar de baja: ' + err.message)
  }
}

async function reactivarMaquina(m) {
  try {
    const { error } = await supabase
      .from('maquinaria_logistica')
      .update({ activo: true, fecha_baja: null, updated_by: auth.user?.id || null })
      .eq('id', m.id)
    if (error) throw error
    mostrarExito('Máquina reactivada')
    await cargarMaquinas()
  } catch (err) {
    mostrarError('No se pudo reactivar: ' + err.message)
  }
}

function nombreMaquina(m) {
  if (!m) return ''
  return [m.tipo, m.nombre_palet, m.n_serie || m.matricula].filter(Boolean).join(' · ')
}

const familias = ref([])
const familiasMap = computed(() => Object.fromEntries(familias.value.map(f => [f.id, f])))
const familiasActivas = computed(() => familias.value.filter(f => f.activo))

async function cargarFamilias() {
  try {
    const { data, error } = await supabase
      .from('familias_preventivos')
      .select('*')
      .order('tipo')
      .order('accionamiento')
    if (error) throw error
    familias.value = data || []
  } catch (err) {
    mostrarError('Error cargando familias: ' + err.message)
  }
}

const tareas = ref([])
const loadingTareas = ref(false)
const filtroTareas = ref('activas')
const filtroFamiliaTareas = ref('todas')
const busquedaTareas = ref('')
const modoTarea = ref(null)
const tareaForm = ref(null)
const guardandoTarea = ref(false)

const tareasFiltradas = computed(() => {
  const q = busquedaTareas.value.trim().toLowerCase()
  return tareas.value.filter(t => {
    if (filtroTareas.value === 'activas' && !t.activo) return false
    if (filtroTareas.value === 'inactivas' && t.activo) return false
    if (filtroFamiliaTareas.value !== 'todas' && String(t.familia_id) !== String(filtroFamiliaTareas.value)) return false
    if (!q) return true
    const familia = familiasMap.value[t.familia_id]
    const haystack = [t.nombre, t.descripcion, familia?.tipo, familia?.accionamiento]
      .filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

async function cargarTareas() {
  loadingTareas.value = true
  try {
    const { data, error } = await supabase
      .from('tareas_preventivas')
      .select('*')
      .order('activo', { ascending: false })
      .order('familia_id')
      .order('nombre')
    if (error) throw error
    tareas.value = data || []
  } catch (err) {
    mostrarError('Error cargando tareas: ' + err.message)
  } finally {
    loadingTareas.value = false
  }
}

function abrirNuevaTarea() {
  modoTarea.value = 'nueva'
  tareaForm.value = {
    id: null,
    familia_id: familiasActivas.value[0]?.id || '',
    nombre: '',
    descripcion: '',
    frecuencia_dias: 30,
  }
}

function abrirEditarTarea(t) {
  modoTarea.value = 'editar'
  tareaForm.value = {
    id: t.id,
    familia_id: t.familia_id,
    nombre: t.nombre || '',
    descripcion: t.descripcion || '',
    frecuencia_dias: t.frecuencia_dias,
  }
}

function cancelarTarea() {
  modoTarea.value = null
  tareaForm.value = null
}

async function guardarTarea() {
  if (!tareaForm.value) return
  const t = tareaForm.value
  if (!t.familia_id) {
    mostrarError('Selecciona una familia')
    return
  }
  if (!t.nombre.trim()) {
    mostrarError('El nombre es obligatorio')
    return
  }
  const freq = Number(t.frecuencia_dias)
  if (!Number.isInteger(freq) || freq <= 0) {
    mostrarError('La frecuencia debe ser un entero positivo (días)')
    return
  }
  guardandoTarea.value = true
  try {
    const payload = {
      familia_id: Number(t.familia_id),
      nombre: t.nombre.trim(),
      descripcion: t.descripcion.trim() || null,
      frecuencia_dias: freq,
      updated_by: auth.user?.id || null,
    }
    if (modoTarea.value === 'nueva') {
      payload.created_by = auth.user?.id || null
      const { error } = await supabase.from('tareas_preventivas').insert(payload)
      if (error) throw error
      mostrarExito('Tarea creada')
    } else {
      const { error } = await supabase
        .from('tareas_preventivas')
        .update(payload)
        .eq('id', t.id)
      if (error) throw error
      mostrarExito('Tarea actualizada')
    }
    cancelarTarea()
    await cargarTareas()
  } catch (err) {
    mostrarError('No se pudo guardar la tarea: ' + err.message)
  } finally {
    guardandoTarea.value = false
  }
}

async function darBajaTarea(t) {
  if (!confirm(`¿Dar de baja la tarea "${t.nombre}"?\n\nDejará de aplicarse a las máquinas. Los registros históricos se conservan.`)) return
  try {
    const { error } = await supabase
      .from('tareas_preventivas')
      .update({ activo: false, fecha_baja: new Date().toISOString(), updated_by: auth.user?.id || null })
      .eq('id', t.id)
    if (error) throw error
    mostrarExito('Tarea dada de baja')
    await cargarTareas()
  } catch (err) {
    mostrarError('No se pudo dar de baja: ' + err.message)
  }
}

async function reactivarTarea(t) {
  try {
    const { error } = await supabase
      .from('tareas_preventivas')
      .update({ activo: true, fecha_baja: null, updated_by: auth.user?.id || null })
      .eq('id', t.id)
    if (error) throw error
    mostrarExito('Tarea reactivada')
    await cargarTareas()
  } catch (err) {
    mostrarError('No se pudo reactivar: ' + err.message)
  }
}

onMounted(async () => {
  await Promise.all([cargarMaquinas(), cargarFamilias(), cargarTareas()])
})
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      caption="Mantenimiento · Gestión"
      :caption-icon="Wrench"
      theme="amber"
      title="Gestión de máquinas y preventivos"
      subtitle="Alta y baja de máquinas y tareas preventivas"
    />

    <div class="flex gap-1 border-b border-slate-200">
      <button
        @click="seccion = 'maquinas'"
        :class="[
          'flex items-center gap-2 px-4 py-2.5 -mb-px font-semibold text-sm transition-colors border-b-2',
          seccion === 'maquinas'
            ? 'border-amber-600 text-amber-700'
            : 'border-transparent text-slate-500 hover:text-slate-700'
        ]"
      >
        <Truck class="w-4 h-4" />
        Máquinas
      </button>
      <button
        @click="seccion = 'tareas'"
        :class="[
          'flex items-center gap-2 px-4 py-2.5 -mb-px font-semibold text-sm transition-colors border-b-2',
          seccion === 'tareas'
            ? 'border-amber-600 text-amber-700'
            : 'border-transparent text-slate-500 hover:text-slate-700'
        ]"
      >
        <Wrench class="w-4 h-4" />
        Tareas preventivas
      </button>
    </div>

    <div v-if="errorMsg" class="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
      <AlertTriangle class="w-4 h-4 shrink-0" />
      <span class="flex-1">{{ errorMsg }}</span>
      <button @click="errorMsg = ''" class="text-red-500 hover:text-red-700"><X class="w-4 h-4" /></button>
    </div>
    <div v-if="successMsg" class="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-2">
      <CheckCircle2 class="w-4 h-4 shrink-0" />
      <span>{{ successMsg }}</span>
    </div>

    <div v-if="seccion === 'maquinas'" class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <Search class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            v-model="busquedaMaquinas"
            type="text"
            placeholder="Buscar por matrícula, nº serie, modelo..."
            class="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
          />
        </div>
        <div class="relative">
          <Filter class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <select
            v-model="filtroMaquinas"
            class="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
          >
            <option value="activas">Activas</option>
            <option value="inactivas">De baja</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <Button @click="abrirNuevaMaquina">
          <Plus class="w-4 h-4" />
          Nueva máquina
        </Button>
      </div>

      <Card v-if="modoMaquina" padding="lg" class="max-w-3xl">
        <div class="space-y-4">
          <h3 class="text-base font-bold text-slate-900">
            {{ modoMaquina === 'nueva' ? 'Nueva máquina' : 'Editar máquina' }}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Tipo <span class="text-red-500">*</span></label>
              <input v-model="maquinaForm.tipo" type="text" placeholder="Apiladora, Carretilla..." class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Accionamiento <span class="text-red-500">*</span></label>
              <input v-model="maquinaForm.accionamiento" type="text" placeholder="Batería Litio-Ion, Diésel..." class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Nombre / Palet</label>
              <input v-model="maquinaForm.nombre_palet" type="text" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Modelo</label>
              <input v-model="maquinaForm.modelo" type="text" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Nº de serie</label>
              <input v-model="maquinaForm.n_serie" type="text" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Matrícula</label>
              <input v-model="maquinaForm.matricula" type="text" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Proveedor</label>
              <input v-model="maquinaForm.proveedor" type="text" placeholder="Toyota, Linde..." class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Año fabricación</label>
              <input v-model="maquinaForm.ano_fabricacion" type="number" min="1980" max="2100" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Capacidad nominal</label>
              <input v-model="maquinaForm.capacidad_nominal" type="number" step="0.01" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Unidad capacidad</label>
              <input v-model="maquinaForm.capacidad_unidad" type="text" placeholder="kg, t..." class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Adquisición</label>
              <input v-model="maquinaForm.adquisicion" type="text" placeholder="Compra, Renting..." class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Orden SAP</label>
              <input v-model="maquinaForm.orden_sap" type="text" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
          </div>
          <div class="flex items-center gap-2 justify-end pt-4 border-t border-slate-100">
            <Button variant="ghost" @click="cancelarMaquina">Cancelar</Button>
            <Button :disabled="guardandoMaquina" :loading="guardandoMaquina" @click="guardarMaquina">
              <Check class="w-4 h-4" />
              {{ modoMaquina === 'nueva' ? 'Crear máquina' : 'Guardar cambios' }}
            </Button>
          </div>
        </div>
      </Card>

      <div v-if="loadingMaquinas && maquinas.length === 0" class="text-center py-16 text-sm font-medium text-slate-400">
        Cargando máquinas...
      </div>
      <Card v-else-if="maquinasFiltradas.length === 0" padding="lg">
        <div class="text-center py-10">
          <Truck class="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p class="text-sm font-medium text-slate-500">Sin máquinas con los filtros actuales</p>
        </div>
      </Card>
      <Card v-else flush>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="m in maquinasFiltradas"
            :key="m.id"
            class="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors"
            :class="{ 'opacity-60': !m.activo }"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-semibold text-slate-900 truncate">{{ nombreMaquina(m) }}</h3>
                <Badge v-if="!m.activo" variant="warning" size="sm">De baja</Badge>
                <span v-if="m.accionamiento" class="text-xs font-medium text-slate-400">{{ m.accionamiento }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-x-5 gap-y-0.5 mt-1 text-xs font-medium text-slate-500">
                <span v-if="m.matricula">Mat. <span class="text-slate-700">{{ m.matricula }}</span></span>
                <span v-if="m.modelo">Modelo <span class="text-slate-700">{{ m.modelo }}</span></span>
                <span v-if="m.proveedor">{{ m.proveedor }}</span>
                <span v-if="m.ano_fabricacion">{{ m.ano_fabricacion }}</span>
              </div>
            </div>
            <Button variant="ghost" @click="abrirEditarMaquina(m)" title="Editar">
              <Pencil class="w-4 h-4" />
            </Button>
            <Button v-if="m.activo" variant="ghost" @click="darBajaMaquina(m)" title="Dar de baja">
              <Trash2 class="w-4 h-4 text-red-500" />
            </Button>
            <Button v-else variant="ghost" @click="reactivarMaquina(m)" title="Reactivar">
              <RotateCcw class="w-4 h-4 text-emerald-600" />
            </Button>
          </li>
        </ul>
      </Card>
    </div>

    <div v-else-if="seccion === 'tareas'" class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="relative flex-1">
          <Search class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            v-model="busquedaTareas"
            type="text"
            placeholder="Buscar tarea..."
            class="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
          />
        </div>
        <select
          v-model="filtroFamiliaTareas"
          class="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        >
          <option value="todas">Todas las familias</option>
          <option v-for="f in familias" :key="f.id" :value="f.id">
            {{ f.tipo }} · {{ f.accionamiento }}{{ f.activo ? '' : ' (de baja)' }}
          </option>
        </select>
        <select
          v-model="filtroTareas"
          class="px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        >
          <option value="activas">Activas</option>
          <option value="inactivas">De baja</option>
          <option value="todas">Todas</option>
        </select>
        <Button @click="abrirNuevaTarea" :disabled="familiasActivas.length === 0">
          <Plus class="w-4 h-4" />
          Nueva tarea
        </Button>
      </div>

      <Card v-if="modoTarea" padding="lg" class="max-w-2xl">
        <div class="space-y-4">
          <h3 class="text-base font-bold text-slate-900">
            {{ modoTarea === 'nueva' ? 'Nueva tarea preventiva' : 'Editar tarea preventiva' }}
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Familia <span class="text-red-500">*</span></label>
              <select
                v-model="tareaForm.familia_id"
                class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              >
                <option value="" disabled>Selecciona una familia...</option>
                <option v-for="f in familiasActivas" :key="f.id" :value="f.id">
                  {{ f.tipo }} · {{ f.accionamiento }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Nombre <span class="text-red-500">*</span></label>
              <input v-model="tareaForm.nombre" type="text" placeholder="Revisión aceite, Cambio filtro..." class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Descripción</label>
              <textarea v-model="tareaForm.descripcion" rows="3" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 resize-none"></textarea>
            </div>
            <div>
              <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Frecuencia (días) <span class="text-red-500">*</span></label>
              <input v-model="tareaForm.frecuencia_dias" type="number" min="1" step="1" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
            </div>
          </div>
          <div class="flex items-center gap-2 justify-end pt-4 border-t border-slate-100">
            <Button variant="ghost" @click="cancelarTarea">Cancelar</Button>
            <Button :disabled="guardandoTarea" :loading="guardandoTarea" @click="guardarTarea">
              <Check class="w-4 h-4" />
              {{ modoTarea === 'nueva' ? 'Crear tarea' : 'Guardar cambios' }}
            </Button>
          </div>
        </div>
      </Card>

      <div v-if="loadingTareas && tareas.length === 0" class="text-center py-16 text-sm font-medium text-slate-400">
        Cargando tareas...
      </div>
      <Card v-else-if="tareasFiltradas.length === 0" padding="lg">
        <div class="text-center py-10">
          <Wrench class="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p class="text-sm font-medium text-slate-500">Sin tareas con los filtros actuales</p>
        </div>
      </Card>
      <Card v-else flush>
        <ul class="divide-y divide-slate-100">
          <li
            v-for="t in tareasFiltradas"
            :key="t.id"
            class="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors"
            :class="{ 'opacity-60': !t.activo }"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-semibold text-slate-900 truncate">{{ t.nombre }}</h3>
                <Badge v-if="!t.activo" variant="warning" size="sm">De baja</Badge>
                <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  cada {{ t.frecuencia_dias }} día{{ t.frecuencia_dias === 1 ? '' : 's' }}
                </span>
              </div>
              <p v-if="t.descripcion" class="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">{{ t.descripcion }}</p>
              <div class="text-xs font-medium text-slate-500 mt-1">
                Familia:
                <span class="text-slate-700">
                  {{ familiasMap[t.familia_id]?.tipo || '—' }} · {{ familiasMap[t.familia_id]?.accionamiento || '—' }}
                </span>
              </div>
            </div>
            <Button variant="ghost" @click="abrirEditarTarea(t)" title="Editar">
              <Pencil class="w-4 h-4" />
            </Button>
            <Button v-if="t.activo" variant="ghost" @click="darBajaTarea(t)" title="Dar de baja">
              <Trash2 class="w-4 h-4 text-red-500" />
            </Button>
            <Button v-else variant="ghost" @click="reactivarTarea(t)" title="Reactivar">
              <RotateCcw class="w-4 h-4 text-emerald-600" />
            </Button>
          </li>
        </ul>
      </Card>
    </div>
  </div>
</template>
