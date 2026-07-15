const NORMALIZACION = {
  aMayusculasSinTilde(texto) {
    if (!texto) return '';
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  },

  aTitulo(texto) {
    if (!texto) return '';
    const limpio = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
  },

  formatear(texto, formato) {
    if (!texto) return '';
    if (formato === 'mayusculas') return this.aMayusculasSinTilde(texto);
    if (formato === 'minusculas') return texto.toLowerCase();
    if (formato === 'titulo') return this.aTitulo(texto);
    return texto;
  },
};
