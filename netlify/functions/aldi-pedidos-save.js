// Netlify Function: aldi-pedidos-save
// Único punto de escritura hacia aldi_pedidos en el Supabase de CMI
// Operaciones. Usa la service_role key de CMI, que vive SOLO aquí (variable
// de entorno de servidor, nunca en el bundle del navegador). El frontend de
// LogisPro llama a esta función en vez de escribir directamente en CMI, así
// que ningún visitante puede escribir ahí con una clave que él mismo tenga.
//
// Variables de entorno (panel de Netlify, NO en el bundle VITE_*):
//   CMI_SUPABASE_URL         obligatoria. https://batlqdllyxdwshjmruhn.supabase.co
//   CMI_SERVICE_ROLE_KEY     obligatoria. service_role key del proyecto de CMI.

const { createClient } = require('@supabase/supabase-js')

const CMI_URL = process.env.CMI_SUPABASE_URL
const CMI_SERVICE_ROLE_KEY = process.env.CMI_SERVICE_ROLE_KEY

const PRODUCTOS_VALIDOS = ['Coco Aldi', 'Piña Cilindro Aldi']
const TIPOS_VALIDOS = ['diario', 'lunes']
const LABELS_VALIDOS = ['REAL', 'PREV']

function validarFila(fila) {
  if (!fila || typeof fila !== 'object') return 'Fila inválida'
  if (typeof fila.fecha_produccion !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha_produccion)) {
    return 'fecha_produccion inválida'
  }
  if (!TIPOS_VALIDOS.includes(fila.tipo)) return 'tipo inválido'
  if (!PRODUCTOS_VALIDOS.includes(fila.producto)) return 'producto inválido'
  for (const campo of ['masquefa', 'miranda', 'sagunto']) {
    if (typeof fila[campo] !== 'number' || !Number.isFinite(fila[campo])) return `${campo} inválido`
  }
  for (const campo of ['label_masquefa', 'label_miranda', 'label_sagunto']) {
    if (!LABELS_VALIDOS.includes(fila[campo])) return `${campo} inválido`
  }
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

  const { rows } = body
  if (!Array.isArray(rows) || rows.length === 0) {
    return { statusCode: 400, body: 'Falta "rows"' }
  }

  const filasLimpias = []
  for (const fila of rows) {
    const errorFila = validarFila(fila)
    if (errorFila) {
      return { statusCode: 400, body: `Fila rechazada: ${errorFila}` }
    }
    filasLimpias.push({
      fecha_produccion: fila.fecha_produccion,
      tipo: fila.tipo,
      producto: fila.producto,
      masquefa: fila.masquefa,
      miranda: fila.miranda,
      sagunto: fila.sagunto,
      label_masquefa: fila.label_masquefa,
      label_miranda: fila.label_miranda,
      label_sagunto: fila.label_sagunto,
    })
  }

  try {
    const supabaseCmiAdmin = createClient(CMI_URL, CMI_SERVICE_ROLE_KEY)
    const { error } = await supabaseCmiAdmin
      .from('aldi_pedidos')
      .upsert(filasLimpias, { onConflict: 'fecha_produccion,tipo,producto' })

    if (error) {
      return { statusCode: 500, body: 'Error guardando: ' + error.message }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    return { statusCode: 500, body: 'Error inesperado: ' + err.message }
  }
}
