/* The script injected into every page load, before the app's own code runs.
   It gives the web app three native abilities:
     1. navigator.share() backed by the iOS share sheet. The share card PNG
        crosses the bridge as base64 and is rebuilt as a real file, so
        iMessage receives the actual image plus the message text. Cancelling
        the sheet rejects with AbortError, exactly like Safari, which the
        web app's share code already handles.
     2. Haptics through the Capacitor-style hook the apps already probe
        (window.Capacitor.Plugins.Haptics), plus navigator.vibrate.
     3. A "standalone" signal so the web app knows it is installed and
        hides its add-to-home-screen hints. */

import Foundation

enum NativeBridge {
    static let script = #"""
    (function () {
      'use strict';
      if (window.__onNativeBridge) { return; }
      window.__onNativeBridge = true;

      function post(name, payload) {
        try { window.webkit.messageHandlers[name].postMessage(payload); } catch (e) {}
      }

      /* 2. Haptics */
      window.Capacitor = window.Capacitor || {
        isNativePlatform: function () { return true; },
        getPlatform: function () { return 'ios'; },
        Plugins: { Haptics: { impact: function () { post('haptic', 1); } } }
      };
      try {
        Object.defineProperty(navigator, 'vibrate', {
          value: function () { post('haptic', 1); return true; },
          configurable: true
        });
      } catch (e) {}

      /* 3. Installed-app signal */
      try {
        Object.defineProperty(navigator, 'standalone', {
          get: function () { return true; },
          configurable: true
        });
      } catch (e) {}
      try {
        var nativeMatchMedia = window.matchMedia;
        window.matchMedia = function (query) {
          if (/display-mode:\s*standalone/.test(String(query))) {
            return {
              matches: true, media: String(query), onchange: null,
              addListener: function () {}, removeListener: function () {},
              addEventListener: function () {}, removeEventListener: function () {},
              dispatchEvent: function () { return false; }
            };
          }
          return nativeMatchMedia.call(window, query);
        };
      } catch (e) {}

      /* 1. navigator.share
         ids carry a per-load random prefix so a share sheet that outlives a
         page reload can never settle a different page's pending share. */
      var seq = 0;
      var runTag = 'p' + Math.random().toString(36).slice(2, 10);
      var pending = {};
      window.__bridgeShareDone = function (id, status) {
        var p = pending[id];
        if (!p) { return; }
        delete pending[id];
        if (status === 'shared') { p.resolve(); }
        else {
          var err = new Error('Share canceled');
          err.name = 'AbortError';
          p.reject(err);
        }
      };
      navigator.canShare = function () { return true; };
      navigator.share = function (data) {
        data = data || {};
        return new Promise(function (resolve, reject) {
          var id = runTag + '-' + (++seq);
          pending[id] = { resolve: resolve, reject: reject };
          var files = data.files || [];
          var out = [];
          var i = 0;
          function send() {
            post('share', {
              id: id,
              title: String(data.title || ''),
              text: String(data.text || ''),
              url: String(data.url || ''),
              files: out
            });
          }
          function next() {
            if (i >= files.length) { send(); return; }
            var f = files[i++];
            var reader = new FileReader();
            reader.onload = function () {
              var s = String(reader.result || '');
              out.push({
                name: f.name || 'file',
                type: f.type || 'application/octet-stream',
                data: s.slice(s.indexOf(',') + 1)
              });
              next();
            };
            reader.onerror = function () { next(); };
            reader.readAsDataURL(f);
          }
          next();
        });
      };
    })();
    """#
}
