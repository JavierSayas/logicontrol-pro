<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { Scale, CheckCircle, XCircle, AlertTriangle, Save, Trash2 } from 'lucide-vue-next'

const PESO_REFERENCIA = 528
const TOLERANCIA = 1.5

const BASCULAS = ['BÁSCULA MUELLE', 'BÁSCULA PORTÁTIL']
const basculaSeleccionada = ref(BASCULAS[0])
const pesoRegistrado = ref('')
const guardando = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const historial = ref([])
const loadingHistorial = ref(false)

function getSemanaActual() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now - start
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  return Math.ceil((diff / oneWeek) + start.getDay() / 7)
}

const semanaActual = ref(getSemanaActual())
const anioActual = ref(new Date().getFullYear())

const peso = computed(() => parseFloat(pesoRegistrado.value))
const pesoValido = computed(() => !isNaN(peso.value) && peso.value > 0)

const desviacion = computed(() => {
  if (!pesoValido.value) return 0
  return parseFloat((peso.value - PESO_REFERENCIA).toFixed(2))
})

const calibrada = computed(() => {
  if (!pesoValido.value) return null
  return Math.abs(desviacion.value) <= TOLERANCIA
})

const registroExistente = computed(() => {
  return historial.value.find(r => r.semana === semanaActual.value && r.anio === anioActual.value && r.nombre_bascula === basculaSeleccionada.value)
})

onMounted(async () => {
  await cargarHistorial()
})

async function cargarHistorial() {
  loadingHistorial.value = true
  try {
    const { data, error } = await supabase
      .from('basculas')
      .select('*')
      .eq('anio', anioActual.value)
      .order('semana', { ascending: false })

    if (error) throw error
    historial.value = data || []
  } catch (err) {
    errorMsg.value = 'Error cargando historial: ' + err.message
  } finally {
    loadingHistorial.value = false
  }
}

async function guardarRegistro() {
  if (!pesoValido.value) return
  guardando.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    const registro = {
      semana: semanaActual.value,
      anio: anioActual.value,
      nombre_bascula: basculaSeleccionada.value,
      peso_registrado: peso.value,
      desviacion: desviacion.value,
      calibrada: calibrada.value,
    }

    if (registroExistente.value) {
      const { error } = await supabase
        .from('basculas')
        .update(registro)
        .eq('id', registroExistente.value.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('basculas')
        .insert(registro)
      if (error) throw error
    }

    successMsg.value = `Registro semana ${semanaActual.value} guardado correctamente`
    setTimeout(() => { successMsg.value = '' }, 3000)
    await cargarHistorial()
  } catch (err) {
    errorMsg.value = 'Error guardando: ' + err.message
  } finally {
    guardando.value = false
  }
}

async function eliminarRegistro(id) {
  errorMsg.value = ''
  try {
    const { error } = await supabase
      .from('basculas')
      .delete()
      .eq('id', id)
    if (error) throw error
    await cargarHistorial()
  } catch (err) {
    errorMsg.value = 'Error eliminando: ' + err.message
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- HEADER -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-gradient-to-br from-cyan-600 to-teal-700 p-3 rounded-xl">
          <Scale class="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 class="font-900 text-slate-900 text-lg">Control de Básculas</h2>
          <p class="text-sm text-slate-500 font-medium">Verificación semanal de calibración</p>
        </div>
      </div>
      <div class="inline-flex items-center px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-200">
        <span class="text-sm font-bold text-cyan-800">Semana {{ semanaActual }} / {{ anioActual }}</span>
      </div>
    </div>

    <div class="flex gap-6 items-start">

      <!-- FORMULARIO -->
      <div class="bg-white rounded-2xl shadow-md border border-slate-200 p-8 w-1/2">
        <div class="space-y-6">

          <div class="text-center">
            <p class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Peso de referencia</p>
            <p class="text-4xl font-black text-slate-900">{{ PESO_REFERENCIA }} <span class="text-lg font-semibold text-slate-400">kg</span></p>
            <p class="text-xs text-slate-400 mt-1">Tolerancia: ± {{ TOLERANCIA }} kg</p>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Báscula
            </label>
            <select
              v-model="basculaSeleccionada"
              class="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all appearance-none cursor-pointer"
            >
              <option v-for="b in BASCULAS" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Peso registrado en báscula
            </label>
            <div class="relative">
              <input
                v-model="pesoRegistrado"
                type="number"
                step="0.01"
                placeholder="Ej: 528.50"
                class="w-full px-4 py-4 border border-slate-300 rounded-xl text-lg font-bold text-center text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">kg</span>
            </div>
          </div>

          <!-- RESULTADO -->
          <div v-if="pesoValido" class="rounded-xl p-5 text-center transition-all" :class="calibrada ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'">
            <div class="flex items-center justify-center gap-2 mb-2">
              <CheckCircle v-if="calibrada" class="w-6 h-6 text-emerald-600" />
              <XCircle v-else class="w-6 h-6 text-red-600" />
              <span class="text-lg font-black" :class="calibrada ? 'text-emerald-700' : 'text-red-700'">
                {{ calibrada ? 'Báscula Correcta' : 'La Báscula está mal calibrada' }}
              </span>
            </div>
            <p class="text-sm font-semibold" :class="calibrada ? 'text-emerald-600' : 'text-red-600'">
              Desviación: {{ desviacion > 0 ? '+' : '' }}{{ desviacion }} kg
            </p>
          </div>

          <!-- BOTÓN GUARDAR -->
          <button
            @click="guardarRegistro"
            :disabled="!pesoValido || guardando"
            :class="['w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500',
              pesoValido && !guardando
                ? 'bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed']"
          >
            <Save class="w-4 h-4" />
            <span v-if="guardando">Guardando...</span>
            <span v-else-if="registroExistente">Actualizar Semana {{ semanaActual }}</span>
            <span v-else>Guardar Semana {{ semanaActual }}</span>
          </button>

          <!-- BOTÓN FRACTTAL -->
          <a
            v-if="registroExistente && !registroExistente.calibrada"
            href="https://one.fracttal.com/signin"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <AlertTriangle class="w-4 h-4" />
            Abrir Fracttal (Crear orden de mantenimiento)
          </a>

          <!-- MENSAJES -->
          <div v-if="errorMsg" class="flex items-center gap-2 text-red-600 text-sm font-semibold bg-red-50 px-4 py-3 rounded-lg border border-red-200">
            <AlertTriangle class="w-4 h-4 shrink-0" />
            <span>{{ errorMsg }}</span>
          </div>
          <div v-if="successMsg" class="flex items-center gap-2 text-emerald-600 text-sm font-semibold bg-emerald-50 px-4 py-3 rounded-lg border border-emerald-200">
            <CheckCircle class="w-4 h-4 shrink-0" />
            <span>{{ successMsg }}</span>
          </div>
        </div>
      </div>

      <!-- HISTORIAL -->
      <div class="bg-white rounded-2xl shadow-md border border-slate-200 p-6 w-1/2">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Historial {{ anioActual }}</h3>

        <div v-if="loadingHistorial" class="text-sm text-slate-400 py-4 text-center">Cargando historial...</div>

        <div v-else-if="historial.length === 0" class="text-sm text-slate-400 py-8 text-center">
          No hay registros este año
        </div>

        <div v-else class="overflow-y-auto" style="max-height: calc(100vh - 280px)">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200">
                <th class="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Sem.</th>
                <th class="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Báscula</th>
                <th class="text-center py-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Peso</th>
                <th class="text-center py-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Desv.</th>
                <th class="text-center py-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">Estado</th>
                <th class="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="reg in historial"
                :key="reg.id"
                class="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                :class="{ 'bg-cyan-50/50': reg.semana === semanaActual }"
              >
                <td class="py-2.5 px-3 font-bold text-slate-700">
                  S{{ reg.semana }}
                  <span v-if="reg.semana === semanaActual" class="text-[10px] text-cyan-600 font-semibold ml-1">actual</span>
                </td>
                <td class="py-2.5 px-3 text-xs font-semibold text-slate-600">{{ reg.nombre_bascula }}</td>
                <td class="py-2.5 px-3 text-center font-semibold text-slate-700">{{ reg.peso_registrado }} kg</td>
                <td class="py-2.5 px-3 text-center font-semibold" :class="reg.calibrada ? 'text-emerald-600' : 'text-red-600'">
                  {{ reg.desviacion > 0 ? '+' : '' }}{{ reg.desviacion }} kg
                </td>
                <td class="py-2.5 px-3 text-center">
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                    :class="reg.calibrada ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
                  >
                    <CheckCircle v-if="reg.calibrada" class="w-3 h-3" />
                    <XCircle v-else class="w-3 h-3" />
                    {{ reg.calibrada ? 'OK' : 'Mal calibrada' }}
                  </span>
                </td>
                <td class="py-2.5 px-2 text-center">
                  <button
                    @click="eliminarRegistro(reg.id)"
                    class="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Eliminar registro"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </div>
</template>
