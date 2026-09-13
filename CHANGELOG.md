# CHANGELOG — COSTPRO / Fichas de Costo

Formato: Keep a Changelog simplificado. Cada versión corresponde a un tag `vX.Y.Z` y a un GitHub Release con `FC.release.html` + `release/release-manifest.json`.

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
