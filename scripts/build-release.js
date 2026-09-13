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
const VERSION = '12.6.1';
const PHASE = 'FASE 24.2-P · hardening buildPrint() — guardia ante almacén vacío/id huérfano; FcCloud 24.2 intacto';

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

  const buildDate = process.env.FC_BUILD_DATE || new Date().toISOString();

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
  ok('FASE 24.2: única escritura REST = RPC increment_user_usage (sin inserts/upserts SDK, sin otros POST a /rest/v1)',
     (out.match(/rest\/v1\/rpc\/increment_user_usage/g) || []).length === 1
     && !/\.insert\(|\.upsert\(|\.delete\(\)/.test(out)
     && !/rest\/v1\/(?!rpc\/increment_user_usage)[a-z_]+',\s*\{\s*method:\s*'POST/.test(out));
  ok('FASE 24.2: cuotas reales activas (checkQuota + guard + recordUsage + RPC + freeLimit 3 + caché FC_CLOUD_USAGE_V1)',
     out.includes('checkQuota') && out.includes('fc_create') && out.includes('.guard(') && out.includes('recordUsage')
     && out.includes('increment_user_usage') && /freeLimit:\s*3/.test(out) && out.includes('FC_CLOUD_USAGE_V1'));
  ok('FASE 24.2: sin sistemas comerciales paralelos (no localQuota/fakeQuota/fcPlans/fcUsers/fcLicenses)',
     !/localQuota|fakeQuota|fcPlans|fcUsers|fcLicenses/.test(out));

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

  /* verificación de la copia Pages (bytes idénticos) */
  const docsOk = sha256(fs.readFileSync(path.join(DOCS, 'FC.release.html'), 'utf8')) === releaseHash;
  console.log((docsOk ? 'PASS' : 'FAIL') + ' · docs/release/FC.release.html idéntico al release');
  if (!docsOk) process.exit(1);

  console.log('\nSOURCE  ' + sourceHash);
  console.log('RELEASE ' + releaseHash);
  console.log('ENGINE  ' + engineHash + ' (fuente) · ' + releaseEngineHash + ' (minificado)');
  console.log('tamaño: ' + src.length + ' → ' + out.length + ' chars (' + (100 - Math.round(out.length / src.length * 100)) + '% menor)');
  console.log('RELEASE ESCRITO: ' + OUT);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
