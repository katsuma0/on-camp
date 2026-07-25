/* on-* universal share.
   One shared module across on-wildlife, on-camp and on-fishing so a shared
   wildlife encounter, park review or fishing catch all look and behave the same.

   It renders a clean square card image, opens the native share sheet (iMessage,
   Mail, Messages, anywhere), and puts a deep link in the message so the person
   who receives it can open the exact item in the app, or get the app if they do
   not have it. No server, nothing tracked; the whole item travels inside the link.

   Each app sets OnShare.config({app, base, accent}) once at boot. */
(function () {
  'use strict';

  var CFG = { app: 'on-wildlife', base: 'https://katsuma0.github.io/on-wildlife/', accent: '#14804a' };
  var SF = '-apple-system, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';

  function b64urlEncode(str) {
    var b = btoa(unescape(encodeURIComponent(str)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  // colour helpers
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function tint(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function shade(hex, d) { // d<0 darker, d>0 lighter
    var c = rgb(hex).map(function (v) { return Math.max(0, Math.min(255, Math.round(v + (d < 0 ? v * d : (255 - v) * d)))); });
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  // Wrap text to a max width, return the lines (at most maxLines, last gets an ellipsis).
  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, '…'); }
    return lines;
  }

  function spaced(x, on) { try { x.letterSpacing = on ? '5px' : '0px'; } catch (e) {} }

  // Draw the card. o: {eyebrow, kicker, emoji, title, subtitle, chips:[{label}], meta}
  function makeCard(o) {
    var S = 1080, c = document.createElement('canvas'); c.width = S; c.height = S;
    var x = c.getContext('2d');
    var A = CFG.accent;

    // clean white ground
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);

    // accent header band with a soft top-to-bottom depth
    var band = 296;
    var g = x.createLinearGradient(0, 0, 0, band);
    g.addColorStop(0, shade(A, 0.10)); g.addColorStop(1, A);
    x.fillStyle = g; x.fillRect(0, 0, S, band);
    x.textAlign = 'center';

    // wordmark + kind kicker, in the band
    x.fillStyle = 'rgba(255,255,255,0.96)'; x.font = '700 40px ' + SF; spaced(x, true);
    x.fillText((o.eyebrow || CFG.app).toUpperCase(), S / 2, 118); spaced(x, false);
    if (o.kicker) { x.fillStyle = 'rgba(255,255,255,0.74)'; x.font = '600 27px ' + SF; spaced(x, true);
      x.fillText(o.kicker.toUpperCase(), S / 2, 162); spaced(x, false); }

    // medallion straddling the band edge, white disc with a soft shadow
    var mcy = band, mr = 112;
    x.save();
    x.beginPath(); x.arc(S / 2, mcy, mr + 9, 0, Math.PI * 2);
    x.shadowColor = 'rgba(17,24,20,0.18)'; x.shadowBlur = 34; x.shadowOffsetY = 12;
    x.fillStyle = '#ffffff'; x.fill();
    x.restore();
    x.beginPath(); x.arc(S / 2, mcy, mr, 0, Math.PI * 2); x.fillStyle = tint(A, 0.10); x.fill();
    x.font = '124px ' + SF; x.textBaseline = 'middle';
    x.fillText(o.emoji || '🐾', S / 2, mcy + 4);
    x.textBaseline = 'alphabetic';

    // title
    x.fillStyle = '#0b0b0c'; x.font = '800 74px ' + SF;
    var tl = wrap(x, o.title || '', S - 170, 2), ty = 520;
    tl.forEach(function (l) { x.fillText(l, S / 2, ty); ty += 84; });

    // subtitle
    if (o.subtitle) { x.fillStyle = 'rgba(60,60,67,0.66)'; x.font = '400 39px ' + SF;
      wrap(x, o.subtitle, S - 210, 2).forEach(function (l) { ty += 6; x.fillText(l, S / 2, ty + 40); ty += 52; }); }

    // chips
    if (o.chips && o.chips.length) {
      x.font = '600 34px ' + SF;
      var pad = 30, gap = 20, hgt = 70, y = Math.max(ty + 48, 812);
      var labels = o.chips.map(function (ch) { return ch.label; });
      var widths = labels.map(function (l) { return x.measureText(l).width + pad * 2; });
      var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (labels.length - 1);
      var cxp = (S - total) / 2;
      labels.forEach(function (l, i) {
        roundRect(x, cxp, y, widths[i], hgt, hgt / 2);
        x.fillStyle = tint(A, 0.12); x.fill();
        x.fillStyle = shade(A, -0.15); x.fillText(l, cxp + widths[i] / 2, y + 47);
        cxp += widths[i] + gap;
      });
    }

    // footer: hairline, meta line, then app mark
    x.strokeStyle = 'rgba(60,60,67,0.12)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(120, S - 132); x.lineTo(S - 120, S - 132); x.stroke();
    if (o.meta) { x.fillStyle = 'rgba(60,60,67,0.6)'; x.font = '400 31px ' + SF; x.fillText(o.meta, S / 2, S - 84); }
    x.fillStyle = A; x.font = '600 31px ' + SF; x.fillText(CFG.app + ' · katsuma0.github.io', S / 2, S - 44);

    return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/png', 0.92); });
  }

  function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y);
    x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }

  function download(blob, name) { var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }

  window.OnShare = {
    config: function (c) { for (var k in c) CFG[k] = c[k]; },
    cfg: function () { return CFG; },
    encode: function (obj) { return b64urlEncode(JSON.stringify(obj)); },
    decode: function (s) { try { return JSON.parse(b64urlDecode(s)); } catch (e) { return null; } },
    link: function (obj) { return CFG.base + '#/shared/' + this.encode(obj); },
    makeCard: makeCard,
    // o: {card:{...}, text, item}  -> opens the share sheet, resolves to a status string
    share: function (o) {
      var self = this;
      return makeCard(o.card).then(function (blob) {
        var url = o.item ? self.link(o.item) : CFG.base;
        var file = blob ? new File([blob], (CFG.app || 'on') + '-card.png', { type: 'image/png' }) : null;
        var text = (o.text || '') + '\n' + url;
        var data = { title: (o.card && o.card.title) || CFG.app, text: text };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        else data.url = url;
        if (navigator.share) {
          return navigator.share(data).then(function () { return 'shared'; },
            function (e) { return e && e.name === 'AbortError' ? 'cancel' : fallback(); });
        }
        return fallback();
        function fallback() {
          if (blob) download(blob, (CFG.app || 'on') + '-card.png');
          try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (e) {}
          return 'fallback';
        }
      });
    }
  };
})();
