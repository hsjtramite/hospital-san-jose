-- ============================================
-- SCRIPT DE LIMPIEZA — INVENTARIO
-- Elimina todos los artículos y movimientos
-- Orden: hijos → padres (evita FK violations)
-- ============================================

BEGIN;

DELETE FROM inventario_movimientos;
DELETE FROM inventario_articulos;

COMMIT;
