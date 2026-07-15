import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * Normaliza texto: quita tildes y convierte a MAYÚSCULAS.
 * Consistente con la normalización del frontend (normalizacion.js).
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
    const { nombre_completo, apellidos_completos, nombre_usuario, gmail, password, rol, activo, firma_url } = body

    if (!nombre_completo || !apellidos_completos || !nombre_usuario || !gmail || !password || !rol) {
      return new Response(
        JSON.stringify({ error: 'Complete todos los campos requeridos' }),
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
    const { data: perfil, error: perfilError } = await adminClient
      .from('perfiles')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfilError || !perfil) {
      return new Response(
        JSON.stringify({ error: 'Usuario sin perfil asociado' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const rolLlamante = perfil.rol
    const rolNuevo = Number(rol)

    // Solo Desarrollador (1) y Administrador (2) pueden crear usuarios
    if (rolLlamante !== 1 && rolLlamante !== 2) {
      return new Response(
        JSON.stringify({ error: 'No tienes permisos para crear usuarios' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Administrador (2) solo puede crear Operadores (3)
    if (rolLlamante === 2 && rolNuevo !== 3) {
      return new Response(
        JSON.stringify({ error: 'No puedes crear usuarios con ese rol' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Normalizar datos ──
    const nombreNorm = normalizarTexto(nombre_completo)
    const apellidosNorm = normalizarTexto(apellidos_completos)
    const usuarioNorm = normalizarTexto(nombre_usuario)
    const gmailNorm = gmail.trim().toLowerCase()

    // ── Validar duplicados antes de crear ──
    const { data: existeUsuario } = await adminClient
      .from('perfiles')
      .select('id')
      .ilike('nombre_usuario', usuarioNorm)
      .maybeSingle()

    if (existeUsuario) {
      return new Response(
        JSON.stringify({ error: 'El nombre de usuario ya está registrado' }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const { data: existeGmail } = await adminClient
      .from('perfiles')
      .select('id')
      .ilike('gmail', gmailNorm)
      .maybeSingle()

    if (existeGmail) {
      return new Response(
        JSON.stringify({ error: 'El correo electrónico ya está registrado' }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Crear usuario en auth.users ──
    const { data: userData, error: authError } = await adminClient.auth.admin.createUser({
      email: gmailNorm,
      password,
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
      // Traducir errores comunes de Supabase Auth
      let mensaje = authError.message
      if (mensaje.includes('already been registered') || mensaje.includes('already exists')) {
        mensaje = 'El correo electrónico ya está registrado en autenticación'
      }
      return new Response(
        JSON.stringify({ error: mensaje }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // ── Actualizar perfil (el trigger ya lo insertó) ──
    const { error: insertError } = await adminClient
      .from('perfiles')
      .update({
        nombre_completo: nombreNorm,
        apellidos_completos: apellidosNorm,
        nombre_usuario: usuarioNorm,
        gmail: gmailNorm,
        rol: rolNuevo,
        activo: activo ?? true,
        firma_url: firma_url || null,
      })
      .eq('id', userData.user.id)

    if (insertError) {
      // Rollback: eliminar el usuario de auth si falla el perfil
      await adminClient.auth.admin.deleteUser(userData.user.id)

      let mensaje = 'Error al crear el perfil del usuario'
      if (insertError.message?.includes('unique') || insertError.code === '23505') {
        mensaje = 'Ya existe un perfil con ese nombre de usuario o correo'
      }

      return new Response(
        JSON.stringify({ error: mensaje }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: userData.user.id }),
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
