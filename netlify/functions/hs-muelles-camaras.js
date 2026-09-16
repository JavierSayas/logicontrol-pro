// Netlify Function: hs-muelles-camaras
//
// Proxy autenticado hacia el Higiénico Sanitario del CMI (tablas hs_*), para
// que LogisPro pueda rellenar el parte de la sala "MUELLES Y CÁMARAS" sin
// tener que abrir CMI Operaciones. Esas tablas exigen rol `authenticated`
// DEL PROYECTO DE CMI vía RLS, y los usuarios de LogisPro se autentican
// contra su propio proyecto de Supabase (otro Auth por completo) — por eso
// hace falta pasar por aquí, con la service_role key de CMI, que vive SOLO
// en esta función (variable de entorno de servidor, nunca en el bundle).
//
// Para no convertir esto en un proxy genérico a la BBDD (la service_role key
// se salta toda RLS), esta función SOLO permite un conjunto cerrado de
// acciones sobre un conjunto cerrado de columnas, y fuerza siempre
// SALA_ID = 12 (Muelles y Cámaras): ninguna petición, por mucho que
// manipule el payload, puede tocar otra sala ni otra tabla.
//
// Variables de entorno (panel de Netlify, NO en el bundle VITE_*):
//   CMI_SUPABASE_URL         obligatoria. https://uoarbfkhgfpqsbbejhhw.supabase.co
//   CMI_SERVICE_ROLE_KEY     obligatoria. service_role key del proyecto de CMI.

const { createClient } = require('@supabase/supabase-js')

const CMI_URL = process.env.CMI_SUPABASE_URL
const CMI_SERVICE_ROLE_KEY = process.env.CMI_SERVICE_ROLE_KEY

const SALA_ID = 12 // Muelles y Cámaras. Fijo a propósito: ver cabecera.

const CAMPOS_REGISTRO = ['limpieza_ok', 'limpieza_motivo', 'ropa_ok', 'ropa_motivo']
const CAMPOS_OBJETO = ['inicio_ok', 'inicio_cantidad', 'inicio_motivo', 'fin_ok', 'fin_cantidad', 'fin_motivo']
const CAMPOS_ZONA = ['inicio_ok', 'fin_ok', 'inicio_motivo', 'fin_motivo']

function fechaHoy() {
  const hoy = new Date()
  return new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Todas las acciones que tocan un registro concreto llevan registro_id, y lo
// primero que se hace es comprobar que ese registro es de verdad de la sala
// 12: así una petición manipulada no puede escribir en el parte de otra
// sala, aunque acierte con un id real.
async function registroDeLaSala(db, registroId) {
  if (!Number.isInteger(registroId)) return null
  const { data } = await db.from('hs_registros').select('id, sala_id, inicio_cerrado_en, finalizado_en')
    .eq('id', registroId).eq('sala_id', SALA_ID).maybeSingle()
  return data || null
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

  const { action } = body
  const db = createClient(CMI_URL, CMI_SERVICE_ROLE_KEY)
  const json = (obj, statusCode = 200) => ({ statusCode, body: JSON.stringify(obj) })
  const fail = (msg, statusCode = 400) => json({ error: msg }, statusCode)

  try {
    switch (action) {
      // ---- Lectura completa del parte de hoy -------------------------------
      case 'cargarSala': {
        const fecha = fechaHoy()
        const [{ data: sala }, { data: objetos }, { data: zonas }, { data: registro }] = await Promise.all([
          db.from('hs_salas').select('id, nombre, plano_url, temp_min, temp_max, version').eq('id', SALA_ID).single(),
          db.from('hs_objetos').select('id, nombre, ubicacion_fija, cantidad_esperada, orden')
            .eq('sala_id', SALA_ID).eq('activo', true).order('nombre'),
          db.from('hs_zonas').select('id, nombre, temp_min, temp_max, orden')
            .eq('sala_id', SALA_ID).eq('activa', true).order('orden').order('nombre'),
          db.from('hs_registros').select('*').eq('sala_id', SALA_ID).eq('fecha', fecha).maybeSingle(),
        ])

        let filas = [], filasZona = [], gafasLog = [], notas = []
        if (registro) {
          const [{ data: fs }, { data: fz }, { data: gl }] = await Promise.all([
            db.from('hs_registro_objetos').select('*').eq('registro_id', registro.id),
            db.from('hs_registro_zonas').select('*').eq('registro_id', registro.id),
            db.from('hs_registro_gafas_log').select('*').eq('registro_id', registro.id).order('anotado_en'),
          ])
          filas = fs || []; filasZona = fz || []; gafasLog = gl || []
          if (filas.length) {
            const { data: notasData } = await db.from('hs_registro_objeto_notas')
              .select('*').in('registro_objeto_id', filas.map(f => f.id)).order('anotado_en')
            notas = notasData || []
          }
        }
        return json({ sala, objetos: objetos || [], zonas: zonas || [], registro, filas, filasZona, gafasLog, notas })
      }

      // ---- Completar filas de zona que falten (config publicada a medio parte) --
      case 'completarZonas': {
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        if (registro.inicio_cerrado_en) return json({ nuevas: [] })

        const [{ data: zonas }, { data: existentes }] = await Promise.all([
          db.from('hs_zonas').select('id').eq('sala_id', SALA_ID).eq('activa', true),
          db.from('hs_registro_zonas').select('zona_id').eq('registro_id', registro.id),
        ])
        const yaTiene = new Set((existentes || []).map(f => f.zona_id))
        const faltan = (zonas || []).filter(z => !yaTiene.has(z.id))
        if (!faltan.length) return json({ nuevas: [] })

        const { data: nuevas, error } = await db.from('hs_registro_zonas')
          .insert(faltan.map(z => ({ registro_id: registro.id, zona_id: z.id }))).select('*')
        if (error) return fail('No se pudieron completar las zonas: ' + error.message, 500)
        return json({ nuevas: nuevas || [] })
      }

      // ---- Abrir el parte del día -------------------------------------------
      case 'iniciar': {
        const nombre = (body.nombre || '').trim()
        if (!nombre) return fail('Falta el nombre de quién inicia')

        const { data: sala } = await db.from('hs_salas').select('version').eq('id', SALA_ID).single()
        if (!sala || (sala.version ?? 0) <= 0) {
          return fail('La configuración de la sala no está publicada en CMI (Calidad → Higiénico Sanitario)')
        }
        const [{ data: objetos }, { data: zonas }] = await Promise.all([
          db.from('hs_objetos').select('id, cantidad_esperada').eq('sala_id', SALA_ID).eq('activo', true),
          db.from('hs_zonas').select('id').eq('sala_id', SALA_ID).eq('activa', true),
        ])
        if (!objetos || !objetos.length) return fail('Esta sala no tiene objetos configurados')

        const { data: registro, error } = await db.from('hs_registros').insert({
          sala_id: SALA_ID, fecha: fechaHoy(),
          iniciado_por: nombre, iniciado_en: new Date().toISOString(),
          version_config: sala.version ?? 0,
        }).select('*').single()
        if (error) {
          if (error.code === '23505') return fail('Ya hay un registro de hoy para esta sala', 409)
          return fail('No se pudo iniciar: ' + error.message, 500)
        }

        const { data: filas, error: errFilas } = await db.from('hs_registro_objetos')
          .insert(objetos.map(o => ({ registro_id: registro.id, objeto_id: o.id, cantidad_esperada: o.cantidad_esperada })))
          .select('*')
        if (errFilas) return fail('El registro se creó pero faltan objetos: ' + errFilas.message, 500)

        let filasZona = []
        if (zonas && zonas.length) {
          const { data: fz, error: errZonas } = await db.from('hs_registro_zonas')
            .insert(zonas.map(z => ({ registro_id: registro.id, zona_id: z.id }))).select('*')
          if (errZonas) return fail('El registro se creó pero faltan las zonas de temperatura: ' + errZonas.message, 500)
          filasZona = fz || []
        }

        return json({ registro, filas: filas || [], filasZona })
      }

      // ---- Guardar el inicio (congela lo marcado) ---------------------------
      case 'guardarInicio': {
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        if (registro.inicio_cerrado_en) return json({ inicio_cerrado_en: registro.inicio_cerrado_en })

        const ahora = new Date().toISOString()
        const { error } = await db.from('hs_registros')
          .update({ inicio_cerrado_en: ahora, updated_at: ahora }).eq('id', registro.id)
        if (error) return fail('No se pudo guardar el inicio: ' + error.message, 500)
        return json({ inicio_cerrado_en: ahora })
      }

      // ---- Campo suelto del registro (limpieza/ropa, con su motivo) --------
      case 'guardarRegistroCampo': {
        if (!CAMPOS_REGISTRO.includes(body.campo)) return fail('Campo no permitido')
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)

        const { error } = await db.from('hs_registros')
          .update({ [body.campo]: body.valor, updated_at: new Date().toISOString() }).eq('id', registro.id)
        if (error) return fail('No se pudo guardar: ' + error.message, 500)
        return json({ ok: true })
      }

      // ---- Gafas: valor + entrada en el historial ----------------------------
      case 'guardarGafas': {
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        const valor = body.valor
        if (!Number.isInteger(valor) || valor < 0) return fail('Valor de gafas inválido')

        const [{ data: actual }, { count }] = await Promise.all([
          db.from('hs_registros').select('gafas').eq('id', registro.id).single(),
          db.from('hs_registro_gafas_log').select('id', { count: 'exact', head: true }).eq('registro_id', registro.id),
        ])
        // La primera anotación se guarda aunque el número no cambie (nace en 0
        // y sin esto "0" no dejaría rastro); luego solo si cambia de verdad.
        if (actual && actual.gafas === valor && count > 0) {
          return json({ gafas: valor, nuevaEntrada: null })
        }

        const ahora = new Date().toISOString()
        const { error } = await db.from('hs_registros')
          .update({ gafas: valor, updated_at: ahora }).eq('id', registro.id)
        if (error) return fail('No se pudo guardar: ' + error.message, 500)

        const { data: entrada, error: errLog } = await db.from('hs_registro_gafas_log')
          .insert({ registro_id: registro.id, cantidad: valor }).select('*').single()
        if (errLog) return fail('Gafas guardadas pero falló el historial: ' + errLog.message, 500)
        return json({ gafas: valor, nuevaEntrada: entrada })
      }

      // ---- Campo suelto de una fila de objeto (inicio/fin, ok/cantidad/motivo) --
      case 'guardarFilaObjeto': {
        if (!CAMPOS_OBJETO.includes(body.campo)) return fail('Campo no permitido')
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        if (!Number.isInteger(body.fila_id)) return fail('Falta fila_id')

        const valor = body.valor === '' || body.valor === undefined ? null : body.valor
        const { error, count } = await db.from('hs_registro_objetos')
          .update({ [body.campo]: valor, updated_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', body.fila_id).eq('registro_id', registro.id)
        if (error) return fail('No se pudo guardar: ' + error.message, 500)
        if (!count) return fail('La fila no pertenece a este registro', 404)
        return json({ ok: true })
      }

      // ---- Nota puntual sobre un objeto contado ------------------------------
      case 'guardarNota': {
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        const nota = (body.nota || '').trim()
        if (!nota) return fail('Falta el texto de la nota')
        if (!Number.isInteger(body.fila_id)) return fail('Falta fila_id')

        // La fila tiene que ser de verdad de este registro, y no de otro.
        const { data: fila } = await db.from('hs_registro_objetos')
          .select('id').eq('id', body.fila_id).eq('registro_id', registro.id).maybeSingle()
        if (!fila) return fail('La fila no pertenece a este registro', 404)

        const { data, error } = await db.from('hs_registro_objeto_notas')
          .insert({ registro_objeto_id: body.fila_id, nota }).select('*').single()
        if (error) return fail('No se pudo guardar la nota: ' + error.message, 500)
        return json({ nota: data })
      }

      // ---- Campo suelto de una fila de zona (temperatura) --------------------
      case 'guardarFilaZona': {
        if (!CAMPOS_ZONA.includes(body.campo)) return fail('Campo no permitido')
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        if (!Number.isInteger(body.fila_id)) return fail('Falta fila_id')

        const valor = body.valor === '' || body.valor === undefined ? null : body.valor
        const { error, count } = await db.from('hs_registro_zonas')
          .update({ [body.campo]: valor, updated_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', body.fila_id).eq('registro_id', registro.id)
        if (error) return fail('No se pudo guardar: ' + error.message, 500)
        if (!count) return fail('La fila no pertenece a este registro', 404)
        return json({ ok: true })
      }

      // ---- Cerrar el parte ---------------------------------------------------
      case 'finalizar': {
        const registro = await registroDeLaSala(db, body.registro_id)
        if (!registro) return fail('Registro no encontrado', 404)
        const nombre = (body.nombre || '').trim()
        if (!nombre) return fail('Falta el nombre de quién finaliza')

        const ahora = new Date().toISOString()
        const { error } = await db.from('hs_registros').update({
          finalizado_por: nombre, finalizado_en: ahora,
          incidencia: !!body.incidencia, updated_at: ahora,
        }).eq('id', registro.id)
        if (error) return fail('No se pudo finalizar: ' + error.message, 500)
        return json({ finalizado_por: nombre, finalizado_en: ahora })
      }

      default:
        return fail('Acción no reconocida')
    }
  } catch (err) {
    return fail('Error inesperado: ' + err.message, 500)
  }
}
