-- ==========================================
-- MIGRACIÓN: Agregar columnas para derivaciones
-- Tabla: documentos
-- ==========================================

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS estado_actual TEXT,
  ADD COLUMN IF NOT EXISTS area_destino TEXT,
  ADD COLUMN IF NOT EXISTS observaciones_derivacion TEXT;

-- Actualizar la política de RLS para que derivados también se puedan insertar
-- (ya existe política que permite INSERT para authenticated)
