<script setup>
import { ref, computed } from 'vue';
import { useLogisticsStore } from '../stores/logistics';
import { supabaseOrigen } from '../lib/supabase';
import { Truck, AlertCircle, RefreshCw, FileDown, CheckCircle2, XCircle } from 'lucide-vue-next';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import Card from './ui/Card.vue';
import Button from './ui/Button.vue';
import PageHeader from './ui/PageHeader.vue';

async function obtenerPlataformasOrden(datosParaOrden) {
  const destinos = [...new Set(datosParaOrden.map(f => f.nombreDestino).filter(Boolean))];
  if (destinos.length === 0) return [];

  const { data: plats, error: errPlats } = await supabaseOrigen
    .from('plataformas')
    .select('empresa_transporte, nombre, direccion, limite_hora_entrega')
    .in('nombre_csv', destinos)
    .eq('activo', true)
    .order('empresa_transporte')
    .order('nombre');

  if (errPlats) throw errPlats;
  return plats || [];
}

async function addTransportistasPages(doc, datosParaPDF) {
  const plats = await obtenerPlataformasOrden(datosParaPDF);
  if (plats.length === 0) return;

  const empresas = [...new Set(plats.map(p => p.empresa_transporte).filter(Boolean))];

  doc.addPage();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSPORTISTAS Y PLATAFORMAS', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${empresas.length} transportistas · ${plats.length} plataformas`, 14, 22);

  let empresaPrevia = null;
  const body = plats.map(p => {
    const empresa = p.empresa_transporte || '';
    const mostrarEmpresa = empresa !== empresaPrevia;
    empresaPrevia = empresa;
    return [
      mostrarEmpresa ? empresa : '',
      p.nombre || '',
      p.direccion || '',
      p.limite_hora_entrega ? String(p.limite_hora_entrega).slice(0, 5) : '',
    ];
  });

  autoTable(doc, {
    startY: 28,
    head: [['Transportista', 'Plataforma', 'Dirección', 'Hora límite']],
    body,
    margin: { top: 28, right: 14, bottom: 14, left: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.8,
      overflow: 'linebreak',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },
      1: { cellWidth: 62 },
      2: { cellWidth: 135 },
      3: { cellWidth: 24, halign: 'center' },
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [240, 244, 248],
    },
  });
}

const store = useLogisticsStore();
const error = ref('');
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
  { key: 'retornable',       label: 'Retorn.',             width: 'w-[5%]',  editable: true },
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

const CAJAS_POR_HUECO_LIDL = 96;
const CAJAS_POR_HUECO_ALDI_CILINDRO = 88;
const CAJAS_POR_HUECO_ALDI_COCO = 112;

function normalizaTexto(txt) {
  return String(txt ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

function clienteDeDestino(nombreDestino) {
  const d = normalizaTexto(nombreDestino);
  if (d.startsWith('LIDL')) return 'LIDL';
  if (d.includes('CORTE INGL')) return 'ECI';
  if (d.includes('AMETLLER')) return 'CASA_AMETLLER';
  if (d.includes('CONSUM')) return 'CONSUM';
  if (d.includes('ALDI')) return 'ALDI';
  return 'OTRO';
}

// Todas las entregas de Consum (Murcia, Valencia/Ribarroja, Barcelona, etc.) se
// entregan físicamente en la plataforma de Consum en Ribarroja de Túria: es
// Consum quien hace luego la logística interna a cada destino.
const NOMBRE_CONSUM_RIBARROJA = 'CONSUM RIBARROJA';

function esConsum(nombreDestino) {
  return clienteDeDestino(nombreDestino) === 'CONSUM';
}

function huecosPorCajas(cantidad, cajasPorHueco) {
  const n = parseFloat(String(cantidad ?? '').replace(',', '.')) || 0;
  return Math.max(1, Math.ceil(n / cajasPorHueco));
}

function huecosAldi(denominacion, cantidad) {
  const d = normalizaTexto(denominacion);
  const esCilindro = d.includes('CILINDRO') && (d.includes('ALDI') || d.includes('07X540'));
  const esCoco = d.includes('COCO') && (d.includes('ALDI') || d.includes('06X150'));
  if (esCilindro) return huecosPorCajas(cantidad, CAJAS_POR_HUECO_ALDI_CILINDRO);
  if (esCoco) return huecosPorCajas(cantidad, CAJAS_POR_HUECO_ALDI_COCO);
  return 1;
}

function asignarHuecos(filas) {
  const clientesOtroVistos = new Set();

  for (const fila of filas) {
    const cliente = clienteDeDestino(fila.nombreDestino);

    if (cliente === 'LIDL') {
      fila.huecos = String(huecosPorCajas(fila.cantidadPedido, CAJAS_POR_HUECO_LIDL));
    } else if (cliente === 'ECI' || cliente === 'CASA_AMETLLER' || cliente === 'CONSUM') {
      fila.huecos = '1';
    } else if (cliente === 'ALDI') {
      fila.huecos = String(huecosAldi(fila.denominacion, fila.cantidadPedido));
    } else {
      const clave = normalizaTexto(fila.nombreDestino);
      if (clientesOtroVistos.has(clave)) {
        fila.huecos = '0';
      } else {
        clientesOtroVistos.add(clave);
        fila.huecos = '1';
      }
    }

    if (fila.retornable === undefined) fila.retornable = false;
  }

  return filas;
}

function esPaletRetornable(tipoPalet) {
  const t = normalizaTexto(tipoPalet);
  return t.includes('1200X800 EUROPEO');
}

const HORA_RECOGIDA_DEFECTO = '17:00-20:00';

function limpiarTipoPalet(tipoPalet) {
  return String(tipoPalet || '').replace(/^\s*\d+\s*/, '').trim();
}

async function obtenerLimitesEntrega(destinos) {
  const claves = [...new Set(destinos.map(d => normalizaTexto(d)).filter(Boolean))];
  if (claves.length === 0) return {};

  const { data, error: errPlat } = await supabaseOrigen
    .from('plataformas')
    .select('nombre_csv, limite_hora_entrega')
    .eq('activo', true);

  if (errPlat) throw errPlat;

  const mapa = {};
  for (const p of (data || [])) {
    const clave = normalizaTexto(p.nombre_csv);
    if (clave && p.limite_hora_entrega) {
      mapa[clave] = String(p.limite_hora_entrega).slice(0, 5);
    }
  }
  return mapa;
}

const COLUMNAS_ORDEN = [
  { header: 'Tipo Palet', dataKey: 'tipoPalet' },
  { header: 'Huecos', dataKey: 'huecos' },
  { header: 'Fecha Recogida', dataKey: 'fechaRecogida' },
  { header: 'Hora Recogida', dataKey: 'horaRecogida' },
  { header: 'Destino', dataKey: 'destino' },
  { header: 'Fecha Entrega', dataKey: 'fechaEntrega' },
  { header: 'Límite Entrega', dataKey: 'limiteEntrega' },
  { header: 'Nº Transporte', dataKey: 'transporte' },
  { header: 'Europalets Retornables', dataKey: 'palletsEuropeos' },
  { header: 'Observaciones', dataKey: 'observaciones' },
];

async function prepararFilasOrden(datosParaOrden, { fusionarConsumRibarroja = false } = {}) {
  const totalHuecos = datosParaOrden.reduce((sum, fila) => sum + (parseInt(fila.huecos) || 0), 0);
  const limites = await obtenerLimitesEntrega(datosParaOrden.map(f => f.nombreDestino));

  const grupos = new Map();
  for (const fila of datosParaOrden) {
    const nombreOriginal = fila.nombreDestino || '';
    const claveOriginal = normalizaTexto(nombreOriginal);
    const fusionar = fusionarConsumRibarroja && esConsum(nombreOriginal);
    const nombreGrupo = fusionar ? NOMBRE_CONSUM_RIBARROJA : nombreOriginal;
    const clave = fusionar ? normalizaTexto(NOMBRE_CONSUM_RIBARROJA) : claveOriginal;

    if (!grupos.has(clave)) {
      grupos.set(clave, {
        nombreDestino: nombreGrupo,
        clave,
        huecos: 0,
        palletsEuropeos: 0,
        fechaRecogida: '',
        tipos: new Set(),
        fechasEntrega: new Set(),
        transportes: new Set(),
        entregas: new Set(),
        limitesEntrega: new Set(),
      });
    }
    const g = grupos.get(clave);
    const huecosFila = parseInt(fila.huecos) || 0;
    g.huecos += huecosFila;
    if (fila.retornable) g.palletsEuropeos += huecosFila;
    if (!g.fechaRecogida && fila.salidaMercancias) g.fechaRecogida = fila.salidaMercancias;
    const tp = limpiarTipoPalet(fila.tipoPalet);
    if (tp) g.tipos.add(tp);
    if (fila.fechaEntrega) g.fechasEntrega.add(fila.fechaEntrega);
    if (fila.transporte) g.transportes.add(fila.transporte);
    if (fila.numeroEntrega) g.entregas.add(fila.numeroEntrega);
    const limiteOriginal = limites[claveOriginal];
    if (limiteOriginal) g.limitesEntrega.add(limiteOriginal);
  }

  const filas = [...grupos.values()].map(g => ({
    tipoPalet: [...g.tipos].join(', '),
    huecos: g.huecos,
    fechaRecogida: g.fechaRecogida || '',
    horaRecogida: HORA_RECOGIDA_DEFECTO,
    destino: g.nombreDestino,
    fechaEntrega: [...g.fechasEntrega].join(', '),
    limiteEntrega: [...g.limitesEntrega][0] || '',
    transporte: [...g.transportes].join(', '),
    palletsEuropeos: g.palletsEuropeos,
    observaciones: [...g.entregas].join(', '),
  }));

  return { filas, totalHuecos };
}

async function generarPDFOrden(titulo, datosParaPDF, nombreArchivo) {
  const doc = new jsPDF({ orientation: 'landscape' });

  const fechaFormatada = new Date(store.fecha).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const { filas, totalHuecos } = await prepararFilasOrden(datosParaPDF, { fusionarConsumRibarroja: false });

  doc.setFontSize(16);
  doc.text(titulo, 14, 15);

  doc.setFontSize(10);
  doc.text(`Fecha de carga: ${fechaFormatada}`, 14, 25);
  doc.text(`Total huecos: ${totalHuecos}`, 14, 32);

  autoTable(doc, {
    columns: COLUMNAS_ORDEN,
    body: filas.map(f => ({
      tipoPalet: f.tipoPalet,
      huecos: f.huecos || '',
      fechaRecogida: f.fechaRecogida,
      horaRecogida: f.horaRecogida,
      destino: f.destino,
      fechaEntrega: f.fechaEntrega,
      limiteEntrega: f.limiteEntrega,
      transporte: f.transporte,
      palletsEuropeos: f.palletsEuropeos || '',
      observaciones: f.observaciones,
    })),
    startY: 38,
    margin: { top: 38, right: 14, bottom: 12, left: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 1.2,
      overflow: 'linebreak',
      valign: 'middle',
      minCellHeight: 6,
      lineWidth: 0.1,
    },
    columnStyles: {
      tipoPalet: { cellWidth: 36 },
      huecos: { cellWidth: 16, halign: 'center' },
      fechaRecogida: { cellWidth: 22, halign: 'center' },
      horaRecogida: { cellWidth: 24, halign: 'center' },
      destino: { cellWidth: 40 },
      fechaEntrega: { cellWidth: 22, halign: 'center' },
      limiteEntrega: { cellWidth: 22, halign: 'center' },
      transporte: { cellWidth: 22, halign: 'center' },
      palletsEuropeos: { cellWidth: 22, halign: 'center' },
      observaciones: { cellWidth: 23 },
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      overflow: 'linebreak',
      fontSize: 8,
      halign: 'left',
      valign: 'middle',
      cellPadding: 1.6,
    },
    alternateRowStyles: {
      fillColor: [240, 244, 248],
    },
  });

  await addTransportistasPages(doc, datosParaPDF);

  doc.save(nombreArchivo);
  showToast(`PDF descargado: ${nombreArchivo}`, 'success');
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function generarExcelOrden(titulo, datosParaExcel, nombreArchivo) {
  const fechaFormatada = new Date(store.fecha).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const { filas, totalHuecos } = await prepararFilasOrden(datosParaExcel, { fusionarConsumRibarroja: true });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'LogiControl Pro';
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet('Orden', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = titulo;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Fecha de carga: ${fechaFormatada}`;
  ws.getCell('A3').value = `Total huecos: ${totalHuecos}`;
  ws.getCell('A3').font = { bold: true };

  ws.addTable({
    name: 'OrdenINNOVA',
    ref: 'A5',
    headerRow: true,
    totalsRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: COLUMNAS_ORDEN.map((c, i) => {
      const col = { name: c.header, filterButton: true };
      if (c.dataKey === 'huecos' || c.dataKey === 'palletsEuropeos') {
        col.totalsRowFunction = 'sum';
      } else if (i === 0) {
        col.totalsRowLabel = 'TOTAL';
      }
      return col;
    }),
    rows: filas.map(f => [
      f.tipoPalet,
      f.huecos,
      f.fechaRecogida,
      f.horaRecogida,
      f.destino,
      f.fechaEntrega,
      f.limiteEntrega,
      f.transporte,
      f.palletsEuropeos,
      f.observaciones,
    ]),
  });

  const anchosOrden = [28, 8, 14, 14, 30, 14, 14, 14, 16, 24];
  anchosOrden.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  [2, 3, 4, 6, 7, 8, 9].forEach(colIdx => { ws.getColumn(colIdx).alignment = { horizontal: 'center' }; });

  for (let col = 1; col <= COLUMNAS_ORDEN.length; col++) {
    const cell = ws.getRow(5).getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }

  const totalEuropeos = filas.reduce((sum, f) => sum + (Number(f.palletsEuropeos) || 0), 0);
  const totalsRowNum = 6 + filas.length;
  ws.getCell(`B${totalsRowNum}`).value = { formula: 'SUBTOTAL(109,OrdenINNOVA[Huecos])', result: totalHuecos };
  ws.getCell(`I${totalsRowNum}`).value = { formula: 'SUBTOTAL(109,OrdenINNOVA[Europalets Retornables])', result: totalEuropeos };

  const plats = await obtenerPlataformasOrden(datosParaExcel);
  if (plats.length > 0) {
    const wsPlat = wb.addWorksheet('Plataformas', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    let empresaPrevia = null;
    const rowsPlat = plats.map(p => {
      const empresa = p.empresa_transporte || '';
      const mostrarEmpresa = empresa !== empresaPrevia;
      empresaPrevia = empresa;
      return [
        mostrarEmpresa ? empresa : '',
        p.nombre || '',
        p.direccion || '',
        p.limite_hora_entrega ? String(p.limite_hora_entrega).slice(0, 5) : '',
      ];
    });

    wsPlat.addTable({
      name: 'Plataformas',
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: [
        { name: 'Transportista', filterButton: true },
        { name: 'Plataforma', filterButton: true },
        { name: 'Dirección', filterButton: true },
        { name: 'Hora límite', filterButton: true },
      ],
      rows: rowsPlat,
    });

    [24, 32, 50, 12].forEach((w, i) => { wsPlat.getColumn(i + 1).width = w; });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  descargarBlob(blob, nombreArchivo);
  showToast(`Excel descargado: ${nombreArchivo}`, 'success');
}

function tokenClienteProducto(nombreDestino) {
  const cliente = clienteDeDestino(nombreDestino);
  const mapa = {
    CONSUM: 'CONSUM',
    ALDI: 'ALDI',
    LIDL: 'LIDL',
    ECI: 'CORTE',
    CASA_AMETLLER: 'AMETLLER',
  };
  return mapa[cliente] || '';
}

async function marcarRetornables(filas) {
  const denoms = [...new Set(filas.map(f => normalizaTexto(f.denominacion)).filter(Boolean))];
  if (denoms.length === 0) return;

  const { data, error: errProd } = await supabaseOrigen
    .from('productos')
    .select('nombre_sap, cliente, cliente_alias, tipo_palet')
    .eq('en_activo', true)
    .eq('pendiente_lanzar', false);

  if (errProd) {
    showToast('No se pudo consultar el tipo de palet: ' + errProd.message, 'error');
    return;
  }

  const porDenom = new Map();
  for (const p of (data || [])) {
    const clave = normalizaTexto(p.nombre_sap);
    if (!clave) continue;
    if (!porDenom.has(clave)) porDenom.set(clave, []);
    porDenom.get(clave).push({
      clienteNorm: normalizaTexto(`${p.cliente || ''} ${p.cliente_alias || ''}`),
      tipoPalet: p.tipo_palet || '',
      retornable: esPaletRetornable(p.tipo_palet),
    });
  }

  for (const fila of filas) {
    const clave = normalizaTexto(fila.denominacion);
    const rows = porDenom.get(clave);

    if (!rows || rows.length === 0) {
      fila.tipoPalet = '';
      fila.retornable = false;
      fila.retornableInfo = 'sin-datos';
      continue;
    }

    let candidatas = rows;
    const tiposDistintos = new Set(rows.map(r => r.tipoPalet));

    if (tiposDistintos.size > 1) {
      const token = tokenClienteProducto(fila.nombreDestino);
      const filtradas = token ? rows.filter(r => r.clienteNorm.includes(token)) : [];
      if (filtradas.length > 0) candidatas = filtradas;
    }

    const tiposCandidatas = new Set(candidatas.map(r => r.tipoPalet));
    const resuelta = candidatas[0];

    fila.tipoPalet = resuelta.tipoPalet;
    fila.retornable = resuelta.retornable;
    fila.retornableInfo = tiposCandidatas.size > 1
      ? 'ambiguo'
      : (tiposDistintos.size > 1 ? 'auto-cliente' : 'auto');
  }
}

async function handlePaste(event) {
  event.preventDefault();
  error.value = '';

  const texto = event.clipboardData.getData('text');
  const lineas = texto.trim().split(/[\r\n]+/).filter(l => l.trim());

  if (lineas.length === 0) {
    error.value = 'Pega al menos una fila de datos.';
    showToast('No hay datos para pegar', 'error');
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

    if (Object.values(fila).some(v => v !== '')) {
      filas.push(fila);
    }
  }

  if (filas.length === 0) {
    error.value = 'No se han encontrado filas con datos.';
    showToast('No se encontraron datos válidos', 'error');
    return;
  }

  asignarHuecos(filas);

  store.setOrdenCarga(filas);
  error.value = '';
  showToast(`${filas.length} filas cargadas correctamente`, 'success');

  await marcarRetornables(store.ordenCargaData);
}

function limpiar() {
  error.value = '';
  store.setOrdenCarga([]);
  showToast('Carga limpiada', 'success');
}

const filas = computed(() => store.ordenCargaData);
const hayDatos = computed(() => filas.value.length > 0);

const filasParaPDF = computed(() => {
  return filas.value.filter(f => f.ruta === 'DHL001');
});

const totalCantidad = computed(() =>
  filas.value.reduce((sum, f) => sum + (parseFloat(f.cantidadPedido) || 0), 0)
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
      showToast('No hay datos DHL001 para la fecha ' + store.fecha, 'error');
      return;
    }

    await generarPDFOrden('ORDEN DE CARGA DHL', datosParaPDF, `DHL001_${store.fecha}.pdf`);
  } catch (err) {
    showToast('Error generando PDF: ' + err.message, 'error');
  }
}

function handleHuecosKeydown(event, rowIdx) {
  if (event.key === 'Enter') {
    event.preventDefault();

    const nextRowIdx = rowIdx + 1;
    if (nextRowIdx < filas.value.length) {
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
      showToast(`Orden ${tipoCarga} guardada correctamente`, 'success');
      await store.cargarOrdenesCarga();
      return true;
    } else {
      error.value = `Error al guardar: ${resultado.error}`;
      showToast(`Error: ${resultado.error}`, 'error');
      return false;
    }
  } catch (err) {
    error.value = `Error: ${err.message}`;
    showToast(`Error al guardar orden: ${err.message}`, 'error');
    return false;
  }
}

async function guardarYDescargarPDF(tipo) {
  const generadores = {
    'DHL001': generarPDF,
    'INNOVA': generarExcelInnnova,
    'MOSCA': generarPDFMosca,
  };
  const generar = generadores[tipo];
  if (!generar) return;

  const ok = await guardarOrden(tipo);
  if (ok) await generar();
}

async function generarExcelInnnova() {
  try {
    const datosParaExcel = filasParaPDFInnnova.value;

    if (datosParaExcel.length === 0) {
      error.value = 'No hay datos INNOVA cargados.';
      showToast('No hay datos INNOVA', 'error');
      return;
    }

    await generarExcelOrden('ORDEN DE CARGA INNOVA', datosParaExcel, `INNOVA_${store.fecha}.xlsx`);
  } catch (err) {
    showToast('Error generando Excel: ' + err.message, 'error');
  }
}

async function generarPDFMosca() {
  try {
    const datosParaPDF = filasParaPDFMosca.value;

    if (datosParaPDF.length === 0) {
      error.value = 'No hay datos MOSCA cargados.';
      showToast('No hay datos MOSCA', 'error');
      return;
    }

    await generarPDFOrden('ORDEN DE CARGA MOSCA', datosParaPDF, `MOSCA_${store.fecha}.pdf`);
  } catch (err) {
    showToast('Error generando PDF: ' + err.message, 'error');
  }
}
</script>

<template>
  <div class="space-y-8">
    <transition name="slide-in">
      <div
        v-if="toast"
        :class="[
          'fixed top-6 right-6 flex items-center gap-3 px-5 py-3 rounded-lg shadow-lg border z-50',
          toastType === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        ]"
      >
        <component
          :is="toastType === 'success' ? CheckCircle2 : XCircle"
          class="w-4 h-4 shrink-0"
        />
        <span class="font-medium text-sm">{{ toast }}</span>
      </div>
    </transition>

    <PageHeader
      caption="Logística"
      :caption-icon="Truck"
      theme="blue"
      title="Orden de Carga"
      :subtitle="hayDatos ? `${filas.length} posiciones cargadas` : 'Haz clic en la tabla y pega datos con Ctrl+V'"
    >
      <template #actions>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          <Button v-if="cantidadDHL > 0" variant="success" :disabled="store.loading" @click="guardarYDescargarPDF('DHL001')" title="Guardar orden y descargar PDF DHL001">
            <FileDown class="w-4 h-4" />
            PDF DHL · {{ cantidadDHL }}
          </Button>
          <Button v-if="cantidadINNOVA > 0" variant="success" :disabled="store.loading" @click="guardarYDescargarPDF('INNOVA')" title="Guardar orden y descargar Excel INNOVA">
            <FileDown class="w-4 h-4" />
            Excel INNOVA · {{ cantidadINNOVA }}
          </Button>
          <Button v-if="cantidadMOSCA > 0" variant="success" :disabled="store.loading" @click="guardarYDescargarPDF('MOSCA')" title="Guardar orden y descargar PDF MOSCA">
            <FileDown class="w-4 h-4" />
            PDF MOSCA · {{ cantidadMOSCA }}
          </Button>

          <Button v-if="hayDatos" variant="secondary" @click="limpiar">
            <RefreshCw class="w-4 h-4" />
            Nueva carga
          </Button>
        </div>
      </template>
    </PageHeader>

    <Card flush @paste="handlePaste">
      <div class="max-h-[calc(100vh-300px)] overflow-y-auto">
        <table class="w-full text-sm border-collapse table-fixed">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200">
              <th class="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-600 w-10 border-r border-slate-100">#</th>
              <th
                v-for="col in COLUMNAS"
                :key="col.key"
                :class="['px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap', col.width]"
              >
                {{ col.label }}
              </th>
            </tr>
          </thead>

          <tbody>
            <template v-if="!hayDatos">
              <tr v-for="n in 8" :key="n" :class="n % 2 === 0 ? 'bg-slate-50/40' : 'bg-white'">
                <td class="sticky left-0 z-10 px-3 py-2.5 text-center text-slate-200 font-mono font-semibold border-r border-slate-100" :class="n % 2 === 0 ? 'bg-slate-50/40' : 'bg-white'">{{ n }}</td>
                <td v-for="col in COLUMNAS" :key="col.key" class="px-3 py-2.5">
                  <div class="h-3 rounded bg-slate-200/40" :style="{ width: n % 3 === 0 ? '60%' : n % 2 === 0 ? '80%' : '40%' }" />
                </td>
              </tr>

              <tr>
                <td :colspan="COLUMNAS.length + 1" class="py-0">
                  <div class="flex flex-col items-center justify-center py-16 -mt-[calc(8*2.75rem)]">
                    <Truck class="w-10 h-10 text-slate-300 mb-3" />
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sin datos cargados</p>
                    <p class="text-sm font-medium text-slate-500 mt-1">Haz clic aquí y pega tus datos desde SAP (Ctrl+V)</p>
                    <p class="text-xs font-medium text-slate-400 mt-1">Solo las filas de datos, sin encabezados</p>
                    <div v-if="error" class="mt-4 inline-flex items-center gap-2 text-sm font-medium text-red-700 bg-red-50 px-4 py-2.5 rounded-lg max-w-md border border-red-200">
                      <AlertCircle class="w-4 h-4 shrink-0" />
                      <span>{{ error }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </template>

            <template v-else>
              <tr
                v-for="(fila, idx) in filas"
                :key="idx"
                :class="[
                  'border-t border-slate-100 transition-colors',
                  idx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/40 hover:bg-slate-50/80'
                ]"
              >
                <td :class="[
                  'sticky left-0 z-10 px-3 py-2.5 text-center text-slate-400 font-mono font-semibold text-xs border-r border-slate-100',
                  idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                ]">
                  {{ idx + 1 }}
                </td>
                <td
                  v-for="col in COLUMNAS"
                  :key="col.key"
                  class="px-3 py-2.5 transition-colors"
                  :class="{
                    'break-words': col.key === 'nombreDestino' || col.key === 'denominacion',
                    'bg-slate-50/80 border-l-2 border-l-slate-200': col.key === 'huecos',
                    'bg-slate-50/80': col.key === 'retornable',
                  }"
                >
                  <template v-if="col.editable && col.key === 'huecos'">
                    <input
                      v-model="fila[col.key]"
                      type="text"
                      data-huecos-input
                      @keydown.enter="handleHuecosKeydown($event, idx)"
                      class="w-full px-2 py-1.5 border border-slate-200 rounded-md text-center font-bold text-sm bg-white focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition-colors"
                      placeholder="—"
                    />
                  </template>
                  <template v-else-if="col.editable && col.key === 'retornable'">
                    <div class="flex items-center justify-center">
                      <input
                        v-model="fila.retornable"
                        type="checkbox"
                        :title="fila.retornableInfo === 'ambiguo' ? 'Palet ambiguo por cliente: revisa manualmente' : (fila.retornableInfo === 'sin-datos' ? 'Producto no encontrado en maestro: marca manualmente' : (fila.retornable ? 'Palet retornable (1200x800 europeo)' : 'Palet no retornable'))"
                        :class="[
                          'w-5 h-5 rounded cursor-pointer accent-emerald-600',
                          fila.retornableInfo === 'ambiguo' || fila.retornableInfo === 'sin-datos' ? 'ring-1 ring-amber-300' : '',
                        ]"
                      />
                    </div>
                  </template>
                  <template v-else>
                    <span :class="{
                      'font-bold text-slate-900 text-sm': col.key === 'nombreDestino',
                      'text-brand-700 font-bold text-right block': col.key === 'cantidadPedido',
                      'text-slate-500 text-xs font-medium': col.key === 'salidaMercancias' || col.key === 'motivoPedido',
                      'text-slate-700 text-xs font-medium': col.key !== 'nombreDestino' && col.key !== 'cantidadPedido' && col.key !== 'salidaMercancias' && col.key !== 'motivoPedido' && col.key !== 'ruta',
                    }">
                      {{ fila[col.key] || '—' }}
                    </span>
                  </template>
                </td>
              </tr>

              <tr class="border-t-2 border-slate-200 bg-slate-900 text-white">
                <td class="sticky left-0 z-10 bg-slate-900 px-3 py-3 text-center">
                  <span class="text-slate-400 text-[11px] font-bold uppercase tracking-wider">Σ</span>
                </td>
                <td v-for="col in COLUMNAS" :key="col.key" class="px-3 py-3">
                  <span v-if="col.key === 'nombreDestino'" class="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    {{ filas.length }} posiciones
                  </span>
                  <span v-else-if="col.key === 'cantidadPedido'" class="block text-right font-bold text-blue-300 text-base">
                    {{ totalCantidad.toLocaleString('es-ES') }}
                  </span>
                </td>
              </tr>

              <tr v-if="error">
                <td :colspan="COLUMNAS.length + 1" class="px-4 py-3 bg-red-50 border-t border-red-200">
                  <div class="flex items-center gap-2 text-red-700 text-sm font-medium">
                    <AlertCircle class="w-4 h-4 shrink-0" />
                    {{ error }}
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.slide-in-enter-active,
.slide-in-leave-active {
  transition: all 0.25s ease;
}
.slide-in-enter-from,
.slide-in-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
