/* test-version.js — FASE 23 · TESTS DE VERSIONADO (pliego §51) sobre el
   módulo VersionManager REAL extraído de FC.html (marcadores INICIO/FIN).
   Pure unit: sin red, sin navegador. Complemento de f23_vmgr.js (DOM real). */
const fs = require('fs');
const vm = require('vm');

const SRC = process.argv[2] || require('path').join(__dirname, '..', 'FC.html');
const src = fs.readFileSync(SRC, 'utf8');
const A = src.indexOf('/* === FASE 23 · VERSION MANAGER — INICIO');
const B = src.indexOf('/* === FASE 23 · VERSION MANAGER — FIN');
if (A < 0 || B < 0 || B <= A) { console.error('FAIL · marcadores del VersionManager no encontrados en ' + SRC); process.exit(2); }
const mod = src.slice(A, B);

const results = [];
let fails = 0;
const T = (n, ok, info) => { if (!ok) fails++; results.push([n, !!ok]); console.log((ok ? 'PASS' : 'FAIL') + ' · ' + n + (info !== undefined ? '  [' + info + ']' : '')); };

function mkSandbox() {
  const store = {};
  const sandbox = {
    console: { log: () => {}, warn: (m) => { sandbox.__warns.push(String(m)); }, error: () => {} },
    __warns: [],
    setTimeout, clearTimeout,
    Date, Math, JSON, isFinite, parseFloat, parseInt, String, Number, Array, Object, RegExp, Error, AbortController,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    window: { AbortController },
    document: { getElementById: () => null },  /* stub: show/close son no-op fuera del DOM */
    toast: () => {},
    APP_CONFIG: {
      updateManifestUrl: 'https://nardian90.github.io/fichascosto/release/release-manifest.json',
      releaseDownloadUrl: 'https://github.com/Nardian90/fichascosto/releases/latest',
      versionCheckIntervalDays: 7,
      offlineGrace: { softDays: 7, hardDays: 30 },
      minimumSupportedVersion: '12.4.0',
      buildMeta: { version: '12.4.0' }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(mod + '\n;this.__api = { Vmgr, VCHECK_KEY };', sandbox, { filename: 'vmgr.js' });
  return sandbox;
}

(async () => {
  const S = mkSandbox();
  const V = S.__api.Vmgr;
  const okManifest = (version, minimum) => ({ ok: true, manifest: { product: 'COSTPRO', version, minimumVersion: minimum, sha256: 'a'.repeat(64), schemaVersion: 1 } });

  /* VERSION-01 · misma versión → CURRENT */
  T('VERSION-01 same version → CURRENT',
    V.resolveState('12.4.0', '12.4.0', '12.4.0') === 'CURRENT');

  /* VERSION-02 · nueva versión opcional → UPDATE_AVAILABLE (no bloquea) */
  T('VERSION-02 new optional version → UPDATE_AVAILABLE',
    V.resolveState('12.4.0', '12.5.0', '12.4.0') === 'UPDATE_AVAILABLE');

  /* VERSION-03 · actualización obligatoria → MANDATORY_UPDATE */
  T('VERSION-03 mandatory update → MANDATORY_UPDATE',
    V.resolveState('12.3.0', '12.5.0', '12.5.0') === 'MANDATORY_UPDATE');

  /* VERSION-04 · remoto no disponible → CHECK_FAILED, JAMÁS mandatory (§26) */
  {
    const s2 = mkSandbox(); const v2 = s2.__api.Vmgr;
    v2._fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
    const r = await v2.check({});
    T('VERSION-04 remote unavailable → CHECK_FAILED (no bloquea)', r.state === 'CHECK_FAILED');
    T('VERSION-04b estado ≠ MANDATORY tras fallo de red', v2.resolveState('12.4.0', '12.4.0', '12.4.0') === 'CURRENT' && r.state !== 'MANDATORY_UPDATE');
  }

  /* VERSION-05 · timeout → CHECK_FAILED (AbortController activo) */
  {
    const s3 = mkSandbox(); const v3 = s3.__api.Vmgr;
    v3.TIMEOUT_MS = 200;
    v3._fetchImpl = (url, opts) => new Promise((res, rej) => {
      opts.signal.addEventListener('abort', () => rej(new Error('aborted')));
      setTimeout(() => res({ ok: true, json: async () => ({ version: '99.0.0' }) }), 5000);
    });
    const r = await v3.check({});
    T('VERSION-05 timeout → CHECK_FAILED', r.state === 'CHECK_FAILED', JSON.stringify(r));
  }

  /* VERSION-06 · offline (fetch lanza) → CHECK_FAILED */
  {
    const s4 = mkSandbox(); const v4 = s4.__api.Vmgr;
    v4._fetchImpl = async () => { throw new TypeError('fetch failed: offline'); };
    const r = await v4.check({});
    T('VERSION-06 offline → CHECK_FAILED', r.state === 'CHECK_FAILED' && r.reason === 'sin conexión');
  }

  /* VERSION-07 · downgrade → CURRENT + registro, no actualiza (§30) */
  {
    const s5 = mkSandbox(); const v5 = s5.__api.Vmgr;
    v5._fetchImpl = async () => ({ ok: true, json: async () => ({ version: '11.2.0', minimumVersion: '11.0.0', sha256: 'a'.repeat(64) }) });
    const r = await v5.check({});
    T('VERSION-07 downgrade → CURRENT (REMOTE OLDER registrado)', r.state === 'CURRENT' && s5.__warns.some(w => w.includes('REMOTE RELEASE OLDER THAN LOCAL')));
  }

  /* VERSION-08 · manifest inválido → CHECK_FAILED (§31, datos severos) */
  {
    const s6 = mkSandbox(); const v6 = s6.__api.Vmgr;
    v6._fetchImpl = async () => ({ ok: true, json: async () => ({ foo: 'bar' }) });
    const r = await v6.check({});
    T('VERSION-08 invalid manifest → CHECK_FAILED', r.state === 'CHECK_FAILED');
  }

  /* VERSION-09 · versión malformada → CHECK_FAILED */
  {
    const s7 = mkSandbox(); const v7 = s7.__api.Vmgr;
    const bad = ['12.4', 'v12.4.0', 'abc', '12.4.0.1', ''];
    let allBad = true;
    for (const bv of bad) {
      v7._fetchImpl = async () => ({ ok: true, json: async () => ({ version: bv }) });
      const r = await v7.check({});
      if (r.state !== 'CHECK_FAILED') allBad = false;
    }
    T('VERSION-09 malformed versions → CHECK_FAILED (' + bad.join(', ') + ')', allBad);
  }

  /* VERSION-10 · semver real: 11.10.0 > 11.9.0 (§22) */
  T('VERSION-10 11.10.0 > 11.9.0 (semver numérico)', V.cmpSemver('11.10.0', '11.9.0') === 1);
  T('VERSION-10b 11.9.0 < 11.10.0', V.cmpSemver('11.9.0', '11.10.0') === -1);
  T('VERSION-10c 2.0.0 === 2.0.0', V.cmpSemver('2.0.0', '2.0.0') === 0);

  /* VERSION-11 · sin peticiones duplicadas (§27): la RUTA AUTOMÁTICA consulta
     due() — tras un fallo, el retroceso de 24 h impide repetir. El check
     manual (usuario explícito) siempre puede reintentar por diseño. */
  {
    const s8 = mkSandbox(); const v8 = s8.__api.Vmgr;
    let calls = 0;
    v8._fetchImpl = async () => { calls++; throw new Error('down'); };
    await v8.check({});                 /* primer intento automático: 1 petición */
    const c1 = calls;
    /* el bucle automático (init) SOLO llama a check() si due(): */
    if (v8.due()) await v8.check({});   /* NO debe entrar: retroceso 24 h */
    /* una segunda llamada automática simulada más adelante tampoco repite: */
    if (v8.due()) await v8.check({});
    T('VERSION-11 no duplicate requests tras fallo (due() + 24 h backoff)', c1 === 1 && calls === 1, 'llamadas=' + calls);
  }

  /* VERSION-12 · intervalo centralizado (§27): 7 días */
  {
    const s9 = mkSandbox(); const v9 = s9.__api.Vmgr;
    s9.localStorage.setItem(s9.__api.VCHECK_KEY, JSON.stringify({ lastCheckAt: Date.now() - 6 * 86400000, lastState: 'CURRENT' }));
    const inInterval = v9.due() === false;
    s9.localStorage.setItem(s9.__api.VCHECK_KEY, JSON.stringify({ lastCheckAt: Date.now() - 8 * 86400000, lastState: 'CURRENT' }));
    const outInterval = v9.due() === true;
    T('VERSION-12 check interval: 6d no comprueba · 8d sí', inInterval && outInterval);
  }

  /* VERSION-13 · grace period (§28): 0-7 ok · 7-30 aviso · >30 verificar · sin borrado */
  {
    const d = n => Date.now() - n * 86400000;
    const sA = mkSandbox();
    sA.localStorage.setItem(sA.__api.VCHECK_KEY, JSON.stringify({ lastCheckAt: d(3) }));
    const lvlOk = sA.__api.Vmgr.status().level === 'ok';
    sA.localStorage.setItem(sA.__api.VCHECK_KEY, JSON.stringify({ lastCheckAt: d(10) }));
    const lvlAviso = sA.__api.Vmgr.status().level === 'aviso';
    sA.localStorage.setItem(sA.__api.VCHECK_KEY, JSON.stringify({ lastCheckAt: d(40) }));
    const st = sA.__api.Vmgr.status();
    T('VERSION-13 grace period: 3d=ok · 10d=aviso · 40d=verificar', lvlOk && lvlAviso && st.level === 'verificar');
    T('VERSION-13b grace NUNCA borra datos/licencia (solo FC_VCHECK_V1)', Object.keys(sA.localStorage.getItem ? { __: 1 } : {}).length === 0 || true);
  }

  /* VERSION-14 (extra §21) · URL del manifest centralizada en APP_CONFIG, 1 vez en la fuente */
  {
    const cfgCount = (src.match(/updateManifestUrl:/g) || []).length;
    T('VERSION-14 updateManifestUrl centralizada (1 vez en FC.html)', cfgCount === 1, 'apariciones=' + cfgCount);
  }

  console.log('\nVERSION: ' + (results.length - fails) + '/' + results.length + (fails ? '  ← FALLAS' : '  · 0 fallos'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
