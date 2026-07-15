/**
 * Inicialización del cliente Supabase
 * Se carga como script clásico (no ES module) para que `window.supabase`
 * esté disponible inmediatamente para los scripts que dependen de él.
 *
 * Requiere:
 *   1. CDN de supabase-js cargado antes: https://unpkg.com/@supabase/supabase-js@2
 *   2. CONFIGURACION disponible globalmente (aplicacion.js cargado antes)
 */

if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
  console.error('[Supabase] La librería de Supabase no se ha cargado. Asegúrate de incluir el CDN antes de este script.');
} else if (typeof CONFIGURACION === 'undefined') {
  console.error('[Supabase] CONFIGURACION no está definida. Asegúrate de cargar aplicacion.js antes.');
} else {
  var supabase = window.supabase.createClient(
    CONFIGURACION.supabase.url,
    CONFIGURACION.supabase.anonKey
  );
}

let estadoSesionEnMemoria = null
let promesaEstadoSesion = null
let revisionEstadoSesion = 0
let listenerAuthEstadoSesionRegistrado = false

function construirEstadoSesionVacio() {
  return {
    session: null,
    user: null,
    perfil: null,
    rol: null,
  }
}

function limpiarEstadoSesion() {
  estadoSesionEnMemoria = null
  promesaEstadoSesion = null
  revisionEstadoSesion += 1
}

function clonarEstadoSesion(estado) {
  if (!estado) return null
  return {
    session: estado.session,
    user: estado.user,
    perfil: estado.perfil,
    rol: estado.rol,
  }
}

async function obtenerEstadoSesion() {
  if (estadoSesionEnMemoria) {
    return clonarEstadoSesion(estadoSesionEnMemoria)
  }

  if (promesaEstadoSesion) {
    return promesaEstadoSesion
  }

  const revisionSolicitud = revisionEstadoSesion

  let promesaActual = null
  promesaActual = (async () => {
    try {
      if (!window.supabase || typeof supabase?.auth?.getSession !== 'function') {
        return null
      }

      const { data: { session }, error: errorSesion } = await supabase.auth.getSession()

      if (revisionSolicitud !== revisionEstadoSesion) {
        return null
      }

      if (errorSesion) {
        console.warn('[Supabase] No se pudo obtener la sesión:', errorSesion)
        return null
      }

      if (!session || !session.user?.id) {
        const estadoVacio = construirEstadoSesionVacio()
        if (revisionSolicitud !== revisionEstadoSesion) {
          return null
        }
        estadoSesionEnMemoria = estadoVacio
        return clonarEstadoSesion(estadoVacio)
      }

      const { data: perfil, error: errorPerfil } = await supabase
        .from('perfiles')
        .select('id, rol, nombre_completo, apellidos_completos, nombre_usuario, gmail, activo, eliminado, firma_url')
        .eq('id', session.user.id)
        .maybeSingle()

      if (revisionSolicitud !== revisionEstadoSesion) {
        return null
      }

      if (errorPerfil) {
        console.warn('[Supabase] No se pudo obtener el perfil de sesión:', errorPerfil)
        return {
          session,
          user: session.user || null,
          perfil: null,
          rol: null,
        }
      }

      const estado = {
        session,
        user: session.user || null,
        perfil: perfil || null,
        rol: perfil?.rol ?? null,
      }

      if (revisionSolicitud !== revisionEstadoSesion) {
        return null
      }

      estadoSesionEnMemoria = estado
      return clonarEstadoSesion(estado)
    } catch (err) {
      console.warn('[Supabase] Error obteniendo el estado de sesión:', err)
      return null
    } finally {
      if (promesaEstadoSesion === promesaActual) {
        promesaEstadoSesion = null
      }
    }
  })()

  promesaEstadoSesion = promesaActual
  return promesaActual
}

async function obtenerSesion() {
  const estado = await obtenerEstadoSesion()
  return estado ? estado.session : null
}

async function obtenerPerfil() {
  const estado = await obtenerEstadoSesion()
  return estado ? estado.perfil : null
}

window.obtenerEstadoSesion = obtenerEstadoSesion
window.obtenerSesion = obtenerSesion
window.obtenerPerfil = obtenerPerfil
window.limpiarEstadoSesion = limpiarEstadoSesion

if (window.supabase && typeof supabase?.auth?.onAuthStateChange === 'function' && !listenerAuthEstadoSesionRegistrado) {
  listenerAuthEstadoSesionRegistrado = true
  supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
      limpiarEstadoSesion()
    }
  })
}

/* ════════════════════════════════════════════
   AUTORIZACIÓN POR ROL
   ════════════════════════════════════════════ */
const MODULO_ROLES = {
  dashboard: [1, 2],
  usuarios: [1, 2],
  'registrar-tramite': [1, 2, 3],
  documentos: [1, 2, 3],
  area: [1, 2],
  reportes: [1, 2],
  inventario: [1, 2, 3],
}

async function verificarAcceso(modulo) {
  try {
    if (!window.supabase) return false
    const rolesPermitidos = MODULO_ROLES[modulo] || []

    let session = null
    let perfil = null

    try {
      if (typeof obtenerEstadoSesion === 'function') {
        const estado = await obtenerEstadoSesion()
        session = estado?.session || null
        perfil = estado?.perfil || null
      }

      if (!perfil && typeof obtenerPerfil === 'function') {
        perfil = await obtenerPerfil()
      }
    } catch (errEstado) {
      session = null
      perfil = null
    }

    if (!session || !perfil) {
      const { data: { session: sessionDirecta } } = await supabase.auth.getSession()
      session = sessionDirecta || session

      if (session && !perfil) {
        const { data: perfilDirecto } = await supabase
          .from('perfiles')
          .select('rol, activo, eliminado')
          .eq('id', session.user.id)
          .single()
        perfil = perfilDirecto || null
      }
    }

    if (!session || !perfil) {
      window.location.href = 'index.html'
      return false
    }

    if (perfil.activo === false || perfil.eliminado === true) {
      window.location.href = 'index.html'
      return false
    }

    if (!rolesPermitidos.includes(perfil.rol)) {
      window.location.href = 'documentos.html'
      return false
    }
    return true
  } catch (err) {
    window.location.href = 'index.html'
    return false
  }
}
