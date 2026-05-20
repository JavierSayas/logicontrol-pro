import { defineStore } from 'pinia'

function unicos(arr) {
  const set = new Set()
  for (const v of arr) {
    const s = (v ?? '').toString().trim()
    if (s) set.add(s)
  }
  return [...set]
}

function crearFila(overrides = {}) {
  return {
    refEci: '',
    articulo: '',
    origen: '',
    canarias: '',
    variedad: '',
    categoria: '',
    calibre: '',
    oferta: '',
    eci: '',
    ocor: '',
    scor: '',
    cedial: '',
    eciga: '',
    udsCaja: '',
    tara: '',
    tipo: 'uds',
    pesoSap: '',
    precio: '',
    ...overrides,
  }
}

function filasSeed() {
  return [
    crearFila({
      refEci: '233-00263',
      articulo: 'CILINDRO PIÑA DEL MONTE AL PESO',
      origen: 'Costa Rica',
      canarias: 'SI',
      variedad: 'MD2',
      categoria: 'I',
      calibre: '450 G',
      oferta: 'NO',
      udsCaja: 6,
      tipo: 'peso',
      precio: 7.1,
    }),
    crearFila({
      refEci: '615-01475',
      articulo: 'PIÑA DEL MONTE TROZOS 400 G.',
      origen: 'Costa Rica',
      canarias: 'SI',
      variedad: 'MD2',
      categoria: 'I',
      calibre: '400 G',
      oferta: 'NO',
      udsCaja: 6,
      tipo: 'uds',
      precio: 3.2,
    }),
    ...Array.from({ length: 8 }, () => crearFila()),
  ]
}

function crearAlbaran(overrides = {}) {
  return {
    numPedido: '',
    numPedido2: '',
    numTransporte: '',
    numAlbaran: '0',
    filas: filasSeed(),
    valoresTransporte: [],
    valoresAlbaran: [],
    errorTransporte: false,
    errorAlbaran: false,
    ...overrides,
  }
}

export const useAlbaranEciStore = defineStore('albaranEci', {
  state: () => ({
    proveedorNum: '21531',
    razonSocial: 'B87635672  SUREXPORT LEVANTE S.L.U',
    cliente: 'EL CORTE INGLÉS, S.A.',
    sucDpto: '050/181',
    fechaEntrega: '',
    lugarEntrega: 'CEPA / MERCAMADRID',
    tempSalida: '',
    matriculaCamion: '',
    dtoLogPct: 9,
    ivaPct: 4,
    filasPegadas: [],
    albaranes: [crearAlbaran()],
    activeIndex: 0,
  }),
  getters: {
    albaranActivo: (state) => state.albaranes[state.activeIndex] || state.albaranes[0],
    cantidadAlbaranes: (state) => state.albaranes.length,
    hayMultiples: (state) => state.albaranes.length > 1,
  },
  actions: {
    aplicarFilasPegadas(filas) {
      this.filasPegadas = filas

      const grupos = new Map()
      const orden = []
      for (const f of filas) {
        const pedido = (f.nPedido ?? '').toString().trim() || '__sin_pedido__'
        if (!grupos.has(pedido)) {
          grupos.set(pedido, [])
          orden.push(pedido)
        }
        grupos.get(pedido).push(f)
      }

      const nuevos = []
      for (const pedido of orden) {
        const filasGrupo = grupos.get(pedido)
        const transportes = unicos(filasGrupo.map(f => f.tpte))
        const albaranesEntrega = unicos(filasGrupo.map(f => f.entrega))
        const errorTransporte = transportes.length > 2

        nuevos.push(crearAlbaran({
          numPedido: pedido === '__sin_pedido__' ? '' : pedido,
          numTransporte: errorTransporte ? '' : transportes.join('/'),
          numAlbaran: albaranesEntrega.join('/') || '0',
          valoresTransporte: transportes,
          valoresAlbaran: albaranesEntrega,
          errorTransporte,
          errorAlbaran: false,
        }))
      }

      if (nuevos.length === 0) {
        nuevos.push(crearAlbaran())
      }

      this.albaranes = nuevos
      this.activeIndex = 0
    },
    limpiarPegado() {
      this.filasPegadas = []
      this.albaranes = [crearAlbaran()]
      this.activeIndex = 0
    },
    setActive(i) {
      if (i >= 0 && i < this.albaranes.length) {
        this.activeIndex = i
      }
    },
    siguiente() {
      this.setActive(Math.min(this.activeIndex + 1, this.albaranes.length - 1))
    },
    anterior() {
      this.setActive(Math.max(this.activeIndex - 1, 0))
    },
    addFilaActivo() {
      this.albaranes[this.activeIndex].filas.push(crearFila())
    },
    removeFilaActivo(i) {
      const a = this.albaranes[this.activeIndex]
      if (a.filas.length <= 1) return
      a.filas.splice(i, 1)
    },
  },
})
