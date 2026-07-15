-- Tabla de feriados
create table if not exists feriados (
  id serial primary key,
  fecha date not null,
  nombre text not null,
  unique(fecha)
);

alter table feriados enable row level security;

create policy "Feriados visible para todos los autenticados"
  on feriados for select
  using (auth.role() = 'authenticated');

create or replace function calcular_pascua(ano int)
returns date
language sql
as $$
  select make_date(ano, 3, 21) + (
    (19 * (ano % 19) + 24) % 30 +
    (2 * (ano % 4) + 4 * (ano % 7) + 6 * (19 * (ano % 19) + 24) % 30 + 5) % 7
  )::int
$$;

with feriados_fijos as (
  select
    unnest(array[
      make_date(y, 1, 1),   make_date(y, 5, 1),   make_date(y, 6, 29),
      make_date(y, 7, 28),  make_date(y, 7, 29),  make_date(y, 8, 30),
      make_date(y, 10, 8),  make_date(y, 11, 1),  make_date(y, 12, 8),
      make_date(y, 12, 25)
    ]) as fecha,
    unnest(array[
      'Año Nuevo',           'Día del Trabajo',     'San Pedro y San Pablo',
      'Fiestas Patrias',     'Fiestas Patrias',     'Santa Rosa de Lima',
      'Combate de Angamos',  'Todos los Santos',    'Inmaculada Concepción',
      'Navidad'
    ]) as nombre
  from generate_series(2025, 2035) as y
),
feriados_moviles as (
  select
    calcular_pascua(y) - 3 as jueves_santo,
    calcular_pascua(y) - 2 as viernes_santo
  from generate_series(2025, 2035) as y
)
insert into feriados (fecha, nombre)
select fecha, nombre from feriados_fijos
union all
select jueves_santo, 'Jueves Santo' from feriados_moviles
union all
select viernes_santo, 'Viernes Santo' from feriados_moviles
on conflict (fecha) do nothing;
