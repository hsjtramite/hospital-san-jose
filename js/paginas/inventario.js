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

  /* Estado para editar/eliminar entradas */
  let entradaEditandoId = null
  let entradaEliminandoId = null
  let datosEntradasCache = []

  /* Estado para editar/eliminar cargos */
  let cargoEliminandoNumero = null
  let articulosSeleccionadosCargoModal = []
  let numeroCargoModal = null
  let modoCargoModal = 'crear'

  /* Estado para modal de entrada */
  let modoEntradaModal = 'crear'
  let entradaModalInicializado = false

  /* Estado para modal de artículo */
  let articuloModalInicializado = false

  const CATEGORIAS_PREDEFINIDAS = [
    'Utiles de Oficina', 'Material de Limpieza', 'Material de Impresion',
    'Equipos de Computo', 'Papeleria', 'Archivamiento', 'Otros'
  ]
  const UNIDADES_PREDEFINIDAS = [
    'Unidad', 'Caja', 'Paquete', 'Resma', 'Millar', 'Docena', 'Bolsa', 'Sobre', 'Juego', 'Kit'
  ]

  /* Referencias a tablas (Tabla class) */
  let tablaCatalogo = null
  let tablaCargos = null
  let tablaKardex = null
  let tablaEntradas = null
  let ingresoInicializado = false
  let descontarInicializado = false

  /* ════════════════════════════════════════════
     INICIALIZACION
     ════════════════════════════════════════════ */
  document.addEventListener('lateral:listo', inicializar)

  async function inicializar() {
    try {
      if (document.body.dataset.moduloActivo !== 'inventario') return

      supabase = window.supabase
      if (!supabase) { console.error('[Inventario] window.supabase no disponible'); return }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        console.error('[Inventario] Sin sesion:', sessionError)
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
      const sel = String(o.valor) === valor ? ' seleccionada' : ''
      return `<div class="filtro-option${sel}" data-value="${o.valor}">${escaparHtml(o.texto)}</div>`
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
      const desabastecidos = resArticulos.data ? resArticulos.data.filter(a => a.stock_actual === 0).length : 0
      const stockBajo = resArticulos.data ? resArticulos.data.filter(a => a.stock_actual > 0 && a.stock_actual <= 10).length : 0
      const entradas = resEntradas.count || 0
      const salidas = resSalidas.count || 0
      const ultimo = resUltimo.data ? formatearFechaHora(resUltimo.data.created_at) : '—'

      document.getElementById('resumenTotalArticulos').textContent = total
      document.getElementById('resumenStockDisponible').textContent = stockTotal
      document.getElementById('resumenDesabastecidos').textContent = desabastecidos
      document.getElementById('resumenStockBajo').textContent = stockBajo
      document.getElementById('resumenEntradas').textContent = entradas
      document.getElementById('resumenSalidas').textContent = salidas
      document.getElementById('resumenUltimoMovimiento').textContent = ultimo
    } catch (err) {
      console.error('[Inventario] Error en renderizarResumen():', err)
    }
  }

  /* ════════════════════════════════════════════
     TAB: CATALOGO
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
          <input type="text" class="filtro-input" id="buscarArticulo" placeholder="Buscar articulo..." />
        </div>
        <button class="btn-filled-md" id="btnImportarExcel">
          <i class="ph ph-file-xls"></i> Importar Excel
        </button>
        <input type="file" id="inputImportarExcel" accept=".xlsx,.xls" style="display:none;" />
        <button class="btn-filled-md" id="btnNuevoArticulo" style="margin-left:auto;">Nuevo Articulo</button>
      </div>
    `

      tablaCatalogo = new Tabla({
        headerHTML,
        columnas: [
          { clave: 'codigo', titulo: 'Codigo' },
          { clave: 'nombre', titulo: 'Nombre' },
          { clave: 'categoria', titulo: 'Categoria' },
          { clave: 'unidad_medida', titulo: 'Unidad' },
          { clave: 'stock_actual', titulo: 'Stock Actual' },
          { clave: 'stock_minimo', titulo: 'Stock Minimo' },
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

      /* ════════════════════════════════════════════
         FIX #1: Listener de acciones del CATÁLOGO
         Antes tenía acciones de CARGO (ver-pdf, descargar-pdf, 
         editar-cargo, eliminar-cargo). Ahora tiene las
         acciones correctas de ARTÍCULO.
         ════════════════════════════════════════════ */
      contenedor.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]')
        if (!btn) return
        e.stopPropagation()
        const id = btn.dataset.id

        // Acciones de ARTÍCULO (corregido)
        if (btn.dataset.accion === 'editar') editarArticulo(id)
        if (btn.dataset.accion === 'eliminar') toggleEstadoArticulo(id, false)
        if (btn.dataset.accion === 'reactivar') toggleEstadoArticulo(id, true)
      })

      document.getElementById('buscarArticulo').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') aplicarFiltrosCatalogo()
      })

      document.getElementById('btnNuevoArticulo').addEventListener('click', abrirModalNuevoArticulo)
      document.getElementById('btnImportarExcel').addEventListener('click', () => {
        document.getElementById('inputImportarExcel').click()
      })
      document.getElementById('inputImportarExcel').addEventListener('change', procesarExcelCatalogo)

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
    const input = document.getElementById('buscarArticulo')
    const texto = (input?.value || '').toLowerCase().trim()
    const filtroStock = input?.dataset?.filtroStock || ''

    let filtrados = articulos.filter(a => {
      if (!texto) return true
      return (a.nombre || '').toLowerCase().includes(texto) ||
        (a.codigo || '').toLowerCase().includes(texto) ||
        (a.categoria || '').toLowerCase().includes(texto)
    })

    if (filtroStock === 'desabastecido') {
      filtrados = filtrados.filter(a => a.stock_actual === 0)
    } else if (filtroStock === 'bajo') {
      filtrados = filtrados.filter(a => a.stock_actual > 0 && a.stock_actual <= 10)
    }

    tablaCatalogo.actualizar(filtrados)
  }

  /* ════════════════════════════════════════════
     MODAL ARTÍCULO (CREAR / EDITAR)
     Reemplaza el panel lateral anterior
     ════════════════════════════════════════════ */
  function abrirModalNuevoArticulo() {
    editandoArticuloId = null
    document.getElementById('articuloModalTitulo').textContent = 'Nuevo Artículo'
    document.getElementById('articuloModalSubtitulo').textContent = ''
    document.getElementById('textoGuardarArticuloModal').textContent = 'Guardar'

    // Resetear campos
    document.getElementById('campoCodigoModal').value = ''
    document.getElementById('campoNombreArticuloModal').value = ''
    document.getElementById('campoStockMinimoModal').value = ''
    document.getElementById('campoArticuloActivoModal').checked = true

    const catOpts = CATEGORIAS_PREDEFINIDAS.map(c => ({ valor: c, texto: c }))
    const uniOpts = UNIDADES_PREDEFINIDAS.map(u => ({ valor: u, texto: u }))

    if (!articuloModalInicializado) {
      inicializarDesplegable('wrapperCategoriaModal', 'triggerCategoriaModal', 'dropdownCategoriaModal', catOpts)
      inicializarDesplegable('wrapperUnidadModal', 'triggerUnidadModal', 'dropdownUnidadModal', uniOpts)
      articuloModalInicializado = true
    }

    actualizarOpcionesDesplegable('wrapperCategoriaModal', 'triggerCategoriaModal', 'dropdownCategoriaModal', catOpts, '', 'Seleccione una categoria')
    actualizarOpcionesDesplegable('wrapperUnidadModal', 'triggerUnidadModal', 'dropdownUnidadModal', uniOpts, '', 'Seleccione una unidad')

    limpiarErrores(document.getElementById('modalArticulo'))
    document.getElementById('modalArticulo').classList.add('activo')
    setTimeout(() => document.getElementById('campoNombreArticuloModal').focus(), 200)
  }

  function editarArticulo(id) {
    const art = articulos.find(a => a.id === id)
    if (!art) return

    editandoArticuloId = id
    document.getElementById('articuloModalTitulo').textContent = 'Editar Artículo'
    document.getElementById('articuloModalSubtitulo').textContent = `Código: ${art.codigo || '—'}`
    document.getElementById('textoGuardarArticuloModal').textContent = 'Actualizar'

    // Prellenar campos
    document.getElementById('campoCodigoModal').value = art.codigo || ''
    document.getElementById('campoNombreArticuloModal').value = art.nombre || ''
    document.getElementById('campoStockMinimoModal').value = art.stock_minimo || 0
    document.getElementById('campoArticuloActivoModal').checked = art.activo ?? true

    const catOpts = CATEGORIAS_PREDEFINIDAS.map(c => ({ valor: c, texto: c }))
    const uniOpts = UNIDADES_PREDEFINIDAS.map(u => ({ valor: u, texto: u }))

    if (!articuloModalInicializado) {
      inicializarDesplegable('wrapperCategoriaModal', 'triggerCategoriaModal', 'dropdownCategoriaModal', catOpts)
      inicializarDesplegable('wrapperUnidadModal', 'triggerUnidadModal', 'dropdownUnidadModal', uniOpts)
      articuloModalInicializado = true
    }

    actualizarOpcionesDesplegable('wrapperCategoriaModal', 'triggerCategoriaModal', 'dropdownCategoriaModal', catOpts, art.categoria)
    actualizarOpcionesDesplegable('wrapperUnidadModal', 'triggerUnidadModal', 'dropdownUnidadModal', uniOpts, art.unidad_medida)

    limpiarErrores(document.getElementById('modalArticulo'))
    document.getElementById('modalArticulo').classList.add('activo')
    setTimeout(() => document.getElementById('campoNombreArticuloModal').focus(), 200)
  }

  function cerrarModalArticulo() {
    document.getElementById('modalArticulo').classList.remove('activo')
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

  async function guardarArticuloModal() {
    limpiarErrores(document.getElementById('modalArticulo'))

    let codigo = document.getElementById('campoCodigoModal').value.trim()
    const nombre = document.getElementById('campoNombreArticuloModal').value.trim()
    const categoria = document.getElementById('triggerCategoriaModal')?.dataset?.value || ''
    const unidadMedida = document.getElementById('triggerUnidadModal')?.dataset?.value || ''
    const stockMinimo = parseInt(document.getElementById('campoStockMinimoModal').value) || 0
    const activo = document.getElementById('campoArticuloActivoModal').checked

    let hayError = false
    if (!nombre) { mostrarError('errorNombreArticuloModal', 'El nombre es obligatorio'); hayError = true }
    if (!categoria) { mostrarError('errorCategoriaModal', 'Seleccione una categoria'); hayError = true }
    if (!unidadMedida) { mostrarError('errorUnidadModal', 'Seleccione una unidad'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnGuardarArticuloModal', 'spinnerArticuloModal', 'textoGuardarArticuloModal', true)

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
            mostrarError('errorCodigoModal', 'El codigo ya existe')
          } else {
            mostrarError('errorNombreArticuloModal', error.message || 'Error al actualizar')
          }
          setCargandoBoton('btnGuardarArticuloModal', 'spinnerArticuloModal', 'textoGuardarArticuloModal', false, 'Actualizar')
          return
        }
      } else {
        const { error } = await supabase
          .from('inventario_articulos')
          .insert({ codigo, nombre, categoria, unidad_medida: unidadMedida, stock_minimo: stockMinimo, activo })

        if (error) {
          if (error.code === '23505') {
            mostrarError('errorCodigoModal', 'El codigo ya existe')
          } else {
            mostrarError('errorNombreArticuloModal', error.message || 'Error al crear')
          }
          setCargandoBoton('btnGuardarArticuloModal', 'spinnerArticuloModal', 'textoGuardarArticuloModal', false, 'Guardar')
          return
        }
      }

      cerrarModalArticulo()
      await cargarArticulos()
    } catch (err) {
      mostrarError('errorNombreArticuloModal', 'Error de conexion')
    }
    setCargandoBoton('btnGuardarArticuloModal', 'spinnerArticuloModal', 'textoGuardarArticuloModal', false, editandoArticuloId ? 'Actualizar' : 'Guardar')
  }

  let eliminarArticuloPendiente = null
  let reactivarArticuloPendiente = false

  function toggleEstadoArticulo(id, reactivar) {
    const art = articulos.find(a => a.id === id)
    if (!art) return
    eliminarArticuloPendiente = id
    reactivarArticuloPendiente = reactivar

    document.getElementById('tituloEliminarArticulo').textContent = reactivar ? 'Reactivar articulo' : 'Desactivar articulo'
    document.getElementById('textoEliminarArticulo').textContent = reactivar
      ? 'Esta seguro de que desea reactivar este articulo?'
      : 'Esta seguro de que desea desactivar este articulo?'
    document.getElementById('textoConfirmarEliminarArticulo').textContent = reactivar ? 'Activar' : 'Desactivar'
    const btn = document.getElementById('btnConfirmarEliminarArticulo')
    btn.className = reactivar ? 'btn-filled-md' : 'btn-filled-md btn-peligro-md'

    document.getElementById('modalEliminarArticulo').classList.add('activo')
  }

  /* ════════════════════════════════════════════
     IMPORTACION EXCEL — CATALOGO
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
        alert('El archivo Excel debe contener las columnas "DESCRIPCION" y "UNIDAD DE SEGUROS" para poder importar. Verifique que los encabezados esten escritos correctamente.')
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

      console.log(`[Inventario] Diagnostico Excel:
  Total filas analizadas: ${totalFilas}
  Descripcion vacia: ${descVacia}
  Cantidad vacia: ${cantVacia}
  Cantidad <= 0: ${cantCero}
  Registros validos: ${datosImportacionPreview.length}`)

      if (datosImportacionPreview.length === 0) {
        alert('No se encontraron datos validos despues de la fila de encabezados. Asegurese de que las filas contengan descripcion y cantidad (UNIDAD DE SEGUROS).')
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
            observacion: 'Importacion desde Excel',
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
            observacion: 'Importacion desde Excel',
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

        if (errArt) throw new Error('Error al crear articulos: ' + errArt.message)

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

      setCargandoBoton('btnConfirmarPreview', 'spinnerPreview', 'textoConfirmarPreview', false, 'Confirmar Importacion')
      document.getElementById('modalPreviewImportacion').classList.remove('activo')

      alert(`Importacion completada.\nProcesados: ${datosImportacionPreview.length}\nErrores: 0`)
      datosImportacionPreview = []
      await cargarArticulos()
      await renderizarResumen()

    } catch (err) {
      alert('Error en la importacion: ' + err.message)
      setCargandoBoton('btnConfirmarPreview', 'spinnerPreview', 'textoConfirmarPreview', false, 'Confirmar Importacion')
    }
  }

  /* ════════════════════════════════════════════
     TAB: INGRESAR
     ════════════════════════════════════════════ */
  async function renderizarIngresar() {
    try {
      await cargarArticulos()

      const contenedor = document.getElementById('entradaHistorialContent')
      if (!contenedor) { console.error('[Inventario] #entradaHistorialContent no encontrado'); return }

      if (tablaEntradas) { await cargarEntradasRecientes(); return }

      const headerHTML = `<div class="tabla-header-filtros" style="border-bottom:none;padding-bottom:0;"></div>`

      tablaEntradas = new Tabla({
        headerHTML,
        columnas: [
          { clave: 'fecha', titulo: 'Fecha', render: (v) => formatearFecha(v) },
          { clave: 'articulo_nombre', titulo: 'Articulo' },
          { clave: 'cantidad', titulo: 'Cantidad' },
          { clave: 'proveedor', titulo: 'Proveedor', render: (v) => escaparHtml(v || '—') },
          { clave: 'usuario_nombre', titulo: 'Usuario', render: (v) => escaparHtml(v || '—') },
          { clave: 'observacion', titulo: 'Observacion', render: (v) => escaparHtml(v || '—') },
          {
            clave: 'acciones', titulo: '',
            render: (v, fila) => `
              <div class="acciones-tabla">
                <button class="btn-accion btn-editar" data-accion="editar-entrada" data-id="${fila.id}" title="Editar entrada">
                  <i class="ph ph-pencil-simple"></i>
                </button>
                <button class="btn-accion btn-eliminar" data-accion="eliminar-entrada" data-id="${fila.id}" title="Eliminar entrada">
                  <i class="ph ph-trash-simple"></i>
                </button>
              </div>
            `,
          },
        ],
      })

      contenedor.appendChild(tablaEntradas.obtenerElemento())
      await cargarEntradasRecientes()

      contenedor.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-accion]')
        if (!btn) return
        e.stopPropagation()
        e.preventDefault()
        const id = btn.dataset.id
        console.log('[Inventario] Click en accion entrada:', btn.dataset.accion, 'ID:', id)

        try {
          if (btn.dataset.accion === 'editar-entrada') await editarEntrada(id)
          if (btn.dataset.accion === 'eliminar-entrada') confirmarEliminarEntrada(id)
        } catch (err) {
          console.error('[Inventario] Error en accion entrada:', btn.dataset.accion, err)
        }
      })
    } catch (err) {
      console.error('[Inventario] Error en renderizarIngresar():', err)
    }
  }

  async function cargarEntradasRecientes() {
    const { data, error } = await supabase
      .from('inventario_movimientos')
      .select('*, inventario_articulos!inner(nombre, codigo)')
      .eq('tipo', 'entrada')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) { console.error('[Inventario] Error cargarEntradasRecientes:', error); return }

    datosEntradasCache = data || []

    const entradas = (data || []).map(m => {
      const art = m.inventario_articulos || {}
      return {
        id: m.id,
        fecha: m.created_at ? m.created_at.slice(0, 10) : '',
        articulo_nombre: `${art.codigo || ''} — ${art.nombre || ''}`,
        cantidad: m.cantidad,
        proveedor: m.proveedor,
        usuario_nombre: m.usuario_id === perfilActual.id
          ? `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim()
          : '—',
        observacion: m.observacion,
      }
    })

    if (tablaEntradas) tablaEntradas.actualizar(entradas)
  }

  /* ─── MODAL ENTRADA ─── */
  function abrirModalNuevaEntrada() {
    modoEntradaModal = 'crear'
    entradaEditandoId = null

    // Prellenar usuario
    document.getElementById('campoUsuarioEntradaModal').value =
      `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim()

    // Resetear campos
    document.getElementById('campoCantidadEntradaModal').value = ''
    document.getElementById('campoProveedorEntradaModal').value = ''
    document.getElementById('campoDocEntradaModal').value = ''
    document.getElementById('campoMotivoEntradaModal').value = ''
    document.getElementById('campoFechaEntradaModal').value = new Date().toISOString().slice(0, 10)

    // Titulos
    document.getElementById('entradaModalTitulo').textContent = 'Nueva Entrada'
    document.getElementById('entradaModalSubtitulo').textContent = ''
    document.getElementById('textoGuardarEntradaModal').textContent = 'Registrar Entrada'

    // Inicializar dropdown de articulos
    const artOpts = articulos.filter(a => a.activo).map(a => ({ valor: a.id, texto: `${a.codigo} — ${a.nombre}` }))

    if (!entradaModalInicializado) {
      inicializarDesplegable('wrapperArticuloEntradaModal', 'triggerArticuloEntradaModal', 'dropdownArticuloEntradaModal', artOpts)
      window.datePickerEntradaModal = new DatePicker('campoFechaEntradaModal')
      entradaModalInicializado = true
    } else {
      actualizarOpcionesDesplegable('wrapperArticuloEntradaModal', 'triggerArticuloEntradaModal', 'dropdownArticuloEntradaModal', artOpts, '', 'Seleccione un articulo')
    }

    limpiarErrores(document.getElementById('modalEntrada'))
    document.getElementById('modalEntrada').classList.add('activo')
  }

  async function editarEntrada(id) {
    const entrada = datosEntradasCache.find(e => e.id === id)
    if (!entrada) return

    modoEntradaModal = 'editar'
    entradaEditandoId = id

    // Prellenar usuario
    document.getElementById('campoUsuarioEntradaModal').value =
      `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim()

    // Prellenar campos
    document.getElementById('campoCantidadEntradaModal').value = entrada.cantidad
    document.getElementById('campoProveedorEntradaModal').value = entrada.proveedor || ''
    document.getElementById('campoDocEntradaModal').value = entrada.numero_documento || ''
    document.getElementById('campoMotivoEntradaModal').value = entrada.observacion || ''

    // Fecha
    if (entrada.created_at) {
      document.getElementById('campoFechaEntradaModal').value = entrada.created_at.slice(0, 10)
      if (window.datePickerEntradaModal) window.datePickerEntradaModal.fechaISO = entrada.created_at.slice(0, 10)
    }

    // Titulos
    document.getElementById('entradaModalTitulo').textContent = 'Editar Entrada'
    document.getElementById('entradaModalSubtitulo').textContent = `Entrada ID: ${id}`
    document.getElementById('textoGuardarEntradaModal').textContent = 'Actualizar Entrada'

    // Inicializar dropdown de articulos con valor seleccionado
    const artOpts = articulos.filter(a => a.activo).map(a => ({ valor: a.id, texto: `${a.codigo} — ${a.nombre}` }))

    if (!entradaModalInicializado) {
      inicializarDesplegable('wrapperArticuloEntradaModal', 'triggerArticuloEntradaModal', 'dropdownArticuloEntradaModal', artOpts)
      window.datePickerEntradaModal = new DatePicker('campoFechaEntradaModal')
      entradaModalInicializado = true
    }

    actualizarOpcionesDesplegable('wrapperArticuloEntradaModal', 'triggerArticuloEntradaModal', 'dropdownArticuloEntradaModal', artOpts, entrada.articulo_id, 'Seleccione un articulo')

    limpiarErrores(document.getElementById('modalEntrada'))
    document.getElementById('modalEntrada').classList.add('activo')
  }

  function cerrarModalEntrada() {
    document.getElementById('modalEntrada').classList.remove('activo')
    entradaEditandoId = null
    modoEntradaModal = 'crear'
  }

  async function guardarEntradaModal() {
    // Si estamos editando, llamar a actualizar
    if (modoEntradaModal === 'editar' && entradaEditandoId) {
      await actualizarEntradaModal()
      return
    }

    limpiarErrores(document.getElementById('modalEntrada'))

    const articuloId = document.getElementById('triggerArticuloEntradaModal')?.dataset?.value || ''
    const cantidad = parseInt(document.getElementById('campoCantidadEntradaModal').value) || 0
    const proveedor = document.getElementById('campoProveedorEntradaModal').value.trim()
    const numeroDoc = document.getElementById('campoDocEntradaModal').value.trim()
    const observacion = document.getElementById('campoMotivoEntradaModal').value.trim()
    const fecha = window.datePickerEntradaModal?.obtenerValor() || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!articuloId) { mostrarError('errorArticuloEntradaModal', 'Seleccione un articulo'); hayError = true }
    if (cantidad <= 0) { mostrarError('errorCantidadEntradaModal', 'Ingrese una cantidad valida'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnGuardarEntradaModal', 'spinnerEntradaModal', 'textoGuardarEntradaModal', true)

    try {
      const { data: art } = await supabase.from('inventario_articulos').select('stock_actual').eq('id', articuloId).single()
      if (!art) throw new Error('Articulo no encontrado')

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

      cerrarModalEntrada()
      await cargarEntradasRecientes()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      mostrarError('errorCantidadEntradaModal', err.message || 'Error al registrar entrada')
    }
    setCargandoBoton('btnGuardarEntradaModal', 'spinnerEntradaModal', 'textoGuardarEntradaModal', false, 'Registrar Entrada')
  }

  async function actualizarEntradaModal() {
    if (!entradaEditandoId) return

    limpiarErrores(document.getElementById('modalEntrada'))

    const articuloId = document.getElementById('triggerArticuloEntradaModal')?.dataset?.value || ''
    const cantidadNueva = parseInt(document.getElementById('campoCantidadEntradaModal').value) || 0
    const proveedor = document.getElementById('campoProveedorEntradaModal').value.trim()
    const numeroDoc = document.getElementById('campoDocEntradaModal').value.trim()
    const observacion = document.getElementById('campoMotivoEntradaModal').value.trim()
    const fecha = window.datePickerEntradaModal?.obtenerValor() || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!articuloId) { mostrarError('errorArticuloEntradaModal', 'Seleccione un articulo'); hayError = true }
    if (cantidadNueva <= 0) { mostrarError('errorCantidadEntradaModal', 'Ingrese una cantidad valida'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnGuardarEntradaModal', 'spinnerEntradaModal', 'textoGuardarEntradaModal', true)

    try {
      // Obtener la entrada original para calcular diferencia de stock
      const { data: entradaOriginal } = await supabase
        .from('inventario_movimientos')
        .select('articulo_id, cantidad, stock_anterior')
        .eq('id', entradaEditandoId)
        .single()

      if (!entradaOriginal) throw new Error('Entrada no encontrada')

      // Obtener stock actual del articulo
      const { data: art } = await supabase
        .from('inventario_articulos')
        .select('stock_actual')
        .eq('id', articuloId)
        .single()

      if (!art) throw new Error('Articulo no encontrado')

      // Calcular nuevo stock: revertir entrada original y aplicar nueva
      let stockBase = art.stock_actual
      if (entradaOriginal.articulo_id === articuloId) {
        // Mismo articulo: quitar cantidad original, sumar nueva
        stockBase = stockBase - entradaOriginal.cantidad + cantidadNueva
      } else {
        // Articulo diferente: revertir en el original, sumar en el nuevo
        const { data: artOriginal } = await supabase
          .from('inventario_articulos')
          .select('stock_actual')
          .eq('id', entradaOriginal.articulo_id)
          .single()
        if (artOriginal) {
          await supabase.from('inventario_articulos')
            .update({ stock_actual: artOriginal.stock_actual - entradaOriginal.cantidad })
            .eq('id', entradaOriginal.articulo_id)
        }
        stockBase = art.stock_actual + cantidadNueva
      }

      // Actualizar stock del articulo
      await supabase.from('inventario_articulos')
        .update({ stock_actual: stockBase })
        .eq('id', articuloId)

      // Actualizar el movimiento
      const { error: errMov } = await supabase.from('inventario_movimientos').update({
        articulo_id: articuloId,
        cantidad: cantidadNueva,
        stock_anterior: stockBase - cantidadNueva,
        stock_actual: stockBase,
        proveedor: proveedor || null,
        numero_documento: numeroDoc || null,
        observacion: observacion || null,
        created_at: fecha + 'T00:00:00+00',
      }).eq('id', entradaEditandoId)

      if (errMov) throw new Error(errMov.message)

      cerrarModalEntrada()
      await cargarEntradasRecientes()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      mostrarError('errorCantidadEntradaModal', err.message || 'Error al actualizar entrada')
    }
    setCargandoBoton('btnGuardarEntradaModal', 'spinnerEntradaModal', 'textoGuardarEntradaModal', false, 'Registrar Entrada')
  }

  /* ─── ELIMINAR ENTRADA ─── */
  function confirmarEliminarEntrada(id) {
    entradaEliminandoId = id
    document.getElementById('modalEliminarEntrada').classList.add('activo')
  }

  async function eliminarEntrada() {
    if (!entradaEliminandoId) return

    try {
      // Obtener datos de la entrada para revertir stock
      const { data: entrada } = await supabase
        .from('inventario_movimientos')
        .select('articulo_id, cantidad')
        .eq('id', entradaEliminandoId)
        .single()

      if (!entrada) throw new Error('Entrada no encontrada')

      // Revertir stock
      const { data: art } = await supabase
        .from('inventario_articulos')
        .select('stock_actual')
        .eq('id', entrada.articulo_id)
        .single()

      if (art) {
        const nuevoStock = Math.max(0, (art.stock_actual || 0) - entrada.cantidad)
        await supabase.from('inventario_articulos')
          .update({ stock_actual: nuevoStock })
          .eq('id', entrada.articulo_id)
      }

      // Eliminar movimiento
      const { error } = await supabase
        .from('inventario_movimientos')
        .delete()
        .eq('id', entradaEliminandoId)

      if (error) throw new Error(error.message)

      document.getElementById('modalEliminarEntrada').classList.remove('activo')
      entradaEliminandoId = null

      await cargarEntradasRecientes()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      alert('Error al eliminar entrada: ' + err.message)
      document.getElementById('modalEliminarEntrada').classList.remove('activo')
    }
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
        const btnAgregarArticuloCargo = document.getElementById('btnAgregarArticuloCargo')
        const btnRegistrarCargoEl = document.getElementById('btnRegistrarCargo')
        if (btnAgregarArticuloCargo) btnAgregarArticuloCargo.addEventListener('click', agregarArticuloACargo)
        if (btnRegistrarCargoEl) btnRegistrarCargoEl.addEventListener('click', registrarCargo)
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
          { clave: 'area_solicitante', titulo: 'Area solicitante' },
          { clave: 'responsable_receptor', titulo: 'Responsable' },
          {
            clave: 'total_articulos', titulo: 'Articulos',
            render: (v) => `${v || 0} item(s)`,
          },
          {
            clave: 'acciones', titulo: '',
            render: (v, fila) => `
            <div class="acciones-tabla">
              <button class="btn-accion btn-editar" data-accion="editar-cargo" data-id="${fila.numero_cargo}" title="Editar cargo">
                <i class="ph ph-pencil-simple"></i>
              </button>
              <button class="btn-accion btn-eliminar" data-accion="eliminar-cargo" data-id="${fila.numero_cargo}" title="Eliminar cargo">
                <i class="ph ph-trash-simple"></i>
              </button>
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

      contenedor.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-accion]')
        if (!btn) return
        e.stopPropagation()
        e.preventDefault()
        const id = btn.dataset.id
        console.log('[Inventario] Click en accion:', btn.dataset.accion, 'ID:', id)

        try {
          if (btn.dataset.accion === 'ver-pdf') await verCargoPdf(id)
          if (btn.dataset.accion === 'descargar-pdf') await descargarCargoPdf(id)
          if (btn.dataset.accion === 'editar-cargo') await editarCargo(id)
          if (btn.dataset.accion === 'eliminar-cargo') confirmarEliminarCargo(id)
        } catch (err) {
          console.error('[Inventario] Error en accion:', btn.dataset.accion, err)
        }
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
      document.getElementById('errorArticuloCargo').textContent = 'Seleccione un articulo'
      return
    }
    if (cantidad <= 0) {
      document.getElementById('errorArticuloCargo').textContent = 'Ingrese una cantidad valida'
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
    document.getElementById('triggerArticuloCargo').querySelector('.filtro-select-text').textContent = 'Seleccione un articulo'
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
    const editandoCargo = document.getElementById('btnRegistrarCargo').dataset.editandoCargo

    if (editandoCargo) {
      await actualizarCargo(editandoCargo)
      return
    }

    limpiarErrores(document.querySelector('.cargo-formulario'))

    const area = document.getElementById('triggerAreaCargo')?.dataset?.value || ''
    const responsable = document.getElementById('campoResponsableReceptor').value.trim()
    const observacion = document.getElementById('campoObservacionCargo').value.trim()
    const fecha = window.datePickerCargo?.obtenerValor() || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!area) { mostrarError('errorAreaSolicitante', 'Seleccione un area'); hayError = true }
    if (!responsable) { mostrarError('errorResponsableReceptor', 'El responsable receptor es obligatorio'); hayError = true }
    if (articulosSeleccionadosCargo.length === 0) { mostrarError('errorArticuloCargo', 'Agregue al menos un articulo'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnRegistrarCargo', 'spinnerCargo', 'textoRegistrarCargo', true)

    try {
      const numeroCargo = await generarNumeroCargo()

      for (const item of articulosSeleccionadosCargo) {
        const { data: art } = await supabase.from('inventario_articulos').select('stock_actual').eq('id', item.id).single()
        if (!art) throw new Error(`Articulo ${item.nombre} no encontrado`)
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
      document.getElementById('triggerAreaCargo').querySelector('.filtro-select-text').textContent = 'Seleccione un area'
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

  async function actualizarCargo(numeroCargo) {
    limpiarErrores(document.querySelector('.cargo-formulario'))

    const area = document.getElementById('triggerAreaCargo')?.dataset?.value || ''
    const responsable = document.getElementById('campoResponsableReceptor').value.trim()
    const observacion = document.getElementById('campoObservacionCargo').value.trim()
    const fecha = window.datePickerCargo?.obtenerValor() || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!area) { mostrarError('errorAreaSolicitante', 'Seleccione un area'); hayError = true }
    if (!responsable) { mostrarError('errorResponsableReceptor', 'El responsable receptor es obligatorio'); hayError = true }
    if (articulosSeleccionadosCargo.length === 0) { mostrarError('errorArticuloCargo', 'Agregue al menos un articulo'); hayError = true }
    if (hayError) return

    setCargandoBoton('btnRegistrarCargo', 'spinnerCargo', 'textoRegistrarCargo', true)

    try {
      // 1. Obtener movimientos originales del cargo
      const { data: movimientosOriginales, error: errOrig } = await supabase
        .from('inventario_movimientos')
        .select('id, articulo_id, cantidad')
        .eq('numero_cargo', numeroCargo)
        .eq('tipo', 'salida')

      if (errOrig) throw new Error(errOrig.message)

      // 2. Revertir stock de movimientos originales
      for (const m of movimientosOriginales) {
        const { data: art } = await supabase
          .from('inventario_articulos')
          .select('stock_actual')
          .eq('id', m.articulo_id)
          .single()

        if (art) {
          await supabase.from('inventario_articulos')
            .update({ stock_actual: (art.stock_actual || 0) + m.cantidad })
            .eq('id', m.articulo_id)
        }
      }

      // 3. Eliminar movimientos originales
      await supabase.from('inventario_movimientos')
        .delete()
        .eq('numero_cargo', numeroCargo)
        .eq('tipo', 'salida')

      // 4. Crear nuevos movimientos con datos actualizados
      for (const item of articulosSeleccionadosCargo) {
        const { data: art } = await supabase
          .from('inventario_articulos')
          .select('stock_actual')
          .eq('id', item.id)
          .single()

        if (!art) throw new Error(`Articulo ${item.nombre} no encontrado`)
        if (item.cantidad > art.stock_actual) {
          throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${art.stock_actual}, solicitado: ${item.cantidad}`)
        }

        const nuevoStock = (art.stock_actual || 0) - item.cantidad

        await supabase.from('inventario_articulos')
          .update({ stock_actual: nuevoStock })
          .eq('id', item.id)

        await supabase.from('inventario_movimientos').insert({
          articulo_id: item.id,
          tipo: 'salida',
          cantidad: item.cantidad,
          stock_anterior: art.stock_actual || 0,
          stock_actual: nuevoStock,
          numero_cargo: numeroCargo,
          area_solicitante: area,
          responsable_receptor: responsable,
          observacion: observacion || null,
          usuario_id: perfilActual.id,
        })
      }

      // 5. Resetear formulario
      articulosSeleccionadosCargo = []
      renderizarDetalleCargo()
      document.getElementById('triggerAreaCargo').dataset.value = ''
      document.getElementById('triggerAreaCargo').querySelector('.filtro-select-text').textContent = 'Seleccione un area'
      document.getElementById('dropdownAreaCargo').querySelectorAll('.filtro-option').forEach(o => o.classList.remove('seleccionada'))
      document.getElementById('campoResponsableReceptor').value = ''
      document.getElementById('campoObservacionCargo').value = ''
      document.getElementById('btnRegistrarCargo').dataset.editandoCargo = ''

      const btnTexto = document.getElementById('textoRegistrarCargo')
      if (btnTexto) btnTexto.textContent = 'Registrar Cargo'

      await cargarCargosRecientes()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      mostrarError('errorAreaSolicitante', err.message || 'Error al actualizar cargo')
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

  async function editarCargo(numeroCargo) {
    console.log("[Inventario] Editando cargo:", numeroCargo)
    modoCargoModal = 'editar'
    numeroCargoModal = numeroCargo

    try {
      // 1. Cargar los movimientos del cargo
      const { data: movimientos, error } = await supabase
        .from("inventario_movimientos")
        .select("*, inventario_articulos!inner(id, nombre, codigo, stock_actual)")
        .eq("numero_cargo", numeroCargo)
        .eq("tipo", "salida")

      if (error) {
        console.error("[Inventario] Error al cargar movimientos:", error)
        alert("Error al cargar los datos del cargo: " + error.message)
        return
      }

      if (!movimientos || movimientos.length === 0) {
        alert("No se encontraron datos para este cargo")
        return
      }

      const cargo = movimientos[0]

      // 2. Cargar areas
      const { data: areasData, error: areasError } = await supabase
        .from("areas")
        .select("nombre")
        .eq("activo", true)
        .order("nombre")

      if (areasError) {
        console.error("[Inventario] Error al cargar areas:", areasError)
      }

      const areaOpts = (areasData || []).map(a => ({ valor: a.nombre, texto: a.nombre }))

      // 3. Inicializar desplegables del modal
      inicializarModalCargo(areaOpts, cargo.area_solicitante)

      // 4. Prellenar campos del modal
      document.getElementById("campoResponsableReceptorModal").value = cargo.responsable_receptor || ''
      document.getElementById("campoObservacionCargoModal").value = cargo.observacion || ''
      document.getElementById("cargoModalTitulo").textContent = "Editar Cargo de Entrega"
      document.getElementById("cargoModalNumero").textContent = "Cargo: " + numeroCargo
      document.getElementById("textoGuardarCargoModal").textContent = "Actualizar Cargo"

      // 5. Prellenar fecha
      if (cargo.created_at) {
        document.getElementById("campoFechaCargoModal").value = formatearFecha(cargo.created_at.slice(0, 10))
      }

      // 6. Cargar articulos al detalle del modal
      articulosSeleccionadosCargoModal = movimientos.map(m => ({
        id: m.articulo_id,
        codigo: m.inventario_articulos?.codigo || '',
        nombre: m.inventario_articulos?.nombre || '',
        cantidad: m.cantidad,
        stock_actual: (m.inventario_articulos?.stock_actual || 0),
        movimiento_id: m.id
      }))

      renderizarDetalleCargoModal()

      // 7. Abrir el modal
      document.getElementById("modalCargo").classList.add("activo")

      console.log("[Inventario] Cargo listo para editar:", numeroCargo)

    } catch (err) {
      console.error("[Inventario] Error inesperado en editarCargo:", err)
      alert("Error inesperado: " + err.message)
    }
  }

  /* ─── ELIMINAR CARGO ─── */
  function confirmarEliminarCargo(numeroCargo) {
    cargoEliminandoNumero = numeroCargo
    document.getElementById('modalEliminarCargo').classList.add('activo')
  }

  async function eliminarCargo() {
    if (!cargoEliminandoNumero) return

    try {
      // Obtener todos los movimientos del cargo
      const { data: movimientos, error: errMov } = await supabase
        .from('inventario_movimientos')
        .select('articulo_id, cantidad')
        .eq('numero_cargo', cargoEliminandoNumero)
        .eq('tipo', 'salida')

      if (errMov) throw new Error(errMov.message)

      // Revertir stock de cada articulo
      for (const m of movimientos) {
        const { data: art } = await supabase
          .from('inventario_articulos')
          .select('stock_actual')
          .eq('id', m.articulo_id)
          .single()

        if (art) {
          const nuevoStock = (art.stock_actual || 0) + m.cantidad
          await supabase.from('inventario_articulos')
            .update({ stock_actual: nuevoStock })
            .eq('id', m.articulo_id)
        }
      }

      // Eliminar movimientos
      const { error } = await supabase
        .from('inventario_movimientos')
        .delete()
        .eq('numero_cargo', cargoEliminandoNumero)
        .eq('tipo', 'salida')

      if (error) throw new Error(error.message)

      document.getElementById('modalEliminarCargo').classList.remove('activo')
      cargoEliminandoNumero = null

      await cargarCargosRecientes()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      alert('Error al eliminar cargo: ' + err.message)
      document.getElementById('modalEliminarCargo').classList.remove('activo')
    }
  }

  /* ════════════════════════════════════════════
     PDF — CARGO DE ENTREGA
     ════════════════════════════════════════════ */
  /* ════════════════════════════════════════════
     MODAL CARGO (CREAR / EDITAR)
     ════════════════════════════════════════════ */

  function abrirModalNuevoCargo() {
    modoCargoModal = 'crear'
    numeroCargoModal = null
    articulosSeleccionadosCargoModal = []

    // Cargar areas
    supabase.from("areas").select("nombre").eq("activo", true).order("nombre")
      .then(({ data: areasData }) => {
        const areaOpts = (areasData || []).map(a => ({ valor: a.nombre, texto: a.nombre }))
        inicializarModalCargo(areaOpts, '')
      })

    // Resetear campos
    document.getElementById("campoResponsableReceptorModal").value = ''
    document.getElementById("campoObservacionCargoModal").value = ''
    document.getElementById("campoFechaCargoModal").value = ''
    document.getElementById("cargoModalTitulo").textContent = "Nuevo Cargo de Entrega"
    document.getElementById("cargoModalNumero").textContent = ""
    document.getElementById("textoGuardarCargoModal").textContent = "Registrar Cargo"

    renderizarDetalleCargoModal()
    document.getElementById("modalCargo").classList.add("activo")
  }

  function inicializarModalCargo(areaOpts, areaSeleccionada) {
    // Inicializar area
    if (!document.getElementById("triggerAreaCargoModal").dataset.inicializado) {
      inicializarDesplegable("wrapperAreaCargoModal", "triggerAreaCargoModal", "dropdownAreaCargoModal", areaOpts)
      document.getElementById("triggerAreaCargoModal").dataset.inicializado = "true"
    }
    actualizarOpcionesDesplegable("wrapperAreaCargoModal", "triggerAreaCargoModal", "dropdownAreaCargoModal", areaOpts, areaSeleccionada, "Seleccione un area")

    // Inicializar articulo
    const artOpts = articulos.filter(a => a.activo && a.stock_actual > 0).map(a => ({
      valor: a.id, texto: `${a.codigo} — ${a.nombre} (Stock: ${a.stock_actual})`
    }))
    if (!document.getElementById("triggerArticuloCargoModal").dataset.inicializado) {
      inicializarDesplegable("wrapperArticuloCargoModal", "triggerArticuloCargoModal", "dropdownArticuloCargoModal", artOpts)
      document.getElementById("triggerArticuloCargoModal").dataset.inicializado = "true"
    } else {
      actualizarOpcionesDesplegable("wrapperArticuloCargoModal", "triggerArticuloCargoModal", "dropdownArticuloCargoModal", artOpts, '', "Seleccione un articulo")
    }
  }

  function renderizarDetalleCargoModal() {
    const tbody = document.getElementById("tbodyDetalleCargoModal")
    const vacio = document.getElementById("cargoDetalleVacioModal")
    if (!tbody || !vacio) return

    if (articulosSeleccionadosCargoModal.length === 0) {
      tbody.innerHTML = ''
      vacio.style.display = 'flex'
      return
    }

    vacio.style.display = 'none'
    tbody.innerHTML = articulosSeleccionadosCargoModal.map((a, i) => `
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
      btn.addEventListener('click', () => quitarArticuloDeCargoModal(parseInt(btn.dataset.index)))
    })
  }

  function quitarArticuloDeCargoModal(index) {
    articulosSeleccionadosCargoModal.splice(index, 1)
    renderizarDetalleCargoModal()
  }

  function agregarArticuloACargoModal() {
    const articuloId = document.getElementById("triggerArticuloCargoModal")?.dataset?.value
    const cantidad = parseInt(document.getElementById("campoCantidadCargoModal").value) || 0

    document.getElementById("errorArticuloCargoModal").textContent = ''

    if (!articuloId) {
      document.getElementById("errorArticuloCargoModal").textContent = 'Seleccione un articulo'
      return
    }
    if (cantidad <= 0) {
      document.getElementById("errorArticuloCargoModal").textContent = 'Ingrese una cantidad valida'
      return
    }

    const art = articulos.find(a => a.id === articuloId)
    if (!art) return
    if (cantidad > art.stock_actual) {
      document.getElementById("errorArticuloCargoModal").textContent = `Stock insuficiente. Stock actual: ${art.stock_actual}`
      return
    }

    const existente = articulosSeleccionadosCargoModal.find(a => a.id === articuloId)
    if (existente) {
      const nuevaCant = existente.cantidad + cantidad
      if (nuevaCant > art.stock_actual) {
        document.getElementById("errorArticuloCargoModal").textContent = `Stock insuficiente para la cantidad total. Stock actual: ${art.stock_actual}`
        return
      }
      existente.cantidad = nuevaCant
    } else {
      articulosSeleccionadosCargoModal.push({ id: articuloId, codigo: art.codigo, nombre: art.nombre, cantidad, stock_actual: art.stock_actual })
    }

    document.getElementById("triggerArticuloCargoModal").dataset.value = ''
    document.getElementById("triggerArticuloCargoModal").querySelector(".filtro-select-text").textContent = 'Seleccione un articulo'
    document.getElementById("campoCantidadCargoModal").value = ''
    document.getElementById("dropdownArticuloCargoModal").querySelectorAll(".filtro-option").forEach(o => o.classList.remove("seleccionada"))

    renderizarDetalleCargoModal()
  }

  async function guardarCargoModal() {
    limpiarErrores(document.getElementById("modalCargo"))

    const area = document.getElementById("triggerAreaCargoModal")?.dataset?.value || ''
    const responsable = document.getElementById("campoResponsableReceptorModal").value.trim()
    const observacion = document.getElementById("campoObservacionCargoModal").value.trim()
    const fecha = document.getElementById("campoFechaCargoModal").value || new Date().toISOString().slice(0, 10)

    let hayError = false
    if (!area) { mostrarError("errorAreaSolicitanteModal", "Seleccione un area"); hayError = true }
    if (!responsable) { mostrarError("errorResponsableReceptorModal", "El responsable receptor es obligatorio"); hayError = true }
    if (articulosSeleccionadosCargoModal.length === 0) { mostrarError("errorArticuloCargoModal", "Agregue al menos un articulo"); hayError = true }
    if (hayError) return

    setCargandoBoton("btnGuardarCargoModal", "spinnerCargoModal", "textoGuardarCargoModal", true)

    try {
      let numeroCargo

      if (modoCargoModal === 'editar' && numeroCargoModal) {
        // MODO EDITAR: Revertir stock anterior y eliminar movimientos
        numeroCargo = numeroCargoModal

        const { data: movimientosOriginales, error: errOrig } = await supabase
          .from("inventario_movimientos")
          .select("id, articulo_id, cantidad")
          .eq("numero_cargo", numeroCargo)
          .eq("tipo", "salida")

        if (errOrig) throw new Error(errOrig.message)

        // Revertir stock de movimientos originales
        for (const m of movimientosOriginales) {
          const { data: art } = await supabase
            .from("inventario_articulos")
            .select("stock_actual")
            .eq("id", m.articulo_id)
            .single()

          if (art) {
            await supabase.from("inventario_articulos")
              .update({ stock_actual: (art.stock_actual || 0) + m.cantidad })
              .eq("id", m.articulo_id)
          }
        }

        // Eliminar movimientos originales
        await supabase.from("inventario_movimientos")
          .delete()
          .eq("numero_cargo", numeroCargo)
          .eq("tipo", "salida")
      } else {
        // MODO CREAR: Generar nuevo numero de cargo
        numeroCargo = await generarNumeroCargo()
      }

      // Crear nuevos movimientos
      for (const item of articulosSeleccionadosCargoModal) {
        const { data: art } = await supabase
          .from("inventario_articulos")
          .select("stock_actual")
          .eq("id", item.id)
          .single()

        if (!art) throw new Error(`Articulo ${item.nombre} no encontrado`)
        if (item.cantidad > art.stock_actual) {
          throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${art.stock_actual}, solicitado: ${item.cantidad}`)
        }

        const nuevoStock = (art.stock_actual || 0) - item.cantidad

        await supabase.from("inventario_articulos")
          .update({ stock_actual: nuevoStock })
          .eq("id", item.id)

        await supabase.from("inventario_movimientos").insert({
          articulo_id: item.id,
          tipo: "salida",
          cantidad: item.cantidad,
          stock_anterior: art.stock_actual || 0,
          stock_actual: nuevoStock,
          numero_cargo: numeroCargo,
          area_solicitante: area,
          responsable_receptor: responsable,
          observacion: observacion || null,
          usuario_id: perfilActual.id,
        })
      }

      // Cerrar modal y resetear
      cerrarModalCargo()

      // Si es modo crear, generar PDF
      if (modoCargoModal === 'crear') {
        generarPDFyDescargar(numeroCargo)
      }

      await cargarCargosRecientes()
      await cargarArticulos()
      await renderizarResumen()
    } catch (err) {
      mostrarError("errorAreaSolicitanteModal", err.message || "Error al guardar cargo")
    }
    setCargandoBoton("btnGuardarCargoModal", "spinnerCargoModal", "textoGuardarCargoModal", false, modoCargoModal === 'editar' ? "Actualizar Cargo" : "Registrar Cargo")
  }

  function cerrarModalCargo() {
    document.getElementById("modalCargo").classList.remove("activo")
    numeroCargoModal = null
    modoCargoModal = 'crear'
    articulosSeleccionadosCargoModal = []
    renderizarDetalleCargoModal()
    document.getElementById("campoResponsableReceptorModal").value = ''
    document.getElementById("campoObservacionCargoModal").value = ''
    document.getElementById("campoFechaCargoModal").value = ''
    document.getElementById("triggerAreaCargoModal").dataset.value = ''
    document.getElementById("triggerAreaCargoModal").querySelector(".filtro-select-text").textContent = 'Seleccione un area'
    document.getElementById("dropdownAreaCargoModal").querySelectorAll(".filtro-option").forEach(o => o.classList.remove("seleccionada"))
    document.getElementById("triggerArticuloCargoModal").dataset.value = ''
    document.getElementById("triggerArticuloCargoModal").querySelector(".filtro-select-text").textContent = 'Seleccione un articulo'
    document.getElementById("dropdownArticuloCargoModal").querySelectorAll(".filtro-option").forEach(o => o.classList.remove("seleccionada"))
  }

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
  const doc = new jsPDF('p', 'mm', 'a4')

  const pageW = 210
  const margin = 15
  const contentW = pageW - margin * 2
  const pageH = doc.internal.pageSize.height

  let y = 10

  // Logo
  if (logoBase64) {
    doc.addImage(logoBase64, 'JPEG', margin, y, 25, 20)
  }

  // Título
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('CARGO DE ENTREGA DE UTILES DE OFICINA', pageW / 2, y + 12, { align: 'center' })

  // Línea decorativa
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  const anchoTitulo = doc.getTextWidth('CARGO DE ENTREGA DE UTILES DE OFICINA')
  doc.line(pageW / 2 - anchoTitulo / 2, y + 15, pageW / 2 + anchoTitulo / 2, y + 15)

  // Fecha
  y = 45
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
  if (cargo.created_at) {
    const f = new Date(cargo.created_at)
    const mes = MESES[f.getMonth()].toUpperCase()
    doc.text(`CHINCHA, ${f.getDate()} DE ${mes} DEL ${f.getFullYear()}`, pageW - margin, y, { align: 'right' })
  }

  // Párrafo introductorio
  y = 55
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const parrafo = `QUE, LA OFICINA DE LA UNIDAD DE SEGUROS REALIZA LA ENTREGA DE LOS SIGUIENTES UTILES DE ESCRITORIO AL SERVICIO DE ${cargo.area_solicitante || '—'}`
  const lines = doc.splitTextToSize(parrafo, contentW)
  const lineHeight = 5.5
  lines.forEach((line, i) => doc.text(line, margin, y + i * lineHeight))
  y += lines.length * lineHeight + 8

  // Tabla de artículos
  const items = movimientos.map((m, index) => {
    const art = m.inventario_articulos || {}
    return [
      index + 1,
      art.nombre || '—',
      m.cantidad,
      'unidades'
    ]
  })

  // Calcular si todo cabe en una sola página
  // Altura estimada: header ~12mm + filas ~8mm c/u + observación opcional + firmas ~45mm
  const alturaFila = 9
  const alturaHeader = 12
  const alturaTabla = alturaHeader + (items.length * alturaFila)
  const alturaObservacion = cargo.observacion ? 25 : 0
  const alturaFirmas = 45
  const alturaTotal = y + alturaTabla + alturaObservacion + alturaFirmas
  const todoEnUnaPagina = alturaTotal <= (pageH - margin)

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['N°', 'ARTICULO', 'CANT.', 'UNIDAD']],
    body: items,
    theme: 'grid',
    pageBreak: todoEnUnaPagina ? false : 'auto',
    headStyles: {
      fillColor: [30, 136, 229],
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9,
      textColor: 0
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' }
    },
    styles: {
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      cellPadding: 3
    },
    alternateRowStyles: {
      fillColor: [245, 250, 255]
    },
    didDrawPage: function(data) {
      doc.setFontSize(8)
      doc.setTextColor(128, 128, 128)
      doc.text(`Cargo: ${numeroCargo} - Pagina ${data.pageNumber}`, pageW / 2, pageH - 10, { align: 'center' })
    }
  })

  // Observación (después de la tabla, en la misma página si es posible)
  let finalY = doc.lastAutoTable.finalY + 8
  if (cargo.observacion) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Observacion:', margin, finalY)
    finalY += 5
    doc.setFont('helvetica', 'normal')
    const obsLines = doc.splitTextToSize(cargo.observacion, contentW)
    obsLines.forEach((line) => {
      doc.text(line, margin, finalY)
      finalY += 4.5
    })
    finalY += 4
  }

  // Sección de firmas — justo después de la tabla
  const espacioFirmas = 40 // "RECIBI CONFORME" + 25mm espacio + líneas + etiquetas
  if (finalY + espacioFirmas > pageH - margin) {
    doc.addPage()
    finalY = margin + 5
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('RECIBI CONFORME:', margin, finalY)
  finalY += 22

  // Líneas de firma
  const firmaY = finalY
  const col1 = margin + 20
  const col2 = pageW / 2
  const col3 = pageW - margin - 20

  doc.line(col1, firmaY, col1 + 50, firmaY)
  doc.line(col2 - 25, firmaY, col2 + 25, firmaY)
  doc.line(col3 - 50, firmaY, col3, firmaY)

  finalY += 5
  doc.setFontSize(9)
  doc.text('ENTREGA', col1 + 25, finalY, { align: 'center' })
  doc.text('RECIBE', col2, finalY, { align: 'center' })
  doc.text('V°B°', col3 - 25, finalY, { align: 'center' })

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
        { valor: 'importacion', texto: 'Importacion' },
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
              return '<span class="tabla-badge" style="background:#fef3c7;color:#92400e;"><i class="ph ph-file-import"></i> Importacion</span>'
            },
          },
          { clave: 'articulo_nombre', titulo: 'Articulo' },
          { clave: 'cantidad', titulo: 'Cantidad' },
          { clave: 'stock_anterior', titulo: 'Stock Anterior' },
          { clave: 'stock_actual', titulo: 'Stock Actual' },
          { clave: 'usuario_nombre', titulo: 'Usuario' },
          { clave: 'observacion', titulo: 'Observacion', render: (v) => v ? escaparHtml(v) : '—' },
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
    /* ─── Modal Preview Importacion ─── */
    const btnCerrarPreviewImportacion = document.getElementById('btnCerrarPreviewImportacion')
    const modalPreviewImportacion = document.getElementById('modalPreviewImportacion')
    const btnCancelarPreview = document.getElementById('btnCancelarPreview')

    if (btnCerrarPreviewImportacion && modalPreviewImportacion) {
      btnCerrarPreviewImportacion.addEventListener('click', () => {
        modalPreviewImportacion.classList.remove('activo')
      })
    }
    if (btnCancelarPreview && modalPreviewImportacion) {
      btnCancelarPreview.addEventListener('click', () => {
        modalPreviewImportacion.classList.remove('activo')
      })
    }
    if (modalPreviewImportacion) {
      modalPreviewImportacion.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) modalPreviewImportacion.classList.remove('activo')
      })
    }

    /* ─── Modal Eliminar Articulo ─── */
    const btnConfirmarEliminarArticulo = document.getElementById('btnConfirmarEliminarArticulo')
    const modalEliminarArticulo = document.getElementById('modalEliminarArticulo')
    const btnCancelarEliminarArticulo = document.getElementById('btnCancelarEliminarArticulo')

    if (btnConfirmarEliminarArticulo) {
      btnConfirmarEliminarArticulo.addEventListener('click', async () => {
        if (!eliminarArticuloPendiente) return
        if (modalEliminarArticulo) modalEliminarArticulo.classList.remove('activo')
        await supabase.from('inventario_articulos').update({ activo: reactivarArticuloPendiente }).eq('id', eliminarArticuloPendiente)
        eliminarArticuloPendiente = null
        reactivarArticuloPendiente = false
        await cargarArticulos()
      })
    }
    if (btnCancelarEliminarArticulo && modalEliminarArticulo) {
      btnCancelarEliminarArticulo.addEventListener('click', () => {
        modalEliminarArticulo.classList.remove('activo')
        eliminarArticuloPendiente = null
        reactivarArticuloPendiente = false
      })
    }
    if (modalEliminarArticulo) {
      modalEliminarArticulo.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          modalEliminarArticulo.classList.remove('activo')
          eliminarArticuloPendiente = null
          reactivarArticuloPendiente = false
        }
      })
    }

    /* ─── Modal Ver Cargo PDF ─── */
    const btnCerrarModalCargoPdf = document.getElementById('btnCerrarModalCargoPdf')
    const modalVerCargoPdf = document.getElementById('modalVerCargoPdf')
    const btnDescargarCargoPdf = document.getElementById('btnDescargarCargoPdf')

    if (btnCerrarModalCargoPdf && modalVerCargoPdf) {
      btnCerrarModalCargoPdf.addEventListener('click', () => {
        modalVerCargoPdf.classList.remove('activo')
      })
    }
    if (modalVerCargoPdf) {
      modalVerCargoPdf.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) modalVerCargoPdf.classList.remove('activo')
      })
    }
    if (btnDescargarCargoPdf) {
      btnDescargarCargoPdf.addEventListener('click', async () => {
        const num = btnDescargarCargoPdf.dataset.numeroCargo
        if (num) await descargarCargoPdf(num)
      })
    }

    /* ─── Modal Articulo (Crear/Editar) — NUEVO ─── */
    const btnGuardarArticuloModal = document.getElementById('btnGuardarArticuloModal')
    const btnCerrarModalArticulo = document.getElementById('btnCerrarModalArticulo')
    const btnCancelarArticuloModal = document.getElementById('btnCancelarArticuloModal')
    const modalArticulo = document.getElementById('modalArticulo')

    if (btnGuardarArticuloModal) btnGuardarArticuloModal.addEventListener('click', guardarArticuloModal)
    if (btnCerrarModalArticulo) btnCerrarModalArticulo.addEventListener('click', cerrarModalArticulo)
    if (btnCancelarArticuloModal) btnCancelarArticuloModal.addEventListener('click', cerrarModalArticulo)
    if (modalArticulo) {
      modalArticulo.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalArticulo()
      })
    }

    /* ─── Modal Entrada (Crear/Editar) ─── */
    const btnNuevaEntrada = document.getElementById('btnNuevaEntrada')
    const btnGuardarEntradaModal = document.getElementById('btnGuardarEntradaModal')
    const btnCerrarModalEntrada = document.getElementById('btnCerrarModalEntrada')
    const btnCancelarEntradaModal = document.getElementById('btnCancelarEntradaModal')
    const modalEntrada = document.getElementById('modalEntrada')

    if (btnNuevaEntrada) btnNuevaEntrada.addEventListener('click', abrirModalNuevaEntrada)
    if (btnGuardarEntradaModal) btnGuardarEntradaModal.addEventListener('click', guardarEntradaModal)
    if (btnCerrarModalEntrada) btnCerrarModalEntrada.addEventListener('click', cerrarModalEntrada)
    if (btnCancelarEntradaModal) btnCancelarEntradaModal.addEventListener('click', cerrarModalEntrada)
    if (modalEntrada) {
      modalEntrada.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalEntrada()
      })
    }

    /* ─── Modal Cargo (Crear/Editar) ─── */
    const btnNuevoCargo = document.getElementById('btnNuevoCargo')
    const btnAgregarArticuloCargoModal = document.getElementById('btnAgregarArticuloCargoModal')
    const btnGuardarCargoModal = document.getElementById('btnGuardarCargoModal')
    const btnCerrarModalCargo = document.getElementById('btnCerrarModalCargo')
    const btnCancelarCargoModal = document.getElementById('btnCancelarCargoModal')
    const modalCargo = document.getElementById('modalCargo')

    if (btnNuevoCargo) btnNuevoCargo.addEventListener('click', abrirModalNuevoCargo)
    if (btnAgregarArticuloCargoModal) btnAgregarArticuloCargoModal.addEventListener('click', agregarArticuloACargoModal)
    if (btnGuardarCargoModal) btnGuardarCargoModal.addEventListener('click', guardarCargoModal)
    if (btnCerrarModalCargo) btnCerrarModalCargo.addEventListener('click', cerrarModalCargo)
    if (btnCancelarCargoModal) btnCancelarCargoModal.addEventListener('click', cerrarModalCargo)
    if (modalCargo) {
      modalCargo.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarModalCargo()
      })
    }

    /* ─── Modal Eliminar Entrada ─── */
    const btnConfirmarEliminarEntrada = document.getElementById('btnConfirmarEliminarEntrada')
    const modalEliminarEntrada = document.getElementById('modalEliminarEntrada')
    const btnCancelarEliminarEntrada = document.getElementById('btnCancelarEliminarEntrada')

    if (btnConfirmarEliminarEntrada) btnConfirmarEliminarEntrada.addEventListener('click', eliminarEntrada)
    if (btnCancelarEliminarEntrada && modalEliminarEntrada) {
      btnCancelarEliminarEntrada.addEventListener('click', () => {
        modalEliminarEntrada.classList.remove('activo')
        entradaEliminandoId = null
      })
    }
    if (modalEliminarEntrada) {
      modalEliminarEntrada.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          modalEliminarEntrada.classList.remove('activo')
          entradaEliminandoId = null
        }
      })
    }

    /* ─── Modal Eliminar Cargo ─── */
    const btnConfirmarEliminarCargo = document.getElementById('btnConfirmarEliminarCargo')
    const modalEliminarCargo = document.getElementById('modalEliminarCargo')
    const btnCancelarEliminarCargo = document.getElementById('btnCancelarEliminarCargo')

    if (btnConfirmarEliminarCargo) btnConfirmarEliminarCargo.addEventListener('click', eliminarCargo)
    if (btnCancelarEliminarCargo && modalEliminarCargo) {
      btnCancelarEliminarCargo.addEventListener('click', () => {
        modalEliminarCargo.classList.remove('activo')
        cargoEliminandoNumero = null
      })
    }
    if (modalEliminarCargo) {
      modalEliminarCargo.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          modalEliminarCargo.classList.remove('activo')
          cargoEliminandoNumero = null
        }
      })
    }

    /* ─── Click en tarjetas de Resumen para filtrar Catálogo ─── */
    const cardDesabastecidos = document.getElementById('cardDesabastecidos')
    const cardStockBajo = document.getElementById('cardStockBajo')

    if (cardDesabastecidos) {
      cardDesabastecidos.addEventListener('click', () => {
        cambiarTab('catalogo')
        setTimeout(() => {
          const input = document.getElementById('buscarArticulo')
          if (input) {
            input.value = ''
            input.dataset.filtroStock = 'desabastecido'
          }
          aplicarFiltrosCatalogo()
        }, 300)
      })
    }

    if (cardStockBajo) {
      cardStockBajo.addEventListener('click', () => {
        cambiarTab('catalogo')
        setTimeout(() => {
          const input = document.getElementById('buscarArticulo')
          if (input) {
            input.value = ''
            input.dataset.filtroStock = 'bajo'
          }
          aplicarFiltrosCatalogo()
        }, 300)
      })
    }
  }

  /* ════════════════════════════════════════════
     FILTROS DE STOCK EN CATÁLOGO
     ════════════════════════════════════════════ */
  function filtrarPorStock(tipo) {
    if (!tablaCatalogo || !articulos.length) return
    let filtrados = []
    if (tipo === 'desabastecido') {
      filtrados = articulos.filter(a => a.stock_actual === 0)
    } else if (tipo === 'bajo') {
      filtrados = articulos.filter(a => a.stock_actual > 0 && a.stock_actual <= 10)
    } else {
      filtrados = articulos
    }
    tablaCatalogo.actualizar(filtrados)
  }
})()