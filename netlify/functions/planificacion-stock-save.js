// Netlify Function: planificacion-stock-save
// Único punto de escritura hacia planificacion_aldi_stock en el Supabase de
// CMI Operaciones, para los campos que LogisPro también edita (Stock Inicial
// y Expediciones/Salidas pedidos manuales). Usa la service_role key de CMI,
// que vive SOLO aquí (variable de entorno de servidor, nunca en el bundle
// del navegador).
//
// Variables de entorno (panel de Netlify, NO en el bundle VITE_*):
//   CMI_SUPABASE_URL         obligatoria. https://batlqdllyxdwshjmruhn.supabase.co
//   CMI_SERVICE_ROLE_KEY     obligatoria. service_role key del proyecto de CMI.

const { createClient } = require('@supabase/supabase-js')

const CMI_URL = process.env.CMI_SUPABASE_URL
const CMI_SERVICE_ROLE_KEY = process.env.CMI_SERVICE_ROLE_KEY

const CLIENTES_VALIDOS = ['Aldi', 'Lidl', 'El corte inglés', 'Supermercados Consum', 'Mercadona']

function esNumeroONull(v) {
  return v === null || (typeof v === 'number' && Number.isFinite(v))
}

function validarFila(fila) {
  if (!fila || typeof fila !== 'object') return 'Fila inválida'
  if (typeof fila.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha)) return 'fecha inválida'
  if (!CLIENTES_VALIDOS.includes(fila.cliente)) return 'cliente inválido'
  if (typeof fila.producto !== 'string' || !fila.producto.trim()) return 'producto inválido'
  const tieneStock = 'stock_inicial' in fila
  const tieneExp = 'expediciones' in fila
  if (!tieneStock && !tieneExp) return 'falta stock_inicial o expediciones'
  if (tieneStock && !esNumeroONull(fila.stock_inicial)) return 'stock_inicial inválido'
  if (tieneExp && !esNumeroONull(fila.expediciones)) return 'expediciones inválido'
  return null
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  if (!CMI_URL || !CMI_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: 'Faltan CMI_SUPABASE_URL / CMI_SERVICE_ROLE_KEY en Netlify' }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: 'JSON inválido' }
  }

  const fila = body.fila
  const errorFila = validarFila(fila)
  if (errorFila) {
    return { statusCode: 400, body: `Fila rechazada: ${errorFila}` }
  }

  const payload = { fecha: fila.fecha, cliente: fila.cliente, producto: fila.producto }
  if ('stock_inicial' in fila) payload.stock_inicial = fila.stock_inicial
  if ('expediciones' in fila) payload.expediciones = fila.expediciones

  try {
    const supabaseCmiAdmin = createClient(CMI_URL, CMI_SERVICE_ROLE_KEY)
    const { error } = await supabaseCmiAdmin
      .from('planificacion_aldi_stock')
      .upsert(payload, { onConflict: 'fecha,cliente,producto' })

    if (error) {
      return { statusCode: 500, body: 'Error guardando: ' + error.message }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 500, body: 'Error inesperado: ' + err.message }
  }
}
