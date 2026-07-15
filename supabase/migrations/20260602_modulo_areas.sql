-- ==========================================
-- MIGRACIÓN: Módulo Áreas
-- 1. Agregar columna activo a areas
-- 2. Políticas RLS para UPDATE
-- ==========================================

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

-- Política: Desarrollador (1) puede actualizar áreas
CREATE POLICY "Desarrollador actualiza areas" ON public.areas
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 1)
  );

-- Política: Desarrollador (1) puede eliminar áreas (DELETE físico, aunque usamos soft-delete)
CREATE POLICY "Desarrollador elimina areas" ON public.areas
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 1)
  );
