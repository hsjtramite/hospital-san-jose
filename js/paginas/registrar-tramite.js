(function () {
  'use strict'

  let supabase
  let sesion = null
  let perfilActual = null
  let nombreCarpeta = ''
  let areas = []
  let firmantesDisponibles = []
  let firmanteSeleccionado = null
  let adjuntosSeleccionados = []
  let datePicker = null
  let datePickerDerivar = null
  const cacheNumeros = {}

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

  document.addEventListener('DOMContentLoaded', inicializar)

  async function inicializar() {
    supabase = window.supabase
    if (!supabase) return

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      window.location.href = 'index.html'
      return
    }
    sesion = session

    if (!await verificarAcceso('registrar-tramite')) return

    const { data: perfil, error: errorPerfil } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, apellidos_completos, nombre_usuario, gmail, rol, firma_url')
      .eq('id', session.user.id)
      .single()

    if (errorPerfil || !perfil) {
      window.location.href = 'index.html'
      return
    }
    perfilActual = perfil
    nombreCarpeta = perfil.nombre_usuario

    await Promise.all([
      cargarAreas(),
      precargarNumeros(),
      cargarFirmantes(),
    ])

    inicializarDatePicker()
    inicializarDesplegableTipoDoc()
    inicializarDesplegableArea()
    inicializarDesplegablePrioridad()
    inicializarDesplegableFirmante()
    inicializarFileInput()
    inicializarBotones()

    const nombreCompleto = formatearNombreCompleto(perfil)
    document.getElementById('campoRemitente').value = nombreCompleto

    inicializarDerivar()
  }

  async function cargarAreas() {
    const { data } = await supabase
      .from('areas')
      .select('id, nombre, responsable, cargo')
      .order('nombre', { ascending: true })

    if (data) areas = data
  }

  async function cargarFirmantes() {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, nombre_completo, apellidos_completos, firma_url, rol, activo')
      .in('rol', [1, 2])
      .eq('activo', true)
      .order('nombre_completo', { ascending: true })

    if (error) {
      console.error('[Registrar] Error al cargar firmantes:', error)
      firmantesDisponibles = []
      return
    }

    firmantesDisponibles = (data || []).filter((p) => !!p.firma_url)
  }

  function formatearNombreCompleto(persona) {
    return `${persona?.nombre_completo || ''} ${persona?.apellidos_completos || ''}`.trim()
  }

  function inicializarDatePicker() {
    datePicker = new DatePicker('campoFecha', {
      placeholder: 'dd/mm/aaaa',
      timezone: CONFIGURACION.formato.zonaHoraria,
      onChange: (fechaISO) => {},
    })
  }

  /* ─── DESPLEGABLE TIPO DOCUMENTO ─── */
  function inicializarDesplegableTipoDoc() {
    const dropdown = document.getElementById('dropdownTipoDoc')
    dropdown.innerHTML = ''

    TIPOS_DOCUMENTO.forEach((td) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = td.id
      opt.textContent = td.nombre
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerTipoDoc')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperTipoDoc')

    dropdown.addEventListener('click', async (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')

      await generarNumeroDocumento(opt.dataset.value)
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  async function precargarNumeros() {
    const ids = TIPOS_DOCUMENTO.map(t => t.id)
    const resultados = await Promise.allSettled(
      ids.map(id =>
        fetch(
          `${CONFIGURACION.supabase.url}/functions/v1/generar-numero-documento`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sesion.access_token}`,
            },
            body: JSON.stringify({ tipo_documento: id }),
          }
        ).then(r => r.json())
          .then(d => ({ id, numero_documento: d.numero_documento }))
      )
    )
    for (const r of resultados) {
      if (r.status === 'fulfilled' && r.value.numero_documento) {
        cacheNumeros[r.value.id] = r.value.numero_documento
      }
    }
  }

  async function generarNumeroDocumento(tipoDocumento) {
    const campo = document.getElementById('campoNumero')

    if (cacheNumeros[tipoDocumento]) {
      campo.value = cacheNumeros[tipoDocumento]
    }

    try {
      const res = await fetch(
        `${CONFIGURACION.supabase.url}/functions/v1/generar-numero-documento`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sesion.access_token}`,
          },
          body: JSON.stringify({ tipo_documento: tipoDocumento }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al generar número')
      }

      campo.value = data.numero_documento
      cacheNumeros[tipoDocumento] = data.numero_documento
    } catch (err) {
      // Silencio — si hay error y hay caché, se mantiene el valor anterior
    }
  }

  /* ─── DESPLEGABLE ÁREA ─── */
  function inicializarDesplegableArea() {
    const dropdown = document.getElementById('dropdownArea')
    dropdown.innerHTML = ''

    areas.forEach((area) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = area.id
      opt.textContent = area.nombre
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerArea')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperArea')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')

      const area = areas.find((a) => a.id === opt.dataset.value)
      if (area) {
        document.getElementById('campoDestinatario').value = area.responsable || ''
        document.getElementById('campoCargo').value = area.cargo || ''
      }
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  /* ─── DESPLEGABLE PRIORIDAD ─── */
  function inicializarDesplegablePrioridad() {
    const PRIORIDADES = [
      { id: 'Baja', nombre: 'Baja' },
      { id: 'Media', nombre: 'Media' },
      { id: 'Alta', nombre: 'Alta' },
      { id: 'Urgente', nombre: 'Urgente' },
    ]

    const dropdown = document.getElementById('dropdownPrioridad')
    dropdown.innerHTML = ''

    PRIORIDADES.forEach((p) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = p.id
      opt.textContent = p.nombre
      if (p.id === 'Media') opt.classList.add('seleccionada')
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerPrioridad')
    const text = trigger.querySelector('.filtro-select-text')
    trigger.dataset.value = 'Media'
    const wrapper = document.getElementById('wrapperPrioridad')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  /* ─── DESPLEGABLE FIRMANTE ─── */
  function inicializarDesplegableFirmante() {
    const dropdown = document.getElementById('dropdownFirmante')
    const trigger = document.getElementById('triggerFirmante')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperFirmante')

    if (!dropdown.dataset.inicializado) {
      dropdown.addEventListener('click', (e) => {
        const opt = e.target.closest('.filtro-option')
        if (!opt) return

        const firmante = firmantesDisponibles.find((f) => f.id === opt.dataset.value)
        if (!firmante) return

        seleccionarFirmanteUI(firmante)
        wrapper.classList.remove('abierto')
        document.getElementById('errorFirmante').textContent = ''
      })

      trigger.addEventListener('click', () => {
        if (!trigger.disabled) {
          wrapper.classList.toggle('abierto')
        }
      })

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          wrapper.classList.remove('abierto')
        }
      })

      dropdown.dataset.inicializado = '1'
    }

    actualizarSelectorFirmante()
  }

  function seleccionarFirmanteUI(firmante) {
    const trigger = document.getElementById('triggerFirmante')
    const text = trigger.querySelector('.filtro-select-text')
    trigger.dataset.value = firmante.id
    firmanteSeleccionado = firmante

    const nombreCompleto = formatearNombreCompleto(firmante) || 'Sin nombre'
    text.innerHTML = `
      ${escaparHtml(nombreCompleto)}
      <span class="firmante-estado con-firma">Con firma</span>
    `
  }

  function actualizarSelectorFirmante() {
    const dropdown = document.getElementById('dropdownFirmante')
    const trigger = document.getElementById('triggerFirmante')
    const text = trigger.querySelector('.filtro-select-text')
    const errorFirmante = document.getElementById('errorFirmante')
    const btnGuardarTramite = document.getElementById('btnGuardarTramite')
    const wrapper = document.getElementById('wrapperFirmante')

    dropdown.innerHTML = ''
    delete trigger.dataset.value

    if (firmantesDisponibles.length === 0) {
      firmanteSeleccionado = null
      text.textContent = 'No hay firmantes con firma registrada.'
      trigger.disabled = true
      btnGuardarTramite.disabled = true
      errorFirmante.textContent = 'No hay firmantes con firma registrada.'
      return
    }

    btnGuardarTramite.disabled = false
    errorFirmante.textContent = ''

    firmantesDisponibles.forEach((firmante) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = firmante.id
      if (firmanteSeleccionado && firmanteSeleccionado.id === firmante.id) {
        opt.classList.add('seleccionada')
      }
      opt.innerHTML = `
        <span>${escaparHtml(formatearNombreCompleto(firmante) || 'Sin nombre')}</span>
        <span class="firmante-estado con-firma">Con firma</span>
      `
      dropdown.appendChild(opt)
    })

    if (firmantesDisponibles.length === 1) {
      seleccionarFirmanteUI(firmantesDisponibles[0])
      trigger.disabled = true
      wrapper.classList.remove('abierto')
      return
    }

    trigger.disabled = false
    firmanteSeleccionado = null
    text.textContent = 'Seleccione un firmante'
  }

  /* ─── FILE INPUT ─── */
  function inicializarFileInput() {
    const input = document.getElementById('campoAdjuntos')
    const nombreSpan = document.getElementById('adjuntosNombre')
    const lista = document.getElementById('adjuntosLista')

    input.addEventListener('change', () => {
      adjuntosSeleccionados = Array.from(input.files)
      renderizarAdjuntos()
    })

    function renderizarAdjuntos() {
      lista.innerHTML = ''
      if (adjuntosSeleccionados.length === 0) {
        nombreSpan.textContent = 'Ningún archivo seleccionado'
        return
      }
      nombreSpan.textContent = `${adjuntosSeleccionados.length} archivo(s) seleccionado(s)`

      adjuntosSeleccionados.forEach((file, index) => {
        const chip = document.createElement('div')
        chip.className = 'adjunto-chip'
        chip.innerHTML = `
          <i class="ph ph-file-pdf"></i>
          <span>${file.name}</span>
          <i class="ph ph-x" data-index="${index}"></i>
        `
        chip.querySelector('.ph-x').addEventListener('click', () => {
          adjuntosSeleccionados.splice(index, 1)
          const dt = new DataTransfer()
          adjuntosSeleccionados.forEach((f) => dt.items.add(f))
          input.files = dt.files
          renderizarAdjuntos()
        })
        lista.appendChild(chip)
      })
    }
  }

  /* ─── BOTONES ─── */
  function inicializarBotones() {
    document.getElementById('btnEmitir').addEventListener('click', () => mostrarCard('emitido'))
    document.getElementById('btnDerivar').addEventListener('click', () => mostrarCard('derivado'))

    document.getElementById('btnCancelarTramite').addEventListener('click', () => {
      limpiarFormulario()
    })

    document.getElementById('btnGuardarTramite').addEventListener('click', guardarTramite)
  }

  function mostrarCard(tipo) {
    const esEmitir = tipo === 'emitido'
    document.getElementById('btnEmitir').classList.toggle('activo', esEmitir)
    document.getElementById('btnDerivar').classList.toggle('activo', !esEmitir)
    document.getElementById('cardEmitir').style.display = esEmitir ? '' : 'none'
    document.getElementById('cardDerivar').style.display = esEmitir ? 'none' : ''
  }

  function limpiarFormulario() {
    document.getElementById('campoNumero').value = ''
    document.getElementById('campoAsunto').value = ''
    document.getElementById('campoCuerpo').value = ''

    const triggerTipo = document.getElementById('triggerTipoDoc')
    triggerTipo.querySelector('.filtro-select-text').textContent = 'Seleccione un tipo'
    delete triggerTipo.dataset.value
    document.getElementById('dropdownTipoDoc').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))

    const triggerArea = document.getElementById('triggerArea')
    triggerArea.querySelector('.filtro-select-text').textContent = 'Seleccione un área'
    delete triggerArea.dataset.value
    document.getElementById('dropdownArea').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))

    const triggerPri = document.getElementById('triggerPrioridad')
    triggerPri.querySelector('.filtro-select-text').textContent = 'Media'
    triggerPri.dataset.value = 'Media'
    document.getElementById('dropdownPrioridad').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
    const optPriMedia = document.querySelector('#dropdownPrioridad .filtro-option[data-value="Media"]')
    if (optPriMedia) optPriMedia.classList.add('seleccionada')

    actualizarSelectorFirmante()

    document.getElementById('campoDestinatario').value = ''
    document.getElementById('campoCargo').value = ''

    const fileInput = document.getElementById('campoAdjuntos')
    fileInput.value = ''
    adjuntosSeleccionados = []
    document.getElementById('adjuntosNombre').textContent = 'Ningún archivo seleccionado'
    document.getElementById('adjuntosLista').innerHTML = ''

    document.querySelectorAll('.input-error').forEach((el) => el.textContent = '')
  }

  function mostrarError(id, mensaje) {
    const el = document.getElementById(id)
    if (el) el.textContent = mensaje
  }

  function limpiarErrores() {
    document.querySelectorAll('.input-error').forEach((el) => el.textContent = '')
  }

  async function guardarTramite() {
    limpiarErrores()

    const tipoDocumento = document.getElementById('triggerTipoDoc').dataset.value
    const asunto = document.getElementById('campoAsunto').value.trim()
    const cuerpo = document.getElementById('campoCuerpo').value.trim()
    const prioridad = document.getElementById('triggerPrioridad').dataset.value
    const fecha = datePicker ? datePicker.obtenerValor() : new Date().toISOString().split('T')[0]
    const destinatario = document.getElementById('campoDestinatario').value.trim()
    const cargo = document.getElementById('campoCargo').value.trim()
    const areaId = document.getElementById('triggerArea').dataset.value || null

    let valido = true
    if (!tipoDocumento) { mostrarError('errorAsunto', 'Seleccione un tipo de documento'); valido = false }
    if (!asunto) { mostrarError('errorAsunto', 'El asunto es obligatorio'); valido = false }
    if (!cuerpo) { mostrarError('errorCuerpo', 'El cuerpo del documento es obligatorio'); valido = false }
    if (firmantesDisponibles.length === 0) {
      mostrarError('errorFirmante', 'No hay firmantes con firma registrada.')
      valido = false
    } else if (!firmanteSeleccionado) {
      mostrarError('errorFirmante', 'Seleccione un firmante')
      valido = false
    }

    if (!valido) return

    const firmaUrl = firmanteSeleccionado?.firma_url || null

    const btn = document.getElementById('btnGuardarTramite')
    const spinner = document.getElementById('spinnerTramite')
    const texto = document.getElementById('textoGuardarTramite')
    btn.disabled = true
    spinner.style.display = 'inline-block'
    texto.textContent = 'Guardando...'

    let archivosSubidos = []
    let wordBlob = null

    try {
      // ─── 1. Obtener número predicho para el Word ───
      let numeroPredicho = cacheNumeros[tipoDocumento]
      if (!numeroPredicho) {
        const predResp = await fetch(
          `${CONFIGURACION.supabase.url}/functions/v1/generar-numero-documento`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sesion.access_token}`,
            },
            body: JSON.stringify({ tipo_documento: tipoDocumento }),
          }
        )
        const predData = await predResp.json()
        numeroPredicho = predData.numero_documento
      }

      // ─── 2. Generar Word en memoria (antes que nada) ───
      const tipoObj = TIPOS_DOCUMENTO.find(t => t.id === tipoDocumento)
      wordBlob = await generarWordBlob({
        tipo_documento: tipoObj ? tipoObj.nombre : tipoDocumento,
        numero_documento: numeroPredicho,
        fecha,
        destinatario,
        cargo,
        asunto,
        cuerpo,
        firma_url: firmaUrl,
      })

      // ─── 3. Subir archivos a temp/ ───
      if (adjuntosSeleccionados.length > 0) {
        const resultado = await subirArchivosTemp()
        if (!resultado.exito) {
          throw new Error(resultado.error || 'Error al subir los archivos adjuntos')
        }
        archivosSubidos = resultado.archivos
      }

      // ─── 4. Crear documento (Edge Function atómica) ───
      const res = await fetch(
        `${CONFIGURACION.supabase.url}/functions/v1/crear-documento`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sesion.access_token}`,
          },
          body: JSON.stringify({
            tipo: 'emitido',
            tipo_documento: tipoDocumento,
            fecha,
            prioridad,
            autor_id: perfilActual.id,
            remitente_id: perfilActual.id,
            firmante_id: firmanteSeleccionado.id,
            area_id: areaId,
            destinatario: destinatario || null,
            cargo_destinatario: cargo || null,
            asunto,
            cuerpo_documento: cuerpo,
          }),
        }
      )

      const data = await res.json()

      if (!res.ok) {
        console.error('[crear-documento] Error:', data)
        throw new Error(data.error || 'Error al guardar el trámite')
      }

      // Re-generar Word si el número real difiere del predicho
      if (data.numero_documento !== numeroPredicho) {
        wordBlob = await generarWordBlob({
          tipo_documento: tipoObj ? tipoObj.nombre : tipoDocumento,
          numero_documento: data.numero_documento,
          fecha,
          destinatario,
          cargo,
          asunto,
          cuerpo,
          firma_url: firmaUrl,
        })
      }

      // ─── 5. Subir Word a Storage ───
      // Se incluye el tipo de documento en el nombre del archivo para evitar 
      // colisiones, ya que Oficios y Memorándums pueden compartir el mismo número.
      const tipoParaRuta = tipoObj ? tipoObj.id : tipoDocumento;
      const nombreWord = `emitidos/${nombreCarpeta}/${tipoParaRuta}_${data.numero_documento}.docx`
      
      const { error: wordUploadError } = await supabase.storage
        .from('documentos')
        .upload(nombreWord, wordBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })

      if (wordUploadError) {
        await supabase.from('documentos').delete().eq('id', data.id)
        throw new Error('Error al subir el Word: ' + wordUploadError.message)
      }

      const { data: { publicUrl: wordUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(nombreWord)

      // ─── 6. Mover archivos de temp/ a emitidos/{nombre_usuario}/adjuntos/{numero_doc}_{nombre} ───
      for (const archivo of archivosSubidos) {
        const nombre = archivo.ruta.split('/').pop()
        const destinoRuta = `emitidos/${nombreCarpeta}/adjuntos/${data.numero_documento}_${nombre}`

        const { error: copyError } = await supabase.storage
          .from('documentos')
          .copy(archivo.ruta, destinoRuta)

        if (copyError) {
          console.warn('No se pudo mover el archivo, se usará ruta temp:', copyError.message)
        } else {
          await supabase.storage.from('documentos').remove([archivo.ruta])
          archivo.ruta = destinoRuta
          archivo.url = supabase.storage.from('documentos').getPublicUrl(destinoRuta).data.publicUrl
        }
      }

      // ─── 7. Insertar registros en documentos_archivos (adjuntos + Word) ───
      for (const archivo of archivosSubidos) {
        await supabase.from('documentos_archivos').insert({
          documento_id: data.id,
          nombre_archivo: archivo.nombre_original,
          ruta_archivo: archivo.ruta,
          url_archivo: archivo.url,
          tipo_archivo: archivo.tipo,
          tamano_bytes: archivo.tamano,
          subido_por: perfilActual.id,
        }).then(r => { if (r.error) console.warn('Error al registrar archivo en BD:', r.error) })
      }

      await supabase.from('documentos_archivos').insert({
        documento_id: data.id,
        nombre_archivo: `Documento - ${tipoParaRuta} - ${data.numero_documento}.docx`,
        ruta_archivo: nombreWord,
        url_archivo: wordUrl,
        tipo_archivo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        tamano_bytes: 0,
        subido_por: perfilActual.id,
      })

      // ─── Éxito ───
      delete cacheNumeros[tipoDocumento]
      texto.textContent = '¡Guardado!'
      spinner.style.display = 'none'
      document.getElementById('campoNumero').value = data.numero_documento || ''

      setTimeout(() => {
        limpiarFormulario()
        btn.disabled = false
        texto.textContent = 'Guardar Trámite'
      }, 1500)

    } catch (err) {
      if (archivosSubidos.length > 0) {
        await limpiarArchivosStorage(archivosSubidos)
      }

      btn.disabled = false
      spinner.style.display = 'none'
      texto.textContent = 'Guardar Trámite'
      mostrarError('errorCuerpo', err.message || 'Error al guardar el trámite')
    }
  }

  async function subirArchivosTemp() {
    const operacionId = Date.now()
    const archivos = []

    for (const file of adjuntosSeleccionados) {
      const nombreSanitizado = sanitizarNombre(file.name)
      const ruta = `temp/${operacionId}/${nombreSanitizado}`

      const { error } = await supabase.storage
        .from('documentos')
        .upload(ruta, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || 'application/pdf',
        })

      if (error) {
        // Limpiar archivos ya subidos antes de fallar
        for (const a of archivos) {
          await supabase.storage.from('documentos').remove([a.ruta])
        }
        return { exito: false, error: `${file.name}: ${error.message}` }
      }

      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(ruta)

      archivos.push({
        ruta,
        url: publicUrl,
        nombre_original: file.name,
        tipo: file.type || 'application/pdf',
        tamano: file.size,
      })
    }

    return { exito: true, archivos }
  }

  async function limpiarArchivosStorage(archivos) {
    const rutas = archivos.map(a => a.ruta)
    const { error } = await supabase.storage.from('documentos').remove(rutas)
    if (error) {
      console.warn('No se pudieron limpiar archivos huérfanos:', error.message)
    }
  }

  function sanitizarNombre(nombre) {
    const sinAcentos = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return sinAcentos.replace(/[^a-zA-Z0-9._-]/g, '_')
  }

  /* ─── HELPER: subir Word a Storage y registrar en documentos_archivos ─── */
  async function subirWordYRegistrar({ blob, docId, nombreArchivo, rutaStorage }) {
    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(rutaStorage, blob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

    if (uploadError) {
      throw new Error('Error al subir el Word: ' + uploadError.message)
    }

    const { data: { publicUrl } } = supabase.storage
      .from('documentos')
      .getPublicUrl(rutaStorage)

    const { error: dbError } = await supabase.from('documentos_archivos').insert({
      documento_id: docId,
      nombre_archivo: nombreArchivo,
      ruta_archivo: rutaStorage,
      url_archivo: publicUrl,
      tipo_archivo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      tamano_bytes: blob.size || 0,
      subido_por: perfilActual.id,
    })

    if (dbError) {
      console.warn('Error al registrar Word en BD:', dbError)
    }

    return { ruta: rutaStorage, url: publicUrl }
  }

  /* ════════════════════════════════════════════
     DERIVAR
     ════════════════════════════════════════════ */
  function inicializarDerivar() {
    inicializarDesplegableTipoDocDerivar()
    inicializarDatePickerDerivar()
    inicializarDesplegablePrioridadDerivar()
    inicializarDesplegableAreaDestino()
    inicializarDesplegableEstadoDerivar()
    inicializarBotonesDerivar()

    document.getElementById('campoRemitenteDerivar').value =
      `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim()
  }

  /* ─── DESPLEGABLE TIPO DOCUMENTO — DERIVAR ─── */
  function inicializarDesplegableTipoDocDerivar() {
    const dropdown = document.getElementById('dropdownTipoDocDeriv')
    dropdown.innerHTML = ''

    TIPOS_DOCUMENTO.forEach((td) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = td.id
      opt.textContent = td.nombre
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerTipoDocDeriv')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperTipoDocDeriv')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  /* ─── DATEPICKER — DERIVAR ─── */
  function inicializarDatePickerDerivar() {
    datePickerDerivar = new DatePicker('campoFechaDerivar', {
      placeholder: 'dd/mm/aaaa',
      timezone: CONFIGURACION.formato.zonaHoraria,
    })
  }

  /* ─── DESPLEGABLE PRIORIDAD — DERIVAR ─── */
  function inicializarDesplegablePrioridadDerivar() {
    const PRIORIDADES = [
      { id: 'Baja', nombre: 'Baja' },
      { id: 'Media', nombre: 'Media' },
      { id: 'Alta', nombre: 'Alta' },
      { id: 'Urgente', nombre: 'Urgente' },
    ]

    const dropdown = document.getElementById('dropdownPrioridadDeriv')
    dropdown.innerHTML = ''

    PRIORIDADES.forEach((p) => {
      const opt = document.createElement('div')
      opt.className = 'filtro-option'
      opt.dataset.value = p.id
      opt.textContent = p.nombre
      dropdown.appendChild(opt)
    })

    const trigger = document.getElementById('triggerPrioridadDeriv')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperPrioridadDeriv')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  /* ─── DESPLEGABLE ÁREA DESTINO ─── */
  function inicializarDesplegableAreaDestino() {
    const dropdown = document.getElementById('dropdownAreaDestino')
    dropdown.innerHTML = ''

    const AREAS_PERMITIDAS = new Set([
      'UNIDAD DE SEGUROS PRIVADOS',
      'SIS',
      'MEDICOS AUDITORES',
      'FISSAL',
    ].map((nombre) => NORMALIZACION.aMayusculasSinTilde(nombre.trim())))

    areas
      .filter((area) => AREAS_PERMITIDAS.has(NORMALIZACION.aMayusculasSinTilde((area.nombre || '').trim())))
      .forEach((area) => {
        const opt = document.createElement('div')
        opt.className = 'filtro-option'
        opt.dataset.value = area.id
        opt.textContent = area.nombre
        dropdown.appendChild(opt)
      })

    const trigger = document.getElementById('triggerAreaDestino')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperAreaDestino')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')

      const area = areas.find((a) => a.id === opt.dataset.value)
      if (area) {
        document.getElementById('campoResponsableDerivar').value = area.responsable || ''
        document.getElementById('campoCargoDerivar').value = area.cargo || ''
      }

      document.getElementById('errorAreaDestino').textContent = ''
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  /* ─── DESPLEGABLE ESTADO DERIVACIÓN ─── */
  function inicializarDesplegableEstadoDerivar() {
    const dropdown = document.getElementById('dropdownEstadoDeriv')
    const trigger = document.getElementById('triggerEstadoDeriv')
    const text = trigger.querySelector('.filtro-select-text')
    const wrapper = document.getElementById('wrapperEstadoDeriv')

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.filtro-option')
      if (!opt) return

      dropdown.querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))
      opt.classList.add('seleccionada')
      text.textContent = opt.textContent
      trigger.dataset.value = opt.dataset.value
      wrapper.classList.remove('abierto')

      document.getElementById('errorEstadoDerivar').textContent = ''
    })

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('abierto')
    })

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.classList.remove('abierto')
      }
    })
  }

  /* ─── BOTONES — DERIVAR ─── */
  function inicializarBotonesDerivar() {
    document.getElementById('btnCancelarDerivar').addEventListener('click', limpiarFormularioDerivar)
    document.getElementById('btnGuardarDerivar').addEventListener('click', guardarDerivacion)
  }

  function limpiarFormularioDerivar() {
    document.getElementById('campoNumeroDerivar').value = ''
    document.getElementById('campoRemitenteDerivar').value =
      `${perfilActual.nombre_completo || ''} ${perfilActual.apellidos_completos || ''}`.trim()
    document.getElementById('campoAsuntoDerivar').value = ''
    document.getElementById('campoResponsableDerivar').value = ''
    document.getElementById('campoCargoDerivar').value = ''
    document.getElementById('campoObservacionesDerivar').value = ''

    const triggerTipo = document.getElementById('triggerTipoDocDeriv')
    triggerTipo.querySelector('.filtro-select-text').textContent = 'Seleccione un tipo'
    delete triggerTipo.dataset.value
    document.getElementById('dropdownTipoDocDeriv').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))

    const triggerPri = document.getElementById('triggerPrioridadDeriv')
    triggerPri.querySelector('.filtro-select-text').textContent = 'Seleccione una prioridad'
    delete triggerPri.dataset.value
    document.getElementById('dropdownPrioridadDeriv').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))

    const triggerArea = document.getElementById('triggerAreaDestino')
    triggerArea.querySelector('.filtro-select-text').textContent = 'Seleccione el área'
    delete triggerArea.dataset.value
    document.getElementById('dropdownAreaDestino').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))

    const triggerEst = document.getElementById('triggerEstadoDeriv')
    triggerEst.querySelector('.filtro-select-text').textContent = 'Seleccione un estado'
    delete triggerEst.dataset.value
    document.getElementById('dropdownEstadoDeriv').querySelectorAll('.filtro-option').forEach((o) => o.classList.remove('seleccionada'))

    document.querySelectorAll('#cardDerivar .input-error').forEach((el) => el.textContent = '')
  }

  async function guardarDerivacion() {
    document.querySelectorAll('#cardDerivar .input-error').forEach((el) => el.textContent = '')

    const tipoDocumento = document.getElementById('triggerTipoDocDeriv').dataset.value
    const numeroDocumento = document.getElementById('campoNumeroDerivar').value.trim()
    const prioridad = document.getElementById('triggerPrioridadDeriv').dataset.value
    const fecha = datePickerDerivar ? datePickerDerivar.obtenerValor() : new Date().toISOString().split('T')[0]
    const remitente = document.getElementById('campoRemitenteDerivar').value.trim()
    const asunto = document.getElementById('campoAsuntoDerivar').value.trim()
    const areaDestinoId = document.getElementById('triggerAreaDestino').dataset.value
    const responsable = document.getElementById('campoResponsableDerivar').value.trim()
    const cargo = document.getElementById('campoCargoDerivar').value.trim()
    const estado = document.getElementById('triggerEstadoDeriv').dataset.value
    const observaciones = document.getElementById('campoObservacionesDerivar').value.trim()

    const areaDestino = areaDestinoId
      ? (areas.find(a => a.id === areaDestinoId)?.nombre || '')
      : ''

    let valido = true
    if (!tipoDocumento) { mostrarError('errorAsuntoDerivar', 'Seleccione un tipo de documento'); valido = false }
    if (!numeroDocumento) { mostrarError('errorAsuntoDerivar', 'El número de documento es obligatorio'); valido = false }
    if (!asunto) { mostrarError('errorAsuntoDerivar', 'El asunto es obligatorio'); valido = false }
    if (!areaDestino) { mostrarError('errorAreaDestino', 'Seleccione un área destino'); valido = false }
    if (!estado) { mostrarError('errorEstadoDerivar', 'Seleccione un estado'); valido = false }

    if (!valido) return

    const btn = document.getElementById('btnGuardarDerivar')
    const spinner = document.getElementById('spinnerDerivar')
    const texto = document.getElementById('textoGuardarDerivar')
    btn.disabled = true
    spinner.style.display = 'inline-block'
    texto.textContent = 'Guardando...'

    let docId = null

    try {
      // ─── 1. Insertar documento derivado ───
      const { data: docData, error } = await supabase
        .from('documentos')
        .insert({
          tipo: 'derivado',
          tipo_documento: tipoDocumento,
          numero_documento: numeroDocumento,
          contador: 0,
          fecha,
          prioridad,
          autor_id: perfilActual.id,
          remitente_id: perfilActual.id,
          area_id: null,
          destinatario: responsable || null,
          cargo_destinatario: cargo || null,
          asunto,
          cuerpo_documento: observaciones || asunto,
          estado_actual: estado,
          area_destino: areaDestino || null,
          observaciones_derivacion: observaciones || null,
          creado_por: perfilActual.id,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[derivar] Error:', error)
        throw new Error(error.message || 'Error al guardar la derivación')
      }

      docId = docData.id

      // ─── 2. Generar Word en memoria ───
      const tipoObj = TIPOS_DOCUMENTO.find(t => t.id === tipoDocumento)
      const wordBlob = await generarWordBlob({
        tipo_documento: tipoObj ? tipoObj.nombre : tipoDocumento,
        numero_documento: numeroDocumento,
        fecha,
        destinatario: responsable || '',
        cargo: cargo || '',
        asunto,
        cuerpo: observaciones || asunto,
        firma_url: null,
      })

      // ─── 3. Subir Word a Storage y registrar en documentos_archivos ───
      const rutaWord = `derivados/${nombreCarpeta}/DERIVADO_${tipoDocumento}_${numeroDocumento}.docx`
      const nombreArchivo = `DERIVADO_${tipoDocumento}_${numeroDocumento}.docx`

      await subirWordYRegistrar({
        blob: wordBlob,
        docId: docId,
        nombreArchivo,
        rutaStorage: rutaWord,
      })

      // ─── Éxito ───
      texto.textContent = '¡Guardado!'
      spinner.style.display = 'none'

      setTimeout(() => {
        limpiarFormularioDerivar()
        btn.disabled = false
        texto.textContent = 'Guardar Derivación'
      }, 1500)

    } catch (err) {
      if (docId) {
        await supabase.from('documentos').delete().eq('id', docId)
      }

      btn.disabled = false
      spinner.style.display = 'none'
      texto.textContent = 'Guardar Derivación'
      mostrarError('errorAsuntoDerivar', err.message || 'Error al guardar la derivación')
    }
  }
})()
