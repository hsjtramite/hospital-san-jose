class Tabla {
  constructor(config) {
    this.columnas = config.columnas || [];
    this.titulo = config.titulo || '';
    this.textoBoton = config.textoBoton || 'Nuevo';
    this.onNuevo = config.onNuevo || (() => {});
    this.paginacion = config.paginacion !== false;
    this.elementosPorPagina = config.elementosPorPagina
      || (typeof CONFIGURACION !== 'undefined' ? CONFIGURACION.paginacion?.elementosPorPagina : null)
      || 20;

    this.todosLosDatos = [];
    this.paginaActual = 1;

    this.contenedor = document.createElement('div');
    this.contenedor.className = 'tabla-contenedor';

    const headerEl = document.createElement('div');
    headerEl.className = 'tabla-encabezado';

    if (config.headerHTML) {
      headerEl.innerHTML = config.headerHTML;
    } else {
      headerEl.innerHTML = `
        <h2 class="tabla-titulo">${this.titulo}</h2>
        <button class="btn-filled-md tabla-btn-nuevo">${this.textoBoton}</button>
      `;
      headerEl.querySelector('.tabla-btn-nuevo').addEventListener('click', this.onNuevo);
    }

    this.contenedor.appendChild(headerEl);

    const wrapper = document.createElement('div');
    wrapper.className = 'tabla-wrapper';
    wrapper.innerHTML = `
      <table class="tabla">
        <thead>
          <tr>${this.columnas.map(c => `<th>${c.titulo}</th>`).join('')}</tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    this.contenedor.appendChild(wrapper);
    this.tbody = wrapper.querySelector('tbody');

    if (this.paginacion) {
      this.footer = document.createElement('div');
      this.footer.className = 'tabla-footer';
      this.contenedor.appendChild(this.footer);
    }
  }

  actualizar(datos) {
    this.todosLosDatos = datos || [];
    this.paginaActual = 1;
    this._renderPagina();
  }

  _renderPagina() {
    if (!this.paginacion) {
      this._renderFilas(this.todosLosDatos);
      return;
    }

    const total = this.todosLosDatos.length;
    const inicio = (this.paginaActual - 1) * this.elementosPorPagina;
    const fin = Math.min(inicio + this.elementosPorPagina, total);
    const datosPagina = this.todosLosDatos.slice(inicio, fin);

    this._renderFilas(datosPagina);
    this._renderPaginacion(total, inicio, fin);
  }

  _renderFilas(datos) {
    this.tbody.innerHTML = datos.map(fila => {
      const celdas = this.columnas.map(col => {
        const valor = fila[col.clave];
        const contenido = col.render ? col.render(valor, fila) : (valor ?? '');
        return `<td>${contenido}</td>`;
      }).join('');
      return `<tr>${celdas}</tr>`;
    }).join('');
  }

  _renderPaginacion(total, inicio, fin) {
    const totalPaginas = Math.max(1, Math.ceil(total / this.elementosPorPagina));

    let info = total === 0
      ? 'No hay registros'
      : `Mostrando ${inicio + 1}-${fin} de ${total} registros`;

    let botonesHtml = '';
    if (total > 0 && totalPaginas > 1) {
      const MAX_BOTONES = 5;
      let inicioPaginas, finPaginas;

      if (totalPaginas <= MAX_BOTONES) {
        inicioPaginas = 1;
        finPaginas = totalPaginas;
      } else {
        const medio = Math.floor(MAX_BOTONES / 2);
        if (this.paginaActual <= medio + 1) {
          inicioPaginas = 1;
          finPaginas = MAX_BOTONES;
        } else if (this.paginaActual >= totalPaginas - medio) {
          inicioPaginas = totalPaginas - MAX_BOTONES + 1;
          finPaginas = totalPaginas;
        } else {
          inicioPaginas = this.paginaActual - medio;
          finPaginas = this.paginaActual + medio;
        }
      }

      if (inicioPaginas > 1) {
        botonesHtml += `<button class="paginacion-btn" data-pagina="1">1</button>`;
        if (inicioPaginas > 2) {
          botonesHtml += `<span class="paginacion-elipsis">...</span>`;
        }
      }

      for (let i = inicioPaginas; i <= finPaginas; i++) {
        const activo = i === this.paginaActual ? ' activo' : '';
        botonesHtml += `<button class="paginacion-btn${activo}" data-pagina="${i}">${i}</button>`;
      }

      if (finPaginas < totalPaginas) {
        if (finPaginas < totalPaginas - 1) {
          botonesHtml += `<span class="paginacion-elipsis">...</span>`;
        }
        botonesHtml += `<button class="paginacion-btn" data-pagina="${totalPaginas}">${totalPaginas}</button>`;
      }
    }

    this.footer.innerHTML = `
      <div class="paginacion-izquierda">
        Mostrar
        <select class="paginacion-select">
          <option value="10" ${this.elementosPorPagina === 10 ? 'selected' : ''}>10</option>
          <option value="20" ${this.elementosPorPagina === 20 ? 'selected' : ''}>20</option>
          <option value="50" ${this.elementosPorPagina === 50 ? 'selected' : ''}>50</option>
        </select>
        registros por página
      </div>
      <div class="paginacion-centro">
        <div class="paginacion-controles">
          <button class="paginacion-btn paginacion-nav" data-accion="anterior" ${this.paginaActual <= 1 ? 'disabled' : ''}>
            <i class="ph ph-caret-left"></i> Anterior
          </button>
          ${botonesHtml}
          <button class="paginacion-btn paginacion-nav" data-accion="siguiente" ${this.paginaActual >= totalPaginas ? 'disabled' : ''}>
            Siguiente <i class="ph ph-caret-right"></i>
          </button>
        </div>
      </div>
      <div class="paginacion-derecha">
        <span class="paginacion-info">${info}</span>
      </div>
    `;

    this.footer.querySelectorAll('.paginacion-btn[data-pagina]').forEach(btn => {
      btn.addEventListener('click', () => this._irPagina(Number(btn.dataset.pagina)));
    });

    const btnAnt = this.footer.querySelector('[data-accion="anterior"]');
    if (btnAnt) btnAnt.addEventListener('click', () => this._irPagina(Math.max(1, this.paginaActual - 1)));

    const btnSig = this.footer.querySelector('[data-accion="siguiente"]');
    if (btnSig) btnSig.addEventListener('click', () => this._irPagina(Math.min(totalPaginas, this.paginaActual + 1)));

    const select = this.footer.querySelector('.paginacion-select');
    if (select) {
      select.addEventListener('change', (e) => {
        this.elementosPorPagina = Number(e.target.value);
        this._irPagina(1);
      });
    }
  }

  _irPagina(n) {
    this.paginaActual = n;
    this._renderPagina();
  }

  obtenerElemento() {
    return this.contenedor;
  }
}
