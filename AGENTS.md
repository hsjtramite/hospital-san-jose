# AGENTS.md — Sistema de Trámite Documentario

## Stack

Vanilla HTML/CSS/JS frontend (no bundler, no framework). Supabase backend (Postgres, Auth, Storage, Edge Functions via Deno). No automated tests (`npm test` is a stub).

## Developer workflow

- No build step. Open `.html` files directly in browser or serve with any static server.
- No linter, formatter, or typecheck config exists. Do not add one without asking.
- `npm install` installs docxtemplater, pizzip, jszip, xml2js, @supabase/supabase-js (used only for Node contexts; frontend loads supabase-js from CDN).

## Frontend architecture

### Script load order (critical)

1. Supabase CDN: `<script src="https://unpkg.com/@supabase/supabase-js@2"></script>`
2. `js/configuracion/aplicacion.js` — defines global `CONFIGURACION` (frozen)
3. `js/servicios/supabase.js` — initializes `var supabase` (global)
4. `js/componentes/header.js` — waits for `DOMContentLoaded`, emits `header:listo`
5. `js/componentes/lateral.js` — waits for `header:listo`, emits `lateral:listo`
6. Page-specific script (e.g., `js/paginas/login.js`, `js/paginas/dashboard.js`)

### Conventions

- `<body>` uses data attributes: `data-pagina`, `data-ruta`, `data-modulo-activo` (used by header/sidebar)
- Sidebar items use `data-roles="1,2"` for role-based visibility, `data-modulo` for navigation
- Global `CONFIGURACION` object holds supabase URL/key, pagination (default 20), date format (`YYYY/MM/DD`), normalization config
- Text normalization: stored as **UPPERCASE without accents** (NFD normalization). Matches both `js/utilidades/normalizacion.js` and `normalizarTexto()` in Edge Functions
- `window.escaparHtml()` utility injected by header.js

## Supabase backend

### Edge Functions (Deno TypeScript)

Located in `supabase/functions/`. Functions use `https://deno.land/std@0.168.0/http/server.ts` and `npm:@supabase/supabase-js@2`.

- VS Code config in `.vscode/settings.json` enables Deno for `supabase/functions`
- All functions have `verify_jwt = false` in `supabase/config.toml` — they verify JWT manually via `adminClient.auth.getUser(token)`
- Functions use `SERVICE_ROLE_KEY` (bypasses RLS) for admin operations

Functions:
- `crear-usuario` — creates auth user + profile; role 1 (Desarrollador) and 2 (Administrador) only; Admin can only create role 3 (Operador)
- `editar-usuario` — updates auth + profile; same role hierarchy
- `generar-numero-documento` — returns next sequential document number
- `crear-documento` — validates auth, calls `crear_documento_atomico` RPC

### Database

**Key tables**: `perfiles`, `areas`, `contadores_documentos`, `documentos`, `documentos_archivos`, `agenda_eventos`, `agenda_notificaciones`, `feriados`

**Roles**: 1 = Desarrollador, 2 = Administrador, 3 = Operador

**Document numbering**: Format `{NNN}-{YYYY}-US`. Atomic counter via `crear_documento_atomico()` PL/pgSQL function (in migration `20260601_atomic_documentos.sql`). Uniqueness constraint on `(tipo_documento, numero_documento)`.

**RLS**: Most tables allow SELECT/INSERT for authenticated users. Updates/Deletes restricted by role hierarchy (helper `usuario_actual_rol()` in `20260531_rls_update_perfiles.sql`).

**Password recovery**: Multi-step modal using Supabase Auth (`resetPasswordForEmail` → `verifyOtp` with type `recovery` → `updateUser`). Email must be `@gmail.com`.

**Realtime**: `supabase_realtime` publication includes `agenda_notificaciones`. Header.js subscribes for live notifications with sound.

### Login flow

1. Lookup `perfiles` by `nombre_usuario` (case-insensitive)
2. Check `activo` flag
3. `supabase.auth.signInWithPassword({ email: perfil.gmail, password })`

### Migrations

Located in `supabase/migrations/`, prefixed `YYYYMMDD_`. Run via `supabase migration up` (Supabase CLI).

## Document generation

Word (.docx) generation via docxtemplater + PizZip:

- Template: `assets/plantillas/Plantilla - Emitir.docx`
- Tags: `{FECHA_LARGA}`, `{TIPO_DOC}`, `{NUM_DOC}`, `{DESTINATARIO}`, `{CARGO}`, `{ASUNTO}`, `{CUERPO}`, `{FIRMA}`
- `{FIRMA}` placeholder is replaced with inline image via XML manipulation (DrawingML) in `js/componentes/generar-word.js`
- Firma images are fetched, resized (max 250px wide), converted to PNG, inserted into ZIP
- Output uploaded to Supabase Storage bucket `documentos` at `emitidos/{username}/{numDoc}.docx`

## Cleanup scripts

- `sql/limpiar_datos.sql` — SQL: `DELETE FROM documentos_archivos; DELETE FROM documentos; DELETE FROM contadores_documentos;`
- `sql/limpiar_consola.js` — browser console script: deletes DB rows + Storage files from `documentos` bucket (folders: emitidos, temp, derivados)

## Notable quirks

- `tmp_doc.xml`, `tmp_doc_replaced.xml`, `tmp_plantilla/` — temporary/experimental files, not part of the active codebase
- No automated tests; manual testing via browser
- No CI/CD config present
- Supabase Storage bucket name: `documentos`, subfolders: `emitidos/`, `derivados/`, `temp/`, `firmas/`
- `firma_url` stored in `perfiles` table, used in docx generation
- The `fecha` field in `documentos` uses `DATE` type (not timestamp)
