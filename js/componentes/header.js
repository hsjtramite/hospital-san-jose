const CONFIG_DEFAULT = {
  tema: 'claro', mostrarReloj: true, mostrarFecha: true, formatoHora: '24', idioma: 'es',
};

function cargarConfiguracion() {
  try {
    const guardada = JSON.parse(localStorage.getItem('configuracionSistema'));
    return { ...CONFIG_DEFAULT, ...(guardada || {}) };
  } catch {
    return { ...CONFIG_DEFAULT };
  }
}

function aplicarConfiguracionGlobal(config) {
  document.documentElement.setAttribute('data-tema', config.tema);
}

function aplicarConfiguracionHeader(config) {
  const reloj = document.getElementById('encabezadoReloj');
  if (reloj) reloj.style.display = config.mostrarReloj ? 'flex' : 'none';
  const fecha = document.getElementById('encabezadoFecha');
  if (fecha) fecha.style.display = config.mostrarFecha ? 'block' : 'none';
}

const TRADUCCIONES = {
  es: {
    subtitulo: 'Trámite Documentario',
    notif_titulo: 'Notificaciones',
    notif_marcar_leidas: 'Marcar todo leído',
    notif_ver_todas: 'Ver todas en Agenda →',
    perfil_mi_perfil: 'Mi perfil',
    perfil_configuracion: 'Configuración',
    perfil_cambiar_password: 'Cambiar contraseña',
    perfil_cerrar_sesion: 'Cerrar sesión',
    menu_dashboard: 'Dashboard',
    menu_usuarios: 'Usuarios',
    menu_registrar_tramite: 'Registrar Trámite',
    menu_documentos: 'Documentos',
    menu_areas: 'Áreas',
    menu_reportes: 'Reportes',
    menu_inventario: 'Inventario',
  },
  en: {
    subtitulo: 'Document Management',
    notif_titulo: 'Notifications',
    notif_marcar_leidas: 'Mark all read',
    notif_ver_todas: 'View all in Schedule →',
    perfil_mi_perfil: 'My profile',
    perfil_configuracion: 'Settings',
    perfil_cambiar_password: 'Change password',
    perfil_cerrar_sesion: 'Sign out',
    menu_dashboard: 'Dashboard',
    menu_usuarios: 'Users',
    menu_registrar_tramite: 'Register Document',
    menu_documentos: 'Documents',
    menu_areas: 'Departments',
    menu_reportes: 'Reports',
    menu_inventario: 'Inventory',
  },
};

function aplicarIdioma(idioma) {
  const dict = TRADUCCIONES[idioma] || TRADUCCIONES.es;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const clave = el.dataset.i18n;
    if (dict[clave]) el.textContent = dict[clave];
  });
}

let configuracionActual = cargarConfiguracion();
aplicarConfiguracionGlobal(configuracionActual);

document.addEventListener('lateral:listo', () => aplicarIdioma(configuracionActual.idioma));

document.addEventListener('DOMContentLoaded', async () => {

  let userId, userEmail

  try {
    const htmlPromise = fetch('js/componentes/header.html').then(resp => resp.text());
    const estadoSesionPromise = typeof obtenerEstadoSesion === 'function'
      ? obtenerEstadoSesion()
      : Promise.resolve(null);

    const html = await htmlPromise;
    document.body.insertAdjacentHTML('afterbegin', html);

    aplicarConfiguracionHeader(configuracionActual);
    aplicarIdioma(configuracionActual.idioma);

    const pagina = document.body.dataset.pagina;
    const ruta = document.body.dataset.ruta;
    if (pagina) document.getElementById('encabezadoPagina').textContent = pagina;
    if (ruta) document.getElementById('encabezadoRuta').textContent = ruta;

    // ─── RELOJ EN TIEMPO REAL ───
    function actualizarRelojHeader() {
      const el = document.getElementById('encabezadoHora');
      if (el) {
        const ahora = new Date();
        let horas = ahora.getHours();
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        const segundos = String(ahora.getSeconds()).padStart(2, '0');
        if (configuracionActual.formatoHora === '12') {
          const sufijo = horas >= 12 ? 'PM' : 'AM';
          horas = horas % 12 || 12;
          el.textContent = `${String(horas).padStart(2, '0')}:${minutos}:${segundos} ${sufijo}`;
        } else {
          el.textContent = `${String(horas).padStart(2, '0')}:${minutos}:${segundos}`;
        }
      }
      const elFecha = document.getElementById('encabezadoFecha');
      if (elFecha) {
        elFecha.textContent = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    }
    actualizarRelojHeader();
    setInterval(actualizarRelojHeader, 1000);

    const estadoSesion = await estadoSesionPromise;
    const session = estadoSesion?.session || null;
    const user = estadoSesion?.user || session?.user || null;
    const perfil = estadoSesion?.perfil || null;

    if (!session || !user) {
      window.location.href = 'index.html';
      return;
    }

    userId = user.id;
    userEmail = user.email;

    window.escaparHtml = function (texto) {
      if (!texto) return ''
      const div = document.createElement('div')
      div.appendChild(document.createTextNode(texto))
      return div.innerHTML
    }

    if (perfil) {
      const primerApellido = perfil.apellidos_completos.split(' ')[0];
      document.getElementById('txtNombreUsuario').textContent =
        `${perfil.nombre_completo} ${primerApellido}`;
      document.getElementById('perfilDropdownNombre').textContent =
        `${perfil.nombre_completo} ${primerApellido}`;
      document.getElementById('avatarIniciales').textContent =
        (perfil.nombre_completo.charAt(0) + primerApellido.charAt(0)).toUpperCase();
    } else {
      const { data: perfilFallback } = await supabase
        .from('perfiles')
        .select('nombre_completo, apellidos_completos')
        .ilike('gmail', userEmail)
        .maybeSingle();

      if (perfilFallback) {
        const primerApellido = perfilFallback.apellidos_completos.split(' ')[0];
        document.getElementById('txtNombreUsuario').textContent =
          `${perfilFallback.nombre_completo} ${primerApellido}`;
        document.getElementById('perfilDropdownNombre').textContent =
          `${perfilFallback.nombre_completo} ${primerApellido}`;
        document.getElementById('avatarIniciales').textContent =
          (perfilFallback.nombre_completo.charAt(0) + primerApellido.charAt(0)).toUpperCase();
      }
    }

  } catch (err) {
    window.location.href = 'index.html';
    return;
  } finally {
    document.body.classList.add('visible');
    document.dispatchEvent(new Event('header:listo'));
  }

  // ─── POST-RENDER: CARGA PROGRESIVA ───
  ;(async () => {
    try {
      // ─── NOTIFICACIONES ───
      let notificaciones = [];
      let dropdownAbierto = false;

      const badge = document.getElementById('badgeNotifHeader');
      const btnNotif = document.getElementById('btnNotificaciones');
      const dropdown = document.getElementById('notifDropdown');
      const dropdownLista = document.getElementById('notifDropdownLista');
      const btnMarcarLeidas = document.getElementById('btnMarcarLeidasHeader');
      const btnVerTodas = document.getElementById('btnVerTodasNotif');

      function formatearFechaRelativa(iso) {
        if (!iso) return ''
        const fecha = new Date(iso)
        const ahora = new Date()
        const diffMs = ahora - fecha
        const diffMin = Math.floor(diffMs / 60000)
        const diffHoras = Math.floor(diffMs / 3600000)
        const diffDias = Math.floor(diffMs / 86400000)
        if (diffMin < 1) return 'Ahora'
        if (diffMin < 60) return `Hace ${diffMin} min`
        if (diffHoras < 24) return `Hace ${diffHoras}h`
        if (diffDias < 7) return `Hace ${diffDias} día${diffDias > 1 ? 's' : ''}`
        return fecha.toLocaleDateString('es-PE')
      }

      function actualizarBadge() {
        const noLeidas = notificaciones.filter(n => !n.leido).length
        if (noLeidas > 0) {
          badge.textContent = noLeidas;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }

      function renderizarDropdown() {
        if (notificaciones.length === 0) {
          dropdownLista.innerHTML = '<div class="notif-dropdown-vacio">No hay notificaciones</div>';
        } else {
          dropdownLista.innerHTML = notificaciones.slice(0, 10).map(n => `
            <div class="notif-dropdown-item ${n.leido ? '' : 'no-leido'}" data-id="${n.id}">
              <div class="notif-dropdown-item-icono">
                <i class="ph ph-bell"></i>
              </div>
              <div class="notif-dropdown-item-body">
                <div class="notif-dropdown-item-titulo">${escaparHtml(n.titulo)}</div>
                ${n.mensaje ? `<div class="notif-dropdown-item-mensaje">${escaparHtml(n.mensaje)}</div>` : ''}
                <div class="notif-dropdown-item-fecha">${formatearFechaRelativa(n.created_at)}</div>
              </div>
              ${n.leido ? '' : '<div class="notif-dropdown-item-punto"></div>'}
            </div>
          `).join('');
        }

        const noLeidas = notificaciones.filter(n => !n.leido).length;
        btnMarcarLeidas.style.display = noLeidas > 0 ? 'inline' : 'none';
      }

      async function marcarLeida(id) {
        const { error } = await supabase
          .from('agenda_notificaciones')
          .update({ leido: true, fecha_lectura: new Date().toISOString() })
          .eq('id', id);
        if (!error) {
          const notif = notificaciones.find(n => n.id === id);
          if (notif) notif.leido = true;
          renderizarDropdown();
          actualizarBadge();
        }
      }

      async function marcarTodasLeidas() {
        const ids = notificaciones.filter(n => !n.leido).map(n => n.id);
        if (ids.length === 0) return;
        const { error } = await supabase
          .from('agenda_notificaciones')
          .update({ leido: true, fecha_lectura: new Date().toISOString() })
          .in('id', ids);
        if (!error) {
          notificaciones.forEach(n => n.leido = true);
          renderizarDropdown();
          actualizarBadge();
        }
      }

      async function cargarNotificaciones() {
        const { data, error } = await supabase
          .from('agenda_notificaciones')
          .select('*')
          .eq('usuario_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);
        if (!error && data) {
          const mapa = new Map();
          for (const n of data || []) mapa.set(n.id, n);
          for (const n of notificaciones) mapa.set(n.id, n);
          notificaciones = Array.from(mapa.values())
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);
          actualizarBadge();
          if (dropdownAbierto) renderizarDropdown();
        }
      }

      await cargarNotificaciones();

      // ─── CHECKER CADA 60s — NOTIFICAR 5 MIN ANTES ───
      async function revisarEventosProximos() {
        try {
          const hoy = new Date().toISOString().slice(0, 10)
          const dentroDe = new Date(Date.now() + 6 * 60000).toTimeString().slice(0, 5)
          const hace1min = new Date(Date.now() - 60000).toTimeString().slice(0, 5)

          const { data: eventos, error } = await supabase
            .from('agenda_eventos')
            .select('id, titulo, fecha_evento, hora_evento')
            .eq('usuario_asignado', userId)
            .eq('fecha_evento', hoy)
            .eq('completado', false)

          if (error) {
            console.error('Error revisando eventos próximos:', error)
            return
          }
                async function revisarEventosIniciados() {
        try {
          const hoy = new Date().toISOString().slice(0, 10)
          const ahoraStr = new Date().toTimeString().slice(0, 5)
          const hace2min = new Date(Date.now() - 2 * 60000).toTimeString().slice(0, 5)

          const { data: eventos, error } = await supabase
            .from('agenda_eventos')
            .select('id, titulo, fecha_evento, hora_evento')
            .eq('usuario_asignado', userId)
            .eq('fecha_evento', hoy)
            .eq('completado', false)

          if (error || !eventos || eventos.length === 0) return

          const eventosIniciando = eventos.filter(e => {
            if (!e.hora_evento) return false
            const h = e.hora_evento.slice(0, 5)
            return h >= hace2min && h <= ahoraStr
          })

          if (eventosIniciando.length === 0) return

          const ids = eventosIniciando.map(e => e.id)
          const { data: existentes } = await supabase
            .from('agenda_notificaciones')
            .select('evento_id')
            .in('evento_id', ids)
            .eq('usuario_id', userId)
            .eq('titulo', 'La reunión ha comenzado')

          const idsYaNotificados = new Set((existentes || []).map(n => n.evento_id))

          for (const evento of eventosIniciando) {
            if (idsYaNotificados.has(evento.id)) continue
            const { error: errInsert } = await supabase.from('agenda_notificaciones').insert({
              usuario_id: userId,
              evento_id: evento.id,
              titulo: 'La reunión ha comenzado',
              mensaje: `${evento.titulo} está en curso`,
            })
            if (errInsert) console.error('Error insertando notificación de inicio:', errInsert)
          }
        } catch (err) {
          console.error('Error en revisarEventosIniciados:', err)
        }
      }
          if (!eventos || eventos.length === 0) return

          const eventosProximos = eventos.filter(e => {
            if (!e.hora_evento) return false
            const h = e.hora_evento.slice(0, 5)
            return h >= hace1min && h <= dentroDe
          })

          if (eventosProximos.length === 0) return

          const ids = eventosProximos.map(e => e.id)
          const { data: existentes } = await supabase
            .from('agenda_notificaciones')
            .select('evento_id')
            .in('evento_id', ids)
            .eq('usuario_id', userId)

          const idsYaNotificados = new Set((existentes || []).map(n => n.evento_id))

          for (const evento of eventosProximos) {
            if (idsYaNotificados.has(evento.id)) continue

            const fechaFormateada = formatearFechaLocal(hoy)
            const horaStr = evento.hora_evento ? evento.hora_evento.slice(0, 5) : ''
            const { error: errInsert } = await supabase.from('agenda_notificaciones').insert({
              usuario_id: userId,
              evento_id: evento.id,
              titulo: 'Evento en 5 minutos',
              mensaje: `${evento.titulo} — ${fechaFormateada} ${horaStr}`,
            })
            if (errInsert) {
              console.error('Error insertando notificación:', errInsert)
            }
          }
        } catch (err) {
          console.error('Error en revisarEventosProximos:', err)
        }
      }
      async function revisarEventosIniciados() {
        try {
          const hoy = new Date().toISOString().slice(0, 10)
          const ahoraStr = new Date().toTimeString().slice(0, 5)
          const hace2min = new Date(Date.now() - 2 * 60000).toTimeString().slice(0, 5)

          const { data: eventos, error } = await supabase
            .from('agenda_eventos')
            .select('id, titulo, fecha_evento, hora_evento')
            .eq('usuario_asignado', userId)
            .eq('fecha_evento', hoy)
            .eq('completado', false)

          if (error || !eventos || eventos.length === 0) return

          const eventosIniciando = eventos.filter(e => {
            if (!e.hora_evento) return false
            const h = e.hora_evento.slice(0, 5)
            return h >= hace2min && h <= ahoraStr
          })

          if (eventosIniciando.length === 0) return

          const ids = eventosIniciando.map(e => e.id)
          const { data: existentes } = await supabase
            .from('agenda_notificaciones')
            .select('evento_id')
            .in('evento_id', ids)
            .eq('usuario_id', userId)
            .eq('titulo', 'La reunión ha comenzado')

          const idsYaNotificados = new Set((existentes || []).map(n => n.evento_id))

          for (const evento of eventosIniciando) {
            if (idsYaNotificados.has(evento.id)) continue
            const { error: errInsert } = await supabase.from('agenda_notificaciones').insert({
              usuario_id: userId,
              evento_id: evento.id,
              titulo: 'La reunión ha comenzado',
              mensaje: `${evento.titulo} está en curso`,
            })
            if (errInsert) console.error('Error insertando notificación de inicio:', errInsert)
          }
        } catch (err) {
          console.error('Error en revisarEventosIniciados:', err)
        }
      }
      let audioCtx = null

      function desbloquearAudio() {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {})
        }
      }

      document.addEventListener('click', desbloquearAudio, { once: true })
      document.addEventListener('touchstart', desbloquearAudio, { once: true })

      async function reproducirSonidoNotificacion() {
        try {
          console.log('[Notificación] Reproduciendo sonido')
          if (!audioCtx) desbloquearAudio()
          if (!audioCtx) return
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume()
          }
          const now = audioCtx.currentTime
          for (const [freq, inicio] of [[660, 0], [880, 0.18]]) {
            const osc = audioCtx.createOscillator()
            const gain = audioCtx.createGain()
            osc.connect(gain)
            gain.connect(audioCtx.destination)
            osc.frequency.value = freq
            osc.type = 'sine'
            gain.gain.setValueAtTime(0.5, now + inicio)
            gain.gain.exponentialRampToValueAtTime(0.001, now + inicio + 0.2)
            osc.start(now + inicio)
            osc.stop(now + inicio + 0.2)
          }
        } catch (e) {
          console.warn('[Notificación] Error al reproducir sonido:', e)
        }
      }

      function formatearFechaLocal(fechaStr) {
        if (!fechaStr) return ''
        const [a, m, d] = fechaStr.split('-')
        const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                       'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
        return `${parseInt(d)} de ${MESES[parseInt(m) - 1]} del ${a}`
      }

           revisarEventosProximos()
      setTimeout(revisarEventosProximos, 5000)
      const intervalEventos = setInterval(revisarEventosProximos, 60000)

      revisarEventosIniciados()
      setTimeout(revisarEventosIniciados, 5000)
      const intervalEventosIniciados = setInterval(revisarEventosIniciados, 60000)

      const canalNotif = supabase
        .channel('notificaciones-header')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'agenda_notificaciones',
            filter: `usuario_id=eq.${userId}` },
          async (payload) => {
            notificaciones.unshift(payload.new);
            if (notificaciones.length > 10) notificaciones.pop();
            actualizarBadge();
            await reproducirSonidoNotificacion();
            if (dropdownAbierto) renderizarDropdown();
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'agenda_notificaciones',
            filter: `usuario_id=eq.${userId}` },
          (payload) => {
            const idx = notificaciones.findIndex(n => n.id === payload.new.id);
            if (idx !== -1) {
              notificaciones[idx] = payload.new;
              actualizarBadge();
              if (dropdownAbierto) renderizarDropdown();
            }
          }
        )
        .subscribe();

      btnNotif.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownAbierto = !dropdownAbierto;
        dropdown.style.display = dropdownAbierto ? 'flex' : 'none';
        if (dropdownAbierto) renderizarDropdown();
      });

      document.addEventListener('click', (e) => {
        if (dropdownAbierto && !document.getElementById('notifWrapper').contains(e.target)) {
          dropdownAbierto = false;
          dropdown.style.display = 'none';
        }
      });

      dropdownLista.addEventListener('click', (e) => {
        const item = e.target.closest('.notif-dropdown-item');
        if (item) {
          const id = item.dataset.id;
          const notif = notificaciones.find(n => n.id === id);
          if (notif && !notif.leido) {
            marcarLeida(id);
          }
        }
      });

      btnMarcarLeidas.addEventListener('click', (e) => {
        e.stopPropagation();
        marcarTodasLeidas();
      });

      btnVerTodas.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = 'dashboard.html';
      });

      // ─── MENÚ DE PERFIL ───
      const perfilWrapper = document.getElementById('perfilWrapper');
      const perfilTrigger = document.getElementById('perfilTrigger');
      const perfilDropdown = document.getElementById('perfilDropdown');
      let perfilAbierto = false;

      perfilTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        perfilAbierto = !perfilAbierto;
        perfilDropdown.style.display = perfilAbierto ? 'flex' : 'none';
        if (dropdownAbierto) {
          dropdownAbierto = false;
          dropdown.style.display = 'none';
        }
      });

      document.addEventListener('click', (e) => {
        if (perfilAbierto && !perfilWrapper.contains(e.target)) {
          perfilAbierto = false;
          perfilDropdown.style.display = 'none';
        }
      });

      // ─── MI PERFIL ───
      const MAPA_ROLES = { 1: 'Desarrollador', 2: 'Administrador', 3: 'Operador' };

      document.getElementById('btnMiPerfil').addEventListener('click', async () => {
        perfilAbierto = false;
        perfilDropdown.style.display = 'none';
        document.getElementById('errorMiPerfil').style.display = 'none';

        const { data: datosPerfil, error: errorPerfil } = await supabase
          .from('perfiles')
          .select('nombre_completo, apellidos_completos, nombre_usuario, gmail, rol')
          .eq('id', userId)
          .single();

        if (errorPerfil || !datosPerfil) {
          alert('No se pudo cargar tu perfil. Intenta de nuevo.');
          return;
        }

        document.getElementById('campoPerfilNombre').value = datosPerfil.nombre_completo || '';
        document.getElementById('campoPerfilApellidos').value = datosPerfil.apellidos_completos || '';
        document.getElementById('campoPerfilUsuario').value = datosPerfil.nombre_usuario || '';
        document.getElementById('campoPerfilCorreo').value = datosPerfil.gmail || '';
        document.getElementById('campoPerfilRol').value = MAPA_ROLES[datosPerfil.rol] || '—';

        document.getElementById('modalMiPerfil').classList.add('activo');
      });

      function cerrarModalMiPerfil() {
        document.getElementById('modalMiPerfil').classList.remove('activo');
      }

      document.getElementById('btnCerrarMiPerfil').addEventListener('click', cerrarModalMiPerfil);
      document.getElementById('btnCancelarMiPerfil').addEventListener('click', cerrarModalMiPerfil);
      document.getElementById('modalMiPerfil').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalMiPerfil')) cerrarModalMiPerfil();
      });

      document.getElementById('btnGuardarMiPerfil').addEventListener('click', async () => {
        const nombre = document.getElementById('campoPerfilNombre').value.trim();
        const apellidos = document.getElementById('campoPerfilApellidos').value.trim();
        const errorEl = document.getElementById('errorMiPerfil');
        const btn = document.getElementById('btnGuardarMiPerfil');

        errorEl.style.display = 'none';

        if (!nombre || !apellidos) {
          errorEl.textContent = 'Nombre y apellidos son obligatorios.';
          errorEl.style.display = 'block';
          return;
        }

        btn.disabled = true;
        document.getElementById('textoGuardarMiPerfil').textContent = 'Guardando...';

        const { error: errorUpdate } = await supabase
          .from('perfiles')
          .update({
            nombre_completo: nombre,
            apellidos_completos: apellidos,
            actualizado_en: new Date().toISOString(),
          })
          .eq('id', userId);

        btn.disabled = false;
        document.getElementById('textoGuardarMiPerfil').textContent = 'Guardar';

        if (errorUpdate) {
          errorEl.textContent = 'No se pudo guardar. Intenta de nuevo.';
          errorEl.style.display = 'block';
          return;
        }

        const primerApellido = apellidos.split(' ')[0];
        document.getElementById('txtNombreUsuario').textContent = `${nombre} ${primerApellido}`;
        document.getElementById('perfilDropdownNombre').textContent = `${nombre} ${primerApellido}`;
        document.getElementById('avatarIniciales').textContent =
          (nombre.charAt(0) + primerApellido.charAt(0)).toUpperCase();

        cerrarModalMiPerfil();
        alert('Perfil actualizado correctamente.');
      });

      // ─── CONFIGURACIÓN ───
      document.getElementById('btnConfiguracion').addEventListener('click', () => {
        perfilAbierto = false;
        perfilDropdown.style.display = 'none';
        const c = configuracionActual;
        document.getElementById(c.tema === 'oscuro' ? 'radioTemaOscuro' : 'radioTemaClaro').checked = true;
        document.getElementById('chkMostrarReloj').checked = c.mostrarReloj;
        document.getElementById('chkMostrarFecha').checked = c.mostrarFecha;
        document.getElementById('selectFormatoHora').value = c.formatoHora;
        document.getElementById('selectIdioma').value = c.idioma;
        document.getElementById('modalConfiguracion').classList.add('activo');
      });

      function cerrarModalConfiguracion() {
        document.getElementById('modalConfiguracion').classList.remove('activo');
      }
      document.getElementById('btnCerrarConfiguracion').addEventListener('click', cerrarModalConfiguracion);
      document.getElementById('modalConfiguracion').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalConfiguracion')) cerrarModalConfiguracion();
      });

      document.getElementById('btnRestablecerConfiguracion').addEventListener('click', () => {
        document.getElementById('radioTemaClaro').checked = true;
        document.getElementById('chkMostrarReloj').checked = true;
        document.getElementById('chkMostrarFecha').checked = true;
        document.getElementById('selectFormatoHora').value = '24';
        document.getElementById('selectIdioma').value = 'es';
      });

      document.getElementById('btnGuardarConfiguracion').addEventListener('click', () => {
        const nuevaConfig = {
          tema: document.getElementById('radioTemaOscuro').checked ? 'oscuro' : 'claro',
          mostrarReloj: document.getElementById('chkMostrarReloj').checked,
          mostrarFecha: document.getElementById('chkMostrarFecha').checked,
          formatoHora: document.getElementById('selectFormatoHora').value,
          idioma: document.getElementById('selectIdioma').value,
        };
        configuracionActual = nuevaConfig;
        localStorage.setItem('configuracionSistema', JSON.stringify(nuevaConfig));
        aplicarConfiguracionGlobal(nuevaConfig);
        aplicarConfiguracionHeader(nuevaConfig);
        aplicarIdioma(nuevaConfig.idioma);
        actualizarRelojHeader();
        cerrarModalConfiguracion();
        alert('Configuración guardada correctamente.');
      });

      // ─── CAMBIAR CONTRASEÑA ───
      document.getElementById('btnCambiarPassword').addEventListener('click', () => {
        perfilAbierto = false;
        perfilDropdown.style.display = 'none';
        document.getElementById('formCambiarPassword').reset();
        document.getElementById('errorCambiarPassword').style.display = 'none';
        document.getElementById('modalCambiarPassword').classList.add('activo');
      });

      function cerrarModalPassword() {
        document.getElementById('modalCambiarPassword').classList.remove('activo');
      }

      document.getElementById('btnCerrarCambiarPassword').addEventListener('click', cerrarModalPassword);
      document.getElementById('btnCancelarCambiarPassword').addEventListener('click', cerrarModalPassword);
      document.getElementById('modalCambiarPassword').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalCambiarPassword')) cerrarModalPassword();
      });

      document.getElementById('btnGuardarPassword').addEventListener('click', async () => {
        const actual = document.getElementById('campoPasswordActual').value;
        const nueva = document.getElementById('campoPasswordNueva').value;
        const confirmar = document.getElementById('campoPasswordConfirmar').value;
        const errorEl = document.getElementById('errorCambiarPassword');
        const btn = document.getElementById('btnGuardarPassword');

        errorEl.style.display = 'none';

        if (nueva.length < 6) {
          errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
          errorEl.style.display = 'block';
          return;
        }
        if (nueva !== confirmar) {
          errorEl.textContent = 'La nueva contraseña y la confirmación no coinciden.';
          errorEl.style.display = 'block';
          return;
        }

        btn.disabled = true;
        document.getElementById('textoGuardarPassword').textContent = 'Guardando...';

        const { error: errorLogin } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: actual,
        });

        if (errorLogin) {
          errorEl.textContent = 'La contraseña actual es incorrecta.';
          errorEl.style.display = 'block';
          btn.disabled = false;
          document.getElementById('textoGuardarPassword').textContent = 'Guardar';
          return;
        }

        const { error: errorUpdate } = await supabase.auth.updateUser({ password: nueva });

        btn.disabled = false;
        document.getElementById('textoGuardarPassword').textContent = 'Guardar';

        if (errorUpdate) {
          errorEl.textContent = 'No se pudo actualizar la contraseña. Intenta de nuevo.';
          errorEl.style.display = 'block';
          return;
        }

        cerrarModalPassword();
        alert('Contraseña actualizada correctamente.');
      });

      // ─── CERRAR SESIÓN ───
      document.getElementById('btnCerrarSesion').addEventListener('click', () => {
        perfilAbierto = false;
        perfilDropdown.style.display = 'none';
        clearInterval(intervalEventos);
                clearInterval(intervalEventosIniciados);
        canalNotif.unsubscribe();
        document.getElementById('modalCerrarSesion').classList.add('activo');
      });

      document.getElementById('btnConfirmarCerrarSesion').addEventListener('click', async () => {
        clearInterval(intervalEventos);
                clearInterval(intervalEventosIniciados);
        canalNotif.unsubscribe();
        await supabase.auth.signOut();
        window.location.href = 'index.html';
      });

      function cerrarModalSesion() {
        clearInterval(intervalEventos);
                clearInterval(intervalEventosIniciados);
        canalNotif.unsubscribe();
        document.getElementById('modalCerrarSesion').classList.remove('activo');
      }

      document.getElementById('btnCancelarCerrarSesion').addEventListener('click', cerrarModalSesion);
      document.getElementById('modalCerrarSesion').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalCerrarSesion')) cerrarModalSesion();
      });

    } catch (err) {
      console.warn('[Header] Error en carga progresiva:', err);
    }
  })();

});