<script setup>
import { ref } from 'vue'
import { FileText, Printer } from 'lucide-vue-next'
import Button from './ui/Button.vue'
import PageHeader from './ui/PageHeader.vue'

const lugarEntrega   = ref('')
const numPedido      = ref('')
const numAlbaran     = ref('')
const fechaEnvio     = ref('')
const fechaEntrega   = ref('')

const filas = ref(Array.from({ length: 6 }, () => ({
  codigo: '',
  descripcion: '',
  cajas: '',
  uds_caja: '',
  unidades: '',
  kg_netos: '',
})))

const numPrecinto    = ref('')
const horaSalida     = ref('')
const numSeguimiento = ref('')
const tempCarga      = ref('')
const totalPallets   = ref('')

const nombreConductor   = ref('')
const nombreEmpresa     = ref('')
const matriculaCamion   = ref('')
const matriculaRemolque = ref('')

function imprimir() {
  const styleEl = document.createElement('style')
  styleEl.id = 'albaran-print-orient'
  styleEl.textContent = '@page { size: A4 portrait; margin: 10mm; }'
  document.head.appendChild(styleEl)
  setTimeout(() => {
    window.print()
    setTimeout(() => styleEl.remove(), 100)
  }, 50)
}
</script>

<template>
  <div class="albaranes-wrapper space-y-8">
    <div class="no-print">
      <PageHeader
        caption="Documentación"
        :caption-icon="FileText"
        theme="slate"
        title="Albarán Manual"
        subtitle="Rellenar y imprimir albarán Surexport"
      >
        <template #actions>
          <Button @click="imprimir">
            <Printer class="w-4 h-4" />
            Imprimir
          </Button>
        </template>
      </PageHeader>
    </div>

    <div class="albaran-paper bg-white border border-slate-300 shadow-sm mx-auto" style="max-width: 820px; padding: 20px;">

      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center" style="width: 50%;">
          <img src="/logo-surexport.png" alt="Surexport Levante" style="max-width: 280px; max-height: 90px;" />
        </div>
        <div class="text-xs leading-tight" style="text-align: right;">
          <div class="bg-red-700 text-white font-bold px-2 py-0.5 inline-block">Surexport Levante S.L.U</div>
          <div class="mt-1">POLIG IND.EL OLIVERAL CALLE H, Nº 8</div>
          <div>46334 RIBA-ROJA DE TURIA - (VALENCIA)</div>
          <div>C.I.F.: B87635672</div>
          <div>TEL: 962.786.227</div>
        </div>
      </div>

      <div class="flex gap-4 mb-3">
        <div style="width: 50%;">
          <div class="text-xs font-semibold mb-1">Lugar de entrega:</div>
          <textarea
            v-model="lugarEntrega"
            class="w-full border border-slate-400 px-2 py-1 text-xs resize-none"
            rows="4"
          />
        </div>
        <div style="width: 50%;" class="text-xs space-y-1.5 pl-4">
          <div class="flex">
            <span class="font-semibold w-32">Núm. de pedido:</span>
            <input v-model="numPedido" type="text" class="flex-1 border-b border-slate-400 px-1 outline-none focus:bg-yellow-50" />
          </div>
          <div class="flex">
            <span class="font-semibold w-32">Núm. de albarán:</span>
            <input v-model="numAlbaran" type="text" class="flex-1 border-b border-slate-400 px-1 outline-none focus:bg-yellow-50" />
          </div>
          <div class="flex">
            <span class="font-semibold w-32">Fecha de envío:</span>
            <input v-model="fechaEnvio" type="date" class="flex-1 border-b border-slate-400 px-1 outline-none focus:bg-yellow-50" />
          </div>
          <div class="flex">
            <span class="font-semibold w-32">Fecha de entrega:</span>
            <input v-model="fechaEntrega" type="date" class="flex-1 border-b border-slate-400 px-1 outline-none focus:bg-yellow-50" />
          </div>
        </div>
      </div>

      <table class="w-full border-collapse text-xs mb-4">
        <thead>
          <tr class="bg-slate-200">
            <th colspan="6" class="border border-slate-500 py-1 font-bold">Detalle producto</th>
          </tr>
          <tr class="bg-slate-100">
            <th class="border border-slate-500 px-1 py-1 font-bold" style="width: 12%;">Código Prod.</th>
            <th class="border border-slate-500 px-1 py-1 font-bold" style="width: 38%;">Descripción</th>
            <th class="border border-slate-500 px-1 py-1 font-bold" style="width: 10%;">Cajas entregadas</th>
            <th class="border border-slate-500 px-1 py-1 font-bold" style="width: 8%;">Ud/c</th>
            <th class="border border-slate-500 px-1 py-1 font-bold" style="width: 16%;">Unidades entregadas</th>
            <th class="border border-slate-500 px-1 py-1 font-bold" style="width: 16%;">Kg Netos entregados</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(f, i) in filas" :key="i">
            <td class="border border-slate-400 p-0">
              <input v-model="f.codigo" type="text" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="border border-slate-400 p-0">
              <input v-model="f.descripcion" type="text" class="w-full px-1 py-1 outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="border border-slate-400 p-0">
              <input v-model="f.cajas" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="border border-slate-400 p-0">
              <input v-model="f.uds_caja" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="border border-slate-400 p-0">
              <input v-model="f.unidades" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
            <td class="border border-slate-400 p-0">
              <input v-model="f.kg_netos" type="text" class="w-full px-1 py-1 text-center outline-none focus:bg-yellow-50 text-xs" />
            </td>
          </tr>
        </tbody>
      </table>

      <div class="flex gap-4 mb-4">
        <table class="border-collapse text-xs" style="width: 55%;">
          <tbody>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50" style="width: 50%;">Número de precinto:</td>
              <td class="border border-slate-400 p-0"><input v-model="numPrecinto" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Hora de salida:</td>
              <td class="border border-slate-400 p-0"><input v-model="horaSalida" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Nº de seguimiento:</td>
              <td class="border border-slate-400 p-0"><input v-model="numSeguimiento" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Temperatura de carga:</td>
              <td class="border border-slate-400 p-0"><input v-model="tempCarga" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Total Pallets:</td>
              <td class="border border-slate-400 p-0"><input v-model="totalPallets" type="text" class="w-full px-2 py-1 text-center outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
          </tbody>
        </table>
        <div class="border border-slate-400 flex flex-col" style="width: 45%;">
          <div class="bg-slate-50 px-2 py-1 text-xs font-semibold border-b border-slate-400 text-center">Sello</div>
          <div class="flex-1 min-h-[100px]"></div>
        </div>
      </div>

      <div class="flex gap-3">
        <div class="flex flex-col" style="width: 50%;">
          <div class="border border-slate-400 px-3 py-2 text-xs text-center font-semibold mb-2">
            <p>Todos los pallets se hallan correctamente apilados,</p>
            <p>embalados y adecuados para su uso. Todo el envase</p>
            <p>se halla intacto para su uso.</p>
            <p>Temperatura de transporte entre 1 y 4°C.</p>
          </div>
          <table class="border-collapse text-xs flex-1">
            <tbody>
              <tr>
                <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50" style="width: 40%;">Firma proveedor:</td>
                <td class="border border-slate-400 px-2 py-1" style="height: 50px;"></td>
              </tr>
              <tr>
                <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Firma cliente:</td>
                <td class="border border-slate-400 px-2 py-1" style="height: 50px;"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <table class="border-collapse text-xs" style="width: 50%;">
          <tbody>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50" style="width: 45%;">Nombre conductor:</td>
              <td class="border border-slate-400 p-0"><input v-model="nombreConductor" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Firma conductor:</td>
              <td class="border border-slate-400 px-2 py-1" style="height: 40px;"></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Nombre empresa<br>de transporte:</td>
              <td class="border border-slate-400 p-0"><input v-model="nombreEmpresa" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Matrícula<br>camión:</td>
              <td class="border border-slate-400 p-0"><input v-model="matriculaCamion" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
            <tr>
              <td class="border border-slate-400 px-2 py-1 font-semibold bg-slate-50">Matrícula<br>remolque:</td>
              <td class="border border-slate-400 p-0"><input v-model="matriculaRemolque" type="text" class="w-full px-2 py-1 outline-none focus:bg-yellow-50 text-xs" /></td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
</template>

<style>
@media print {
  body * {
    visibility: hidden;
  }
  .albaran-paper, .albaran-paper * {
    visibility: visible;
  }
  .albaran-paper {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    border: none !important;
    box-shadow: none !important;
    padding: 10mm !important;
  }
  .no-print {
    display: none !important;
  }
}
</style>
