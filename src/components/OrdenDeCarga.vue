<script setup>
import { ref, computed } from 'vue';
import { useLogisticsStore } from '../stores/logistics';
import { supabaseOrigen } from '../lib/supabase';
import { Truck, AlertCircle, RefreshCw, FileDown, CheckCircle, XCircle } from 'lucide-vue-next';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

async function addTransportistasPages(doc, datosParaPDF) {
  const destinos = [...new Set(datosParaPDF.map(f => f.nombreDestino).filter(Boolean))];
  if (destinos.length === 0) return;

  const { data: matches, error: errMatch } = await supabaseOrigen
    .from('plataformas')
    .select('empresa_transporte')
    .in('nombre_csv', destinos)
    .eq('activo', true);

  if (errMatch) throw errMatch;

  const empresas = [...new Set((matches || []).map(p => p.empresa_transporte).filter(Boolean))].sort();
  if (empresas.length === 0) return;

  for (const empresa of empresas) {
    const { data: plats, error: errPlats } = await supabaseOrigen
      .from('plataformas')
      .select('nombre, direccion, limite_hora_entrega')
      .eq('empresa_transporte', empresa)
      .eq('activo', true)
      .order('nombre');

    if (errPlats) throw errPlats;
    if (!plats || plats.length === 0) continue;

    doc.addPage();
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`TRANSPORTISTA: ${empresa}`, 14, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${plats.length} plataformas`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Plataforma', 'Dirección', 'Hora límite entrega']],
      body: plats.map(p => [
        p.nombre || '',
        p.direccion || '',
        p.limite_hora_entrega ? String(p.limite_hora_entrega).slice(0, 5) : '',
      ]),
      margin: { top: 28, right: 14, bottom: 14, left: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: 'bold' },
        1: { cellWidth: 100 },
        2: { cellWidth: 28, halign: 'center' },
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [240, 244, 248],
      },
    });
  }
}

const store = useLogisticsStore();
const error = ref('');
const filtroRuta = ref(null);
const toast = ref(null);
const toastType = ref('success');

const COLUMNAS = [
  { key: 'nombreDestino',    label: 'Destino',             width: 'w-[14%]', editable: false },
  { key: 'fechaEntrega',     label: 'F. Entrega',          width: 'w-[7%]',  editable: false },
  { key: 'salidaMercancias', label: 'Salida Merc.',        width: 'w-[7%]',  editable: false },
  { key: 'motivoPedido',     label: 'Motivo',              width: 'w-[6%]',  editable: false },
  { key: 'denominacion',     label: 'Denominación',        width: 'w-[16%]', editable: false },
  { key: 'cantidadPedido',   label: 'Cant.',               width: 'w-[5%]',  editable: false },
  { key: 'agenteServicios',  label: 'Agente Serv.',        width: 'w-[12%]', editable: false },
  { key: 'ruta',             label: 'Ruta',                width: 'w-[6%]',  editable: false },
  { key: 'transporte',       label: 'Transporte',          width: 'w-[8%]',  editable: false },
  { key: 'numeroEntrega',    label: 'Nº Entrega',          width: 'w-[8%]',  editable: false },
  { key: 'huecos',           label: 'Huecos',              width: 'w-[5%]',  editable: true },
];

const ordenSAP = [
  'nombreDestino',
  'fechaEntrega',
  'salidaMercancias',
  'motivoPedido',
  'denominacion',
  'cantidadPedido',
  'agenteServicios',
  'ruta',
  'transporte',
  'numeroEntrega',
];

function showToast(message, type = 'success') {
  toast.value = message;
  toastType.value = type;
  setTimeout(() => {
    toast.value = null;
  }, 3500);
}

function handlePaste(event) {
  event.preventDefault();
  error.value = '';
  filtroRuta.value = null;

  const texto = event.clipboardData.getData('text');
  const lineas = texto.trim().split(/[\r\n]+/).filter(l => l.trim());

  if (lineas.length === 0) {
    error.value = 'Pega al menos una fila de datos.';
    showToast('❌ No hay datos para pegar', 'error');
    return;
  }

  const sep = lineas[0].includes('\t') ? '\t' : '|';
  const filas = [];

  for (let i = 0; i < lineas.length; i++) {
    const celdas = lineas[i].split(sep).map(c => c.trim());

    if (celdas.length === 0) continue;

    const fila = {};

    ordenSAP.forEach((key, idx) => {
      if (key && idx < celdas.length) {
        fila[key] = celdas[idx];
      }
    });

    fila.huecos = '';

    if (Object.values(fila).some(v => v !== '')) {
      filas.push(fila);
    }
  }

  if (filas.length === 0) {
    error.value = 'No se han encontrado filas con datos.';
    showToast('❌ No se encontraron datos válidos', 'error');
    return;
  }

  store.setOrdenCarga(filas);
  error.value = '';
  showToast(`✅ ${filas.length} filas cargadas correctamente`, 'success');
}

function limpiar() {
  error.value = '';
  filtroRuta.value = null;
  store.setOrdenCarga([]);
  showToast('🔄 Carga limpiada', 'success');
}

const filas = computed(() => store.ordenCargaData);
const hayDatos = computed(() => filas.value.length > 0);

const filasVisibles = computed(() => {
  if (!filtroRuta.value) return filas.value;
  if (filtroRuta.value === 'DHL001') return filas.value.filter(f => f.ruta === 'DHL001');
  if (filtroRuta.value === 'INNOVA') return filas.value.filter(f => rutasINNOVA.includes(f.ruta));
  if (filtroRuta.value === 'MOSCA') return filas.value.filter(f => rutasMOSCA.includes(f.ruta));
  return filas.value;
});

const normalizarFecha = (fecha) => {
  if (!fecha) return '';

  const partes = fecha.match(/(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4})|(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (!partes) return fecha;

  if (partes[1]) {
    return `${partes[1]}-${partes[2]}-${partes[3]}`;
  } else if (partes[4]) {
    const [, dia, mes, year] = partes;
    return `${year}-${mes}-${dia}`;
  } else if (partes[7]) {
    const [, , , , , , , dia, mes, year] = partes;
    return `${year}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return fecha;
};

const filasParaPDF = computed(() => {
  return filas.value.filter(f => {
    const esRutaDHL = f.ruta === 'DHL001';
    const fechaSalida = f.salidaMercancias || '';

    const partesFecha = fechaSalida.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})/);
    let fechaFormato = '';
    if (partesFecha) {
      const [, dia, mes, year] = partesFecha;
      fechaFormato = `${year}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }

    const fechaCoincide = fechaFormato === store.fecha;

    return esRutaDHL && fechaCoincide;
  });
});

const totalCantidad = computed(() =>
  filasVisibles.value.reduce((sum, f) => sum + (parseFloat(f.cantidadPedido) || 0), 0)
);

const cantidadDHL = computed(() => {
  return filas.value.filter(f => f.ruta === 'DHL001').length;
});

const rutasINNOVA = ['ZGENER', 'SLV022', 'SLV015', 'SLV021', 'SLV020', 'SLV019'];
const rutasMOSCA = ['SLV001', 'SLV002', 'SLV003', 'SLV004', 'SLV005'];

const filasParaPDFInnnova = computed(() => {
  return filas.value.filter(f => rutasINNOVA.includes(f.ruta));
});

const cantidadINNOVA = computed(() => {
  return filas.value.filter(f => rutasINNOVA.includes(f.ruta)).length;
});

const filasParaPDFMosca = computed(() => {
  return filas.value.filter(f => rutasMOSCA.includes(f.ruta));
});

const cantidadMOSCA = computed(() => {
  return filas.value.filter(f => rutasMOSCA.includes(f.ruta)).length;
});

async function generarPDF() {
  try {
    const datosParaPDF = filasParaPDF.value;

    if (datosParaPDF.length === 0) {
      error.value = 'No hay datos de DHL001 que coincidan con la fecha de operaciones.';
      showToast('❌ No hay datos DHL001 para la fecha ' + store.fecha, 'error');
      return;
    }

    const doc = new jsPDF();
    const fechaFormatada = new Date(store.fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const totalHuecos = datosParaPDF.reduce((sum, fila) => sum + (parseInt(fila.huecos) || 0), 0);

    doc.setFontSize(16);
    doc.text('ORDEN DE CARGA DHL', 14, 15);

    doc.setFontSize(10);
    doc.text(`Fecha de carga: ${fechaFormatada}`, 14, 25);
    doc.text(`Total huecos: ${totalHuecos}`, 14, 32);

    const columnasPDF = [
      { header: 'Nombre Destino', dataKey: 'nombreDestino' },
      { header: 'Fecha Entrega', dataKey: 'fechaEntrega' },
      { header: 'Fecha Carga', dataKey: 'salidaMercancias' },
      { header: 'Denominación', dataKey: 'denominacion' },
      { header: 'Cantidad', dataKey: 'cantidadPedido' },
      { header: 'Agente Servicios', dataKey: 'agenteServicios' },
      { header: 'Transporte', dataKey: 'transporte' },
      { header: 'Huecos', dataKey: 'huecos' },
    ];

    autoTable(doc, {
      columns: columnasPDF,
      body: datosParaPDF.map(fila => ({
        nombreDestino: fila.nombreDestino || '',
        fechaEntrega: fila.fechaEntrega || '',
        salidaMercancias: fila.salidaMercancias || '',
        denominacion: fila.denominacion || '',
        cantidadPedido: fila.cantidadPedido || '',
        agenteServicios: fila.agenteServicios || '',
        transporte: fila.transporte || '',
        huecos: fila.huecos || '',
      })),
      startY: 40,
      margin: { top: 40, right: 14, bottom: 14, left: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        cellWidth: 'wrap',
      },
      columnStyles: {
        nombreDestino: { cellWidth: 35 },
        fechaEntrega: { cellWidth: 20 },
        salidaMercancias: { cellWidth: 20 },
        denominacion: { cellWidth: 30 },
        cantidadPedido: { cellWidth: 13 },
        agenteServicios: { cellWidth: 28 },
        transporte: { cellWidth: 16 },
        huecos: { cellWidth: 12, halign: 'center' },
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        overflow: 'linebreak',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [240, 244, 248],
      },
    });

    const finalY = doc.lastAutoTable.finalY || 40;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL HUECOS: ${totalHuecos}`, 14, finalY + 10);

    await addTransportistasPages(doc, datosParaPDF);

    const nombreArchivo = `DHL001_${store.fecha}.pdf`;
    doc.save(nombreArchivo);
    showToast(`✅ PDF DHL001 descargado: ${nombreArchivo}`, 'success');
  } catch (err) {
    showToast('❌ Error generando PDF: ' + err.message, 'error');
  }
}

function filtrarPorDHL() {
  filtroRuta.value = 'DHL001';
}

function filtrarPorINNOVA() {
  filtroRuta.value = 'INNOVA';
}

function filtrarPorMOSCA() {
  filtroRuta.value = 'MOSCA';
}

function limpiarFiltro() {
  filtroRuta.value = null;
}

function handleHuecosKeydown(event, rowIdx) {
  if (event.key === 'Enter') {
    event.preventDefault();

    const nextRowIdx = rowIdx + 1;
    if (nextRowIdx < filasVisibles.value.length) {
      setTimeout(() => {
        const inputs = document.querySelectorAll('input[data-huecos-input]');
        if (inputs[nextRowIdx]) {
          inputs[nextRowIdx].focus();
        }
      }, 0);
    }
  }
}

async function guardarOrden(tipoCarga = 'DHL001') {
  try {
    error.value = '';
    const resultado = await store.guardarOrdenCarga(tipoCarga);

    if (resultado.success) {
      showToast(`✅ Orden ${tipoCarga} guardada exitosamente`, 'success');
      await store.cargarOrdenesCarga();
    } else {
      error.value = `Error al guardar: ${resultado.error}`;
      showToast(`❌ Error: ${resultado.error}`, 'error');
    }
  } catch (err) {
    error.value = `Error: ${err.message}`;
    showToast(`❌ Error al guardar orden: ${err.message}`, 'error');
  }
}

async function generarPDFInnnova() {
  try {
    const datosParaPDF = filasParaPDFInnnova.value;

    if (datosParaPDF.length === 0) {
      error.value = 'No hay datos INNOVA cargados.';
      showToast('❌ No hay datos INNOVA', 'error');
      return;
    }

    const doc = new jsPDF();
    const fechaFormatada = new Date(store.fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const totalHuecos = datosParaPDF.reduce((sum, fila) => sum + (parseInt(fila.huecos) || 0), 0);

    doc.setFontSize(16);
    doc.text('ORDEN DE CARGA INNOVA', 14, 15);

    doc.setFontSize(10);
    doc.text(`Fecha de carga: ${fechaFormatada}`, 14, 25);
    doc.text(`Total huecos: ${totalHuecos}`, 14, 32);

    const columnasPDF = [
      { header: 'Nombre Destino', dataKey: 'nombreDestino' },
      { header: 'Fecha Entrega', dataKey: 'fechaEntrega' },
      { header: 'Fecha Carga', dataKey: 'salidaMercancias' },
      { header: 'Denominación', dataKey: 'denominacion' },
      { header: 'Cantidad', dataKey: 'cantidadPedido' },
      { header: 'Agente Servicios', dataKey: 'agenteServicios' },
      { header: 'Transporte', dataKey: 'transporte' },
      { header: 'Huecos', dataKey: 'huecos' },
    ];

    autoTable(doc, {
      columns: columnasPDF,
      body: datosParaPDF.map(fila => ({
        nombreDestino: fila.nombreDestino || '',
        fechaEntrega: fila.fechaEntrega || '',
        salidaMercancias: fila.salidaMercancias || '',
        denominacion: fila.denominacion || '',
        cantidadPedido: fila.cantidadPedido || '',
        agenteServicios: fila.agenteServicios || '',
        transporte: fila.transporte || '',
        huecos: fila.huecos || '',
      })),
      startY: 40,
      margin: { top: 40, right: 14, bottom: 14, left: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        cellWidth: 'wrap',
      },
      columnStyles: {
        nombreDestino: { cellWidth: 35 },
        fechaEntrega: { cellWidth: 20 },
        salidaMercancias: { cellWidth: 20 },
        denominacion: { cellWidth: 30 },
        cantidadPedido: { cellWidth: 13 },
        agenteServicios: { cellWidth: 28 },
        transporte: { cellWidth: 16 },
        huecos: { cellWidth: 12, halign: 'center' },
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        overflow: 'linebreak',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [240, 244, 248],
      },
    });

    const finalY = doc.lastAutoTable.finalY || 40;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL HUECOS: ${totalHuecos}`, 14, finalY + 10);

    await addTransportistasPages(doc, datosParaPDF);

    const nombreArchivo = `INNOVA_${store.fecha}.pdf`;
    doc.save(nombreArchivo);
    showToast(`✅ PDF INNOVA descargado: ${nombreArchivo}`, 'success');
  } catch (err) {
    showToast('❌ Error generando PDF: ' + err.message, 'error');
  }
}

async function generarPDFMosca() {
  try {
    const datosParaPDF = filasParaPDFMosca.value;

    if (datosParaPDF.length === 0) {
      error.value = 'No hay datos MOSCA cargados.';
      showToast('❌ No hay datos MOSCA', 'error');
      return;
    }

    const doc = new jsPDF();
    const fechaFormatada = new Date(store.fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const totalHuecos = datosParaPDF.reduce((sum, fila) => sum + (parseInt(fila.huecos) || 0), 0);

    doc.setFontSize(16);
    doc.text('ORDEN DE CARGA MOSCA', 14, 15);

    doc.setFontSize(10);
    doc.text(`Fecha de carga: ${fechaFormatada}`, 14, 25);
    doc.text(`Total huecos: ${totalHuecos}`, 14, 32);

    const columnasPDF = [
      { header: 'Nombre Destino', dataKey: 'nombreDestino' },
      { header: 'Fecha Entrega', dataKey: 'fechaEntrega' },
      { header: 'Fecha Carga', dataKey: 'salidaMercancias' },
      { header: 'Denominación', dataKey: 'denominacion' },
      { header: 'Cantidad', dataKey: 'cantidadPedido' },
      { header: 'Agente Servicios', dataKey: 'agenteServicios' },
      { header: 'Transporte', dataKey: 'transporte' },
      { header: 'Huecos', dataKey: 'huecos' },
    ];

    autoTable(doc, {
      columns: columnasPDF,
      body: datosParaPDF.map(fila => ({
        nombreDestino: fila.nombreDestino || '',
        fechaEntrega: fila.fechaEntrega || '',
        salidaMercancias: fila.salidaMercancias || '',
        denominacion: fila.denominacion || '',
        cantidadPedido: fila.cantidadPedido || '',
        agenteServicios: fila.agenteServicios || '',
        transporte: fila.transporte || '',
        huecos: fila.huecos || '',
      })),
      startY: 40,
      margin: { top: 40, right: 14, bottom: 14, left: 14 },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        cellWidth: 'wrap',
      },
      columnStyles: {
        nombreDestino: { cellWidth: 35 },
        fechaEntrega: { cellWidth: 20 },
        salidaMercancias: { cellWidth: 20 },
        denominacion: { cellWidth: 30 },
        cantidadPedido: { cellWidth: 13 },
        agenteServicios: { cellWidth: 28 },
        transporte: { cellWidth: 16 },
        huecos: { cellWidth: 12, halign: 'center' },
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        overflow: 'linebreak',
        fontSize: 8,
        halign: 'left',
        valign: 'middle',
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [240, 244, 248],
      },
    });

    const finalY = doc.lastAutoTable.finalY || 40;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL HUECOS: ${totalHuecos}`, 14, finalY + 10);

    await addTransportistasPages(doc, datosParaPDF);

    const nombreArchivo = `MOSCA_${store.fecha}.pdf`;
    doc.save(nombreArchivo);
    showToast(`✅ PDF MOSCA descargado: ${nombreArchivo}`, 'success');
  } catch (err) {
    showToast('❌ Error generando PDF: ' + err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- TOAST NOTIFICATION -->
    <transition name="slide-in">
      <div
        v-if="toast"
        :class="[
          'fixed top-6 right-6 flex items-center gap-3 px-6 py-4 rounded-xl shadow-lg border animate-slide-in',
          toastType === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-red-50 border-red-200 text-red-900'
        ]"
      >
        <component
          :is="toastType === 'success' ? CheckCircle : XCircle"
          class="w-5 h-5 flex-shrink-0"
        />
        <span class="font-medium text-sm">{{ toast }}</span>
      </div>
    </transition>

    <!-- HEADER -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="bg-gradient-to-br from-blue-600 to-indigo-700 p-3 rounded-xl">
          <Truck class="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 class="font-900 text-slate-900 text-lg">Orden de Carga</h2>
          <p class="text-sm text-slate-500 font-medium">
            {{ hayDatos ? `${filas.length} posiciones cargadas` : 'Haz clic y pega datos con Ctrl+V' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap justify-end">
        <button
          v-if="hayDatos && !filtroRuta"
          @click="filtrarPorDHL"
          :class="['flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-amber-500',
            cantidadDHL > 0 ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300' : 'bg-slate-100 text-slate-400 cursor-not-allowed']"
          :disabled="cantidadDHL === 0"
        >
          DHL001 ({{ cantidadDHL }})
        </button>
        <button
          v-if="hayDatos && !filtroRuta"
          @click="filtrarPorINNOVA"
          :class="['flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-violet-500',
            cantidadINNOVA > 0 ? 'bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-300' : 'bg-slate-100 text-slate-400 cursor-not-allowed']"
          :disabled="cantidadINNOVA === 0"
        >
          INNOVA ({{ cantidadINNOVA }})
        </button>
        <button
          v-if="hayDatos && !filtroRuta"
          @click="filtrarPorMOSCA"
          :class="['flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-teal-500',
            cantidadMOSCA > 0 ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 border border-teal-300' : 'bg-slate-100 text-slate-400 cursor-not-allowed']"
          :disabled="cantidadMOSCA === 0"
        >
          MOSCA ({{ cantidadMOSCA }})
        </button>
        <button
          v-if="filtroRuta === 'DHL001'"
          @click="generarPDF"
          :class="['flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-all focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500',
            filasParaPDF.length > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed']"
          :disabled="filasParaPDF.length === 0"
          :title="filasParaPDF.length === 0 ? `No hay datos DHL001 con fecha ${store.fecha}` : 'Descargar PDF DHL001'"
        >
          <FileDown class="w-4 h-4" />
          PDF ({{ filasParaPDF.length }})
        </button>
        <button
          v-if="filtroRuta === 'INNOVA'"
          @click="generarPDFInnnova"
          :class="['flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-all focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500',
            filasParaPDFInnnova.length > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed']"
          :disabled="filasParaPDFInnnova.length === 0"
          :title="filasParaPDFInnnova.length === 0 ? 'No hay datos INNOVA' : 'Descargar PDF INNOVA'"
        >
          <FileDown class="w-4 h-4" />
          PDF ({{ filasParaPDFInnnova.length }})
        </button>
        <button
          v-if="filtroRuta === 'MOSCA'"
          @click="generarPDFMosca"
          :class="['flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-all focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500',
            filasParaPDFMosca.length > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed']"
          :disabled="filasParaPDFMosca.length === 0"
          :title="filasParaPDFMosca.length === 0 ? 'No hay datos MOSCA' : 'Descargar PDF MOSCA'"
        >
          <FileDown class="w-4 h-4" />
          PDF ({{ filasParaPDFMosca.length }})
        </button>
        <button
          v-if="filtroRuta"
          @click="limpiarFiltro"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-slate-500"
        >
          Mostrar todo
        </button>
        <button
          v-if="hayDatos && cantidadDHL > 0"
          @click="guardarOrden('DHL001')"
          :disabled="store.loading"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          💾 Guardar DHL
        </button>
        <button
          v-if="hayDatos && cantidadINNOVA > 0"
          @click="guardarOrden('INNOVA')"
          :disabled="store.loading"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          💾 Guardar INNOVA
        </button>
        <button
          v-if="hayDatos && cantidadMOSCA > 0"
          @click="guardarOrden('MOSCA')"
          :disabled="store.loading"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
        >
          💾 Guardar MOSCA
        </button>
        <button
          v-if="hayDatos"
          @click="limpiar"
          class="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          <RefreshCw class="w-4 h-4" />
          Nueva carga
        </button>
      </div>
    </div>

    <!-- TABLA -->
    <div
      class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-md"
      @paste="handlePaste"
    >
      <div class="max-h-[600px] overflow-y-auto">
        <table class="w-full text-sm border-collapse table-fixed">

          <!-- ENCABEZADOS -->
          <thead>
            <tr>
              <th class="sticky left-0 z-10 bg-gradient-to-r from-slate-900 to-slate-800 text-slate-200 font-bold uppercase tracking-wider px-3 py-3.5 text-center w-10 border-r border-slate-700">
                #
              </th>
              <th
                v-for="col in COLUMNAS"
                :key="col.key"
                :class="['bg-gradient-to-r from-slate-900 to-slate-800 text-slate-200 font-bold uppercase tracking-wider px-4 py-3.5 text-left whitespace-nowrap border-r border-slate-700 last:border-r-0', col.width]"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>

          <!-- CUERPO -->
          <tbody>

            <!-- ESTADO VACÍO -->
            <template v-if="!hayDatos">
              <tr v-for="n in 8" :key="n" :class="n % 2 === 0 ? 'bg-slate-50' : 'bg-white'">
                <td class="sticky left-0 z-10 px-3 py-3 text-center text-slate-200 font-mono font-bold border-r border-slate-100"
                    :class="n % 2 === 0 ? 'bg-slate-50' : 'bg-white'">
                  {{ n }}
                </td>
                <td v-for="col in COLUMNAS" :key="col.key"
                    class="px-4 py-3 border-r border-slate-100 last:border-r-0">
                  <div class="h-3 rounded bg-slate-200/50" :style="{ width: n % 3 === 0 ? '60%' : n % 2 === 0 ? '80%' : '40%' }" />
                </td>
              </tr>

              <!-- Overlay mensaje vacío -->
              <tr>
                <td :colspan="COLUMNAS.length + 1" class="py-0">
                  <div class="flex flex-col items-center justify-center py-20 -mt-[calc(8*2.75rem)]">
                    <div class="bg-blue-100/30 p-4 rounded-full mb-4">
                      <Truck class="w-12 h-12 text-blue-600 animate-pulse-slow" />
                    </div>
                    <p class="font-bold text-slate-600 uppercase tracking-widest text-base">Sin datos cargados</p>
                    <p class="text-slate-500 text-sm mt-2 font-medium">Haz clic aquí y pega tus datos desde SAP (Ctrl+V)</p>
                    <p class="text-slate-400 text-xs mt-1">Solo las filas de datos, sin encabezados</p>
                    <div v-if="error" class="mt-4 flex items-center gap-2 text-red-600 text-sm font-semibold bg-red-50 px-4 py-2.5 rounded-lg max-w-md border border-red-200">
                      <AlertCircle class="w-4 h-4 shrink-0" />
                      <span>{{ error }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>

            <!-- FILAS CON DATOS -->
            <template v-else>
              <tr
                v-for="(fila, idx) in filasVisibles"
                :key="idx"
                :class="[
                  'border-t border-slate-100 transition-colors duration-150',
                  filtroRuta === 'DHL001' && fila.ruta === 'DHL001' ? 'bg-amber-50/80 hover:bg-amber-100/60' : filtroRuta === 'MOSCA' && rutasMOSCA.includes(fila.ruta) ? 'bg-teal-50/80 hover:bg-teal-100/60' : (idx % 2 === 0 ? 'bg-white hover:bg-blue-50/40' : 'bg-slate-50/60 hover:bg-blue-50/40')
                ]"
              >
                <td :class="['sticky left-0 z-10 px-3 py-2.5 text-center text-slate-400 font-mono font-semibold text-xs border-r border-slate-100',
                  filtroRuta === 'DHL001' && fila.ruta === 'DHL001' ? 'bg-amber-50/80' : filtroRuta === 'MOSCA' && rutasMOSCA.includes(fila.ruta) ? 'bg-teal-50/80' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60')]">
                  {{ filas.indexOf(fila) + 1 }}
                </td>
                <td
                  v-for="col in COLUMNAS"
                  :key="col.key"
                  class="px-4 py-2.5 border-r border-slate-100 last:border-r-0 transition-colors duration-150"
                  :class="{
                    'break-words': col.key === 'nombreDestino' || col.key === 'denominacion',
                    'bg-blue-50 border-l-2 border-l-blue-400': col.key === 'huecos' && filtroRuta === 'DHL001',
                    'bg-violet-50 border-l-2 border-l-violet-400': col.key === 'huecos' && filtroRuta === 'INNOVA',
                    'bg-teal-50 border-l-2 border-l-teal-400': col.key === 'huecos' && filtroRuta === 'MOSCA',
                    'bg-slate-50 border-l-2 border-l-slate-300': col.key === 'huecos' && !filtroRuta,
                  }"
                >
                  <template v-if="col.editable && col.key === 'huecos'">
                    <input
                      v-model="fila[col.key]"
                      type="text"
                      data-huecos-input
                      @keydown.enter="handleHuecosKeydown($event, idx)"
                      class="w-full px-3 py-2 border border-slate-300 rounded-lg text-center font-bold text-sm transition-all bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:border-transparent"
                      :class="{
                        'focus:ring-blue-400': filtroRuta === 'DHL001',
                        'focus:ring-violet-400': filtroRuta === 'INNOVA',
                        'focus:ring-teal-400': filtroRuta === 'MOSCA',
                        'focus:ring-slate-300': !filtroRuta,
                      }"
                      placeholder="—"
                    />
                  </template>
                  <template v-else>
                    <span :class="{
                      'font-bold text-slate-900 text-sm': col.key === 'nombreDestino',
                      'text-blue-700 font-bold text-right block': col.key === 'cantidadPedido',
                      'text-amber-700 font-bold': col.key === 'ruta' && filtroRuta === 'DHL001' && fila.ruta === 'DHL001',
                      'text-violet-700 font-bold': col.key === 'ruta' && filtroRuta === 'INNOVA' && rutasINNOVA.includes(fila.ruta),
                      'text-teal-700 font-bold': col.key === 'ruta' && filtroRuta === 'MOSCA' && rutasMOSCA.includes(fila.ruta),
                      'text-slate-500 text-xs': col.key === 'salidaMercancias' || col.key === 'motivoPedido',
                      'text-slate-700 text-xs': col.key !== 'nombreDestino' && col.key !== 'cantidadPedido' && col.key !== 'salidaMercancias' && col.key !== 'motivoPedido' && col.key !== 'ruta',
                    }">
                      {{ fila[col.key] || '—' }}
                    </span>
                  </template>
                </td>
              </tr>

              <!-- FILA TOTALES -->
              <tr class="border-t-2 border-slate-300 bg-gradient-to-r from-slate-900 to-blue-900 text-white">
                <td class="sticky left-0 z-10 bg-gradient-to-r from-slate-900 to-blue-900 px-3 py-4 text-center">
                  <span class="text-slate-400 text-xs font-bold uppercase">Σ</span>
                </td>
                <td v-for="col in COLUMNAS" :key="col.key" class="px-4 py-4 border-r border-slate-700 last:border-r-0">
                  <span v-if="col.key === 'nombreDestino'" class="text-xs font-bold text-slate-300 uppercase tracking-widest">
                    {{ filasVisibles.length }} posiciones
                  </span>
                  <span v-else-if="col.key === 'cantidadPedido'" class="block text-right font-bold text-blue-300 text-lg">
                    {{ totalCantidad.toLocaleString('es-ES') }}
                  </span>
                </td>
              </tr>

              <!-- Error -->
              <tr v-if="error">
                <td :colspan="COLUMNAS.length + 1" class="px-4 py-3 bg-red-50 border-t border-red-200">
                  <div class="flex items-center gap-2 text-red-600 text-sm font-semibold">
                    <AlertCircle class="w-4 h-4 shrink-0" />
                    {{ error }}
                  </div>
                </td>
              </tr>
            </template>

          </tbody>

        </table>
      </div>
    </div>

  </div>
</template>
