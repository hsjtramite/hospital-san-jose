document.addEventListener('lateral:listo', async () => {
  if (document.body.dataset.moduloActivo !== 'usuarios') return;
  if (!await verificarAcceso('usuarios')) return;

  const contenedor = document.querySelector('.usuarios-content');
  const panel = document.getElementById('panelFormulario');
  const form = document.getElementById('formCrearUsuario');
  const inputFirma = document.getElementById('campoFirma');
  const firmaPreview = document.getElementById('firmaPreview');
  const firmaNombre = document.getElementById('firmaNombre');
  const btnGuardar = document.getElementById('btnGuardarUsuario');
  const textoGuardar = document.getElementById('textoGuardar');
  const spinnerGuardar = document.getElementById('spinnerGuardar');

  const wrapperCampoRol = document.getElementById('wrapperCampoRol');
  const triggerCampoRol = document.getElementById('triggerCampoRol');
  const dropdownCampoRol = document.getElementById('dropdownCampoRol');

  let todosLosUsuarios = [];
  let valorFiltroRol = '';
  let rolSeleccionado = '';
  let editandoId = null;
  const CLASE_SHEET_USUARIOS = 'usuarios-sheet-activo';

  const headerHTML = `
    <div class="tabla-header-filtros">
      <div class="filtro-search">
        <i class="ph ph-magnifying-glass"></i>
        <input type="text" class="filtro-input" id="buscarUsuario" placeholder="Buscar usuario..." />
      </div>
      <div class="filtro-group">
        <div class="filtro-select-wrapper" id="wrapperFiltroRol">
          <button type="button" class="filtro-select-trigger" id="triggerFiltroRol">
            <span class="filtro-select-text">Todos los roles</span>
            <i class="ph ph-caret-down filtro-select-arrow"></i>
          </button>
          <div class="filtro-dropdown" id="dropdownFiltroRol"></div>
        </div>
      </div>
      <button class="btn-filled-md" id="btnNuevoRegistroFooter" style="margin-left: auto;">Nuevo Registro</button>
    </div>
  `;

  const tabla = new Tabla({
    headerHTML,
    columnas: [
      { clave: 'nombre_completo', titulo: 'Nombre' },
      { clave: 'apellidos_completos', titulo: 'Apellidos' },
      { clave: 'nombre_usuario', titulo: 'Usuario' },
      { clave: 'gmail', titulo: 'Correo' },
      { clave: 'rol_nombre', titulo: 'Rol' },
      {
        clave: 'activo', titulo: 'Estado',
        render: (v) => v
          ? '<span class="tabla-badge activo"><i class="ph ph-check-circle"></i> Activo</span>'
          : '<span class="tabla-badge inactivo"><i class="ph ph-x-circle"></i> Inactivo</span>',
      },
      {
        clave: 'acciones', titulo: '',
        render: (v, fila) => {
          const activo = fila.activo;
          const accion = activo ? 'desactivar' : 'reactivar';
          const icono = activo ? 'ph-lock' : 'ph-lock-open';
          const titulo = activo ? 'Desactivar' : 'Reactivar';
          const clase = activo ? 'btn-eliminar' : 'btn-reactivar';
          return `
            <div class="acciones-tabla">
              <button class="btn-accion btn-editar" data-accion="editar" data-id="${fila.id}" title="Editar">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="btn-accion ${clase}" data-accion="${accion}" data-id="${fila.id}" title="${titulo}">
                <i class="ph ${icono}"></i>
              </button>
              <button class="btn-accion btn-eliminar" data-accion="eliminar" data-id="${fila.id}" title="Eliminar">
                <i class="ph ph-trash-simple"></i>
              </button>
            </div>
          `;
        },
      },
    ],
  });

  contenedor.appendChild(tabla.obtenerElemento());
  await cargarRoles();
  await cargarUsuarios();

  /* ─────────────── ACCIONES DE TABLA ─────────────── */
  contenedor.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    if (btn.dataset.accion === 'editar') editarUsuario(id);
    if (btn.dataset.accion === 'desactivar' || btn.dataset.accion === 'reactivar') toggleEstadoUsuario(id, btn.dataset.accion === 'reactivar');
    if (btn.dataset.accion === 'eliminar') eliminarUsuario(id);
  });

  const modalEliminar = document.getElementById('modalEliminarUsuario');
  const modalEliminarDefinitivo = document.getElementById('modalEliminarUsuarioDefinitivo');
  let eliminarPendiente = null;
  let reactivarPendiente = false;
  let eliminarDefinitivoPendiente = null;

  document.getElementById('btnConfirmarEliminar').addEventListener('click', async () => {
    if (!eliminarPendiente) return;
    modalEliminar.classList.remove('activo');
    await supabase.from('perfiles').update({ activo: reactivarPendiente }).eq('id', eliminarPendiente);
    eliminarPendiente = null;
    reactivarPendiente = false;
    await cargarUsuarios();
  });

  document.getElementById('btnCancelarEliminar').addEventListener('click', () => {
    modalEliminar.classList.remove('activo');
    eliminarPendiente = null;
    reactivarPendiente = false;
  });

  modalEliminar.addEventListener('click', (e) => {
    if (e.target === modalEliminar) {
      modalEliminar.classList.remove('activo');
      eliminarPendiente = null;
      reactivarPendiente = false;
    }
  });

  document.getElementById('btnConfirmarEliminarDefinitivo').addEventListener('click', async () => {
    if (!eliminarDefinitivoPendiente) return;

    const id = eliminarDefinitivoPendiente;
    modalEliminarDefinitivo.classList.remove('activo');
    eliminarDefinitivoPendiente = null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const respuesta = await fetch(
        `${CONFIGURACION.supabase.url}/functions/v1/eliminar-usuario`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id }),
        }
      );

      const resultado = await respuesta.json();

      if (!respuesta.ok) {
        alert(resultado.error || 'Error al eliminar el usuario');
        return;
      }

      alert(resultado.mensaje || 'Usuario eliminado correctamente');
      await cargarUsuarios();
    } catch (err) {
      alert('Error de conexión con el servidor');
    }
  });

  document.getElementById('btnCancelarEliminarDefinitivo').addEventListener('click', () => {
    modalEliminarDefinitivo.classList.remove('activo');
    eliminarDefinitivoPendiente = null;
  });

  modalEliminarDefinitivo.addEventListener('click', (e) => {
    if (e.target === modalEliminarDefinitivo) {
      modalEliminarDefinitivo.classList.remove('activo');
      eliminarDefinitivoPendiente = null;
    }
  });

  /* ─────────────── CARGAR ROLES ─────────────── */
  async function cargarRoles() {
    const { data } = await supabase.from('Rol').select('*').order('id');
    if (!data) return;

    const dropdownFiltro = document.getElementById('dropdownFiltroRol');
    if (dropdownFiltro) {
      dropdownFiltro.innerHTML =
        '<div class="filtro-option seleccionada" data-value="">Todos los roles</div>' +
        data.map(r => `<div class="filtro-option" data-value="${r.id}">${r.nombre}</div>`).join('');
    }

    dropdownCampoRol.innerHTML =
      data.map(r => `<div class="filtro-option" data-value="${r.id}">${r.nombre}</div>`).join('');
  }

  /* ─────────────── CUSTOM DROPDOWN ─────────────── */
  const wrapper = document.getElementById('wrapperFiltroRol');
  const trigger = document.getElementById('triggerFiltroRol');
  const dropdown = document.getElementById('dropdownFiltroRol');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapper.classList.toggle('abierto');
  });

  dropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('.filtro-option');
    if (!opt) return;

    dropdown.querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'));
    opt.classList.add('seleccionada');
    trigger.querySelector('.filtro-select-text').textContent = opt.textContent;
    valorFiltroRol = opt.dataset.value;
    wrapper.classList.remove('abierto');
    aplicarFiltros();
  });

  document.addEventListener('click', () => {
    wrapper.classList.remove('abierto');
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrapper.classList.toggle('abierto');
    }
    if (e.key === 'Escape') {
      wrapper.classList.remove('abierto');
    }
  });

  /* ─────────────── CUSTOM DROPDOWN — ROL DEL FORMULARIO ─────────────── */
  triggerCampoRol.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapperCampoRol.classList.toggle('abierto');
  });

  dropdownCampoRol.addEventListener('click', (e) => {
    const opt = e.target.closest('.filtro-option');
    if (!opt) return;

    dropdownCampoRol.querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'));
    opt.classList.add('seleccionada');
    triggerCampoRol.querySelector('.filtro-select-text').textContent = opt.textContent;
    rolSeleccionado = opt.dataset.value;
    wrapperCampoRol.classList.remove('abierto');
    document.getElementById('errorRol').textContent = '';
  });

  document.addEventListener('click', () => {
    wrapperCampoRol.classList.remove('abierto');
  });

  triggerCampoRol.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrapperCampoRol.classList.toggle('abierto');
    }
    if (e.key === 'Escape') {
      wrapperCampoRol.classList.remove('abierto');
    }
  });

  /* ─────────────── CLICK FUERA DEL PANEL ─────────────── */
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('abierto') && !panel.contains(e.target) && !e.target.closest('#btnNuevoRegistroFooter')) {
      cerrarPanel();
    }
  });

  /* ─────────────── CARGAR USUARIOS ─────────────── */
  async function cargarUsuarios() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*, Rol:rol(nombre)')
      .eq('eliminado', false)
      .order('nombre_completo');

    if (error) return;

    todosLosUsuarios = (data || []).map(p => ({
      ...p,
      rol_nombre: p.Rol?.nombre || '—',
    }));

    aplicarFiltros();
  }

  /* ─────────────── FILTROS ─────────────── */
  function aplicarFiltros() {
    const texto = document.getElementById('buscarUsuario').value.toLowerCase().trim();

    const filtrados = todosLosUsuarios.filter(u => {
      const coincideTexto = !texto ||
        u.nombre_completo?.toLowerCase().includes(texto) ||
        u.apellidos_completos?.toLowerCase().includes(texto) ||
        u.nombre_usuario?.toLowerCase().includes(texto) ||
        u.gmail?.toLowerCase().includes(texto);

      const coincideRol = !valorFiltroRol || u.rol === Number(valorFiltroRol);

      return coincideTexto && coincideRol;
    });

    tabla.actualizar(filtrados);
  }

  document.getElementById('buscarUsuario').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicarFiltros();
  });

  /* ─────────────── ABRIR / CERRAR PANEL ─────────────── */
  function abrirPanel() {
    editandoId = null;
    form.reset();
    limpiarErrores();
    rolSeleccionado = '';
    triggerCampoRol.querySelector('.filtro-select-text').textContent = 'Seleccione un rol';
    dropdownCampoRol.querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'));
    firmaPreview.classList.remove('visible');
    firmaPreview.src = '';
    firmaNombre.textContent = '';
    document.getElementById('campoActivo').checked = true;
    document.getElementById('grupoGmail').style.display = '';
    document.getElementById('campoPassword').closest('.input-grupo').style.display = '';
    textoGuardar.textContent = 'Guardar';
    panel.classList.add('abierto');
    document.body.classList.add(CLASE_SHEET_USUARIOS);
    setTimeout(() => document.getElementById('campoNombre').focus(), 200);
  }

  function cerrarPanel() {
    panel.classList.remove('abierto');
    document.body.classList.remove(CLASE_SHEET_USUARIOS);
    editandoId = null;
    document.getElementById('grupoGmail').style.display = '';
    document.getElementById('campoPassword').closest('.input-grupo').style.display = '';
    textoGuardar.textContent = 'Guardar';
  }

  function limpiarErrores() {
    document.querySelectorAll('.input-error').forEach(el => el.textContent = '');
  }

  function mostrarError(campoId, mensaje) {
    const el = document.getElementById(campoId);
    if (el) el.textContent = mensaje;
  }

  function editarUsuario(id) {
    const user = todosLosUsuarios.find(u => u.id === id);
    if (!user) return;

    editandoId = id;

    document.getElementById('campoNombre').value = user.nombre_completo || '';
    document.getElementById('campoApellidos').value = user.apellidos_completos || '';
    document.getElementById('campoUsuario').value = user.nombre_usuario || '';

    const opt = dropdownCampoRol.querySelector(`.filtro-option[data-value="${user.rol}"]`);
    if (opt) {
      dropdownCampoRol.querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'));
      opt.classList.add('seleccionada');
      triggerCampoRol.querySelector('.filtro-select-text').textContent = opt.textContent;
      rolSeleccionado = user.rol.toString();
    }

    document.getElementById('campoActivo').checked = user.activo ?? true;

    if (user.firma_url) {
      firmaPreview.src = user.firma_url;
      firmaPreview.classList.add('visible');
      firmaNombre.textContent = 'Firma actual';
    } else {
      firmaPreview.classList.remove('visible');
      firmaPreview.src = '';
      firmaNombre.textContent = '';
    }

    document.getElementById('campoGmail').value = user.gmail || '';
    document.getElementById('campoPassword').closest('.input-grupo').style.display = 'none';

    textoGuardar.textContent = 'Actualizar';

    limpiarErrores();
    panel.classList.add('abierto');
    document.body.classList.add(CLASE_SHEET_USUARIOS);
    setTimeout(() => document.getElementById('campoNombre').focus(), 200);
  }

  function toggleEstadoUsuario(id, reactivar) {
    const user = todosLosUsuarios.find(u => u.id === id);
    if (!user) return;
    eliminarPendiente = id;
    reactivarPendiente = reactivar;

    document.getElementById('tituloEliminar').textContent = reactivar
      ? 'Reactivar usuario' : 'Desactivar usuario';

    document.getElementById('textoEliminar').textContent = reactivar
      ? '¿Está seguro de que desea reactivar este usuario?'
      : '¿Está seguro de que desea desactivar este usuario?';

    const btn = document.getElementById('btnConfirmarEliminar');
    document.getElementById('textoConfirmarEliminar').textContent =
      reactivar ? 'Activar' : 'Desactivar';
    btn.className = reactivar
      ? 'btn-filled-md'
      : 'btn-filled-md btn-peligro-md';

    document.getElementById('modalEliminarUsuario').classList.add('activo');
  }

  function eliminarUsuario(id) {
    const user = todosLosUsuarios.find(u => u.id === id);
    if (!user) return;

    eliminarDefinitivoPendiente = id;
    document.getElementById('modalEliminarUsuarioDefinitivo').classList.add('activo');
  }

  document.getElementById('btnNuevoRegistroFooter').addEventListener('click', abrirPanel);
  document.getElementById('btnCancelarUsuario').addEventListener('click', cerrarPanel);

  /* ─────────────── PREVIEW FIRMA ─────────────── */
  inputFirma.addEventListener('change', () => {
    const file = inputFirma.files[0];
    if (!file) {
      firmaPreview.classList.remove('visible');
      firmaNombre.textContent = '';
      return;
    }
    firmaNombre.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      firmaPreview.src = e.target.result;
      firmaPreview.classList.add('visible');
    };
    reader.readAsDataURL(file);
  });

  /* ─────────────── TOGGLE CONTRASEÑA ─────────────── */
  document.getElementById('btnTogglePassword').addEventListener('click', () => {
    const input = document.getElementById('campoPassword');
    const esPass = input.type === 'password';
    input.type = esPass ? 'text' : 'password';
    document.getElementById('btnTogglePassword').className =
      esPass ? 'ph ph-eye-slash toggle-password' : 'ph ph-eye toggle-password';
  });

  /* ─────────────── GUARDAR / ACTUALIZAR USUARIO ─────────────── */
  btnGuardar.addEventListener('click', async (e) => {
    e.preventDefault();
    limpiarErrores();

    const nombre = document.getElementById('campoNombre').value.trim();
    const apellidos = document.getElementById('campoApellidos').value.trim();
    const usuario = document.getElementById('campoUsuario').value.trim();
    const gmail = document.getElementById('campoGmail').value.trim().toLowerCase();
    const password = document.getElementById('campoPassword').value;
    const activo = document.getElementById('campoActivo').checked;
    const archivo = inputFirma.files[0];

    let hayError = false;

    if (!nombre) { mostrarError('errorNombre', 'El nombre es obligatorio'); hayError = true; }
    if (!apellidos) { mostrarError('errorApellidos', 'Los apellidos son obligatorios'); hayError = true; }
    if (!usuario) { mostrarError('errorUsuario', 'El nombre de usuario es obligatorio'); hayError = true; }
    if (!gmail) { mostrarError('errorGmail', 'El correo es obligatorio'); hayError = true; }
    else if (!gmail.endsWith('@gmail.com')) { mostrarError('errorGmail', 'El correo debe ser @gmail.com'); hayError = true; }
    if (!editandoId && !password) { mostrarError('errorPassword', 'La contraseña es obligatoria'); hayError = true; }
    if (!rolSeleccionado) { mostrarError('errorRol', 'Seleccione un rol'); hayError = true; }

    if (hayError) return;

    setCargando(true);

    let firma_url = null;

    if (archivo) {
      if (editandoId) {
        const user = todosLosUsuarios.find(u => u.id === editandoId);
        if (user?.firma_url) {
          const partes = user.firma_url.split('/firmas/');
          if (partes[1]) {
            await supabase.storage.from('documentos').remove([`firmas/${partes[1].split('?')[0]}`]);
          }
        }
      }

      const ext = archivo.name.split('.').pop();
      const fileName = `firmas/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, archivo);

      if (uploadError) {
        setCargando(false);
        mostrarError('errorFirma', 'Error al subir la firma');
        return;
      }

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      firma_url = urlData.publicUrl;
    }

    if (editandoId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const respuesta = await fetch(
          `${CONFIGURACION.supabase.url}/functions/v1/editar-usuario`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(Object.assign(
              {
                id: editandoId,
                nombre_completo: nombre,
                apellidos_completos: apellidos,
                nombre_usuario: usuario,
                gmail,
                rol: Number(rolSeleccionado),
                activo,
              },
              firma_url !== null ? { firma_url } : {}
            )),
          }
        );

        const resultado = await respuesta.json();
        setCargando(false);

        if (!respuesta.ok) {
          if (resultado.error?.toLowerCase().includes('correo')) {
            mostrarError('errorGmail', resultado.error);
          } else if (resultado.error?.toLowerCase().includes('usuario')) {
            mostrarError('errorUsuario', resultado.error);
          } else {
            mostrarError('errorNombre', resultado.error || 'Error al actualizar el usuario');
          }
          return;
        }

        cerrarPanel();
        await cargarUsuarios();
        return;
      } catch (err) {
        setCargando(false);
        mostrarError('errorNombre', 'Error de conexión con el servidor');
        return;
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const respuesta = await fetch(
        `${CONFIGURACION.supabase.url}/functions/v1/crear-usuario`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nombre_completo: NORMALIZACION.aMayusculasSinTilde(nombre),
            apellidos_completos: NORMALIZACION.aMayusculasSinTilde(apellidos),
            nombre_usuario: NORMALIZACION.aMayusculasSinTilde(usuario),
            gmail,
            password,
            rol: Number(rolSeleccionado),
            activo,
            firma_url,
          }),
        }
      );

      const resultado = await respuesta.json();
      setCargando(false);

      if (!respuesta.ok) {
        if (resultado.error?.toLowerCase().includes('correo')) {
          mostrarError('errorGmail', resultado.error);
        } else if (resultado.error?.toLowerCase().includes('usuario')) {
          mostrarError('errorUsuario', resultado.error);
        } else if (resultado.error?.toLowerCase().includes('perfil')) {
          mostrarError('errorGmail', resultado.error);
        } else {
          mostrarError('errorNombre', resultado.error || 'Error al crear el usuario');
        }
        return;
      }

      cerrarPanel();
      await cargarUsuarios();

    } catch (err) {
      setCargando(false);
      mostrarError('errorNombre', 'Error de conexión con el servidor');
    }
  });

  function setCargando(activo) {
    btnGuardar.disabled = activo;
    textoGuardar.style.display = activo ? 'none' : 'inline';
    spinnerGuardar.classList.toggle('visible', activo);
  }
});
