(function () {
  'use strict'

  let supabase
  let sesion = null
  let todosDocumentos = []
  let areas = []
  let graficos = []

  const COLORES = [
    '#1E88E5',
    '#f59e0b',
    '#00674f',
    '#7c3aed',
    '#d62828',
    '#94a3b8',
  ]

  const COLORES_HOVER = [
    '#1565C0',
    '#d97706',
    '#00503f',
    '#6d28d9',
    '#b91c1c',
    '#64748b',
  ]

  const COLORES_DONA = [
    '#1E88E5',
    '#7c3aed',
    '#f59e0b',
    '#00674f',
    '#d62828',
    '#94a3b8',
  ]

  const COLORES_LINEA = {
    border: '#1E88E5',
    background: 'rgba(30, 136, 229, 0.10)',
    point: '#1E88E5',
  }

  const TIPOS_DOCUMENTO = [
    { id: 'CARTA', nombre: 'CARTA N°' },
    { id: 'MEMORANDUM', nombre: 'MEMORÁNDUM N°' },
    { id: 'MEMORANDO_CIRCULAR', nombre: 'MEMORANDO CIRCULAR N°' },
    { id: 'OFICIO', nombre: 'OFICIO N°' },
    { id: 'SOLICITUD', nombre: 'SOLICITUD N°' },
    { id: 'INFORME', nombre: 'INFORME N°' },
    { id: 'NOTAS', nombre: 'NOTA N°' },
    { id: 'NOTA_CIRCULAR', nombre: 'NOTA CIRCULAR N°' },
  ]

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]

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

    if (!await verificarAcceso('reportes')) return

    await Promise.all([
      cargarDocumentos(),
      cargarAreas(),
    ])

    renderizarResumenEjecutivo()
    renderizarGraficoLinea()
    renderizarGraficoDona()
    renderizarGraficoBarrasAreas()
    renderizarGraficoBarrasTipos()
    inicializarExportacion()

    window.addEventListener('resize', () => {
      graficos.forEach(g => g.resize())
    })
  }

  /* ─── DATOS ─── */

  async function cargarDocumentos() {
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[reportes] Error al cargar documentos:', error)
      todosDocumentos = []
      return
    }

    todosDocumentos = data || []
  }

  async function cargarAreas() {
    const { data } = await supabase
      .from('areas')
      .select('id, nombre')

    if (data) areas = data
  }

  function obtenerNombreArea(id) {
    if (!id) return 'Sin área'
    const a = areas.find(a => a.id === id)
    return a ? a.nombre : 'Sin área'
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
    return mapa[doc.estado_actual] || 'Registrado'
  }

  function obtenerNombreTipo(id) {
    const t = TIPOS_DOCUMENTO.find(t => t.id === id)
    return t ? t.nombre.replace(/\sN[°º]$/, '') : (id || '—')
  }

  /* ════════════════════════════════════════════
     SECCIÓN 1: RESUMEN EJECUTIVO
     ════════════════════════════════════════════ */

  function renderizarResumenEjecutivo() {
    const docs = todosDocumentos
    const total = docs.length
    const emitidos = docs.filter(d => d.tipo === 'emitido').length
    const derivados = docs.filter(d => d.tipo === 'derivado').length
    const finalizados = docs.filter(d => d.estado_actual === 'ATENDIDO').length

    document.getElementById('valorTotalDocs').textContent = total
    document.getElementById('valorEmitidos').textContent = emitidos
    document.getElementById('valorDerivados').textContent = derivados
    document.getElementById('valorFinalizados').textContent = finalizados

    // Área más activa
    const areaCount = {}
    docs.forEach(d => {
      if (d.area_id) {
        areaCount[d.area_id] = (areaCount[d.area_id] || 0) + 1
      }
    })
    const areaEntries = Object.entries(areaCount).sort((a, b) => b[1] - a[1])
    const chipArea = document.getElementById('chipAreaActiva')
    chipArea.textContent = areaEntries.length > 0
      ? `${obtenerNombreArea(areaEntries[0][0])} (${areaEntries[0][1]})`
      : '—'

    // Tipo más usado
    const tipoCount = {}
    docs.forEach(d => {
      tipoCount[d.tipo_documento] = (tipoCount[d.tipo_documento] || 0) + 1
    })
    const tipoEntries = Object.entries(tipoCount).sort((a, b) => b[1] - a[1])
    const chipTipo = document.getElementById('chipTipoUsado')
    chipTipo.textContent = tipoEntries.length > 0
      ? `${obtenerNombreTipo(tipoEntries[0][0])} (${tipoEntries[0][1]})`
      : '—'

    // Estado predominante
    const estadoCount = {}
    docs.forEach(d => {
      const est = obtenerEstado(d)
      estadoCount[est] = (estadoCount[est] || 0) + 1
    })
    const estadoEntries = Object.entries(estadoCount).sort((a, b) => b[1] - a[1])
    const chipEstado = document.getElementById('chipEstadoPredominante')
    chipEstado.textContent = estadoEntries.length > 0
      ? `${estadoEntries[0][0]} (${estadoEntries[0][1]})`
      : '—'
  }

  /* ════════════════════════════════════════════
     SECCIÓN 2: DOCUMENTOS POR MES (LÍNEA)
     ════════════════════════════════════════════ */

  function renderizarGraficoLinea() {
    const ctx = document.getElementById('chartDocumentosMes')
    if (!ctx) return

    const mesCount = new Array(12).fill(0)
    const añoActual = new Date().getFullYear()

    todosDocumentos.forEach(d => {
      if (!d.fecha) return
      const p = d.fecha.split('-')
      if (p.length !== 3) return
      const mes = parseInt(p[1], 10) - 1
      if (mes >= 0 && mes < 12) {
        mesCount[mes]++
      }
    })

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: MESES.map(m => m.substring(0, 3)),
        datasets: [{
          label: 'Documentos',
          data: mesCount,
          borderColor: COLORES_LINEA.border,
          backgroundColor: COLORES_LINEA.background,
          pointBackgroundColor: COLORES_LINEA.point,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#1e293b',
            bodyColor: '#64748b',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#94a3b8',
              font: { size: 11 },
            },
            grid: {
              color: 'rgba(0,0,0,0.05)',
            },
          },
          x: {
            ticks: {
              color: '#94a3b8',
              font: { size: 11 },
            },
            grid: {
              display: false,
            },
          },
        },
      },
    })

    graficos.push(chart)
  }

  /* ════════════════════════════════════════════
     SECCIÓN 3: DISTRIBUCIÓN POR ESTADO (DOUGHNUT)
     ════════════════════════════════════════════ */

  function renderizarGraficoDona() {
    const ctx = document.getElementById('chartDistribucionEstado')
    if (!ctx) return

    const estados = ['Registrado', 'Derivado', 'En proceso', 'Finalizado', 'Observado', 'Pendiente']
    const estadoCount = {}
    estados.forEach(e => estadoCount[e] = 0)

    todosDocumentos.forEach(d => {
      const est = obtenerEstado(d)
      if (estadoCount[est] !== undefined) {
        estadoCount[est]++
      }
    })

    const labels = []
    const data = []
    const colores = []

    estados.forEach((e, i) => {
      if (estadoCount[e] > 0) {
        labels.push(e)
        data.push(estadoCount[e])
        colores.push(COLORES_DONA[i % COLORES_DONA.length])
      }
    })

    const total = data.reduce((a, b) => a + b, 0)

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colores,
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#1e293b',
            bodyColor: '#64748b',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: function (context) {
                const valor = context.parsed
                const pct = total > 0 ? ((valor / total) * 100).toFixed(1) : 0
                return `${context.label}: ${valor} (${pct}%)`
              },
            },
          },
        },
      },
    })

    graficos.push(chart)

    // Leyenda personalizada
    const leyenda = document.getElementById('donaLeyenda')
    leyenda.innerHTML = ''
    labels.forEach((label, i) => {
      const item = document.createElement('div')
      item.className = 'dona-leyenda-item'
      item.innerHTML = `
        <span class="dona-leyenda-color" style="background:${colores[i]}"></span>
        <span>${label}: ${data[i]} (${total > 0 ? ((data[i] / total) * 100).toFixed(1) : 0}%)</span>
      `
      leyenda.appendChild(item)
    })
  }

  /* ════════════════════════════════════════════
     SECCIÓN 4: DOCUMENTOS POR ÁREA (BARRAS H)
     ════════════════════════════════════════════ */

  function renderizarGraficoBarrasAreas() {
    const ctx = document.getElementById('chartDocumentosArea')
    if (!ctx) return

    const areaCount = {}
    todosDocumentos.forEach(d => {
      const nombre = obtenerNombreArea(d.area_id)
      areaCount[nombre] = (areaCount[nombre] || 0) + 1
    })

    const entries = Object.entries(areaCount).sort((a, b) => b[1] - a[1])
    const labels = entries.map(e => e[0])
    const data = entries.map(e => e[1])
    const colores = labels.map((_, i) => COLORES[i % COLORES.length])

    const hoverColors = colores.map((_, i) => COLORES_HOVER[i % COLORES_HOVER.length])

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colores,
          hoverBackgroundColor: hoverColors,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#1e293b',
            bodyColor: '#64748b',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#94a3b8',
              font: { size: 11 },
            },
            grid: {
              color: 'rgba(0,0,0,0.05)',
            },
          },
          y: {
            ticks: {
              color: '#64748b',
              font: { size: 11 },
            },
            grid: {
              display: false,
            },
          },
        },
      },
    })

    graficos.push(chart)
  }

  /* ════════════════════════════════════════════
     SECCIÓN 5: TIPOS DOCUMENTALES (BARRAS H)
     ════════════════════════════════════════════ */

  function renderizarGraficoBarrasTipos() {
    const ctx = document.getElementById('chartTiposDocumentales')
    if (!ctx) return

    const tipoCount = {}
    todosDocumentos.forEach(d => {
      const nombre = obtenerNombreTipo(d.tipo_documento)
      tipoCount[nombre] = (tipoCount[nombre] || 0) + 1
    })

    const entries = Object.entries(tipoCount).sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, e) => s + e[1], 0)
    const labels = entries.map(e => e[0])
    const data = entries.map(e => e[1])
    const colores = labels.map((_, i) => COLORES[i % COLORES.length])

    const hoverColors = colores.map((_, i) => COLORES_HOVER[i % COLORES_HOVER.length])

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colores,
          hoverBackgroundColor: hoverColors,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#1e293b',
            bodyColor: '#64748b',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: function (context) {
                const valor = context.parsed.x
                const pct = total > 0 ? ((valor / total) * 100).toFixed(1) : 0
                return `${context.label}: ${valor} (${pct}%)`
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              color: '#94a3b8',
              font: { size: 11 },
            },
            grid: {
              color: 'rgba(0,0,0,0.05)',
            },
          },
          y: {
            ticks: {
              color: '#64748b',
              font: { size: 11 },
            },
            grid: {
              display: false,
            },
          },
        },
      },
    })

    graficos.push(chart)
  }

  /* ════════════════════════════════════════════
     SECCIÓN 6: EXPORTACIÓN
     ════════════════════════════════════════════ */

  function inicializarExportacion() {
    document.getElementById('btnExportarPDFGeneral').addEventListener('click', exportarPDFGeneral)
    document.getElementById('btnExportarPDFArea').addEventListener('click', exportarPDFArea)
    document.getElementById('btnExportarExcel').addEventListener('click', exportarExcel)
  }

  /* ─── helpers de datos ─── */

  function computarResumen() {
    const docs = todosDocumentos
    const total = docs.length
    const emitidos = docs.filter(d => d.tipo === 'emitido').length
    const derivados = docs.filter(d => d.tipo === 'derivado').length
    const finalizados = docs.filter(d => d.estado_actual === 'ATENDIDO').length

    const areaCount = {}
    docs.forEach(d => { if (d.area_id) areaCount[d.area_id] = (areaCount[d.area_id] || 0) + 1 })
    const areaTop = Object.entries(areaCount).sort((a, b) => b[1] - a[1])

    const tipoCount = {}
    docs.forEach(d => { tipoCount[d.tipo_documento] = (tipoCount[d.tipo_documento] || 0) + 1 })
    const tipoTop = Object.entries(tipoCount).sort((a, b) => b[1] - a[1])

    const estadoCount = {}
    docs.forEach(d => {
      const est = obtenerEstado(d)
      estadoCount[est] = (estadoCount[est] || 0) + 1
    })
    const estadoTop = Object.entries(estadoCount).sort((a, b) => b[1] - a[1])

    return { total, emitidos, derivados, finalizados, areaTop, tipoTop, estadoTop }
  }

  function computarPorMes() {
    const mesCount = new Array(12).fill(0)
    todosDocumentos.forEach(d => {
      if (!d.fecha) return
      const p = d.fecha.split('-')
      if (p.length !== 3) return
      const mes = parseInt(p[1], 10) - 1
      if (mes >= 0 && mes < 12) mesCount[mes]++
    })
    return mesCount
  }

  function computarPorEstado() {
    const estados = ['Registrado', 'Derivado', 'En proceso', 'Finalizado', 'Observado', 'Pendiente']
    const estadoCount = {}
    estados.forEach(e => estadoCount[e] = 0)
    todosDocumentos.forEach(d => {
      const est = obtenerEstado(d)
      if (estadoCount[est] !== undefined) estadoCount[est]++
    })
    return estadoCount
  }

  function computarPorArea() {
    const areaCount = {}
    todosDocumentos.forEach(d => {
      const nombre = obtenerNombreArea(d.area_id)
      areaCount[nombre] = (areaCount[nombre] || 0) + 1
    })
    return Object.entries(areaCount).sort((a, b) => b[1] - a[1])
  }

  function computarPorTipo() {
    const tipoCount = {}
    todosDocumentos.forEach(d => {
      const nombre = obtenerNombreTipo(d.tipo_documento)
      tipoCount[nombre] = (tipoCount[nombre] || 0) + 1
    })
    return Object.entries(tipoCount).sort((a, b) => b[1] - a[1])
  }

  /* ─── 1. Reporte General PDF ─── */

  function exportarPDFGeneral() {
    if (!window.jspdf) { alert('jsPDF no está disponible'); return }
    const { jsPDF } = window.jspdf
    const pdf = new jsPDF('p', 'mm', 'a4')
    const mIzq = 20, ancho = 170

    const ahora = new Date()
    const fechaStr = `${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()}`

    const resumen = computarResumen()
    const porMes = computarPorMes()
    const porEstado = computarPorEstado()
    const porArea = computarPorArea()
    const porTipo = computarPorTipo()

    let y = 20

    // Título
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('Reporte General', mIzq, y)
    y += 8

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Generado: ${fechaStr}`, mIzq, y)
    y += 5
    pdf.text(`Total de documentos analizados: ${resumen.total}`, mIzq, y)
    y += 10

    // Resumen Ejecutivo
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Resumen Ejecutivo', mIzq, y)
    y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const lineasResumen = [
      `Total documentos: ${resumen.total}`,
      `Emitidos: ${resumen.emitidos}`,
      `Derivados: ${resumen.derivados}`,
      `Finalizados: ${resumen.finalizados}`,
      `Área más activa: ${resumen.areaTop.length > 0 ? obtenerNombreArea(resumen.areaTop[0][0]) + ' (' + resumen.areaTop[0][1] + ')' : '—'}`,
      `Tipo más usado: ${resumen.tipoTop.length > 0 ? obtenerNombreTipo(resumen.tipoTop[0][0]) + ' (' + resumen.tipoTop[0][1] + ')' : '—'}`,
      `Estado predominante: ${resumen.estadoTop.length > 0 ? resumen.estadoTop[0][0] + ' (' + resumen.estadoTop[0][1] + ')' : '—'}`,
    ]
    lineasResumen.forEach(l => {
      if (y > 275) { pdf.addPage(); y = 20 }
      pdf.text(l, mIzq, y)
      y += 6
    })
    y += 6

    // Documentos por Mes
    if (y > 260) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Documentos por Mes', mIzq, y)
    y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const mesesCorto = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
    let lineaMes = ''
    for (let i = 0; i < 12; i++) {
      lineaMes += `${mesesCorto[i]}: ${porMes[i]} `
      if ((i + 1) % 6 === 0 || i === 11) {
        if (y > 275) { pdf.addPage(); y = 20 }
        pdf.text(lineaMes.trim(), mIzq, y)
        y += 6
        lineaMes = ''
      }
    }
    y += 4

    // Distribución por Estado
    if (y > 260) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Distribución por Estado', mIzq, y)
    y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    const estados = ['Registrado', 'Derivado', 'En proceso', 'Finalizado', 'Observado', 'Pendiente']
    const totalDocs = resumen.total || 1
    estados.forEach(e => {
      if (y > 275) { pdf.addPage(); y = 20 }
      const cant = porEstado[e] || 0
      const pct = ((cant / totalDocs) * 100).toFixed(1)
      pdf.text(`${e}: ${cant} (${pct}%)`, mIzq, y)
      y += 6
    })
    y += 4

    // Documentos por Área
    if (y > 260) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Documentos por Área', mIzq, y)
    y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    porArea.forEach(([area, cant]) => {
      if (y > 275) { pdf.addPage(); y = 20 }
      const pct = ((cant / totalDocs) * 100).toFixed(1)
      pdf.text(`${area}: ${cant} (${pct}%)`, mIzq, y)
      y += 6
    })
    y += 4

    // Tipos Documentales
    if (y > 260) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Tipos Documentales', mIzq, y)
    y += 7

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    porTipo.forEach(([tipo, cant]) => {
      if (y > 275) { pdf.addPage(); y = 20 }
      const pct = ((cant / totalDocs) * 100).toFixed(1)
      pdf.text(`${tipo}: ${cant} (${pct}%)`, mIzq, y)
      y += 6
    })

    pdf.save('Reporte_General.pdf')
  }

  /* ─── 2. Reporte por Área PDF ─── */

  function exportarPDFArea() {
    if (!window.jspdf) { alert('jsPDF no está disponible'); return }
    const { jsPDF } = window.jspdf
    const pdf = new jsPDF('p', 'mm', 'a4')
    const mIzq = 20, ancho = 170

    const ahora = new Date()
    const fechaStr = `${ahora.getDate()}/${ahora.getMonth() + 1}/${ahora.getFullYear()}`

    const porArea = computarPorArea()
    const total = todosDocumentos.length || 1
    const maxBar = porArea.length > 0 ? porArea[0][1] : 0

    let y = 20

    // Título
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('Reporte por Áreas', mIzq, y)
    y += 8

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Generado: ${fechaStr}`, mIzq, y)
    y += 5
    pdf.text(`Total general analizado: ${total} documentos`, mIzq, y)
    y += 12

    // Tabla ranking
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('Ranking de Áreas', mIzq, y)
    y += 8

    // Encabezados
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.text('N°', mIzq, y)
    pdf.text('Área', mIzq + 10, y)
    pdf.text('Cantidad', mIzq + 120, y)
    pdf.text('%', mIzq + 150, y)
    y += 5
    pdf.setDrawColor(200)
    pdf.line(mIzq, y, mIzq + ancho, y)
    y += 3

    pdf.setFont('helvetica', 'normal')
    porArea.forEach(([area, cant], i) => {
      if (y > 270) { pdf.addPage(); y = 20 }
      const pct = ((cant / total) * 100).toFixed(1)
      pdf.text(`${i + 1}`, mIzq, y)
      pdf.text(area.substring(0, 35), mIzq + 10, y)
      pdf.text(String(cant), mIzq + 120, y)
      pdf.text(`${pct}%`, mIzq + 150, y)
      y += 6

      // Barra visual
      if (maxBar > 0) {
        const barLen = (cant / maxBar) * 80
        pdf.setDrawColor(30, 136, 229)
        pdf.setLineWidth(3)
        pdf.line(mIzq + 10, y - 2, mIzq + 10 + barLen, y - 2)
        pdf.setLineWidth(0.2)
      }
      y += 2
    })

    y += 8
    if (y > 270) { pdf.addPage(); y = 20 }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    const areaTop = porArea.length > 0 ? porArea[0][0] : '—'
    pdf.text(`Área con mayor carga documental: ${areaTop} (${porArea.length > 0 ? porArea[0][1] : 0})`, mIzq, y)
    y += 6
    pdf.text(`Total general: ${total} documentos`, mIzq, y)

    pdf.save('Reporte_por_Areas.pdf')
  }

  /* ─── 3. Exportar Excel (CSV) ─── */

  function exportarExcel() {
    const resumen = computarResumen()
    const porMes = computarPorMes()
    const porEstado = computarPorEstado()
    const porArea = computarPorArea()
    const porTipo = computarPorTipo()
    const total = resumen.total || 1

    const mesesCorto = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
    const lineas = []

    // Resumen Ejecutivo
    lineas.push('=== RESUMEN EJECUTIVO ===')
    lineas.push('Indicador,Valor')
    lineas.push(`Total,${resumen.total}`)
    lineas.push(`Emitidos,${resumen.emitidos}`)
    lineas.push(`Derivados,${resumen.derivados}`)
    lineas.push(`Finalizados,${resumen.finalizados}`)
    lineas.push(`Área más activa,${resumen.areaTop.length > 0 ? obtenerNombreArea(resumen.areaTop[0][0]) + ' (' + resumen.areaTop[0][1] + ')' : '—'}`)
    lineas.push(`Tipo más usado,${resumen.tipoTop.length > 0 ? obtenerNombreTipo(resumen.tipoTop[0][0]) + ' (' + resumen.tipoTop[0][1] + ')' : '—'}`)
    lineas.push(`Estado predominante,${resumen.estadoTop.length > 0 ? resumen.estadoTop[0][0] + ' (' + resumen.estadoTop[0][1] + ')' : '—'}`)
    lineas.push('')

    // Documentos por Mes
    lineas.push('=== DOCUMENTOS POR MES ===')
    lineas.push('Mes,Cantidad')
    for (let i = 0; i < 12; i++) {
      lineas.push(`${mesesCorto[i]},${porMes[i]}`)
    }
    lineas.push('')

    // Distribución por Estado
    lineas.push('=== DISTRIBUCIÓN POR ESTADO ===')
    lineas.push('Estado,Cantidad,Porcentaje')
    const estados = ['Registrado', 'Derivado', 'En proceso', 'Finalizado', 'Observado', 'Pendiente']
    estados.forEach(e => {
      const cant = porEstado[e] || 0
      const pct = ((cant / total) * 100).toFixed(1)
      lineas.push(`${e},${cant},${pct}%`)
    })
    lineas.push('')

    // Documentos por Área
    lineas.push('=== DOCUMENTOS POR ÁREA ===')
    lineas.push('Área,Cantidad,Porcentaje')
    porArea.forEach(([area, cant]) => {
      const pct = ((cant / total) * 100).toFixed(1)
      lineas.push(`${area},${cant},${pct}%`)
    })
    lineas.push('')

    // Tipos Documentales
    lineas.push('=== TIPOS DOCUMENTALES ===')
    lineas.push('Tipo,Cantidad,Porcentaje')
    porTipo.forEach(([tipo, cant]) => {
      const pct = ((cant / total) * 100).toFixed(1)
      lineas.push(`${tipo},${cant},${pct}%`)
    })

    const csv = '\uFEFF' + lineas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Reporte_Estadistico.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

})()
