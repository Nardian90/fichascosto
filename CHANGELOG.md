# CHANGELOG — COSTPRO / Fichas de Costo

Formato: Keep a Changelog simplificado. Cada versión corresponde a un tag `vX.Y.Z` y a un GitHub Release con `FC.release.html` + `release/release-manifest.json`.

## v12.8.0 — 2026-09-15 · FASE 24.4 · Cloud Fichas (infraestructura Supabase existente, 0 DDL)

### Added
- **Cloud Fichas (FcSheets)**: las fichas se guardan también en la nube usando la tabla **existente** `cost_sheets` del proyecto Supabase compartido con el panel COSTPRO — ownership por RLS (`created_by = auth.uid()`), datos en `data` JSONB (`{model:'FC_RES148_2023_V1', ficha, header}`), versionado por `updated_at` server (trigger existente). **0 DDL: sin tablas, columnas, políticas ni RPC nuevos** (auditoría forense previa: `product_cost_sheets` descartada por acoplamiento retail).
- **Signup cloud en la puerta** (Opción C del pliego): el registro ahora pide **correo + contraseña** y crea la cuenta COSTPRO real (`/auth/v1/signup`), con **confirmación de email obligatoria** (sin bypass) y sesión local puente para entrar de inmediato. Las cuentas locales existentes (usuario/admin/registradas) y su ciclo comercial siguen funcionando exactamente igual; el login con email conecta la nube y prepara el puente (`Auth.bridgeRegister`, PBKDF2 como siempre, idempotente).
- **Migración Guest → Free idempotente**: al conectar la cuenta, las fichas locales (incluidas las 3 del invitado) suben a la nube con `verify-then-mark` (nunca se marca antes de confirmar la fila devuelta), mapa por `data.ficha.id` → re-ejecutar NO duplica; la copia local **nunca se borra** (§39).
- **Sync mínimo local↔nube**: pull (importa fichas propias de otros dispositivos), push (sube cambios reales — detección por hash de contenido, inmune a toques de UI), deletes (DELETE server + tumba local + anti-resurrección si la fila ya no existe). Disparadores: sesión online, evento `online`, visibilidad, botón «Sincronizar ahora», intervalo suave. Sin red, todo sigue funcionando local (cola persistente).
- **Conflictos LWW con cero pérdida**: `rev` conocida vs `updated_at` real antes de cada PATCH; si difiere, gana la versión más reciente y la perdedora se conserva como ficha local «(copia en conflicto)». Sin merge automático (decisión explícita del pliego).
- **UI honesta (§36)**: fila «Cloud Fichas» en Mi cuenta (Sincronizado / Cambios pendientes (n) / Sin conexión / Reintentar) + botón «Sincronizar ahora»; textos actualizados (ya no dice «las fichas nunca se suben a la nube»). El usuario nunca ve Supabase/RLS/JWT.

### Changed
- `APP_CONFIG.cloud.sheetsEnabled` (default true): interruptor único del módulo — rollback de una línea, sin cambios server.
- CI: `npm ci` + `package-lock.json` (toolchain bloqueado con dependencias transitivas) — determinismo reforzado tras detectar deriva del minificador al reconstruir v12.7.0 sin lockfile.

### Unchanged
- `computeFicha()` — hash c5f4dca8042385c36e49c76992269b25 (antes == después; round-trip cloud verificado: `computeFicha(ficha)` idéntico tras descargar de la nube).
- Sin cambios en Supabase (esquema/RLS/Auth/RPC), sin pagos, sin Pro/Enterprise, sin límites Free (freeEnforce=false intacto), sin Internet obligatorio, sin reescritura del monolito. Ecosistema Next.js sin tocar (`cost_sheets` la comparte por diseño; `product_cost_sheets` intacta).

## v12.7.0 — 2026-09-15 · FASE 24.3 · Modelo de producto Guest → Free → Pro (activación, no paywall)

### Added
- **Guest: 3 experiencias reales de ficha** (activación, NO cuota): el invitado prueba COSTPRO completo; la unidad es la FICHA PROPIA que crea — abrir, editar, recalcular, guardar, duplicar e imprimir dentro de esas fichas NO consumen, y los ejemplos de la presentación tampoco. Báscula local por dispositivo (FC_GUEST_EXP_V1), honesta y sin valor comercial: la autoridad real de datos llegará con Cloud Fichas.
- **Transición Guest → Free suave y única**: al agotar la 3.ª experiencia se ofrece «Crea tu cuenta gratis para continuar usando COSTPRO y conservar tu trabajo» → puerta en la pestaña «Crear cuenta». Sin contadores permanentes, sin paywall, sin lenguaje técnico (§8/§25 del pliego).

### Changed
- **POLÍTICA COMERCIAL 24.3 — Free sin límite cuantitativo (por ahora)**: `APP_CONFIG.cloud.freeEnforce = false`. La infraestructura de cuotas de 24.2 (user_usage + RPC increment_user_usage, espejo exacto del Next.js) permanece viva en MODO TELEMETRÍA: `recordUsage` sigue contando tras cada éxito (señal «días con tope alcanzado» para la decisión futura sobre el número Free) pero `checkQuota`/`guard` NUNCA bloquean al plan Free. `showQuotaBlocked` queda dormant. Motivo: coste marginal ~cero de las operaciones Free en una app local-first, prioridad adquisición→activación→retención→monetización, y ausencia de autoridad de datos para límites de stock (llegará con Cloud Fichas). Reversible con una sola flag.
- «Uso de hoy» en Mi cuenta: Free se muestra sin denominador («Crear 2 · Exportar PDF 1 · Importar 0 — sin límite»), con «≥3» cuando la telemetría local alcanzó el tope del sistema.
- Textos de la puerta y de Mi cuenta actualizados para describir el modelo de invitado con honestidad.
- CI (release.yml): el build del release fija `FC_BUILD_DATE` con la fecha del commit etiquetado → builds deterministas (corrige el defecto detectado al publicar v12.5.0–v12.6.1, cuyos assets ya fueron sincronizados manualmente a los bytes canónicos).

### Unchanged
- `computeFicha()` — hash c5f4dca8042385c36e49c76992269b25 (antes == después).
- Sin cambios en Supabase (esquema/RLS/Auth), sin pagos, sin Enterprise/Multi-Tienda, sin cloud sync, sin reescritura del monolito.

## v12.6.1 — 2026-09-13 · FASE 24.2-P · Hardening quirúrgico de buildPrint()

### Fixed
- **`TypeError` preexistente al imprimir con almacén vacío o id huérfano** (documentado desde FASE 24.1, reproducible idéntico en v12.4.0–v12.6.0): sin ficha activa, `buildPrintDoc()` leía `f.nombre` sobre `undefined` y el flujo Vista previa / Exportar PDF se rompía con `TypeError: Cannot read properties of undefined (reading 'nombre')`. Fix quirúrgico (2 guardias, +17 líneas, 0 refactor):
  - **Guardia documental** en `buildPrintDoc()`: sin ficha activa devuelve un documento controlado («Sin ficha activa — abra o cree una ficha») — misma `buildPrintDoc` para Preview y PDF (paridad preservada). Con ficha, el flujo es byte-idéntico (verificado por comparación md5 del documento antes/después).
  - **Guardia de exportación** en `pdfExportDoc()`: sin ficha activa avisa y NO consume cuota (`fc_export` se registra UNA sola vez tras el ÉXITO real; exportar nada no es un éxito). `window.print()` no se invoca.

### Changed
- Pipeline de build: etiqueta de fase 24.2-P; versión patch 12.6.0 → 12.6.1 (sin capacidades nuevas).

### Offline (inalterado por diseño)
- El núcleo local sigue 100% operativo sin Internet; la guardia es puramente local (no depende de red ni de FcCloud).

### Accounting
- `computeFicha()`: **SIN MODIFICACIONES** — engineHash `c5f4dca8042385c36e49c76992269b25` ANTES == DESPUÉS (fuente); motor minificado del release `aa9a255f…` idéntico al de v12.6.0. Supabase: 0 cambios. COSTPRO Next.js: 0 cambios.
- Regresión completa en verde (22 suites, 803 verificaciones): f242p_buildprint 46/46 (nueva, casos A–E DEV+REL) · f242_quota 71/71 · f241_cloud 79/79 · f26_equiv 44/44 · audit_motor 39/39 DEV+REL · test-version 18/18 · f23_vmgr 43/43 · landing 68/68 · login_landing 25/25 · smoke 29/29 · release_check 8/8 · audit_seguridad 8/8 · audit_visual 28/28 · f17 51/51 · anexos 46/46 · mipyme 63/63 · apoyo 29/29 · csvfix 34/34 · perf 15/15 · responsive 8/8 · v2_mobile 12/12.

## v12.6.0 — 2026-09-13 · FASE 24.2 · FcCloud — cuotas reales Free/Pro (sistema comercial existente)

### Added
- **Cuotas reales en FcCloud**, consumiendo el sistema comercial YA EXISTENTE del proyecto Supabase compartido con COSTPRO Next.js — sin duplicar usuarios, planes, cuotas ni licencias:
  - **Verificación previa** (`FcCloud.guard(accion)`): para plan Free lee el uso del día en `user_usage` (RLS: solo filas propias; `usage_date` = día UTC, la MISMA expresión del `usage-service.ts` del Next.js) y bloquea la acción comercial si el límite (3/día por acción, la MISMA cifra que el Next.js pasa al RPC) está alcanzado.
  - **Registro posterior al éxito** (`FcCloud.recordUsage(accion)`): invoca el RPC existente `increment_user_usage(p_user_id, p_action_type, p_limit)` EXACTAMENTE como lo hace el Next.js — una sola vez, DESPUÉS de que la acción se completó, fire-and-forget (fail-open: nunca degrada una acción ya hecha).
  - **Plan Free**: 3 operaciones/día por acción (`fc_create`, `fc_export`, `fc_import`). **Pro / Enterprise / rol admin**: ilimitado, sin llamadas al RPC (espejo exacto de `usageService` del Next.js). Enterprise queda como plan del backend: NO introduce ninguna funcionalidad enterprise en FC.
- **Qué consume cuota** (definición FC, coherente con §8 del pliego): crear ficha nueva (la «única vía» de creación) → `fc_create`; exportar PDF (al confirmar la exportación, equivalente funcional del `doc.save()` del Next.js) → `fc_export`; importar JSON (tras el éxito) → `fc_import`. **Gratis**: editar, recalcular, abrir, guardar local, duplicar, «Guardar como nueva ficha», imprimir y los ejemplos incluidos.
- **Estados comerciales coherentes** (§12): invitado → capa comercial inactiva (FC íntegra); autenticado-online → enforcement real; autenticado-offline → caché del día (si el límite conocido se alcanzó, bloquea con mensaje claro; sin dato del día, fail-open — mismo criterio que `usage-service.ts` ante error de BD); sesión expirada → capa inactiva; error de red → fail-open.
- **UI comercial mínima** (progressive disclosure, sin banners ni paywalls): fila «Uso de hoy» en la tarjeta «Mi cuenta» (solo con sesión: «Crear n/3 · Exportar PDF n/3 · Importar n/3» o «Ilimitado» para Pro/Enterprise) y, únicamente al alcanzar el límite, un modal claro («Límite del plan Free», renovación mañana, trabajo local intacto) con CTA «Conoce COSTPRO Pro» hacia la plataforma. Cero jerga técnica.
- Caché de uso propia `FC_CLOUD_USAGE_V1` (metadatos comerciales del propio usuario; jamás datos de fichas).

### Changed
- La insignia de la tarjeta nube pasa de «solo lectura» a «cuenta real» (las cuotas usan el RPC existente).
- Pipeline de build: 5 verificaciones nuevas de FASE 24.2 (única escritura REST = RPC del sistema existente; cuotas activas con contrato completo; sin sistemas comerciales paralelos).

### Security
- Única escritura REST del cliente: el RPC `increment_user_usage` del sistema existente (verificado por pipeline + tripwire E2E). Sin `.insert/.upsert/.delete`, sin service_role, sin secretos; la publishable key sigue siendo la única credencial (1 vez).
- Nada de contadores locales falsos ni cuotas paralelas: la verdad comercial vive en Supabase; la caché local es solo para el estado offline.

### Offline (inalterado por diseño)
- Sin Internet el núcleo sigue 100% operativo (crear/editar/calcular/guardar/abrir/Preview/PDF). El invitado no tiene cuota (la infraestructura existente solo mide usuarios autenticados); el autenticado sin red usa la caché del día con política documentada.

### Accounting
- `computeFicha()`: **SIN MODIFICACIONES** — engineHash `c5f4dca8042385c36e49c76992269b25` INVARIANTE (fuente). Supabase: 0 cambios (solo lecturas RLS + RPC existente invocado como el Next.js). COSTPRO Next.js: 0 cambios.

## v12.5.0 — 2026-09-13 · FASE 24.1 · FcCloud — identidad en la nube (solo lectura)

### Added
- **FcCloud**, nueva capa de identidad en la nube, OPCIONAL y AISLADA del núcleo: integra FC con la MISMA instancia de Supabase que usa COSTPRO Next.js (proyecto `wthkddeleylijmonclxg`) en la capa de identidad exclusivamente.
  - Login email+password (`/auth/v1/token?grant_type=password`, mismo servicio que el LoginForm del Next.js), logout, restauración de sesión al arrancar con refresco silencioso, y expiración/revocación detectada con degradación honesta.
  - Lectura de `profiles` (nombre, rol, plan `profiles.plan`) y de la organización (`tenants`: plan, estado de prueba y fecha) respetando las políticas RLS existentes — si RLS no devuelve filas, la tarjeta muestra «no disponible» y nada más.
  - UI con los COSTPRO DESIGN TOKENS: sección «Cuenta COSTPRO en la nube (opcional)» en la puerta de sesión, tarjeta de estado en «Mi cuenta» (conectada / expirada / sin conexión / error, siempre con salida), ítem «Cuenta en la nube» en el menú de usuario con insignia de plan.
  - Estados de la cuenta: `desconectado · conectando · online · expirada · offline (identidad cacheada) · error`; evento DOM `fccloud:change` y `FcCloud.onChange()` para capas futuras.
- **Punto de integración de cuotas para 24.2**: `FcCloud.checkQuota(accion)` expone la firma estable del sistema de cuotas YA EXISTENTE del proyecto (`user_usage` + `increment_user_usage`, acciones `fc_create/fc_export/fc_import`, límite free 3/día) — NO activo en 24.1.
- Transporte REST directo de GoTrue/PostgREST con timeout (8 s): cero dependencias externas, cero `<script src>` nuevos, cero cargas al arrancar (todo es perezoso).

### Security
- En el cliente SOLO viajan la URL del proyecto y la publishable key (credencial PÚBLICA de cliente por diseño, la misma que distribuye el cliente del Next.js). Sin claves de servicio, secretos ni tokens privados — verificado por el pipeline.
- Solo lectura: ninguna escritura REST en el código (verificación nueva del pipeline); RLS existente respetado tal cual; tripwire E2E que falla ante cualquier intento de escritura.
- La sesión se guarda en una clave propia `FC_CLOUD_SESSION_V1`, sin tocar ninguna clave `FC_*` existente.

### Offline (inalterado por diseño)
- Sin Internet: la app arranca igual, la nube queda en «desconectado/sin conexión» y el núcleo (cálculo, guardado local, Preview, PDF) funciona 100% offline. La nube NUNCA bloquea la puerta local ni el trabajo.

### Accounting
- `computeFicha()`: **SIN MODIFICACIONES** — engineHash `c5f4dca8042385c36e49c76992269b25` INVARIANTE. Supabase sin ningún cambio (esquema, RLS, Auth, policies). COSTPRO Next.js sin ningún cambio.

## v12.4.0 — 2026-09-13 · FASE 23 · DISTRIBUCIÓN OFICIAL

### Added
- Repositorio oficial de distribución `Nardian90/fichascosto` con cadena completa `FC.html → build → FC.release.html → GitHub Release → GitHub Pages`.
- `release/release-manifest.json` (schema 1) generado automáticamente con hashes SHA-256 reales: `sha256` (release), `sourceHash`, `engineHash`; campos `version`, `minimumVersion`, `latestVersion`, `channel`, `releaseDate`.
- **VersionManager** (módulo aislado, sin lógica contable): semver real (11.10.0 > 11.9.0), estados `CURRENT` / `UPDATE_AVAILABLE` / `MANDATORY_UPDATE`, intervalo de comprobación de 7 días con retroceso de 24 h tras fallo, protección anti-downgrade, grace period offline (7/30 días configurable) e integración del estado en «Ayuda › Acerca de».
- `APP_CONFIG.updateManifestUrl` y `APP_CONFIG.releaseDownloadUrl`: única fuente de la URL del manifest y del Release estable.
- Modal de actualizaciones con el lenguaje visual de la app; la actualización obligatoria (§25) solo se declara cuando el manifest real confirma `minimum > instalada`; un fallo de red JAMÁS bloquea (§26).
- GitHub Pages: página oficial de distribución con la identidad visual REAL de COSTPRO (COSTPRO DESIGN TOKENS extraídos verbatim de FC.html) y versión leída del manifest.
- Workflow `.github/workflows/release.yml`: build reproducible + verificación de hashes + tests de versionado + publicación del Release en tags `v*`.

### Fixed
- **Landing accesible desde el Login**: la presentación de COSTPRO puede abrirse desde la puerta de sesión («Ver presentación»), cerrando el ciclo de primera impresión para quien solo ve el login. El foco vuelve al botón, táctil ≥44 px, 320 px sin overflow, Dark/Light.
- z-index del modal de actualizaciones sobre las puertas de sesión (el aviso —incluido el obligatorio— es visible e interactuable también en el login).

### Security
- Escaneo anti-secretos en el pipeline (github_pat_/ghp_/gho_/sk-ant-/claves privadas) y verificación de paridad de cargas externas con la fuente.
- Sin claves privadas en el release: solo clave pública de verificación de licencias.

### Accounting
- `computeFicha()`: **SIN MODIFICACIONES** — engineHash `c5f4dca8042385c36e49c76992269b25` INVARIANTE (byte + comportamiento verificados por las baterías certificadas).

## v12.3.0 — 2026-09-13 · FASE 22B · UNIFICACIÓN VISUAL REAL

### Added
- Un único sistema de diseño: la Landing consume exclusivamente los **COSTPRO DESIGN TOKENS** extraídos de la aplicación (sin paleta propia, cero hex exclusivos).

### Fixed
- Coherencia cromática Landing ↔ App demostrada con valores computados idénticos (22/22) en Dark/Light; mobile 320–1440 px sin overflow.

## v12.2.0 — 2026-09-13 · FASE 22B · FLAG ÚNICO

### Fixed
- La Landing se muestra UNA vez a TODOS los usuarios (incluidos los existentes con datos); jamás se toca el almacenamiento salvo la bandera al Entrar (regla del flag único `FC_LANDING_V1`).

## v12.1.0 — 2026-09-13 · FASE 22A · LANDING / FIRST-RUN EXPERIENCE

### Added
- Landing / First-Run Experience completa: héroe + mockup de Ficha en HTML/CSS/SVG puro, capacidades reales, cinco pasos, ejemplos con importes del motor certificado, Free/Premium, Apoya COSTPRO (datos solo desde `APP_CONFIG`), footer con crédito al desarrollador.
- Acceso voluntario posterior: botón «Presentación» del Centro, enlaces del footer Ayuda/Acerca, tecla Escape.

### Accounting
- `computeFicha()`: SIN MODIFICACIONES (byte + comportamiento, LANDING-26).
