<script setup>
import { onMounted } from 'vue'
import { useLogisticsStore } from './stores/logistics'
import { useAuthStore } from './stores/auth'
import OrdenDeCarga from './components/OrdenDeCarga.vue'
import CartelesPT from './components/CartelesPT.vue'
import Basculas from './components/Basculas.vue'
import CuadrePT from './components/CuadrePT.vue'
import Lidl from './components/Lidl.vue'
import Login from './components/Login.vue'
import { Truck, Tag, Scale, ClipboardList, Building2, LogOut } from 'lucide-vue-next'

const store = useLogisticsStore()
const auth = useAuthStore()

const tabs = [
  { id: 'pedidos', label: 'Orden de Carga', icon: Truck },
  { id: 'carteles', label: 'Carteles PT', icon: Tag },
  { id: 'basculas', label: 'Básculas', icon: Scale },
  { id: 'cuadre', label: 'Cuadre PT', icon: ClipboardList },
  { id: 'lidl', label: 'Lidl', icon: Building2 },
]

onMounted(() => {
  auth.init()
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
              <p class="text-xs text-slate-500 font-medium">Gestión de Órdenes de Carga</p>
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

        <div class="flex gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="store.activeTab = tab.id"
            :class="[
              'flex items-center gap-2 px-5 py-3 rounded-t-xl font-semibold text-sm transition-all duration-200',
              store.activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            ]"
          >
            <component :is="tab.icon" class="w-4 h-4" />
            <span>{{ tab.label }}</span>
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
        <Lidl v-else-if="store.activeTab === 'lidl'" />
      </keep-alive>
    </main>
  </div>
</template>
