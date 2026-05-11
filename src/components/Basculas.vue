<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { Scale, CheckCircle2, XCircle, AlertTriangle, Trash2 } from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'
import Badge from './ui/Badge.vue'
import PageHeader from './ui/PageHeader.vue'

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
  <div class="space-y-8">
    <PageHeader
      caption="Calidad"
      :caption-icon="Scale"
      theme="cyan"
      title="Control de Básculas"
      subtitle="Verificación semanal de calibración"
    >
      <template #actions>
        <div class="text-right">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Semana actual</p>
          <p class="text-2xl font-bold tracking-tight text-slate-900">{{ semanaActual }}<span class="text-base font-medium text-slate-400"> / {{ anioActual }}</span></p>
        </div>
      </template>
    </PageHeader>

    <div v-if="errorMsg" class="text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
      <AlertTriangle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>
    <div v-if="successMsg" class="text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-2">
      <CheckCircle2 class="w-4 h-4 shrink-0" />
      <span>{{ successMsg }}</span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <Card padding="lg">
        <div class="space-y-6">
          <div class="text-center pb-6 border-b border-slate-100">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Peso de referencia</p>
            <p class="text-4xl font-bold tracking-tight text-slate-900">{{ PESO_REFERENCIA }} <span class="text-lg font-medium text-slate-400">kg</span></p>
            <p class="text-xs font-medium text-slate-400 mt-1">Tolerancia: ± {{ TOLERANCIA }} kg</p>
          </div>

          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Báscula</label>
            <select
              v-model="basculaSeleccionada"
              class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 cursor-pointer focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
            >
              <option v-for="b in BASCULAS" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Peso registrado en báscula</label>
            <div class="relative">
              <input
                v-model="pesoRegistrado"
                type="number"
                step="0.01"
                placeholder="Ej: 528.50"
                class="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-lg font-bold text-center text-slate-900 placeholder:text-slate-300 placeholder:font-medium focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">kg</span>
            </div>
          </div>

          <div
            v-if="pesoValido"
            class="rounded-lg p-4 text-center"
            :class="calibrada ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'"
          >
            <div class="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 v-if="calibrada" class="w-5 h-5 text-emerald-600" />
              <XCircle v-else class="w-5 h-5 text-red-600" />
              <span class="text-sm font-bold" :class="calibrada ? 'text-emerald-700' : 'text-red-700'">
                {{ calibrada ? 'Báscula correcta' : 'Báscula mal calibrada' }}
              </span>
            </div>
            <p class="text-xs font-semibold" :class="calibrada ? 'text-emerald-600' : 'text-red-600'">
              Desviación: {{ desviacion > 0 ? '+' : '' }}{{ desviacion }} kg
            </p>
          </div>

          <Button
            block
            size="lg"
            :disabled="!pesoValido || guardando"
            :loading="guardando"
            @click="guardarRegistro"
          >
            <span v-if="guardando">Guardando...</span>
            <span v-else-if="registroExistente">Actualizar semana {{ semanaActual }}</span>
            <span v-else>Guardar semana {{ semanaActual }}</span>
          </Button>

          <a
            v-if="registroExistente && !registroExistente.calibrada"
            href="https://one.fracttal.com/signin"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            <AlertTriangle class="w-4 h-4" />
            Abrir Fracttal (Crear orden de mantenimiento)
          </a>
        </div>
      </Card>

      <Card flush>
        <div class="px-6 py-4 border-b border-slate-100">
          <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Historial {{ anioActual }}</h3>
        </div>

        <div v-if="loadingHistorial" class="text-center py-12 text-sm font-medium text-slate-400">Cargando historial...</div>
        <div v-else-if="historial.length === 0" class="text-center py-12 text-sm font-medium text-slate-400">
          No hay registros este año
        </div>

        <div v-else class="overflow-y-auto" style="max-height: calc(100vh - 280px)">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100">
                <th class="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sem.</th>
                <th class="text-left py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Báscula</th>
                <th class="text-center py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Peso</th>
                <th class="text-center py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Desv.</th>
                <th class="text-center py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                <th class="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="reg in historial"
                :key="reg.id"
                class="border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
                :class="{ 'bg-cyan-50/40': reg.semana === semanaActual }"
              >
                <td class="py-2.5 px-4 font-semibold text-slate-700">
                  S{{ reg.semana }}
                  <span v-if="reg.semana === semanaActual" class="text-[10px] text-cyan-600 font-bold ml-1">actual</span>
                </td>
                <td class="py-2.5 px-4 text-xs font-medium text-slate-600">{{ reg.nombre_bascula }}</td>
                <td class="py-2.5 px-4 text-center font-semibold text-slate-700">{{ reg.peso_registrado }} kg</td>
                <td class="py-2.5 px-4 text-center font-semibold" :class="reg.calibrada ? 'text-emerald-600' : 'text-red-600'">
                  {{ reg.desviacion > 0 ? '+' : '' }}{{ reg.desviacion }} kg
                </td>
                <td class="py-2.5 px-4 text-center">
                  <Badge :variant="reg.calibrada ? 'success' : 'danger'">
                    <CheckCircle2 v-if="reg.calibrada" class="w-3 h-3" />
                    <XCircle v-else class="w-3 h-3" />
                    {{ reg.calibrada ? 'OK' : 'Mal' }}
                  </Badge>
                </td>
                <td class="py-2.5 px-2 text-center">
                  <button
                    @click="eliminarRegistro(reg.id)"
                    class="p-1.5 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Eliminar registro"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>
</template>
