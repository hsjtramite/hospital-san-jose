class DatePicker {
  constructor(inputId, opts = {}) {
    this.input = document.getElementById(inputId)
    if (!this.input) return

    this.onChange = opts.onChange || null
    this.placeholder = opts.placeholder || 'dd/mm/aaaa'
    this.timezone = opts.timezone || 'America/Lima'

    const hoy = this._hoyEnZona()
    this.valorInicial = opts.valorInicial || (() => {
      const d = String(hoy.day).padStart(2, '0')
      const m = String(hoy.month + 1).padStart(2, '0')
      const a = hoy.year
      return `${d}/${m}/${a}`
    })()

    this._crearEstructura(hoy)
    this._ubicarCalendario()
    this._bindEventos()
    this._renderCalendario()

    this.input.value = this.valorInicial
    this.fechaISO = this._aISO(this.valorInicial)
  }

  _hoyEnZona() {
    const tz = this.timezone
    const ahora = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const [year, month, day] = formatter.format(ahora).split('-').map(Number)
    return {
      year,
      month: month - 1,
      day,
      iso: formatter.format(ahora),
    }
  }

  _crearEstructura(hoy) {
    const parentWrapper = this.input.closest('.input-wrapper')
    if (parentWrapper) {
      this.wrapper = parentWrapper
      this.displayInput = this.input
      this._reutilizaWrapper = true
    } else {
      this.input.style.display = 'none'
      this.wrapper = document.createElement('div')
      this.wrapper.className = 'fecha-wrapper'
      this.displayInput = document.createElement('input')
      this.displayInput.type = 'text'
      this.displayInput.className = 'fecha-input'
      this.displayInput.placeholder = this.placeholder
      this.displayInput.value = this.valorInicial
      this.displayInput.autocomplete = 'off'
      this.wrapper.appendChild(this.displayInput)
      this.input.parentNode.insertBefore(this.wrapper, this.input)
      this.input.dataset.fechaWrapper = true
    }

    const icono = document.createElement('i')
    icono.className = 'ph ph-calendar-blank fecha-icono'
    icono.id = `${this.input.id}-icono`

    this.calendario = document.createElement('div')
    this.calendario.className = 'fecha-calendario'
    this.calendario.id = `${this.input.id}-calendario`

    this.wrapper.appendChild(icono)
    this.wrapper.appendChild(this.calendario)

    this.mesActual = hoy.month
    this.anoActual = hoy.year
  }

  _ubicarCalendario() {
    const rect = this.wrapper.getBoundingClientRect()
    const espacioAbajo = window.innerHeight - rect.bottom
    if (espacioAbajo < 320) {
      this.calendario.style.top = 'auto'
      this.calendario.style.bottom = 'calc(100% + 6px)'
    } else {
      this.calendario.style.top = 'calc(100% + 6px)'
      this.calendario.style.bottom = 'auto'
    }
  }

  _bindEventos() {
    this.displayInput.addEventListener('focus', () => {
      this._renderCalendario()
      this.calendario.classList.add('visible')
      this._ubicarCalendario()
    })

    this.displayInput.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 8)
      let formateado = ''
      if (val.length > 0) formateado = val.slice(0, 2)
      if (val.length > 2) formateado += '/' + val.slice(2, 4)
      if (val.length > 4) formateado += '/' + val.slice(4, 8)
      e.target.value = formateado

      if (val.length === 8) {
        const dia = val.slice(0, 2)
        const mes = val.slice(2, 4)
        const ano = val.slice(4, 8)
        if (this._esFechaValida(dia, mes, ano)) {
          this.fechaISO = `${ano}-${mes}-${dia}`
          this.displayInput.value = `${dia}/${mes}/${ano}`
          this.mesActual = parseInt(mes) - 1
          this.anoActual = parseInt(ano)
          this._renderCalendario()
          if (this.onChange) this.onChange(this.fechaISO)
        }
      }
    })

    const icono = document.getElementById(`${this.input.id}-icono`)
    if (icono) {
      icono.addEventListener('click', (e) => {
        e.stopPropagation()
        this.calendario.classList.toggle('visible')
        if (this.calendario.classList.contains('visible')) {
          this._renderCalendario()
          this._ubicarCalendario()
        }
      })
    }

    document.addEventListener('click', (e) => {
      if (!this.wrapper.contains(e.target)) {
        this.calendario.classList.remove('visible')
      }
    })

    this.calendario.addEventListener('click', (e) => {
      const diaBtn = e.target.closest('.fecha-cal-dia')
      if (!diaBtn || diaBtn.classList.contains('otro-mes')) return

      const dia = diaBtn.dataset.dia
      const mes = String(this.mesActual + 1).padStart(2, '0')
      const ano = this.anoActual
      this.fechaISO = `${ano}-${String(this.mesActual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      this.displayInput.value = `${String(dia).padStart(2, '0')}/${mes}/${ano}`
      this.calendario.classList.remove('visible')
      if (this.onChange) this.onChange(this.fechaISO)
    })
  }

  _renderCalendario() {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

    this.calendario.innerHTML = `
      <div class="fecha-cal-header">
        <span class="fecha-cal-mes">${meses[this.mesActual]} ${this.anoActual}</span>
        <div class="fecha-cal-nav">
          <button type="button" class="fecha-cal-nav-btn" data-accion="mes-anterior"><i class="ph ph-caret-left"></i></button>
          <button type="button" class="fecha-cal-nav-btn" data-accion="mes-siguiente"><i class="ph ph-caret-right"></i></button>
        </div>
      </div>
      <div class="fecha-cal-dias-semana">
        <span>Do</span><span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span>
      </div>
      <div class="fecha-cal-dias"></div>
    `

    const grid = this.calendario.querySelector('.fecha-cal-dias')
    const primerDia = new Date(this.anoActual, this.mesActual, 1).getDay()
    const diasEnMes = new Date(this.anoActual, this.mesActual + 1, 0).getDate()
    const diasEnMesAnterior = new Date(this.anoActual, this.mesActual, 0).getDate()
    const hoy = this._hoyEnZona()

    for (let i = primerDia - 1; i >= 0; i--) {
      const dia = diasEnMesAnterior - i
      grid.innerHTML += `<button type="button" class="fecha-cal-dia otro-mes" data-dia="${dia}">${dia}</button>`
    }

    for (let d = 1; d <= diasEnMes; d++) {
      const esHoy = d === hoy.day && this.mesActual === hoy.month && this.anoActual === hoy.year
      const esSeleccionado = this.fechaISO === `${this.anoActual}-${String(this.mesActual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      let clases = 'fecha-cal-dia'
      if (esHoy) clases += ' hoy'
      if (esSeleccionado) clases += ' seleccionado'
      grid.innerHTML += `<button type="button" class="${clases}" data-dia="${d}">${d}</button>`
    }

    const totalCeldas = grid.children.length
    const restantes = 42 - totalCeldas
    for (let d = 1; d <= restantes; d++) {
      grid.innerHTML += `<button type="button" class="fecha-cal-dia otro-mes" data-dia="${d}">${d}</button>`
    }

    this.calendario.querySelector('[data-accion="mes-anterior"]').addEventListener('click', (e) => {
      e.stopPropagation()
      this.mesActual--
      if (this.mesActual < 0) { this.mesActual = 11; this.anoActual-- }
      this._renderCalendario()
    })

    this.calendario.querySelector('[data-accion="mes-siguiente"]').addEventListener('click', (e) => {
      e.stopPropagation()
      this.mesActual++
      if (this.mesActual > 11) { this.mesActual = 0; this.anoActual++ }
      this._renderCalendario()
    })
  }

  _formatearFecha(date) {
    const d = String(date.getDate()).padStart(2, '0')
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const a = date.getFullYear()
    return `${d}/${m}/${a}`
  }

  _aISO(fechaStr) {
    const partes = fechaStr.split('/')
    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`
    }
    return this._hoyEnZona().iso
  }

  _esFechaValida(dia, mes, ano) {
    const d = parseInt(dia)
    const m = parseInt(mes)
    const a = parseInt(ano)
    if (m < 1 || m > 12 || d < 1 || d > 31) return false
    const maxDias = new Date(a, m, 0).getDate()
    return d <= maxDias
  }

  obtenerValor() {
    return this.fechaISO
  }

  establecerValor(fechaISO) {
    if (!fechaISO) return
    const partes = fechaISO.split('-')
    if (partes.length === 3) {
      const [a, m, d] = partes
      this.fechaISO = fechaISO
      this.displayInput.value = `${d}/${m}/${a}`
      this.mesActual = parseInt(m) - 1
      this.anoActual = parseInt(a)
      this._renderCalendario()
    }
  }

  limpiar() {
    this.fechaISO = ''
    this.displayInput.value = ''
  }

  destruir() {
    const icono = document.getElementById(`${this.input.id}-icono`)
    if (icono) icono.remove()
    if (this.calendario) this.calendario.remove()
    if (!this._reutilizaWrapper && this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.replaceChild(this.input, this.wrapper)
    }
  }
}
