// =====================================================================
// MÓDULO ROL DE TURNOS — js/paginas/rol.js
// M  = 08:00 a 14:00   (6 h)
// T  = 14:00 a 20:00   (6 h)
// MT = 08:00 a 20:00  (12 h)
// =====================================================================
(() => {
  'use strict';

  const db = (typeof supabase !== 'undefined' && supabase.from) ? supabase : null;
  const $ = id => document.getElementById(id);

  const HORAS = { M: 6, T: 6, MT: 12 };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIA_LETRA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  let personal = [];
  let ausencias = [];
  let dias = [];                 // ['2026-10-01', ...]
  let asignaciones = {};         // 'personalId|fecha' -> 'M' | 'T' | 'MT'
  let editandoPersonalId = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(texto) {
    const t = $('rolToast');
    t.textContent = texto;
    t.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('visible'), 3500);
  }

  function error(id, texto) {
    const el = $(id);
    if (!texto) { el.hidden = true; return; }
    el.textContent = texto;
    el.hidden = false;
  }

  // ═══════════════════════════════════════════════
  // INICIO
  // ═══════════════════════════════════════════════
  async function iniciar() {
    if (!db) {
      $('rolCargando').innerHTML =
        '<i class="ph ph-warning-circle"></i><p>No se encontró la conexión a Supabase.</p>';
      return;
    }

    const { data: { user } = {} } = await db.auth.getUser();
    if (!user) { location.href = 'index.html'; return; }

    const { data: puede, error: errPermiso } = await db.rpc('rol_puede_administrar');
    $('rolCargando').hidden = true;

    if (errPermiso) {
      $('rolCargando').hidden = false;
      $('rolCargando').innerHTML =
        `<i class="ph ph-warning-circle"></i><h3>No se pudo cargar el módulo</h3>
         <p>Falta ejecutar el SQL del rol de turnos. Detalle: ${esc(errPermiso.message)}</p>`;
      return;
    }
    if (!puede) { $('rolSinAcceso').hidden = false; return; }

    $('rolApp').hidden = false;
    prepararTabs();
    prepararFormularios();
    await cargarPersonal();
    await cargarAusencias();
  }

  function prepararTabs() {
    document.querySelectorAll('.rol-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.rol-tab').forEach(t => t.classList.remove('activo'));
        document.querySelectorAll('.rol-panel').forEach(p => p.classList.remove('activo'));
        tab.classList.add('activo');
        const destino = { generar: 'panelGenerar', personal: 'panelPersonal', ausencias: 'panelAusencias' };
        $(destino[tab.dataset.tab]).classList.add('activo');
      });
    });
  }

  function prepararFormularios() {
    const hoy = new Date();
    $('rolMes').innerHTML = MESES.map((m, i) =>
      `<option value="${i + 1}" ${i === hoy.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
    $('rolAnio').value = hoy.getFullYear();

    $('btnGenerarRol').addEventListener('click', generarRol);
    $('btnCargarRol').addEventListener('click', cargarRolGuardado);
    $('btnGuardarRol').addEventListener('click', guardarRol);
    $('btnExportarPdf').addEventListener('click', exportarPdf);
    $('btnExportarExcel').addEventListener('click', exportarExcel);

    $('btnGuardarPersonal').addEventListener('click', guardarPersonal);
    $('btnCancelarPersonal').addEventListener('click', limpiarFormPersonal);
    $('btnGuardarAusencia').addEventListener('click', guardarAusencia);
  }

  // ═══════════════════════════════════════════════
  // PERSONAL
  // ═══════════════════════════════════════════════
  async function cargarPersonal() {
    const { data, error: err } = await db.from('rol_personal')
      .select('*').order('nombre_completo');
    if (err) { toast('Error al cargar personal: ' + err.message); return; }
    personal = data || [];
    pintarPersonal();
    $('ausPersonal').innerHTML = personal.filter(p => p.activo)
      .map(p => `<option value="${p.id}">${esc(p.nombre_completo)}</option>`).join('')
      || '<option value="">Primero registra al personal</option>';
  }

  function pintarPersonal() {
    const cont = $('tablaPersonal');
    if (!personal.length) {
      cont.innerHTML = `<div class="rol-aviso"><i class="ph ph-users-three"></i>
        <p>Todavía no has registrado al personal. Agrégalo en el formulario de arriba.</p></div>`;
      return;
    }
    const nombreTurno = { todos: 'Todos', M: 'Solo mañana', T: 'Solo tarde' };
    cont.innerHTML = `<div class="rol-tabla-scroll"><table class="rol-tabla">
      <thead><tr><th>Nombre</th><th>Cargo</th><th>Horas/mes</th><th>Turnos</th><th>Estado</th><th></th></tr></thead>
      <tbody>${personal.map(p => `
        <tr class="${p.activo ? '' : 'rol-inactivo'}">
          <td>${esc(p.nombre_completo)}</td>
          <td>${esc(p.cargo || '—')}</td>
          <td>${p.meta_horas_mes}</td>
          <td>${nombreTurno[p.turno_permitido]}</td>
          <td>${p.activo
            ? '<span class="rol-chip ok">Activo</span>'
            : '<span class="rol-chip off">Inactivo</span>'}</td>
          <td class="rol-acciones">
            <button type="button" data-editar="${p.id}" title="Editar"><i class="ph ph-pencil-simple"></i></button>
            <button type="button" data-estado="${p.id}" title="${p.activo ? 'Desactivar' : 'Activar'}">
              <i class="ph ${p.activo ? 'ph-prohibit' : 'ph-check-circle'}"></i></button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;

    cont.querySelectorAll('[data-editar]').forEach(b =>
      b.addEventListener('click', () => editarPersonal(b.dataset.editar)));
    cont.querySelectorAll('[data-estado]').forEach(b =>
      b.addEventListener('click', () => cambiarEstadoPersonal(b.dataset.estado)));
  }

  function editarPersonal(id) {
    const p = personal.find(x => x.id === id);
    if (!p) return;
    editandoPersonalId = id;
    $('perNombre').value = p.nombre_completo;
    $('perCargo').value = p.cargo || '';
    $('perHoras').value = p.meta_horas_mes;
    $('perTurno').value = p.turno_permitido;
    $('txtGuardarPersonal').textContent = 'Guardar cambios';
    $('btnCancelarPersonal').hidden = false;
    $('perNombre').focus();
  }

  function limpiarFormPersonal() {
    editandoPersonalId = null;
    $('perNombre').value = '';
    $('perCargo').value = '';
    $('perHoras').value = 150;
    $('perTurno').value = 'todos';
    $('txtGuardarPersonal').textContent = 'Agregar';
    $('btnCancelarPersonal').hidden = true;
    error('rolErrorPersonal', '');
  }

  async function guardarPersonal() {
    const nombre = $('perNombre').value.trim().toUpperCase();
    if (!nombre) { error('rolErrorPersonal', 'Escribe el nombre completo.'); return; }
    error('rolErrorPersonal', '');

    const fila = {
      nombre_completo: nombre,
      cargo: $('perCargo').value.trim().toUpperCase() || null,
      meta_horas_mes: Number($('perHoras').value) || 0,
      turno_permitido: $('perTurno').value
    };

    const { error: err } = editandoPersonalId
      ? await db.from('rol_personal').update(fila).eq('id', editandoPersonalId)
      : await db.from('rol_personal').insert(fila);

    if (err) { error('rolErrorPersonal', 'No se pudo guardar: ' + err.message); return; }
    toast(editandoPersonalId ? 'Profesional actualizado' : 'Profesional agregado');
    limpiarFormPersonal();
    cargarPersonal();
  }

  async function cambiarEstadoPersonal(id) {
    const p = personal.find(x => x.id === id);
    if (!p) return;
    const { error: err } = await db.from('rol_personal')
      .update({ activo: !p.activo }).eq('id', id);
    if (err) { toast('Error: ' + err.message); return; }
    cargarPersonal();
  }

  // ═══════════════════════════════════════════════
  // AUSENCIAS
  // ═══════════════════════════════════════════════
  async function cargarAusencias() {
    const { data, error: err } = await db.from('rol_ausencias')
      .select('*, rol_personal(nombre_completo)')
      .order('fecha_inicio', { ascending: false });
    if (err) { toast('Error al cargar ausencias: ' + err.message); return; }
    ausencias = data || [];
    pintarAusencias();
  }

  function pintarAusencias() {
    const cont = $('tablaAusencias');
    if (!ausencias.length) {
      cont.innerHTML = `<div class="rol-aviso"><i class="ph ph-airplane-takeoff"></i>
        <p>No hay ausencias registradas.</p></div>`;
      return;
    }
    cont.innerHTML = `<div class="rol-tabla-scroll"><table class="rol-tabla">
      <thead><tr><th>Profesional</th><th>Motivo</th><th>Desde</th><th>Hasta</th><th>Días</th><th></th></tr></thead>
      <tbody>${ausencias.map(a => {
        const dias = Math.round((new Date(a.fecha_fin) - new Date(a.fecha_inicio)) / 86400000) + 1;
        return `<tr>
          <td>${esc(a.rol_personal?.nombre_completo || '—')}</td>
          <td>${esc(a.motivo)}</td>
          <td>${fmt(a.fecha_inicio)}</td>
          <td>${fmt(a.fecha_fin)}</td>
          <td>${dias}</td>
          <td class="rol-acciones">
            <button type="button" data-borrar="${a.id}" title="Eliminar"><i class="ph ph-trash-simple"></i></button>
          </td></tr>`;
      }).join('')}</tbody></table></div>`;

    cont.querySelectorAll('[data-borrar]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta ausencia?')) return;
        await db.from('rol_ausencias').delete().eq('id', b.dataset.borrar);
        cargarAusencias();
      }));
  }

  async function guardarAusencia() {
    const personalId = $('ausPersonal').value;
    const inicio = $('ausInicio').value;
    const fin = $('ausFin').value;
    if (!personalId || !inicio || !fin) {
      error('rolErrorAusencia', 'Completa el profesional y las dos fechas.'); return;
    }
    if (fin < inicio) { error('rolErrorAusencia', 'La fecha final no puede ser anterior al inicio.'); return; }
    error('rolErrorAusencia', '');

    const { error: err } = await db.from('rol_ausencias').insert({
      personal_id: personalId,
      motivo: $('ausMotivo').value,
      fecha_inicio: inicio,
      fecha_fin: fin
    });
    if (err) { error('rolErrorAusencia', 'No se pudo guardar: ' + err.message); return; }
    toast('Ausencia registrada');
    $('ausInicio').value = '';
    $('ausFin').value = '';
    cargarAusencias();
  }

  // ═══════════════════════════════════════════════
  // GENERADOR DEL ROL
  // ═══════════════════════════════════════════════
  function diasDelMes(anio, mes, tipo) {
    const lista = [];
    const ultimo = new Date(anio, mes, 0).getDate();
    for (let d = 1; d <= ultimo; d++) {
      const f = new Date(anio, mes - 1, d);
      const dow = f.getDay();                       // 0 = domingo
      if (tipo === 'LU_SA' && dow === 0) continue;
      lista.push(`${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return lista;
  }

  const ausenteEn = (id, fecha) =>
    ausencias.some(a => a.personal_id === id && fecha >= a.fecha_inicio && fecha <= a.fecha_fin);

  const permiteTurno = (p, turno) =>
    p.turno_permitido === 'todos' || p.turno_permitido === turno;

  function generarRol() {
    const anio = Number($('rolAnio').value);
    const mes = Number($('rolMes').value);
    const tipo = $('rolDiasSemana').value;
    const descansoMT = $('rolDescansoMT').checked;
    const completar = $('rolCompletarHoras').checked;

    const activos = personal.filter(p => p.activo);
    if (activos.length < 2) {
      error('rolErrorGenerar', 'Necesitas al menos 2 profesionales activos. Regístralos en la pestaña Personal.');
      return;
    }
    error('rolErrorGenerar', '');

    dias = diasDelMes(anio, mes, tipo);
    asignaciones = {};
    const horas = {};
    activos.forEach(p => { horas[p.id] = 0; });

    // ── Paso 1: un profesional por turno, el que menos horas lleva ──
    dias.forEach((fecha, i) => {
      const anterior = dias[i - 1];
      const disponibles = activos.filter(p => !ausenteEn(p.id, fecha));

      let pool = disponibles;
      if (descansoMT && anterior) {
        const descansados = disponibles.filter(p => asignaciones[`${p.id}|${anterior}`] !== 'MT');
        if (descansados.length >= 2) pool = descansados;
      }

      const orden = [...pool].sort((a, b) =>
        (horas[a.id] - horas[b.id]) || a.nombre_completo.localeCompare(b.nombre_completo));

      const enM = orden.find(p => permiteTurno(p, 'M'));
      const enT = orden.find(p => permiteTurno(p, 'T') && p !== enM);

      if (enM && enT) {
        asignaciones[`${enM.id}|${fecha}`] = 'M'; horas[enM.id] += 6;
        asignaciones[`${enT.id}|${fecha}`] = 'T'; horas[enT.id] += 6;
      } else if (enM) {
        // solo queda una persona: cubre el día completo
        asignaciones[`${enM.id}|${fecha}`] = 'MT'; horas[enM.id] += 12;
      } else if (enT) {
        asignaciones[`${enT.id}|${fecha}`] = 'T'; horas[enT.id] += 6;
      }
    });

    // ── Paso 2: segunda persona en el turno a quien le falten horas ──
    if (completar) {
      activos.forEach(p => {
        const meta = p.meta_horas_mes || 0;
        for (const fecha of dias) {
          if (horas[p.id] >= meta) break;
          if (asignaciones[`${p.id}|${fecha}`] || ausenteEn(p.id, fecha)) continue;
          const falta = meta - horas[p.id];
          let turno;
          if (falta >= 12 && p.turno_permitido === 'todos') turno = 'MT';
          else if (permiteTurno(p, 'M')) turno = 'M';
          else turno = 'T';
          asignaciones[`${p.id}|${fecha}`] = turno;
          horas[p.id] += HORAS[turno];
        }
      });
    }

    pintarRol();
    toast(`Rol de ${MESES[mes - 1]} ${anio} generado. Revísalo y guárdalo.`);
  }

  // ═══════════════════════════════════════════════
  // TABLA DEL ROL (editable)
  // ═══════════════════════════════════════════════
  function pintarRol() {
    const activos = personal.filter(p => p.activo);
    const cont = $('rolResultado');

    if (!dias.length) { cont.innerHTML = ''; return; }

    const cabecera = dias.map(f => {
      const d = new Date(f + 'T12:00:00');
      const dom = d.getDay() === 0;
      return `<th class="${dom ? 'rol-domingo' : ''}">
        <span class="rol-dia-letra">${DIA_LETRA[d.getDay()]}</span>
        <span class="rol-dia-num">${d.getDate()}</span></th>`;
    }).join('');

    const filas = activos.map(p => {
      const celdas = dias.map(f => {
        const v = asignaciones[`${p.id}|${f}`] || '';
        const ausente = ausenteEn(p.id, f);
        if (ausente) return '<td class="rol-celda rol-ausente" title="Ausente">·</td>';
        return `<td class="rol-celda ${v ? 'turno-' + v : ''}">
          <select data-p="${p.id}" data-f="${f}">
            <option value=""   ${v === ''   ? 'selected' : ''}></option>
            <option value="M"  ${v === 'M'  ? 'selected' : ''}>M</option>
            <option value="T"  ${v === 'T'  ? 'selected' : ''}>T</option>
            <option value="MT" ${v === 'MT' ? 'selected' : ''}>M/T</option>
          </select></td>`;
      }).join('');

      return `<tr>
        <th class="rol-nombre">
          <span class="rol-cargo">${esc(p.cargo || '')}</span>
          ${esc(p.nombre_completo)}
        </th>
        ${celdas}
        <td class="rol-total" data-total="${p.id}"></td>
        <td class="rol-meta">${p.meta_horas_mes}</td>
      </tr>`;
    }).join('');

    cont.innerHTML = `<div class="rol-tabla-scroll"><table class="rol-tabla rol-calendario">
      <thead><tr>
        <th class="rol-nombre">Profesional</th>${cabecera}
        <th class="rol-total">Horas</th><th class="rol-meta">Meta</th>
      </tr></thead>
      <tbody>${filas}</tbody></table></div>`;

    cont.querySelectorAll('select').forEach(sel =>
      sel.addEventListener('change', () => {
        const clave = `${sel.dataset.p}|${sel.dataset.f}`;
        if (sel.value) asignaciones[clave] = sel.value;
        else delete asignaciones[clave];
        sel.parentElement.className = 'rol-celda ' + (sel.value ? 'turno-' + sel.value : '');
        actualizarTotales();
      }));

    actualizarTotales();
    $('rolLeyenda').hidden = false;
    $('rolAccionesFinal').hidden = false;
  }

  function actualizarTotales() {
    personal.filter(p => p.activo).forEach(p => {
      let total = 0;
      dias.forEach(f => { total += HORAS[asignaciones[`${p.id}|${f}`]] || 0; });
      const celda = document.querySelector(`[data-total="${p.id}"]`);
      if (!celda) return;
      celda.textContent = total;
      celda.classList.toggle('rol-falta', total < (p.meta_horas_mes || 0));
      celda.classList.toggle('rol-exceso', total > (p.meta_horas_mes || 0));
    });
  }

  // ═══════════════════════════════════════════════
  // GUARDAR Y CARGAR
  // ═══════════════════════════════════════════════
  async function guardarRol() {
    if (!dias.length) { toast('Primero genera el rol.'); return; }
    const anio = Number($('rolAnio').value);
    const mes = Number($('rolMes').value);

    const btn = $('btnGuardarRol');
    btn.disabled = true;

    const { data: rol, error: errRol } = await db.from('rol_roles')
      .upsert({ anio, mes, dias_semana: $('rolDiasSemana').value, estado: 'publicado' },
              { onConflict: 'anio,mes' })
      .select('id').single();

    if (errRol) { btn.disabled = false; toast('Error al guardar: ' + errRol.message); return; }

    await db.from('rol_asignaciones').delete().eq('rol_id', rol.id);

    const filas = Object.entries(asignaciones).map(([clave, turno]) => {
      const [personal_id, fecha] = clave.split('|');
      return { rol_id: rol.id, personal_id, fecha, turno };
    });

    if (filas.length) {
      const { error: errAsig } = await db.from('rol_asignaciones').insert(filas);
      if (errAsig) { btn.disabled = false; toast('Error al guardar turnos: ' + errAsig.message); return; }
    }

    btn.disabled = false;
    toast(`Rol de ${MESES[mes - 1]} ${anio} guardado (${filas.length} turnos).`);
  }

  async function cargarRolGuardado() {
    const anio = Number($('rolAnio').value);
    const mes = Number($('rolMes').value);

    const { data: rol } = await db.from('rol_roles')
      .select('id, dias_semana').eq('anio', anio).eq('mes', mes).maybeSingle();

    if (!rol) { toast(`No hay un rol guardado para ${MESES[mes - 1]} ${anio}.`); return; }

    const { data: asig } = await db.from('rol_asignaciones')
      .select('personal_id, fecha, turno').eq('rol_id', rol.id);

    $('rolDiasSemana').value = rol.dias_semana;
    dias = diasDelMes(anio, mes, rol.dias_semana);
    asignaciones = {};
    (asig || []).forEach(a => { asignaciones[`${a.personal_id}|${a.fecha}`] = a.turno; });

    pintarRol();
    toast(`Rol de ${MESES[mes - 1]} ${anio} cargado.`);
  }

  // ═══════════════════════════════════════════════
  // EXPORTAR
  // ═══════════════════════════════════════════════
  function tituloRol() {
    return `ROL DE TURNOS — ${MESES[Number($('rolMes').value) - 1].toUpperCase()} ${$('rolAnio').value}`;
  }

  function exportarExcel() {
    if (!dias.length) { toast('Primero genera el rol.'); return; }
    const activos = personal.filter(p => p.activo);

    const cab = ['CARGO', 'PROFESIONAL',
      ...dias.map(f => new Date(f + 'T12:00:00').getDate()), 'HORAS', 'META'];

    const filas = activos.map(p => {
      let total = 0;
      const celdas = dias.map(f => {
        const v = asignaciones[`${p.id}|${f}`] || '';
        total += HORAS[v] || 0;
        return v === 'MT' ? 'M/T' : v;
      });
      return [p.cargo || '', p.nombre_completo, ...celdas, total, p.meta_horas_mes];
    });

    const hoja = XLSX.utils.aoa_to_sheet([[tituloRol()], [], cab, ...filas]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Rol');
    XLSX.writeFile(libro, `Rol_${$('rolAnio').value}_${String($('rolMes').value).padStart(2, '0')}.xlsx`);
  }

  function exportarPdf() {
    if (!dias.length) { toast('Primero genera el rol.'); return; }
    const activos = personal.filter(p => p.activo);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a3');       // A3 horizontal: caben 31 días

    const pageW = 420, margin = 10;
    const anchoNombre = 62, anchoTotal = 14;
    const anchoDia = (pageW - margin * 2 - anchoNombre - anchoTotal * 2) / dias.length;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(tituloRol(), pageW / 2, 14, { align: 'center' });

    let y = 22;
    const alto = 7;

    function celda(x, ancho, texto, centrado) {
      doc.rect(x, y, ancho, alto);
      if (texto === '') return;
      if (centrado) doc.text(String(texto), x + ancho / 2, y + 4.8, { align: 'center' });
      else doc.text(String(texto), x + 1.5, y + 4.8);
    }

    // cabecera
    doc.setFillColor(41, 128, 185);
    doc.rect(margin, y, pageW - margin * 2, alto, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    let x = margin;
    celda(x, anchoNombre, 'PROFESIONAL', false); x += anchoNombre;
    dias.forEach(f => {
      celda(x, anchoDia, new Date(f + 'T12:00:00').getDate(), true); x += anchoDia;
    });
    celda(x, anchoTotal, 'HORAS', true); x += anchoTotal;
    celda(x, anchoTotal, 'META', true);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    y += alto;

    activos.forEach(p => {
      let total = 0;
      x = margin;
      doc.setFontSize(6.5);
      celda(x, anchoNombre, `${p.cargo ? p.cargo + ' ' : ''}${p.nombre_completo}`.slice(0, 42), false);
      x += anchoNombre;
      doc.setFontSize(6);
      dias.forEach(f => {
        const v = asignaciones[`${p.id}|${f}`] || '';
        total += HORAS[v] || 0;
        celda(x, anchoDia, v === 'MT' ? 'M/T' : v, true);
        x += anchoDia;
      });
      doc.setFontSize(6.5);
      celda(x, anchoTotal, total, true); x += anchoTotal;
      celda(x, anchoTotal, p.meta_horas_mes, true);
      y += alto;
    });

    y += 6;
    doc.setFontSize(7.5);
    doc.text('M: 08:00 a 14:00      T: 14:00 a 20:00      M/T: 08:00 a 20:00', margin, y);

    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  }

  function fmt(f) {
    if (!f) return '—';
    const [a, m, d] = String(f).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
