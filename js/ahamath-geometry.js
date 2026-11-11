/* =============================================================================
   아하! 수학 — 기본 도형과 작도 단원 전용 시각 자료      js/ahamath-geometry.js
   -----------------------------------------------------------------------------
   css/ahamath.css 와 js/ahamath.js 는 건드리지 않습니다.
   이 단원(기본 도형과 작도)의 학습 페이지에서만 ahamath.js 뒤에 한 줄 더 부릅니다.

     <script src="../../../../js/ahamath.js"></script>
     <script src="../../../../js/ahamath-geometry.js"></script>
     <script> AhaMath.start({ ... }); </script>

   담고 있는 시각 자료 2종
     geo    점 · 선 · 각 · 원을 좌표로 그리고 한 단계씩 나타내기 (작도 애니메이션 포함)
     dense  점이 모여 선이 되고, 선이 모여 면이 되는 모습

   본문 표기 (따로 감쌀 필요 없이 자동으로 바뀝니다. 문항 안에서도 똑같이 됩니다)
     ‾AB  → 선분 AB 기호        →AB → 반직선 AB 기호        ↔AB → 직선 AB 기호
     l, m, ∠a, ∠x 처럼 홀로 쓴 영어 소문자는 기울인 글꼴로 바뀝니다. (cm · km 같은 단위는 그대로)
     분수는 class="fx" 를 붙이고 1/2 처럼 적습니다. 문항 안에서는 AhaGeometry.fracText('1/2')

   ─ geo 쓰는 법 ─────────────────────────────────────────────────────────────
     <div data-vis="geo" data-view="360 200"
          data-pts="A=40,150; B=300,150; M=mid A B"
          data-base="seg A B; pt A b; pt B b"
          data-steps="pt.hl M t; tick A M; tick M B | text 180,40 ‾AM = ‾MB"
          data-caption="그림 아래에 마지막으로 나타나는 한 줄"></div>

     data-view   그림의 가로 세로 (기본 360 220). 좌표는 왼쪽 위가 (0, 0) 이고 아래로 갈수록 y 가 커집니다
     data-pts    점 정하기. ; 로 나눕니다
                   A=40,150            좌표
                   M=mid A B           두 점의 가운데
                   P=on A B 0.3        A 에서 B 쪽으로 30% 간 점 (음수 · 1보다 큰 수도 됩니다)
                   H=foot P A B        점 P 에서 직선 AB 에 내린 수선의 발
                   C=polar O 80 60     O 에서 60° 방향(시계 반대 방향, 오른쪽이 0°)으로 80 만큼 간 점
                   D=toward A B 50     A 에서 B 쪽으로 50 만큼 간 점 (길이 대신 A-B 처럼 두 점 사이 거리도 됩니다)
                   E=rot O A 90        점 A 를 O 중심으로 90° 돌린 점
                   F=cc A 80 B 60 up   A 중심 반지름 80 원과 B 중심 반지름 60 원의 교점 (up · down · left · right 로 고름)
                   G=ll A B C D        직선 AB 와 직선 CD 의 교점
                   K=shift A 10,-20    A 를 (10, -20) 만큼 옮긴 점
     data-base   처음부터 보이는 그림
     data-steps  한 단계씩 나타나는 그림. 단계는 | 로, 한 단계 안의 그림은 ; 로 나눕니다
     data-gap    단계 사이 시간(ms, 기본 900)
     data-step-caps  단계마다 바뀌는 그림 아래 문구. | 로 나누고, 앞에 hl: c2: c3: c4: 를 붙이면 그 색으로 써요
                   예) data-step-caps="hl:모서리 AB | c3:초록 : 만나는 모서리 | c2:주황 : 꼬인 위치"
     data-instant="1"  움직이지 않고 처음부터 다 보이기 (문항 안의 그림에 씁니다)

     그리기 명령 (점 자리에는 A 같은 이름이나 120,40 같은 좌표를 씁니다)
       pt A [위치] [이름표]   점과 이름표. 위치 t b l r tl tr bl br (기본 b), n 이면 이름표 없음
       lab A 위치 글자        점 옆에 글자만
       text 120,40 글자       아무 곳에 글자 (나머지를 모두 글자로 씁니다)
       seg A B                선분            line A B [늘일 길이]   직선 (기본: 그림 끝까지)
       ray A B [늘일 길이]    반직선          curve A B 휘는 정도    굽은 선
       arc O 반지름 시작각 끝각   컴퍼스로 그린 원의 일부     circle O 반지름   원
       ang A O B [글자] [반지름]   ∠AOB 표시 (작은 쪽 각)      right A O B   직각 표시
       tick A B [개수]        같은 길이 표시   poly A B C …   다각형(면)   grid 0,0 360,200 20   모눈
       slide A O B T          ∠AOB 를 꼭짓점 T 까지 밀어 옮기기
       spin A O B C 각도      ∠AOB 를 점 C 를 중심으로 돌리기
       glide 40,0 A B C       삼각형 ABC 를 (40, 0) 만큼 밀어 옮기기
       clear                  앞 단계 그림을 흐리게
     모양 꼬리표 : 명령 뒤에 .꼬리표 를 붙입니다.  예) seg.hl.dash A B
       hl 파랑  c2 주황  c3 초록  c4 분홍  gray 회색  faint 연회색
       dash 점선  thin 가는 선  bold 굵은 선  arr 화살촉  fill 각 안 색칠  dbl 두 겹 각 표시
       plane 평면(연두)  sm 작은 글자
   ============================================================================= */
(function (global) {
    'use strict';

    const A = global.AhaMath;
    if (!A) { return; }

    const SVG_NS = 'http://www.w3.org/2000/svg';

    /* =========================================================================
       1. 스타일 (한 번만 심습니다)
       ========================================================================= */
    const CSS = [
        /* ---------- 분수 ---------- */
        '.frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;',
        '    line-height:1.15;margin:0 .12em;font-size:.82em}',
        '.frac>i{font-style:normal;padding:0 .3em}',
        '.frac>i:last-of-type{border-top:2px solid currentColor}',

        /* ---------- 문자(소문자) : 기울인 글꼴 ---------- */
        '.v{font-style:italic;font-family:"Times New Roman",Times,serif;font-size:1.12em;line-height:1;',
        '    padding:0 .03em}',

        /* ---------- 선분 · 반직선 · 직선 기호 ---------- */
        /* 윗줄은 배경 그라데이션이 아니라 테두리로 그려요 : 브라우저 강제 다크 모드에서도 글자색을 따라가요 */
        '.gn{display:inline-block;position:relative;margin:.12em .1em 0;padding-top:.22em;line-height:1;',
        '    border-top:1.5px solid}',
        '.gn-ray::after,.gn-lin::after{content:"";position:absolute;right:-.12em;top:calc(-.17em - 1px);',
        '    border-left:.36em solid;border-top:.17em solid transparent;border-bottom:.17em solid transparent}',
        '.gn-lin::before{content:"";position:absolute;left:-.12em;top:calc(-.17em - 1px);',
        '    border-right:.36em solid;border-top:.17em solid transparent;border-bottom:.17em solid transparent}',

        /* ---------- geo ---------- */
        '.geo{width:100%;margin:0 auto}',
        '.geo svg{width:100%;height:auto;display:block;overflow:hidden;color:#334155;font-family:inherit}',
        '.geo text{font-family:inherit}',
        '.geo .g-ln{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
        '.geo .g-ar{fill:none;stroke:currentColor;stroke-width:1.5}',
        '.geo .g-an{fill:none;stroke:currentColor;stroke-width:1.6}',
        '.geo .g-sec{stroke:none;fill:currentColor;fill-opacity:.2}',
        '.geo .g-pt{fill:currentColor}',
        '.geo .g-tx{fill:currentColor;font-size:14px;font-weight:700;text-anchor:middle}',
        '.geo .g-tx.g-sm{font-size:11.5px;font-weight:600}',
        '.geo .g-poly{fill:currentColor;fill-opacity:.1;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round}',
        '.geo .g-grid{fill:none;stroke:#e2e8f0;stroke-width:1}',
        '.geo .g-hl{color:#2563eb}.geo .g-c2{color:#ea580c}.geo .g-c3{color:#16a34a}.geo .g-c4{color:#db2777}',
        '.geo .g-gray{color:#94a3b8}.geo .g-faint{color:#cbd5e1}',
        '.geo .g-plane{color:#65a30d;fill-opacity:.12;stroke-width:1.2}',
        '.geo .g-dash{stroke-dasharray:5 5}',
        '.geo .g-thin{stroke-width:1.3}',
        '.geo .g-bold{stroke-width:3.4}',

        /* 단계별로 나타나기 : 선은 그려지고(gd) 나머지는 서서히(gf) */
        '.geo .gs{transition:opacity .5s ease}',
        '.geo .gs.dim{opacity:.2}',
        '.geo .gs .gd{stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset .85s ease}',
        '.geo .gs.on .gd{stroke-dashoffset:0}',
        '.geo .gs .gf{opacity:0;transition:opacity .45s ease}',
        '.geo .gs.on .gf{opacity:1}',
        /* 움직이는 조각(slide · spin · glide)의 이동은 JS(requestAnimationFrame)가 transform 속성으로 그려요 */
        '.geo.g-instant *{transition:none !important}',
        '.geo .g-cap{text-align:center;font-weight:700;margin:.6rem 0 0;opacity:0;transition:opacity .4s ease}',
        '.geo .g-cap.on{opacity:1}',
        '.geo .g-err{color:#b91c1c;font-size:.85rem;margin:0}'
    ].join('\n');

    if (!document.getElementById('ahamath-geometry-style')) {
        const tag = document.createElement('style');
        tag.id = 'ahamath-geometry-style';
        tag.textContent = CSS;
        document.head.appendChild(tag);
    }

    /* =========================================================================
       2. 분수 표기 (페이지에서도 씁니다 : AhaGeometry.fracText)
       ========================================================================= */
    function fracHtml(num, den) {
        return '<span class="frac"><i>' + num + '</i><i>' + den + '</i></span>';
    }

    function fracText(s) {
        return String(s).replace(/(\d+)\/(\d+)/g, function (m, n, d) { return fracHtml(n, d); });
    }

    /* =========================================================================
       3. 좌표 계산 (registerVis 괄호 바깥에 둡니다)
       ========================================================================= */
    function pt(x, y) { return { x: x, y: y }; }
    function add(a, b) { return pt(a.x + b.x, a.y + b.y); }
    function sub(a, b) { return pt(a.x - b.x, a.y - b.y); }
    function mul(a, k) { return pt(a.x * k, a.y * k); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function unit(a) { const l = Math.hypot(a.x, a.y) || 1; return pt(a.x / l, a.y / l); }
    function normal(a) { return pt(-a.y, a.x); }
    function rad(deg) { return deg * Math.PI / 180; }

    /* 화면에서 시계 반대 방향을 + 로 잽니다 (오른쪽이 0°, 위쪽이 90°) */
    function polarPt(c, r, deg) { return pt(c.x + r * Math.cos(rad(deg)), c.y - r * Math.sin(rad(deg))); }
    function angleAt(c, p) { return Math.atan2(c.y - p.y, p.x - c.x) * 180 / Math.PI; }

    function rotatePt(c, p, deg) {
        const d = sub(p, c);
        const t = rad(deg);
        return pt(c.x + d.x * Math.cos(t) + d.y * Math.sin(t), c.y - d.x * Math.sin(t) + d.y * Math.cos(t));
    }

    function footPt(p, a, b) {
        const d = sub(b, a);
        const t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / (d.x * d.x + d.y * d.y);
        return add(a, mul(d, t));
    }

    function lineCross(a, b, c, d) {
        const r = sub(b, a);
        const s = sub(d, c);
        const den = r.x * s.y - r.y * s.x;
        if (Math.abs(den) < 1e-9) { throw new Error('평행한 두 직선은 만나지 않아요'); }
        const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
        return add(a, mul(r, t));
    }

    function circleCross(a, r1, b, r2, pick) {
        const d = dist(a, b);
        if (d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6) { throw new Error('두 원이 만나지 않아요'); }
        const along = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, r1 * r1 - along * along));
        const u = unit(sub(b, a));
        const base = add(a, mul(u, along));
        const p1 = add(base, mul(normal(u), h));
        const p2 = sub(base, mul(normal(u), h));
        if (pick === 'down') { return p1.y > p2.y ? p1 : p2; }
        if (pick === 'left') { return p1.x < p2.x ? p1 : p2; }
        if (pick === 'right') { return p1.x > p2.x ? p1 : p2; }
        return p1.y < p2.y ? p1 : p2;
    }

    /* =========================================================================
       4. geo : 글로 적은 그림을 SVG 로
       ========================================================================= */
    function fmt(v) { return Math.round(v * 10) / 10; }
    function xy(p) { return fmt(p.x) + ',' + fmt(p.y); }
    function splitBy(s, sep) {
        return String(s || '').split(sep).map(function (t) { return t.trim(); }).filter(function (t) { return t.length; });
    }

    function parseXY(tok) {
        const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(tok);
        return m ? pt(+m[1], +m[2]) : null;
    }

    function pointOf(tok, pts) {
        const p = parseXY(tok) || pts[tok];
        if (!p) { throw new Error('점 ' + tok + ' 이(가) 없어요'); }
        return p;
    }

    function lengthOf(tok, pts) {
        if (/^-?[\d.]+$/.test(tok)) { return +tok; }
        const k = tok.split('-');
        return dist(pointOf(k[0], pts), pointOf(k[1], pts));
    }

    function definePoints(spec) {
        const pts = {};
        splitBy(spec, ';').forEach(function (def) {
            const eq = def.indexOf('=');
            if (eq < 0) { return; }
            const name = def.slice(0, eq).trim();
            const t = def.slice(eq + 1).trim().split(/\s+/);
            const p = function (i) { return pointOf(t[i], pts); };
            const at = parseXY(t[0]);
            if (at) { pts[name] = at; return; }
            if (t[0] === 'mid') { pts[name] = mul(add(p(1), p(2)), 0.5); return; }
            if (t[0] === 'on') { pts[name] = add(p(1), mul(sub(p(2), p(1)), +t[3])); return; }
            if (t[0] === 'foot') { pts[name] = footPt(p(1), p(2), p(3)); return; }
            if (t[0] === 'polar') { pts[name] = polarPt(p(1), lengthOf(t[2], pts), +t[3]); return; }
            if (t[0] === 'toward') { pts[name] = add(p(1), mul(unit(sub(p(2), p(1))), lengthOf(t[3], pts))); return; }
            if (t[0] === 'rot') { pts[name] = rotatePt(p(1), p(2), +t[3]); return; }
            if (t[0] === 'cc') { pts[name] = circleCross(p(1), lengthOf(t[2], pts), p(3), lengthOf(t[4], pts), t[5]); return; }
            if (t[0] === 'll') { pts[name] = lineCross(p(1), p(2), p(3), p(4)); return; }
            if (t[0] === 'shift') { pts[name] = add(p(1), parseXY(t[2])); return; }
            throw new Error('점을 정하는 방법 ' + t[0] + ' 을(를) 모르겠어요');
        });
        return pts;
    }

    /* 이름표 위치 : [x 이동, y 이동, 글자 맞춤] */
    const LABEL_AT = {
        t: [0, -9, 'middle'], b: [0, 19, 'middle'], l: [-9, 5, 'end'], r: [9, 5, 'start'],
        tl: [-7, -6, 'end'], tr: [7, -6, 'start'], bl: [-7, 17, 'end'], br: [7, 17, 'start']
    };

    function cls(base, styles, motion) {
        return base + (styles.length ? ' ' + styles.map(function (s) { return 'g-' + s; }).join(' ') : '') + ' ' + motion;
    }

    /* 선 : 점선이면 서서히, 아니면 그려지듯 */
    function pathTag(d, base, styles) {
        const dashed = styles.indexOf('dash') > -1;
        return '<path d="' + d + '" class="' + cls(base, styles, dashed ? 'gf' : 'gd') + '"' +
            (dashed ? '' : ' pathLength="1"') + '/>';
    }

    function textTag(p, text, anchor, styles) {
        return '<text x="' + fmt(p.x) + '" y="' + fmt(p.y) + '" class="' + cls('g-tx', styles, 'gf') + '"' +
            (anchor && anchor !== 'middle' ? ' style="text-anchor:' + anchor + '"' : '') + '>' + text + '</text>';
    }

    function arrowTag(tip, dir, styles) {
        const u = unit(dir);
        const n = normal(u);
        const s = 9;
        const back = sub(tip, mul(u, s));
        return '<polygon points="' + xy(tip) + ' ' + xy(add(back, mul(n, s * 0.5))) + ' ' +
            xy(sub(back, mul(n, s * 0.5))) + '" class="' + cls('g-pt', styles, 'gf') + '"/>';
    }

    function arcPath(c, r, a1, a2) {
        const s = polarPt(c, r, a1);
        const e = polarPt(c, r, a2);
        const large = Math.abs(a2 - a1) > 180 ? 1 : 0;
        const sweep = a2 > a1 ? 0 : 1;
        return 'M' + xy(s) + ' A' + fmt(r) + ',' + fmt(r) + ' 0 ' + large + ',' + sweep + ' ' + xy(e);
    }

    /* ∠AOB 의 작은 쪽 각 : 시작각과 끝각 */
    function angleSpan(a, o, b) {
        let s = angleAt(o, a);
        let e = angleAt(o, b);
        let diff = e - s;
        while (diff > 180) { diff -= 360; }
        while (diff < -180) { diff += 360; }
        return { from: s, to: s + diff, mid: s + diff / 2 };
    }

    function wedgeTags(a, o, b, r, styles) {
        const span = angleSpan(a, o, b);
        const arc = arcPath(o, r, span.from, span.to);
        return '<path d="M' + xy(o) + ' L' + arc.slice(1) + ' Z" class="' + cls('g-sec', styles, '') + '"/>' +
            '<path d="' + arc + '" class="' + cls('g-an', styles, '') + '"/>';
    }

    const FAR = 1200;

    function drawItem(item, pts, moves) {
        const tok = item.split(/\s+/);
        const head = tok[0].split('.');
        const cmd = head[0];
        const styles = head.slice(1);
        const has = function (s) { return styles.indexOf(s) > -1; };
        const p = function (i) { return pointOf(tok[i], pts); };
        let out = '';

        if (cmd === 'pt' || cmd === 'lab') {
            const at = p(1);
            const pos = LABEL_AT[tok[2] || 'b'];
            if (cmd === 'pt') { out += '<circle cx="' + fmt(at.x) + '" cy="' + fmt(at.y) + '" r="3.6" class="' + cls('g-pt', styles, 'gf') + '"/>'; }
            if (pos) {
                const label = tok.length > 3 ? tok.slice(3).join(' ') : (cmd === 'pt' ? tok[1] : '');
                out += textTag(pt(at.x + pos[0], at.y + pos[1]), label, pos[2], styles);
            }
            return out;
        }

        if (cmd === 'text') { return textTag(p(1), tok.slice(2).join(' '), 'middle', styles); }

        if (cmd === 'seg') {
            out = pathTag('M' + xy(p(1)) + ' L' + xy(p(2)), 'g-ln', styles);
            if (has('arr')) { out += arrowTag(p(2), sub(p(2), p(1)), styles); }
            return out;
        }

        if (cmd === 'line' || cmd === 'ray') {
            const a = p(1);
            const b = p(2);
            const u = unit(sub(b, a));
            const ext = tok[3] ? +tok[3] : FAR;
            const end = add(b, mul(u, ext));
            const start = cmd === 'line' ? sub(a, mul(u, ext)) : a;
            out = pathTag('M' + xy(start) + ' L' + xy(end), 'g-ln', styles);
            if (has('arr')) {
                out += arrowTag(end, u, styles);
                if (cmd === 'line') { out += arrowTag(start, mul(u, -1), styles); }
            }
            return out;
        }

        if (cmd === 'curve') {
            const a = p(1);
            const b = p(2);
            const ctrl = add(mul(add(a, b), 0.5), mul(normal(unit(sub(b, a))), +tok[3] || 30));
            return pathTag('M' + xy(a) + ' Q' + xy(ctrl) + ' ' + xy(b), 'g-ln', styles);
        }

        if (cmd === 'arc') {
            return pathTag(arcPath(p(1), lengthOf(tok[2], pts), +tok[3], +tok[4]), 'g-ar',
                styles.length ? styles : ['gray']);
        }

        if (cmd === 'circle') {
            const c = p(1);
            const r = lengthOf(tok[2], pts);
            return pathTag(arcPath(c, r, 0, 180) + ' ' + arcPath(c, r, 180, 359.9).replace(/^M[^A]+/, ''),
                'g-ar', styles.length ? styles : ['gray']);
        }

        if (cmd === 'ang') {
            const a = p(1);
            const o = p(2);
            const b = p(3);
            const r = tok[5] ? +tok[5] : 22;
            const span = angleSpan(a, o, b);
            if (has('fill')) {
                out += '<path d="M' + xy(o) + ' L' + arcPath(o, r, span.from, span.to).slice(1) + ' Z" class="' +
                    cls('g-sec', styles, 'gf') + '"/>';
            }
            out += '<path d="' + arcPath(o, r, span.from, span.to) + '" class="' + cls('g-an', styles, 'gf') + '"/>';
            if (has('dbl')) {
                out += '<path d="' + arcPath(o, r + 4.5, span.from, span.to) + '" class="' + cls('g-an', styles, 'gf') + '"/>';
            }
            if (tok[4] && tok[4] !== '-') {
                const at = polarPt(o, r + 13, span.mid);
                out += textTag(pt(at.x, at.y + 5), tok[4], 'middle', styles);
            }
            return out;
        }

        if (cmd === 'right') {
            const o = p(2);
            const s = tok[4] ? +tok[4] : 10;
            const u = unit(sub(p(1), o));
            const v = unit(sub(p(3), o));
            return '<path d="M' + xy(add(o, mul(u, s))) + ' L' + xy(add(add(o, mul(u, s)), mul(v, s))) + ' L' +
                xy(add(o, mul(v, s))) + '" class="' + cls('g-an', styles, 'gf') + '"/>';
        }

        if (cmd === 'tick') {
            const a = p(1);
            const b = p(2);
            const n = tok[3] ? +tok[3] : 1;
            const u = unit(sub(b, a));
            const v = normal(u);
            const m = mul(add(a, b), 0.5);
            for (let i = 0; i < n; i++) {
                const c = add(m, mul(u, (i - (n - 1) / 2) * 4.5));
                out += '<path d="M' + xy(add(c, mul(v, 6))) + ' L' + xy(sub(c, mul(v, 6))) + '" class="' +
                    cls('g-ln g-thin', styles, 'gf') + '"/>';
            }
            return out;
        }

        if (cmd === 'poly') {
            const list = tok.slice(1).map(function (t) { return xy(pointOf(t, pts)); });
            return '<polygon points="' + list.join(' ') + '" class="' + cls('g-poly', styles, 'gf') + '"/>';
        }

        if (cmd === 'grid') {
            const a = p(1);
            const b = p(2);
            const step = +tok[3] || 20;
            let d = '';
            for (let x = a.x; x <= b.x + 0.1; x += step) { d += 'M' + fmt(x) + ',' + fmt(a.y) + ' L' + fmt(x) + ',' + fmt(b.y) + ' '; }
            for (let y = a.y; y <= b.y + 0.1; y += step) { d += 'M' + fmt(a.x) + ',' + fmt(y) + ' L' + fmt(b.x) + ',' + fmt(y) + ' '; }
            return '<path d="' + d + '" class="g-grid gf"/>';
        }

        if (cmd === 'slide' || cmd === 'spin') {
            const o = p(2);
            let move = null;
            if (cmd === 'slide') {
                const t = sub(p(4), o);
                move = { tx: t.x, ty: t.y };
            } else {
                const c = p(4);
                /* 화면의 시계 반대 방향이 + 이므로 CSS 회전은 부호를 바꿉니다 */
                move = { deg: -(+tok[5] || 180), cx: c.x, cy: c.y };
            }
            moves.push(move);
            return '<g class="' + cls('g-mv', styles.length ? styles : ['c2'], 'gf') + '" data-mv="' + (moves.length - 1) + '">' +
                wedgeTags(p(1), o, p(3), 24, ['fill']) + '</g>';
        }

        if (cmd === 'glide') {
            const t = parseXY(tok[1]);
            const id = moves.length;
            moves.push({ tx: t.x, ty: t.y });
            const list = tok.slice(2).map(function (n) { return xy(pointOf(n, pts)); });
            return '<g class="' + cls('g-mv', styles.length ? styles : ['c2'], 'gf') + '" data-mv="' + id + '">' +
                '<polygon points="' + list.join(' ') + '" class="g-poly"/></g>';
        }

        if (cmd === 'clear') { return ''; }

        throw new Error('그리기 명령 ' + cmd + ' 을(를) 모르겠어요');
    }

    function geoBuild(el) {
        try {
            const view = splitBy(el.dataset.view || '360 220', /[\s,]+/).map(Number);
            const W = view[0];
            const H = view[1];
            const pts = definePoints(el.dataset.pts);
            const moves = [];

            const group = function (spec, extra) {
                const items = splitBy(spec, ';');
                const clear = items.some(function (it) { return it === 'clear'; });
                return '<g class="gs' + (extra || '') + '"' + (clear ? ' data-clear="1"' : '') + '>' +
                    items.map(function (it) { return drawItem(it, pts, moves); }).join('') + '</g>';
            };

            let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
            if (el.dataset.base) { svg += group(el.dataset.base, ' on g-base'); }
            splitBy(el.dataset.steps, '|').forEach(function (step) { svg += group(step, ''); });
            svg += '</svg>';

            el.classList.add('geo');
            el.style.maxWidth = Math.round(W * 1.25) + 'px';
            const hasCap = el.dataset.caption || el.dataset.stepCaps;
            el.innerHTML = svg + (hasCap ? '<p class="g-cap">' + fracText(el.dataset.caption || '') + '</p>' : '');
            el._moves = moves;
            if (el.dataset.instant === '1') { geoShowAll(el); }
        } catch (err) {
            el.innerHTML = '<p class="g-err">그림을 그리지 못했어요 : ' + err.message + '</p>';
            if (global.console) { global.console.error('[geo]', err, el); }
        }
    }

    function geoStep(el, g) {
        g.classList.add('on');
        if (g.dataset.clear === '1') {
            /* 처음부터 보이던 그림(base)은 흐리게 하지 않아요 */
            let prev = g.previousElementSibling;
            while (prev) {
                if (!prev.classList.contains('g-base')) { prev.classList.add('dim'); }
                prev = prev.previousElementSibling;
            }
        }
        g.querySelectorAll('[data-mv]').forEach(function (m) {
            const move = (el._moves || [])[+m.dataset.mv];
            if (move) { setTimeout(function () { animateMove(m, move); }, A.wait(700)); }
        });
    }

    /* 움직임 한 장면 : rate 0(제자리) ~ 1(도착) */
    function moveAt(move, rate) {
        if (move.deg !== undefined) {
            return 'rotate(' + fmt(move.deg * rate) + ' ' + fmt(move.cx) + ' ' + fmt(move.cy) + ')';
        }
        return 'translate(' + fmt(move.tx * rate) + ' ' + fmt(move.ty * rate) + ')';
    }

    /* 천천히 출발해서 천천히 멈추도록(ease-in-out) 매 프레임 transform 을 바꿔요 */
    function animateMove(m, move) {
        const duration = A.wait(1800);
        if (!duration || !window.requestAnimationFrame) { m.setAttribute('transform', moveAt(move, 1)); return; }
        const ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
        let start = null;
        function frame(now) {
            if (!m.isConnected) { return; }   /* 다시 보기로 그림이 새로 그려지면 멈춰요 */
            if (start === null) { start = now; }
            const t = Math.min(1, (now - start) / duration);
            m.setAttribute('transform', moveAt(move, ease(t)));
            if (t < 1) { window.requestAnimationFrame(frame); }
        }
        window.requestAnimationFrame(frame);
    }

    /* 단계별 문구 : i 번째 단계의 문구와 색으로 바꿔요 */
    function setStepCap(el, i) {
        const cap = el.querySelector('.g-cap');
        const caps = splitBy(el.dataset.stepCaps || '', '|');
        if (!cap || !caps.length) { return; }
        const item = caps[Math.min(i, caps.length - 1)];
        const m = item.match(/^(hl|c2|c3|c4|gray):\s*/);
        cap.className = 'g-cap on' + (m ? ' g-' + m[1] : '');
        cap.innerHTML = fracText(m ? item.slice(m[0].length) : item);
    }

    function geoShowAll(el) {
        el.classList.add('g-instant');
        el.querySelectorAll('.gs').forEach(function (g) { geoStep(el, g); });
        el.querySelectorAll('[data-mv]').forEach(function (m) {
            const move = (el._moves || [])[+m.dataset.mv];
            if (move) { m.setAttribute('transform', moveAt(move, 1)); }
        });
        if (el.dataset.stepCaps) { setStepCap(el, 999); return; }
        const cap = el.querySelector('.g-cap');
        if (cap) { cap.classList.add('on'); }
    }

    function geoPlay(el) {
        if (el.dataset.instant === '1') { return; }
        const steps = el.querySelectorAll('.gs:not(.g-base)');
        const gap = +(el.dataset.gap || 900);
        steps.forEach(function (g, i) {
            setTimeout(function () {
                geoStep(el, g);
                if (el.dataset.stepCaps) { setStepCap(el, i); }
            }, A.wait(300 + gap * i));
        });
        if (el.dataset.stepCaps) { return; }
        const cap = el.querySelector('.g-cap');
        if (cap) { setTimeout(function () { cap.classList.add('on'); }, A.wait(300 + gap * steps.length + 300)); }
    }

    /* =========================================================================
       5. dense : 점 → 선 → 면
       ========================================================================= */
    function denseBuild(el) {
        const waves = [];
        /* 왼쪽 : 점이 촘촘해져 선이 돼요 */
        [7, 19, 61].forEach(function (n) {
            let s = '';
            for (let i = 0; i < n; i++) {
                s += '<circle cx="' + fmt(22 + 140 * i / (n - 1)) + '" cy="58" r="' + (n > 40 ? 2.2 : 3) + '" class="g-pt gf"/>';
            }
            waves.push(s);
        });
        waves.push('<path d="M22,58 L162,58" class="g-ln g-hl gd" pathLength="1"/>');
        /* 오른쪽 : 선이 쌓여 면이 돼요 */
        [5, 17].forEach(function (n) {
            let s = '';
            for (let i = 0; i < n; i++) {
                const y = fmt(22 + 72 * i / (n - 1));
                s += '<path d="M198,' + y + ' L338,' + y + '" class="g-ln g-thin gf"/>';
            }
            waves.push(s);
        });
        waves.push('<rect x="198" y="22" width="140" height="72" class="g-poly g-hl gf"/>');

        el.classList.add('geo');
        el.style.maxWidth = '450px';
        el.innerHTML = '<svg viewBox="0 0 360 130" xmlns="http://www.w3.org/2000/svg" role="img">' +
            waves.map(function (w) { return '<g class="gs">' + w + '</g>'; }).join('') +
            '<g class="gs"><text x="92" y="118" class="g-tx g-sm gf">점이 모이면 선</text>' +
            '<text x="268" y="118" class="g-tx g-sm gf">선이 모이면 면</text></g></svg>';
    }

    function densePlay(el) {
        el.querySelectorAll('.gs').forEach(function (g, i) {
            setTimeout(function () { g.classList.add('on'); }, A.wait(300 + 650 * i));
        });
    }

    /* =========================================================================
       6. 등록
       ========================================================================= */
    AhaMath.registerVis({
        build: function (el, type) {
            const t = type || el.dataset.vis;
            if (t === 'geo') { geoBuild(el); return; }
            if (t === 'dense') { denseBuild(el); }
        },
        play: function (el, type) {
            const t = type || el.dataset.vis;
            if (t === 'geo') { geoPlay(el); return; }
            if (t === 'dense') { densePlay(el); }
        }
    });

    /* 본문에 1/2 처럼 적어 둔 곳(class="fx")을 분수 모양으로 바꿉니다 */
    document.querySelectorAll('.fx').forEach(function (el) {
        el.innerHTML = fracText(el.innerHTML);
    });

    /* =========================================================================
       7. 기호 · 소문자 꾸미기
          ‾AB · →AB · ↔AB 를 선분 · 반직선 · 직선 기호로, 홀로 쓴 소문자를 기울인 글꼴로 바꿉니다.
          시각 자료를 다시 그리거나 문항이 바뀌어도 MutationObserver 가 다시 꾸밉니다.
       ========================================================================= */
    const MARK = /([↔→‾])([A-Z][′']?[A-Z][′']?)|(cm|mm|km|kg)|([a-z])/g;
    const MARK_CLASS = { '‾': 'gn gn-seg', '→': 'gn gn-ray', '↔': 'gn gn-lin' };

    function isLetter(ch) { return !!ch && /[A-Za-z]/.test(ch); }

    function decorate(textNode) {
        const text = textNode.nodeValue;
        const parent = textNode.parentNode;
        if (!parent || !/[a-z↔→‾]/.test(text)) { return; }
        if (parent.closest('.v, .gn, script, style, .bi')) { return; }
        const inSvg = !!parent.closest('svg');
        if (inSvg && parent.nodeName.toLowerCase() !== 'text' && parent.nodeName.toLowerCase() !== 'tspan') { return; }

        const frag = document.createDocumentFragment();
        let last = 0;
        let changed = false;
        text.replace(MARK, function (m, sym, name, unitWord, ch, at) {
            let box = null;
            if (sym && !inSvg) {
                box = document.createElement('span');
                box.className = MARK_CLASS[sym];
                box.textContent = name;
            } else if (ch && !isLetter(text.charAt(at - 1)) && !isLetter(text.charAt(at + 1))) {
                box = inSvg ? document.createElementNS(SVG_NS, 'tspan') : document.createElement('span');
                box.setAttribute('class', 'v');
                box.textContent = ch;
            }
            if (!box) { return m; }
            if (at > last) { frag.appendChild(document.createTextNode(text.slice(last, at))); }
            frag.appendChild(box);
            last = at + m.length;
            changed = true;
            return m;
        });
        if (!changed) { return; }
        if (last < text.length) { frag.appendChild(document.createTextNode(text.slice(last))); }
        parent.replaceChild(frag, textNode);
    }

    function decorateAll(root) {
        if (root.nodeType === 3) { decorate(root); return; }
        if (root.nodeType !== 1) { return; }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const list = [];
        while (walker.nextNode()) { list.push(walker.currentNode); }
        list.forEach(decorate);
    }

    const main = document.querySelector('main');
    if (main) {
        decorateAll(main);
        new MutationObserver(function (records) {
            records.forEach(function (r) {
                r.addedNodes.forEach(decorateAll);
                if (r.type === 'characterData') { decorate(r.target); }
            });
        }).observe(main, { childList: true, subtree: true, characterData: true });
    }

    global.AhaGeometry = { fracText: fracText };

})(window);
