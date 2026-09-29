// =====================================================================
// MÓDULO SOAT - U.S.  -  js/paginas/soat-us.js
// Encargada SOAT: presenta documentos (con PDF opcional) a la secretaria.
// Secretaria:     los recibe y da visto bueno.
// =====================================================================
(() => {
  'use strict';

  const db = (typeof supabase !== 'undefined' && supabase.from) ? supabase : null;
  const $ = id => document.getElementById(id);
  const BUCKET = 'soat-pdf';
  const MAX_MB = 3;

  let rol = null;          // 'encargado' (envía) | 'secretaria' (recibe)
  let usuarioId = null;
  let registros = [];
  let docSeleccionado = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad3 = n => String(n ?? '').padStart(3, '0');
  const fmtFecha = f => {
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

  // ─── Inicio ───
  async function iniciar() {
    if (!db) {
      mostrarAviso('No se encontró la conexión a Supabase',
        'Revisa que js/servicios/supabase.js se cargue antes que soat-us.js.');
      return;
    }

    const { data: { user } = {} } = await db.auth.getUser();
    if (!user) { location.href = 'index.html'; return; }
    usuarioId = user.id;

    const { data, error } = await db.rpc('soat_mi_rol');
    if (error) {
      mostrarAviso('No se pudo cargar el módulo',
        'Falta ejecutar el SQL del módulo SOAT - U.S. Detalle: ' + error.message);
      return;
    }
    rol = data;
    $('soatCargando').hidden = true;

    if (rol === 'encargado') {
      $('vistaEnvia').hidden = false;
      await cargarDestinatarios();
      prepararFormulario();
    } else if (rol === 'secretaria') {
      $('vistaRecibe').hidden = false;
      prepararModal();
    } else {
      $('vistaSinAcceso').hidden = false;
      return;
    }

    await cargar();

    db.channel('soat-us-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'soat_us_documentos' }, cambio => {
        if (rol === 'secretaria' && cambio.eventType === 'INSERT') toast('Llegó un documento nuevo');
        if (rol === 'encargado' && cambio.eventType === 'UPDATE' && cambio.new?.visto_bueno) {
          toast(`Documento N° ${pad3(cambio.new.numero_correlativo)} recibió visto bueno`);
        }
        cargar();
      })
      .subscribe();
  }

  async function cargar() {
    const { data, error } = await db.rpc('soat_us_listar');
    if (error) { toast('Error al cargar: ' + error.message); return; }
    registros = data || [];
    if (rol === 'encargado') pintarEnviados();
    else pintarBandeja();
  }

  // =================================================================
  // ENCARGADA SOAT (envía)
  // =================================================================
  async function cargarDestinatarios() {
    const sel = $('soatEntregadoA');
    const { data, error } = await db.rpc('soat_us_secretarias');
    if (error || !data?.length) {
      sel.innerHTML = '<option value="">No hay secretaria configurada</option>';
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
    ['soatExpediente', 'soatAsunto', 'soatFolios', 'soatArchivo'].forEach(id => { $(id).value = ''; });
    $('soatFecha').value = hoy();
    $('soatErrorForm').hidden = true;
  }

  function mostrarError(texto) {
    const e = $('soatErrorForm');
    e.textContent = texto;
    e.hidden = false;
  }

  async function enviar() {
    const v = id => $(id).value.trim();
    const faltan = [];
    if (!v('soatFecha')) faltan.push('fecha');
    if (!v('soatExpediente')) faltan.push('N° de expediente');
    if (!v('soatAsunto')) faltan.push('asunto');
    if (!v('soatEntregadoA')) faltan.push('entregado a');
    if (faltan.length) { mostrarError('Completa: ' + faltan.join(', ') + '.'); return; }

    const archivo = $('soatArchivo').files[0] || null;
    if (archivo) {
      if (archivo.type !== 'application/pdf') { mostrarError('El archivo debe ser un PDF.'); return; }
      if (archivo.size > MAX_MB * 1024 * 1024) {
        mostrarError(`El PDF pesa ${(archivo.size / 1048576).toFixed(1)} MB. El máximo es ${MAX_MB} MB.`);
        return;
      }
    }
    $('soatErrorForm').hidden = true;

    const btn = $('btnEnviarSoat');
    const texto = $('textoEnviarSoat');
    const original = texto.textContent;
    btn.disabled = true;

    let ruta = null, nombre = null;
    if (archivo) {
      texto.textContent = 'Subiendo PDF…';
      nombre = archivo.name;
      ruta = `${usuarioId}/${Date.now()}_${archivo.name.replace(/[^\w.\-]/g, '_')}`;
      const { error: errUp } = await db.storage.from(BUCKET)
        .upload(ruta, archivo, { contentType: 'application/pdf' });
      if (errUp) {
        btn.disabled = false;
        texto.textContent = original;
        mostrarError('No se pudo subir el PDF: ' + errUp.message);
        return;
      }
    }

    texto.textContent = 'Enviando…';
    const { data, error: err } = await db.from('soat_us_documentos').insert({
      fecha_recepcion: v('soatFecha'),
      numero_expediente: v('soatExpediente'),
      remite: v('soatRemite').toUpperCase() || null,
      asunto: v('soatAsunto'),
      folios: v('soatFolios') ? Number(v('soatFolios')) : null,
      entregado_a: v('soatEntregadoA'),
      enviado_por: usuarioId,
      archivo_ruta: ruta,
      archivo_nombre: nombre
    }).select('numero_correlativo').single();

    btn.disabled = false;
    texto.textContent = original;

    if (err) {
      if (ruta) await db.storage.from(BUCKET).remove([ruta]);  // no dejar el PDF huérfano
      mostrarError('No se pudo enviar: ' + err.message);
      return;
    }
    toast(`Documento N° ${pad3(data.numero_correlativo)} presentado a la Unidad de Seguros`);
    limpiarFormulario();
    cargar();
  }

  function pintarEnviados() {
    const cont = $('tablaEnviados');
    if (!registros.length) {
      cont.innerHTML = `<div class="soat-aviso"><i class="ph ph-tray"></i>
        <p>Aún no has presentado documentos. Llena el formulario de arriba para registrar el primero.</p></div>`;
      return;
    }
    cont.innerHTML = tabla(
      ['N°', 'Fecha', 'N° de expediente', 'Remite', 'Asunto', 'Folios', 'PDF', 'Entregado a', 'Estado'],
      registros.map(d => `
        <tr>
          <td class="soat-num">${pad3(d.numero_correlativo)}</td>
          <td>${fmtFecha(d.fecha_recepcion)}</td>
          <td>${esc(d.numero_expediente)}</td>
          <td>${esc(d.remite || '—')}</td>
          <td>${esc(d.asunto)}</td>
          <td>${esc(d.folios ?? '—')}</td>
          <td>${celdaPdf(d)}</td>
          <td>${esc(d.entregado_a_nombre)}</td>
          <td>${estado(d)}</td>
        </tr>`)
    );
    activarBotonesPdf(cont);
  }

  // =================================================================
  // SECRETARIA (recibe)
  // =================================================================
  function pintarBandeja() {
    const pendientes = registros.filter(d => !d.visto_bueno).length;
    $('soatResumen').innerHTML = pendientes
      ? `<strong>${pendientes}</strong> ${pendientes === 1 ? 'documento pendiente' : 'documentos pendientes'} de visto bueno`
      : 'No tienes documentos pendientes.';

    const cont = $('tablaBandeja');
    if (!registros.length) {
      cont.innerHTML = `<div class="soat-aviso"><i class="ph ph-tray"></i>
        <p>Todavía no te han presentado documentos.</p></div>`;
      return;
    }

    const orden = [...registros].sort((a, b) =>
      (a.visto_bueno - b.visto_bueno) || (b.numero_correlativo - a.numero_correlativo));

    cont.innerHTML = tabla(
      ['N°', 'Fecha', 'N° de expediente', 'Remite', 'Asunto', 'Folios', 'PDF', 'Enviado por', 'Visto bueno'],
      orden.map(d => `
        <tr class="${d.visto_bueno ? '' : 'soat-pendiente'}">
          <td class="soat-num">${pad3(d.numero_correlativo)}</td>
          <td>${fmtFecha(d.fecha_recepcion)}</td>
          <td>${esc(d.numero_expediente)}</td>
          <td>${esc(d.remite || '—')}</td>
          <td>${esc(d.asunto)}</td>
          <td>${esc(d.folios ?? '—')}</td>
          <td>${celdaPdf(d)}</td>
          <td>${esc(d.enviado_por_nombre)}</td>
          <td>${d.visto_bueno
            ? estado(d)
            : `<button type="button" class="btn-filled-md soat-btn-visto" data-id="${d.id}">
                 <i class="ph ph-check"></i> Dar visto bueno</button>`}</td>
        </tr>`)
    );

    activarBotonesPdf(cont);
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
      <dt>Fecha</dt><dd>${fmtFecha(d.fecha_recepcion)}</dd>
      <dt>N° expediente</dt><dd>${esc(d.numero_expediente)}</dd>
      <dt>Remite</dt><dd>${esc(d.remite || '—')}</dd>
      <dt>Asunto</dt><dd>${esc(d.asunto)}</dd>
      <dt>Folios</dt><dd>${esc(d.folios ?? '—')}</dd>
      <dt>PDF</dt><dd>${d.archivo_ruta ? esc(d.archivo_nombre || 'documento.pdf') : 'Sin archivo'}</dd>
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
    const { error } = await db.rpc('soat_us_dar_visto_bueno', {
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
  // PDF
  // =================================================================
  function celdaPdf(d) {
    if (!d.archivo_ruta) return '<span class="soat-sub">Sin archivo</span>';
    return `<button type="button" class="soat-enlace-pdf" data-ruta="${esc(d.archivo_ruta)}">
      <i class="ph ph-file-pdf"></i> Ver PDF</button>`;
  }

  function activarBotonesPdf(contenedor) {
    contenedor.querySelectorAll('.soat-enlace-pdf').forEach(b =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(b.dataset.ruta, 120);
        b.disabled = false;
        if (error) { toast('No se pudo abrir el PDF: ' + error.message); return; }
        window.open(data.signedUrl, '_blank', 'noopener');
      }));
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
