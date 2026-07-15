-- ==========================================
-- MIGRACIÓN: Módulo Agenda
-- Tablas: agenda_eventos, agenda_notificaciones
-- ==========================================

-- 1. TABLA: agenda_eventos
CREATE TABLE IF NOT EXISTS public.agenda_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  fecha_evento DATE NOT NULL,
  hora_evento TIME,
  tipo TEXT NOT NULL DEFAULT 'evento',
  documento_id UUID REFERENCES public.documentos(id) ON DELETE SET NULL,
  usuario_asignado UUID NOT NULL REFERENCES public.perfiles(id),
  creado_por UUID NOT NULL REFERENCES public.perfiles(id),
  completado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
  
-- 2. TABLA: agenda_notificaciones
CREATE TABLE IF NOT EXISTS public.agenda_notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id),
  evento_id UUID REFERENCES public.agenda_eventos(id) ON DELETE CASCADE,
  documento_id UUID REFERENCES public.documentos(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  mensaje TEXT,
  leido BOOLEAN NOT NULL DEFAULT false,
  fecha_lectura TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_notificaciones ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS — agenda_eventos
CREATE POLICY "Usuarios leen sus eventos" ON public.agenda_eventos
  FOR SELECT USING (
    auth.uid() = usuario_asignado OR auth.uid() = creado_por
  );

CREATE POLICY "Usuarios crean eventos" ON public.agenda_eventos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuarios actualizan sus eventos" ON public.agenda_eventos
  FOR UPDATE USING (
    auth.uid() = usuario_asignado OR auth.uid() = creado_por
  );

CREATE POLICY "Usuarios eliminan sus eventos" ON public.agenda_eventos
  FOR DELETE USING (
    auth.uid() = usuario_asignado OR auth.uid() = creado_por
  );

-- 5. POLÍTICAS — agenda_notificaciones
CREATE POLICY "Usuarios leen sus notificaciones" ON public.agenda_notificaciones
  FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "Usuarios actualizan sus notificaciones" ON public.agenda_notificaciones
  FOR UPDATE USING (auth.uid() = usuario_id);

CREATE POLICY "Sistema crea notificaciones" ON public.agenda_notificaciones
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
