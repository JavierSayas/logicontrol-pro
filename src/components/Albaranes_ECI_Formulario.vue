<script setup>
import { ref, computed, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import {
  ClipboardList, Plus, Trash2, ChevronLeft, ChevronRight, Package,
  Eye, TriangleAlert, PackagePlus, X,
} from 'lucide-vue-next'
import Card from './ui/Card.vue'
import Button from './ui/Button.vue'
import PageHeader from './ui/PageHeader.vue'
import { useAlbaranEciStore } from '../stores/albaranEci'
import { useAuthStore } from '../stores/auth'
import { PRODUCTOS_ECI } from '../data/productosEci'
import {
  num, totalCajas, pesoNetoFila, importeFila, fmtMoney,
} from '../lib/albaranEciCalc'

const emit = defineEmits(['ir-vista-previa'])

const eciStore = useAlbaranEciStore()
const {
  tempSalida, matriculaCamion, dtoLogPct, ivaPct,
  albaranes, activeIndex, productosCustom,
} = storeToRefs(eciStore)

const auth = useAuthStore()
const esLogistica = computed(() => auth.role === 'logistica')
const puedeEditar = computed(() => !esLogistica.value)

function fechaFormateada(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const albaranActivo = computed(() => eciStore.albaranActivo)
const filas = computed(() => albaranActivo.value.filas)

const catalogo = computed(() => {
  const refsCustom = new Set(productosCustom.value.map(p => p.refEci))
  const base = PRODUCTOS_ECI.filter(p => !refsCustom.has(p.refEci))
  return [...base, ...productosCustom.value]
})

const productoSeleccionado = ref('')

function añadirProducto() {
  const ref_ = productoSeleccionado.value
  if (!ref_) return
  const producto = catalogo.value.find(p => p.refEci === ref_)
  if (producto) {
    eciStore.addProductoCatalogo(producto)
  }
  productoSeleccionado.value = ''
}

function eliminarFila(i) {
  eciStore.removeFilaActivo(i)
}

const mostrarFormularioNuevo = ref(false)
const nuevoProducto = reactive({
  refEci: '',
  articulo: '',
  origen: '',
  canarias: 'SI',
  variedad: '',
  categoria: '',
  calibre: '',
  udsCaja: 6,
  tipo: 'uds',
  precio: 0,
})
function resetNuevoProducto() {
  Object.assign(nuevoProducto, {
    refEci: '',
    articulo: '',
    origen: '',
    canarias: 'SI',
    variedad: '',
    categoria: '',
    calibre: '',
    udsCaja: 6,
    tipo: 'uds',
    precio: 0,
  })
}
function guardarNuevoProducto() {
  if (!nuevoProducto.refEci || !nuevoProducto.articulo) return
  eciStore.addProductoCustom({ ...nuevoProducto })
  resetNuevoProducto()
  mostrarFormularioNuevo.value = false
}

const totalBultos        = computed(() => filas.value.reduce((s, f) => s + totalCajas(f), 0))
const totalImporteBruto  = computed(() => filas.value.reduce((s, f) => s + importeFila(f), 0))
const descuentoLogImporte = computed(() => totalImporteBruto.value * num(dtoLogPct.value) / 100)
const importeNeto         = computed(() => totalImporteBruto.value - descuentoLogImporte.value)
const ivaImporte          = computed(() => importeNeto.value * num(ivaPct.value) / 100)
const totalAlbaran        = computed(() => importeNeto.value + ivaImporte.value)

const productosNoUsados = computed(() => {
  const refs = new Set(filas.value.map(f => f.refEci).filter(Boolean))
  return catalogo.value.filter(p => !refs.has(p.refEci))
})

function eliminarProductoCustom(refEci) {
  if (!confirm(`¿Eliminar el producto ${refEci} del catálogo?`)) return
  eciStore.removeProductoCustom(refEci)
}
</script>

<template>
  <div class="space-y-5">
    <PageHeader
      caption="Documentación"
      :caption-icon="ClipboardList"
      theme="slate"
      title="Formulario ECI"
      subtitle="Rellena los datos paso a paso. Comprueba el resultado en Vista previa antes de imprimir."
    >
      <template #actions>
        <Button @click="emit('ir-vista-previa')">
          <Eye class="w-4 h-4" />
          Vista previa
        </Button>
      </template>
    </PageHeader>

    <div v-if="albaranes.length > 1" class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
      <button
        @click="eciStore.anterior()"
        :disabled="activeIndex === 0"
        class="p-1.5 rounded border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Albarán anterior"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="font-semibold text-amber-900 text-sm whitespace-nowrap">
        Albarán {{ activeIndex + 1 }} / {{ albaranes.length }}
      </div>
      <div class="text-xs text-amber-800">
        Nº pedido: <span class="font-mono font-semibold">{{ albaranActivo.numPedido || '—' }}</span>
      </div>
      <button
        @click="eciStore.siguiente()"
        :disabled="activeIndex === albaranes.length - 1"
        class="p-1.5 rounded border border-amber-300 bg-white hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Albarán siguiente"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
      <div class="ml-auto flex flex-wrap gap-1">
        <button
          v-for="(a, i) in albaranes"
          :key="i"
          @click="eciStore.setActive(i)"
          :class="[
            'px-2.5 py-1 rounded text-xs font-semibold border',
            i === activeIndex
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-100'
          ]"
          :title="`Pedido ${a.numPedido || '—'}`"
        >{{ i + 1 }}</button>
      </div>
    </div>

    <Card padding="md">
      <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <span class="inline-block w-1 h-4 bg-slate-700 rounded-sm"></span>
        Datos del albarán
        <span class="ml-2 text-[11px] font-normal text-slate-500">Vienen del paso "1. Pegar datos" — no editables aquí</span>
      </h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div class="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Nº pedido</div>
          <div class="font-mono font-bold text-slate-900 mt-0.5">{{ albaranActivo.numPedido || '—' }}</div>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Fecha entrega</div>
          <div class="font-mono font-bold text-slate-900 mt-0.5">{{ fechaFormateada(albaranActivo.fechaEntrega) }}</div>
        </div>
        <div
          :class="[
            'border rounded-lg px-3 py-2',
            albaranActivo.errorAlbaran ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'
          ]"
        >
          <div class="text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1" :class="albaranActivo.errorAlbaran ? 'text-red-700' : 'text-slate-500'">
            Nº albarán
            <TriangleAlert v-if="albaranActivo.errorAlbaran" class="w-3 h-3" />
          </div>
          <div class="font-mono font-bold text-slate-900 mt-0.5 break-all">{{ albaranActivo.numAlbaran || '—' }}</div>
        </div>
        <div
          :class="[
            'border rounded-lg px-3 py-2',
            albaranActivo.errorTransporte ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'
          ]"
        >
          <div class="text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1" :class="albaranActivo.errorTransporte ? 'text-red-700' : 'text-slate-500'">
            Nº transporte
            <TriangleAlert v-if="albaranActivo.errorTransporte" class="w-3 h-3" />
          </div>
          <div class="font-mono font-bold text-slate-900 mt-0.5 break-all">{{ albaranActivo.numTransporte || '—' }}</div>
        </div>
      </div>
    </Card>

    <Card padding="md">
      <div class="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span class="inline-block w-1 h-4 bg-slate-700 rounded-sm"></span>
          Productos ({{ filas.length }})
        </h3>
        <div class="flex items-center gap-2 flex-wrap">
          <select
            v-model="productoSeleccionado"
            class="form-input text-sm"
            :disabled="productosNoUsados.length === 0"
          >
            <option value="">— Seleccionar producto del catálogo —</option>
            <option v-for="p in productosNoUsados" :key="p.refEci" :value="p.refEci">
              {{ p.refEci }} · {{ p.articulo }}
            </option>
          </select>
          <Button :disabled="!productoSeleccionado" @click="añadirProducto">
            <Plus class="w-4 h-4" />
            Añadir
          </Button>
          <Button v-if="puedeEditar" variant="secondary" @click="mostrarFormularioNuevo = !mostrarFormularioNuevo">
            <PackagePlus class="w-4 h-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      <div v-if="mostrarFormularioNuevo && puedeEditar" class="mb-4 border border-amber-300 bg-amber-50 rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-bold text-amber-900">Nuevo producto en el catálogo</h4>
          <button @click="mostrarFormularioNuevo = false" class="text-amber-700 hover:text-amber-900 p-1">
            <X class="w-4 h-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label class="flex flex-col gap-1">
            <span class="form-label">REF E.C.I. *</span>
            <input v-model="nuevoProducto.refEci" type="text" class="form-input" placeholder="000-00000" />
          </label>
          <label class="flex flex-col gap-1 col-span-2 md:col-span-3">
            <span class="form-label">ARTÍCULO *</span>
            <input v-model="nuevoProducto.articulo" type="text" class="form-input" placeholder="Nombre del artículo" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">ORIGEN</span>
            <input v-model="nuevoProducto.origen" type="text" class="form-input" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">VARIEDAD</span>
            <input v-model="nuevoProducto.variedad" type="text" class="form-input" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">CATEGORÍA</span>
            <input v-model="nuevoProducto.categoria" type="text" class="form-input" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">CALIBRE</span>
            <input v-model="nuevoProducto.calibre" type="text" class="form-input" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">UDS / CAJA</span>
            <input v-model="nuevoProducto.udsCaja" type="number" min="0" step="1" class="form-input" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">CANARIAS</span>
            <select v-model="nuevoProducto.canarias" class="form-input">
              <option value="SI">SI</option>
              <option value="NO">NO</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">TIPO PESO</span>
            <select v-model="nuevoProducto.tipo" class="form-input">
              <option value="uds">Por unidades</option>
              <option value="peso">Al peso (SAP)</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="form-label">PRECIO (€)</span>
            <input v-model="nuevoProducto.precio" type="number" min="0" step="0.01" class="form-input" />
          </label>
        </div>
        <div class="flex justify-end gap-2 mt-3">
          <Button variant="secondary" @click="resetNuevoProducto">Limpiar</Button>
          <Button :disabled="!nuevoProducto.refEci || !nuevoProducto.articulo" @click="guardarNuevoProducto">
            Guardar producto
          </Button>
        </div>
      </div>

      <div v-if="puedeEditar && productosCustom.length > 0" class="mb-4 text-xs text-slate-500">
        Productos personalizados:
        <span v-for="p in productosCustom" :key="p.refEci" class="inline-flex items-center gap-1 ml-1.5 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
          {{ p.refEci }}
          <button @click="eliminarProductoCustom(p.refEci)" class="text-slate-400 hover:text-red-600" title="Eliminar del catálogo">
            <X class="w-3 h-3" />
          </button>
        </span>
      </div>

      <div v-if="filas.length === 0" class="text-center py-10 text-slate-400 text-sm">
        <Package class="w-10 h-10 mx-auto mb-2 text-slate-300" />
        No hay productos. Selecciona uno del catálogo arriba para añadirlo.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="(f, i) in filas"
          :key="i"
          class="border border-slate-200 rounded-xl bg-white"
        >
          <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200">
            <div class="font-semibold text-sm text-slate-900 truncate">{{ f.articulo || '(sin artículo)' }}</div>
            <button @click="eliminarFila(i)" class="text-slate-400 hover:text-red-600 p-1" title="Eliminar producto">
              <Trash2 class="w-4 h-4" />
            </button>
          </div>

          <div class="px-4 py-3 grid grid-cols-12 gap-2">
            <label class="col-span-2 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">ECI</span>
              <input v-model="f.eci" type="number" min="0" step="1" class="form-input text-center" />
            </label>
            <label class="col-span-2 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">OCOR</span>
              <input v-model="f.ocor" type="number" min="0" step="1" class="form-input text-center" />
            </label>
            <label class="col-span-2 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">SCOR</span>
              <input v-model="f.scor" type="number" min="0" step="1" class="form-input text-center" />
            </label>
            <label class="col-span-2 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">CEDIAL</span>
              <input v-model="f.cedial" type="number" min="0" step="1" class="form-input text-center" />
            </label>
            <label class="col-span-2 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">ECIGA</span>
              <input v-model="f.eciga" type="number" min="0" step="1" class="form-input text-center" />
            </label>
            <div class="col-span-2 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">TOTAL</span>
              <div class="form-input-readonly text-center font-semibold">{{ totalCajas(f) || '0' }}</div>
            </div>

            <label class="col-span-4 md:col-span-2 flex flex-col gap-1">
              <span class="form-label">TARA (kg)</span>
              <input v-model="f.tara" type="number" min="0" step="0.01" class="form-input text-right" />
            </label>

            <div class="col-span-4 md:col-span-2 flex flex-col gap-1">
              <span class="form-label">{{ f.tipo === 'peso' ? 'PESO SAP (kg)' : 'PESO NETO (uds)' }}</span>
              <input
                v-if="f.tipo === 'peso'"
                v-model="f.pesoSap"
                type="number"
                min="0"
                step="0.01"
                class="form-input text-right"
              />
              <div v-else class="form-input-readonly text-right">{{ pesoNetoFila(f) || '0' }}</div>
            </div>

            <div class="col-span-4 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">PRECIO (€)</span>
              <input
                v-if="puedeEditar"
                v-model="f.precio"
                type="number"
                min="0"
                step="0.01"
                class="form-input text-right"
              />
              <div v-else class="form-input-readonly text-right">{{ f.precio || '0' }}</div>
            </div>

            <div class="col-span-4 md:col-span-1 flex flex-col gap-1">
              <span class="form-label">IMPORTE</span>
              <div class="form-input-readonly text-right font-semibold">{{ fmtMoney(importeFila(f)) }}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>

    <Card padding="md">
      <h3 class="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
        <span class="inline-block w-1 h-4 bg-slate-700 rounded-sm"></span>
        Transporte y totales
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-xs font-semibold text-slate-600">Temperatura de salida (°C)</span>
            <input v-model="tempSalida" type="number" step="0.1" class="form-input w-32 text-right" />
          </label>
          <div class="text-[11px] italic text-slate-500">Temperatura de transporte entre 1 y 4°C</div>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-xs font-semibold text-slate-600">Matrícula camión y remolque</span>
            <input v-model="matriculaCamion" type="text" class="form-input" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1 text-sm">
              <span class="text-xs font-semibold text-slate-600">DTO. LOGÍSTICO (%)</span>
              <input v-if="puedeEditar" v-model="dtoLogPct" type="number" step="0.01" class="form-input text-right" />
              <div v-else class="form-input-readonly text-right">{{ dtoLogPct }}</div>
            </div>
            <div class="flex flex-col gap-1 text-sm">
              <span class="text-xs font-semibold text-slate-600">IVA (%)</span>
              <input v-if="puedeEditar" v-model="ivaPct" type="number" step="0.01" class="form-input text-right" />
              <div v-else class="form-input-readonly text-right">{{ ivaPct }}</div>
            </div>
          </div>
        </div>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-600">Total bultos</span>
            <span class="font-bold text-slate-900">{{ totalBultos }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-600">Total importe bruto</span>
            <span class="font-semibold">{{ fmtMoney(totalImporteBruto) }}</span>
          </div>
          <div class="flex items-center justify-between text-slate-700">
            <span>Descuento logístico ({{ dtoLogPct }}%)</span>
            <span>− {{ fmtMoney(descuentoLogImporte) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-slate-200 pt-2">
            <span class="text-slate-600">Importe neto (menos dto. log.)</span>
            <span class="font-semibold">{{ fmtMoney(importeNeto) }}</span>
          </div>
          <div class="flex items-center justify-between text-slate-700">
            <span>IVA ({{ ivaPct }}%)</span>
            <span>+ {{ fmtMoney(ivaImporte) }}</span>
          </div>
          <div class="flex items-center justify-between border-t-2 border-slate-700 pt-2 mt-1">
            <span class="font-extrabold text-slate-900">TOTAL ALBARÁN</span>
            <span class="font-extrabold text-slate-900 text-base">{{ fmtMoney(totalAlbaran) }}</span>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.form-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.02em;
}
.form-input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  background: white;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  font-family: inherit;
  color: #0f172a;
}
.form-input:focus {
  border-color: #f59e0b;
  background: #fefce8;
}
.form-input-readonly {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  background: #f8fafc;
  color: #0f172a;
  font-family: inherit;
}
</style>
