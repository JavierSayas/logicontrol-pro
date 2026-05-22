export const PRODUCTOS_ECI = [
  {
    refEci: '233-00263',
    articulo: 'CILINDRO PIÑA DEL MONTE AL PESO',
    origen: 'Costa Rica',
    canarias: 'SI',
    variedad: 'MD2',
    categoria: 'I',
    calibre: '450 G',
    udsCaja: 6,
    tipo: 'peso',
    precio: 7.1,
  },
  {
    refEci: '615-01475',
    articulo: 'PIÑA DEL MONTE TROZOS 400 G.',
    origen: 'Costa Rica',
    canarias: 'SI',
    variedad: 'MD2',
    categoria: 'I',
    calibre: '400 G',
    udsCaja: 6,
    tipo: 'uds',
    precio: 3.2,
  },
]

export function buscarProductoPorRef(refEci) {
  return PRODUCTOS_ECI.find(p => p.refEci === refEci) || null
}
