import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const {
      tipo, tipo_documento, fecha, prioridad, autor_id, remitente_id, area_id,
      destinatario, cargo_destinatario, asunto, cuerpo_documento, firmante_id,
    } = body

    if (!tipo || !tipo_documento ||
        !fecha || !prioridad || !autor_id || !remitente_id ||
        !asunto || !cuerpo_documento) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos obligatorios' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido o sesión expirada' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { data: perfil, error: perfilError } = await adminClient
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return new Response(
        JSON.stringify({ error: 'Usuario sin perfil' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (perfil.rol !== 1 && perfil.rol !== 2 && perfil.rol !== 3) {
      return new Response(
        JSON.stringify({ error: 'No tienes permisos para crear documentos' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Llamada a la función RPC atómica
    const { data, error: rpcError } = await adminClient.rpc('crear_documento_atomico', {
      p_tipo: tipo,
      p_tipo_documento: tipo_documento,
      p_fecha: fecha,
      p_prioridad: prioridad,
      p_autor_id: autor_id,
      p_remitente_id: remitente_id,
      p_area_id: area_id || null,
      p_destinatario: destinatario || null,
      p_cargo_destinatario: cargo_destinatario || null,
      p_asunto: asunto,
      p_cuerpo_documento: cuerpo_documento,
      p_creado_por: user.id,
      p_firmante_id: firmante_id || null,
    })

    if (rpcError) {
      // Manejar el caso de que ya exista un número repetido (llave duplicada)
      if (rpcError.code === '23505') {
         return new Response(
          JSON.stringify({ error: 'El número de documento generado ya existe. Por favor intenta de nuevo.' }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Error al crear el documento: ' + rpcError.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id, numero_documento: data.numero_documento }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error interno del servidor'
    return new Response(
      JSON.stringify({ error: mensaje }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
