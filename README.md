# COSTPRO — Fichas de Costo

> **Convierte tus costos en decisiones.** · *Seducido por la Estrategia.*

**COSTPRO** es la aplicación profesional de **Ficha de Costos y Gastos** conforme a la metodología de la **Resolución 148/2023 del Ministerio de Finanzas y Precios (MFP), Anexo I**. Funciona **local y offline**: el cálculo y los datos permanecen en el equipo del usuario. La nube (Supabase) es **opcional**: con una cuenta autenticada, las fichas se sincronizan y el plan comercial (`free` / `pro` / `enterprise`) se verifica en el servidor.

Desarrollado por **ADRIAN POMPA SANTANA**.

---

## Distribución oficial

| Artefacto | Uso |
|---|---|
| `FC.release.html` | **El archivo para clientes.** Build de distribución generado por pipeline. |
| `release/release-manifest.json` | Metadatos oficiales de la versión (hashes SHA-256 reales, versión mínima). |
| `docs/` | GitHub Pages: página de distribución + copia servida del release y el manifest. |
| `FC.html` | **MASTER SOURCE** — desarrollo, comentarios y auditoría. No se entrega al cliente. |

### Página oficial (GitHub Pages)

**https://nardian90.github.io/fichascosto/**

- **Abrir COSTPRO** — ejecuta la versión oficial distribuida (`docs/release/FC.release.html`).
- **Descargar COSTPRO** — apunta siempre al último **Release estable** de GitHub (nunca a commits arbitrarios).
- La versión mostrada se lee **siempre del manifest** (una sola fuente de verdad de la versión).

### Releases y tags

- Cada versión se publica como **GitHub Release** con tag semántico (`v12.4.0`, `v12.4.1`, `v12.5.0`, …) y contiene como mínimo `FC.release.html` + `release/release-manifest.json`.
- El workflow `.github/workflows/release.yml` construye, verifica y publica automáticamente al empujar un tag `v*`.

### Contrato de release canónico (Gate 24.6-0.6)

| Rol | Valor |
|---|---|
| LANDING | `https://nardian90.github.io/fichascosto/` |
| APLICACIÓN (ejecutable) | `https://nardian90.github.io/fichascosto/release/FC.release.html` |
| PAGES SOURCE | `docs/` (workflow `pages.yml`, build_type workflow) |
| EJECUTABLE CANÓNICO | `docs/release/FC.release.html` |
| ASSETS DEL RELEASE | `release/FC.release.html` + `release/release-manifest.json` (publicados por `release.yml`) |
| ÚNICA FUENTE DE VERSIÓN | `release-manifest.json` (schema 1) |

- **landing ≠ aplicación**: la landing es la página pública de distribución y no ejecuta la app; siempre enlaza a la aplicación canónica («Abrir COSTPRO» usa ruta relativa al mismo deploy de Pages; «Descargar» usa `releases/latest`). No existen redirecciones automáticas entre ambas por decisión de diseño (SEO/PWA/caché).
- **Una sola fuente real**: `FC.html` → `build-release.js` → escribe `release/` (input de CI) y `docs/release/` (servido por Pages), verificando su identidad byte a byte (check interno del build). Ninguna de las dos carpetas se edita a mano.
- **Publicación y versionado**: Pages publica `main`; el artefacto canónico (`FC.release.html` + `release-manifest.json`) **solo cambia en commits etiquetados** (bump + tag en el mismo commit); la landing y la documentación pueden cambiar en commits sin tag sin alterar el release estable. El GitHub Release y el tag se crean exclusivamente por push de tag `v*` (`release.yml`), que verifica el hash del build contra el manifest antes de publicar. Un commit solo-documentación despliega Pages sin nueva versión: la landing sigue mostrando la versión del manifest vigente.

---

## Funcionamiento online / offline

COSTPRO es **offline-first**: Internet sirve para la distribución, la actualización y las funciones que explícitamente la necesitan.

- **Sin Internet**: la aplicación funciona al 100 % (fichas, cálculo, auditoría, vista previa, PDF, datos locales).
- **Con Internet** (solo en `FC.release.html`): el **VersionManager** consulta el manifest oficial como máximo cada `versionCheckIntervalDays = 7` días y clasifica:

| Estado | Condición | Comportamiento |
|---|---|---|
| `CURRENT` | instalada ≥ última | continúa normalmente |
| `UPDATE_AVAILABLE` | instalada < última y ≥ mínima | aviso no bloqueante («Continuar trabajando») |
| `MANDATORY_UPDATE` | instalada < mínima | modal estricto: descargar o reintentar |
| `CHECK_FAILED` | GitHub sin respuesta / offline / timeout | **jamás bloquea**; nunca se interpreta como actualización obligatoria |

- **Protección anti-downgrade**: un manifest más antiguo que la versión instalada se registra (`REMOTE RELEASE OLDER THAN LOCAL`) y no se instala nada.
- **Grace period offline**: 0–7 días normal · 7–30 días aviso discreto · >30 días solicitud de conexión (configurable en `APP_CONFIG.offlineGrace`). Nunca borra datos locales.
- **El manifest es solo DATOS**: se valida con severidad y jamás se ejecuta código proveniente de la red.

---

## Arquitectura básica

```text
FC.html (MASTER, única fuente)
      │  scripts/build-release.js
      ▼
FC.release.html  ──►  release/release-manifest.json (schema 1, hashes reales)
      │                        │
      │                        └──► GitHub Release (assets oficiales)
      ▼
docs/release/ (copia idéntica servida por GitHub Pages)
      │
      ▼
VersionManager (dentro de la app) ──► consulta el manifest ◄── el manifest es DATOS
```

- Un solo source of truth: `FC.html`. `FC.release.html` **siempre** se regenera con el pipeline; no se mantiene a mano.
- El motor contable (`computeFicha()`) va delimitado por las guardas `__ENGINE_START__`/`__ENGINE_END__`; el pipeline verifica su integridad en cada build.
- La versión del producto vive **únicamente** en `FC.html` (inyección de `APP_CONFIG.buildMeta` en el build). No se declara en `package.json` ni se copia a mano en otros archivos.

---

## Cómo generar el release

```bash
npm install            # html-minifier-terser + terser
node scripts/build-release.js        # FC.html → release/ + docs/release/
node scripts/test-version.js         # tests de versionado VERSION-01..14
```

El build **falla** si alguna verificación de integridad no pasa (marcadores del motor, secretos, URLs nuevas, paridad de cargas, etc.): en ese caso no se escribe el release.

---

## Seguridad y advertencias honestas

- **FC.release.html es un build de distribución**, no un DRM: un HTML ejecutado en el navegador **no puede considerarse protección inviolable**. El hardening del release dificulta la manipulación casual y la ingeniería inversa, distribuye una versión oficial verificable por hash y facilita la detección de versiones obsoletas — no afirma protección imposible de romper.
- El repositorio se audita antes de publicar: sin API keys, claves privadas, tokens ni credenciales. El plan comercial se verifica en el servidor contra `public.profiles.plan` (`free` → FREE · `pro`/`enterprise` → PREMIUM) con guard contra auto-elección; **no existe ningún sistema de licencias locales** ni material de firma en el release (retirado en FASE 24.6-1; el histórico permanece en CHANGELOG y reportes de auditoría).
- **Licencia del proyecto**: pendiente de definición por el autor. Este repositorio **no incluye** un archivo `LICENSE` — no se ha elegido aún el régimen de derechos, y no se asume ningún texto legal por defecto.

---

## Regresión y calidad

Cada fase del proyecto se entrega con baterías automatizadas (motor contable, equivalencia DEV↔RELEASE, seguridad, visual 320–1440 px × Dark/Light, landing, versionado) y la declaración explícita `computeFicha(): SIN MODIFICACIONES` cuando el motor no cambia. El detalle histórico de auditorías vive en el entorno privado de desarrollo del autor.
