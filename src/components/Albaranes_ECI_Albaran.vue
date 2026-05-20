<script setup>
import { computed } from 'vue'
import { Receipt, Printer, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import Button from './ui/Button.vue'
import PageHeader from './ui/PageHeader.vue'
import { useAlbaranEciStore } from '../stores/albaranEci'

const eciStore = useAlbaranEciStore()
const {
  proveedorNum, razonSocial, cliente, sucDpto, fechaEntrega, lugarEntrega,
  tempSalida, matriculaCamion, dtoLogPct, ivaPct,
  albaranes, activeIndex,
} = storeToRefs(eciStore)

const albaranActivo = computed(() => eciStore.albaranActivo)
const filas = computed(() => albaranActivo.value.filas)

function num(v) {
  if (v === '' || v === null || v === undefined) return 0
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function totalCajas(f) {
  return num(f.eci) + num(f.ocor) + num(f.scor) + num(f.cedial) + num(f.eciga)
}

function pesoNetoCalc(f) {
  if (f.tipo === 'peso') return num(f.pesoSap)
  return totalCajas(f) * num(f.udsCaja)
}

function importe(f) {
  return pesoNetoCalc(f) * num(f.precio)
}

function toggleTipo(i) {
  const f = albaranActivo.value.filas[i]
  f.tipo = f.tipo === 'peso' ? 'uds' : 'peso'
}

const totalBultos        = computed(() => filas.value.reduce((s, f) => s + totalCajas(f), 0))
const totalImporteBruto  = computed(() => filas.value.reduce((s, f) => s + importe(f), 0))
const descuentoLogImporte = computed(() => totalImporteBruto.value * num(dtoLogPct.value) / 100)
const importeNeto         = computed(() => totalImporteBruto.value - descuentoLogImporte.value)
const ivaImporte          = computed(() => importeNeto.value * num(ivaPct.value) / 100)
const totalAlbaran        = computed(() => importeNeto.value + ivaImporte.value)

function fmtMoney(n) {
  const v = Number(n) || 0
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function fmtNum(n, decimals = 2) {
  const v = Number(n) || 0
  return v.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function addFila() {
  eciStore.addFilaActivo()
}

function removeFila(i) {
  eciStore.removeFilaActivo(i)
}

function imprimir() {
  const styleEl = document.createElement('style')
  styleEl.id = 'albaran-print-orient'
  styleEl.textContent = '@page { size: A4 landscape; margin: 8mm; }'
  document.head.appendChild(styleEl)
  setTimeout(() => {
    window.print()
    setTimeout(() => styleEl.remove(), 100)
  }, 50)
}
</script>

<template>
  <div class="albaranes-eci-wrapper space-y-6">
    <div class="no-print">
      <PageHeader
        caption="Documentación"
        :caption-icon="Receipt"
        theme="slate"
        title="Albarán ECI"
        subtitle="Albarán para El Corte Inglés (CEPA / MERCAMADRID)"
      >
        <template #actions>
          <Button variant="secondary" @click="addFila">
            <Plus class="w-4 h-4" />
            Añadir fila
          </Button>
          <Button @click="imprimir">
            <Printer class="w-4 h-4" />
            Imprimir
          </Button>
        </template>
      </PageHeader>
    </div>

    <div v-if="albaranes.length > 1" class="no-print">
      <div class="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap">
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
    </div>

    <div class="albaran-eci-paper bg-white border border-slate-300 shadow-sm mx-auto" style="padding: 14px;">

      <div class="text-center font-extrabold tracking-wider mb-3" style="font-size: 22px;">ALBARÁN</div>

      <table class="w-full border-collapse text-xs mb-3">
        <tbody>
          <tr>
            <td class="px-2 py-1 font-bold whitespace-nowrap" style="width: 12%;">PROVEEDOR : Nº</td>
            <td class="p-0" style="width: 28%;">
              <input v-model="proveedorNum" type="text" class="w-full px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="px-2 py-1" style="width: 20%;"></td>
            <td class="px-2 py-1 font-bold text-right" style="width: 40%;">
              <input v-model="cliente" type="text" class="w-full px-2 py-1 text-right outline-none focus:bg-yellow-50 text-xs font-bold" />
            </td>
          </tr>
          <tr>
            <td class="px-2 py-1 font-bold whitespace-nowrap">RAZÓN SOCIAL</td>
            <td class="p-0" colspan="2">
              <input v-model="razonSocial" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="px-2 py-1 font-bold">
              <div class="flex items-center gap-2">
                <span class="whitespace-nowrap">SUC./DPTO. :</span>
                <input v-model="sucDpto" type="text" class="flex-1 px-2 py-1 outline-none focus:bg-yellow-50 text-xs text-right" />
              </div>
            </td>
          </tr>
          <tr>
            <td class="px-2 py-1 font-bold whitespace-nowrap">Nº PEDIDO :</td>
            <td class="p-0">
              <div class="flex">
                <input v-model="albaranActivo.numPedido" type="text" class="w-1/2 px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
                <input v-model="albaranActivo.numPedido2" type="text" class="w-1/2 px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
              </div>
            </td>
            <td class="px-2 py-1"></td>
            <td class="px-2 py-1 font-bold">
              <div class="flex items-center gap-2">
                <span class="whitespace-nowrap">FECHA ENTREGA :</span>
                <input v-model="fechaEntrega" type="date" class="flex-1 px-2 py-1 outline-none focus:bg-yellow-50 text-xs" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table class="w-full border-collapse text-xs mb-3">
        <tbody>
          <tr>
            <td class="px-2 py-1 font-bold text-right whitespace-nowrap" style="width: 14%;">nº DE ALBARÁN</td>
            <td class="p-0 border border-slate-400" :class="albaranActivo.errorAlbaran ? 'ring-2 ring-red-500 bg-red-50' : ''" :title="albaranActivo.errorAlbaran ? 'Hay más de 2 nº de albarán (Entrega) distintos en este pedido — revísalo' : ''" style="width: 16%;">
              <input v-model="albaranActivo.numAlbaran" type="text" class="w-full px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="px-2 py-1 font-bold text-right whitespace-nowrap" style="width: 14%;">Nº TRANSPORTE</td>
            <td class="p-0 border border-slate-400" :class="albaranActivo.errorTransporte ? 'ring-2 ring-red-500 bg-red-50' : ''" :title="albaranActivo.errorTransporte ? 'Hay más de 2 nº de transporte distintos en este pedido — revísalo' : ''" style="width: 16%;">
              <input v-model="albaranActivo.numTransporte" type="text" class="w-full px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="px-2 py-1 font-bold text-right whitespace-nowrap" style="width: 16%;">LUGAR DE ENTREGA :</td>
            <td class="p-0 border border-slate-400" style="width: 24%;">
              <input v-model="lugarEntrega" type="text" class="w-full px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs font-bold" />
            </td>
          </tr>
        </tbody>
      </table>

      <div class="eci-table-scroll">
        <table class="w-full border-collapse text-[10px] mb-3 eci-table">
          <thead>
            <tr class="bg-slate-100">
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 6%;">REF.<br>E.C.I.<br>(8 DÍGITOS)</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 13%;">ARTÍCULO</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 7%;">ORIGEN</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 7%;">¿PUEDE EL ARTÍCULO ENTRAR EN CANARIAS?. SI/NO</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 5%;">VARIEDAD</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 4%;">CATEGORÍA</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 5%;">CALIBRE</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 4%;">OFERTA</th>
              <th class="border border-slate-500 px-1 py-1" colspan="6">BULTOS / CESTAS</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 5%;">UNIDADES CAJA</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 4%;">TARA</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 6%;">PESO NETO (kg)<br>UNIDADES</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 4%;">PRECIO</th>
              <th class="border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 5%;">IMPORTE</th>
              <th class="no-print border border-slate-500 px-1 py-1 align-middle" rowspan="2" style="width: 3%;"></th>
            </tr>
            <tr class="bg-slate-100">
              <th class="border border-slate-500 px-1 py-1" style="width: 3%;">ECI</th>
              <th class="border border-slate-500 px-1 py-1" style="width: 3%;">OCOR</th>
              <th class="border border-slate-500 px-1 py-1" style="width: 3%;">SCOR</th>
              <th class="border border-slate-500 px-1 py-1" style="width: 3%;">CEDIAL</th>
              <th class="border border-slate-500 px-1 py-1" style="width: 3%;">ECIGA</th>
              <th class="border border-slate-500 px-1 py-1" style="width: 4%;">TOTAL<br>CAJAS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(f, i) in filas" :key="i">
              <td class="border border-slate-400 p-0"><input v-model="f.refEci" type="text" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.articulo" type="text" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.origen" type="text" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0">
                <select v-model="f.canarias" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-[10px] bg-white">
                  <option value=""></option>
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </td>
              <td class="border border-slate-400 p-0"><input v-model="f.variedad" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.categoria" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.calibre" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0">
                <select v-model="f.oferta" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-[10px] bg-white text-center">
                  <option value=""></option>
                  <option value="SI">SI</option>
                  <option value="NO">NO</option>
                </select>
              </td>
              <td class="border border-slate-400 p-0"><input v-model="f.eci" type="number" min="0" step="1" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.ocor" type="number" min="0" step="1" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.scor" type="number" min="0" step="1" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.cedial" type="number" min="0" step="1" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.eciga" type="number" min="0" step="1" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 px-1 py-1 text-center font-semibold bg-slate-50">{{ totalCajas(f) || '' }}</td>
              <td class="border border-slate-400 p-0"><input v-model="f.udsCaja" type="number" min="0" step="1" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0"><input v-model="f.tara" type="number" min="0" step="0.01" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 p-0">
                <div class="flex items-stretch">
                  <button
                    type="button"
                    @click="toggleTipo(i)"
                    :class="[
                      'no-print w-5 text-[8px] font-bold flex items-center justify-center border-r border-slate-300',
                      f.tipo === 'peso' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                    ]"
                    :title="f.tipo === 'peso' ? 'Al peso (peso SAP manual). Click para cambiar a uds.' : 'Por unidades (cajas × uds/caja). Click para cambiar a al peso.'"
                  >{{ f.tipo === 'peso' ? 'P' : 'U' }}</button>
                  <input
                    v-if="f.tipo === 'peso'"
                    v-model="f.pesoSap"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="kg SAP"
                    class="flex-1 w-full px-1 py-1 text-right outline-none focus:bg-yellow-50 text-[10px]"
                  />
                  <span v-else class="flex-1 px-1 py-1 text-right bg-slate-50 text-[10px]">{{ pesoNetoCalc(f) || '' }}</span>
                </div>
              </td>
              <td class="border border-slate-400 p-0"><input v-model="f.precio" type="number" min="0" step="0.01" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-[10px]" /></td>
              <td class="border border-slate-400 px-1 py-1 text-right bg-slate-50">{{ fmtNum(importe(f)) }}</td>
              <td class="no-print border border-slate-400 p-0 text-center">
                <button @click="removeFila(i)" class="text-slate-400 hover:text-red-600 p-1" title="Eliminar fila">
                  <Trash2 class="w-3 h-3 inline" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid grid-cols-12 gap-2 text-xs mb-2">
        <div class="col-span-6 space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold w-44">Temperatura de salida</span>
            <input v-model="tempSalida" type="number" step="0.1" class="w-20 bg-slate-100 border border-slate-400 px-2 py-1 text-right outline-none focus:bg-yellow-50" />
            <span class="font-semibold">°C</span>
          </div>
          <div class="text-[11px] italic font-semibold">Temperatura de transporte entre 1 y 4°C</div>
          <div class="flex items-center gap-2">
            <span class="font-semibold w-44">Matrícula camión y remolque</span>
            <input v-model="matriculaCamion" type="text" class="w-40 bg-slate-100 border border-slate-400 px-2 py-1 outline-none focus:bg-yellow-50" />
          </div>
          <div class="flex items-center gap-2 pt-1">
            <span class="font-bold w-44">DTO. LOGÍSTICO :</span>
            <div class="flex items-center gap-1">
              <input v-model="dtoLogPct" type="number" step="0.01" class="w-20 border border-slate-400 px-2 py-1 text-right outline-none focus:bg-yellow-50" />
              <span class="font-semibold">%</span>
            </div>
          </div>
        </div>

        <div class="col-span-2 flex flex-col gap-1">
          <div class="border border-slate-500 px-2 py-1 text-center font-bold">TOTAL BULTOS</div>
          <div class="border border-slate-500 px-2 py-1 text-center font-bold">{{ totalBultos }}</div>
          <div class="flex items-center gap-2 mt-2">
            <span class="font-bold">IVA :</span>
            <input v-model="ivaPct" type="number" step="0.01" class="w-16 border border-slate-400 px-2 py-1 text-right outline-none focus:bg-yellow-50" />
            <span class="font-semibold">%</span>
            <span class="ml-auto">{{ fmtMoney(ivaImporte) }}</span>
          </div>
        </div>

        <div class="col-span-4 space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-bold flex-1">TOTAL IMPORTE BRUTO</span>
            <span class="font-semibold">{{ fmtNum(totalImporteBruto) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-bold flex-1">DESCUENTO LOGISTICO ({{ dtoLogPct }})</span>
            <span class="font-semibold">{{ fmtMoney(descuentoLogImporte) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-bold flex-1">IMPORTE NETO (menos dto.Log)</span>
            <span class="font-semibold">{{ fmtMoney(importeNeto) }}</span>
          </div>
          <div class="flex items-center gap-2 border-t-2 border-slate-700 pt-1">
            <span class="font-extrabold flex-1">TOTAL ALBARÁN :</span>
            <span class="font-extrabold">{{ fmtMoney(totalAlbaran) }}</span>
          </div>
        </div>
      </div>

      <div class="text-[10px] mt-3 leading-snug">
        <p>Los datos de Origen, Variedad, Categoría y Calibre deberán ser los mismos que recoja la etiqueta de trazabilidad del producto.</p>
        <p>Correrán a cargo del proveedor todos los costes generados por el rechazo de la mercancía no susceptible de ser enviada a las Islas Canarias según la legislación vigente.</p>
      </div>

    </div>
  </div>
</template>

<style>
.eci-table-scroll {
  overflow-x: auto;
}
.eci-table {
  min-width: 1100px;
}
.eci-table input::-webkit-outer-spin-button,
.eci-table input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.eci-table input[type=number] {
  -moz-appearance: textfield;
}

@media print {
  body * {
    visibility: hidden;
  }
  .albaran-eci-paper, .albaran-eci-paper * {
    visibility: visible;
  }
  .albaran-eci-paper {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    border: none !important;
    box-shadow: none !important;
    padding: 8mm !important;
  }
  .no-print {
    display: none !important;
  }
  .eci-table-scroll {
    overflow: visible !important;
  }
  .eci-table {
    min-width: 0 !important;
    width: 100% !important;
  }
}
</style>
