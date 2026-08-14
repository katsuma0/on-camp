/* on-camp map module.
   A self contained Leaflet map for the parks tab: Ontario provincial parks as
   pins over the 20 Fisheries Management Zone boundaries, styled to match the
   sibling on-fishing app. The host page loads the vendored Leaflet (1.9) before
   this file, then calls window.initCampMap() when the tab appears.
   This file only defines window.initCampMap; it does nothing else at load. */
(function () {

  /* the host owns the dictionary; untranslated text simply stays English */
  function T(s) { return (window.TL ? window.TL(s) : s); }

  /* Official Ontario zone boundaries, same service the fishing app draws from. */
  var SERVICE = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open07/MapServer/14";
  var ZONE_FIELD = "FISHERIES_MANAGEMENT_ZONE_ID";

  /* Boundaries load once as GeoJSON, generalized by the server so there are far
     fewer points to paint. Same query the fishing app uses. */
  var BOUNDS_URL = SERVICE + '/query?where=1%3D1' +
    '&outFields=' + ZONE_FIELD +
    '&returnGeometry=true&maxAllowableOffset=0.005&geometryPrecision=5&outSR=4326&f=geojson';

  /* Light natural hues cycled so neighbouring zones contrast where they touch. */
  var TINT = ['#CDE1D0', '#E2D6C0', '#EBDCA8', '#DFE3C6', '#E9CFC0', '#E5C9A5'];

  /* CARTO Voyager, the same basemap the fishing app uses. No labels on the
     base, a labels only layer painted above the zones but under the pins and
     only from mid zoom in, so the map stays calm far out. */
  var CARTO = 'https://{s}.basemaps.cartocdn.com/rastertiles/';

  /* module level state, so a second call reuses the one map */
  var map = null;
  var inited = false;
  var baseLayer = null;      // the basemap tiles, swapped when the scheme flips
  var labelLayer = null;     // place names, swapped with the basemap
  var isDark = null;         // the scheme the current tiles were built for
  var pinLayer = null;       // park pins, only while their chip is on
  var zoneLayer = null;      // zone polygons, only while their chip is on
  var zoneData = null;       // the fetched GeoJSON, kept so a re-toggle is free
  var zoneLoading = false;

  /* What the map draws is the reader's choice and starts empty: an opening
     map with no layers is instant, and the zone boundaries (a large fetch
     and thousands of points to paint) never load until they are asked for. */
  var SHOW_KEY = 'oncamp-map-show';
  var show = { parks: false, zones: false };
  try {
    var saved = JSON.parse(localStorage.getItem(SHOW_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      show.parks = !!saved.parks;
      show.zones = !!saved.zones;
    }
  } catch (e) {}
  function saveShow() {
    try { localStorage.setItem(SHOW_KEY, JSON.stringify(show)); } catch (e) {}
  }

  /* The scheme in effect right now. The stamped attribute is the app's own
     choice and wins; with no choice stamped the system decides. This is read
     again every time the map is shown, so a theme change never leaves a dark
     map sitting on a light page. */
  function prefersDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* thin outlined, lightly tinted zone polygons */
  function zoneStyle(feature) {
    var z = feature && feature.properties ? feature.properties[ZONE_FIELD] : 0;
    var n = (typeof z === 'number' && isFinite(z)) ? z : 0;
    var fill = TINT[((n % TINT.length) + TINT.length) % TINT.length];
    return { color: '#FFFFFF', weight: 1, opacity: 0.9, fillColor: fill, fillOpacity: 0.5 };
  }

  /* teardrop park pin, green (var --tint), with a small tent glyph inside.
     Built as an inline SVG so it renders on its own, and carries the app's
     .pin-wrap / .pin / .pin-i class hooks so shared CSS can style it. */
  var parkIcon = null;
  function pinIcon() {
    if (parkIcon) return parkIcon;
    var svg =
      '<div class="pin-wrap">' +
        '<svg class="pin" width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">' +
          '<path d="M14 1C7 1 1.5 6.5 1.5 13.5 1.5 23 14 35 14 35S26.5 23 26.5 13.5C26.5 6.5 21 1 14 1z" ' +
            'fill="var(--tint)" stroke="#FFFFFF" stroke-width="2"/>' +
          '<g class="pin-i">' +
            '<path d="M14 7 21.5 18.5H6.5z" fill="#FFFFFF"/>' +
            '<path d="M14 12.4 17.4 18.5H10.6z" fill="var(--tint)"/>' +
          '</g>' +
        '</svg>' +
      '</div>';
    parkIcon = L.divIcon({
      className: 'camppin',
      html: svg,
      iconSize: [28, 36],
      iconAnchor: [14, 34],
      popupAnchor: [0, -30]
    });
    return parkIcon;
  }

  /* the pin popup fallback, used only when the app has no openParkFromMap yet */
  function openParkPopup(p) {
    var el = document.createElement('div');
    var nm = document.createElement('div');
    nm.textContent = p.name;
    nm.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:5px;color:var(--label)';
    var a = document.createElement('button');
    a.type = 'button';
    a.textContent = 'Open park';
    a.style.cssText = 'appearance:none;border:0;background:none;cursor:pointer;font-family:var(--font-sys);' +
      'color:var(--tint);font-weight:700;font-size:13px;text-decoration:underline;text-underline-offset:2px;padding:0';
    a.onclick = function () {
      if (typeof window.openParkFromMap === 'function') {
        try { window.openParkFromMap(p.id); } catch (e) {}
      } else {
        try { location.hash = '#park=' + p.id; } catch (e) {}
      }
    };
    el.appendChild(nm);
    el.appendChild(a);
    L.popup({ closeButton: false, offset: [0, -28] })
      .setLatLng([p.lat, p.lng])
      .setContent(el)
      .openOn(map);
  }

  function addPins() {
    if (pinLayer || !map) return;
    var pins = window.PARK_PINS;
    if (!pins || !pins.length) return;
    var icon = pinIcon();
    pinLayer = L.layerGroup();
    pins.forEach(function (p) {
      if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      var m = L.marker([p.lat, p.lng], { icon: icon, title: p.name });
      m.on('click', function () {
        /* checked at click time, not at load, so a later host wiring wins */
        if (typeof window.openParkFromMap === 'function') {
          try { window.openParkFromMap(p.id); } catch (e) {}
          return;
        }
        openParkPopup(p);
      });
      pinLayer.addLayer(m);
    });
    pinLayer.addTo(map);
  }
  function removePins() {
    if (!pinLayer) return;
    try { map.removeLayer(pinLayer); } catch (e) {}
    pinLayer = null;
  }

  function NOTE_EMPTY() { return T('Choose what to show.'); }
  function NOTE_PARKS() { return T('Tap a pin to open a park.'); }
  function NOTE_OFFLINE() { return T('Map tiles are offline. The park pins still work, tap one to open it.'); }
  var noteOffline = false;
  function setNote(text) {
    var n = document.getElementById('campMapNote');
    if (!n) return;
    n.innerHTML = '';
    n.appendChild(document.createTextNode(text));
    n.hidden = !text;
  }
  /* the eight blade iOS spinner, in the note, while something is fetching */
  function setNoteLoading(text) {
    var n = document.getElementById('campMapNote');
    if (!n) return;
    n.hidden = false;
    var s = '<span class="ios-spinner" aria-hidden="true">';
    for (var i = 0; i < 8; i++) {
      s += '<span style="transform:rotate(' + (i * 45) + 'deg);animation-delay:' + (-0.8 + i * 0.1).toFixed(1) + 's"></span>';
    }
    n.innerHTML = s + '</span><span>' + text + '</span>';
  }
  function restNote() {
    if (noteOffline) { setNote(NOTE_OFFLINE()); return; }
    setNote(show.parks ? NOTE_PARKS() : (show.zones ? '' : NOTE_EMPTY()));
  }

  /* The boundaries are a big fetch and a lot of points to paint, so they
     load the first time they are asked for and are kept afterwards: a second
     toggle just re-adds the layer. */
  function addZones() {
    if (!map || zoneLayer) return;
    function draw(gj) {
      var renderer = null;
      try { renderer = L.canvas({ padding: 0.4, pane: 'campZones' }); } catch (e) {}
      var opts = { pane: 'campZones', smoothFactor: 1.4, style: zoneStyle };
      if (renderer) opts.renderer = renderer;
      try { zoneLayer = L.geoJSON(gj, opts).addTo(map); } catch (e) {}
      restNote();
    }
    if (zoneData) { draw(zoneData); return; }
    if (zoneLoading) return;
    zoneLoading = true;
    setNoteLoading(T('Loading zones'));
    try {
      fetch(BOUNDS_URL).then(function (r) {
        return r.json();
      }).then(function (gj) {
        zoneLoading = false;
        if (!map || !gj || !gj.features) { restNote(); return; }
        zoneData = gj;
        if (show.zones) draw(gj); else restNote();
      }).catch(function () {
        /* offline: the rest of the map still works */
        zoneLoading = false;
        setNote(T('Zone boundaries need a connection.'));
      });
    } catch (e) { zoneLoading = false; restNote(); }
  }
  function removeZones() {
    if (!zoneLayer) return;
    try { map.removeLayer(zoneLayer); } catch (e) {}
    zoneLayer = null;
  }

  /* one solid card of toggles over the map. solid, not frosted: blurring
     live tiles behind a bar is what costs frames while panning. */
  function renderChips() {
    var card = document.getElementById('campMapChips');
    if (!card) return;
    card.innerHTML =
      chipHtml('parks', '\u{1F3D5} ' + T('Parks'), show.parks) +
      chipHtml('zones', '\u{1F3A3} ' + T('Fishing zones'), show.zones);
  }
  function chipHtml(key, label, on) {
    return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-show="' + key + '"' +
      ' aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
  }
  function applyShow() {
    if (show.parks) addPins(); else removePins();
    if (show.zones) addZones(); else removeZones();
    restNote();
  }
  function wireChips() {
    var card = document.getElementById('campMapChips');
    if (!card || card._wired) return;
    card._wired = true;
    card.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-show]') : null;
      if (!b) return;
      var k = b.getAttribute('data-show');
      show[k] = !show[k];
      saveShow();
      renderChips();
      applyShow();
      if (window.buzz) { try { window.buzz(6); } catch (e) {} }
    });
    try {
      L.DomEvent.disableClickPropagation(card);
      L.DomEvent.disableScrollPropagation(card);
    } catch (e) {}
  }

  /* find my location, quietly */
  function locateMe() {
    if (!map) return;
    try {
      map.locate({ setView: true, maxZoom: 11, enableHighAccuracy: true });
    } catch (e) {}
  }

  /* round find my location button, bottom right, using the app .map-fabs / .fab */
  function addFabs(el) {
    try {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    } catch (e) {}
    var wrap = document.createElement('div');
    wrap.className = 'map-fabs';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fab';
    btn.setAttribute('aria-label', T('Find my location'));
    btn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="3.4"/>' +
        '<path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>' +
      '</svg>';
    btn.onclick = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      locateMe();
    };
    wrap.appendChild(btn);
    /* keep taps on the button off the map */
    try {
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
    } catch (e) {}
    el.appendChild(wrap);
  }

  /* Swap the tiles when the scheme changes. The map itself is built once and
     lives in a hidden tab, so without this a theme change left a dark map on
     a light page (and the reverse) until a reload. */
  function applyScheme() {
    if (!map) return;
    var dark = prefersDark();
    if (dark === isDark) return;
    isDark = dark;
    var baseSet = dark ? 'dark_nolabels' : 'voyager_nolabels';
    var labelSet = dark ? 'dark_only_labels' : 'voyager_only_labels';
    if (baseLayer) { try { map.removeLayer(baseLayer); } catch (e) {} }
    if (labelLayer) { try { map.removeLayer(labelLayer); } catch (e) {} }
    baseLayer = L.tileLayer(CARTO + baseSet + '/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap, &copy; CARTO',
      subdomains: 'abcd',
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2
    }).addTo(map);
    baseLayer.on('tileerror', function () {
      if (noteOffline) return;
      noteOffline = true;
      restNote();
    });
    labelLayer = L.tileLayer(CARTO + labelSet + '/{z}/{x}/{y}{r}.png', {
      pane: 'campLabels',
      subdomains: 'abcd',
      minZoom: 8,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2
    }).addTo(map);
  }
  /* the host calls this after an appearance change; the media query covers a
     system flip while the app sits open */
  window.refreshCampMapTheme = applyScheme;
  try {
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyScheme);
      else if (mq.addListener) mq.addListener(applyScheme);
    }
  } catch (e) {}

  window.renderCampMapChips = function () { renderChips(); restNote(); };

  window.initCampMap = function () {
    /* the map lives in a tab that shows and hides. On a repeat call resize and
       re-check the scheme, so the tiles always match the page. */
    if (inited) {
      if (map) {
        applyScheme();
        try { map.invalidateSize(); } catch (e) {}
      }
      return;
    }
    /* fail quietly if the libraries or the container are missing */
    if (typeof L === 'undefined' || !L || !L.map) return;
    var el = document.getElementById('campMap');
    if (!el) return;

    try {
      map = L.map(el, {
        minZoom: 4,
        maxZoom: 16,
        zoomControl: false,
        doubleClickZoom: false,
        /* one canvas beats a DOM node per shape while panning a phone */
        preferCanvas: true
      }).setView([49, -85], 5);

      /* loosely fenced to Ontario and its edges */
      map.setMaxBounds([[40, -97], [58, -72]]);

      /* zone fill pane sits above the base tiles and below the pins */
      map.createPane('campZones');
      map.getPane('campZones').style.zIndex = 405;

      /* labels ride above the zones but stay under the markers, close zoom only */
      map.createPane('campLabels');
      map.getPane('campLabels').style.zIndex = 450;
      map.getPane('campLabels').style.pointerEvents = 'none';

      /* base and label tiles, picked for the scheme in effect */
      applyScheme();

      /* nothing else draws until a chip asks for it */
      renderChips();
      wireChips();
      applyShow();

      /* find my location control */
      addFabs(el);

      inited = true;

      /* the tab may still be laying out, so settle the size once */
      setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 60);
    } catch (e) {
      /* never throw out of init */
    }
  };

})();
