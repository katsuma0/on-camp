/* on-camp map module.
   A self contained Leaflet map for the parks tab: Ontario provincial parks as
   pins over the 20 Fisheries Management Zone boundaries, styled to match the
   sibling on-fishing app. The host page loads Leaflet (1.9) from a CDN before
   this file, then calls window.initCampMap() when the tab appears.
   This file only defines window.initCampMap; it does nothing else at load. */
(function () {

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

  function prefersDark() {
    try {
      var a = localStorage.getItem('oncamp-appearance');
      if (a === 'dark') return true;
      if (a === 'light') return false;
    } catch (e) {}
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
    nm.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:5px;color:var(--label)';
    var a = document.createElement('button');
    a.type = 'button';
    a.textContent = 'Open park';
    a.style.cssText = 'appearance:none;border:0;background:none;cursor:pointer;font-family:inherit;' +
      'color:var(--tint);font-weight:700;font-size:12.5px;text-decoration:underline;text-underline-offset:2px;padding:0';
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
    var pins = window.PARK_PINS;
    if (!pins || !pins.length) return;
    var icon = pinIcon();
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
      m.addTo(map);
    });
  }

  /* fetch the zone boundaries once and draw them on a canvas below the pins */
  function loadZones() {
    if (!map) return;
    var renderer = null;
    try { renderer = L.canvas({ padding: 0.4, pane: 'campZones' }); } catch (e) {}
    try {
      fetch(BOUNDS_URL).then(function (r) {
        return r.json();
      }).then(function (gj) {
        if (!map || !gj || !gj.features) return;
        var opts = { pane: 'campZones', smoothFactor: 1.4, style: zoneStyle };
        if (renderer) opts.renderer = renderer;
        try { L.geoJSON(gj, opts).addTo(map); } catch (e) {}
      }).catch(function () {
        /* offline: leave the pins on the plain basemap */
      });
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
    btn.setAttribute('aria-label', 'Find my location');
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

  window.initCampMap = function () {
    /* the map lives in a tab that shows and hides. On a repeat call just resize. */
    if (inited) {
      if (map) { try { map.invalidateSize(); } catch (e) {} }
      return;
    }
    /* fail quietly if the libraries or the container are missing */
    if (typeof L === 'undefined' || !L || !L.map) return;
    var el = document.getElementById('campMap');
    if (!el) return;

    try {
      var dark = prefersDark();
      var baseSet = dark ? 'dark_nolabels' : 'voyager_nolabels';
      var labelSet = dark ? 'dark_only_labels' : 'voyager_only_labels';

      map = L.map(el, {
        minZoom: 4,
        maxZoom: 16,
        zoomControl: false,
        doubleClickZoom: false
      }).setView([49, -85], 5);

      /* loosely fenced to Ontario and its edges */
      map.setMaxBounds([[40, -97], [58, -72]]);

      /* base tiles */
      L.tileLayer(CARTO + baseSet + '/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap, &copy; CARTO',
        subdomains: 'abcd',
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 4
      }).addTo(map);

      /* zone fill pane sits above the base tiles and below the pins */
      map.createPane('campZones');
      map.getPane('campZones').style.zIndex = 405;

      /* labels ride above the zones but stay under the markers, close zoom only */
      map.createPane('campLabels');
      map.getPane('campLabels').style.zIndex = 450;
      map.getPane('campLabels').style.pointerEvents = 'none';
      L.tileLayer(CARTO + labelSet + '/{z}/{x}/{y}{r}.png', {
        pane: 'campLabels',
        subdomains: 'abcd',
        minZoom: 8,
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 2
      }).addTo(map);

      /* the 20 zone boundaries, fetched as GeoJSON and drawn under the pins */
      loadZones();

      /* park pins, in the default marker pane above everything */
      addPins();

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
