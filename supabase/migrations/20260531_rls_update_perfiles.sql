-- Función helper SECURITY DEFINER para evitar recursión RLS
CREATE OR REPLACE FUNCTION public.usuario_actual_rol()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$;

-- Política de actualización por jerarquía:
--   Rol 1 (Desarrollador) → puede actualizar TODOS los perfiles
--   Rol 2 (Administrador) → puede actualizar solo perfiles con rol = 3 (Operador)
--   Rol 3 (Operador)      → puede actualizar solo su propio perfil
CREATE POLICY "Actualizar perfiles por jerarquía" ON public.perfiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.usuario_actual_rol() = 1
    OR (public.usuario_actual_rol() = 2 AND rol = 3)
  )
  WITH CHECK (
    auth.uid() = id
    OR public.usuario_actual_rol() = 1
    OR (public.usuario_actual_rol() = 2 AND rol = 3)
  );
