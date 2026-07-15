(function () {
  'use strict'

  let supabase
  let sesion = null
  let tabla = null
  let datePickerDesde = null
  let datePickerHasta = null
  let datePickerEditar = null
  let todosDocumentos = []
  let mapaPerfiles = {}
  let listaPerfiles = []
  let sortCol = null
  let sortDir = 'asc'
  let docActual = null
  let docEditando = null
  let docEliminando = null
  let archivosDocumentoActual = []
  let docsClasificados = {}
  let perfilFirmanteActual = null
  let wordBlobActual = null
  let pdfBlobActual = null
  let wordBlobUrl = null
  let pdfBlobUrl = null
  let vistaActual = 'documento'

  const TIPOS_DOCUMENTO = [
    { id: 'CARTA', nombre: 'CARTA N' },
    { id: 'MEMORANDUM', nombre: 'MEMORANDUM N' },
    { id: 'MEMORANDO_CIRCULAR', nombre: 'MEMORANDO CIRCULAR N' },
    { id: 'OFICIO', nombre: 'OFICIO N' },
    { id: 'SOLICITUD', nombre: 'SOLICITUD N' },
    { id: 'INFORME', nombre: 'INFORME N' },
    { id: 'NOTAS', nombre: 'NOTA N' },
    { id: 'NOTA_CIRCULAR', nombre: 'NOTA CIRCULAR N' },
  ]

  const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente']

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

    if (!await verificarAcceso('documentos')) return

    await Promise.all([
      cargarDocumentos(),
      cargarPerfiles(),
    ])

    inicializarFiltros()
    inicializarTabla()
    inicializarModalEventos()
    inicializarModalEditar()
    inicializarModalEliminar()
    aplicarFiltros()
  }

  /* --- DATOS --- */

  async function cargarDocumentos() {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[documentos] Error al cargar:', error)
      todosDocumentos = []
      return
    }

    todosDocumentos = data || []
  }

  async function cargarPerfiles() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, apellidos_completos')

    if (error) {
      console.error('[documentos] Error al cargar perfiles:', error)
      return
    }

    listaPerfiles = data || []
    mapaPerfiles = {}
    listaPerfiles.forEach((p) => {
      mapaPerfiles[p.id] = (p.nombre_completo || '') + ' ' + (p.apellidos_completos || '')
      mapaPerfiles[p.id] = mapaPerfiles[p.id].trim()
    })
  }

  function obtenerRemitente(doc) {
    return mapaPerfiles[doc.remitente_id] || '-'
  }

  function obtenerEstado(doc) {
    if (doc.tipo === 'emitido' && !doc.estado_actual) return 'Registrado'
    const mapa = {
      'DERIVADO': 'Derivado',
      'EN_REVISION': 'En proceso',
      'PENDIENTE': 'En proceso',
      'ATENDIDO': 'Finalizado',
      'OBSERVADO': 'Observado',
    }
    return mapa[doc.estado_actual] || '-'
  }

  function claseEstado(estado) {
    const mapa = {
      'Registrado': 'registrado',
      'Derivado': 'derivado',
      'En proceso': 'en-proceso',
      'Observado': 'observado',
      'Finalizado': 'finalizado',
    }
    return mapa[estado] || ''
  }

  function badgeEstado(estado) {
    const clase = claseEstado(estado)
    return '<span class="estado-badge ' + clase + '">' + estado + '</span>'
  }

  function badgePrioridad(prioridad) {
    const clase = (prioridad || '').toLowerCase()
    return '<span class="prioridad-badge ' + clase + '"><i class="ph ph-circle-fill"></i>' + (prioridad || '-') + '</span>'
  }

  /* --- FILTROS --- */

  function inicializarFiltros() {
    inicializarDesplegableTipoDoc()
    inicializarDesplegableOrigen()
    inicializarDatePickers()

    document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltros)
    document.getElementById('btnLimpiarFiltros').addEventListener('click', limpiarFiltros)

    document.getElementById('buscadorGeneral').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') aplicarFiltros()
    })
  }

  function inicializarDesplegableTipoDoc() {
    const dropdown = document.getElementById('dropdownFiltroTipoDoc')
    dropdown.innerHTML = ''

    const todas = document.createElement('div')
    todas.className = 'filtro-option seleccionada'
    todas.dataset.value = ''
    todas.textContent = 'Todos'
    dropdown.appendChild(todas)

    TIPOS_DOCUMENTO.forEach((td) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = td.id
      opt.textContent = td.nombre
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerFiltroTipoDoc')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperFiltroTipoDoc')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => wrapper.classList.toggle('abierto'))

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('abierto')
    })
  }

  function inicializarDesplegableOrigen() {
    const trigger = document.getElementById('triggerFiltroOrigen')
    const wrapper = document.getElementById('wrapperFiltroOrigen')
    const dropdown = document.getElementById('dropdownFiltroOrigen')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      trigger.querySelector('.filtro-select-text').textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => wrapper.classList.toggle('abierto'))

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('abierto')
    })
  }

  function inicializarDatePickers() {
    datePickerDesde = new DatePicker('filtroFechaDesde', {
      placeholder: 'dd/mm/aaaa',
      timezone: CONFIGURACION.formato.zonaHoraria,
    })
    datePickerDesde.limpiar()

    datePickerHasta = new DatePicker('filtroFechaHasta', {
      placeholder: 'dd/mm/aaaa',
      timezone: CONFIGURACION.formato.zonaHoraria,
    })
    datePickerHasta.limpiar()
  }

  function aplicarFiltros() {
    sortCol = null
    sortDir = 'asc'
    _ejecutarFiltros()
  }

  function _ejecutarFiltros() {
    const busqueda = document.getElementById('buscadorGeneral').value.trim().toLowerCase()
    const tipoDoc = document.getElementById('triggerFiltroTipoDoc').dataset.value || ''
    const origen = document.getElementById('triggerFiltroOrigen').dataset.value || ''
    const fechaDesde = datePickerDesde ? datePickerDesde.obtenerValor() : ''
    const fechaHasta = datePickerHasta ? datePickerHasta.obtenerValor() : ''

    let filtrados = [...todosDocumentos]

    if (busqueda) {
      filtrados = filtrados.filter((d) => {
        const remitente = obtenerRemitente(d).toLowerCase()
        const num = (d.numero_documento || '').toLowerCase()
        const asunto = (d.asunto || '').toLowerCase()
        return num.includes(busqueda) || remitente.includes(busqueda) || asunto.includes(busqueda)
      })
    }

    if (tipoDoc) {
      filtrados = filtrados.filter((d) => d.tipo_documento === tipoDoc)
    }

    if (origen) {
      filtrados = filtrados.filter((d) => d.tipo === origen)
    }

    if (fechaDesde) {
      filtrados = filtrados.filter((d) => (d.fecha || '') >= fechaDesde)
    }

    if (fechaHasta) {
      filtrados = filtrados.filter((d) => (d.fecha || '') <= fechaHasta)
    }

    if (sortCol === 'numero_documento') {
      filtrados.sort((a, b) => {
        const va = (a.numero_documento || '').toLowerCase()
        const vb = (b.numero_documento || '').toLowerCase()
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    } else if (sortCol === 'fecha') {
      filtrados.sort((a, b) => {
        const va = a.fecha || ''
        const vb = b.fecha || ''
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    }

    tabla.actualizar(filtrados)
    _actualizarSortIndicators()

    const contenedor = document.getElementById('contenedorTabla')
    const tablaVacia = contenedor.querySelector('.tabla-vacia')
    if (filtrados.length === 0 && !tablaVacia) {
      const vacio = document.createElement('div')
      vacio.className = 'tabla-vacia'
      vacio.innerHTML = '<div class="tabla-vacia-icono"><i class="ph ph-file-search"></i></div><h3>No hay documentos registrados</h3><p>Los tramites que se generen desde el modulo "Registrar tramite" apareceran automaticamente aqui para su consulta y seguimiento.</p>'
      tabla.obtenerElemento().querySelector('.tabla-wrapper').after(vacio)
    } else if (filtrados.length > 0 && tablaVacia) {
      tablaVacia.remove()
    }
  }

  function limpiarFiltros() {
    document.getElementById('buscadorGeneral').value = ''

    const triggerTipo = document.getElementById('triggerFiltroTipoDoc')
    triggerTipo.querySelector('.filtro-select-text').textContent = 'Todos'
    delete triggerTipo.dataset.value
    document.getElementById('dropdownFiltroTipoDoc').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
    const optTodos = document.querySelector('#dropdownFiltroTipoDoc .filtro-option[data-value=""]')
    if (optTodos) optTodos.classList.add('seleccionada')

    const triggerOri = document.getElementById('triggerFiltroOrigen')
    triggerOri.querySelector('.filtro-select-text').textContent = 'Todos'
    delete triggerOri.dataset.value
    document.getElementById('dropdownFiltroOrigen').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
    const optTodosOri = document.querySelector('#dropdownFiltroOrigen .filtro-option[data-value=""]')
    if (optTodosOri) optTodosOri.classList.add('seleccionada')

    if (datePickerDesde) datePickerDesde.limpiar()
    if (datePickerHasta) datePickerHasta.limpiar()

    sortCol = null
    sortDir = 'asc'

    aplicarFiltros()
  }

  /* --- TABLA --- */

  function inicializarTabla() {
    tabla = new Tabla({
      paginacion: true,
      headerHTML: ' ',
      elementosPorPagina: CONFIGURACION.paginacion?.elementosPorPagina || 20,
      columnas: [
        {
          titulo: 'N Documento',
          clave: 'numero_documento',
          render: (valor) => valor || '-',
        },
        {
          titulo: 'Tipo',
          clave: 'tipo_documento',
          render: (valor) => {
            const encontrado = TIPOS_DOCUMENTO.find((t) => t.id === valor)
            return encontrado ? encontrado.nombre : (valor || '-')
          },
        },
        {
          titulo: 'Remitente',
          clave: 'remitente_id',
          render: (valor) => mapaPerfiles[valor] || '-',
        },
        { titulo: 'Destinatario', clave: 'destinatario', render: (v) => v || '-' },
        {
          titulo: 'Fecha',
          clave: 'fecha',
          render: (v) => v || '-',
        },
        {
          titulo: 'Estado',
          clave: 'estado_actual',
          render: (valor, fila) => badgeEstado(obtenerEstado(fila)),
        },
        {
          titulo: 'Prioridad',
          clave: 'prioridad',
          render: (valor) => badgePrioridad(valor),
        },
        {
          titulo: 'Acciones',
          clave: 'id',
          render: (valor, fila) => '<div class="acciones-tabla"><button class="accion-ver" data-accion="ver-detalle" data-id="' + fila.id + '" title="Ver detalle"><i class="ph ph-eye"></i></button><button class="accion-editar" data-accion="editar" data-id="' + fila.id + '" title="Editar documento"><i class="ph ph-pencil-simple"></i></button><button class="accion-eliminar" data-accion="eliminar" data-id="' + fila.id + '" title="Eliminar documento"><i class="ph ph-trash"></i></button></div>',
        },
      ],
    })

    const contenedor = document.getElementById('contenedorTabla')
    contenedor.innerHTML = ''
    contenedor.appendChild(tabla.obtenerElemento())

    contenedor.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-accion]')
      if (!btn) return
      const id = btn.dataset.id
      const accion = btn.dataset.accion

      if (accion === 'ver-detalle') abrirDetalle(id)
      else if (accion === 'editar') abrirEditar(id)
      else if (accion === 'eliminar') abrirEliminar(id)
    })

    inicializarSort()
  }

  function inicializarSort() {
    const thead = document.querySelector('.tabla thead tr')
    if (!thead) return

    const ths = thead.querySelectorAll('th')
    const sortIndices = { 0: 'numero_documento', 4: 'fecha' }

    ths.forEach((th, i) => {
      const colKey = sortIndices[i]
      if (!colKey) return

      th.classList.add('sortable-th')
      const icon = document.createElement('span')
      icon.className = 'sort-icon'
      icon.textContent = '↕'
      th.appendChild(icon)

      th.addEventListener('click', () => {
        if (sortCol === colKey) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc'
        } else {
          sortCol = colKey
          sortDir = 'asc'
        }
        _ejecutarFiltros()
      })
    })
  }

  function _actualizarSortIndicators() {
    document.querySelectorAll('.tabla thead .sort-icon').forEach((icon) => {
      icon.classList.remove('activo')
      icon.textContent = '↕'
    })

    if (!sortCol) return

    const thead = document.querySelector('.tabla thead tr')
    if (!thead) return

    const sortIndices = { 0: 'numero_documento', 4: 'fecha' }
    thead.querySelectorAll('th').forEach((th, i) => {
      if (sortIndices[i] === sortCol) {
        const icon = th.querySelector('.sort-icon')
        if (icon) {
          icon.classList.add('activo')
          icon.textContent = sortDir === 'asc' ? '↑' : '↓'
        }
      }
    })
  }

  /* ============================================
     MODAL - DETALLE DEL DOCUMENTO
     ============================================ */

  function inicializarModalEventos() {
    document.getElementById('btnCerrarDetalle').addEventListener('click', cerrarDetalle)
    document.getElementById('btnCerrarDetalleBottom').addEventListener('click', cerrarDetalle)

    document.getElementById('modalDetalleDocumento').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) cerrarDetalle()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('modalDetalleDocumento').classList.contains('activo')) {
        cerrarDetalle()
      }
    })

    document.getElementById('btnVerPDF').addEventListener('click', () => cambiarVista('documento'))
    document.getElementById('btnVerAdjunto').addEventListener('click', () => cambiarVista('adjunto'))

    document.getElementById('btnDescargarPDF').addEventListener('click', descargarPDF)
    document.getElementById('btnDescargarWord').addEventListener('click', descargarWord)
    document.getElementById('btnDescargarAdjunto').addEventListener('click', descargarAdjunto)
  }

  async function abrirDetalle(id) {
    docActual = todosDocumentos.find((d) => d.id === id)
    if (!docActual) return

    vistaActual = 'documento'

    const visor = document.getElementById('visorDocumento')
    visor.innerHTML = '<div class="visor-placeholder" id="visorPlaceholder"><i class="ph ph-spinner" style="font-size:2.5rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite;"></i><p>Generando documento...</p></div>'

    document.getElementById('modalDetalleDocumento').classList.add('activo')
    document.body.style.overflow = 'hidden'

    const { data: archivos, error } = await supabase
      .from('documentos_archivos')
      .select('*')
      .eq('documento_id', id)

    archivosDocumentoActual = error ? [] : (archivos || [])
    docsClasificados = clasificarArchivos(archivosDocumentoActual)

    const idFirmante = docActual.firmante_id || docActual.remitente_id

    let firmaUrl = null
    perfilFirmanteActual = null
    if (idFirmante) {
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('firma_url, nombre_completo, apellidos_completos')
        .eq('id', idFirmante)
        .single()
      perfilFirmanteActual = perfil || null
      firmaUrl = perfil?.firma_url || null
    }

    const tipoObj = TIPOS_DOCUMENTO.find((t) => t.id === docActual.tipo_documento)
    try {
      wordBlobActual = await window.generarWordBlob({
        tipo_documento: tipoObj ? tipoObj.nombre : (docActual.tipo_documento || ''),
        numero_documento: docActual.numero_documento || '',
        fecha: docActual.fecha || '',
        destinatario: docActual.destinatario || '',
        cargo: docActual.cargo_destinatario || '',
        asunto: docActual.asunto || '',
        cuerpo: docActual.cuerpo_documento || '',
        firma_url: firmaUrl,
      })
    } catch (err) {
      console.error('[documentos] Error al generar Word:', err)
      wordBlobActual = null
    }

    llenarInfo(docActual)
    configurarBotones()

    if (wordBlobActual) {
      await generarPDFInstitucional(docActual, perfilFirmanteActual)
    } else {
      mostrarPlaceholder('No se pudo generar el documento base. Verifique los datos del tramite.')
    }

    activarBotonVisualizacion('documento')
  }

  function cerrarDetalle() {
    document.getElementById('modalDetalleDocumento').classList.remove('activo')
    document.body.style.overflow = ''

    const visor = document.getElementById('visorDocumento')
    const iframe = visor.querySelector('iframe')
    if (iframe) {
      iframe.src = ''
    }
    visor.innerHTML = '<div class="visor-placeholder" id="visorPlaceholder"><i class="ph ph-file-text" style="font-size:3rem;display:block;margin-bottom:12px;"></i><p>Cargando documento...</p></div>'

    if (wordBlobUrl) { URL.revokeObjectURL(wordBlobUrl); wordBlobUrl = null }
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); pdfBlobUrl = null }

    vistaActual = 'documento'
    perfilFirmanteActual = null
    wordBlobActual = null
    pdfBlobActual = null
    docActual = null
    archivosDocumentoActual = []
    docsClasificados = {}
  }

  function clasificarArchivos(archivos) {
    const res = { word: null, pdf: null, imagen: null, otro: null }
    archivos.forEach((a) => {
      const t = a.tipo_archivo
      if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        res.word = a
      } else if (t === 'application/pdf') {
        res.pdf = a
      } else if (t.startsWith('image/')) {
        res.imagen = a
      } else {
        res.otro = a
      }
    })
    return res
  }

  function llenarInfo(doc) {
    document.getElementById('infoNumDoc').textContent = doc.numero_documento || '-'
    document.getElementById('infoAsunto').textContent = doc.asunto || '-'
    document.getElementById('infoEstado').innerHTML = badgeEstado(obtenerEstado(doc))
    document.getElementById('infoPrioridad').innerHTML = badgePrioridad(doc.prioridad)
    document.getElementById('infoFecha').textContent = doc.fecha || '-'
    document.getElementById('infoRemitente').textContent = obtenerRemitente(doc)
    const idFirmante = doc.firmante_id || doc.remitente_id
    document.getElementById('infoFirmante').textContent = mapaPerfiles[idFirmante] || '-'
    document.getElementById('infoDestinatario').textContent = doc.destinatario || '-'
  }

  function configurarBotones() {
    const c = docsClasificados

    const btnVerPDF = document.getElementById('btnVerPDF')
    btnVerPDF.disabled = false
    btnVerPDF.title = 'Ver documento generado'

    const btnDescargarPDF = document.getElementById('btnDescargarPDF')
    btnDescargarPDF.disabled = false
    btnDescargarPDF.title = 'Descargar documento final en PDF'

    const btnDescargarWord = document.getElementById('btnDescargarWord')
    btnDescargarWord.disabled = false
    btnDescargarWord.title = 'Descargar documento Word'

    const tieneAdjunto = !!(c.pdf || c.imagen || c.otro)
    const btnVerAdjunto = document.getElementById('btnVerAdjunto')
    btnVerAdjunto.disabled = !tieneAdjunto
    btnVerAdjunto.title = tieneAdjunto ? 'Ver adjunto' : 'Sin adjuntos'

    const btnDescargarAdjunto = document.getElementById('btnDescargarAdjunto')
    btnDescargarAdjunto.disabled = !tieneAdjunto
    btnDescargarAdjunto.title = tieneAdjunto ? 'Descargar adjunto' : 'No disponible'
  }

  function activarBotonVisualizacion(vista) {
    document.querySelectorAll('.btn-visualizacion').forEach((b) => b.classList.remove('activo'))
    const btn = document.querySelector('.btn-visualizacion[data-vista="' + vista + '"]')
    if (btn) btn.classList.add('activo')
  }

  /* --- CONVERSION Y RENDERIZADO PDF --- */

  function formatearFechaLarga(f) {
    if (!f) return ''
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const p = f.split('-')
    if (p.length !== 3) return f
    return parseInt(p[2], 10) + ' de ' + meses[parseInt(p[1], 10) - 1] + ' del ' + p[0]
  }

  async function generarPDFInstitucional(doc, perfil) {
    const visor = document.getElementById('visorDocumento')

    if (vistaActual !== 'documento') return

    visor.innerHTML = '<div class="visor-placeholder" id="visorPlaceholder"><i class="ph ph-spinner" style="font-size:2.5rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite;"></i><p>Generando PDF Institucional...</p></div>'

    try {
      if (!window.jspdf) throw new Error('jsPDF no esta cargado')
      const { jsPDF } = window.jspdf
      const pdf = new jsPDF('p', 'mm', 'a4')
      const mIzq = 27, mDer = 27, anchoUtil = 210 - mIzq - mDer

      try {
        const resp = await fetch('assets/imagenes/Logo.jpg')
        if (resp.ok) {
          const blobLogo = await resp.blob()
          const logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(blobLogo)
          })
          pdf.addImage(logoBase64, 'JPEG', mIzq, 10, 22, 22)
        }
      } catch (e) {
        console.warn('No se pudo cargar el logo para PDF:', e)
      }

      pdf.setFont('helvetica', 'italic')
      pdf.setFontSize(9)
      pdf.setTextColor(80)
      pdf.text('"Ano de la recuperacion y consolidacion de la economia peruana"', 105, 18, { align: 'center' })

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      pdf.setTextColor(0)
      pdf.text('Chincha, ' + formatearFechaLarga(doc.fecha), 210 - mDer, 48, { align: 'right' })

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      const tipoObj = TIPOS_DOCUMENTO.find((t) => t.id === doc.tipo_documento)
      const nombreTipo = tipoObj ? tipoObj.nombre : (doc.tipo_documento || '')
      const tit = nombreTipo + ' ' + doc.numero_documento
      pdf.text(tit, mIzq, 62)
      pdf.setLineWidth(0.5)
      pdf.line(mIzq, 63.5, mIzq + pdf.getTextWidth(tit), 63.5)

      let y = 75
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      pdf.text('Senor', mIzq, y)
      pdf.text(':', 50, y)
      pdf.text((doc.destinatario || '').toUpperCase(), 58, y)

      if (doc.cargo_destinatario) {
        y += 6
        pdf.setFont('helvetica', 'bold')
        pdf.text((doc.cargo_destinatario || '').toUpperCase(), 58, y)
      }

      y += 14
      pdf.setFont('helvetica', 'normal')
      pdf.text('Asunto', mIzq, y)
      pdf.text(':', 50, y)
      const asuntoLines = pdf.splitTextToSize((doc.asunto || '').toUpperCase(), anchoUtil - 31)
      pdf.text(asuntoLines, 58, y)
      y += asuntoLines.length * 6

      y += 8
      pdf.setDrawColor(180)
      pdf.setLineWidth(0.3)
      pdf.line(mIzq, y, 210 - mDer, y)
      y += 12

      pdf.setFont('helvetica', 'normal')
      const bodyLines = pdf.splitTextToSize((doc.cuerpo_documento || ''), anchoUtil)
      pdf.text(bodyLines, mIzq, y, { align: 'justify', maxWidth: anchoUtil })
      y += bodyLines.length * 6

      const descLower = (doc.cuerpo_documento || '').toLowerCase()
      if (!descLower.includes('atentamente')) {
        y += 18
        pdf.text('Atentamente,', mIzq, y)
      }
      y += 12

      if (perfil && perfil.firma_url) {
        try {
          const firmaImg = new Image()
          if (!perfil.firma_url.startsWith('data:')) {
            firmaImg.crossOrigin = 'anonymous'
          }
          firmaImg.src = perfil.firma_url
          await new Promise((r, j) => { firmaImg.onload = r; firmaImg.onerror = j })
          if (y + 30 > 280) { pdf.addPage(); y = 20 }
          pdf.addImage(firmaImg, 'PNG', mIzq, y, 40, 20)
          y += 22
        } catch (fe) {
          console.warn('No se pudo cargar firma en PDF:', fe)
        }
      } else {
        y += 22
      }

      if (perfil) {
        const nombreFinal = perfil.nombre_completo || perfil.apellidos_completos || ''
        if (nombreFinal) {
          if (y + 15 > 280) { pdf.addPage(); y = 20 }
          y += 4
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(10)
          pdf.text('_________________________', mIzq, y)
          y += 5
          pdf.text(nombreFinal.toUpperCase(), mIzq, y)
        }
      }

      pdfBlobActual = pdf.output('blob')
      mostrarPdfEnVisor(pdfBlobActual)

      const btnDescargarPDF = document.getElementById('btnDescargarPDF')
      btnDescargarPDF.disabled = false
      btnDescargarPDF.title = 'Descargar documento final en PDF'

    } catch (err) {
      console.error('[documentos] Error al generar PDF con jsPDF:', err)
      if (vistaActual !== 'documento') return

      visor.innerHTML = '<div class="visor-placeholder"><i class="ph ph-warning" style="font-size:3rem;display:block;margin-bottom:12px;color:var(--color-error)"></i><p>No se pudo generar el PDF final.</p></div>'

      const btnDescargarPDF = document.getElementById('btnDescargarPDF')
      btnDescargarPDF.disabled = true
      btnDescargarPDF.title = 'PDF no disponible'
    }
  }

  function mostrarPdfEnVisor(blobPdf) {
    const visor = document.getElementById('visorDocumento')
    if (vistaActual !== 'documento') return

    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    pdfBlobUrl = URL.createObjectURL(blobPdf)

    visor.innerHTML = '<iframe src="' + pdfBlobUrl + '#view=FitH" type="application/pdf" style="width:100%; height:100%; border:none; border-radius:8px;"></iframe>'
  }

  async function mostrarEnVisor(ruta, tipo) {
    const visor = document.getElementById('visorDocumento')

    if (tipo === 'imagen') {
      const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(ruta)
      if (vistaActual !== 'adjunto') return
      visor.innerHTML = '<img src="' + publicUrl + '" alt="Vista previa del adjunto" />'
      return
    }

    try {
      const { data } = await supabase.storage.from('documentos').download(ruta)
      if (!data) throw new Error('Sin datos')
      if (vistaActual !== 'adjunto') return
      const blobUrl = URL.createObjectURL(data)
      visor.innerHTML = '<iframe src="' + blobUrl + '" type="application/pdf"></iframe>'
    } catch {
      const { data: { publicUrl } } = supabase.storage.from('documentos').getPublicUrl(ruta)
      if (vistaActual !== 'adjunto') return
      visor.innerHTML = '<iframe src="' + publicUrl + '" type="application/pdf"></iframe>'
    }
  }

  function mostrarPlaceholder(mensaje) {
    const visor = document.getElementById('visorDocumento')
    visor.innerHTML = '<div class="visor-placeholder"><i class="ph ph-file-x" style="font-size:3rem;display:block;margin-bottom:12px;"></i><p>' + escaparHtml(mensaje) + '</p></div>'
  }

  async function cambiarVista(vista) {
    vistaActual = vista
    activarBotonVisualizacion(vista)

    if (vista === 'documento') {
      if (pdfBlobActual) {
        mostrarPdfEnVisor(pdfBlobActual)
      } else if (wordBlobActual) {
        await generarPDFInstitucional(docActual, perfilFirmanteActual)
      } else {
        if (vistaActual !== 'documento') return
        mostrarPlaceholder('No hay documento disponible.')
      }

    } else if (vista === 'adjunto') {
      const c = docsClasificados
      const adjunto = c.imagen || c.pdf || c.otro
      if (!adjunto) return

      const visor = document.getElementById('visorDocumento')
      visor.innerHTML = '<div class="visor-placeholder"><i class="ph ph-spinner" style="font-size:2rem;display:block;margin-bottom:12px;animation:spin 1s linear infinite;"></i><p>Cargando adjunto...</p></div>'

      if (adjunto.tipo_archivo && adjunto.tipo_archivo.startsWith('image/')) {
        await mostrarEnVisor(adjunto.ruta_archivo, 'imagen')
      } else if (adjunto.tipo_archivo === 'application/pdf') {
        await mostrarEnVisor(adjunto.ruta_archivo, 'pdf')
      } else {
        if (vistaActual !== 'adjunto') return
        const visorEl = document.getElementById('visorDocumento')
        visorEl.innerHTML = '<div class="visor-placeholder"><i class="ph ph-file" style="font-size:3rem;display:block;margin-bottom:12px;"></i><p>Este archivo no puede visualizarse. Use "Descargar adjunto".</p></div>'
      }
    }
  }

  async function descargarArchivo(archivo, nombreDescarga) {
    if (!archivo) return

    const nombre = nombreDescarga || archivo.nombre_archivo

    try {
      const { data } = await supabase.storage.from('documentos').download(archivo.ruta_archivo)
      if (!data) throw new Error('Sin datos')
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      window.open(archivo.url_archivo, '_blank')
    }
  }

  async function descargarPDF() {
    if (!pdfBlobActual) {
      alert('El archivo PDF no esta disponible. Verifique si se genero correctamente en la vista previa.')
      return
    }

    const numDoc = docActual?.numero_documento || 'documento'
    const tipoId = docActual?.tipo_documento || 'DOC'
    const nombreArchivo = tipoId + '_' + numDoc + '.pdf'

    const url = URL.createObjectURL(pdfBlobActual)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  function descargarWord() {
    if (!wordBlobActual) return
    const numDoc = docActual?.numero_documento || 'documento'
    const tipoId = docActual?.tipo_documento || 'DOC'
    const nombreArchivo = tipoId + '_' + numDoc + '.docx'
    const url = URL.createObjectURL(wordBlobActual)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  function descargarAdjunto() {
    const adjunto = docsClasificados.imagen || docsClasificados.pdf || docsClasificados.otro
    descargarArchivo(adjunto)
  }

  /* ============================================
     MODAL - EDITAR DOCUMENTO
     ============================================ */

  function inicializarModalEditar() {
    document.getElementById('btnCerrarEditar').addEventListener('click', cerrarEditar)
    document.getElementById('btnCancelarEditar').addEventListener('click', cerrarEditar)

    document.getElementById('modalEditarDocumento').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) cerrarEditar()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('modalEditarDocumento').classList.contains('activo')) {
        cerrarEditar()
      }
    })

    document.getElementById('btnGuardarEditar').addEventListener('click', guardarEdicion)

    inicializarDropdownEditarTipoDoc()
    inicializarDropdownEditarPrioridad()
    inicializarDropdownEditarFirmante()

    datePickerEditar = new DatePicker('editarFecha', {
      placeholder: 'dd/mm/aaaa',
      timezone: CONFIGURACION.formato.zonaHoraria,
    })
  }

  function inicializarDropdownEditarTipoDoc() {
    const dropdown = document.getElementById('dropdownEditarTipoDoc')
    dropdown.innerHTML = ''

    const placeholder = document.createElement('div')
    placeholder.className = 'filtro-option seleccionada'
    placeholder.dataset.value = ''
    placeholder.textContent = 'Seleccione un tipo'
    dropdown.appendChild(placeholder)

    TIPOS_DOCUMENTO.forEach((td) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = td.id
      opt.textContent = td.nombre
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerEditarTipoDoc')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperEditarTipoDoc')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return
      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => wrapper.classList.toggle('abierto'))
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('abierto')
    })
  }

  function inicializarDropdownEditarPrioridad() {
    const dropdown = document.getElementById('dropdownEditarPrioridad')
    const trigger = document.getElementById('triggerEditarPrioridad')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperEditarPrioridad')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return
      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => wrapper.classList.toggle('abierto'))
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('abierto')
    })
  }

  function inicializarDropdownEditarFirmante() {
    const dropdown = document.getElementById('dropdownEditarFirmante')
    dropdown.innerHTML = ''

    const placeholder = document.createElement('div')
    placeholder.className = 'filtro-option seleccionada'
    placeholder.dataset.value = ''
    placeholder.textContent = 'Seleccione un firmante'
    dropdown.appendChild(placeholder)

    listaPerfiles.forEach((p) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = p.id
      opt.textContent = mapaPerfiles[p.id]
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerEditarFirmante')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperEditarFirmante')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return
      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => wrapper.classList.toggle('abierto'))
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('abierto')
    })
  }

  function abrirEditar(id) {
    docEditando = todosDocumentos.find((d) => d.id === id)
    if (!docEditando) return

    if (docEditando.tipo !== 'emitido') {
      mostrarToast('Solo se pueden editar documentos emitidos', 'warning')
      return
    }

    document.getElementById('editarId').value = docEditando.id
    document.getElementById('editarNumero').value = docEditando.numero_documento || ''
    document.getElementById('editarDestinatario').value = docEditando.destinatario || ''
    document.getElementById('editarCargo').value = docEditando.cargo_destinatario || ''
    document.getElementById('editarAsunto').value = docEditando.asunto || ''
    document.getElementById('editarCuerpo').value = docEditando.cuerpo_documento || ''

    document.getElementById('editarSubtitulo').textContent = 'Editando: ' + (docEditando.numero_documento || 'Documento')

    if (datePickerEditar) {
      datePickerEditar.establecerValor(docEditando.fecha || '')
    }

    const triggerTipo = document.getElementById('triggerEditarTipoDoc')
    const tipoEncontrado = TIPOS_DOCUMENTO.find((t) => t.id === docEditando.tipo_documento)
    if (tipoEncontrado) {
      triggerTipo.querySelector('.filtro-select-text').textContent = tipoEncontrado.nombre
      triggerTipo.dataset.value = tipoEncontrado.id
      document.getElementById('dropdownEditarTipoDoc').querySelectorAll('.filtro-option').forEach((o) => {
        o.classList.toggle('seleccionada', o.dataset.value === tipoEncontrado.id)
      })
    }

    const triggerPrioridad = document.getElementById('triggerEditarPrioridad')
    const prioridad = docEditando.prioridad || 'Media'
    triggerPrioridad.querySelector('.filtro-select-text').textContent = prioridad
    triggerPrioridad.dataset.value = prioridad
    document.getElementById('dropdownEditarPrioridad').querySelectorAll('.filtro-option').forEach((o) => {
      o.classList.toggle('seleccionada', o.dataset.value === prioridad)
    })

    const triggerFirmante = document.getElementById('triggerEditarFirmante')
    const firmanteId = docEditando.firmante_id || docEditando.remitente_id || ''
    if (firmanteId && mapaPerfiles[firmanteId]) {
      triggerFirmante.querySelector('.filtro-select-text').textContent = mapaPerfiles[firmanteId]
      triggerFirmante.dataset.value = firmanteId
      document.getElementById('dropdownEditarFirmante').querySelectorAll('.filtro-option').forEach((o) => {
        o.classList.toggle('seleccionada', o.dataset.value === firmanteId)
      })
    }

    limpiarErroresEditar()

    document.getElementById('modalEditarDocumento').classList.add('activo')
    document.body.style.overflow = 'hidden'
  }

  function cerrarEditar() {
    document.getElementById('modalEditarDocumento').classList.remove('activo')
    document.body.style.overflow = ''
    docEditando = null
    limpiarErroresEditar()
  }

  function limpiarErroresEditar() {
    document.getElementById('errorEditarAsunto').textContent = ''
    document.getElementById('errorEditarCuerpo').textContent = ''
    document.getElementById('errorEditarAsunto').style.display = 'none'
    document.getElementById('errorEditarCuerpo').style.display = 'none'
  }

  function validarEdicion() {
    let valido = true
    limpiarErroresEditar()

    const asunto = document.getElementById('editarAsunto').value.trim()
    const cuerpo = document.getElementById('editarCuerpo').value.trim()

    if (!asunto) {
      document.getElementById('errorEditarAsunto').textContent = 'El asunto es obligatorio'
      document.getElementById('errorEditarAsunto').style.display = 'block'
      valido = false
    }

    if (!cuerpo) {
      document.getElementById('errorEditarCuerpo').textContent = 'El cuerpo del documento es obligatorio'
      document.getElementById('errorEditarCuerpo').style.display = 'block'
      valido = false
    }

    return valido
  }

  async function guardarEdicion() {
    if (!docEditando) return
    if (!validarEdicion()) return

    const btnGuardar = document.getElementById('btnGuardarEditar')
    const spinner = document.getElementById('spinnerEditar')
    const texto = document.getElementById('textoGuardarEditar')

    btnGuardar.disabled = true
    spinner.style.display = 'inline-block'
    texto.textContent = 'Guardando...'

    try {
      const datosActualizar = {
        tipo_documento: document.getElementById('triggerEditarTipoDoc').dataset.value || docEditando.tipo_documento,
        numero_documento: document.getElementById('editarNumero').value.trim(),
        fecha: datePickerEditar ? datePickerEditar.obtenerValor() : docEditando.fecha,
        prioridad: document.getElementById('triggerEditarPrioridad').dataset.value || docEditando.prioridad,
        firmante_id: document.getElementById('triggerEditarFirmante').dataset.value || docEditando.firmante_id,
        destinatario: document.getElementById('editarDestinatario').value.trim(),
        cargo_destinatario: document.getElementById('editarCargo').value.trim(),
        asunto: document.getElementById('editarAsunto').value.trim(),
        cuerpo_documento: document.getElementById('editarCuerpo').value.trim(),
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('documentos')
        .update(datosActualizar)
        .eq('id', docEditando.id)

      if (error) {
        console.error('[documentos] Error al actualizar:', error)
        mostrarToast('Error al guardar los cambios: ' + error.message, 'error')
        return
      }

      Object.assign(docEditando, datosActualizar)

      const idx = todosDocumentos.findIndex((d) => d.id === docEditando.id)
      if (idx !== -1) {
        todosDocumentos[idx] = { ...todosDocumentos[idx], ...datosActualizar }
      }

      _ejecutarFiltros()
      cerrarEditar()
      mostrarToast('Documento actualizado correctamente', 'success')

    } catch (err) {
      console.error('[documentos] Error inesperado al editar:', err)
      mostrarToast('Error inesperado al guardar', 'error')
    } finally {
      btnGuardar.disabled = false
      spinner.style.display = 'none'
      texto.textContent = 'Guardar Cambios'
    }
  }

  /* ============================================
     MODAL - ELIMINAR DOCUMENTO
     ============================================ */

  function inicializarModalEliminar() {
    document.getElementById('btnCancelarEliminar').addEventListener('click', cerrarEliminar)

    document.getElementById('modalEliminarDocumento').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) cerrarEliminar()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('modalEliminarDocumento').classList.contains('activo')) {
        cerrarEliminar()
      }
    })

    document.getElementById('btnConfirmarEliminar').addEventListener('click', confirmarEliminar)

    document.getElementById('eliminarConfirmarInput').addEventListener('input', (e) => {
      const btn = document.getElementById('btnConfirmarEliminar')
      btn.disabled = e.target.value.trim() !== 'ELIMINAR'
    })
  }

  function abrirEliminar(id) {
    docEliminando = todosDocumentos.find((d) => d.id === id)
    if (!docEliminando) return

    document.getElementById('eliminarMensaje').textContent = 'Se eliminara permanentemente el documento ' + (docEliminando.numero_documento || '') + '. Esta accion no se puede deshacer.'
    document.getElementById('eliminarConfirmarInput').value = ''
    document.getElementById('errorEliminarConfirmar').textContent = ''
    document.getElementById('btnConfirmarEliminar').disabled = true

    document.getElementById('modalEliminarDocumento').classList.add('activo')
    document.body.style.overflow = 'hidden'
    document.getElementById('eliminarConfirmarInput').focus()
  }

  function cerrarEliminar() {
    document.getElementById('modalEliminarDocumento').classList.remove('activo')
    document.body.style.overflow = ''
    docEliminando = null
  }

  async function confirmarEliminar() {
    if (!docEliminando) return

    const confirmacion = document.getElementById('eliminarConfirmarInput').value.trim()
    if (confirmacion !== 'ELIMINAR') {
      document.getElementById('errorEliminarConfirmar').textContent = 'Debe escribir ELIMINAR para confirmar'
      return
    }

    const btnConfirmar = document.getElementById('btnConfirmarEliminar')
    const spinner = document.getElementById('spinnerEliminar')
    const texto = document.getElementById('textoConfirmarEliminar')

    btnConfirmar.disabled = true
    spinner.style.display = 'inline-block'
    texto.textContent = 'Eliminando...'

    try {
      const { error: errorArchivos } = await supabase
        .from('documentos_archivos')
        .delete()
        .eq('documento_id', docEliminando.id)

      if (errorArchivos) {
        console.warn('[documentos] Error al eliminar archivos adjuntos:', errorArchivos)
      }

      const { error } = await supabase
        .from('documentos')
        .delete()
        .eq('id', docEliminando.id)

      if (error) {
        console.error('[documentos] Error al eliminar:', error)
        mostrarToast('Error al eliminar el documento: ' + error.message, 'error')
        return
      }

      todosDocumentos = todosDocumentos.filter((d) => d.id !== docEliminando.id)
      _ejecutarFiltros()
      cerrarEliminar()
      mostrarToast('Documento eliminado correctamente', 'success')

    } catch (err) {
      console.error('[documentos] Error inesperado al eliminar:', err)
      mostrarToast('Error inesperado al eliminar', 'error')
    } finally {
      btnConfirmar.disabled = false
      spinner.style.display = 'none'
      texto.textContent = 'Eliminar Documento'
    }
  }

  /* ============================================
     TOAST NOTIFICACIONES
     ============================================ */

  function mostrarToast(mensaje, tipo) {
    const contenedor = document.getElementById('toastContenedor')
    const toast = document.createElement('div')
    toast.className = 'toast toast-' + tipo

    const iconos = {
      success: 'ph-check-circle',
      error: 'ph-x-circle',
      warning: 'ph-warning-circle',
      info: 'ph-info',
    }

    toast.innerHTML = '<i class="ph ' + (iconos[tipo] || 'ph-info') + '"></i><span>' + escaparHtml(mensaje) + '</span>'

    contenedor.appendChild(toast)

    requestAnimationFrame(() => {
      toast.classList.add('toast-visible')
    })

    setTimeout(() => {
      toast.classList.remove('toast-visible')
      setTimeout(() => toast.remove(), 300)
    }, 4000)
  }

  function escaparHtml(texto) {
    const div = document.createElement('div')
    div.textContent = texto
    return div.innerHTML
  }
})()