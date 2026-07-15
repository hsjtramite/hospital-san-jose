-- ==========================================
-- TABLA: areas
-- ==========================================
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  responsable TEXT NOT NULL,
  cargo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- TABLA: contadores_documentos
-- Número secuencial por tipo de documento + año
-- ==========================================
CREATE TABLE public.contadores_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento TEXT NOT NULL,
  anio INTEGER NOT NULL,
  ultimo_contador INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tipo_documento, anio)
);

-- ==========================================
-- TABLA: documentos (emitidos / derivados)
-- ==========================================
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('emitido', 'derivado')),
  tipo_documento TEXT NOT NULL,
  numero_documento TEXT NOT NULL UNIQUE,
  contador INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  prioridad TEXT NOT NULL CHECK (prioridad IN ('Baja', 'Media', 'Alta', 'Urgente')),
  autor_id UUID NOT NULL REFERENCES public.perfiles(id),
  remitente_id UUID NOT NULL REFERENCES public.perfiles(id),
  area_id UUID REFERENCES public.areas(id),
  destinatario TEXT,
  cargo_destinatario TEXT,
  asunto TEXT NOT NULL,
  cuerpo_documento TEXT NOT NULL,
  creado_por UUID NOT NULL REFERENCES public.perfiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- TABLA: documentos_archivos (adjuntos PDF)
-- ==========================================
CREATE TABLE public.documentos_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  url_archivo TEXT NOT NULL,
  tipo_archivo TEXT DEFAULT 'application/pdf',
  tamano_bytes BIGINT DEFAULT 0,
  subido_por UUID NOT NULL REFERENCES public.perfiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- RLS — Habilitar seguridad por fila
-- ==========================================
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contadores_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_archivos ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLÍTICAS — areas
-- ==========================================
CREATE POLICY "Todos los autenticados leen areas" ON public.areas
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Solo administradores insertan areas" ON public.areas
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 1)
  );

-- ==========================================
-- POLÍTICAS — contadores_documentos
-- ==========================================
CREATE POLICY "Autenticados leen contadores" ON public.contadores_documentos
  FOR SELECT USING (auth.role() = 'authenticated');

-- ==========================================
-- POLÍTICAS — documentos
-- ==========================================
CREATE POLICY "Autenticados leen documentos" ON public.documentos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados crean documentos" ON public.documentos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ==========================================
-- POLÍTICAS — documentos_archivos
-- ==========================================
CREATE POLICY "Autenticados leen archivos" ON public.documentos_archivos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados crean archivos" ON public.documentos_archivos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
