# CHANGELOG — COSTPRO / Fichas de Costo

Formato: Keep a Changelog simplificado. Cada versión corresponde a un tag `vX.Y.Z` y a un GitHub Release con `FC.release.html` + `release/release-manifest.json`.

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
