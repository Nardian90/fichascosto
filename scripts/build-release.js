/* build-release.js — COSTPRO · PIPELINE DE BUILD DE DISTRIBUCIÓN (repositorio oficial)
   https://github.com/Nardian90/fichascosto

   Cadena obligatoria:  FC.html (MASTER, única fuente)  →  ESTE SCRIPT  →  FC.release.html
   · JAMÁS mantener FC.html y FC.release.html a mano: el release SIEMPRE se deriva.
   · Minificación prudente (CORRECTNESS > ACCOUNTING INTEGRITY > SECURITY >
     MAINTAINABILITY > MINIFICATION): html-minifier-terser + terser con mangle
     SOLO de nombres internos (toplevel:false) — sin ofuscación extrema.
   · Preserva las guardas /*__ENGINE_START__*​/ … /*__ENGINE_END__*​/ del motor contable.
   · Inyecta buildMeta en APP_CONFIG SOLO en el release (fuente única de versión).
   · Genera release-manifest.json (schema 1) con hashes SHA-256 REALES calculados
     del contenido — jamás inventados ni copiados a mano.
   · Escribe además docs/release/ (copia idéntica servida por GitHub Pages:
     la app «Abrir COSTPRO» y el manifest que consulta el VersionManager).
   · Verificaciones post-build: si alguna falla, NO se escribe el release.

   Uso:  node scripts/build-release.js
   Deps: npm install (html-minifier-terser + terser); si el repo no tiene
         node_modules se usa el toolchain local de desarrollo si existe. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'FC.html');
const OUT = path.join(ROOT, 'release', 'FC.release.html');
const DOCS = path.join(ROOT, 'docs', 'release');
const VERSION = '12.9.0';
const PHASE = 'FASE 24.5 · G3-D1 + PWA — fix de revalidación online (sesión muerta con estado online tras revocar refresh), PWA progresiva: manifest.webmanifest + sw.js (allowlist, Supabase NETWORK ONLY) + install UX con kill switch APP_CONFIG.pwa.enabled; 0 DDL; motor intocado';

function loadToolchain() {
  const tries = [
    path.join(ROOT, 'node_modules', 'html-minifier-terser'),
    path.join(__dirname, 'node_modules', 'html-minifier-terser'),
    '/home/z/my-project/fc_build/buildtools/node_modules/html-minifier-terser' /* toolchain local de desarrollo (sandbox) */
  ];
  for (const t of tries) {
    try { return { minify: require(t).minify, terser: require(path.join(path.dirname(t), 'terser')).minify, from: t }; } catch (e) { /* siguiente */ }
  }
  throw new Error('html-minifier-terser/terser no disponibles. Ejecuta: npm install');
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

(async () => {
  const tc = loadToolchain();
  const src = fs.readFileSync(SRC, 'utf8');
  const sourceHash = sha256(src), sourceMd5 = md5(src);

  /* engine slice (criterio de las guardas certificadas f9/f16/f17/f24) */
  const MK = '/*__ENGINE_START__*/';
  const a = src.indexOf(MK), b = src.indexOf('/*__ENGINE_END__*/');
  if (a < 0 || b < 0 || b <= a) throw new Error('Marcadores ENGINE no encontrados en la fuente');
  const engineHash = md5(src.slice(a + MK.length, b));

  /* FASE 24.3 · normalización: GitHub emite head_commit.timestamp sin ms (Z) —
     new Date(...).toISOString() produce SIEMPRE el formato ISO con ms (.000Z),
     así el build de CI y el local son byte-idénticos ante la misma fecha. */
  const buildDate = process.env.FC_BUILD_DATE ? new Date(process.env.FC_BUILD_DATE).toISOString() : new Date().toISOString();

  /* identificación de build SOLO en el release (APP_CONFIG sigue siendo la única fuente) */
  const inject = `var APP_CONFIG = { buildMeta:{ product:'COSTPRO', version:'${VERSION}', phase:'${PHASE}', buildDate:'${buildDate}', sourceSha256:'${sourceHash.slice(0, 12)}', pipeline:'build-release v1 (html-minifier-terser + terser, mangle interno)' },`;
  if ((src.match(/var APP_CONFIG = \{/g) || []).length !== 1) throw new Error('Se esperaba exactamente una declaración de APP_CONFIG');
  const staged = src.replace('var APP_CONFIG = {', inject);

  const out = await tc.minify(staged, {
    collapseWhitespace: true,
    caseSensitive: true,
    keepClosingSlash: true,
    removeComments: true,
    removeAttributeQuotes: false,
    removeEmptyAttributes: false,
    minifyURLs: false,
    minifyCSS: true,
    minifyJS: async (text) => {
      const r = await tc.terser(text, {
        compress: { passes: 2, drop_debugger: true, drop_console: false },
        mangle: { toplevel: false },
        format: { comments: /__ENGINE_(START|END)__/ }
      });
      if (r.error) throw r.error;
      return r.code;
    },
    continueOnParseError: false
  });

  /* ---- verificaciones de integridad post-build ---- */
  const chk = [];
  const ok = (n, c, info) => chk.push({ n, ok: !!c, info: String(info === undefined ? '' : info) });
  ok('Marcadores ENGINE presentes exactamente 1 vez cada uno',
     (out.match(/\/\*__ENGINE_START__\*\//g) || []).length === 1 && (out.match(/\/\*__ENGINE_END__\*\//g) || []).length === 1);
  const ra = out.indexOf('/*__ENGINE_START__*/'), rb = out.indexOf('/*__ENGINE_END__*/');
  const releaseEngineHash = md5(out.slice(ra + '/*__ENGINE_START__*/'.length, rb));
  ok('engine slice extraíble del release y no vacío', rb > ra && (rb - ra) > 10000, releaseEngineHash.slice(0, 12) + '… (minificado por diseño)');
  ok('buildMeta inyectada exactamente 1 vez', (out.match(/buildMeta:\{/g) || []).length === 1);
  ok('número de transferencia exactamente 1 vez', (out.match(/9204 0699 9723 1162/g) || []).length === 1);
  ok('teléfono de confirmación exactamente 1 vez', (out.match(/\+53 53-18-32-15/g) || []).length === 1);
  ok('sin <script adicionales', (out.match(/<script/g) || []).length === (src.match(/<script/g) || []).length);
  ok('sin <style adicionales', (out.match(/<style/g) || []).length === (src.match(/<style/g) || []).length);
  ok('sin comentarios HTML residuales', !(out.match(/<!--/g) || []).length);
  ok('sin eval( ni new Function( (paridad con la fuente)',
     (out.match(/eval\(/g) || []).length === (src.match(/eval\(/g) || []).length &&
     (out.match(/new Function\(/g) || []).length === (src.match(/new Function\(/g) || []).length);
  const urls = s => [...new Set((s.match(/https?:\/\/[^"'\s<>()]+/g) || [])).values()].sort();
  const srcUrls = new Set(urls(src));
  const outUrls = urls(out);
  ok('sin URLs externas nuevas (paridad de cargas)', outUrls.filter(u => !srcUrls.has(u)).length === 0, outUrls.length + ' URLs');
  ok('versión identificada en el release', out.includes("version:'" + VERSION + "'") || out.includes('version:"' + VERSION + '"'));
  ok('lang="es" y <title> preservados', /<html lang="es"/i.test(out) && /<title>[^<]+<\/title>/i.test(out));
  ok('updateManifestUrl centralizada exactamente 1 vez', (out.match(/updateManifestUrl:/g) || []).length === 1);
  ok('VersionManager presente (estados + semver + downgrade)',
     out.includes('resolveState') && out.includes('MANDATORY_UPDATE') && out.includes('REMOTE RELEASE OLDER THAN LOCAL'));
  ok('Landing accesible desde el Login (auLanding)', (out.match(/auLanding/g) || []).length >= 2);
  ok('SIN SECRETOS (patrones github_pat_/ghp_/gho_/sk-ant-/clave privada)',
     !/github_pat_|ghp_[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-ant-|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(out));
  /* ---- FASE 24.2: capa FcCloud (identidad + cuotas reales) ---- */
  ok('FASE 24.2: FcCloud presente (auth + sesión + perfil + plan + cuotas reales)',
     /(var|,)\s*FcCloud\s*=\s*(\(function|function)/.test(out));
  ok('FASE 24.2: publishable key pública exactamente 1 vez (formato sb_publishable_)',
     (out.match(/sb_publishable_[A-Za-z0-9_-]{20,}/g) || []).length === 1);
  ok('FASE 24.2: sin claves de servicio ni secretas (service_role/sb_secret_)',
     !/service_role|sb_secret_|sb_secret-/.test(out));
  ok('FASE 24.2: cuotas reales activas (checkQuota + guard + recordUsage + RPC + freeLimit 3 + caché FC_CLOUD_USAGE_V1)',
     out.includes('checkQuota') && out.includes('fc_create') && out.includes('.guard(') && out.includes('recordUsage')
     && out.includes('increment_user_usage') && /freeLimit:\s*3/.test(out) && out.includes('FC_CLOUD_USAGE_V1'));
  /* ---- FASE 24.4/24.5 · PERMIT DE ENDPOINTS (sustituye al check «única escritura = RPC» de 24.2,
     que quedó obsoleto cuando FcSheets pasó a escribir cost_sheets — H-2 del audit 24.5).
     Congela el CONJUNTO REAL de literales de endpoint del producto: escritura =
     cost_sheets (GET/POST/PATCH/DELETE de FcSheets) + rpc/increment_user_usage (POST telemetría);
     lectura = profiles, tenants, user_usage; auth = token (password/refresh), signup, logout.
     Cualquier endpoint REST/Auth nuevo o eliminado sin actualizar este inventario → build FAIL. */
  const restLits = [...new Set(out.match(/\/rest\/v1\/(rpc\/)?[a-z_]+/g) || [])].sort();
  const restAllowed = ['/rest/v1/cost_sheets', '/rest/v1/profiles', '/rest/v1/rpc/increment_user_usage', '/rest/v1/tenants', '/rest/v1/user_usage'].sort();
  const authLits = [...new Set(out.match(/\/auth\/v1\/[a-z_]+/g) || [])].sort();
  const authAllowed = ['/auth/v1/logout', '/auth/v1/signup', '/auth/v1/token'].sort();
  ok('FASE 24.4/24.5: permit REST — escritura {cost_sheets, rpc/increment_user_usage} + lectura {profiles, tenants, user_usage} (0 endpoints nuevos)',
     JSON.stringify(restLits) === JSON.stringify(restAllowed), restLits.join(' '));
  ok('FASE 24.1/24.5: permit Auth = {token, signup, logout} (0 endpoints nuevos)',
     JSON.stringify(authLits) === JSON.stringify(authAllowed), authLits.join(' '));
  ok('FASE 24.2: sin SDK supabase (sin .insert/.upsert/.delete()',
     !/\.insert\(|\.upsert\(|\.delete\(\)/.test(out));
  ok('FASE 24.2: sin sistemas comerciales paralelos (no localQuota/fakeQuota/fcPlans/fcUsers/fcLicenses)',
     !/localQuota|fakeQuota|fcPlans|fcUsers|fcLicenses/.test(out));
  /* ---- FASE 24.3: modelo de producto Guest→Free→Pro ---- */
  ok('FASE 24.3: política Free abierta (freeEnforce desactivado + razón política en runtime)',
     /freeEnforce:\s*(!1|false)/.test(out) && /política 24\.3/.test(out));
  ok('FASE 24.3: guest 3 experiencias reales (FC_GUEST_EXP_V1 + límite 3 + transición suave)',
     out.includes('FC_GUEST_EXP_V1') && out.includes('guestTransition') && out.includes('guestExpAtLimit')
     && /GUEST_EXP_LIMIT\s*=\s*3/.test(out));
  ok('FASE 24.3: showQuotaBlocked conservado (dormant: solo se dispara con freeEnforce=true)',
     out.includes('showQuotaBlocked') && /freeEnforce:\s*(!1|false)/.test(out));
  /* ---- FASE 24.5: PWA progresiva en el shell (capa de recursos, NO de datos) ---- */
  ok('FASE 24.5: kill switch pwa:{enabled:true} presente exactamente 1 vez',
     (out.match(/pwa:\{enabled:(!0|true)\}/g) || []).length === 1);
  ok('FASE 24.5: Pwa.init() en boot + módulo Pwa con cleanup (unregister + delete costpro-release-*)',
     out.includes('Pwa.init()') && out.includes('costpro-release-') && out.includes('unregister'));
  ok('FASE 24.5: el shell NO usa skipWaiting/clients.claim (VersionManager es la única autoridad de actualización, §13)',
     !/skipWaiting|clients\.claim/.test(out));
  ok('FASE 24.5: metadata PWA en head (theme-color + manifest + apple-touch-icon)',
     /<meta name="theme-color" content="[^"]+"/.test(out) && /<link rel="manifest" href="manifest.webmanifest"/.test(out) && /<link rel="apple-touch-icon" href="icons\/icon-192.png"/.test(out));

  const failed = chk.filter(c => !c.ok);
  chk.forEach(c => console.log((c.ok ? 'PASS' : 'FAIL') + ' · ' + c.n + (c.info ? '  [' + c.info + ']' : '')));
  if (failed.length) { console.error('\nINTEGRIDAD DE BUILD FALLIDA — no se escribe el release'); process.exit(1); }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(OUT, out, 'utf8');
  const releaseHash = sha256(out), releaseMd5 = md5(out);

  /* copia idéntica para GitHub Pages (docs/release/) */
  fs.writeFileSync(path.join(DOCS, 'FC.release.html'), out, 'utf8');

  /* ---- release-manifest.json (schema 1 · valores REALES calculados) ---- */
  const manifest = {
    schemaVersion: 1,
    product: 'COSTPRO',
    productName: 'COSTPRO — FC (Ficha de Costos y Gastos) · Resolución 148/2023 MFP',
    version: VERSION,
    channel: 'stable',
    releaseDate: buildDate.slice(0, 10),
    minimumVersion: VERSION,
    latestVersion: VERSION,
    releaseFile: 'FC.release.html',
    sha256: releaseHash,
    sourceHash,
    engineHash,
    buildPhase: PHASE,
    buildDate,
    generator: 'scripts/build-release.js · html-minifier-terser + terser (mangle interno, sin ofuscación extrema)',
    releaseMd5, sourceMd5, releaseEngineHash,
    engineNote: 'engineHash = md5 del slice __ENGINE_START__/__ENGINE_END__ de la FUENTE. En el release el motor está minificado (mangle interno): su md5 difiere por diseño; la identidad funcional DEV≈RELEASE se demuestra por batería de equivalencia.',
    noSecrets: 'El release contiene únicamente la clave pública de verificación de licencias y la publishable key de Supabase (credencial PÚBLICA de cliente por diseño); sin claves de servicio, sin secretos, sin tokens privados.',
    distribution: 'El archivo para clientes es exclusivamente FC.release.html; FC.html queda para desarrollo y auditoría.'
  };
  fs.writeFileSync(path.join(ROOT, 'release', 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(DOCS, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  /* ---- FASE 24.5 · ARTEFACTOS PWA (compañeros del release, deterministas) ----
     · manifest.webmanifest: identidad de instalación (id/start_url relativos al
       scope ./ — el PWA vive en /fichascosto/release/).
     · sw.js: SOLO recursos de aplicación (allowlist explícita); supabase y
       todo origen cruzado = passthrough absoluto sin Cache Storage; shell
       network-first (archivo autónomo: imposible doc viejo + assets nuevos);
       sin skipWaiting/clients.claim (VersionManager gobierna la actualización);
       cache costpro-release-<VERSION> — la activación borra SOLO caches PWA.
     · Iconos: PNG versionados en el repo (docs/release/icons/), JAMÁS
       regenerados por el build — aquí solo se verifica presencia + dimensiones. */
  const pwaManifest = {
    name: 'COSTPRO — Fichas de Costo',
    short_name: 'COSTPRO',
    description: 'Fichas de Costos y Gastos conforme a la Resolución 148/2023 MFP (Anexos I y II). Local-first, con sincronización opcional de nube.',
    lang: 'es',
    dir: 'ltr',
    display: 'standalone',
    start_url: './FC.release.html',
    scope: './',
    id: './FC.release.html',
    theme_color: '#0d5bb8',
    background_color: '#093f66',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  const pwaManifestText = JSON.stringify(pwaManifest, null, 2) + '\n';

  const swSrc = [
    '/* COSTPRO FC — Service Worker (FASE 24.5) · capa de RECURSOS DE APLICACIÓN, NO de datos.',
    '   Generado por scripts/build-release.js (VERSION ' + VERSION + ') — no editar a mano.',
    '   · Allowlist explícita: shell + manifest + iconos. Todo lo demás = passthrough.',
    '   · Supabase y todo origen cruzado: NUNCA entran en Cache Storage (ni 2xx ni errores).',
    '   · Sin skipWaiting/clients.claim: la actualización la gobierna VersionManager.',
    '   · Cache: costpro-release-' + VERSION + ' · al activarse borra SOLO caches costpro-release-*. */',
    "'use strict';",
    'var VERSION = ' + JSON.stringify(VERSION) + ';',
    "var CACHE = 'costpro-release-' + VERSION;",
    'var SCOPE_PATH = new URL(self.registration.scope).pathname;',
    'var ALLOWLIST = [',
    "  'FC.release.html',",
    "  'manifest.webmanifest',",
    "  'icons/icon-192.png',",
    "  'icons/icon-512.png',",
    "  'icons/icon-maskable-192.png',",
    "  'icons/icon-maskable-512.png'",
    '];',
    'function allowlisted(url){',
    '  if(url.origin !== self.location.origin) return false;',
    '  if(url.pathname.indexOf(SCOPE_PATH) !== 0) return false;',
    '  return ALLOWLIST.indexOf(url.pathname.slice(SCOPE_PATH.length)) !== -1;',
    '}',
    'function neverCache(url){',
    '  /* passthrough absoluto: Supabase (auth/rest/rpc/telemetría) y TODO origen cruzado */',
    '  return url.origin !== self.location.origin || /(^|\\.)supabase\\.(co|in|net)$/.test(url.hostname);',
    '}',
    'self.addEventListener("install", function(e){',
    '  e.waitUntil(caches.open(CACHE).then(function(c){',
    '    return Promise.all(ALLOWLIST.map(function(rel){',
    '      return c.add(new Request(SCOPE_PATH + rel, { cache: "reload" }));',
    '    }));',
    '  })); /* sin skipWaiting: el SW nuevo espera a que no queden pestañas viejas */',
    '});',
    'self.addEventListener("activate", function(e){',
    '  e.waitUntil(caches.keys().then(function(ks){',
    '    return Promise.all(ks.filter(function(k){ return k.indexOf("costpro-release-") === 0 && k !== CACHE; })',
    '      .map(function(k){ return caches.delete(k); }));',
    '  })); /* sin clients.claim */',
    '});',
    'self.addEventListener("fetch", function(e){',
    '  var req = e.request;',
    '  if(req.method !== "GET") return;                 /* passthrough absoluto (§10) */',
    '  var url = new URL(req.url);',
    '  if(neverCache(url)) return;                      /* Supabase + cruzados: sin Cache Storage */',
    '  if(!allowlisted(url)) return;                    /* resto same-origin: passthrough puro */',
    '  if(url.pathname.slice(SCOPE_PATH.length) === "FC.release.html"){',
    '    /* shell network-first: en línea siempre fresco (deploy visible al recargar);',
    '       sin red sirve la copia cacheada (shell offline). Respuesta no-OK o no-basic',
    '       JAMÁS se cachea (§11). */',
    '    e.respondWith(fetch(req).then(function(res){',
    '      if(res && res.ok && res.type === "basic"){',
    '        var copy = res.clone();',
    '        caches.open(CACHE).then(function(c){ c.put(req, copy); });',
    '      }',
    '      return res;',
    '    }).catch(function(){',
    '      return caches.match(req).then(function(m){ return m || Response.error(); });',
    '    }));',
    '  } else {',
    '    /* estáticos de versión: cache-first (inmutables por cache versionada) */',
    '    e.respondWith(caches.match(req).then(function(m){',
    '      if(m) return m;',
    '      return fetch(req).then(function(res){',
    '        if(res && res.ok && res.type === "basic"){',
    '          var copy = res.clone();',
    '          caches.open(CACHE).then(function(c){ c.put(req, copy); });',
    '        }',
    '        return res;',
    '      });',
    '    }));',
    '  }',
    '});',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(ROOT, 'release', 'manifest.webmanifest'), pwaManifestText, 'utf8');
  fs.writeFileSync(path.join(DOCS, 'manifest.webmanifest'), pwaManifestText, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'release', 'sw.js'), swSrc, 'utf8');
  fs.writeFileSync(path.join(DOCS, 'sw.js'), swSrc, 'utf8');

  /* verificación de iconos versionados (presencia + dimensiones IHDR, sin regenerar) */
  function pngSize(p){
    const b = fs.readFileSync(p);
    if(!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)) return null; /* PNG magic */
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  const ICONS_OK = ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png']
    .every(f => { const s = pngSize(path.join(DOCS, 'icons', f)); return s && (s.w === 192 || s.w === 512) && s.w === s.h; });
  const swChecks = {
    sinSkip: !/\.skipWaiting\s*\(|clients\.claim\s*\(/.test(swSrc), /* sin LLAMADAS (el comentario "Sin skipWaiting" no es llamada) */
    cacheOk: swSrc.indexOf("'costpro-release-' + VERSION") >= 0 && swSrc.indexOf(JSON.stringify(VERSION)) >= 0,
    supabaseSoloGuard: (swSrc.match(/supabase/g) || []).length === 1,
    allowlist6: (swSrc.match(/'icons\/|'FC\.release\.html'|'manifest\.webmanifest'/g) || []).length === 6
  };
  const pwaOk = ICONS_OK && swChecks.sinSkip && swChecks.cacheOk && swChecks.supabaseSoloGuard && swChecks.allowlist6;
  console.log((pwaOk ? 'PASS' : 'FAIL') + ' · FASE 24.5: PWA — manifest.webmanifest + sw.js (allowlist 6, sin skipWaiting, supabase passthrough) + 4 iconos 192/512');
  if (!pwaOk) { console.error('PWA_CHECK ' + JSON.stringify(swChecks) + ' ICONS=' + ICONS_OK); process.exit(1); }

  /* verificación de la copia Pages (bytes idénticos) */
  const docsOk = sha256(fs.readFileSync(path.join(DOCS, 'FC.release.html'), 'utf8')) === releaseHash
    && fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8') === swSrc
    && fs.readFileSync(path.join(DOCS, 'manifest.webmanifest'), 'utf8') === pwaManifestText;
  console.log((docsOk ? 'PASS' : 'FAIL') + ' · docs/release/ idéntico al release (FC.release.html + sw.js + manifest.webmanifest)');
  if (!docsOk) process.exit(1);

  console.log('\nSOURCE  ' + sourceHash);
  console.log('RELEASE ' + releaseHash);
  console.log('ENGINE  ' + engineHash + ' (fuente) · ' + releaseEngineHash + ' (minificado)');
  console.log('tamaño: ' + src.length + ' → ' + out.length + ' chars (' + (100 - Math.round(out.length / src.length * 100)) + '% menor)');
  console.log('RELEASE ESCRITO: ' + OUT);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
