-- ============================================
-- SCRIPT DE LIMPIEZA — TRÁMITES
-- Elimina datos de pruebas/inconsistentes
-- Orden: hijos → padres (evita FK violations)
-- ============================================

BEGIN;

DELETE FROM documentos_archivos;
DELETE FROM documentos;
DELETE FROM contadores_documentos;

COMMIT;

-- ============================================
-- RESET CONTADORES (después de limpiar)
-- Ajusta el contador inicial según documentos
-- existentes que quieras conservar.
-- ============================================
-- Si decides conservar documentos existentes,
-- ejecuta esto para sincronizar contadores:
-- ============================================

-- INSERT INTO contadores_documentos (tipo_documento, anio, ultimo_contador)
-- SELECT d.tipo_documento, EXTRACT(YEAR FROM d.fecha)::int, MAX(d.contador)
-- FROM documentos d
-- GROUP BY d.tipo_documento, EXTRACT(YEAR FROM d.fecha);

-- ============================================
-- O, si prefieres resetear todo desde 1:
-- ============================================

-- DELETE FROM contadores_documentos;

-- ============================================
-- LIMPIEZA DE STORAGE (bucket "documentos")
-- ============================================
-- Ejecutar en la consola del navegador estando
-- logueado en el dashboard de Supabase:
-- ============================================

/*
const { createClient } = require('@supabase/supabase-js')

const supabase = window.supabase

const bucket = supabase.storage.from('documentos')
const carpetas = ['emitidos', 'derivados', 'temp', 'firmas']

async function limpiarStorage() {
  for (const carpeta of carpetas) {
    const { data: items } = await bucket.list(carpeta, { limit: 1000 })
    if (!items?.length) continue

    for (const item of items) {
      const ruta = `${carpeta}/${item.name}`
      if (item.id) {
        await bucket.remove([ruta])
      } else {
        const { data: archivos } = await bucket.list(ruta, { limit: 1000 })
        if (archivos?.length) {
          const rutas = archivos.map(a => `${ruta}/${a.name}`)
          await bucket.remove(rutas)
        }
      }
    }
  }
  console.log('Storage limpio')
}

limpiarStorage()
*/
