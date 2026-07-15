(function () {
  'use strict'

  let supabase
  let sesion = null
  let perfilActual = null
  let mapaPerfiles = {}
  let todosDocumentos = []

  let mesActual, anoActual
  let eventosDelMes = []
  let fechaSeleccionada = ''
  let eventoEditandoId = null

  const MESES_COMPLETOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

  const TIPOS = {
    'CARTA': 'CARTA',
    'MEMORANDUM': 'MEMORÁNDUM',
    'MEMORANDO_CIRCULAR': 'MEMORANDO CIRCULAR',
    'OFICIO': 'OFICIO',
    'SOLICITUD': 'SOLICITUD',
    'INFORME': 'INFORME',
    'NOTAS': 'NOTA',
    'NOTA_CIRCULAR': 'NOTA CIRCULAR',
  }

  const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC']

  const FERIADOS = [
    { fecha: '2026-01-01', nombre: 'Año Nuevo' },
    { fecha: '2026-04-02', nombre: 'Jueves Santo' },
    { fecha: '2026-04-03', nombre: 'Viernes Santo' },
    { fecha: '2026-05-01', nombre: 'Día del Trabajo' },
    { fecha: '2026-06-29', nombre: 'San Pedro y San Pablo' },
    { fecha: '2026-07-28', nombre: 'Fiestas Patrias' },
    { fecha: '2026-07-29', nombre: 'Fiestas Patrias' },
    { fecha: '2026-08-30', nombre: 'Santa Rosa de Lima' },
    { fecha: '2026-10-08', nombre: 'Combate de Angamos' },
    { fecha: '2026-11-01', nombre: 'Todos los Santos' },
    { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
    { fecha: '2026-12-09', nombre: 'Batalla de Ayacucho' },
    { fecha: '2026-12-25', nombre: 'Navidad' }
  ]

  function obtenerFeriado(fechaStr) {
    return FERIADOS.find(f => f.fecha === fechaStr)
  }

  document.addEventListener('lateral:listo', inicializar)

  async function inicializar() {
    supabase = window.supabase
    if (!supabase) return

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      window.location.href = 'index.html'
      return
    }
    sesion = session

    if (!await verificarAcceso('dashboard')) return

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, apellidos_completos')
      .eq('id', session.user.id)
      .single()

    if (!perfil) return
    perfilActual = perfil

    await cargarPerfiles()

    renderizarBienvenida()
    renderizarAccesosRapidos()

    inicializarCalendario()

    await Promise.all([
      cargarEventosDelMes(),
      cargarDocumentos(),
      renderizarActividadReciente(),
    ])

    renderCalendario()
    renderHeaderCalendario()
    renderizarProximosEventos()
    renderizarIndicadores()

    const hoyStr = formatearFechaISO(new Date())
    seleccionarDia(hoyStr)
    bindEventosCalendario()
  }

  async function cargarPerfiles() {
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, apellidos_completos')

    if (data) {
      mapaPerfiles = {}
      data.forEach(p => {
        mapaPerfiles[p.id] = `${p.nombre_completo || ''} ${p.apellidos_completos || ''}`.trim()
      })
    }
  }

  async function cargarDocumentos() {
    const { data } = await supabase
      .from('documentos')
      .select('tipo, tipo_documento, estado_actual, prioridad, created_at')

    if (data) todosDocumentos = data
  }

  /* ════════════════════════════════════════════
     SECCIÓN 1: BIENVENIDA
     ════════════════════════════════════════════ */

  function renderizarBienvenida() {
    const hora = new Date().getHours()
    let saludo = ''
    if (hora < 12) saludo = 'Buenos días'
    else if (hora < 18) saludo = 'Buenas tardes'
    else saludo = 'Buenas noches'

    const nombre = perfilActual.nombre_completo || ''
    document.getElementById('dashSaludo').textContent = `${saludo}, ${nombre}`
  }

  /* ════════════════════════════════════════════
     SECCIÓN 2: ACCESOS RÁPIDOS
     ════════════════════════════════════════════ */

  function renderizarAccesosRapidos() {
    document.querySelectorAll('.dash-acceso-card').forEach(card => {
      card.addEventListener('click', () => {
        const ruta = card.dataset.ruta
        const tab = card.dataset.tab
        if (ruta) {
          window.location.href = `${ruta}.html${tab ? '#derivar' : ''}`
        }
      })
    })
  }

  /* ════════════════════════════════════════════
     SECCIÓN 3: ACTIVIDAD RECIENTE
     ════════════════════════════════════════════ */

  async function renderizarActividadReciente() {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8)

    const lista = document.getElementById('actividadLista')

    if (error || !data || data.length === 0) {
      lista.innerHTML = '<div class="dash-actividad-placeholder">No hay actividad reciente.</div>'
      return
    }

    lista.innerHTML = ''
    data.forEach(doc => {
      const item = document.createElement('div')
      item.className = 'dash-actividad-item'

      const hora = formatearHora(doc.created_at)
      const accion = obtenerAccion(doc)
      const icono = accion.icono
      const color = accion.color
      const desc = accion.texto
      const usuario = mapaPerfiles[doc.remitente_id] || mapaPerfiles[doc.creado_por] || '—'

      item.innerHTML = `
        <span class="dash-actividad-hora">${hora}</span>
        <div class="dash-actividad-icono" style="background:${color.bg};color:${color.fg}">
          <i class="${icono}"></i>
        </div>
        <div class="dash-actividad-body">
          <p class="dash-actividad-desc">${escaparHtml(desc)}</p>
          <p class="dash-actividad-usuario">${escaparHtml(usuario)}</p>
        </div>
      `
      lista.appendChild(item)
    })

    document.getElementById('btnVerMasActividad').addEventListener('click', () => {
      window.location.href = 'documentos.html'
    })
  }

  function formatearHora(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  function obtenerAccion(doc) {
    const tipo = TIPOS[doc.tipo_documento] || doc.tipo_documento
    const num = doc.numero_documento || ''

    if (doc.tipo === 'emitido' && !doc.estado_actual) {
      return {
        icono: 'ph ph-file-arrow-up',
        color: { bg: 'rgba(30,136,229,0.1)', fg: 'var(--color-primario-inicio)' },
        texto: `${tipo} N° ${num} fue registrado`,
      }
    }
    if (doc.tipo === 'emitido' && doc.estado_actual === 'ATENDIDO') {
      return {
        icono: 'ph ph-check-circle',
        color: { bg: 'rgba(0,103,79,0.1)', fg: 'var(--color-exito)' },
        texto: `${tipo} N° ${num} fue finalizado`,
      }
    }
    if (doc.tipo === 'emitido') {
      const est = doc.estado_actual === 'OBSERVADO' ? 'observado' : 'actualizado'
      return {
        icono: 'ph ph-clock-counter-clockwise',
        color: { bg: 'rgba(245,158,11,0.1)', fg: 'var(--color-naranja)' },
        texto: `${tipo} N° ${num} fue ${est}`,
      }
    }
    if (doc.tipo === 'derivado') {
      return {
        icono: 'ph ph-file-arrow-down',
        color: { bg: 'rgba(124,58,237,0.1)', fg: 'var(--color-purpura)' },
        texto: `${tipo} N° ${num} fue derivado`,
      }
    }
    return {
      icono: 'ph ph-file-text',
      color: { bg: 'rgba(148,163,184,0.1)', fg: 'var(--color-texto-claro)' },
      texto: `${tipo} N° ${num}`,
    }
  }

  /* ════════════════════════════════════════════
     CALENDARIO — INICIALIZACIÓN
     ════════════════════════════════════════════ */

  function inicializarCalendario() {
    const hoy = new Date()
    mesActual = hoy.getMonth()
    anoActual = hoy.getFullYear()
  }

  function formatearFechaISO(date) {
    const d = String(date.getDate()).padStart(2, '0')
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const a = date.getFullYear()
    return `${a}-${m}-${d}`
  }

  /* ─── CARGAR EVENTOS DEL MES ─── */

  async function cargarEventosDelMes() {
    const primerDia = new Date(anoActual, mesActual, 1).toISOString().slice(0, 10)
    const ultimoDia = new Date(anoActual, mesActual + 1, 0).toISOString().slice(0, 10)

    const { data } = await supabase
      .from('agenda_eventos')
      .select('*')
      .gte('fecha_evento', primerDia)
      .lte('fecha_evento', ultimoDia)
      .eq('usuario_asignado', perfilActual.id)
      .order('fecha_evento')

    eventosDelMes = data || []
  }

  /* ─── RENDER CALENDARIO ─── */

  function renderCalendario() {
    const grid = document.getElementById('dashCalGrid')
    const primerDia = new Date(anoActual, mesActual, 1).getDay()
    const diasEnMes = new Date(anoActual, mesActual + 1, 0).getDate()
    const diasEnMesAnterior = new Date(anoActual, mesActual, 0).getDate()
    const hoy = new Date()
    const hoyStr = formatearFechaISO(hoy)

    grid.innerHTML = ''

    for (let i = primerDia - 1; i >= 0; i--) {
      grid.appendChild(crearDiaCalendario(diasEnMesAnterior - i, true, false))
    }

    for (let d = 1; d <= diasEnMes; d++) {
      const fechaStr = `${anoActual}-${String(mesActual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const esHoy = fechaStr === hoyStr
      const eventos = eventosDelMes.filter(e => e.fecha_evento === fechaStr)
      grid.appendChild(crearDiaCalendario(d, false, esHoy, eventos, fechaStr))
    }

    const totalCeldas = grid.children.length
    const restantes = (7 - (totalCeldas % 7)) % 7
    for (let d = 1; d <= restantes; d++) {
      grid.appendChild(crearDiaCalendario(d, true, false))
    }
  }

  function crearDiaCalendario(dia, otroMes, esHoy, eventos, fechaStr) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dash-cal-dia'
    if (otroMes) btn.classList.add('otro-mes')
    if (esHoy) btn.classList.add('hoy')
    if (fechaStr && fechaStr === fechaSeleccionada) btn.classList.add('seleccionado')

    if (fechaStr) {
      const feriado = obtenerFeriado(fechaStr)
      if (feriado) {
        btn.classList.add('dash-cal-dia-feriado')
        btn.title = feriado.nombre
      }
      btn.dataset.fecha = fechaStr
      btn.addEventListener('click', () => seleccionarDia(fechaStr))
    }

    const tieneEventos = eventos && eventos.length > 0
    const todosCompletados = tieneEventos && eventos.every(e => e.completado)

    btn.innerHTML = `
      <div class="dash-cal-dia-contenido">
        <span class="dash-cal-dia-numero">${dia}</span>
        ${tieneEventos ? `<span class="dash-cal-dia-tiene ${todosCompletados ? 'completado' : ''}"></span>` : ''}
      </div>
    `

    return btn
  }

  function renderHeaderCalendario() {
    document.getElementById('dashCalTitulo').textContent = `${MESES_COMPLETOS[mesActual]} ${anoActual}`
  }

  /* ─── NAVEGACIÓN ─── */

  async function navegarMes(delta) {
    mesActual += delta
    if (mesActual > 11) { mesActual = 0; anoActual++ }
    if (mesActual < 0) { mesActual = 11; anoActual-- }
    renderHeaderCalendario()
    await cargarEventosDelMes()
    renderCalendario()

    const primerDia = `${anoActual}-${String(mesActual + 1).padStart(2, '0')}-01`
    const evento = eventosDelMes.find(e => e.fecha_evento.startsWith(`${anoActual}-${String(mesActual + 1).padStart(2, '0')}`))
    if (evento) {
      seleccionarDia(evento.fecha_evento)
    } else {
      fechaSeleccionada = ''
      const placeholder = document.getElementById('dashEventosDia')
      if (placeholder) {
        placeholder.innerHTML = '<div class="dash-cal-evento-placeholder">Selecciona un día para ver sus eventos</div>'
      }
      document.getElementById('btnVerTodasDia').style.display = 'none'
    }
  }

  async function irAHoy() {
    const hoy = new Date()
    mesActual = hoy.getMonth()
    anoActual = hoy.getFullYear()
    renderHeaderCalendario()
    await cargarEventosDelMes()
    renderCalendario()
    const hoyStr = formatearFechaISO(hoy)
    seleccionarDia(hoyStr)
  }

  /* ─── SELECCIÓN DE DÍA ─── */

  function seleccionarDia(fechaStr) {
    fechaSeleccionada = fechaStr

    document.querySelectorAll('.dash-cal-dia.seleccionado').forEach(el => el.classList.remove('seleccionado'))
    const diaBtn = document.querySelector(`.dash-cal-dia[data-fecha="${fechaStr}"]`)
    if (diaBtn) diaBtn.classList.add('seleccionado')

    renderizarEventosDelDia(fechaStr)
  }

  function renderizarEventosDelDia(fechaStr) {
    const contenedor = document.getElementById('dashEventosDia')
    const btnVerTodas = document.getElementById('btnVerTodasDia')
    const eventos = eventosDelMes
      .filter(e => e.fecha_evento === fechaStr)
      .sort((a, b) => (a.hora_evento || '').localeCompare(b.hora_evento || ''))

    const feriado = obtenerFeriado(fechaStr)
    let html = ''

    if (feriado) {
      html += `<div class="dash-feriado-label"><i class="ph ph-calendar-x"></i> Feriado: ${escaparHtml(feriado.nombre)}</div>`
    }

    if (eventos.length === 0) {
      contenedor.innerHTML = html + '<div class="dash-cal-evento-placeholder">No existen eventos programados para esta fecha.</div>'
      btnVerTodas.style.display = 'none'
      return
    }

    const fecha = new Date(fechaStr + 'T12:00:00')
    const fechaFormateada = fecha.toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })

    html += `<div class="dash-dia-seleccionado-label">${fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1)}</div>`

    const mostrar = eventos.slice(0, 4)
    mostrar.forEach(ev => {
      const horaTexto = ev.hora_evento ? formatearHora12h(ev.hora_evento) : ''
      const badgeClase = ev.completado ? 'finalizado' : 'programado'
      const badgeTexto = ev.completado ? 'Finalizado' : 'Programado'

      html += `
        <div class="dash-dia-evento-item" data-evento-id="${ev.id}">
          ${horaTexto ? `<span class="dash-dia-evento-hora">${escaparHtml(horaTexto)}</span>` : ''}
          <div class="dash-dia-evento-info">
            <div class="dash-dia-evento-titulo">${escaparHtml(ev.titulo)}</div>
            <div class="dash-dia-evento-meta">
              ${ev.descripcion ? `<i class="ph ph-map-pin"></i>${escaparHtml(ev.descripcion)}` : ''}
              <span class="dash-evento-badge ${badgeClase}">${badgeTexto}</span>
            </div>
          </div>
        </div>
      `
    })

    contenedor.innerHTML = html
    btnVerTodas.style.display = eventos.length > 4 ? 'flex' : 'none'
    btnVerTodas.dataset.fecha = fechaStr
  }

  /* ════════════════════════════════════════════
     SECCIÓN 4: PRÓXIMOS EVENTOS
     ════════════════════════════════════════════ */

  async function renderizarProximosEventos() {
    const hoy = new Date()
    const hoyStr = formatearFechaISO(hoy)
    const ahoraTimeStr = hoy.toTimeString().slice(0, 5)

    const { data } = await supabase
      .from('agenda_eventos')
      .select('id, titulo, fecha_evento, hora_evento, descripcion, completado')
      .eq('usuario_asignado', perfilActual.id)
      .eq('completado', false)
      .gte('fecha_evento', hoyStr)
      .order('fecha_evento', { ascending: true })
      .order('hora_evento', { ascending: true })

    const lista = document.getElementById('dashProximosLista')

    if (!data || data.length === 0) {
      lista.innerHTML = '<div class="dash-empty">Sin eventos próximos</div>'
      return
    }

    // Filtrar eventos futuros (hoy con hora futura o fecha futura)
    const futuros = data.filter(ev =>
      ev.fecha_evento > hoyStr || (ev.hora_evento && ev.hora_evento > ahoraTimeStr)
    )

    if (futuros.length === 0) {
      lista.innerHTML = '<div class="dash-empty">Sin eventos próximos</div>'
      return
    }

    lista.innerHTML = futuros.slice(0, 8).map(ev => {
      const fecha = new Date(ev.fecha_evento + 'T12:00:00')
      const dia = fecha.getDate()
      const mes = MESES[fecha.getMonth()]
      const horaTexto = ev.hora_evento ? formatearHora12h(ev.hora_evento) : ''
      const badgeTexto = ev.completado ? 'Finalizado' : 'Programado'
      const badgeClase = ev.completado ? 'finalizado' : 'programado'

      return `
        <div class="dash-prox-item" data-evento-id="${ev.id}">
          <div class="dash-prox-fecha">
            <span class="dash-prox-dia">${dia}</span>
            <span class="dash-prox-mes">${mes}</span>
          </div>
          <div class="dash-prox-info">
            <div class="dash-prox-titulo">${escaparHtml(ev.titulo)}</div>
            <div class="dash-prox-meta">
              ${horaTexto ? `<i class="ph ph-clock"></i>${escaparHtml(horaTexto)}` : ''}
              ${ev.descripcion ? `<i class="ph ph-map-pin"></i>${escaparHtml(ev.descripcion)}` : ''}
              <span class="dash-evento-badge ${badgeClase}">${badgeTexto}</span>
            </div>
          </div>
        </div>
      `
    }).join('')
  }

  function formatearHora12h(hora24) {
    if (!hora24) return ''
    const [h, m] = hora24.split(':').map(Number)
    const periodo = h >= 12 ? 'p.m.' : 'a.m.'
    const h12 = h % 12 || 12
    return `${h12}:${String(m).padStart(2, '0')} ${periodo}`
  }

  /* ─── BIND EVENTOS CALENDARIO ─── */

  function bindEventosCalendario() {
    document.getElementById('btnCalMesAnt').addEventListener('click', () => navegarMes(-1))
    document.getElementById('btnCalMesSig').addEventListener('click', () => navegarMes(1))
    document.getElementById('btnCalHoy').addEventListener('click', irAHoy)
    document.getElementById('btnNuevaReunion').addEventListener('click', () => abrirModalNuevaReunion())
    document.getElementById('btnVerTodosEventos').addEventListener('click', abrirModalTodosEventos)

    // Modal nueva reunion
    document.getElementById('btnCerrarNuevaReunion').addEventListener('click', cerrarModalNuevaReunion)
    document.getElementById('btnCancelarNuevaReunion').addEventListener('click', cerrarModalNuevaReunion)
    document.getElementById('btnGuardarNuevaReunion').addEventListener('click', guardarNuevaReunion)
    document.getElementById('btnEliminarReunion').addEventListener('click', eliminarReunion)
    document.getElementById('modalNuevaReunion').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalNuevaReunion')) cerrarModalNuevaReunion()
    })

    // Modal todos eventos
    document.getElementById('btnCerrarTodosEventos').addEventListener('click', cerrarModalTodosEventos)
    document.getElementById('btnCerrarTodosEventosFooter').addEventListener('click', cerrarModalTodosEventos)
    document.getElementById('modalTodosEventos').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalTodosEventos')) cerrarModalTodosEventos()
    })

    // Modal eventos del día
    document.getElementById('btnVerTodasDia').addEventListener('click', () => {
      const fecha = document.getElementById('btnVerTodasDia').dataset.fecha
      if (fecha) abrirModalEventosDia(fecha)
    })
    document.getElementById('btnCerrarEventosDia').addEventListener('click', cerrarModalEventosDia)
    document.getElementById('btnCerrarEventosDiaFooter').addEventListener('click', cerrarModalEventosDia)
    document.getElementById('modalEventosDia').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalEventosDia')) cerrarModalEventosDia()
    })

    // Click en evento del día → editar
    document.getElementById('dashEventosDia').addEventListener('click', (e) => {
      const item = e.target.closest('.dash-dia-evento-item')
      if (item && item.dataset.eventoId) {
        const evento = eventosDelMes.find(ev => ev.id === item.dataset.eventoId)
        if (evento) abrirModalNuevaReunion(evento)
      }
    })

    // Click en próximo evento → editar
    document.getElementById('dashProximosLista').addEventListener('click', async (e) => {
      const item = e.target.closest('.dash-prox-item')
      if (item && item.dataset.eventoId) {
        const id = item.dataset.eventoId
        const evento = eventosDelMes.find(ev => ev.id === id)
        if (evento) {
          abrirModalNuevaReunion(evento)
        } else {
          const { data } = await supabase.from('agenda_eventos').select('*').eq('id', id).single()
          if (data) abrirModalNuevaReunion(data)
        }
      }
    })

    // Click en todos eventos item → editar
    document.getElementById('todosEventosLista').addEventListener('click', async (e) => {
      const item = e.target.closest('.todos-eventos-item')
      if (item && item.dataset.eventoId) {
        const id = item.dataset.eventoId
        const { data } = await supabase.from('agenda_eventos').select('*').eq('id', id).single()
        if (data) {
          cerrarModalTodosEventos()
          abrirModalNuevaReunion(data)
        }
      }
    })

    // Click en evento del día (modal) → editar
    document.getElementById('eventosDiaLista').addEventListener('click', async (e) => {
      const item = e.target.closest('.todos-eventos-item')
      if (item && item.dataset.eventoId) {
        const id = item.dataset.eventoId
        const evento = eventosDelMes.find(ev => ev.id === id)
        if (evento) {
          cerrarModalEventosDia()
          abrirModalNuevaReunion(evento)
        }
      }
    })

    // Enter en titulo → pasar a hora
    document.getElementById('campoNuevoTitulo').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        document.getElementById('campoNuevoHora').focus()
      }
    })

    // Limitar dígitos hora
    function limitarDigitos(input, max, minVal, maxVal) {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, max)
        if (input.value.length === max) {
          const n = parseInt(input.value)
          if (n < minVal) input.value = String(minVal)
          if (n > maxVal) input.value = String(maxVal)
        }
      })
    }
    limitarDigitos(document.getElementById('campoNuevoHora'), 2, 1, 12)
    limitarDigitos(document.getElementById('campoNuevoMinuto'), 2, 0, 59)
  }

  /* ════════════════════════════════════════════
     MODAL NUEVA REUNIÓN
     ════════════════════════════════════════════ */

  function abrirModalNuevaReunion(evento) {
    const modalTitulo = document.querySelector('#modalNuevaReunion .header-text-md h3')
    const modalSubtitulo = document.querySelector('#modalNuevaReunion .header-text-md p')
    const btnGuardarTexto = document.getElementById('textoGuardarNuevaReunion')
    const btnEliminar = document.getElementById('btnEliminarReunion')

    document.getElementById('errorNuevoTitulo').textContent = ''
    document.getElementById('errorNuevoHora').textContent = ''

    document.getElementById('textoGuardarNuevaReunion').style.display = 'inline'
    document.getElementById('spinnerNuevaReunion').style.display = 'none'
    document.getElementById('btnGuardarNuevaReunion').disabled = false

    if (evento) {
      eventoEditandoId = evento.id
      modalTitulo.textContent = 'Editar reunión'
      modalSubtitulo.textContent = 'Modifique los detalles de la reunión'
      btnGuardarTexto.textContent = 'Guardar cambios'
      btnEliminar.style.display = 'flex'

      document.getElementById('campoNuevoTitulo').value = evento.titulo || ''
      document.getElementById('campoNuevoFecha').value = evento.fecha_evento || ''
      document.getElementById('campoNuevoDescripcion').value = evento.descripcion || ''
      document.getElementById('campoNuevoCompletado').checked = evento.completado || false

      if (evento.hora_evento) {
        const [h24, m] = evento.hora_evento.slice(0, 5).split(':').map(Number)
        const h12 = h24 % 12 || 12
        document.getElementById('campoNuevoHora').value = String(h12)
        document.getElementById('campoNuevoMinuto').value = String(m).padStart(2, '0')
        document.getElementById('campoNuevoAmPm').value = h24 >= 12 ? 'PM' : 'AM'
      } else {
        document.getElementById('campoNuevoHora').value = ''
        document.getElementById('campoNuevoMinuto').value = ''
        document.getElementById('campoNuevoAmPm').value = 'AM'
      }
    } else {
      eventoEditandoId = null
      modalTitulo.textContent = 'Nueva reunión'
      modalSubtitulo.textContent = 'Complete los detalles de la reunión'
      btnGuardarTexto.textContent = 'Guardar'
      btnEliminar.style.display = 'none'

      document.getElementById('campoNuevoTitulo').value = ''
      document.getElementById('campoNuevoDescripcion').value = ''
      document.getElementById('campoNuevoHora').value = ''
      document.getElementById('campoNuevoMinuto').value = ''
      document.getElementById('campoNuevoAmPm').value = 'AM'
      document.getElementById('campoNuevoCompletado').checked = false

      const fecha = fechaSeleccionada || formatearFechaISO(new Date())
      document.getElementById('campoNuevoFecha').value = fecha
    }

    document.getElementById('modalNuevaReunion').classList.add('activo')
    setTimeout(() => document.getElementById('campoNuevoTitulo').focus(), 100)
  }

  function cerrarModalNuevaReunion() {
    document.getElementById('modalNuevaReunion').classList.remove('activo')
  }

  async function guardarNuevaReunion() {
    const titulo = document.getElementById('campoNuevoTitulo').value.trim()
    const fecha = document.getElementById('campoNuevoFecha').value
    const horaHh = document.getElementById('campoNuevoHora').value
    const horaMm = document.getElementById('campoNuevoMinuto').value
    const ampm = document.getElementById('campoNuevoAmPm').value
    const descripcion = document.getElementById('campoNuevoDescripcion').value.trim() || null
    const completado = document.getElementById('campoNuevoCompletado').checked

    document.getElementById('errorNuevoTitulo').textContent = ''
    document.getElementById('errorNuevoHora').textContent = ''

    if (!titulo) {
      document.getElementById('errorNuevoTitulo').textContent = 'El título es obligatorio'
      document.getElementById('campoNuevoTitulo').focus()
      return
    }
    if (!fecha) return
    if (!horaHh || !horaMm) {
      document.getElementById('errorNuevoHora').textContent = 'La hora es obligatoria'
      document.getElementById('campoNuevoHora').focus()
      return
    }

    let h24 = parseInt(horaHh)
    if (ampm === 'PM' && h24 < 12) h24 += 12
    if (ampm === 'AM' && h24 === 12) h24 = 0
    const hora = `${String(h24).padStart(2, '0')}:${String(horaMm).padStart(2, '0')}`

    setCargandoNuevaReunion(true)

    let error

    if (eventoEditandoId) {
      const res = await supabase
        .from('agenda_eventos')
        .update({ titulo, fecha_evento: fecha, hora_evento: hora, descripcion, completado })
        .eq('id', eventoEditandoId)
      error = res.error
    } else {
      const res = await supabase
        .from('agenda_eventos')
        .insert({
          titulo,
          fecha_evento: fecha,
          hora_evento: hora,
          descripcion,
          tipo: 'evento',
          usuario_asignado: perfilActual.id,
          creado_por: perfilActual.id,
          completado,
        })
      error = res.error
    }

    setCargandoNuevaReunion(false)

    if (error) {
      document.getElementById('errorNuevoHora').textContent = error.message || 'Error al guardar'
      return
    }

    eventoEditandoId = null
    cerrarModalNuevaReunion()

    await cargarEventosDelMes()
    renderCalendario()
    renderHeaderCalendario()
    await renderizarProximosEventos()
    if (fechaSeleccionada) renderizarEventosDelDia(fechaSeleccionada)
  }

  async function eliminarReunion() {
    if (!eventoEditandoId) return
    if (!confirm('¿Está seguro de eliminar esta reunión?')) return

    setCargandoNuevaReunion(true)
    const { error } = await supabase.from('agenda_eventos').delete().eq('id', eventoEditandoId)
    setCargandoNuevaReunion(false)

    if (error) {
      document.getElementById('errorNuevoHora').textContent = error.message || 'Error al eliminar'
      return
    }

    eventoEditandoId = null
    cerrarModalNuevaReunion()

    await cargarEventosDelMes()
    renderCalendario()
    renderHeaderCalendario()
    await renderizarProximosEventos()
    if (fechaSeleccionada) renderizarEventosDelDia(fechaSeleccionada)
  }

  function setCargandoNuevaReunion(activo) {
    document.getElementById('btnGuardarNuevaReunion').disabled = activo
    document.getElementById('textoGuardarNuevaReunion').style.display = activo ? 'none' : 'inline'
    document.getElementById('spinnerNuevaReunion').style.display = activo ? 'block' : 'none'
  }

  /* ════════════════════════════════════════════
     MODAL TODOS LOS EVENTOS
     ════════════════════════════════════════════ */

  async function abrirModalTodosEventos() {
    const contenedor = document.getElementById('todosEventosLista')
    contenedor.innerHTML = '<div class="dash-empty">Cargando eventos…</div>'
    document.getElementById('modalTodosEventos').classList.add('activo')

    const hoy = new Date()
    const hoyStr = formatearFechaISO(hoy)
    const ahoraTimeStr = hoy.toTimeString().slice(0, 5)

    const { data } = await supabase
      .from('agenda_eventos')
      .select('id, titulo, fecha_evento, hora_evento, descripcion, completado')
      .eq('usuario_asignado', perfilActual.id)
      .eq('completado', false)
      .gte('fecha_evento', hoyStr)
      .order('fecha_evento', { ascending: true })
      .order('hora_evento', { ascending: true })

    if (!data || data.length === 0) {
      contenedor.innerHTML = '<div class="dash-empty">No hay eventos programados.</div>'
      return
    }

    const futuros = data.filter(ev =>
      ev.fecha_evento > hoyStr || (ev.hora_evento && ev.hora_evento > ahoraTimeStr)
    )

    if (futuros.length === 0) {
      contenedor.innerHTML = '<div class="dash-empty">No hay eventos programados.</div>'
      return
    }

    contenedor.innerHTML = futuros.map(ev => {
      const fecha = new Date(ev.fecha_evento + 'T12:00:00')
      const dia = fecha.getDate()
      const mes = MESES[fecha.getMonth()]
      const horaTexto = ev.hora_evento ? formatearHora12h(ev.hora_evento) : ''
      const badgeTexto = ev.completado ? 'Finalizado' : 'Programado'
      const badgeClase = ev.completado ? 'finalizado' : 'programado'

      return `
        <div class="todos-eventos-item" data-evento-id="${ev.id}">
          <div class="todos-eventos-fecha">
            <span class="todos-eventos-dia">${dia}</span>
            <span class="todos-eventos-mes">${mes}</span>
          </div>
          <div class="todos-eventos-info">
            <div class="todos-eventos-titulo">${escaparHtml(ev.titulo)}</div>
            <div class="todos-eventos-meta">
              ${horaTexto ? `<i class="ph ph-clock"></i>${escaparHtml(horaTexto)}` : ''}
              ${ev.descripcion ? `<i class="ph ph-map-pin"></i>${escaparHtml(ev.descripcion)}` : ''}
              <span class="dash-evento-badge ${badgeClase}">${badgeTexto}</span>
            </div>
          </div>
        </div>
      `
    }).join('')
  }

  function cerrarModalTodosEventos() {
    document.getElementById('modalTodosEventos').classList.remove('activo')
  }

  /* ════════════════════════════════════════════
     MODAL EVENTOS DEL DÍA
     ════════════════════════════════════════════ */

  async function abrirModalEventosDia(fechaStr) {
    const contenedor = document.getElementById('eventosDiaLista')
    const subtitulo = document.getElementById('modalEventosDiaSubtitulo')
    contenedor.innerHTML = '<div class="dash-empty">Cargando eventos…</div>'

    const fecha = new Date(fechaStr + 'T12:00:00')
    subtitulo.textContent = fecha.toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).replace(/^./, c => c.toUpperCase())

    document.getElementById('modalEventosDia').classList.add('activo')

    const feriado = obtenerFeriado(fechaStr)
    const eventos = eventosDelMes
      .filter(e => e.fecha_evento === fechaStr)
      .sort((a, b) => (a.hora_evento || '').localeCompare(b.hora_evento || ''))

    let html = ''
    if (feriado) {
      html += `<div class="dash-feriado-label"><i class="ph ph-calendar-x"></i> Feriado: ${escaparHtml(feriado.nombre)}</div>`
    }

    if (eventos.length === 0) {
      if (feriado) {
        contenedor.innerHTML = html + '<div class="dash-empty">No hay eventos para esta fecha.</div>'
      } else {
        contenedor.innerHTML = '<div class="dash-empty">No hay eventos para esta fecha.</div>'
      }
      return
    }

    html += eventos.map(ev => {
      const horaTexto = ev.hora_evento ? formatearHora12h(ev.hora_evento) : ''
      const badgeClase = ev.completado ? 'finalizado' : 'programado'
      const badgeTexto = ev.completado ? 'Finalizado' : 'Programado'

      return `
        <div class="todos-eventos-item" data-evento-id="${ev.id}">
          <div class="todos-eventos-fecha">
            <span class="todos-eventos-dia">${horaTexto ? horaTexto.split(' ')[0] : '--'}</span>
            <span class="todos-eventos-mes">${horaTexto ? (horaTexto.includes('p.m.') ? 'PM' : 'AM') : ''}</span>
          </div>
          <div class="todos-eventos-info">
            <div class="todos-eventos-titulo">${escaparHtml(ev.titulo)}</div>
            <div class="todos-eventos-meta">
              ${ev.descripcion ? `<i class="ph ph-map-pin"></i>${escaparHtml(ev.descripcion)}` : ''}
              <span class="dash-evento-badge ${badgeClase}">${badgeTexto}</span>
            </div>
          </div>
        </div>
      `
    }).join('')

    contenedor.innerHTML = html
  }

  function cerrarModalEventosDia() {
    document.getElementById('modalEventosDia').classList.remove('activo')
  }

  function renderizarIndicadores() {
    const hoy = new Date().toISOString().split('T')[0]
    const docs = todosDocumentos

    const pendientes = docs.filter(d => d.tipo === 'emitido' && !d.estado_actual).length

    const derivadosHoy = docs.filter(d =>
      d.tipo === 'derivado' && d.created_at && d.created_at.startsWith(hoy)
    ).length

    const alta = docs.filter(d => d.prioridad === 'Alta' || d.prioridad === 'Urgente').length

    document.getElementById('indicPendientes').textContent = pendientes
    document.getElementById('indicDerivadosHoy').textContent = derivadosHoy
    document.getElementById('indicPrioridadAlta').textContent = alta
  }

  function escaparHtml(texto) {
    if (!texto) return ''
    const div = document.createElement('div')
    div.appendChild(document.createTextNode(texto))
    return div.innerHTML
  }

})()
