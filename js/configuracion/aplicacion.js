const CONFIGURACION = {
  nombre: 'Sistema de Trámite Documentario',
  version: '1.0.0',
  autor: 'Juvissa Villa',

  supabase: {
    url: 'https://cizujpnppgazwofczbcg.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpenVqcG5wcGdhendvZmN6YmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTE2MzMsImV4cCI6MjA5MzY4NzYzM30.bxyC2nJ4WDnlrhiCY4gTI4qy26p8pECFQ3J_gTzvzbg',
  },

  almacenamiento: {
    clave: 'tramite-documentario',
    tipo: 'localStorage',
  },

  paginacion: {
    elementosPorPagina: 20,
  },

  normalizacion: {
    alGuardar: 'mayusculas_sin_tilde',
    visualizacion: {
      login: {
        nombre_usuario: 'original',
      },
    },
  },

  formato: {
    fecha: 'YYYY/MM/DD',
    moneda: 'PEN',
    zonaHoraria: 'America/Lima',
  },
};

Object.freeze(CONFIGURACION);