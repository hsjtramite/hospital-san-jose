-- ==========================================
-- MIGRACIÓN: agregar eliminación lógica a perfiles
-- ==========================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS eliminado BOOLEAN NOT NULL DEFAULT false;
