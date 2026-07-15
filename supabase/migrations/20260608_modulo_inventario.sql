-- ==========================================
-- MIGRACIÓN SIMPLIFICADA: Módulo de Inventario
-- 2 tablas: inventario_articulos + inventario_movimientos
-- ==========================================

CREATE TABLE IF NOT EXISTS public.inventario_articulos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  categoria TEXT,
  unidad_medida TEXT,
  stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id UUID NOT NULL REFERENCES public.inventario_articulos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'importacion')),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  stock_anterior INTEGER NOT NULL,
  stock_actual INTEGER NOT NULL,
  proveedor TEXT,
  numero_documento TEXT,
  numero_cargo TEXT,
  area_solicitante TEXT,
  responsable_receptor TEXT,
  dni TEXT,
  observacion TEXT,
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.inventario_articulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura autenticados inventario_articulos" ON public.inventario_articulos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Lectura autenticados inventario_movimientos" ON public.inventario_movimientos
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Insercion autenticados inventario_articulos" ON public.inventario_articulos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Insercion autenticados inventario_movimientos" ON public.inventario_movimientos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Actualizacion autenticados inventario_articulos" ON public.inventario_articulos
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Actualizacion autenticados inventario_movimientos" ON public.inventario_movimientos
  FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Solo desarrollador elimina inventario_articulos" ON public.inventario_articulos
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 1));
CREATE POLICY "Solo desarrollador elimina inventario_movimientos" ON public.inventario_movimientos
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 1));
