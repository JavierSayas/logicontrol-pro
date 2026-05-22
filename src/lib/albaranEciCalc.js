export function num(v) {
  if (v === '' || v === null || v === undefined) return 0
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function totalCajas(f) {
  return num(f.eci) + num(f.ocor) + num(f.scor) + num(f.cedial) + num(f.eciga)
}

export function pesoNetoFila(f) {
  if (f.tipo === 'peso') return num(f.pesoSap)
  return totalCajas(f) * num(f.udsCaja)
}

export function importeFila(f) {
  return pesoNetoFila(f) * num(f.precio)
}

export function fmtNum(n, decimals = 2) {
  const v = Number(n) || 0
  return v.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtMoney(n) {
  return fmtNum(n) + ' €'
}
