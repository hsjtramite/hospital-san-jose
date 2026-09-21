
(() => {
  'use strict';

  function obtenerCliente() {
    const nombres = ['supabaseClient', 'clienteSupabase', 'supabaseCliente',
                     'supabase', 'cliente', 'db', 'sb'];
    for (const n of nombres) {
      try {
        const c = eval(n); // eslint-disable-line no-eval
        if (c && typeof c.from === 'function' && c.auth) return c;
      } catch (_) { /* no existe con ese nombre */ }
    }
    for (const k of Object.keys(window)) {
      const c = window[k];
      if (c && typeof c === 'object' && typeof c.from === 'function' && c.auth) return c;
    }
    return null;
  }

  const db = obtenerCliente();
  const $ = id => document.getElementById(id);

  let rol = null;
  let registros = [];
  let docSeleccionado = null;

  // --- Utilidades ---
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad3 = n => String(n ?? '').padStart(3, '0');
  const fmtFecha = f => {                       // '2026-04-15' -> '15/04/2026'
    if (!f) return '—';
    const [a, m, d] = String(f).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  };
  const fmtFechaHora = f => f
    ? new Date(f).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
    : '';
  const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function toast(texto) {
    const t = $('soatToast');
    t.textContent = texto;
    t.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('visible'), 3500);
  }

  function mostrarAviso(titulo, detalle) {
    $('soatCargando').innerHTML =
      `<i class="ph ph-warning-circle"></i><h3>${esc(titulo)}</h3><p>${esc(detalle)}</p>`;
  }

  // --- Inicio ---
  async function iniciar() {
    if (!db) {
      mostrarAviso('No se encontró la conexión a Supabase',
        'Revisa que js/servicios/supabase.js se cargue antes que soat.js.');
      return;
    }

    const { data: { user } = {} } = await db.auth.getUser();
    if (!user) { location.href = 'index.html'; return; }

    const { data, error } = await db.rpc('soat_mi_rol');
    if (error) {
      mostrarAviso('No se pudo cargar el módulo',
        'Falta ejecutar el SQL del módulo SOAT en Supabase. Detalle: ' + error.message);
      return;
    }
    rol = data;
    $('soatCargando').hidden = true;

    if (rol === 'secretaria') {
      $('vistaSecretaria').hidden = false;
      await cargarEncargados();
      prepararFormulario();
    } else if (rol === 'encargado') {
      $('vistaEncargado').hidden = false;
      prepararModal();
    } else {
      $('vistaSinAcceso').hidden = false;
      return;
    }

    await cargar();

  
    db.channel('soat-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soat_documentos' }, cambio => {
        if (rol === 'encargado' && cambio.eventType === 'INSERT') toast('Llegó un documento nuevo');
        if (rol === 'secretaria' && cambio.eventType === 'UPDATE' && cambio.new?.visto_bueno) {
          toast(`Documento N° ${pad3(cambio.new.numero_correlativo)} recibió visto bueno`);
        }
        cargar();
      })
      .subscribe();
  }

  async function cargar() {
    const { data, error } = await db.rpc('soat_listar');
    if (error) { toast('Error al cargar: ' + error.message); return; }
    registros = data || [];
    if (rol === 'secretaria') pintarEnviados();
    else pintarBandeja();
  }

  // =================================================================
  // SECRETARIA
  // =================================================================
  async function cargarEncargados() {
    const sel = $('soatEntregadoA');
    const { data, error } = await db.rpc('soat_encargados');
    if (error || !data?.length) {
      sel.innerHTML = '<option value="">No hay encargada SOAT configurada</option>';
      sel.disabled = true;
      return;
    }
    sel.innerHTML = data.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('');
  }

  function prepararFormulario() {
    $('soatFecha').value = hoy();
    $('btnEnviarSoat').addEventListener('click', enviar);
    $('btnLimpiarSoat').addEventListener('click', limpiarFormulario);
  }

  function limpiarFormulario() {
    ['soatExpediente', 'soatAsunto', 'soatFolios'].forEach(id => { $(id).value = ''; });
    $('soatFecha').value = hoy();
    $('soatErrorForm').hidden = true;
    $('soatExpediente').focus();
  }

  async function enviar() {
    const v = id => $(id).value.trim();
    const error = $('soatErrorForm');
    const faltan = [];
    if (!v('soatFecha')) faltan.push('fecha');
    if (!v('soatExpediente')) faltan.push('N° de expediente');
    if (!v('soatRemite')) faltan.push('remite');
    if (!v('soatAsunto')) faltan.push('asunto');
    if (!v('soatEntregadoA')) faltan.push('entregado a');
    if (faltan.length) {
      error.textContent = 'Completa: ' + faltan.join(', ') + '.';
      error.hidden = false;
      return;
    }
    error.hidden = true;

    const btn = $('btnEnviarSoat');
    btn.disabled = true;

    const { data: { user } } = await db.auth.getUser();
    const { data, error: err } = await db.from('soat_documentos').insert({
      fecha_recepcion: v('soatFecha'),
      numero_expediente: v('soatExpediente'),
      remite: v('soatRemite').toUpperCase(),
      asunto: v('soatAsunto'),
      folios: v('soatFolios') ? Number(v('soatFolios')) : null,
      entregado_a: v('soatEntregadoA'),
      enviado_por: user.id
    }).select('numero_correlativo').single();

    btn.disabled = false;

    if (err) {
      error.textContent = 'No se pudo enviar: ' + err.message;
      error.hidden = false;
      return;
    }
    toast(`Documento N° ${pad3(data.numero_correlativo)} enviado a SOAT`);
    limpiarFormulario();   // "Remite" se queda: suelen ser varios seguidos de SALUDPOL
    cargar();
  }

  function pintarEnviados() {
    const cont = $('tablaEnviados');
    if (!registros.length) {
      cont.innerHTML = `<div class="soat-aviso"><i class="ph ph-tray"></i>
        <p>Aún no has enviado documentos. Llena el formulario de arriba para registrar el primero.</p></div>`;
      return;
    }
    cont.innerHTML = tabla(
      ['N°', 'Fecha de recepción', 'N° de expediente', 'Remite', 'Asunto', 'Folios', 'Entregado a', 'Estado'],
      registros.map(d => `
        <tr>
          <td class="soat-num">${pad3(d.numero_correlativo)}</td>
          <td>${fmtFecha(d.fecha_recepcion)}</td>
          <td>${esc(d.numero_expediente)}</td>
          <td>${esc(d.remite)}</td>
          <td>${esc(d.asunto)}</td>
          <td>${esc(d.folios ?? '—')}</td>
          <td>${esc(d.entregado_a_nombre)}</td>
          <td>${estado(d)}</td>
        </tr>`)
    );
  }

  // =================================================================
  // ENCARGADA SOAT
  // =================================================================
  function pintarBandeja() {
    const pendientes = registros.filter(d => !d.visto_bueno).length;
    $('soatResumen').innerHTML = pendientes
      ? `<strong>${pendientes}</strong> ${pendientes === 1 ? 'documento pendiente' : 'documentos pendientes'} de visto bueno`
      : 'No tienes documentos pendientes.';

    const cont = $('tablaBandeja');
    if (!registros.length) {
      cont.innerHTML = `<div class="soat-aviso"><i class="ph ph-tray"></i>
        <p>Todavía no te han enviado documentos.</p></div>`;
      return;
    }

    const orden = [...registros].sort((a, b) =>
      (a.visto_bueno - b.visto_bueno) || (b.numero_correlativo - a.numero_correlativo));

    cont.innerHTML = tabla(
      ['N°', 'Fecha de recepción', 'N° de expediente', 'Remite', 'Asunto', 'Folios', 'Enviado por', 'Visto bueno'],
      orden.map(d => `
        <tr class="${d.visto_bueno ? '' : 'soat-pendiente'}">
          <td class="soat-num">${pad3(d.numero_correlativo)}</td>
          <td>${fmtFecha(d.fecha_recepcion)}</td>
          <td>${esc(d.numero_expediente)}</td>
          <td>${esc(d.remite)}</td>
          <td>${esc(d.asunto)}</td>
          <td>${esc(d.folios ?? '—')}</td>
          <td>${esc(d.enviado_por_nombre)}</td>
          <td>${d.visto_bueno
            ? estado(d)
            : `<button type="button" class="btn-filled-md soat-btn-visto" data-id="${d.id}">
                 <i class="ph ph-check"></i> Dar visto bueno</button>`}</td>
        </tr>`)
    );

    cont.querySelectorAll('.soat-btn-visto').forEach(b =>
      b.addEventListener('click', () => abrirModal(b.dataset.id)));
  }

  function prepararModal() {
    $('btnCerrarVisto').addEventListener('click', cerrarModal);
    $('btnCancelarVisto').addEventListener('click', cerrarModal);
    $('btnConfirmarVisto').addEventListener('click', confirmarVisto);
    $('modalVistoBueno').addEventListener('click', e => {
      if (e.target.id === 'modalVistoBueno') cerrarModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });
  }

  function abrirModal(id) {
    docSeleccionado = registros.find(d => d.id === id);
    if (!docSeleccionado) return;
    const d = docSeleccionado;
    $('detalleVisto').innerHTML = `
      <dt>N°</dt><dd>${pad3(d.numero_correlativo)}</dd>
      <dt>Fecha recepción</dt><dd>${fmtFecha(d.fecha_recepcion)}</dd>
      <dt>N° expediente</dt><dd>${esc(d.numero_expediente)}</dd>
      <dt>Remite</dt><dd>${esc(d.remite)}</dd>
      <dt>Asunto</dt><dd>${esc(d.asunto)}</dd>
      <dt>Folios</dt><dd>${esc(d.folios ?? '—')}</dd>
      <dt>Enviado por</dt><dd>${esc(d.enviado_por_nombre)}</dd>`;
    $('obsVisto').value = '';
    $('soatErrorVisto').hidden = true;
    $('modalVistoBueno').classList.add('abierto');
    $('btnConfirmarVisto').focus();
  }

  function cerrarModal() {
    $('modalVistoBueno').classList.remove('abierto');
    docSeleccionado = null;
  }

  async function confirmarVisto() {
    if (!docSeleccionado) return;
    const btn = $('btnConfirmarVisto');
    btn.disabled = true;
    const { error } = await db.rpc('soat_dar_visto_bueno', {
      p_id: docSeleccionado.id,
      p_obs: $('obsVisto').value.trim() || null
    });
    btn.disabled = false;
    if (error) {
      $('soatErrorVisto').textContent = 'No se pudo registrar: ' + error.message;
      $('soatErrorVisto').hidden = false;
      return;
    }
    toast(`Visto bueno registrado para el N° ${pad3(docSeleccionado.numero_correlativo)}`);
    cerrarModal();
    cargar();
  }

  // =================================================================
  // Comunes
  // =================================================================
  function estado(d) {
    if (!d.visto_bueno) return '<span class="soat-chip pendiente"><i class="ph ph-clock"></i> Pendiente</span>';
    return `<span class="soat-chip visto"><i class="ph ph-check-circle"></i> Visto bueno</span>
      <span class="soat-sub">${fmtFechaHora(d.fecha_visto)}</span>
      ${d.observacion_visto ? `<span class="soat-sub">${esc(d.observacion_visto)}</span>` : ''}`;
  }

  function tabla(columnas, filas) {
    return `<div class="soat-tabla-scroll"><table class="soat-tabla">
      <thead><tr>${columnas.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${filas.join('')}</tbody></table></div>`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
