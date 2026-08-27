/* EPL 벽돌 스타디움 3D 시안 v4 — 6구장 파라메트릭 + 동상은 에셋(완공 제막)
   동상 에셋 슬롯: 지금은 절차 생성 캡슐 조형(임시). AI 생성 GLB(Meshy/Tripo)로
   갈아끼우는 자리 — buildAdams/buildHenry 만 교체하면 된다. */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var BASE = {
    grassA: [0x2f7d3a, 0x31813c],
    grassB: [0x3b8f46, 0x389043],
    line: [0xe4e4dc],
    concrete: [0x9a9ca2, 0x93959b],
    box: [0x232733, 0x1f2330],
    facadeGlass: [0x2e3547, 0x2a3143],
    facadeSteel: [0xb9bdc6, 0xb2b6bf],
    roofDeck: [0xd4d7dc, 0xcdd0d6],
    roofDark: [0x565b66, 0x505560],
    steel: [0xf0f2f5, 0xe9ebef],
    glassroof: [0xbfd3e6, 0xb7cde2],
    brick: [0x8a3a2e, 0x82362b, 0x93402f],
    brickDark: [0x6e2d24, 0x672a21],
    white: [0xe9e9ec, 0xe2e2e6],
  };

  var STADIUMS = {
    emirates: {
      name: "에미레이츠 스타디움", abbr: "ARS", n: 2.35, tiers: 17, boxRows: [8, 9],
      seat: [0xc2273a, 0xb92336, 0xcb2f42], apron: [0x5a2330, 0x54202c],
      banner: [0xa3202f, 0x9c1d2b], muralFig: [0xe8e2d8, 0xe2dcd0],
      facade: "emirates", roofColor: "roofDeck", trusses: true,
      emblem: { pal: { W: 0xf2efe6, R: 0xb01e2e, G: 0xd9b45b }, art: [
        "....WWWWWWWWWWWWW....",
        "...WWRRRRRRRRRRRWW...",
        "..WRRRRRRRRRRRRRRRW..",
        ".WRRRRRRRRRRRRRRRRRW.",
        ".WRRRRRRRRRRRRRRRRRW.",
        ".WRRGGGGGGGGGGGGGRRW.",
        ".WRGGGGGGGGGGGGGGGRW.",
        ".WRRGGGGGGGGGGGGGRRW.",
        ".WRRRRGGRRRRRGGRRRRW.",
        ".WRRRGGGGRRRGGGGRRRW.",
        ".WRRRGGGGRRRGGGGRRRW.",
        ".WRRRRGGRRRRRGGRRRRW.",
        ".WRRRRRRRRRRRRRRRRRW.",
        ".WRRRRRRRRRRRRRRRRRW.",
        "..WRRRRRRRRRRRRRRRW..",
        "..WRRRRRRRRRRRRRRRW..",
        "...WRRRRRRRRRRRRRW...",
        "...WRRRRRRRRRRRRRW...",
        "....WRRRRRRRRRRRW....",
        ".....WRRRRRRRRRW.....",
        "......WRRRRRRRW......",
        ".......WRRRRRW.......",
        "........WRRRW........",
        ".........WWW.........",
      ] },
    },
    oldtrafford: {
      name: "올드 트래포드", abbr: "MUN", n: 5.5, tiers: 15, boxRows: [8],
      seat: [0xc42b38, 0xbb2734, 0xcc3340], apron: [0x3a3d44, 0x35383f],
      facade: "brick", roofColor: "roofDeck", bigEnd: { dir: [0, 1], extra: 6 },
      emblem: { pal: { G: 0xd9a93c, R: 0xa5192e }, art: [
        "....GGGGGGGGGGGGG....",
        "...GGRRRRRRRRRRRGG...",
        "..GRRGGRRGGRRGGRRRG..",
        "..GGGGGGGGGGGGGGGGG..",
        "..GRGGGGGGGGGGGGGRG..",
        ".GRRRRRRRRRRRRRRRRRG.",
        ".GRRRGRRRGRRRGRRRRRG.",
        ".GRRRGRRRGRRRGRRRRRG.",
        ".GRRRGGGGGGGGGRRRRRG.",
        ".GRRRRRRGGRRRRRRRRRG.",
        ".GRRRRRRGGRRRRRRRRRG.",
        ".GRRRRGGGGGGRRRRRRRG.",
        ".GRRRGGGGGGGGRRRRRRG.",
        ".GRRRGGRRGGRRGGRRRRG.",
        ".GRRRGGRRRRRRGGRRRRG.",
        ".GRRRRRRRRRRRRRRRRRG.",
        "..GRRRRRRRRRRRRRRRG..",
        "..GRRRRRRRRRRRRRRRG..",
        "...GRRRRRRRRRRRRRG...",
        "....GRRRRRRRRRRRG....",
        ".....GRRRRRRRRRG.....",
        "......GRRRRRRRG......",
        ".......GRRRRRG.......",
        "........GGGGG........",
      ] },
    },
    anfield: {
      name: "안필드", abbr: "LIV", n: 5.5, tiers: 14, boxRows: [7],
      seat: [0xbf2033, 0xb61d2f, 0xc82738], apron: [0x3a3d44, 0x35383f],
      facade: "brick", roofColor: "roofDark", bigEnd: { dir: [0, -1], extra: 7 },
      emblem: { pal: { G: 0xd9b45b, R: 0xa5192e, W: 0xf2efe6 }, art: [
        "....GGGGGGGGGGGGG....",
        "...GGRRRRRRRRRRRGG...",
        "..GRRRRRRRRRRRRRRRG..",
        ".GRRRRRRRWWWRRRRRRRG.",
        ".GRRRRRRWWWWWRRRRRRG.",
        ".GRRRRRRRWWWRRRRRRRG.",
        ".GRRRRRWWWWWWWWRRRRG.",
        ".GRRRWWWWWWWWWWWRRRG.",
        ".GRRRWWWWWWWWWWWWRRG.",
        ".GRRRRWWWWWWWWWWRRRG.",
        ".GRRRRRWWWWWWWWRRRRG.",
        ".GRRRRRRWWWWWWRRRRRG.",
        ".GRRRRRRRWWWWRRRRRRG.",
        ".GRRRRRRRRWWRRRRRRRG.",
        ".GRRRRRRRRWWRRRRRRRG.",
        ".GRRRRRRRWWWWRRRRRRG.",
        "..GRRRRRRRRRRRRRRRG..",
        "..GRRRRRRRRRRRRRRRG..",
        "...GRRRRRRRRRRRRRG...",
        "....GRRRRRRRRRRRG....",
        ".....GRRRRRRRRRG.....",
        "......GRRRRRRRG......",
        ".......GRRRRRG.......",
        "........GGGGG........",
      ] },
    },
    bridge: {
      name: "스탬퍼드 브리지", abbr: "CHE", n: 4, tiers: 15, boxRows: [8],
      seat: [0x1e4fa0, 0x1a4794, 0x2457ac], apron: [0x2b3350, 0x273049],
      facade: "glass", roofColor: "roofDeck",
      emblem: { pal: { W: 0xf2efe6, B: 0x123a7d }, art: [
        "......WWWWWWWWW......",
        "....WWBBBBBBBBBWW....",
        "...WBBBBBBBBBBBBBW...",
        "..WBBBBWWBBBBBBBBBW..",
        ".WBBBBWWWWBBBBWBBBBW.",
        ".WBBBWWWWWBBBBWBBBBW.",
        ".WBBBWWWWWWBBBWBBBBW.",
        ".WBBBBWWWWWWBWWBBBBW.",
        ".WBBBBBWWWWWWWBBBBBW.",
        ".WBBBBWWWWWWBBWBBBBW.",
        ".WBBBWWWWWWWBBWBBBBW.",
        ".WBBBWWWWWWBBBWBBBBW.",
        ".WBBBBWWWWWWBBBBBBBW.",
        ".WBBBBWWBBWWWBBBBBBW.",
        ".WBBBWWWBBBWWWBBBBBW.",
        "..WBBBBBBBBBBBBBBBW..",
        "..WBBBBBBBBBBBBBBBW..",
        "...WBBBBBBBBBBBBBW...",
        "....WWBBBBBBBBBWW....",
        "......WWWWWWWWW......",
      ] },
    },
    etihad: {
      name: "에티하드 스타디움", abbr: "MCI", n: 2.1, tiers: 16, boxRows: [8, 9],
      seat: [0x6cabdd, 0x63a2d6, 0x76b3e3], apron: [0x2e3547, 0x2a3143],
      facade: "glassLight", roofColor: "roofDeck", masts: true,
      emblem: { pal: { W: 0xf2efe6, S: 0x6cabdd, N: 0x1c2c5b }, art: [
        "......WWWWWWWWW......",
        "....WWSSSSSSSSSWW....",
        "...WSSSSSSSSSSSSSW...",
        "..WSSWWSSWWSSWWSSSW..",
        ".WSSWWWSSWWWSSWWWSSW.",
        ".WSSWWWSSWWWSSWWWSSW.",
        ".WSSWWWSSWWWSSWWWSSW.",
        ".WSSSWWWWWWWWWWWSSSW.",
        ".WSSSSWWWWWWWWWSSSSW.",
        ".WSSSSSWWWWWWWSSSSSW.",
        ".WSSNNSSSNNSSSNNSSSW.",
        ".WSSSNNSSSNNSSSNNSSW.",
        ".WSSNNSSSNNSSSNNSSSW.",
        ".WSSSSSSSSSSSSSSSSSW.",
        "..WSSSSSSSSSSSSSSSW..",
        "..WSSSSSSSSSSSSSSSW..",
        "...WSSSSSSSSSSSSSW...",
        "....WWSSSSSSSSSWW....",
        "......WWWWWWWWW......",
      ] },
    },
    spurs: {
      name: "토트넘 홋스퍼 스타디움", abbr: "TOT", n: 2.5, tiers: 16, boxRows: [8, 9],
      seat: [0x25355c, 0x213154, 0x2a3b66], apron: [0x1c2438, 0x192134],
      facade: "sleek", roofColor: "roofDeck", bigEnd: { dir: [-1, 0], extra: 6 },
      emblem: { pal: { W: 0xf2efe6, N: 0x132257 }, art: [
        "......WWWWWWWWW......",
        "....WWWWWWWWWWWWW....",
        "...WWWWWWNNWWWWWWW...",
        "..WWWWWWNNNNWWWWWWW..",
        ".WWWWWWWNNNWWWWWWWWW.",
        ".WWWWWWWWNNWWWWWWWWW.",
        ".WWWWWWWNNNWWWWWWWWW.",
        ".WWWWWWNNNNNWWWWWWWW.",
        ".WWWWWNNNNNNNWWWWWWW.",
        ".WWWWWNNNNNNNNWWWWWW.",
        ".WWWWWWNNNNNNNNNWWWW.",
        ".WWWWWWWNNNNNWNNNWWW.",
        ".WWWWWWWWNNNWWWNNWWW.",
        ".WWWWWWWWNNWWWWWNNWW.",
        ".WWWWWWWWNNWWWWWWWWW.",
        ".WWWWWWWNNNNWWWWWWWW.",
        "..WWWWWNNNNNNWWWWWW..",
        "..WWWWWNNNNNNWWWWWW..",
        "...WWWWWNNNNWWWWWW...",
        "....WWWWWWWWWWWWW....",
        "......WWWWWWWWW......",
      ] },
    },
  };

  var N = 2.35;
  function inSuper(x, z, rx, rz) {
    return Math.pow(Math.abs(x / rx), N) + Math.pow(Math.abs(z / rz), N) <= 1;
  }
  function inRoundRect(x, z, hx, hz, r) {
    var ax = Math.abs(x), az0 = Math.abs(z);
    if (ax > hx || az0 > hz) return false;
    if (ax <= hx - r || az0 <= hz - r) return true;
    var dx = ax - (hx - r), dz = az0 - (hz - r);
    return dx * dx + dz * dz <= r * r;
  }

  function generate(cfg) {
    N = cfg.n;
    var blocks = [];
    function push(x, y, z, type, s) { blocks.push({ x: x, y: y, z: z, type: type, s: s || 1 }); }
    var COLORS = Object.assign({}, BASE, {
      seat: cfg.seat, apron: cfg.apron,
      banner: cfg.banner || BASE.brick, muralFig: cfg.muralFig || BASE.white,
    });

    var PX = 32, PZ = 21;
    for (var x = -PX; x <= PX; x++) {
      for (var z = -PZ; z <= PZ; z++) {
        var line =
          Math.abs(x) === PX || Math.abs(z) === PZ || x === 0 ||
          (Math.round(Math.sqrt(x * x + z * z)) === 11 && Math.abs(x) > 0) ||
          (Math.abs(x) >= PX - 10 && Math.abs(z) === 12) ||
          (Math.abs(x) === PX - 10 && Math.abs(z) <= 12) ||
          (Math.abs(x) >= PX - 3 && Math.abs(z) === 5) ||
          (Math.abs(x) === PX - 3 && Math.abs(z) <= 5) ||
          (Math.abs(x) === PX - 7 && z === 0);
        var stripe = Math.floor((x + PX) / 4) % 2 === 0;
        push(x, 0, z, line ? "line" : stripe ? "grassA" : "grassB");
      }
    }

    var ARX = 37, ARZ = 26;
    for (var ax = -ARX; ax <= ARX; ax++) {
      for (var az2 = -ARZ; az2 <= ARZ; az2++) {
        if (!inSuper(ax, az2, ARX, ARZ)) continue;
        if (Math.abs(ax) <= PX && Math.abs(az2) <= PZ) continue;
        push(ax, 0, az2, "apron");
      }
    }

    var big = cfg.bigEnd || null;
    function inSector(x2, z2) {
      if (!big) return false;
      var len = Math.hypot(x2, z2) || 1;
      return (x2 * big.dir[0] + z2 * big.dir[1]) / len > 0.62;
    }

    var TIERS = cfg.tiers, STEP = 1.22;
    var innerRX = ARX, innerRZ = ARZ;
    var boxSet = {};
    (cfg.boxRows || []).forEach(function (r) { boxSet[r] = 1; });
    function tierType(t, x2, z2) {
      if (boxSet[t]) return "box";
      var ang = Math.atan2(z2, x2);
      var radial = Math.abs((((ang * 12) / Math.PI) % 1 + 1) % 1 - 0.5) < 0.045;
      if (radial) return "concrete";
      if (t % 5 === 4) return "concrete";
      return "seat";
    }
    var maxTiers = TIERS + (big ? big.extra : 0);
    for (var t = 0; t < maxTiers; t++) {
      var rx0 = innerRX + t * STEP, rz0 = innerRZ + t * STEP;
      var rx1 = rx0 + STEP, rz1 = rz0 + STEP;
      var y = 1 + t;
      var lim = Math.ceil(rx1) + 1, limz = Math.ceil(rz1) + 1;
      for (var xx = -lim; xx <= lim; xx++) {
        for (var zz = -limz; zz <= limz; zz++) {
          if (!inSuper(xx, zz, rx1, rz1)) continue;
          if (inSuper(xx, zz, rx0, rz0)) continue;
          if (t >= TIERS && !inSector(xx, zz)) continue;
          push(xx, y, zz, tierType(t, xx, zz));
        }
      }
    }

    var FRX = innerRX + maxTiers * STEP, FRZ = innerRZ + maxTiers * STEP;
    var FTOP = TIERS + 2;
    function facadeType(fy, fx, fz) {
      var s = cfg.facade;
      if (s === "emirates") {
        if (fy <= 6) return "facadeGlass";
        if (fy <= 9) {
          var u = ((Math.atan2(fz, fx) + Math.PI) / (2 * Math.PI)) * 96;
          var cell = u % 4;
          if (fy === 9) return cell >= 1.7 && cell <= 2.3 ? "muralFig" : "banner";
          if (fy === 8) return cell >= 0.8 && cell <= 3.2 ? "muralFig" : "banner";
          return cell >= 1.2 && cell <= 2.8 ? "muralFig" : "banner";
        }
        return fy % 4 === 0 ? "facadeSteel" : "facadeGlass";
      }
      if (s === "brick") {
        if (fy <= 3) return "facadeGlass";
        if (fy % 6 === 0) return "concrete";
        return ((fx + fz + fy) & 5) === 0 ? "brickDark" : "brick";
      }
      if (s === "glassLight") return fy % 3 === 0 ? "facadeSteel" : "facadeGlass";
      if (s === "sleek") return fy % 2 === 0 ? "white" : "facadeSteel";
      return "facadeGlass";
    }
    var flim = Math.ceil(FRX) + 2, flimz = Math.ceil(FRZ) + 2;
    for (var fx = -flim; fx <= flim; fx++) {
      for (var fz = -flimz; fz <= flimz; fz++) {
        if (!inSuper(fx, fz, FRX + 1.4, FRZ + 1.4)) continue;
        if (inSuper(fx, fz, FRX, FRZ)) continue;
        var ftopHere = FTOP + (inSector(fx, fz) && big ? big.extra : 0);
        for (var fy = 1; fy <= ftopHere; fy++) push(fx, fy, fz, facadeType(fy, fx, fz));
      }
    }

    var ROOF_Y = FTOP + 2;
    var OHX = PX + 7, OHZ = PZ + 6, OR = 9;
    var rlim = Math.ceil(FRX) + 2, rlimz = Math.ceil(FRZ) + 2;
    for (var rx3 = -rlim; rx3 <= rlim; rx3++) {
      for (var rz3 = -rlimz; rz3 <= rlimz; rz3++) {
        if (!inSuper(rx3, rz3, FRX + 1.4, FRZ + 1.4)) continue;
        if (inRoundRect(rx3, rz3, OHX, OHZ, OR)) continue;
        var ry = ROOF_Y + (inSector(rx3, rz3) && big ? big.extra : 0);
        var nearOpen = inRoundRect(rx3, rz3, OHX + 2, OHZ + 2, OR + 2);
        push(rx3, ry, rz3, nearOpen ? "glassroof" : cfg.roofColor);
      }
    }

    if (cfg.trusses) {
      var SPAN = Math.ceil(FRX + 1);
      [-(OHZ + 2), OHZ + 2].forEach(function (tz) {
        for (var sx = -SPAN; sx <= SPAN; sx++) {
          if (!inSuper(sx, tz, FRX + 1.2, FRZ + 1.2)) continue;
          var arch = 6 * (1 - Math.pow(sx / SPAN, 2));
          var atop = ROOF_Y + 2 + Math.round(arch);
          push(sx, atop, tz, "steel");
          push(sx, ROOF_Y + 1, tz, "steel");
          var h = atop - (ROOF_Y + 1);
          if (h > 1) {
            var phase = ((sx % 6) + 6) % 6;
            var wy = ROOF_Y + 2 + Math.round((h - 2) * Math.abs(phase - 3) / 3);
            push(sx, wy, tz, "steel");
          }
          if (((sx % 6) + 6) % 6 === 0) {
            for (var py = ROOF_Y + 1; py <= atop; py++) push(sx, py, tz, "steel");
          }
        }
      });
    }

    if (cfg.masts) {
      for (var m = 0; m < 12; m++) {
        var mang = (m / 12) * Math.PI * 2;
        var bx = Math.cos(mang) * FRX * 1.06, bz = Math.sin(mang) * FRZ * 1.06;
        var mtop = ROOF_Y + 9;
        for (var my = 0; my <= mtop; my++) {
          var lean = 1 + (my / mtop) * 0.1;
          push(Math.round(bx * lean), my, Math.round(bz * lean), "steel");
        }
      }
    }

    for (var px2 = -rlim; px2 <= rlim; px2++) {
      for (var pz2 = -rlimz; pz2 <= rlimz; pz2++) {
        if (!inSuper(px2, pz2, FRX + 1.4, FRZ + 1.4)) continue;
        if (inSuper(px2, pz2, FRX - 0.4, FRZ - 0.4)) continue;
        var ly = ROOF_Y + 1 + (inSector(px2, pz2) && big ? big.extra : 0);
        push(px2, ly, pz2, "steel");
      }
    }

    /* 엠블럼 패널 — 정면 파사드에 절반 블록으로 정밀 묘사, 벽에서 살짝 돌출 */
    if (cfg.emblem) {
      var art = cfg.emblem.art, pal = cfg.emblem.pal;
      var EH = art.length, EW = art[0].length;
      Object.keys(pal).forEach(function (k2) { COLORS["em_" + k2] = [pal[k2]]; });
      var EY = 6;
      for (var ej = 0; ej < EH; ej++) {
        for (var ei = 0; ei < EW; ei++) {
          var ch = art[ej][ei] || ".";
          if (ch === ".") continue;
          var zc = (ei - EW / 2) * 0.5;
          var frac = Math.abs(zc) / (FRZ + 1.4);
          var xOuter = (FRX + 1.4) * Math.pow(Math.max(0, 1 - Math.pow(frac, N)), 1 / N);
          push(Math.round(xOuter * 2) / 2 + 0.9, EY + (EH - 1 - ej) * 0.5, zc, "em_" + ch, 0.5);
        }
      }
    }

    var seen = Object.create(null);
    blocks = blocks.filter(function (b) {
      var k = b.x + "," + b.y + "," + b.z;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    blocks.forEach(function (b) {
      b.order = b.y * 10000 + ((Math.atan2(b.z, b.x) + Math.PI) * 1000);
    });
    blocks.sort(function (a, b2) { return a.order - b2.order; });
    return {
      blocks: blocks, COLORS: COLORS, ROOF_Y: ROOF_Y, OHX: OHX, OHZ: OHZ,
      plaza: cfg.statues ? Math.ceil(FRX) + 10 : null,
      arx: ARX, arz: ARZ, tiers: TIERS, step: STEP,
      bigDir: big ? big.dir : null, bigExtra: big ? big.extra : 0,
    };
  }

  /* ── three 셋업 ── */
  var canvas = document.getElementById("scene");
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (e) {
    // ⚠️ 여기서 던지면 스크립트가 통째로 멈춰 window.__setup 이 정의되지 않는다.
    //    그런데 <script> 는 실행 중 예외를 던져도 load 가 발화하므로 지면의 error
    //    핸들러가 안 뜬다 — 실패를 알릴 유일한 통로가 이 플래그다 (감리 C12).
    window.__stadiumError = "webgl-unavailable: " + (e && e.message ? e.message : e);
    return;
  }
  /**
   * 이 앱은 즉시실행 1회성이라 렌더러가 **첫 마운트의 캔버스**를 영구히 붙든다.
   * 클라이언트 내비게이션으로 다시 들어오면 DOM 은 새 캔버스인데 렌더러는 옛것을
   * 그린다 — HUD 만 갱신되고 3D 는 죽는다 (감리 C11). 지면이 이 값을 대조해
   * 어긋나면 스스로 알아채도록 노출한다.
   */
  window.__stadiumCanvas = canvas;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161d);
  scene.fog = new THREE.Fog(0x14161d, 380, 780);
  var camera = new THREE.PerspectiveCamera(46, 1, 0.1, 1100);

  var amb = new THREE.AmbientLight(0x6a7080, 1.05);
  scene.add(amb);
  var sun = new THREE.DirectionalLight(0xfff2dd, 1.35);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  var rim = new THREE.DirectionalLight(0x6db4ff, 0.35);
  rim.position.set(-50, 30, -60);
  scene.add(rim);

  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(680, 48),
    new THREE.MeshLambertMaterial({ color: 0x1a1d26 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.51;
  scene.add(ground);

  var WS = 2; // 월드 스케일 — 벽돌 수는 그대로, 렌더만 2배
  /**
   * 밟는 면의 높이.
   * 블록은 한 변이 WS 이고 **중심**이 (x*WS, y*WS, z*WS) 에 놓인다. 그래서 y=0 인
   * 잔디 블록의 윗면은 0 이 아니라 WS/2 다. 이걸 빼먹으면 캐릭터·공·골대가 전부
   * 반 칸씩 잔디에 잠긴다.
   */
  var SURFACE = WS / 2;
  var unit = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  var builtMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  var ghostMat = new THREE.MeshLambertMaterial({
    color: 0x6db4ff, transparent: true, opacity: 0.13, depthWrite: false,
  });

  var dummy = new THREE.Object3D();
  var colorTmp = new THREE.Color();
  var hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  function pick(arr, i) { return arr[i % arr.length]; }

  /* ── 동상 에셋 (임시 절차 조형 — GLB 슬롯) ── */
  var bronzeMat = new THREE.MeshLambertMaterial({ color: 0x8a7448 });
  var plinthMat = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  function limb(g, r, ax, ay, az2, bx2, by2, bz2) {
    var a = new THREE.Vector3(ax, ay, az2), b = new THREE.Vector3(bx2, by2, bz2);
    var len = a.distanceTo(b);
    var m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), bronzeMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize()
    );
    g.add(m);
  }
  function headAt(g, x, y, z, r) {
    var h = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), bronzeMat);
    h.position.set(x, y, z);
    g.add(h);
  }
  function plinthMesh(w) {
    var p = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, w), plinthMat);
    p.position.y = 0.8;
    return p;
  }
  function buildAdams() {
    var g = new THREE.Group();
    g.add(plinthMesh(7));
    var o = 1.6;
    limb(g, 0.62, -0.9, o, 0, -0.6, o + 4.6, 0);
    limb(g, 0.62, 0.9, o, 0, 0.6, o + 4.6, 0);
    limb(g, 1.05, 0, o + 4.4, 0, 0, o + 8.3, 0);
    limb(g, 0.48, 0, o + 7.9, 0, -4.9, o + 8.7, 0);
    limb(g, 0.48, 0, o + 7.9, 0, 4.9, o + 8.7, 0);
    headAt(g, 0, o + 9.9, -0.25, 0.85);
    return g;
  }
  function buildHenry() {
    var g = new THREE.Group();
    g.add(plinthMesh(8));
    var o = 1.6;
    limb(g, 0.6, 0.3, o + 0.7, -0.8, -2.6, o + 0.5, -1.0);
    limb(g, 0.72, 0.3, o + 0.7, -0.8, 0.7, o + 2.9, -0.4);
    limb(g, 0.6, 2.6, o + 0.4, 0.9, 2.2, o + 2.1, 0.8);
    limb(g, 0.68, 2.2, o + 2.1, 0.8, 0.7, o + 2.9, -0.2);
    limb(g, 1.0, 0.7, o + 2.8, -0.2, -0.2, o + 6.2, 0);
    limb(g, 0.42, -0.1, o + 5.9, 0, -2.0, o + 3.3, 1.8);
    limb(g, 0.42, -0.1, o + 5.9, 0, -2.0, o + 3.3, -1.8);
    headAt(g, -0.35, o + 7.3, 0, 0.8);
    return g;
  }
  var statueGroup = new THREE.Group();
  statueGroup.visible = false;
  scene.add(statueGroup);

  /* ── 상태 ── */
  var blocks = [], TOTAL = 0, builtMesh = null, ghostMesh = null;
  var dayColors = null, nightColors = null;
  var floods = [];
  var builtCount = 0;
  var isNight = false;
  var plaza = null;
  var walkB = { x: 36.2, z: 25.2 };
  var terr = null;
  var onGround = true;
  var statueScale = 0;
  var focusOnStatue = false;

  var az = 0.9, pol = 1.05, dist = 260;
  var camT = { x: 0, y: 8, z: 0 };
  var autoRotate = !reduced;

  function disposeMeshes() {
    if (builtMesh) { scene.remove(builtMesh); builtMesh.dispose(); }
    if (ghostMesh) { scene.remove(ghostMesh); ghostMesh.dispose(); }
    floods.forEach(function (s) { scene.remove(s.target); scene.remove(s); });
    floods = [];
  }

  function applyCount(n) {
    n = Math.max(0, Math.min(TOTAL, n));
    if (n > builtCount) {
      for (var j = builtCount; j < n; j++) {
        var bb = blocks[j];
        dummy.position.set(bb.x * WS, bb.y * WS, bb.z * WS);
        dummy.scale.setScalar(WS * (bb.s || 1));
        dummy.updateMatrix();
        builtMesh.setMatrixAt(j, dummy.matrix);
        ghostMesh.setMatrixAt(j, hidden);
      }
    } else if (n < builtCount) {
      for (var j2 = n; j2 < builtCount; j2++) {
        var bb2 = blocks[j2];
        builtMesh.setMatrixAt(j2, hidden);
        dummy.position.set(bb2.x * WS, bb2.y * WS, bb2.z * WS);
        dummy.scale.setScalar(WS * (bb2.s || 1));
        dummy.updateMatrix();
        ghostMesh.setMatrixAt(j2, dummy.matrix);
      }
    }
    builtCount = n;
    builtMesh.instanceMatrix.needsUpdate = true;
    ghostMesh.instanceMatrix.needsUpdate = true;
    var pct = Math.round((builtCount / TOTAL) * 1000) / 10;
    document.getElementById("count").textContent = builtCount.toLocaleString();
    document.getElementById("total").textContent = TOTAL.toLocaleString();
    document.getElementById("pct").textContent = pct + "%";
    document.getElementById("fill").style.width = pct + "%";
  }

  function setNight(on) {
    isNight = on;
    var bg = on ? 0x0a0c13 : 0x14161d;
    scene.background.setHex(bg);
    scene.fog.color.setHex(bg);
    amb.intensity = on ? 0.55 : 1.05;
    amb.color.setHex(on ? 0x2c3348 : 0x6a7080);
    sun.intensity = on ? 0.12 : 1.35;
    sun.color.setHex(on ? 0x8899cc : 0xfff2dd);
    rim.intensity = on ? 0.15 : 0.35;
    floods.forEach(function (s) { s.intensity = on ? 2.4 : 0; });
    builtMesh.instanceColor.array.set(on ? nightColors : dayColors);
    builtMesh.instanceColor.needsUpdate = true;
    var nb = document.getElementById("night");
    if (nb) nb.textContent = "";
  }

  function initStadium(id) {
    var cfg = STADIUMS[id];
    var g = generate(cfg);
    disposeMeshes();
    blocks = g.blocks;
    TOTAL = blocks.length;
    plaza = g.plaza;
    walkB = { x: g.arx - 0.8, z: g.arz - 0.8 };
    terr = { arx: g.arx, arz: g.arz, tiers: g.tiers, step: g.step, bigDir: g.bigDir, bigExtra: g.bigExtra };

    builtMesh = new THREE.InstancedMesh(unit, builtMat, TOTAL);
    builtMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(builtMesh);
    ghostMesh = new THREE.InstancedMesh(unit, ghostMat, TOTAL);
    ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(ghostMesh);

    for (var i = 0; i < TOTAL; i++) {
      var b3 = blocks[i];
      dummy.position.set(b3.x * WS, b3.y * WS, b3.z * WS);
      dummy.scale.setScalar(WS * (b3.s || 1));
      dummy.updateMatrix();
      ghostMesh.setMatrixAt(i, dummy.matrix);
      builtMesh.setMatrixAt(i, hidden);
      colorTmp.setHex(pick(g.COLORS[b3.type], (b3.x * 7 + b3.z * 13 + b3.y) & 7));
      builtMesh.setColorAt(i, colorTmp);
    }
    builtMesh.instanceColor.needsUpdate = true;

    dayColors = new Float32Array(builtMesh.instanceColor.array);
    nightColors = new Float32Array(TOTAL * 3);
    var c = new THREE.Color();
    for (var k = 0; k < TOTAL; k++) {
      var bk = blocks[k], t2 = bk.type;
      if (t2 === "facadeGlass") c.setHex(((bk.x * 31 + bk.z * 17 + bk.y * 7) & 7) < 3 ? 0xffd27a : 0x141926);
      else if (t2 === "banner") c.setHex(0xc22736);
      else if (t2 === "muralFig") c.setHex(0xf3ecdf);
      else if (t2 === "glassroof") c.setHex(0xfff3cf);
      else if (t2 === "roofDeck" || t2 === "roofDark") c.setHex(0x363a42);
      else if (t2 === "steel") c.setHex(0xb9c2cf);
      else if (t2.indexOf("em_") === 0) c.fromArray(dayColors, k * 3);
      else if (t2 === "grassA" || t2 === "grassB" || t2 === "line") c.fromArray(dayColors, k * 3);
      else c.fromArray(dayColors, k * 3).multiplyScalar(0.55);
      nightColors[k * 3] = c.r; nightColors[k * 3 + 1] = c.g; nightColors[k * 3 + 2] = c.b;
    }

    [[g.OHX - 3, g.OHZ - 3], [-(g.OHX - 3), g.OHZ - 3], [g.OHX - 3, -(g.OHZ - 3)], [-(g.OHX - 3), -(g.OHZ - 3)]].forEach(
      function (p) {
        var s = new THREE.SpotLight(0xfff4dc, 0, 340, 0.72, 0.55, 1.2);
        s.position.set(p[0] * WS, (g.ROOF_Y + 6) * WS, p[1] * WS);
        s.target.position.set(-p[0] * 0.35 * WS, 0, -p[1] * 0.35 * WS);
        scene.add(s); scene.add(s.target);
        floods.push(s);
      }
    );

    statueGroup.clear();
    if (plaza) {
      var adams = buildAdams();
      adams.position.set(plaza * WS, SURFACE, 12 * WS);
      adams.rotation.y = Math.PI / 2;
      statueGroup.add(adams);
      var henry = buildHenry();
      henry.position.set(plaza * WS, SURFACE, -12 * WS);
      henry.rotation.y = Math.PI / 2;
      statueGroup.add(henry);
    }
    statueGroup.visible = false;
    statueScale = 0;

    var fb = document.getElementById("focus");
    fb.style.display = plaza ? "" : "none";
    fb.textContent = "동상 보기";
    focusOnStatue = false;
    camT.x = 0; camT.y = 16; camT.z = 0;

    curAbbr = cfg.abbr || "HOME";
    screenGroup.position.set(-(g.OHX - 3) * WS, (g.ROOF_Y - 4) * WS, 0);
    drawScreen();
    document.getElementById("stName").textContent = cfg.name;
    // 새 메쉬는 전부 숨김 상태로 만들어졌다 — 카운터도 0 에서 시작한다.
    // ⚠️ 여기서 시안 데모값(34%)을 미리 세우면 안 된다. applyCount 는 증분 함수라
    //    호출자가 이후에 카운터를 위조하면 되돌리는 분기가 통째로 죽는다 (감리 C1).
    builtCount = 0;
    setNight(isNight);
  }

  /* ── 카메라 ── */
  function applyCamera() {
    var y = Math.cos(pol) * dist;
    var r = Math.sin(pol) * dist;
    var cx = camT.x + Math.cos(az) * r;
    var cy = camT.y + y;
    var cz = camT.z + Math.sin(az) * r;
    // 걷기 모드 카메라 — 뒤에서 추적하되 막히면 당긴다.
    //
    // ⚠️ 분기를 두지 않는다. 예전에는 "스탠드 위" 전용 분기가 원점 기준 atan2 로
    //    방위를 따로 잡았는데 (a) 드래그 각(az)을 무시해 조작과 화면이 어긋나고
    //    (b) 중앙선을 지날 때 시점이 180° 뒤집히고 (c) 그 분기엔 충돌 회피 루프가
    //    없어 카메라가 좌석 안에 박혔다 (감리 C7). 방위는 az 하나만 쓴다.
    if (walkMode && player) {
      var ph = groundHeightAt(player.position.x, player.position.z);
      // 잔디는 SURFACE(=1), 첫 계단은 WS+SURFACE(=3) — 그 사이를 문턱으로
      var onStand = ph !== Infinity && ph > SURFACE + 0.5;
      var minLift = onStand ? 2.5 : 0; // 스탠드에선 좌석 너머가 보이게 더 띄운다
      for (var kk = 1; kk >= 0.2; kk -= 0.12) {
        var tx = camT.x + Math.cos(az) * r * kk;
        var ty = camT.y + Math.max(y * kk, minLift);
        var tz = camT.z + Math.sin(az) * r * kk;
        var g2 = groundHeightAt(tx, tz);
        cx = tx; cz = tz;
        if (g2 !== Infinity && ty >= g2 + 1.2) { cy = ty; break; }
        cy = g2 === Infinity ? ty : Math.max(ty, g2 + 1.2);
      }
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(camT.x, camT.y, camT.z);
  }
  var dragging = false, px = 0, py = 0, pinch = 0;
  function onDown(x, y2) { dragging = true; px = x; py = y2; autoRotate = false; }
  function onMove(x, y2) {
    if (!dragging) return;
    az += (x - px) * 0.006;
    pol = Math.max(0.25, Math.min(1.4, pol - (y2 - py) * 0.004));
    px = x; py = y2;
  }
  canvas.addEventListener("mousedown", function (e) { onDown(e.clientX, e.clientY); });
  window.addEventListener("mousemove", function (e) { onMove(e.clientX, e.clientY); });
  window.addEventListener("mouseup", function () { dragging = false; });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    dist = Math.max(20, Math.min(560, dist + e.deltaY * 0.08));
    autoRotate = false;
  }, { passive: false });
  canvas.addEventListener("touchstart", function (e) {
    if (e.touches.length === 1) onDown(e.touches[0].clientX, e.touches[0].clientY);
    else if (e.touches.length === 2) {
      pinch = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });
  canvas.addEventListener("touchmove", function (e) {
    if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    else if (e.touches.length === 2) {
      var d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      dist = Math.max(20, Math.min(560, dist - (d - pinch) * 0.25));
      pinch = d;
    }
  }, { passive: true });
  canvas.addEventListener("touchend", function () { dragging = false; });

  /* ── UI ── */
  var NICKS = ["벽돌장인", "골수팬", "북런던은빨강", "티에리앙리14", "스카우저",
    "케빈더브라위너교", "브릿지주민", "화이트하트레인", "붉은악마전차", "발빠른백숙"];
  var playing = false;
  var toastEl = document.getElementById("toast");
  var toastTimer = null, nickIdx = 0;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 1800);
  }
  var lastToast = 0;

  var btnPlay = document.getElementById("play");
  document.getElementById("done").addEventListener("click", function () {
    playing = false;
    btnPlay.textContent = "▶ 건설 재생";
    applyCount(TOTAL);
  });
  document.getElementById("reset").addEventListener("click", function () {
    playing = false;
    btnPlay.textContent = "▶ 건설 재생";
    applyCount(Math.floor(TOTAL * 0.34));
  });
  btnPlay.addEventListener("click", function () {
    if (builtCount >= TOTAL) applyCount(Math.floor(TOTAL * 0.05));
    playing = !playing;
    btnPlay.textContent = playing ? "❚❚ 일시정지" : "▶ 건설 재생";
  });

  document.getElementById("focus").addEventListener("click", function () {
    if (!plaza) return;
    focusOnStatue = !focusOnStatue;
    autoRotate = false;
    if (focusOnStatue) {
      camT.x = plaza * WS; camT.y = 9; camT.z = 0;
      dist = 58; pol = 1.2; az = 0.35;
      this.textContent = "구장 보기";
    } else {
      camT.x = 0; camT.y = 16; camT.z = 0;
      dist = 200; pol = 1.05;
      this.textContent = "동상 보기";
    }
  });
  document.getElementById("stadium").addEventListener("change", function (e) {
    if (walkMode) exitWalk();
    playing = false;
    btnPlay.textContent = "▶ 건설 재생";
    initStadium(e.target.value);
  });

  /* ── 루프 ── */
  var clock = new THREE.Clock();
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  var rafId = 0;
  /** 루프 정지 — 지면 언마운트 시 호출한다 (유령 컨텍스트가 GPU 를 태우는 걸 막는다) */
  window.__stadiumStop = function () {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };
  function tick() {
    rafId = requestAnimationFrame(tick);
    resize();
    var dt = clock.getDelta();
    if (autoRotate) az += dt * 0.12;
    if (playing) {
      applyCount(builtCount + Math.max(6, Math.round(TOTAL * dt * 0.06)));
      var now = performance.now();
      if (now - lastToast > 700) {
        showToast(NICKS[nickIdx++ % NICKS.length] + " 님이 벽돌을 얹었습니다 +10p");
        lastToast = now;
      }
      if (builtCount >= TOTAL) { playing = false; btnPlay.textContent = "▶ 건설 재생"; }
    }
    /* 완공 제막 — 100% 순간 동상 에셋이 한 번에 선다 */
    var wantStatues = plaza && builtCount >= TOTAL;
    if (wantStatues && statueScale < 1) {
      if (statueScale === 0) showToast("완공 기념 — 레전드 동상 제막!");
      statueScale = reduced ? 1 : Math.min(1, statueScale + dt * 1.4);
      statueGroup.visible = true;
      statueGroup.scale.setScalar(WS * (0.2 + 0.8 * statueScale));
      statueGroup.position.y = -6 * WS * (1 - statueScale);
    } else if (!wantStatues && statueScale > 0) {
      statueScale = 0;
      statueGroup.visible = false;
    }
    updateWalk(dt);
    updateBall(dt);
    applyCamera();
    renderer.render(scene, camera);
  }


  /* ── 플레이어 캐릭터 — 각진 몸 + 파츠 분리 + 등번호 텍스처 ── */
  var walkMode = false;
  var player = null;
  var limbs = null;
  var walkPhase = 0;
  var pvy = 0;
  var keys = {};
  var kit = { shirt: "#c2273a", shorts: "#f2efe6", socks: "#c2273a" };
  var numCanvas = document.createElement("canvas");
  numCanvas.width = 128; numCanvas.height = 128;
  var numTex = new THREE.CanvasTexture(numCanvas);
  function drawNumber() {
    var ctx = numCanvas.getContext("2d");
    ctx.fillStyle = kit.shirt;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 78px 'Barlow Condensed', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(document.getElementById("kNum").value || "", 64, 70);
    numTex.needsUpdate = true;
  }
  var kitMats = {
    shirt: new THREE.MeshLambertMaterial({ color: kit.shirt }),
    shorts: new THREE.MeshLambertMaterial({ color: kit.shorts }),
    socks: new THREE.MeshLambertMaterial({ color: kit.socks }),
    skin: new THREE.MeshLambertMaterial({ color: 0xd9a77a }),
    hair: new THREE.MeshLambertMaterial({ color: 0x2b241d }),
    back: new THREE.MeshLambertMaterial({ map: numTex }),
  };
  function box(w, h2, d, mat, px2, py2, pz2) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h2, d), mat);
    m.position.set(px2, py2, pz2);
    return m;
  }
  function buildPlayer() {
    var g = new THREE.Group();
    var legL = new THREE.Group(), legR = new THREE.Group();
    [legL, legR].forEach(function (leg, i) {
      var sx = i === 0 ? -0.19 : 0.19;
      leg.position.set(sx, 1.05, 0);
      leg.add(box(0.3, 0.5, 0.32, kitMats.shorts, 0, -0.25, 0));
      leg.add(box(0.26, 0.55, 0.28, kitMats.socks, 0, -0.78, 0));
      g.add(leg);
    });
    var torsoMats = [kitMats.shirt, kitMats.shirt, kitMats.shirt, kitMats.shirt, kitMats.shirt, kitMats.back];
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.4), torsoMats);
    torso.position.y = 1.45;
    g.add(torso);
    var armL = new THREE.Group(), armR = new THREE.Group();
    [armL, armR].forEach(function (arm, i) {
      var sx = i === 0 ? -0.47 : 0.47;
      arm.position.set(sx, 1.8, 0);
      arm.add(box(0.22, 0.34, 0.24, kitMats.shirt, 0, -0.17, 0));
      arm.add(box(0.19, 0.34, 0.2, kitMats.skin, 0, -0.5, 0));
      arm.add(box(0.2, 0.14, 0.21, kitMats.skin, 0, -0.73, 0));
      g.add(arm);
    });
    g.add(box(0.5, 0.5, 0.5, kitMats.skin, 0, 2.12, 0));
    g.add(box(0.54, 0.16, 0.54, kitMats.hair, 0, 2.4, 0));
    g.add(box(0.54, 0.2, 0.2, kitMats.hair, 0, 2.28, -0.18));
    limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
    return g;
  }
  function enterWalk() {
    if (!player) {
      player = buildPlayer();
      player.scale.setScalar(1.0);
      scene.add(player);
      drawNumber();
    }
    player.position.set(0, SURFACE, 4);
    player.visible = true;
    walkMode = true;
    // 조작을 알려주는 자리가 화면 어디에도 없었다 — 걷기 모드는 이 지면의 유일한
    // 체류 장치인데 진입 직후에 막혔다 (감리 C13)
    showToast(
      matchMedia("(pointer: coarse)").matches
        ? "D패드로 이동 · ⚽ 로 슛"
        : "WASD·방향키 이동 · Space 점프 · F 슛"
    );
    autoRotate = false;
    dist = 12; pol = 1.18;
    resetBall();
    document.getElementById("enter").textContent = "나가기";
    document.getElementById("kitPanel").classList.add("on");
    document.getElementById("chatWrap").classList.add("on");
    document.getElementById("dpad").classList.add("on");
  }
  function exitWalk() {
    walkMode = false;
    if (player) player.visible = false;
    ball.visible = false;
    camT.x = 0; camT.y = 16; camT.z = 0;
    dist = 200; pol = 1.05;
    document.getElementById("enter").textContent = "입장하기";
    document.getElementById("kitPanel").classList.remove("on");
    document.getElementById("chatWrap").classList.remove("on");
    bubble.visible = false;
    document.getElementById("dpad").classList.remove("on");
  }
  document.getElementById("enter").addEventListener("click", function () {
    if (walkMode) exitWalk(); else enterWalk();
  });
  /**
   * 이동키.
   *
   * ⚠️ e.key 로 받으면 한글 IME 에서 W 가 "ㅈ" 으로 와 전부 죽는다. 이 화면은 걷는
   *    내내 채팅창을 띄우므로 한 번 치면 IME 가 한글로 남아 그 뒤 WASD 가 먹통이
   *    된다 — 유저는 "입장했는데 안 움직인다" 로만 겪는다 (감리 C14).
   *    같은 파일의 점프·슛이 이미 e.code 를 쓰고 있었다. 여기도 code 로 통일한다.
   *    ⚠️ keys 의 키 이름을 바꾸면 updateWalk 와 D패드 data-k 도 같이 바꿔야 한다.
   */
  var MOVE_CODES = {
    KeyW: "up", ArrowUp: "up",
    KeyS: "down", ArrowDown: "down",
    KeyA: "left", ArrowLeft: "left",
    KeyD: "right", ArrowRight: "right",
  };
  function isTyping() {
    var el = document.activeElement;
    return !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
  }
  window.addEventListener("keydown", function (e) {
    if (isTyping()) return;
    var k = MOVE_CODES[e.code];
    if (k) {
      keys[k] = true;
      if (walkMode) e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) {
    var k = MOVE_CODES[e.code];
    if (k) keys[k] = false;
  });
  // 창 밖으로 나가는 사이 keyup 을 못 받으면 키가 눌린 채 고착된다
  window.addEventListener("blur", function () { keys = {}; });
  Array.prototype.forEach.call(document.querySelectorAll("#dpad button"), function (btn) {
    var k = btn.getAttribute("data-k");
    function on(e) { e.preventDefault(); keys[k] = true; }
    function off(e) { e.preventDefault(); keys[k] = false; }
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointerleave", off);
    btn.addEventListener("pointercancel", off);
  });
  /* 지형 높이 — 피치 0, 스탠드는 계단 (점프로 한 칸씩 오른다) */
  function groundHeightAt(px, pz) {
    if (!terr) return SURFACE;
    // ⚠️ 렌더는 정수 격자에 블록을 놓는데 판정은 연속 좌표로 초타원식을 다시 푼다.
    //    티어 폭이 1.22칸이라 0.22 주기로 어긋나고, 그만큼 캐릭터가 좌석에 파묻힌다
    //    (감리 C8). 같은 정수를 넣어 판정과 렌더를 맞춘다 — 정본은 높이맵(2차).
    var bx = Math.round(px / WS), bz = Math.round(pz / WS);
    if (inSuper(bx, bz, terr.arx, terr.arz)) return SURFACE;
    var maxT = terr.tiers + terr.bigExtra;
    for (var t = 0; t < maxT; t++) {
      var rx1 = terr.arx + (t + 1) * terr.step, rz1 = terr.arz + (t + 1) * terr.step;
      if (inSuper(bx, bz, rx1, rz1)) {
        if (t >= terr.tiers) {
          // 대형 스탠드 섹터 밖이면 그 높이의 티어가 없다 — 벽 취급
          if (!terr.bigDir) return Infinity;
          var len = Math.hypot(bx, bz) || 1;
          if ((bx * terr.bigDir[0] + bz * terr.bigDir[1]) / len <= 0.62) return Infinity;
        }
        return (1 + t) * WS + SURFACE;
      }
    }
    return Infinity; // 파사드 밖 — 벽
  }

  function updateWalk(dt) {
    if (!walkMode || !player) return;
    var fwd = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    var strafe = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    var moving = fwd !== 0 || strafe !== 0;
    if (moving) {
      var dirX = -Math.cos(az) * fwd + Math.sin(az) * strafe;
      var dirZ = -Math.sin(az) * fwd - Math.cos(az) * strafe;
      var len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len; dirZ /= len;
      var SPEED = 12;
      var nx = player.position.x + dirX * SPEED * dt;
      var nz = player.position.z + dirZ * SPEED * dt;
      var gh = groundHeightAt(nx, nz);
      // 발보다 높은 지형은 벽 — 점프 중이라 발이 그 높이를 넘었으면 올라간다
      if (gh <= player.position.y + 0.15) {
        player.position.x = nx;
        player.position.z = nz;
      }
      player.rotation.y = Math.atan2(dirX, dirZ);
      walkPhase += dt * 9;
      var s = Math.sin(walkPhase) * 0.65;
      limbs.legL.rotation.x = s;
      limbs.legR.rotation.x = -s;
      limbs.armL.rotation.x = -s * 0.8;
      limbs.armR.rotation.x = s * 0.8;
    } else {
      limbs.legL.rotation.x *= 0.8;
      limbs.legR.rotation.x *= 0.8;
      limbs.armL.rotation.x *= 0.8;
      limbs.armR.rotation.x *= 0.8;
    }
    /* 중력 + 지형 착지 */
    var floorH = groundHeightAt(player.position.x, player.position.z);
    // ⚠️ 0 이 아니라 SURFACE. 0 은 잔디 윗면보다 반 칸 아래라 처박힌다 (감리 G5)
    if (floorH === Infinity) floorH = SURFACE;
    player.position.y += pvy * dt;
    pvy -= 26 * dt;
    if (player.position.y <= floorH) {
      player.position.y = floorH;
      pvy = 0;
      onGround = true;
    } else {
      onGround = false;
    }
    camT.x = player.position.x;
    camT.y = player.position.y + 1.7;
    camT.z = player.position.z;
    /* 말풍선 따라다니기 */
    if (bubble.visible) {
      bubble.position.set(player.position.x, player.position.y + 3.6, player.position.z);
    }
  }
  function applyKit() {
    kitMats.shirt.color.set(kit.shirt);
    kitMats.shorts.color.set(kit.shorts);
    kitMats.socks.color.set(kit.socks);
    drawNumber();
  }
  document.getElementById("kShirt").addEventListener("input", function () { kit.shirt = this.value; applyKit(); });
  document.getElementById("kShorts").addEventListener("input", function () { kit.shorts = this.value; applyKit(); });
  document.getElementById("kSocks").addEventListener("input", function () { kit.socks = this.value; applyKit(); });
  document.getElementById("kNum").addEventListener("input", drawNumber);
  var KIT_PRESETS = {
    arsenal: ["#c2273a", "#f2efe6", "#c2273a"],
    utd: ["#c42b38", "#f2efe6", "#1a1a1a"],
    liverpool: ["#bf2033", "#bf2033", "#bf2033"],
    chelsea: ["#1e4fa0", "#1e4fa0", "#f2efe6"],
    city: ["#6cabdd", "#f2efe6", "#1c2c5b"],
    spurs: ["#f2efe6", "#132257", "#132257"],
  };
  document.getElementById("kPreset").addEventListener("change", function () {
    var p = KIT_PRESETS[this.value];
    if (!p) return;
    kit.shirt = p[0]; kit.shorts = p[1]; kit.socks = p[2];
    document.getElementById("kShirt").value = p[0];
    document.getElementById("kShorts").value = p[1];
    document.getElementById("kSocks").value = p[2];
    applyKit();
  });


  /* ── 축구공 ── */
  var ballCanvas = document.createElement("canvas");
  ballCanvas.width = 128; ballCanvas.height = 64;
  (function () {
    var bctx = ballCanvas.getContext("2d");
    bctx.fillStyle = "#f4f4f0";
    bctx.fillRect(0, 0, 128, 64);
    bctx.fillStyle = "#1c1c1e";
    for (var bi = 0; bi < 8; bi++) {
      bctx.beginPath();
      bctx.arc(8 + bi * 17, bi % 2 === 0 ? 18 : 46, 7, 0, Math.PI * 2);
      bctx.fill();
    }
  })();
  var ballTex = new THREE.CanvasTexture(ballCanvas);
  var ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 18, 14),
    new THREE.MeshLambertMaterial({ map: ballTex })
  );
  ball.visible = false;
  scene.add(ball);
  var bvel = new THREE.Vector3();
  function resetBall() {
    ball.position.set(0, SURFACE + 0.62, 4);
    bvel.set(0, 0, 0);
    ball.visible = true;
  }
  function kickBall() {
    if (!walkMode || !player) return;
    var dx = ball.position.x - player.position.x;
    var dz = ball.position.z - player.position.z;
    if (Math.hypot(dx, dz) > 3.4) return;
    var fy = player.rotation.y;
    bvel.set(Math.sin(fy) * 28, 9, Math.cos(fy) * 28);
  }
  function updateBall(dt) {
    if (!walkMode || !ball.visible) return;
    bvel.y -= 30 * dt;
    var nbx = ball.position.x + bvel.x * dt;
    var nbz = ball.position.z + bvel.z * dt;
    var bgh = groundHeightAt(nbx, nbz);
    if (bgh !== Infinity && bgh - ball.position.y < 1.4) {
      ball.position.x = nbx;
      ball.position.z = nbz;
    } else {
      /* 벽·높은 계단 반사 */
      bvel.x *= -0.55;
      bvel.z *= -0.55;
    }
    ball.position.y += bvel.y * dt;
    var floorB = groundHeightAt(ball.position.x, ball.position.z);
    if (floorB === Infinity) floorB = SURFACE;
    if (ball.position.y < floorB + 0.62) {
      ball.position.y = floorB + 0.62;
      bvel.y = Math.abs(bvel.y) > 1.2 ? -bvel.y * 0.55 : 0;
      bvel.x *= 0.94;
      bvel.z *= 0.94;
    }
    bvel.x *= 1 - 0.5 * dt;
    bvel.z *= 1 - 0.5 * dt;
    /* 드리블 */
    if (player) {
      var pdx = ball.position.x - player.position.x;
      var pdz = ball.position.z - player.position.z;
      var pd = Math.hypot(pdx, pdz);
      if (pd < 1.5 && Math.abs(ball.position.y - player.position.y) < 2) {
        var fy2 = player.rotation.y;
        bvel.x = Math.sin(fy2) * 12;
        bvel.z = Math.cos(fy2) * 12;
        bvel.y = Math.max(bvel.y, 1.2);
      }
    }
    /* 골 판정 */
    if (goalCooldown > 0) goalCooldown -= dt;
    else if (
      Math.abs(ball.position.x) > GOAL_X + 0.2 &&
      Math.abs(ball.position.x) < GOAL_X + 2.4 &&
      Math.abs(ball.position.z) < GOAL_Z &&
      ball.position.y < GOAL_H + SURFACE
    ) {
      goalCooldown = 2;
      showToast("골인!!! ⚽");
      bvel.multiplyScalar(0.1);
      setTimeout(resetBall, 1200);
    }
    ball.rotation.x += bvel.z * dt * 2;
    ball.rotation.z -= bvel.x * dt * 2;
  }
  window.addEventListener("keydown", function (e) {
    if (!walkMode) return;
    if (isTyping()) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (player && onGround) pvy = 12;
    } else if (e.code === "KeyF") {
      e.preventDefault();
      kickBall();
    }
  });
  document.getElementById("kick").addEventListener("pointerdown", function (e) {
    e.preventDefault();
    kickBall();
  });



  /* ── 전광판 — LIVE 스코어보드 (실서비스: LFA 라이브 스코어 API가 이 캔버스를 채운다) ── */
  var scrCanvas = document.createElement("canvas");
  scrCanvas.width = 512; scrCanvas.height = 288;
  var scrTex = new THREE.CanvasTexture(scrCanvas);
  var curAbbr = "ARS";
  /** 전광판에 띄우는 벽돌 수 — __setup 이 채운다 */
  var scrBricks = 0;
  /**
   * 전광판.
   *
   * ⚠️ 예전에는 로드 시각부터 도는 가짜 경기 시계(04:00 KST · 저절로 오르는 스코어 ·
   *    "코너킥 찬스!" 티커)를 그렸다. 라이브 스코어를 유료 피드로 실제 공급하는
   *    서비스에서 실재하지 않는 경기 결과를 띄우는 것이라 통째로 걷어냈다 (감리 C10).
   *    실제 중계는 나중에 DB 정본 경로로만 붙인다 — 화면 경로에서 외부 API 직접 호출 금지.
   *
   * 지금은 사실만 그린다: 구단 약칭 + 쌓인 벽돌. 값이 바뀔 때만 다시 그린다.
   */
  function drawScreen() {
    var ctx = scrCanvas.getContext("2d");
    ctx.fillStyle = "#080b12";
    ctx.fillRect(0, 0, 512, 288);
    ctx.strokeStyle = "#2a3143";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 506, 282);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e8e6e0";
    ctx.font = "700 64px 'Barlow Condensed', sans-serif";
    ctx.fillText(curAbbr, 256, 84);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 92px 'Barlow Condensed', sans-serif";
    ctx.fillText(scrBricks.toLocaleString(), 256, 176);

    ctx.fillStyle = "#8a8d98";
    ctx.font = "700 30px 'IBM Plex Sans KR', sans-serif";
    ctx.fillText("팬들이 쌓은 벽돌", 256, 240);
    scrTex.needsUpdate = true;
  }

  var screenGroup = new THREE.Group();
  (function () {
    var SW = 26, SH = 14.6;
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, SH + 2, SW + 2),
      new THREE.MeshLambertMaterial({ color: 0x1c1f27 })
    );
    screenGroup.add(frame);
    var face = new THREE.Mesh(
      new THREE.PlaneGeometry(SW, SH),
      new THREE.MeshBasicMaterial({ map: scrTex })
    );
    face.rotation.y = Math.PI / 2;
    face.position.x = 0.75;
    screenGroup.add(face);
    /* 지지 기둥 2개 */
    var legMat = new THREE.MeshLambertMaterial({ color: 0x2a2e38 });
    [-SW / 3, SW / 3].forEach(function (lz) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 30, 0.8), legMat);
      leg.position.set(-0.4, -SH / 2 - 15, lz);
      screenGroup.add(leg);
    });
  })();
  scene.add(screenGroup);
  /**
   * 전광판 갱신 — 값이 바뀔 때만. 매 프레임 도는 루프를 두지 않는다.
   * (상시 애니메이션 금지 판정 · 감리 G16)
   */
  function setScreenBricks(n) {
    if (n === scrBricks) return;
    scrBricks = n;
    drawScreen();
  }

  /* ── 골대 (양쪽, 실규격 비례) + 골 판정 ── */
  var GOAL_X = 32 * WS, GOAL_Z = 4.4, GOAL_H = 3.0;
  var goalMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f2 });
  var netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
  });
  function buildGoal(sideX) {
    var g = new THREE.Group();
    function bar(w, h2, d, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h2, d), goalMat);
      m.position.set(x, y, z);
      g.add(m);
    }
    bar(0.24, GOAL_H, 0.24, 0, GOAL_H / 2, -GOAL_Z);
    bar(0.24, GOAL_H, 0.24, 0, GOAL_H / 2, GOAL_Z);
    bar(0.24, 0.24, GOAL_Z * 2 + 0.24, 0, GOAL_H, 0);
    var back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_Z * 2, GOAL_H), netMat);
    back.rotation.y = Math.PI / 2;
    back.position.set(sideX > 0 ? 1.6 : -1.6, GOAL_H / 2, 0);
    g.add(back);
    g.position.x = sideX;
    g.position.y = SURFACE;
    scene.add(g);
  }
  buildGoal(GOAL_X);
  buildGoal(-GOAL_X);
  var goalCooldown = 0;


  /* ── 채팅 말풍선 (멀티 전 1인 데모 — 실서비스: Supabase Realtime broadcast) ── */
  var bubCanvas = document.createElement("canvas");
  bubCanvas.width = 320; bubCanvas.height = 96;
  var bubTex = new THREE.CanvasTexture(bubCanvas);
  var bubble = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: bubTex, transparent: true, depthTest: false })
  );
  bubble.scale.set(7.5, 2.25, 1);
  bubble.visible = false;
  scene.add(bubble);
  var bubbleTimer = null;
  function say(text) {
    var ctx = bubCanvas.getContext("2d");
    ctx.clearRect(0, 0, 320, 96);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    var r = 18, w = 312, h = 66, x0 = 4, y0 = 4;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
    ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
    ctx.arcTo(x0, y0 + h, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + w, y0, r);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(146, 70);
    ctx.lineTo(174, 70);
    ctx.lineTo(160, 90);
    ctx.fill();
    ctx.fillStyle = "#1c1f27";
    ctx.font = "700 26px 'IBM Plex Sans KR', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 18), 160, 38);
    bubTex.needsUpdate = true;
    bubble.visible = true;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.visible = false; }, 5000);
  }
  var chatInput = document.getElementById("chatInput");
  chatInput.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Enter" && this.value.trim()) {
      say(this.value.trim());
      this.value = "";
      this.blur(); // 전송 후 바로 움직일 수 있게 — 포커스가 남으면 WASD 가 채팅에 먹힌다
    }
  });

  /**
   * 렌더 훅 — scripts/render-stadiums.mjs 가 이 함수로 한 장씩 찍는다.
   * team: 구장 키 · pct: 시공률(0~1) · 카메라는 고정 프리셋.
   */
  window.__shot = function (o) {
    o = o || {};
    if (o.team) initStadium(o.team);
    if (o.pct != null) applyCount(Math.round(TOTAL * o.pct));
    // 청사진(미시공) 블록 표시 여부 — 스틸샷은 끈 상태로 찍는다
    if (ghostMesh) ghostMesh.visible = o.ghost === true;
    if (o.az != null) az = o.az;
    if (o.pol != null) pol = o.pol;
    if (o.dist != null) dist = o.dist;
    if (o.camY != null) camT.y = o.camY;
    if (o.hideUI) {
      document.querySelectorAll(".hud,.hint,#toast,.kit,.chat,.dpad").forEach(function (el) {
        el.style.display = "none";
      });
    }
    applyCamera();
    renderer.render(scene, camera);
    return { total: TOTAL, built: builtCount };
  };
  /**
   * 지면 진입 훅 — app/stadium/[teamId]/enter 가 부른다.
   * 우리 팀 구장을, 지금 쌓인 만큼만 세워서 연다.
   */
  window.__setup = function (o) {
    o = o || {};
    if (o.team && STADIUMS[o.team]) {
      var sel = document.getElementById("stadium");
      if (sel) sel.value = o.team;
      initStadium(o.team);
    }
    if (o.pct != null) applyCount(Math.round(TOTAL * o.pct));
    if (ghostMesh) ghostMesh.visible = o.ghost !== false;
    // 전광판은 레벨 6 보상이다 (lib/constants/stadium-levels.ts) — 그 전엔 없다.
    // 시안은 시공률과 무관하게 항상 띄워 레벨 사다리를 스스로 무의미하게 만들었다.
    if (o.level != null) screenGroup.visible = o.level >= 6;
    if (o.bricks != null) setScreenBricks(o.bricks);
    applyCamera();
    // 루프가 멈춰 있으면 되살린다 — 지면이 언마운트에서 세우고 다시 들어오는 경우
    // (개발 모드 StrictMode 의 이중 마운트 포함) 화면이 멈춘 채 남는 걸 막는다.
    if (!rafId) tick();
    return { total: TOTAL, built: builtCount };
  };

  /** 청사진(미시공 블록) 켜고 끄기 — 경기장 화면 전용 토글 (운영자 요청) */
  window.__toggleGhost = function () {
    if (!ghostMesh) return false;
    ghostMesh.visible = !ghostMesh.visible;
    return ghostMesh.visible;
  };

  initStadium("emirates");
  applyCamera();
  tick();
})();
