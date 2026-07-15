document.addEventListener('header:listo', async () => {

  const resp = await fetch('js/componentes/lateral.html');
  const html = await resp.text();
  document.querySelector('.contenido-principal').insertAdjacentHTML('beforebegin', html);

  const moduloActivo = document.body.dataset.moduloActivo;

  const estadoSesion = typeof obtenerEstadoSesion === 'function'
    ? await obtenerEstadoSesion()
    : null;

  let perfil = estadoSesion?.perfil || null;

  if (!perfil && typeof obtenerPerfil === 'function') {
    perfil = await obtenerPerfil();
  }

  if (!perfil) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfilFallback } = await supabase
      .from('perfiles')
      .select('rol')
      .ilike('gmail', user.email)
      .maybeSingle();

    perfil = perfilFallback || null;
  }

  if (perfil) {
    document.querySelectorAll('.sidebar-item[data-roles]').forEach(item => {
      const rolesPermitidos = item.dataset.roles.split(',').map(Number);
      if (!rolesPermitidos.includes(perfil.rol)) {
        item.style.display = 'none';
      }
    });
  }

  document.querySelectorAll('.sidebar-item.activo').forEach(item => {
    item.classList.remove('activo');
  });

  if (moduloActivo) {
    const item = document.querySelector(`.sidebar-item[data-modulo="${moduloActivo}"]`);
    if (item) item.classList.add('activo');
  }

  // ─── SIDEBAR TOGGLE (responsive overlay) ───
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const btnToggle = document.getElementById('btnSidebarToggle');

  function cerrarSidebar() {
    sidebar.classList.remove('visible');
    overlay.classList.remove('visible');
  }

  function abrirSidebar() {
    sidebar.classList.add('visible');
    overlay.classList.add('visible');
  }

  if (btnToggle) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('visible')) {
        cerrarSidebar();
      } else {
        abrirSidebar();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', cerrarSidebar);
  }

  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        cerrarSidebar();
      }
      const modulo = item.dataset.modulo;
      if (modulo && modulo !== moduloActivo) {
        window.location.href = `${modulo}.html`;
      }
    });
  });

  document.dispatchEvent(new Event('lateral:listo'));

});
