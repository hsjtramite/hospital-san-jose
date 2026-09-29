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
  let movimientoEditando = null
  let anulacionPendiente = null   // { tipo: 'entrada' | 'cargo', ... }

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
        .select('id, nombre_completo, apellidos_completos, nombre_usuario, rol')
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

            document.getElementById('campoFechaIngreso').value = window.obtenerAhora().toISOString().slice(0, 10)

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
        document.getElementById('btnNuevaEntrada').addEventListener('click', abrirModalEntrada)
        document.getElementById('btnCerrarModalEntrada').addEventListener('click', () => cerrarModal('modalEntrada'))
        document.getElementById('modalEntrada').addEventListener('click', (e) => {
          if (e.target === e.currentTarget) cerrarModal('modalEntrada')
        })
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
            const fecha = window.datePickerIngreso?.obtenerValor() || window.obtenerAhora().toISOString().slice(0, 10)

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

      cerrarModal('modalEntrada')
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
      .limit(30)

    if (error) { console.error('[Inventario] Error cargarUltimasEntradas:', error); return }

    const tbody = document.getElementById('tbodyUltimasEntradas')
    if (!tbody) return

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--color-texto-claro);padding:2rem;">No hay entradas registradas</td></tr>'
      return
    }

    const admin = puedeAnular()

    tbody.innerHTML = data.map(m => {
      const art = m.inventario_articulos || {}
      const nombreCompleto = `${art.codigo || ''} — ${art.nombre || ''}`
      const anulado = m.anulado === true
      return `<tr class="${anulado ? 'inv-fila-anulada' : ''}">
        <td>${formatearFecha(m.created_at ? m.created_at.slice(0, 10) : '')}</td>
        <td>${escaparHtml(nombreCompleto)}</td>
        <td>${m.cantidad}</td>
        <td>${escaparHtml(m.proveedor || '—')}</td>
        <td>${m.usuario_id === perfilActual.id ? `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim() : '—'}</td>
        <td>${escaparHtml(m.observacion || '—')}</td>
        <td>${anulado
          ? `<span class="tabla-badge inactivo"><i class="ph ph-prohibit"></i> Anulado</span>
             <span class="inv-motivo">${escaparHtml(m.motivo_anulacion || 'Sin motivo')}</span>
             <span class="inv-motivo-fecha">${formatearFechaHora(m.anulado_en)}</span>`
          : '<span class="tabla-badge activo"><i class="ph ph-check-circle"></i> Vigente</span>'}</td>
        <td>${anulado ? '' : `
          <div class="acciones-tabla">
            <button class="btn-accion btn-editar" data-editar-mov="${m.id}" title="Editar datos">
              <i class="ph ph-pencil-simple"></i>
            </button>
            ${admin ? `<button class="btn-accion btn-eliminar" data-anular-entrada="${m.id}" title="Anular entrada">
              <i class="ph ph-prohibit"></i>
            </button>` : ''}
          </div>`}</td>
      </tr>`
    }).join('')

    tbody.querySelectorAll('[data-editar-mov]').forEach(b =>
      b.addEventListener('click', () => abrirEditarMovimiento(b.dataset.editarMov, data)))
    tbody.querySelectorAll('[data-anular-entrada]').forEach(b =>
      b.addEventListener('click', () => abrirAnularEntrada(b.dataset.anularEntrada, data)))
  }

  function puedeAnular() {
    return perfilActual && (perfilActual.rol === 1 || perfilActual.rol === 2)
  }

  function abrirModal(id) { document.getElementById(id).classList.add('activo') }
  function cerrarModal(id) { document.getElementById(id).classList.remove('activo') }

  function abrirModalEntrada() {
    limpiarErrores(document.getElementById('modalEntrada'))
    document.getElementById('campoCantidadIngreso').value = ''
    document.getElementById('campoProveedor').value = ''
    document.getElementById('campoDocEntrada').value = ''
    document.getElementById('campoMotivoEntrada').value = ''
    abrirModal('modalEntrada')
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
        document.getElementById('btnNuevoCargo').addEventListener('click', () => {
          limpiarErrores(document.getElementById('modalCargo'))
          abrirModal('modalCargo')
        })
        document.getElementById('btnCerrarModalCargoForm').addEventListener('click', () => cerrarModal('modalCargo'))
        document.getElementById('modalCargo').addEventListener('click', (e) => {
          if (e.target === e.currentTarget) cerrarModal('modalCargo')
        })
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
            clave: 'anulado', titulo: 'Estado',
            render: (v, fila) => v
              ? `<span class="tabla-badge inactivo"><i class="ph ph-prohibit"></i> Anulado</span>
                 <span class="inv-motivo">${escaparHtml(fila.motivo_anulacion || 'Sin motivo')}</span>
                 <span class="inv-motivo-fecha">${formatearFechaHora(fila.anulado_en)}</span>`
              : '<span class="tabla-badge activo"><i class="ph ph-check-circle"></i> Vigente</span>',
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
              ${fila.anulado ? '' : `
              <button class="btn-accion btn-editar" data-accion="editar-cargo" data-id="${fila.numero_cargo}" title="Editar datos">
                <i class="ph ph-pencil-simple"></i>
              </button>`}
              ${(fila.anulado || !puedeAnular()) ? '' : `
              <button class="btn-accion btn-eliminar" data-accion="anular-cargo" data-id="${fila.numero_cargo}" title="Anular cargo">
                <i class="ph ph-prohibit"></i>
              </button>`}
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
        if (btn.dataset.accion === 'editar-cargo') abrirEditarCargo(id)
        if (btn.dataset.accion === 'anular-cargo') abrirAnularCargo(id)
      })
    } catch (err) {
      console.error('[Inventario] Error en renderizarDescontar():', err)
    }
  }

    async function generarNumeroCargo() {
    const anio = window.obtenerAhora().getFullYear()
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
        const fecha = window.datePickerCargo?.obtenerValor() || window.obtenerAhora().toISOString().slice(0, 10)

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

      cerrarModal('modalCargo')
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
      .select('numero_cargo, area_solicitante, responsable_receptor, created_at, anulado, motivo_anulacion, anulado_en, cantidad, articulo_id, observacion')
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
          observacion: m.observacion,
          anulado: m.anulado === true,
          motivo_anulacion: m.motivo_anulacion,
          anulado_en: m.anulado_en,
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
      .select('*, inventario_articulos!inner(nombre, codigo, unidad_medida)')
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
    const doc = new jsPDF('p', 'mm', 'a4')      // A4 vertical

    const pageW = 210
    const pageH = 297
    const margin = 15
    const contentW = pageW - margin * 2

    // ─── Encabezado: logo + título subrayado ───
    if (logoBase64) {
      doc.addImage(logoBase64, 'JPEG', margin, 12, 26, 20)
    }

    const titulo = 'CARGO DE ENTREGA DE UTILES DE OFICINA'
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(titulo, margin + 32, 24)
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.6)
    doc.line(margin + 32, 26.5, margin + 32 + doc.getTextWidth(titulo), 26.5)

    // ─── Fecha ───
    const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    if (cargo.created_at) {
      const f = new Date(cargo.created_at)
      doc.text(`CHINCHA, ${f.getDate()} DE ${MESES[f.getMonth()]} DEL ${f.getFullYear()}`,
        pageW - margin, 45, { align: 'right' })
    }

    // ─── Párrafo de entrega ───
    let y = 57
    const parrafo = `QUE, LA OFICINA DE LA UNIDAD DE SEGUROS REALIZA LA ENTREGA DE LOS SIGUIENTES UTILES DE ESCRITORIO AL SERVICIO DE ${(cargo.area_solicitante || '—').toUpperCase()}`
    const lineas = doc.splitTextToSize(parrafo, contentW)
    lineas.forEach((l, i) => doc.text(l, margin, y + i * 5.3))
    y += lineas.length * 5.3 + 8

    // ─── Tabla de artículos ───
    const COL = [
      { titulo: 'N°',       ancho: 14,  alinear: 'center' },
      { titulo: 'ARTICULO', ancho: 116, alinear: 'left'   },
      { titulo: 'CANT.',    ancho: 22,  alinear: 'center' },
      { titulo: 'UNIDAD',   ancho: 28,  alinear: 'center' }
    ]
    const ALTO_CABECERA = 7
    const ALTO_LINEA = 4.2
    const PAD = 2

    function xColumna(i) {
      let x = margin
      for (let k = 0; k < i; k++) x += COL[k].ancho
      return x
    }

    function textoCelda(texto, i, yTexto) {
      const x = xColumna(i)
      if (COL[i].alinear === 'center') {
        doc.text(String(texto), x + COL[i].ancho / 2, yTexto, { align: 'center' })
      } else {
        doc.text(String(texto), x + PAD, yTexto)
      }
    }

    function dibujarCabecera() {
      doc.setFillColor(41, 128, 185)          // azul del formato
      doc.rect(margin, y, contentW, ALTO_CABECERA, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      COL.forEach((c, i) => textoCelda(c.titulo, i, y + 4.8))
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      y += ALTO_CABECERA
    }

    dibujarCabecera()

    doc.setFontSize(8)
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.2)

    movimientos.forEach((m, idx) => {
      const art = m.inventario_articulos || {}
      const nombre = (art.nombre || '—').toUpperCase()
      const unidad = art.unidad_medida || 'unidades'
      const textoNombre = doc.splitTextToSize(nombre, COL[1].ancho - PAD * 2)
      const altoFila = Math.max(7, textoNombre.length * ALTO_LINEA + 3)

      // salto de página si la fila ya no entra
      if (y + altoFila > pageH - 60) {
        doc.addPage()
        y = 25
        dibujarCabecera()
        doc.setFontSize(8)
      }

      doc.rect(margin, y, contentW, altoFila)
      let x = margin
      COL.forEach((c) => {
        x += c.ancho
        if (x < margin + contentW - 0.1) doc.line(x, y, x, y + altoFila)
      })

      const yTexto = y + altoFila / 2 + 1.2
      textoCelda(idx + 1, 0, yTexto)
      textoNombre.forEach((linea, i) =>
        doc.text(linea, xColumna(1) + PAD, y + 4.5 + i * ALTO_LINEA))
      textoCelda(m.cantidad, 2, yTexto)
      textoCelda(unidad, 3, yTexto)

      y += altoFila
    })

    y += 6

    if (cargo.observacion) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text('OBSERVACION:', margin, y)
      doc.setFont('helvetica', 'normal')
      const obs = doc.splitTextToSize(cargo.observacion, contentW - 32)
      obs.forEach((l, i) => doc.text(l, margin + 32, y + i * 4.5))
      y += obs.length * 4.5 + 6
    }

  
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('RECIBI CONFORME:', margin, y)

    y = Math.max(y + 30, pageH - 75)
    const anchoFirma = 45
    const separacion = (contentW - anchoFirma * 3) / 2
    const firmas = ['ENTREGA', 'RECIBE', 'V°B°']

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)
    doc.setFontSize(9)

    firmas.forEach((texto, i) => {
      const x = margin + i * (anchoFirma + separacion)
      doc.line(x, y, x + anchoFirma, y)
      doc.text(texto, x + anchoFirma / 2, y + 5, { align: 'center' })
    })

  
    const totalPaginas = doc.internal.getNumberOfPages()
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p)
      doc.setFontSize(7.5)
      doc.setTextColor(130, 130, 130)
      doc.text(`Cargo: ${numeroCargo} - Pagina ${p} de ${totalPaginas}`,
        pageW / 2, pageH - 12, { align: 'center' })
      doc.setTextColor(0, 0, 0)
    }

    return doc.output('blob')
  }

  /* ── Ver / descargar el cargo ── */
  async function verCargoPdf(numeroCargo) {
    try {
      const blob = await generarPDFCargo(numeroCargo)
      if (!blob) { alert('No se encontraron artículos para este cargo.'); return }
      const url = URL.createObjectURL(blob)

      const modal = document.getElementById('modalVerCargoPdf')
      const visor = modal ? modal.querySelector('iframe, embed, object') : null

      if (modal && visor) {
        if (visor.tagName === 'OBJECT') visor.data = url
        else visor.src = url
        const btnDesc = document.getElementById('btnDescargarCargoPdf')
        if (btnDesc) btnDesc.dataset.numeroCargo = numeroCargo
        modal.classList.add('activo')
      } else {
        window.open(url, '_blank')
      }
    } catch (err) {
      console.error('[Inventario] Error en verCargoPdf():', err)
      alert('No se pudo generar el PDF: ' + (err.message || err))
    }
  }

  async function descargarCargoPdf(numeroCargo) {
    try {
      const blob = await generarPDFCargo(numeroCargo)
      if (!blob) { alert('No se encontraron artículos para este cargo.'); return }
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${numeroCargo}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch (err) {
      console.error('[Inventario] Error en descargarCargoPdf():', err)
      alert('No se pudo generar el PDF: ' + (err.message || err))
    }
  }

  async function generarPDFyDescargar(numeroCargo) {
    setTimeout(() => descargarCargoPdf(numeroCargo), 500)
  }


  /* ════════════════════════════════════════════
     EDITAR MOVIMIENTO (datos que no afectan el stock)
     ════════════════════════════════════════════ */
  function abrirEditarMovimiento(id, lista) {
    const m = (lista || []).find(x => x.id === id)
    if (!m) return
    movimientoEditando = { tipo: 'entrada', id: m.id }

    document.getElementById('tituloEditarMovimiento').textContent = 'Editar entrada'
    const art = m.inventario_articulos || {}
    document.getElementById('subtituloEditarMovimiento').textContent =
      `${art.codigo || ''} — ${art.nombre || ''} · ${m.cantidad} unidad(es)`

    document.getElementById('grupoEditarProveedor').style.display = ''
    document.getElementById('grupoEditarDocumento').style.display = ''
    document.getElementById('grupoEditarResponsable').style.display = 'none'

    document.getElementById('editProveedor').value = m.proveedor || ''
    document.getElementById('editDocumento').value = m.numero_documento || ''
    document.getElementById('editObservacion').value = m.observacion || ''
    document.getElementById('errorEditarMovimiento').style.display = 'none'

    abrirModal('modalEditarMovimiento')
  }

  async function abrirEditarCargo(numeroCargo) {
    const { data } = await supabase
      .from('inventario_movimientos')
      .select('responsable_receptor, observacion, area_solicitante')
      .eq('numero_cargo', numeroCargo)
      .limit(1)
      .maybeSingle()

    if (!data) return
    movimientoEditando = { tipo: 'cargo', numeroCargo }

    document.getElementById('tituloEditarMovimiento').textContent = 'Editar cargo de entrega'
    document.getElementById('subtituloEditarMovimiento').textContent =
      `${numeroCargo} · ${data.area_solicitante || ''}`

    document.getElementById('grupoEditarProveedor').style.display = 'none'
    document.getElementById('grupoEditarDocumento').style.display = 'none'
    document.getElementById('grupoEditarResponsable').style.display = ''

    document.getElementById('editResponsable').value = data.responsable_receptor || ''
    document.getElementById('editObservacion').value = data.observacion || ''
    document.getElementById('errorEditarMovimiento').style.display = 'none'

    abrirModal('modalEditarMovimiento')
  }

  async function guardarEdicionMovimiento() {
    if (!movimientoEditando) return
    const errorEl = document.getElementById('errorEditarMovimiento')
    const btn = document.getElementById('btnGuardarEditarMovimiento')
    errorEl.style.display = 'none'
    btn.disabled = true

    let error = null

    if (movimientoEditando.tipo === 'entrada') {
      const res = await supabase.from('inventario_movimientos').update({
        proveedor: document.getElementById('editProveedor').value.trim() || null,
        numero_documento: document.getElementById('editDocumento').value.trim() || null,
        observacion: document.getElementById('editObservacion').value.trim() || null,
      }).eq('id', movimientoEditando.id)
      error = res.error
    } else {
      const responsable = document.getElementById('editResponsable').value.trim()
      if (!responsable) {
        errorEl.textContent = 'El responsable receptor es obligatorio.'
        errorEl.style.display = 'block'
        btn.disabled = false
        return
      }
      const res = await supabase.from('inventario_movimientos').update({
        responsable_receptor: responsable,
        observacion: document.getElementById('editObservacion').value.trim() || null,
      }).eq('numero_cargo', movimientoEditando.numeroCargo)
      error = res.error
    }

    btn.disabled = false

    if (error) {
      errorEl.textContent = 'No se pudo guardar: ' + error.message
      errorEl.style.display = 'block'
      return
    }

    cerrarModal('modalEditarMovimiento')
    movimientoEditando = null
    await cargarUltimasEntradas()
    await cargarCargosRecientes()
  }

  /* ════════════════════════════════════════════
     ANULAR MOVIMIENTO (devuelve el stock, deja rastro)
     ════════════════════════════════════════════ */
  function abrirAnularEntrada(id, lista) {
    const m = (lista || []).find(x => x.id === id)
    if (!m) return
    const art = m.inventario_articulos || {}

    anulacionPendiente = { tipo: 'entrada', id: m.id, articuloId: m.articulo_id, cantidad: m.cantidad }

    document.getElementById('tituloAnular').textContent = 'Anular entrada'
    document.getElementById('detalleAnular').innerHTML = `
      <dt>Artículo</dt><dd>${escaparHtml(`${art.codigo || ''} — ${art.nombre || ''}`)}</dd>
      <dt>Cantidad</dt><dd>${m.cantidad}</dd>
      <dt>Proveedor</dt><dd>${escaparHtml(m.proveedor || '—')}</dd>
      <dt>Fecha</dt><dd>${formatearFechaHora(m.created_at)}</dd>`
    document.getElementById('avisoStockAnular').innerHTML =
      `<i class="ph ph-arrow-circle-down"></i> Se descontarán <b>${m.cantidad}</b> unidad(es) del stock, porque esta entrada las había sumado.`

    document.getElementById('motivoAnulacion').value = ''
    document.getElementById('errorAnular').style.display = 'none'
    abrirModal('modalAnularMovimiento')
  }

  async function abrirAnularCargo(numeroCargo) {
    const { data } = await supabase
      .from('inventario_movimientos')
      .select('id, cantidad, articulo_id, area_solicitante, responsable_receptor, created_at, inventario_articulos!inner(nombre, codigo)')
      .eq('numero_cargo', numeroCargo)

    if (!data || !data.length) return

    anulacionPendiente = { tipo: 'cargo', numeroCargo, items: data }
    const total = data.reduce((s, m) => s + m.cantidad, 0)

    document.getElementById('tituloAnular').textContent = 'Anular cargo de entrega'
    document.getElementById('detalleAnular').innerHTML = `
      <dt>N° Cargo</dt><dd>${escaparHtml(numeroCargo)}</dd>
      <dt>Área</dt><dd>${escaparHtml(data[0].area_solicitante || '—')}</dd>
      <dt>Responsable</dt><dd>${escaparHtml(data[0].responsable_receptor || '—')}</dd>
      <dt>Fecha</dt><dd>${formatearFechaHora(data[0].created_at)}</dd>
      <dt>Artículos</dt><dd>${data.map(m =>
        `${escaparHtml(m.inventario_articulos?.nombre || '')} × ${m.cantidad}`).join('<br>')}</dd>`
    document.getElementById('avisoStockAnular').innerHTML =
      `<i class="ph ph-arrow-circle-up"></i> Se devolverán <b>${total}</b> unidad(es) al stock del almacén.`

    document.getElementById('motivoAnulacion').value = ''
    document.getElementById('errorAnular').style.display = 'none'
    abrirModal('modalAnularMovimiento')
  }

  async function confirmarAnulacion() {
    if (!anulacionPendiente) return
    const motivo = document.getElementById('motivoAnulacion').value.trim()
    const errorEl = document.getElementById('errorAnular')
    const btn = document.getElementById('btnConfirmarAnular')
    errorEl.style.display = 'none'

    if (!motivo) {
      errorEl.textContent = 'Escribe el motivo de la anulación.'
      errorEl.style.display = 'block'
      return
    }

    btn.disabled = true
    document.getElementById('textoConfirmarAnular').textContent = 'Anulando...'

    try {
      const marca = {
        anulado: true,
        anulado_en: new Date().toISOString(),
        anulado_por: perfilActual.id,
        motivo_anulacion: motivo,
      }

      if (anulacionPendiente.tipo === 'entrada') {
        // La entrada sumó stock: al anular, se resta
        const { data: art } = await supabase.from('inventario_articulos')
          .select('stock_actual').eq('id', anulacionPendiente.articuloId).single()
        if (!art) throw new Error('Artículo no encontrado')

        const nuevoStock = (art.stock_actual || 0) - anulacionPendiente.cantidad
        if (nuevoStock < 0) {
          throw new Error(`No se puede anular: el stock actual es ${art.stock_actual} y esta entrada aportó ${anulacionPendiente.cantidad}. Parte ya fue entregada.`)
        }

        const { error: e1 } = await supabase.from('inventario_articulos')
          .update({ stock_actual: nuevoStock }).eq('id', anulacionPendiente.articuloId)
        if (e1) throw new Error(e1.message)

        const { error: e2 } = await supabase.from('inventario_movimientos')
          .update(marca).eq('id', anulacionPendiente.id)
        if (e2) throw new Error(e2.message)

      } else {
        // El cargo restó stock: al anular, se devuelve
        for (const item of anulacionPendiente.items) {
          const { data: art } = await supabase.from('inventario_articulos')
            .select('stock_actual').eq('id', item.articulo_id).single()
          if (!art) continue
          const { error: e1 } = await supabase.from('inventario_articulos')
            .update({ stock_actual: (art.stock_actual || 0) + item.cantidad })
            .eq('id', item.articulo_id)
          if (e1) throw new Error(e1.message)
        }

        const { error: e2 } = await supabase.from('inventario_movimientos')
          .update(marca).eq('numero_cargo', anulacionPendiente.numeroCargo)
        if (e2) throw new Error(e2.message)
      }

      cerrarModal('modalAnularMovimiento')
      anulacionPendiente = null
      await cargarUltimasEntradas()
      await cargarCargosRecientes()
      await cargarArticulos()
      await renderizarResumen()

    } catch (err) {
      errorEl.textContent = err.message || 'No se pudo anular.'
      errorEl.style.display = 'block'
    }

    btn.disabled = false
    document.getElementById('textoConfirmarAnular').textContent = 'Anular'
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
          {
            clave: 'anulado', titulo: 'Estado',
            render: (v, fila) => v
              ? `<span class="tabla-badge inactivo"><i class="ph ph-prohibit"></i> Anulado</span>
                 <span class="inv-motivo">${escaparHtml(fila.motivo_anulacion || 'Sin motivo')}</span>`
              : '<span class="tabla-badge activo">Vigente</span>',
          },
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

    // ─── Editar movimiento ───
    document.getElementById('btnCerrarEditarMovimiento').addEventListener('click', () => cerrarModal('modalEditarMovimiento'))
    document.getElementById('btnCancelarEditarMovimiento').addEventListener('click', () => cerrarModal('modalEditarMovimiento'))
    document.getElementById('btnGuardarEditarMovimiento').addEventListener('click', guardarEdicionMovimiento)
    document.getElementById('modalEditarMovimiento').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) cerrarModal('modalEditarMovimiento')
    })

    // ─── Anular movimiento ───
    document.getElementById('btnCerrarAnular').addEventListener('click', () => cerrarModal('modalAnularMovimiento'))
    document.getElementById('btnCancelarAnular').addEventListener('click', () => cerrarModal('modalAnularMovimiento'))
    document.getElementById('btnConfirmarAnular').addEventListener('click', confirmarAnulacion)
    document.getElementById('modalAnularMovimiento').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) cerrarModal('modalAnularMovimiento')
    })
  }

    // Exponer las funciones del cargo para los botones del HTML
  window.verCargoPdf = verCargoPdf
  window.descargarCargoPdf = descargarCargoPdf
  window.generarPDFyDescargar = generarPDFyDescargar
})()
