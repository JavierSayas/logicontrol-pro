<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabaseOrigen } from '../lib/supabase'
import { Tag, AlertCircle, Printer } from 'lucide-vue-next'
import jsPDF from 'jspdf'

const plataformas = ref([])
const loadingPlataformas = ref(false)
const errorMsg = ref('')
const generandoPDF = ref(false)

const plataformaSeleccionada = ref(null)
const numeroPedido = ref('')
const fechaEntrega = ref('')

const esMcdOConsum = computed(() => {
  if (!plataformaSeleccionada.value) return false
  const nombre = plataformaSeleccionada.value.nombre.toUpperCase()
  return nombre.startsWith('MCD') || nombre.startsWith('CONSUM')
})

const puedeImprimir = computed(() => {
  if (!plataformaSeleccionada.value) return false
  if (!fechaEntrega.value) return false
  if (esMcdOConsum.value && !numeroPedido.value.trim()) return false
  return true
})

onMounted(async () => {
  await cargarPlataformas()
})

async function cargarPlataformas() {
  loadingPlataformas.value = true
  errorMsg.value = ''
  try {
    const { data, error } = await supabaseOrigen
      .from('plataformas')
      .select('id, nombre, nombre_csv, direccion, empresa_transporte')
      .eq('activo', true)
      .order('nombre')

    if (error) throw error
    plataformas.value = data || []
  } catch (err) {
    errorMsg.value = 'Error cargando plataformas: ' + err.message
  } finally {
    loadingPlataformas.value = false
  }
}

function seleccionarPlataforma(plat) {
  plataformaSeleccionada.value = plat
  if (!esMcdOConsum.value) {
    numeroPedido.value = ''
  }
}

async function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

async function generarCartel() {
  if (!puedeImprimir.value) return
  generandoPDF.value = true
  errorMsg.value = ''

  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const marginX = 15
    const contentW = pageW - marginX * 2
    let y = 20

    doc.setDrawColor(0)
    doc.setLineWidth(0.5)

    doc.setFillColor(200, 200, 200)
    doc.rect(marginX, y, contentW, 10, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('LUGAR DE ENTREGA:', pageW / 2, y + 7, { align: 'center' })
    y += 10

    doc.setLineWidth(0.3)
    doc.rect(marginX, y, contentW, 35)
    doc.setFontSize(36)
    doc.setFont('helvetica', 'bold')
    doc.text(plataformaSeleccionada.value.nombre, pageW / 2, y + 23, { align: 'center' })
    y += 35

    if (esMcdOConsum.value && numeroPedido.value.trim()) {
      doc.rect(marginX, y, contentW, 14)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'normal')
      doc.text(`Nº de pedido: ${numeroPedido.value.trim()}`, pageW / 2, y + 9.5, { align: 'center' })
      y += 14
    }

    doc.setFillColor(200, 200, 200)
    doc.rect(marginX, y, contentW, 10, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('FECHA DE ENTREGA:', pageW / 2, y + 7, { align: 'center' })
    y += 10

    const fechaObj = new Date(fechaEntrega.value + 'T00:00:00')
    const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

    doc.rect(marginX, y, contentW, 30)
    doc.setFontSize(40)
    doc.setFont('helvetica', 'bold')
    doc.text(fechaFormateada, pageW / 2, y + 21, { align: 'center' })
    y += 30

    y += 10

    try {
      const imgDataUrl = await loadImageAsDataUrl('/Imagen1.png')
      const imgW = contentW
      const imgH = imgW * 0.65
      doc.addImage(imgDataUrl, 'PNG', marginX, y, imgW, imgH)
    } catch {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(150)
      doc.text('(Imagen no-remontar.png no encontrada en /public/)', pageW / 2, y + 20, { align: 'center' })
      doc.setTextColor(0)
    }

    const nombreArchivo = `Cartel_${plataformaSeleccionada.value.nombre.replace(/\s+/g, '_')}_${fechaEntrega.value}.pdf`
    doc.save(nombreArchivo)
  } catch (err) {
    errorMsg.value = 'Error generando cartel: ' + err.message
  } finally {
    generandoPDF.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- HEADER -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-gradient-to-br from-orange-500 to-amber-600 p-3 rounded-xl">
          <Tag class="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 class="font-900 text-slate-900 text-lg">Carteles PT</h2>
          <p class="text-sm text-slate-500 font-medium">Generación de carteles para producto terminado</p>
        </div>
      </div>
      <button
        @click="generarCartel"
        :disabled="!puedeImprimir || generandoPDF"
        :class="['flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-orange-500',
          puedeImprimir && !generandoPDF
            ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-lg shadow-orange-500/20'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed']"
      >
        <Printer class="w-4 h-4" />
        <span v-if="generandoPDF">Generando...</span>
        <span v-else>Imprimir Cartel</span>
      </button>
    </div>

    <!-- ERROR -->
    <div v-if="errorMsg" class="flex items-center gap-2 text-red-600 text-sm font-semibold bg-red-50 px-4 py-3 rounded-lg border border-red-200">
      <AlertCircle class="w-4 h-4 shrink-0" />
      <span>{{ errorMsg }}</span>
    </div>

    <!-- CONTENIDO: FORMULARIO + PREVIEW -->
    <div class="flex gap-6 items-start">

      <!-- FORMULARIO -->
      <div class="bg-white rounded-2xl shadow-md border border-slate-200 p-8 w-1/2">
        <div class="space-y-6">

          <!-- 1. PLATAFORMA -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              1. Plataforma
            </label>
            <div v-if="loadingPlataformas" class="text-sm text-slate-400 py-2">Cargando plataformas...</div>
            <select
              v-else
              @change="seleccionarPlataforma(plataformas.find(p => p.id === Number($event.target.value)))"
              class="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all appearance-none cursor-pointer"
            >
              <option value="" disabled selected>Selecciona una plataforma...</option>
              <option
                v-for="plat in plataformas"
                :key="plat.id"
                :value="plat.id"
              >
                {{ plat.nombre }}
              </option>
            </select>
            <p v-if="plataformaSeleccionada && plataformaSeleccionada.direccion" class="mt-2 text-xs text-slate-400 pl-1">
              {{ plataformaSeleccionada.direccion }}
            </p>
          </div>

          <!-- 2. Nº PEDIDO MCD/CONSUM -->
          <div>
            <label
              class="block text-xs font-bold uppercase tracking-wider mb-2 transition-colors"
              :class="esMcdOConsum ? 'text-slate-500' : 'text-slate-300'"
            >
              2. Nº Pedido MCD/Consum
            </label>
            <input
              v-model="numeroPedido"
              type="text"
              :disabled="!esMcdOConsum"
              placeholder="Introduce el nº de pedido..."
              class="w-full px-4 py-3 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              :class="esMcdOConsum
                ? 'border-slate-300 text-slate-900 bg-white hover:border-slate-400 cursor-text'
                : 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'"
            />
            <p v-if="!esMcdOConsum" class="mt-1 text-xs text-slate-300 pl-1">
              Solo disponible para plataformas Mercadona o Consum
            </p>
          </div>

          <!-- 3. FECHA DE ENTREGA -->
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              3. Fecha de Entrega
            </label>
            <input
              v-model="fechaEntrega"
              type="date"
              class="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all cursor-pointer"
            />
          </div>

        </div>
      </div>

      <!-- PREVIEW -->
      <div v-if="plataformaSeleccionada" class="bg-white rounded-2xl shadow-md border border-slate-200 p-4 w-1/2">
        <h3 class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Vista previa</h3>
        <div class="border-2 border-slate-900 rounded-lg overflow-hidden">
          <div class="bg-slate-300 text-center py-1">
            <span class="text-[10px] font-bold tracking-wider text-slate-700">LUGAR DE ENTREGA:</span>
          </div>
          <div class="text-center py-3 border-b border-slate-300">
            <span class="text-xl font-black text-slate-900">{{ plataformaSeleccionada.nombre }}</span>
          </div>
          <div v-if="esMcdOConsum && numeroPedido.trim()" class="text-center py-1.5 border-b border-slate-300">
            <span class="text-xs text-slate-800">Nº de pedido: {{ numeroPedido.trim() }}</span>
          </div>
          <div class="bg-slate-300 text-center py-1">
            <span class="text-[10px] font-bold tracking-wider text-slate-700">FECHA DE ENTREGA:</span>
          </div>
          <div class="text-center py-2">
            <span v-if="fechaEntrega" class="text-xl font-black text-slate-900">
              {{ new Date(fechaEntrega + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) }}
            </span>
            <span v-else class="text-sm text-slate-300">DD/MM/AAAA</span>
          </div>
          <div class="px-3 pb-2">
            <img src="/Imagen1.png" alt="No remontar / Se puede remontar" class="w-full max-h-[25vh] object-contain" />
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
