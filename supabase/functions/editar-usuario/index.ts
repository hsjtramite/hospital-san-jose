import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * Normaliza texto: quita tildes y convierte a MAYÚSCULAS.
 */
function normalizarTexto(texto: string): string {
  if (!texto) return ''
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // ── Verificar token de autorización ──
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Parsear body ──
    const body = await req.json()
    const { id, nombre_completo, apellidos_completos, nombre_usuario, gmail, rol, activo, firma_url } = body

    if (!id || !nombre_completo || !apellidos_completos || !nombre_usuario || !gmail || !rol) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos obligatorios' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Crear cliente admin con SERVICE_ROLE_KEY (bypasses RLS) ──
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ── Verificar que quien llama es un usuario válido ──
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido o sesión expirada' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Verificar rol del usuario que llama ──
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

    const rolLlamante = perfilLlamante.rol
    const rolNuevo = Number(rol)

    // Solo Desarrollador (1) y Administrador (2) pueden editar usuarios
    if (rolLlamante !== 1 && rolLlamante !== 2) {
      return new Response(
        JSON.stringify({ error: 'No tienes permisos para editar usuarios' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Normalizar datos ──
    const nombreNorm = normalizarTexto(nombre_completo)
    const apellidosNorm = normalizarTexto(apellidos_completos)
    const usuarioNorm = normalizarTexto(nombre_usuario)
    const gmailNorm = gmail.trim().toLowerCase()

    // ── Validar duplicados de otro usuario ──
    // Verificar si el nombre de usuario ya lo tiene OTRO ID
    const { data: existeUsuario } = await adminClient
      .from('perfiles')
      .select('id')
      .ilike('nombre_usuario', usuarioNorm)
      .neq('id', id) // != ID editado
      .maybeSingle()

    if (existeUsuario) {
      return new Response(
        JSON.stringify({ error: 'El nombre de usuario ya está registrado por otra persona' }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { data: existeGmail } = await adminClient
      .from('perfiles')
      .select('id')
      .ilike('gmail', gmailNorm)
      .neq('id', id)
      .maybeSingle()

    if (existeGmail) {
      return new Response(
        JSON.stringify({ error: 'El correo electrónico ya está registrado por otra persona' }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Actualizar usuario en auth.users ──
    const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
      email: gmailNorm,
      email_confirm: true,
      user_metadata: {
        nombre_completo: nombreNorm,
        nombre_usuario: usuarioNorm,
      },
      app_metadata: {
        rol: rolNuevo === 1 ? 'desarrollador' : rolNuevo === 2 ? 'administrador' : 'operador',
      },
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Actualizar perfil en la tabla perfiles ──
    const updatePayload: any = {
      nombre_completo: nombreNorm,
      apellidos_completos: apellidosNorm,
      nombre_usuario: usuarioNorm,
      gmail: gmailNorm,
      rol: rolNuevo,
      activo: activo ?? true,
    }

    if (firma_url !== undefined) {
      updatePayload.firma_url = firma_url
    }

    const { error: updateError } = await adminClient
      .from('perfiles')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Error al actualizar el perfil en la base de datos' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
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
