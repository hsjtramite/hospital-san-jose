-- 1. Eliminar la restricción de unicidad global en numero_documento
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_numero_documento_key;

-- 2. Añadir la restricción de unicidad combinada (tipo_documento, numero_documento)
ALTER TABLE public.documentos ADD CONSTRAINT documentos_tipo_numero_key UNIQUE (tipo_documento, numero_documento);

-- 3. Crear la función RPC para garantizar la atomicidad en la creación de contadores y documentos
CREATE OR REPLACE FUNCTION crear_documento_atomico(
  p_tipo TEXT,
  p_tipo_documento TEXT,
  p_fecha DATE,
  p_prioridad TEXT,
  p_autor_id UUID,
  p_remitente_id UUID,
  p_area_id UUID,
  p_destinatario TEXT,
  p_cargo_destinatario TEXT,
  p_asunto TEXT,
  p_cuerpo_documento TEXT,
  p_creado_por UUID
) RETURNS jsonb AS $$
DECLARE
  v_anio INTEGER;
  v_contador_minimo INTEGER;
  v_contador INTEGER;
  v_numero_documento TEXT;
  v_doc_id UUID;
BEGIN
  -- Calcular el año en base a la fecha enviada
  v_anio := extract(year from p_fecha);

  -- Obtener el contador máximo actual en documentos para evitar solapamientos
  SELECT COALESCE(MAX(contador), 0) INTO v_contador_minimo 
  FROM public.documentos 
  WHERE tipo_documento = p_tipo_documento;

  -- Insertar o actualizar el contador en la tabla contadores_documentos de forma atómica
  INSERT INTO public.contadores_documentos (tipo_documento, "año", ultimo_contador)
  VALUES (p_tipo_documento, v_anio, GREATEST(1, v_contador_minimo + 1))
  ON CONFLICT (tipo_documento, "año")
  DO UPDATE SET ultimo_contador = GREATEST(contadores_documentos.ultimo_contador + 1, v_contador_minimo + 1)
  RETURNING ultimo_contador INTO v_contador;

  -- Construir la cadena numero_documento
  v_numero_documento := lpad(v_contador::text, 3, '0') || '-' || v_anio::text || '-US';

  -- Insertar el documento (si la combinación tipo_documento + numero_documento ya existe, fallará aquí 
  -- y revertirá TODO, incluyendo el avance del contador)
  INSERT INTO public.documentos (
    tipo, tipo_documento, numero_documento, contador, fecha,
    prioridad, autor_id, remitente_id, area_id, destinatario, cargo_destinatario,
    asunto, cuerpo_documento, creado_por
  ) VALUES (
    p_tipo, p_tipo_documento, v_numero_documento, v_contador, p_fecha,
    p_prioridad, p_autor_id, p_remitente_id, p_area_id, p_destinatario, p_cargo_destinatario,
    p_asunto, p_cuerpo_documento, p_creado_por
  ) RETURNING id INTO v_doc_id;

  -- Retornar el ID del documento creado y el número de documento final
  RETURN jsonb_build_object('id', v_doc_id, 'numero_documento', v_numero_documento);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
