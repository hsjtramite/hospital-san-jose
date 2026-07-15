(function () {
  'use strict'

  /* ════════════════════════════════════════════
     ESTADO GLOBAL
     ════════════════════════════════════════════ */
  let supabase
  let sesion = null
  let perfilActual = null
  let articulos = []
  let articulosSeleccionadosCargo = []
  let editandoArticuloId = null
  let datosImportacionPreview = []

  const CATEGORIAS_PREDEFINIDAS = [
    'Útiles de Oficina', 'Material de Limpieza', 'Material de Impresión',
    'Equipos de Cómputo', 'Papelería', 'Archivamiento', 'Otros'
  ]
  const UNIDADES_PREDEFINIDAS = [
    'Unidad', 'Caja', 'Paquete', 'Resma', 'Millar', 'Docena', 'Bolsa', 'Sobre', 'Juego', 'Kit'
  ]

  /* Referencias a tablas (Tabla class) */
  let tablaCatalogo = null
  let tablaCargos = null
  let tablaKardex = null
  let ingresoInicializado = false
  let descontarInicializado = false
  let panelArticuloInicializado = false

  /* ════════════════════════════════════════════
     INICIALIZACIÓN
     ════════════════════════════════════════════ */
  document.addEventListener('lateral:listo', inicializar)

  async function inicializar() {
    try {
      if (document.body.dataset.moduloActivo !== 'inventario') return

      supabase = window.supabase
      if (!supabase) { console.error('[Inventario] window.supabase no disponible'); return }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error('[Inventario] Sin sesión:', sessionError)
        window.location.href = 'index.html'
        return
      }
      sesion = session

      if (!await verificarAcceso('inventario')) return

      const { data: perfil } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, apellidos_completos, nombre_usuario')
        .eq('id', session.user.id)
        .single()

      if (!perfil) {
        console.error('[Inventario] Perfil no encontrado')
        window.location.href = 'index.html'
        return
      }
      perfilActual = perfil

      document.getElementById('campoUsuarioIngreso').value =
        `${perfil.nombre_completo || ''} ${perfil.apellidos_completos || ''}`.trim()

      document.getElementById('campoFechaIngreso').value = new Date().toISOString().slice(0, 10)

      document.querySelectorAll('.inventario-tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab))
      })

      await renderizarResumen()

      bindModales()

      console.log('[Inventario] Inicializado correctamente')
    } catch (err) {
      console.error('[Inventario] Error en inicializar():', err)
    }
  }

  /* ════════════════════════════════════════════
     CAMBIAR DE TAB
     ════════════════════════════════════════════ */
  function cambiarTab(tab) {
    try {
      document.querySelectorAll('.inventario-tab').forEach(t =>
        t.classList.toggle('activo', t.dataset.tab === tab)
      )
      document.querySelectorAll('.inventario-panel').forEach(p =>
        p.classList.remove('activo')
      )

      const panelMap = { resumen: 'panelResumen', catalogo: 'panelCatalogo', ingresar: 'panelIngresar', descontar: 'panelDescontar', kardex: 'panelKardex' }
      const panel = document.getElementById(panelMap[tab])
      if (!panel) { console.error('[Inventario] Panel no encontrado:', panelMap[tab]); return }
      panel.classList.add('activo')

      switch (tab) {
        case 'resumen': renderizarResumen(); break
        case 'catalogo': renderizarCatalogo(); break
        case 'ingresar': renderizarIngresar(); break
        case 'descontar': renderizarDescontar(); break
        case 'kardex': renderizarKardex(); break
      }
    } catch (err) {
      console.error('[Inventario] Error en cambiarTab():', err)
    }
  }

  /* ════════════════════════════════════════════
     UTILIDADES GENERALES
     ════════════════════════════════════════════ */
  function escaparHtml(texto) {
    if (!texto) return ''
    const div = document.createElement('div')
    div.textContent = texto
    return div.innerHTML
  }

  function formatearFecha(fechaStr) {
    if (!fechaStr) return '—'
    const [a, m, d] = fechaStr.split('-')
    return `${d}/${m}/${a}`
  }

  function formatearFechaHora(iso) {
    if (!iso) return '—'
    const f = new Date(iso)
    const d = String(f.getDate()).padStart(2, '0')
    const m = String(f.getMonth() + 1).padStart(2, '0')
    const a = f.getFullYear()
    const h = String(f.getHours()).padStart(2, '0')
    const mi = String(f.getMinutes()).padStart(2, '0')
    return `${d}/${m}/${a} ${h}:${mi}`
  }

  function setCargandoBoton(btnId, spinnerId, textoId, activo, textoNormal) {
    const btn = document.getElementById(btnId)
    const spinner = document.getElementById(spinnerId)
    const texto = document.getElementById(textoId)
    if (!btn || !spinner || !texto) return
    btn.disabled = activo
    spinner.style.display = activo ? 'inline-block' : 'none'
    texto.style.display = activo ? 'none' : 'inline'
    if (!activo && textoNormal) texto.textContent = textoNormal
  }

  function mostrarError(elId, mensaje) {
    const el = document.getElementById(elId)
    if (el) el.textContent = mensaje
  }

  function limpiarErrores(container) {
    ; (container || document).querySelectorAll('.input-error').forEach(el => el.textContent = '')
  }

  function inicializarDesplegable(wrapperId, triggerId, dropdownId, opciones, onSeleccionar, valorInicial) {
    const wrapper = document.getElementById(wrapperId)
    const trigger = document.getElementById(triggerId)
    const dropdown = document.getElementById(dropdownId)
    if (!wrapper || !trigger || !dropdown) return
    const text = trigger.querySelector('.filtro-select-text')

    dropdown.innerHTML = opciones.map(o =>
      `<div class="filtro-option${o.seleccionada ? ' seleccionada' : ''}" data-value="${o.valor}">${escaparHtml(o.texto)}</div>`
    ).join('')

    if (valorInicial !== undefined && valorInicial !== null && valorInicial !== '') {
      trigger.dataset.value = valorInicial
      const match = opciones.find(o => String(o.valor) === String(valorInicial))
      if (match) text.textContent = match.texto
    }

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return
      dropdown.querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
      if (onSeleccionar) onSeleccionar(opt.dataset.value, opt.textContent)
    })

    trigger.addEventListener('click', (e) => {
      e.stopPropagation()
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('abierto')
    })
  }

  function refrescarOpcionesDropdown(dropdownId, triggerId, opciones) {
    const dropdown = document.getElementById(dropdownId)
    const trigger = document.getElementById(triggerId)
    if (!dropdown || !trigger) return
    const text = trigger.querySelector('.filtro-select-text')
    const valorActual = trigger.dataset.value

    dropdown.innerHTML = opciones.map(o => {
      const sel = String(o.valor) === String(valorActual)
      return `<div class="filtro-option${sel ? ' seleccionada' : ''}" data-value="${o.valor}">${escaparHtml(o.texto)}</div>`
    }).join('')
  }

  function actualizarOpcionesDesplegable(wrapperId, triggerId, dropdownId, opciones, valorInicial, textoDefault) {
    const trigger = document.getElementById(triggerId)
    const dropdown = document.getElementById(dropdownId)
    if (!trigger || !dropdown) return
    const text = trigger.querySelector('.filtro-select-text')
    if (!text) return

    const valor = valorInicial !== undefined && valorInicial !== null ? String(valorInicial) : ''

    if (valor) {
      const match = opciones.find(o => String(o.valor) === valor)
      if (match) text.textContent = match.texto
    } else {
      text.textContent = textoDefault || ''
    }

    trigger.dataset.value = valor

    dropdown.innerHTML = opciones.map(o => {
      const sel = String(o.valor) === valor
      return `<div class="filtro-option${sel ? ' seleccionada' : ''}" data-value="${o.valor}">${escaparHtml(o.texto)}</div>`
    }).join('')
  }

  /* ════════════════════════════════════════════
     TAB: RESUMEN
     ════════════════════════════════════════════ */
  async function renderizarResumen() {
    try {
      const [resArticulos, resEntradas, resSalidas, resUltimo] = await Promise.all([
        supabase.from('inventario_articulos').select('id, stock_actual, stock_minimo'),
        supabase.from('inventario_movimientos').select('id', { count: 'exact', head: true }).eq('tipo', 'entrada'),
        supabase.from('inventario_movimientos').select('id', { count: 'exact', head: true }).eq('tipo', 'salida'),
        supabase.from('inventario_movimientos').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      if (resArticulos.error) console.error('[Inventario] Error resArticulos:', resArticulos.error)
      if (resEntradas.error) console.error('[Inventario] Error resEntradas:', resEntradas.error)
      if (resSalidas.error) console.error('[Inventario] Error resSalidas:', resSalidas.error)
      if (resUltimo.error) console.error('[Inventario] Error resUltimo:', resUltimo.error)

      const total = resArticulos.data ? resArticulos.data.length : 0
      const stockTotal = resArticulos.data ? resArticulos.data.reduce((s, a) => s + a.stock_actual, 0) : 0
      const stockBajo = resArticulos.data ? resArticulos.data.filter(a => a.stock_actual <= a.stock_minimo && a.stock_minimo > 0).length : 0
      const entradas = resEntradas.count || 0
      const salidas = resSalidas.count || 0
      const ultimo = resUltimo.data ? formatearFechaHora(resUltimo.data.created_at) : '—'

      document.getElementById('resumenTotalArticulos').textContent = total
      document.getElementById('resumenStockDisponible').textContent = stockTotal
      document.getElementById('resumenStockBajo').textContent = stockBajo
      document.getElementById('resumenEntradas').textContent = entradas
      document.getElementById('resumenSalidas').textContent = salidas
      document.getElementById('resumenUltimoMovimiento').textContent = ultimo
    } catch (err) {
      console.error('[Inventario] Error en renderizarResumen():', err)
    }
  }

  /* ════════════════════════════════════════════
     TAB: CATÁLOGO
     ════════════════════════════════════════════ */
  async function renderizarCatalogo() {
    try {
      const contenedor = document.getElementById('catalogoContent')
      if (!contenedor) { console.error('[Inventario] #catalogoContent no encontrado'); return }
      if (tablaCatalogo) { await cargarArticulos(); return }

      const headerHTML = `
      <div class="tabla-header-filtros">
        <div class="filtro-search">
          <i class="ph ph-magnifying-glass"></i>
          <input type="text" class="filtro-input" id="buscarArticulo" placeholder="Buscar artículo..." />
        </div>
        <button class="btn-filled-md" id="btnImportarExcel">
          <i class="ph ph-file-xls"></i> Importar Excel
        </button>
        <input type="file" id="inputImportarExcel" accept=".xlsx,.xls" style="display:none;" />
        <button class="btn-filled-md" id="btnNuevoArticulo" style="margin-left:auto;">Nuevo Artículo</button>
      </div>
    `

      tablaCatalogo = new Tabla({
        headerHTML,
        columnas: [
          { clave: 'codigo', titulo: 'Código' },
          { clave: 'nombre', titulo: 'Nombre' },
          { clave: 'categoria', titulo: 'Categoría' },
          { clave: 'unidad_medida', titulo: 'Unidad' },
          { clave: 'stock_actual', titulo: 'Stock Actual' },
          { clave: 'stock_minimo', titulo: 'Stock Mínimo' },
          {
            clave: 'activo', titulo: 'Estado',
            render: (v) => v
              ? '<span class="tabla-badge activo"><i class="ph ph-check-circle"></i> Activo</span>'
              : '<span class="tabla-badge inactivo"><i class="ph ph-x-circle"></i> Inactivo</span>',
          },
          {
            clave: 'acciones', titulo: '',
            render: (v, fila) => {
              const activo = fila.activo
              const accion = activo ? 'eliminar' : 'reactivar'
              const icono = activo ? 'ph-trash-simple' : 'ph-check-circle'
              const titulo = activo ? 'Desactivar' : 'Reactivar'
              const clase = activo ? 'btn-eliminar' : 'btn-reactivar'
              return `
              <div class="acciones-tabla">
                <button class="btn-accion btn-editar" data-accion="editar" data-id="${fila.id}" title="Editar">
                  <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="btn-accion ${clase}" data-accion="${accion}" data-id="${fila.id}" title="${titulo}">
                  <i class="ph ${icono}"></i>
                </button>
              </div>
            `
            },
          },
        ],
      })

      contenedor.appendChild(tablaCatalogo.obtenerElemento())

      await cargarArticulos()

      contenedor.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]')
        if (!btn) return
        e.stopPropagation()
        const id = btn.dataset.id
        if (btn.dataset.accion === 'editar') editarArticulo(id)
        if (btn.dataset.accion === 'eliminar' || btn.dataset.accion === 'reactivar') toggleEstadoArticulo(id, btn.dataset.accion === 'reactivar')
      })

      document.getElementById('buscarArticulo').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') aplicarFiltrosCatalogo()
      })

      document.getElementById('btnNuevoArticulo').addEventListener('click', abrirPanelNuevoArticulo)
      document.getElementById('btnImportarExcel').addEventListener('click', () => {
        document.getElementById('inputImportarExcel').click()
      })
      document.getElementById('inputImportarExcel').addEventListener('change', procesarExcelCatalogo)

      document.getElementById('btnCancelarArticulo').addEventListener('click', cerrarPanelArticulo)
      document.getElementById('btnGuardarArticulo').addEventListener('click', guardarArticulo)

      document.addEventListener('click', (e) => {
        const panel = document.getElementById('panelFormArticulo')
        if (panel.classList.contains('abierto') && !panel.contains(e.target) &&
          !e.target.closest('#btnNuevoArticulo') && !e.target.closest('[data-accion="editar"]')) {
          cerrarPanelArticulo()
        }
      })
    } catch (err) {
      console.error('[Inventario] Error en renderizarCatalogo():', err)
    }
  }

  async function cargarArticulos() {
    const { data, error } = await supabase
      .from('inventario_articulos')
      .select('*')
      .order('nombre')

    if (error) { console.error('[Inventario] Error cargarArticulos:', error); return }

    articulos = data || []

    aplicarFiltrosCatalogo()
  }

  function aplicarFiltrosCatalogo() {
    if (!tablaCatalogo) return
    const texto = (document.getElementById('buscarArticulo')?.value || '').toLowerCase().trim()
    const filtrados = articulos.filter(a => {
      if (!texto) return true
      return (a.nombre || '').toLowerCase().includes(texto) ||
        (a.codigo || '').toLowerCase().includes(texto) ||
        (a.categoria || '').toLowerCase().includes(texto)
    })
    tablaCatalogo.actualizar(filtrados)
  }

  /* ─── CRUD ARTÍCULOS ─── */
  function abrirPanelNuevoArticulo() {
    editandoArticuloId = null
    document.getElementById('formArticulo').reset()
    limpiarErrores(document.getElementById('panelFormArticulo'))
    document.getElementById('campoCodigo').value = ''
    document.getElementById('campoArticuloActivo').checked = true
    document.getElementById('campoStockMinimo').value = ''
    document.getElementById('textoGuardarArticulo').textContent = 'Guardar'

    const catOpts = CATEGORIAS_PREDEFINIDAS.map(c => ({ valor: c, texto: c }))
    const uniOpts = UNIDADES_PREDEFINIDAS.map(u => ({ valor: u, texto: u }))

    if (!panelArticuloInicializado) {
      inicializarDesplegable('wrapperCategoria', 'triggerCategoria', 'dropdownCategoria', catOpts)
      inicializarDesplegable('wrapperUnidad', 'triggerUnidad', 'dropdownUnidad', uniOpts)
      panelArticuloInicializado = true
    }

    actualizarOpcionesDesplegable('wrapperCategoria', 'triggerCategoria', 'dropdownCategoria', catOpts, '', 'Seleccione una categoría')
    actualizarOpcionesDesplegable('wrapperUnidad', 'triggerUnidad', 'dropdownUnidad', uniOpts, '', 'Seleccione una unidad')

    document.getElementById('panelFormArticulo').classList.add('abierto')
    setTimeout(() => document.getElementById('campoNombreArticulo').focus(), 200)
  }

  function editarArticulo(id) {
    const art = articulos.find(a => a.id === id)
    if (!art) return

    editandoArticuloId = id
    document.getElementById('campoCodigo').value = art.codigo || ''
    document.getElementById('campoNombreArticulo').value = art.nombre || ''
    document.getElementById('campoStockMinimo').value = art.stock_minimo || 0
    document.getElementById('campoArticuloActivo').checked = art.activo ?? true
    document.getElementById('textoGuardarArticulo').textContent = 'Actualizar'

    const catOpts = CATEGORIAS_PREDEFINIDAS.map(c => ({ valor: c, texto: c }))
    const uniOpts = UNIDADES_PREDEFINIDAS.map(u => ({ valor: u, texto: u }))

    if (!panelArticuloInicializado) {
      inicializarDesplegable('wrapperCategoria', 'triggerCategoria', 'dropdownCategoria', catOpts)
      inicializarDesplegable('wrapperUnidad', 'triggerUnidad', 'dropdownUnidad', uniOpts)
      panelArticuloInicializado = true
    }

    actualizarOpcionesDesplegable('wrapperCategoria', 'triggerCategoria', 'dropdownCategoria', catOpts, art.categoria)
    actualizarOpcionesDesplegable('wrapperUnidad', 'triggerUnidad', 'dropdownUnidad', uniOpts, art.unidad_medida)

    limpiarErrores(document.getElementById('panelFormArticulo'))
    document.getElementById('panelFormArticulo').classList.add('abierto')
    setTimeout(() => document.getElementById('campoNombreArticulo').focus(), 200)
  }

  function cerrarPanelArticulo() {
    document.getElementById('panelFormArticulo').classList.remove('abierto')
    editandoArticuloId = null
  }

  async function generarCodigoArticulo() {
    const { data } = await supabase
      .from('inventario_articulos')
      .select('codigo')
      .like('codigo', 'ART-%')
      .order('codigo', { ascending: false })
      .limit(1)
      .maybeSingle()

    let next = 1
    if (data) {
      const num = parseInt(data.codigo.replace('ART-', ''), 10)
      if (!isNaN(num)) next = num + 1
    }
    return `ART-${String(next).padStart(4, '0')}`
  }

  async function guardarArticulo() {
    limpiarErrores(document.getElementById('panelFormArticulo'))

    let codigo = document.getElementById('campoCodigo').value.trim()
    const nombre = document.getElementById('campoNombreArticulo').value.trim()
    const categoria = document.getElementById('triggerCategoria')?.dataset?.value || ''
    const unidadMedida = document.getElementById('triggerUnidad')?.dataset?.value || ''
    const stockMinimo = parseInt(document.getElementById('campoStockMinimo').value) || 0
    const activo = document.getElementById('campoArticuloActivo').checked

    let hayError = false
    if (!nombre) { mostrarError('errorNombreArticulo', 'El nombre es obligatorio'); hayError = true }
    if (!categoria) { mostrarError('errorCategoria', 'Seleccione una categoría'); hayError = true }
    if (!unidadMedida) { mostrarError('errorUnidad', 'Seleccione una unidad'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnGuardarArticulo', 'spinnerArticulo', 'textoGuardarArticulo', true)

    try {
      if (!codigo) {
        codigo = await generarCodigoArticulo()
      }

      if (editandoArticuloId) {
        const { error } = await supabase
          .from('inventario_articulos')
          .update({ codigo, nombre, categoria, unidad_medida: unidadMedida, stock_minimo: stockMinimo, activo })
          .eq('id', editandoArticuloId)

        if (error) {
          if (error.code === '23505') {
            mostrarError('errorCodigo', 'El código ya existe')
          } else {
            mostrarError('errorNombreArticulo', error.message || 'Error al actualizar')
          }
          setCargandoBoton('btnGuardarArticulo', 'spinnerArticulo', 'textoGuardarArticulo', false, 'Actualizar')
          return
        }
      } else {
        const { error } = await supabase
          .from('inventario_articulos')
          .insert({ codigo, nombre, categoria, unidad_medida: unidadMedida, stock_minimo: stockMinimo, activo })

        if (error) {
          if (error.code === '23505') {
            mostrarError('errorCodigo', 'El código ya existe')
          } else {
            mostrarError('errorNombreArticulo', error.message || 'Error al crear')
          }
          setCargandoBoton('btnGuardarArticulo', 'spinnerArticulo', 'textoGuardarArticulo', false, 'Guardar')
          return
        }
      }

      cerrarPanelArticulo()
      await cargarArticulos()
    } catch (err) {
      mostrarError('errorNombreArticulo', 'Error de conexión')
    }
    setCargandoBoton('btnGuardarArticulo', 'spinnerArticulo', 'textoGuardarArticulo', false, editandoArticuloId ? 'Actualizar' : 'Guardar')
  }

  let eliminarArticuloPendiente = null
  let reactivarArticuloPendiente = false

  function toggleEstadoArticulo(id, reactivar) {
    const art = articulos.find(a => a.id === id)
    if (!art) return
    eliminarArticuloPendiente = id
    reactivarArticuloPendiente = reactivar

    document.getElementById('tituloEliminarArticulo').textContent = reactivar ? 'Reactivar artículo' : 'Desactivar artículo'
    document.getElementById('textoEliminarArticulo').textContent = reactivar
      ? '¿Está seguro de que desea reactivar este artículo?'
      : '¿Está seguro de que desea desactivar este artículo?'
    document.getElementById('textoConfirmarEliminarArticulo').textContent = reactivar ? 'Activar' : 'Desactivar'
    const btn = document.getElementById('btnConfirmarEliminarArticulo')
    btn.className = reactivar ? 'btn-filled-md' : 'btn-filled-md btn-peligro-md'

    document.getElementById('modalEliminarArticulo').classList.add('activo')
  }

  /* ════════════════════════════════════════════
     IMPORTACIÓN EXCEL — CATÁLOGO
     ════════════════════════════════════════════ */
  async function procesarExcelCatalogo(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      console.log('[Inventario] Primeras filas raw:', matrix.slice(0, 10))

      let headerRow = -1
      let colDescripcion = -1
      let colUnidadSeguros = -1
      const maxBuscar = Math.min(matrix.length, 50)

      for (let i = 0; i < maxBuscar; i++) {
        const row = matrix[i]
        if (!row || !Array.isArray(row)) continue
        for (let j = 0; j < row.length; j++) {
          const celda = String(row[j]).trim().toUpperCase()
          if (celda === 'DESCRIPCION') colDescripcion = j
          if (celda === 'UNIDAD DE SEGUROS') colUnidadSeguros = j
        }
        if (colDescripcion >= 0 && colUnidadSeguros >= 0) {
          headerRow = i
          break
        }
      }

      if (headerRow === -1) {
        alert('El archivo Excel debe contener las columnas "DESCRIPCION" y "UNIDAD DE SEGUROS" para poder importar. Verifique que los encabezados estén escritos correctamente.')
        event.target.value = ''
        return
      }

      datosImportacionPreview = []
      let totalFilas = 0, descVacia = 0, cantVacia = 0, cantCero = 0

      for (let i = headerRow + 1; i < matrix.length; i++) {
        const row = matrix[i]
        if (!row || !Array.isArray(row)) continue
        totalFilas++
        const descripcion = String(row[colDescripcion] || '').trim()
        const rawCantidad = row[colUnidadSeguros]
        const cantidad = parseInt(rawCantidad) || 0

        if (!descripcion) { descVacia++; continue }
        if (rawCantidad === '' || rawCantidad === undefined || rawCantidad === null) { cantVacia++; continue }
        if (cantidad <= 0) { cantCero++; continue }

        datosImportacionPreview.push({ codigo: '', descripcion, cantidad, index: i })
      }

      console.log(`[Inventario] Diagnóstico Excel:
  Total filas analizadas: ${totalFilas}
  Descripción vacía: ${descVacia}
  Cantidad vacía: ${cantVacia}
  Cantidad <= 0: ${cantCero}
  Registros válidos: ${datosImportacionPreview.length}`)

      if (datosImportacionPreview.length === 0) {
        alert('No se encontraron datos válidos después de la fila de encabezados. Asegúrese de que las filas contengan descripción y cantidad (UNIDAD DE SEGUROS).')
        event.target.value = ''
        return
      }

      document.getElementById('previewImportacionInfo').textContent =
        `Se van a procesar ${datosImportacionPreview.length} registro(s)`

      const tbody = document.getElementById('tbodyPreviewImportacion')
      tbody.innerHTML = datosImportacionPreview.map(r => `
        <tr>
          <td>${escaparHtml(r.codigo || '(auto)')}</td>
          <td>${escaparHtml(r.descripcion)}</td>
          <td>${r.cantidad}</td>
          <td><span class="tabla-badge activo">Nuevo</span></td>
        </tr>
      `).join('')

      document.getElementById('previewImportacionError').style.display = 'none'
      document.getElementById('modalPreviewImportacion').classList.add('activo')

      document.getElementById('btnConfirmarPreview').onclick = confirmarImportacionCatalogo
    } catch (err) {
      alert('Error al leer el archivo: ' + err.message)
    }
    event.target.value = ''
  }

  function normalizarNombre(txt) {
    return txt.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  }

  async function confirmarImportacionCatalogo() {
    setCargandoBoton('btnConfirmarPreview', 'spinnerPreview', 'textoConfirmarPreview', true)

    try {
      const [resArticulos, resUltimo] = await Promise.all([
        supabase.from('inventario_articulos').select('id, nombre, stock_actual'),
        supabase.from('inventario_articulos')
          .select('codigo')
          .like('codigo', 'ART-%')
          .order('codigo', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const nombreMap = new Map()
      for (const a of resArticulos.data || []) {
        const key = normalizarNombre(a.nombre)
        if (!nombreMap.has(key)) nombreMap.set(key, a)
      }

      let next = 1
      if (resUltimo.data) {
        const num = parseInt(resUltimo.data.codigo.replace('ART-', ''), 10)
        if (!isNaN(num)) next = num + 1
      }

      const actualizarList = []
      const nuevosList = []
      const movimientos = []

      for (const item of datosImportacionPreview) {
        const key = normalizarNombre(item.descripcion)
        const existente = nombreMap.get(key)

        if (existente) {
          const stockAnterior = existente.stock_actual || 0
          const nuevoStock = stockAnterior + item.cantidad
          actualizarList.push({ id: existente.id, stock_actual: nuevoStock })
          movimientos.push({
            articulo_id: existente.id,
            tipo: 'importacion',
            cantidad: item.cantidad,
            stock_anterior: stockAnterior,
            stock_actual: nuevoStock,
            observacion: 'Importación desde Excel',
            usuario_id: perfilActual.id,
          })
        } else {
          const codigo = `ART-${String(next++).padStart(4, '0')}`
          nuevosList.push({
            codigo,
            nombre: item.descripcion,
            categoria: CATEGORIAS_PREDEFINIDAS[0],
            unidad_medida: UNIDADES_PREDEFINIDAS[0],
            stock_actual: item.cantidad,
          })
          movimientos.push({
            tipo: 'importacion',
            cantidad: item.cantidad,
            stock_anterior: 0,
            stock_actual: item.cantidad,
            observacion: 'Importación desde Excel',
            usuario_id: perfilActual.id,
          })
        }
      }

      if (actualizarList.length > 0) {
        await Promise.all(
          actualizarList.map(a =>
            supabase.from('inventario_articulos').update({ stock_actual: a.stock_actual }).eq('id', a.id)
          )
        )
      }

      if (nuevosList.length > 0) {
        const { data: articulosInsertados, error: errArt } = await supabase
          .from('inventario_articulos')
          .insert(nuevosList)
          .select('id')

        if (errArt) throw new Error('Error al crear artículos: ' + errArt.message)

        let idx = 0
        for (const m of movimientos) {
          if (!m.articulo_id) {
            m.articulo_id = articulosInsertados[idx].id
            idx++
          }
        }
      }

      if (movimientos.length > 0) {
        const { error: errMov } = await supabase
          .from('inventario_movimientos')
          .insert(movimientos)

        if (errMov) throw new Error('Error al registrar movimientos: ' + errMov.message)
      }

      setCargandoBoton('btnConfirmarPreview', 'spinnerPreview', 'textoConfirmarPreview', false, 'Confirmar Importación')
      document.getElementById('modalPreviewImportacion').classList.remove('activo')

      alert(`Importación completada.\nProcesados: ${datosImportacionPreview.length}\nErrores: 0`)
      datosImportacionPreview = []
      await cargarArticulos()
      await renderizarResumen()

    } catch (err) {
      alert('Error en la importación: ' + err.message)
      setCargandoBoton('btnConfirmarPreview', 'spinnerPreview', 'textoConfirmarPreview', false, 'Confirmar Importación')
    }
  }

  /* ════════════════════════════════════════════
     TAB: INGRESAR
     ════════════════════════════════════════════ */
  async function renderizarIngresar() {
    try {
      await cargarArticulos()
      const artOpts = articulos.filter(a => a.activo).map(a => ({ valor: a.id, texto: `${a.codigo} — ${a.nombre}` }))
      refrescarOpcionesDropdown('dropdownArticuloIngreso', 'triggerArticuloIngreso', artOpts)

      if (!ingresoInicializado) {
        ingresoInicializado = true
        inicializarDesplegable('wrapperArticuloIngreso', 'triggerArticuloIngreso', 'dropdownArticuloIngreso', artOpts)
        document.getElementById('btnRegistrarEntrada').addEventListener('click', registrarEntrada)
        window.datePickerIngreso = new DatePicker('campoFechaIngreso')
      }

      await cargarUltimasEntradas()
    } catch (err) {
      console.error('[Inventario] Error en renderizarIngresar():', err)
    }
  }

  async function registrarEntrada() {
    limpiarErrores(document.getElementById('panelIngresar'))

    const articuloId = document.getElementById('triggerArticuloIngreso')?.dataset?.value || ''
    const cantidad = parseInt(document.getElementById('campoCantidadIngreso').value) || 0
    const proveedor = document.getElementById('campoProveedor').value.trim()
    const numeroDoc = document.getElementById('campoDocEntrada').value.trim()
    const observacion = document.getElementById('campoMotivoEntrada').value.trim()
    const fecha = window.datePickerIngreso?.obtenerValor() || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!articuloId) { mostrarError('errorArticuloIngreso', 'Seleccione un artículo'); hayError = true }
    if (cantidad <= 0) { mostrarError('errorCantidadIngreso', 'Ingrese una cantidad válida'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnRegistrarEntrada', 'spinnerEntrada', 'textoRegistrarEntrada', true)

    try {
      const { data: art } = await supabase.from('inventario_articulos').select('stock_actual').eq('id', articuloId).single()
      if (!art) throw new Error('Artículo no encontrado')

      const nuevoStock = (art.stock_actual || 0) + cantidad

      const { error: errUpd } = await supabase.from('inventario_articulos').update({ stock_actual: nuevoStock }).eq('id', articuloId)
      if (errUpd) throw new Error(errUpd.message)

      const { error: errMov } = await supabase.from('inventario_movimientos').insert({
        articulo_id: articuloId,
        tipo: 'entrada',
        cantidad,
        stock_anterior: art.stock_actual || 0,
        stock_actual: nuevoStock,
        proveedor: proveedor || null,
        numero_documento: numeroDoc || null,
        observacion: observacion || null,
        usuario_id: perfilActual.id,
      })
      if (errMov) throw new Error(errMov.message)

      document.getElementById('campoCantidadIngreso').value = ''
      document.getElementById('campoProveedor').value = ''
      document.getElementById('campoDocEntrada').value = ''
      document.getElementById('campoMotivoEntrada').value = ''

      await cargarUltimasEntradas()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      mostrarError('errorCantidadIngreso', err.message || 'Error al registrar entrada')
    }
    setCargandoBoton('btnRegistrarEntrada', 'spinnerEntrada', 'textoRegistrarEntrada', false, 'Registrar Entrada')
  }

  async function cargarUltimasEntradas() {
    const { data, error } = await supabase
      .from('inventario_movimientos')
      .select('*, inventario_articulos!inner(nombre, codigo)')
      .eq('tipo', 'entrada')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) { console.error('[Inventario] Error cargarUltimasEntradas:', error); return }

    const tbody = document.getElementById('tbodyUltimasEntradas')
    if (!tbody) return

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--color-texto-claro);padding:2rem;">No hay entradas registradas</td></tr>'
      return
    }

    tbody.innerHTML = data.map(m => {
      const art = m.inventario_articulos || {}
      const nombreCompleto = `${art.codigo || ''} — ${art.nombre || ''}`
      return `<tr>
        <td>${formatearFecha(m.created_at ? m.created_at.slice(0, 10) : '')}</td>
        <td>${escaparHtml(nombreCompleto)}</td>
        <td>${m.cantidad}</td>
        <td>${escaparHtml(m.proveedor || '—')}</td>
        <td>${m.usuario_id === perfilActual.id ? `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim() : '—'}</td>
        <td>${escaparHtml(m.observacion || '—')}</td>
      </tr>`
    }).join('')
  }

  /* ════════════════════════════════════════════
     TAB: DESCONTAR (CARGO DE ENTREGA)
     ════════════════════════════════════════════ */

  async function renderizarDescontar() {
    try {
      await cargarArticulos()

      const contenedor = document.getElementById('cargoHistorialContent')
      if (!contenedor) { console.error('[Inventario] #cargoHistorialContent no encontrado'); return }

      const { data: areasData } = await supabase
        .from('areas')
        .select('nombre')
        .eq('activo', true)
        .order('nombre')
      const areaOpts = (areasData || []).map(a => ({ valor: a.nombre, texto: a.nombre }))

      const artOpts = articulos.filter(a => a.activo && a.stock_actual > 0).map(a => ({
        valor: a.id, texto: `${a.codigo} — ${a.nombre} (Stock: ${a.stock_actual})`
      }))
      refrescarOpcionesDropdown('dropdownArticuloCargo', 'triggerArticuloCargo', artOpts)

      if (!descontarInicializado) {
        descontarInicializado = true
        inicializarDesplegable('wrapperArticuloCargo', 'triggerArticuloCargo', 'dropdownArticuloCargo', artOpts)
        inicializarDesplegable('wrapperAreaCargo', 'triggerAreaCargo', 'dropdownAreaCargo', areaOpts)
        document.getElementById('btnAgregarArticuloCargo').addEventListener('click', agregarArticuloACargo)
        document.getElementById('btnRegistrarCargo').addEventListener('click', registrarCargo)
        window.datePickerCargo = new DatePicker('campoFechaCargo')
      }

      refrescarOpcionesDropdown('dropdownAreaCargo', 'triggerAreaCargo', areaOpts)

      if (tablaCargos) { await cargarCargosRecientes(); return }

      const headerHTML = `<div class="tabla-header-filtros" style="border-bottom:none;padding-bottom:0;"></div>`

      tablaCargos = new Tabla({
        headerHTML,
        columnas: [
          { clave: 'numero_cargo', titulo: 'N° Cargo' },
          { clave: 'fecha', titulo: 'Fecha', render: (v) => formatearFecha(v) },
          { clave: 'area_solicitante', titulo: 'Área solicitante' },
          { clave: 'responsable_receptor', titulo: 'Responsable' },
          {
            clave: 'total_articulos', titulo: 'Artículos',
            render: (v) => `${v || 0} ítem(s)`,
          },
          {
            clave: 'acciones', titulo: '',
            render: (v, fila) => `
            <div class="acciones-tabla">
              <button class="btn-accion-pdf" data-accion="ver-pdf" data-id="${fila.numero_cargo}" title="Ver PDF">
                <i class="ph ph-eye"></i>
              </button>
              <button class="btn-accion-descargar" data-accion="descargar-pdf" data-id="${fila.numero_cargo}" title="Descargar PDF">
                <i class="ph ph-download"></i>
              </button>
            </div>
          `,
          },
        ],
      })

      contenedor.appendChild(tablaCargos.obtenerElemento())
      await cargarCargosRecientes()

      contenedor.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]')
        if (!btn) return
        e.stopPropagation()
        const id = btn.dataset.id
        if (btn.dataset.accion === 'ver-pdf') verCargoPdf(id)
        if (btn.dataset.accion === 'descargar-pdf') descargarCargoPdf(id)
      })
    } catch (err) {
      console.error('[Inventario] Error en renderizarDescontar():', err)
    }
  }

  async function generarNumeroCargo() {
    const anio = new Date().getFullYear()
    const { data } = await supabase
      .from('inventario_movimientos')
      .select('numero_cargo')
      .like('numero_cargo', `CARGO-${anio}-%`)
      .order('numero_cargo', { ascending: false })
      .limit(1)
      .maybeSingle()

    let maxNum = 0
    if (data && data.numero_cargo) {
      const parts = data.numero_cargo.split('-')
      const num = parseInt(parts[2], 10)
      if (!isNaN(num)) maxNum = num
    }

    const siguiente = maxNum + 1
    return `CARGO-${anio}-${String(siguiente).padStart(4, '0')}`
  }

  function agregarArticuloACargo() {
    const articuloId = document.getElementById('triggerArticuloCargo')?.dataset?.value
    const cantidad = parseInt(document.getElementById('campoCantidadCargo').value) || 0

    document.getElementById('errorArticuloCargo').textContent = ''

    if (!articuloId) {
      document.getElementById('errorArticuloCargo').textContent = 'Seleccione un artículo'
      return
    }
    if (cantidad <= 0) {
      document.getElementById('errorArticuloCargo').textContent = 'Ingrese una cantidad válida'
      return
    }

    const art = articulos.find(a => a.id === articuloId)
    if (!art) return
    if (cantidad > art.stock_actual) {
      document.getElementById('errorArticuloCargo').textContent = `Stock insuficiente. Stock actual: ${art.stock_actual}`
      return
    }

    const existente = articulosSeleccionadosCargo.find(a => a.id === articuloId)
    if (existente) {
      const nuevaCant = existente.cantidad + cantidad
      if (nuevaCant > art.stock_actual) {
        document.getElementById('errorArticuloCargo').textContent = `Stock insuficiente para la cantidad total. Stock actual: ${art.stock_actual}`
        return
      }
      existente.cantidad = nuevaCant
    } else {
      articulosSeleccionadosCargo.push({ id: articuloId, codigo: art.codigo, nombre: art.nombre, cantidad, stock_actual: art.stock_actual })
    }

    document.getElementById('triggerArticuloCargo').dataset.value = ''
    document.getElementById('triggerArticuloCargo').querySelector('.filtro-select-text').textContent = 'Seleccione un artículo'
    document.getElementById('campoCantidadCargo').value = ''
    document.getElementById('dropdownArticuloCargo').querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'))

    renderizarDetalleCargo()
  }

  function quitarArticuloDeCargo(index) {
    articulosSeleccionadosCargo.splice(index, 1)
    renderizarDetalleCargo()
  }

  function renderizarDetalleCargo() {
    const tbody = document.getElementById('tbodyDetalleCargo')
    const vacio = document.getElementById('cargoDetalleVacio')
    if (!tbody || !vacio) return

    if (articulosSeleccionadosCargo.length === 0) {
      tbody.innerHTML = ''
      vacio.style.display = 'flex'
      return
    }

    vacio.style.display = 'none'
    tbody.innerHTML = articulosSeleccionadosCargo.map((a, i) => `
      <tr>
        <td>${escaparHtml(a.nombre)}</td>
        <td>${escaparHtml(a.codigo)}</td>
        <td>${a.cantidad}</td>
        <td>${a.stock_actual}</td>
        <td>
          <button class="btn-accion btn-eliminar" data-index="${i}" title="Quitar" style="border:none;background:none;cursor:pointer;">
            <i class="ph ph-x-circle" style="color:var(--color-error);font-size:1.2rem;"></i>
          </button>
        </td>
      </tr>
    `).join('')

    tbody.querySelectorAll('[data-index]').forEach(btn => {
      btn.addEventListener('click', () => quitarArticuloDeCargo(parseInt(btn.dataset.index)))
    })
  }

  async function registrarCargo() {
    limpiarErrores(document.querySelector('.cargo-formulario'))

    const area = document.getElementById('triggerAreaCargo')?.dataset?.value || ''
    const responsable = document.getElementById('campoResponsableReceptor').value.trim()
    const observacion = document.getElementById('campoObservacionCargo').value.trim()
    const fecha = window.datePickerCargo?.obtenerValor() || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!area) { mostrarError('errorAreaSolicitante', 'Seleccione un área'); hayError = true }
    if (!responsable) { mostrarError('errorResponsableReceptor', 'El responsable receptor es obligatorio'); hayError = true }
    if (articulosSeleccionadosCargo.length === 0) { mostrarError('errorArticuloCargo', 'Agregue al menos un artículo'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnRegistrarCargo', 'spinnerCargo', 'textoRegistrarCargo', true)

    try {
      const numeroCargo = await generarNumeroCargo()

      for (const item of articulosSeleccionadosCargo) {
        const { data: art } = await supabase.from('inventario_articulos').select('stock_actual').eq('id', item.id).single()
        if (!art) throw new Error(`Artículo ${item.nombre} no encontrado`)
        if (item.cantidad > art.stock_actual) {
          throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${art.stock_actual}, solicitado: ${item.cantidad}`)
        }

        const nuevoStock = (art.stock_actual || 0) - item.cantidad

        const { error: errUpd } = await supabase.from('inventario_articulos').update({ stock_actual: nuevoStock }).eq('id', item.id)
        if (errUpd) throw new Error(errUpd.message)

        const { error: errMov } = await supabase.from('inventario_movimientos').insert({
          articulo_id: item.id, tipo: 'salida', cantidad: item.cantidad,
          stock_anterior: art.stock_actual || 0, stock_actual: nuevoStock,
          numero_cargo: numeroCargo, area_solicitante: area,
          responsable_receptor: responsable,
          observacion: observacion || null, usuario_id: perfilActual.id,
        })
        if (errMov) throw new Error(errMov.message)
      }

      articulosSeleccionadosCargo = []
      renderizarDetalleCargo()
      document.getElementById('triggerAreaCargo').dataset.value = ''
      document.getElementById('triggerAreaCargo').querySelector('.filtro-select-text').textContent = 'Seleccione un área'
      document.getElementById('dropdownAreaCargo').querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'))
      document.getElementById('campoResponsableReceptor').value = ''
      document.getElementById('campoObservacionCargo').value = ''

      await cargarCargosRecientes()
      await cargarArticulos()
      await renderizarResumen()

      generarPDFyDescargar(numeroCargo)
    } catch (err) {
      mostrarError('errorAreaSolicitante', err.message || 'Error al registrar cargo')
    }
    setCargandoBoton('btnRegistrarCargo', 'spinnerCargo', 'textoRegistrarCargo', false, 'Registrar Cargo')
  }

  async function cargarCargosRecientes() {
    const { data, error } = await supabase
      .from('inventario_movimientos')
      .select('numero_cargo, area_solicitante, responsable_receptor, created_at')
      .eq('tipo', 'salida')
      .not('numero_cargo', 'is', null)
      .order('created_at', { ascending: false })

    if (error) { console.error('[Inventario] Error cargarCargosRecientes:', error); return }
    if (!data) return

    const cargosMap = new Map()
    for (const m of data) {
      if (!cargosMap.has(m.numero_cargo)) {
        cargosMap.set(m.numero_cargo, {
          numero_cargo: m.numero_cargo,
          fecha: m.created_at ? m.created_at.slice(0, 10) : '',
          area_solicitante: m.area_solicitante,
          responsable_receptor: m.responsable_receptor,
          total_articulos: 0,
        })
      }
      cargosMap.get(m.numero_cargo).total_articulos++
    }

    const cargos = Array.from(cargosMap.values())
    if (tablaCargos) tablaCargos.actualizar(cargos)
  }

  /* ════════════════════════════════════════════
     PDF — CARGO DE ENTREGA
     ════════════════════════════════════════════ */
  async function generarPDFCargo(numeroCargo) {
    const { data: movimientos } = await supabase
      .from('inventario_movimientos')
      .select('*, inventario_articulos!inner(nombre, codigo)')
      .eq('numero_cargo', numeroCargo)
      .order('created_at', { ascending: true })

    if (!movimientos || movimientos.length === 0) return null

    const cargo = movimientos[0]

    let logoBase64 = ''
    try {
      const resp = await fetch('assets/imagenes/Logo.jpg')
      const blob = await resp.blob()
      logoBase64 = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      console.warn('No se pudo cargar el logo:', e)
    }

    const { jsPDF } = window.jspdf
    const doc = new jsPDF('l', 'mm', 'a5')

    const pageW = 210
    const margin = 12
    const contentW = pageW - margin * 2

    if (logoBase64) {
      doc.addImage(logoBase64, 'JPEG', margin, 8, 28, 14)
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('CARGO DE ENTREGA DE ÚTILES DE OFICINA', pageW / 2, 22, { align: 'center' })

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    const anchoTitulo = doc.getTextWidth('CARGO DE ENTREGA DE ÚTILES DE OFICINA')
    doc.line(pageW / 2 - anchoTitulo / 2, 24, pageW / 2 + anchoTitulo / 2, 24)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
    if (cargo.created_at) {
      const f = new Date(cargo.created_at)
      const mes = MESES[f.getMonth()].toUpperCase()
      doc.text(`CHINCHA, ${f.getDate()} DE ${mes} DEL ${f.getFullYear()}`, pageW - margin, 30, { align: 'right' })
    }

    let y = 45

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const parrafo = `QUE, LA OFICINA DE LA UNIDAD DE SEGUROS REALIZA LA ENTREGA DE LOS SIGUIENTES ÚTILES DE ESCRITORIO AL SERVICIO DE ${cargo.area_solicitante || '—'}`
    const lines = doc.splitTextToSize(parrafo, contentW)
    const lineHeight = 5.3
    lines.forEach((line, i) => doc.text(line, margin, y + i * lineHeight))
    y += lines.length * lineHeight + 8

    const items = movimientos || []
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    items.forEach((m) => {
      const art = m.inventario_articulos || {}
      const nombre = art.nombre || '—'
      doc.text(`- ${nombre} × ${m.cantidad} unidades`, margin, y)
      y += 5
    })
    y += 4

    if (cargo.observacion) {
      doc.setFont('helvetica', 'bold')
      doc.text('Observación:', margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.text(cargo.observacion, margin, y)
      y += 10
    }

    y = Math.max(y, 95)
    y += 15

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('RECIBÍ CONFORME:', margin, y)
    y += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('______________________', pageW / 2, y, { align: 'center' })
    y += 4
    doc.text('NOMBRES Y APELLIDOS:', pageW / 2, y, { align: 'center' })
    y += 4
    doc.text('DNI:', pageW / 2, y, { align: 'center' })

    return doc.output('blob')
  }

  async function verCargoPdf(numeroCargo) {
    const blob = await generarPDFCargo(numeroCargo)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  async function descargarCargoPdf(numeroCargo) {
    const blob = await generarPDFCargo(numeroCargo)
    if (!blob) return

    const nombre = `${numeroCargo}.pdf`

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = nombre
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function generarPDFyDescargar(numeroCargo) {
    setTimeout(async () => {
      const blob = await generarPDFCargo(numeroCargo)
      if (!blob) return
      const nombre = `${numeroCargo}.pdf`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = nombre
      link.click()
      URL.revokeObjectURL(link.href)
    }, 500)
  }

  /* ════════════════════════════════════════════
     TAB: KARDEX
     ════════════════════════════════════════════ */
  async function renderizarKardex() {
    try {
      const contenedor = document.getElementById('kardexContent')
      if (!contenedor) { console.error('[Inventario] #kardexContent no encontrado'); return }

      if (tablaKardex) { await cargarMovimientosKardex(); return }

      const tipoOpts = [
        { valor: '', texto: 'Todos', seleccionada: true },
        { valor: 'entrada', texto: 'Entrada' },
        { valor: 'salida', texto: 'Salida' },
        { valor: 'importacion', texto: 'Importación' },
      ]
      inicializarDesplegable('wrapperFiltroTipoKardex', 'triggerFiltroTipoKardex', 'dropdownFiltroTipoKardex', tipoOpts)

      document.getElementById('btnFiltrarKardex').addEventListener('click', cargarMovimientosKardex)

      tablaKardex = new Tabla({
        titulo: 'Movimientos de Inventario',
        headerHTML: '<h2 class="tabla-titulo">Movimientos de Inventario</h2>',
        columnas: [
          { clave: 'fecha', titulo: 'Fecha', render: (v) => formatearFechaHora(v) },
          {
            clave: 'tipo', titulo: 'Tipo',
            render: (v) => {
              if (v === 'entrada') return '<span class="tabla-badge activo"><i class="ph ph-arrow-circle-up"></i> Entrada</span>'
              if (v === 'salida') return '<span class="tabla-badge inactivo"><i class="ph ph-arrow-circle-down"></i> Salida</span>'
              return '<span class="tabla-badge" style="background:#fef3c7;color:#92400e;"><i class="ph ph-file-import"></i> Importación</span>'
            },
          },
          { clave: 'articulo_nombre', titulo: 'Artículo' },
          { clave: 'cantidad', titulo: 'Cantidad' },
          { clave: 'stock_anterior', titulo: 'Stock Anterior' },
          { clave: 'stock_actual', titulo: 'Stock Actual' },
          { clave: 'usuario_nombre', titulo: 'Usuario' },
          { clave: 'observacion', titulo: 'Observación', render: (v) => v ? escaparHtml(v) : '—' },
        ],
      })

      contenedor.appendChild(tablaKardex.obtenerElemento())

      window.dpKardexDesde = new DatePicker('kardexFechaDesde')
      document.getElementById('kardexFechaDesde').value = ''
      window.dpKardexDesde.fechaISO = ''
      window.dpKardexHasta = new DatePicker('kardexFechaHasta')

      await cargarMovimientosKardex()
    } catch (err) {
      console.error('[Inventario] Error en renderizarKardex():', err)
    }
  }

  async function cargarMovimientosKardex() {
    let query = supabase
      .from('inventario_movimientos')
      .select('*')
      .order('created_at', { ascending: false })

    const fechaDesde = window.dpKardexDesde?.obtenerValor() || ''
    const fechaHasta = window.dpKardexHasta?.obtenerValor() || ''
    const tipo = document.getElementById('triggerFiltroTipoKardex')?.dataset?.value

    if (fechaDesde) query = query.gte('created_at', fechaDesde + 'T00:00:00')
    if (fechaHasta) query = query.lte('created_at', fechaHasta + 'T23:59:59')
    if (tipo) query = query.eq('tipo', tipo)

    const { data, error } = await query.limit(100)

    if (error) { console.error('[Inventario] Error cargarMovimientosKardex:', error); return }

    const movs = (data || []).map(m => {
      const art = articulos.find(a => a.id === m.articulo_id)
      return {
        ...m,
        articulo_nombre: art ? `${art.codigo} — ${art.nombre}` : '—',
        usuario_nombre: '—',
        fecha: m.created_at,
      }
    })

    if (tablaKardex) tablaKardex.actualizar(movs)
  }

  /* ════════════════════════════════════════════
     MODALES — BINDING
     ════════════════════════════════════════════ */
  function bindModales() {
    document.getElementById('btnCerrarPreviewImportacion').addEventListener('click', () => {
      document.getElementById('modalPreviewImportacion').classList.remove('activo')
    })
    document.getElementById('btnCancelarPreview').addEventListener('click', () => {
      document.getElementById('modalPreviewImportacion').classList.remove('activo')
    })
    document.getElementById('modalPreviewImportacion').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) document.getElementById('modalPreviewImportacion').classList.remove('activo')
    })

    document.getElementById('btnConfirmarEliminarArticulo').addEventListener('click', async () => {
      if (!eliminarArticuloPendiente) return
      document.getElementById('modalEliminarArticulo').classList.remove('activo')
      await supabase.from('inventario_articulos').update({ activo: reactivarArticuloPendiente }).eq('id', eliminarArticuloPendiente)
      eliminarArticuloPendiente = null
      reactivarArticuloPendiente = false
      await cargarArticulos()
    })

    document.getElementById('btnCancelarEliminarArticulo').addEventListener('click', () => {
      document.getElementById('modalEliminarArticulo').classList.remove('activo')
      eliminarArticuloPendiente = null
      reactivarArticuloPendiente = false
    })

    document.getElementById('modalEliminarArticulo').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        document.getElementById('modalEliminarArticulo').classList.remove('activo')
        eliminarArticuloPendiente = null
        reactivarArticuloPendiente = false
      }
    })

    document.getElementById('btnCerrarModalCargo').addEventListener('click', () => {
      document.getElementById('modalVerCargoPdf').classList.remove('activo')
    })
    document.getElementById('modalVerCargoPdf').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) document.getElementById('modalVerCargoPdf').classList.remove('activo')
    })
    document.getElementById('btnDescargarCargoPdf').addEventListener('click', async () => {
      const num = document.getElementById('btnDescargarCargoPdf').dataset.numeroCargo
      if (num) await descargarCargoPdf(num)
    })
  }
})()
