document.addEventListener('lateral:listo', async () => {
  if (document.body.dataset.moduloActivo !== 'area') return;
  if (!await verificarAcceso('area')) return;

  const contenedor = document.querySelector('.areas-content');
  const panel = document.getElementById('panelFormulario');
  const form = document.getElementById('formCrearArea');
  const btnGuardar = document.getElementById('btnGuardarArea');
  const textoGuardar = document.getElementById('textoGuardar');
  const spinnerGuardar = document.getElementById('spinnerGuardar');

  let todasLasAreas = [];
  let valorFiltroEstado = '';
  let editandoId = null;

  const headerHTML = `
    <div class="tabla-header-filtros">
      <div class="filtro-search">
        <i class="ph ph-magnifying-glass"></i>
        <input type="text" class="filtro-input" id="buscarArea" placeholder="Buscar área..." />
      </div>
      <div class="filtro-group">
        <div class="filtro-select-wrapper" id="wrapperFiltroEstado">
          <button type="button" class="filtro-select-trigger" id="triggerFiltroEstado">
            <span class="filtro-select-text">Todos</span>
            <i class="ph ph-caret-down filtro-select-arrow"></i>
          </button>
          <div class="filtro-dropdown" id="dropdownFiltroEstado">
            <div class="filtro-option seleccionada" data-value="">Todos</div>
            <div class="filtro-option" data-value="true">Activo</div>
            <div class="filtro-option" data-value="false">Inactivo</div>
          </div>
        </div>
      </div>
      <button class="btn-filled-md" id="btnNuevoRegistroFooter" style="margin-left: auto;">Nuevo Registro</button>
    </div>
  `;

  const tabla = new Tabla({
    headerHTML,
    columnas: [
      { clave: 'nombre', titulo: 'Nombre' },
      { clave: 'responsable', titulo: 'Responsable' },
      { clave: 'cargo', titulo: 'Cargo' },
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
          const accion = activo ? 'eliminar' : 'reactivar';
          const icono = activo ? 'ph-trash-simple' : 'ph-check-circle';
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
            </div>
          `;
        },
      },
    ],
  });

  contenedor.appendChild(tabla.obtenerElemento());
  await cargarAreas();

  /* ─────────────── ACCIONES DE TABLA ─────────────── */
  contenedor.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.id;
    if (btn.dataset.accion === 'editar') editarArea(id);
    if (btn.dataset.accion === 'eliminar' || btn.dataset.accion === 'reactivar') toggleEstadoArea(id, btn.dataset.accion === 'reactivar');
  });

  const modalEliminar = document.getElementById('modalEliminarArea');
  let eliminarPendiente = null;
  let reactivarPendiente = false;

  document.getElementById('btnConfirmarEliminar').addEventListener('click', async () => {
    if (!eliminarPendiente) return;
    modalEliminar.classList.remove('activo');
    await supabase.from('areas').update({ activo: reactivarPendiente }).eq('id', eliminarPendiente);
    eliminarPendiente = null;
    reactivarPendiente = false;
    await cargarAreas();
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

  /* ─────────────── CUSTOM DROPDOWN — FILTRO ESTADO ─────────────── */
  const wrapperFiltro = document.getElementById('wrapperFiltroEstado');
  const triggerFiltro = document.getElementById('triggerFiltroEstado');
  const dropdownFiltro = document.getElementById('dropdownFiltroEstado');

  triggerFiltro.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapperFiltro.classList.toggle('abierto');
  });

  dropdownFiltro.addEventListener('click', (e) => {
    const opt = e.target.closest('.filtro-option');
    if (!opt) return;

    dropdownFiltro.querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'));
    opt.classList.add('seleccionada');
    triggerFiltro.querySelector('.filtro-select-text').textContent = opt.textContent;
    valorFiltroEstado = opt.dataset.value;
    wrapperFiltro.classList.remove('abierto');
    aplicarFiltros();
  });

  document.addEventListener('click', () => {
    wrapperFiltro.classList.remove('abierto');
  });

  triggerFiltro.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrapperFiltro.classList.toggle('abierto');
    }
    if (e.key === 'Escape') {
      wrapperFiltro.classList.remove('abierto');
    }
  });

  /* ─────────────── CLICK FUERA DEL PANEL ─────────────── */
  document.addEventListener('click', (e) => {
    if (panel.classList.contains('abierto') && !panel.contains(e.target) && !e.target.closest('#btnNuevoRegistroFooter')) {
      cerrarPanel();
    }
  });

  /* ─────────────── CARGAR ÁREAS ─────────────── */
  async function cargarAreas() {
    const { data, error } = await supabase
      .from('areas')
      .select('*')
      .order('nombre');

    if (error) return;

    todasLasAreas = data || [];
    aplicarFiltros();
  }

  /* ─────────────── FILTROS ─────────────── */
  function aplicarFiltros() {
    const texto = document.getElementById('buscarArea').value.toLowerCase().trim();

    const filtrados = todasLasAreas.filter(a => {
      const coincideTexto = !texto ||
        a.nombre?.toLowerCase().includes(texto) ||
        a.responsable?.toLowerCase().includes(texto) ||
        a.cargo?.toLowerCase().includes(texto);

      const coincideEstado = valorFiltroEstado === '' || String(a.activo) === valorFiltroEstado;

      return coincideTexto && coincideEstado;
    });

    tabla.actualizar(filtrados);
  }

  document.getElementById('buscarArea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicarFiltros();
  });

  /* ─────────────── ABRIR / CERRAR PANEL ─────────────── */
  function abrirPanel() {
    editandoId = null;
    form.reset();
    limpiarErrores();
    document.getElementById('campoActivo').checked = true;
    textoGuardar.textContent = 'Guardar';
    panel.classList.add('abierto');
    setTimeout(() => document.getElementById('campoNombre').focus(), 200);
  }

  function cerrarPanel() {
    panel.classList.remove('abierto');
    editandoId = null;
    textoGuardar.textContent = 'Guardar';
  }

  function limpiarErrores() {
    document.querySelectorAll('.input-error').forEach(el => el.textContent = '');
  }

  function mostrarError(campoId, mensaje) {
    const el = document.getElementById(campoId);
    if (el) el.textContent = mensaje;
  }

  function editarArea(id) {
    const area = todasLasAreas.find(a => a.id === id);
    if (!area) return;

    editandoId = id;

    document.getElementById('campoNombre').value = area.nombre || '';
    document.getElementById('campoResponsable').value = area.responsable || '';
    document.getElementById('campoCargo').value = area.cargo || '';
    document.getElementById('campoActivo').checked = area.activo ?? true;

    textoGuardar.textContent = 'Actualizar';

    limpiarErrores();
    panel.classList.add('abierto');
    setTimeout(() => document.getElementById('campoNombre').focus(), 200);
  }

  function toggleEstadoArea(id, reactivar) {
    const area = todasLasAreas.find(a => a.id === id);
    if (!area) return;
    eliminarPendiente = id;
    reactivarPendiente = reactivar;

    document.getElementById('tituloEliminar').textContent = reactivar
      ? 'Reactivar área' : 'Desactivar área';

    document.getElementById('textoEliminar').textContent = reactivar
      ? '¿Está seguro de que desea reactivar esta área?'
      : '¿Está seguro de que desea desactivar esta área?';

    const btn = document.getElementById('btnConfirmarEliminar');
    document.getElementById('textoConfirmarEliminar').textContent =
      reactivar ? 'Activar' : 'Desactivar';
    btn.className = reactivar
      ? 'btn-filled-md'
      : 'btn-filled-md btn-peligro-md';

    document.getElementById('modalEliminarArea').classList.add('activo');
  }

  document.getElementById('btnNuevoRegistroFooter').addEventListener('click', abrirPanel);
  document.getElementById('btnCancelarArea').addEventListener('click', cerrarPanel);

  /* ─────────────── GUARDAR / ACTUALIZAR ÁREA ─────────────── */
  btnGuardar.addEventListener('click', async (e) => {
    e.preventDefault();
    limpiarErrores();

    const nombre = document.getElementById('campoNombre').value.trim();
    const responsable = document.getElementById('campoResponsable').value.trim();
    const cargo = document.getElementById('campoCargo').value.trim();
    const activo = document.getElementById('campoActivo').checked;

    let hayError = false;

    if (!nombre) { mostrarError('errorNombre', 'El nombre es obligatorio'); hayError = true; }
    if (!responsable) { mostrarError('errorResponsable', 'El responsable es obligatorio'); hayError = true; }
    if (!cargo) { mostrarError('errorCargo', 'El cargo es obligatorio'); hayError = true; }

    if (hayError) return;

    setCargando(true);

    const nombreNorm = NORMALIZACION.aMayusculasSinTilde(nombre);
    const responsableNorm = NORMALIZACION.aMayusculasSinTilde(responsable);
    const cargoNorm = NORMALIZACION.aMayusculasSinTilde(cargo);

    if (editandoId) {
      try {
        const { error } = await supabase
          .from('areas')
          .update({
            nombre: nombreNorm,
            responsable: responsableNorm,
            cargo: cargoNorm,
            activo,
          })
          .eq('id', editandoId);

        setCargando(false);

        if (error) {
          if (error.code === '23505') {
            mostrarError('errorNombre', 'Ya existe un área con ese nombre');
          } else {
            mostrarError('errorNombre', error.message || 'Error al actualizar el área');
          }
          return;
        }

        cerrarPanel();
        await cargarAreas();
        return;
      } catch (err) {
        setCargando(false);
        mostrarError('errorNombre', 'Error de conexión con el servidor');
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('areas')
        .insert({
          nombre: nombreNorm,
          responsable: responsableNorm,
          cargo: cargoNorm,
          activo,
        });

      setCargando(false);

      if (error) {
        if (error.code === '23505') {
          mostrarError('errorNombre', 'Ya existe un área con ese nombre');
        } else {
          mostrarError('errorNombre', error.message || 'Error al crear el área');
        }
        return;
      }

      cerrarPanel();
      await cargarAreas();

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
