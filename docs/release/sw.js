/* COSTPRO FC — Service Worker (FASE 24.5) · capa de RECURSOS DE APLICACIÓN, NO de datos.
   Generado por scripts/build-release.js (VERSION 12.10.0) — no editar a mano.
   · Allowlist explícita: shell + manifest + iconos. Todo lo demás = passthrough.
   · Supabase y todo origen cruzado: NUNCA entran en Cache Storage (ni 2xx ni errores).
   · Sin skipWaiting/clients.claim: la actualización la gobierna VersionManager.
   · Cache: costpro-release-12.10.0 · al activarse borra SOLO caches costpro-release-*. */
'use strict';
var VERSION = "12.10.0";
var CACHE = 'costpro-release-' + VERSION;
var SCOPE_PATH = new URL(self.registration.scope).pathname;
var ALLOWLIST = [
  'FC.release.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png'
];
function allowlisted(url){
  if(url.origin !== self.location.origin) return false;
  if(url.pathname.indexOf(SCOPE_PATH) !== 0) return false;
  return ALLOWLIST.indexOf(url.pathname.slice(SCOPE_PATH.length)) !== -1;
}
function neverCache(url){
  /* passthrough absoluto: Supabase (auth/rest/rpc/telemetría) y TODO origen cruzado */
  return url.origin !== self.location.origin || /(^|\.)supabase\.(co|in|net)$/.test(url.hostname);
}
self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ALLOWLIST.map(function(rel){
      return c.add(new Request(SCOPE_PATH + rel, { cache: "reload" }));
    }));
  })); /* sin skipWaiting: el SW nuevo espera a que no queden pestañas viejas */
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf("costpro-release-") === 0 && k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  })); /* sin clients.claim */
});
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                 /* passthrough absoluto (§10) */
  var url = new URL(req.url);
  if(neverCache(url)) return;                      /* Supabase + cruzados: sin Cache Storage */
  if(!allowlisted(url)) return;                    /* resto same-origin: passthrough puro */
  if(url.pathname.slice(SCOPE_PATH.length) === "FC.release.html"){
    /* shell network-first: en línea siempre fresco (deploy visible al recargar);
       sin red sirve la copia cacheada (shell offline). Respuesta no-OK o no-basic
       JAMÁS se cachea (§11). */
    e.respondWith(fetch(req).then(function(res){
      if(res && res.ok && res.type === "basic"){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(m){ return m || Response.error(); });
    }));
  } else {
    /* estáticos de versión: cache-first (inmutables por cache versionada) */
    e.respondWith(caches.match(req).then(function(m){
      if(m) return m;
      return fetch(req).then(function(res){
        if(res && res.ok && res.type === "basic"){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    }));
  }
});
