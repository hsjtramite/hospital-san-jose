document.addEventListener('DOMContentLoaded', async () => {

  let userId, userEmail

  try {
    const htmlPromise = fetch('js/componentes/header.html').then(resp => resp.text());
    const estadoSesionPromise = typeof obtenerEstadoSesion === 'function'
      ? obtenerEstadoSesion()
      : Promise.resolve(null);

    const html = await htmlPromise;
    document.body.insertAdjacentHTML('afterbegin', html);

    const pagina = document.body.dataset.pagina;
    const ruta = document.body.dataset.ruta;
    if (pagina) document.getElementById('encabezadoPagina').textContent = pagina;
    if (ruta) document.getElementById('encabezadoRuta').textContent = ruta;

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

      // ─── CERRAR SESIÓN ───
      document.getElementById('btnCerrarSesion').addEventListener('click', () => {
        clearInterval(intervalEventos);
        canalNotif.unsubscribe();
        document.getElementById('modalCerrarSesion').classList.add('activo');
      });

      document.getElementById('btnConfirmarCerrarSesion').addEventListener('click', async () => {
        clearInterval(intervalEventos);
        canalNotif.unsubscribe();
        await supabase.auth.signOut();
        window.location.href = 'index.html';
      });

      function cerrarModalSesion() {
        clearInterval(intervalEventos);
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
