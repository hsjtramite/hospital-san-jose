-- Agregar columna notificado a agenda_eventos para controlar
-- qué eventos ya han generado notificación
alter table agenda_eventos add column if not exists notificado boolean default false;

-- Habilitar Realtime para la tabla agenda_notificaciones
-- para que las notificaciones aparezcan en tiempo real
alter publication supabase_realtime add table agenda_notificaciones;
