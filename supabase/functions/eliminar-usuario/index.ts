import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function extraerRutaFirma(firmaUrl: string | null | undefined): string | null {
  if (!firmaUrl) return null

  const coincidencia = firmaUrl.match(/\/documentos\/(firmas\/[^?#]+)/)
  return coincidencia?.[1] ? decodeURIComponent(coincidencia[1]) : null
}

async function contarReferencias(adminClient: ReturnType<typeof createClient>, idUsuario: string) {
  const consultas = [
    adminClient
      .from('documentos')
      .select('id', { head: true, count: 'exact' })
      .or(`autor_id.eq.${idUsuario},remitente_id.eq.${idUsuario},creado_por.eq.${idUsuario},firmante_id.eq.${idUsuario}`),
    adminClient
      .from('documentos_archivos')
      .select('id', { head: true, count: 'exact' })
      .eq('subido_por', idUsuario),
    adminClient
      .from('agenda_eventos')
      .select('id', { head: true, count: 'exact' })
      .or(`usuario_asignado.eq.${idUsuario},creado_por.eq.${idUsuario}`),
    adminClient
      .from('agenda_notificaciones')
      .select('id', { head: true, count: 'exact' })
      .eq('usuario_id', idUsuario),
    adminClient
      .from('inventario_movimientos')
      .select('id', { head: true, count: 'exact' })
      .eq('usuario_id', idUsuario),
  ]

  const resultados = await Promise.all(consultas)

  const referencias = resultados.map((resultado, indice) => {
    if (resultado.error) {
      throw new Error(`Error consultando referencias en consulta ${indice + 1}: ${resultado.error.message}`)
    }

    return resultado.count || 0
  })

  return referencias.reduce((total, cantidad) => total + cantidad, 0)
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
    const { id } = body

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Falta el identificador del usuario' }),
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

    const { data: perfilLlamante, error: perfilError } = await adminClient
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfilLlamante) {
      return new Response(
        JSON.stringify({ error: 'Usuario llamante sin perfil asociado' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (perfilLlamante.rol !== 1 && perfilLlamante.rol !== 2) {
      return new Response(
        JSON.stringify({ error: 'No tienes permisos para eliminar usuarios' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { data: perfilObjetivo, error: errorPerfilObjetivo } = await adminClient
      .from('perfiles')
      .select('id, firma_url')
      .eq('id', id)
      .maybeSingle()

    if (errorPerfilObjetivo) {
      return new Response(
        JSON.stringify({ error: errorPerfilObjetivo.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (!perfilObjetivo) {
      return new Response(
        JSON.stringify({ error: 'El usuario no existe' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const totalReferencias = await contarReferencias(adminClient, id)

    if (totalReferencias > 0) {
      const { error: updateError } = await adminClient
        .from('perfiles')
        .update({ eliminado: true, activo: false })
        .eq('id', id)

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, modo: 'logico', mensaje: 'Usuario eliminado correctamente' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const rutaFirma = extraerRutaFirma(perfilObjetivo.firma_url)

    if (rutaFirma) {
      const { error: deleteFirmaError } = await adminClient.storage
        .from('documentos')
        .remove([rutaFirma])

      if (deleteFirmaError) {
        return new Response(
          JSON.stringify({ error: deleteFirmaError.message }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }
    }

    const { error: deletePerfilError } = await adminClient
      .from('perfiles')
      .delete()
      .eq('id', id)

    if (deletePerfilError) {
      return new Response(
        JSON.stringify({ error: deletePerfilError.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(id)
    if (deleteAuthError) {
      console.warn('[eliminar-usuario] No se pudo eliminar el usuario de Auth:', deleteAuthError.message)
    }

    return new Response(
      JSON.stringify({ success: true, modo: 'fisico', mensaje: 'Usuario eliminado correctamente' }),
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
