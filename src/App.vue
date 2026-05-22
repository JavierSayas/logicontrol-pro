<script setup>
import { onMounted, ref, watch, computed } from 'vue'
import { useLogisticsStore } from './stores/logistics'
import { useAuthStore } from './stores/auth'
import { supabase } from './lib/supabase'
import OrdenDeCarga from './components/OrdenDeCarga.vue'
import CartelesPT from './components/CartelesPT.vue'
import Basculas from './components/Basculas.vue'
import CuadrePT from './components/CuadrePT.vue'
import Albaranes from './components/Albaranes.vue'
import Preventivos from './components/Preventivos.vue'
import Login from './components/Login.vue'
import { Truck, Tag, Scale, ClipboardList, FileText, Wrench, LogOut } from 'lucide-vue-next'

const store = useLogisticsStore()
const auth = useAuthStore()

const tabs = [
  { id: 'pedidos', label: 'Orden de Carga', icon: Truck },
  { id: 'carteles', label: 'Carteles PT', icon: Tag },
  { id: 'basculas', label: 'Básculas', icon: Scale },
  { id: 'cuadre', label: 'Pedidos', icon: ClipboardList },
  { id: 'albaranes', label: 'Albaranes', icon: FileText },
  { id: 'preventivos', label: 'Preventivos maquinaria', icon: Wrench },
]

const TODAS_LAS_PESTANAS = tabs.map(t => t.id)

const PERMISOS_POR_ROL = {
  admin: TODAS_LAS_PESTANAS,
  user: TODAS_LAS_PESTANAS,
  logistica: ['preventivos', 'cuadre', 'albaranes'],
}

const pestanasPermitidas = computed(() => {
  const rolActual = auth.role || 'user'
  return PERMISOS_POR_ROL[rolActual] || PERMISOS_POR_ROL.user
})

const tabsVisibles = computed(() =>
  tabs.filter(t => pestanasPermitidas.value.includes(t.id))
)

function aplicarPermisos() {
  if (!pestanasPermitidas.value.includes(store.activeTab)) {
    store.activeTab = tabsVisibles.value[0]?.id || 'preventivos'
  }
}

const DIA_ALERTA = 2
const BASCULA_VIGILADA = 'BÁSCULA MUELLE'
const basculasPendientes = ref(false)
const preventivosPendientes = ref(false)

function getSemanaActual() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now - start
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  return Math.ceil((diff / oneWeek) + start.getDay() / 7)
}

async function comprobarBasculasPendientes() {
  if (!auth.isAuthenticated) {
    basculasPendientes.value = false
    return
  }
  const dow = new Date().getDay()
  if (dow < DIA_ALERTA && dow !== 0) {
    basculasPendientes.value = false
    return
  }
  try {
    const semana = getSemanaActual()
    const anio = new Date().getFullYear()
    const { count, error } = await supabase
      .from('basculas')
      .select('id', { count: 'exact', head: true })
      .eq('semana', semana)
      .eq('anio', anio)
      .eq('nombre_bascula', BASCULA_VIGILADA)
    if (error) throw error
    basculasPendientes.value = (count ?? 0) === 0
  } catch {
    basculasPendientes.value = false
  }
}

async function comprobarPreventivosPendientes() {
  if (!auth.isAuthenticated) {
    preventivosPendientes.value = false
    return
  }
  try {
    const { count, error } = await supabase
      .from('v_estado_tareas_maquinas')
      .select('maquina_id', { count: 'exact', head: true })
      .eq('vencida', true)
    if (error) throw error
    preventivosPendientes.value = (count ?? 0) > 0
  } catch {
    preventivosPendientes.value = false
  }
}

onMounted(async () => {
  await auth.init()
  aplicarPermisos()
  await Promise.all([
    comprobarBasculasPendientes(),
    comprobarPreventivosPendientes(),
  ])
})

watch(() => auth.role, aplicarPermisos)

watch(() => store.activeTab, (nuevo, anterior) => {
  if (anterior === 'basculas' && nuevo !== 'basculas') {
    comprobarBasculasPendientes()
  }
  if (anterior === 'preventivos' && nuevo !== 'preventivos') {
    comprobarPreventivosPendientes()
  }
})

async function handleLogout() {
  await auth.signOut()
}
</script>

<template>
  <div v-if="!auth.initialized" class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="text-slate-400 text-sm font-medium">Cargando...</div>
  </div>

  <Login v-else-if="!auth.isAuthenticated" />

  <div v-else class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
    <header class="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-md">
      <div class="max-w-[95vw] mx-auto px-6 py-5">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="bg-gradient-to-br from-blue-600 to-indigo-700 p-2.5 rounded-xl">
              <Truck class="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 class="text-2xl font-900 text-slate-900 tracking-tight">LogisPro</h1>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5">Gestión de Órdenes de Carga</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                <span class="text-sm font-semibold text-slate-700">
                  {{ new Date(store.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }) }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2 px-3 py-2 rounded-full bg-slate-100 border border-slate-200">
              <span class="text-xs font-semibold text-slate-700 max-w-[160px] truncate">
                {{ auth.user?.email }}
              </span>
              <button
                @click="handleLogout"
                class="flex items-center justify-center w-7 h-7 rounded-full bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors border border-slate-200"
                title="Cerrar sesión"
              >
                <LogOut class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-1 flex-wrap">
          <button
            v-for="tab in tabsVisibles"
            :key="tab.id"
            @click="store.activeTab = tab.id"
            :class="[
              'relative flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200',
              store.activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            ]"
          >
            <component :is="tab.icon" class="w-4 h-4" />
            <span>{{ tab.label }}</span>
            <span
              v-if="tab.id === 'basculas' && basculasPendientes"
              class="absolute top-1.5 right-1.5 flex h-2.5 w-2.5"
              title="Pendiente: comprobar la báscula esta semana"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span
              v-if="tab.id === 'preventivos' && preventivosPendientes"
              class="absolute top-1.5 right-1.5 flex h-2.5 w-2.5"
              title="Hay tareas preventivas vencidas"
            >
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[95vw] mx-auto px-6 py-8">
      <keep-alive>
        <OrdenDeCarga v-if="store.activeTab === 'pedidos'" />
        <CartelesPT v-else-if="store.activeTab === 'carteles'" />
        <Basculas v-else-if="store.activeTab === 'basculas'" />
        <CuadrePT v-else-if="store.activeTab === 'cuadre'" />
        <Albaranes v-else-if="store.activeTab === 'albaranes'" />
        <Preventivos v-else-if="store.activeTab === 'preventivos'" />
      </keep-alive>
    </main>
  </div>
</template>
