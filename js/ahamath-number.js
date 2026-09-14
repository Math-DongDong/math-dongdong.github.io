/* =============================================================================
   아하! 수학 — 정수와 유리수 단원 전용 시각 자료      js/ahamath-number.js
   -----------------------------------------------------------------------------
   css/ahamath.css 와 js/ahamath.js 는 건드리지 않습니다.
   이 단원(정수와 유리수)의 학습 페이지에서만 ahamath.js 뒤에 한 줄 더 부릅니다.

     <script src="../../../../js/ahamath.js"></script>
     <script src="../../../../js/ahamath-number.js"></script>
     <script> AhaMath.start({ ... }); </script>

   담고 있는 시각 자료 5종
     numline  수직선 (수 찍기 · 양수음수 영역 · 절댓값 거리 · 이동 화살표 · 범위 · 대소)
     bisect   두 수 사이의 가운데를 계속 찍어 나가기
     numsets  자연수 ⊂ 정수 ⊂ 유리수 포함 그림
     chips    셈돌 (+ · −) · 쌍이 만나면 사라지기
     steps    규칙성 표 (한 줄씩 나타나기 · 일부 줄은 ? 로 두었다가 보여주기)

   분수는 <span class="frac"><i>3</i><i>4</i></span>, 부호가 있으면
   <span class="frac"><b>−</b><i>3</i><i>4</i></span> 처럼 부호를 분수 안에 넣습니다.
   스타일도 이 파일이 함께 심으므로 CSS 파일을 따로 두지 않습니다.
   ============================================================================= */
(function (global) {
    'use strict';

    const A = global.AhaMath;
    if (!A) { return; }

    /* =========================================================================
       1. 스타일 (한 번만 심습니다)
       ========================================================================= */
    const CSS = [
        '.nv{--nv-pos:#2563eb;--nv-neg:#e11d48;--nv-zero:#334155;--nv-axis:#94a3b8;',
        '    --nv-soft:#e2e8f0;--nv-ink:#1f2937;--nv-warm:#d97706;width:100%}',
        '.nv svg{width:100%;height:auto;display:block;overflow:visible}',
        '.nv-rv{opacity:0;transition:opacity .45s ease}',
        '.nv-rv.on{opacity:1}',
        '.nv-note{text-align:center;font-size:.85rem;color:#64748b;margin-top:.5rem}',

        /* ---------- 분수 표기 (카드 본문·문항에서도 씁니다) ---------- */
        /*  쓰는 법   : <span class="frac"><i>5</i><i>2</i></span>              */
        /*  부호가 있으면 <b> 로 분수 안에 : 부호가 분수선 높이에 맞춰집니다      */
        /*             <span class="frac"><b>−</b><i>3</i><i>2</i></span>       */
        '.frac{display:inline-grid;grid-template-areas:"s n" "s d";',
        '    grid-template-columns:auto auto;align-items:center;',
        '    vertical-align:middle;margin:0 .14em;font-size:.9em;line-height:1.1}',
        '.frac>b{grid-area:s;font-weight:inherit;padding-right:.1em;justify-self:center}',
        '.frac>i{font-style:normal;text-align:center}',
        '.frac>i:first-of-type{grid-area:n;border-bottom:1.5px solid currentColor;padding:0 .2em .05em}',
        '.frac>i:last-of-type{grid-area:d;padding:.05em .2em 0}',

        /* ---------- 수직선 ---------- */
        '.nl-axis{stroke:var(--nv-axis);stroke-width:2}',
        '.nl-head{fill:var(--nv-axis)}',
        '.nl-tick{stroke:var(--nv-axis);stroke-width:1.6}',
        '.nl-tick.sub{stroke:var(--nv-soft);stroke-width:1.2}',
        '.nl-tick.zero{stroke:var(--nv-zero);stroke-width:2.6}',
        '.nl-tlabel{fill:#64748b;font-size:12.5px;text-anchor:middle;font-weight:600}',
        '.nl-tlabel.zero{fill:var(--nv-zero);font-size:14px;font-weight:800}',
        '.nl-mlabel{font-size:14.5px;font-weight:800;text-anchor:middle}',
        '.nl-mlabel.pos{fill:var(--nv-pos)}.nl-mlabel.neg{fill:var(--nv-neg)}.nl-mlabel.zero{fill:var(--nv-zero)}',
        '.nl-fline{stroke-width:1.5}',
        '.nl-fline.pos{stroke:var(--nv-pos)}.nl-fline.neg{stroke:var(--nv-neg)}.nl-fline.zero{stroke:var(--nv-zero)}',
        '.nl-dot.pos{fill:var(--nv-pos);stroke:#fff;stroke-width:2}',
        '.nl-dot.neg{fill:var(--nv-neg);stroke:#fff;stroke-width:2}',
        '.nl-dot.zero{fill:var(--nv-zero);stroke:#fff;stroke-width:2}',
        '.nl-zone{stroke-width:2.4;fill:none}',
        '.nl-zone.pos{stroke:var(--nv-pos)}.nl-zone.neg{stroke:var(--nv-neg)}',
        '.nl-zhead.pos{fill:var(--nv-pos)}.nl-zhead.neg{fill:var(--nv-neg)}',
        '.nl-zlabel{font-size:13.5px;font-weight:800;text-anchor:middle}',
        '.nl-zlabel.pos{fill:var(--nv-pos)}.nl-zlabel.neg{fill:var(--nv-neg)}',
        '.nl-origin{font-size:12.5px;font-weight:700;fill:var(--nv-zero);text-anchor:middle}',
        '.nl-guide{stroke:var(--nv-axis);stroke-width:1.2;stroke-dasharray:3 3}',
        '.nl-abs{stroke-width:2.4;fill:none}',
        '.nl-abs.pos{stroke:var(--nv-pos)}.nl-abs.neg{stroke:var(--nv-neg)}',
        '.nl-abslabel{font-size:13px;font-weight:800;text-anchor:middle}',
        '.nl-abslabel.pos{fill:var(--nv-pos)}.nl-abslabel.neg{fill:var(--nv-neg)}',
        '.nl-jump{fill:none;stroke-width:2.6}',
        '.nl-jump.pos{stroke:var(--nv-pos)}.nl-jump.neg{stroke:var(--nv-neg)}',
        '.nl-jhead.pos{fill:var(--nv-pos)}.nl-jhead.neg{fill:var(--nv-neg)}',
        '.nl-jlabel{font-size:13.5px;font-weight:800;text-anchor:middle}',
        '.nl-jlabel.pos{fill:var(--nv-pos)}.nl-jlabel.neg{fill:var(--nv-neg)}',
        '.nl-range{stroke:var(--nv-warm);stroke-width:7;stroke-linecap:round;opacity:.35}',
        '.nl-end{stroke:var(--nv-warm);stroke-width:2.5}',
        '.nl-end.closed{fill:var(--nv-warm)}.nl-end.open{fill:#fff}',
        '.nl-cmp{stroke:var(--nv-axis);stroke-width:2}',
        '.nl-cmphead{fill:var(--nv-axis)}',
        '.nl-cmplabel{font-size:13px;font-weight:800;text-anchor:middle;fill:#475569}',

        /* ---------- 수의 포함 관계 ---------- */
        '.nv-sets{display:block}',
        '.ns-box{border-radius:16px;padding:.7rem .8rem 0.8rem;border:2px solid;position:relative}',
        '.ns-rat{border-color:#a5b4fc;background:#eef2ff}',
        '.ns-int{border-color:#7dd3fc;background:#e0f2fe;margin-top:.45rem}',
        '.ns-nat{border-color:#86efac;background:#dcfce7;margin-top:.45rem}',
        '.ns-name{font-weight:800;font-size:.92rem;margin-bottom:.35rem}',
        '.ns-rat>.ns-name{color:#4338ca}.ns-int>.ns-name{color:#0369a1}.ns-nat>.ns-name{color:#15803d}',
        '.ns-nums{font-size:.95rem;font-weight:700;color:#1f2937;letter-spacing:.02em}',

        /* ---------- 셈돌 ---------- */
        '.nv-chips{display:block}',
        '.ch-row{display:flex;flex-wrap:wrap;gap:.35rem;justify-content:center;align-items:center}',
        '.ch{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
        '    font-weight:800;font-size:1.05rem;color:#fff;transition:opacity .5s ease,transform .5s ease}',
        '.ch.p{background:var(--nv-pos)}.ch.m{background:var(--nv-neg)}',
        '.ch.gone{opacity:.18;transform:scale(.72)}',
        '.ch-gap{width:12px}',
        '.ch-result{text-align:center;font-weight:800;margin-top:.6rem;color:var(--nv-ink);',
        '    opacity:0;transition:opacity .5s ease}',
        '.ch-result.on{opacity:1}',

        /* ---------- 규칙성 표 ---------- */
        '.nv-steps{display:block}',
        '.st-row{display:flex;justify-content:center;align-items:center;gap:.4rem;padding:.28rem 0;',
        '    font-weight:700;font-size:1rem;color:var(--nv-ink);opacity:0;transition:opacity .4s ease}',
        '.st-row.on{opacity:1}',
        '.st-l{min-width:130px;text-align:right}',
        '.st-eq{color:#94a3b8}',
        '.st-r{min-width:64px;text-align:left;font-weight:800}',
        '.st-r.ask{color:var(--nv-warm)}',
        '.st-row.hi{background:#fff7ed;border-radius:10px}'
    ].join('\n');

    if (!document.getElementById('ahamath-number-style')) {
        const tag = document.createElement('style');
        tag.id = 'ahamath-number-style';
        tag.textContent = CSS;
        document.head.appendChild(tag);
    }

    /* =========================================================================
       2. 작은 도우미 (registerVis 괄호 바깥에 둡니다)
       ========================================================================= */
    function nvNum(v, d) {
        if (v === undefined || v === null || String(v).trim() === '') { return d; }
        const n = Number(String(v).replace(/[\u2212\u2013\u2014]/g, '-').trim());
        return isNaN(n) ? d : n;
    }

    function nvList(s) {
        if (!s) { return []; }
        return String(s).split(',')
            .map(function (t) { return nvNum(t, NaN); })
            .filter(function (n) { return !isNaN(n); });
    }

    function nvFmt(v) { return String(Math.round(v * 1000) / 1000); }

    function nvSigned(v) {
        if (v === 0) { return '0'; }
        return (v > 0 ? '+' : '\u2212') + nvFmt(Math.abs(v));
    }

    /* data-plain="1" 일 때 쓰는 표기. 양수의 + 는 떼고, 음수 기호는 − 로 */
    function nvPlain(v) {
        return (v < 0 ? '\u2212' + nvFmt(-v) : nvFmt(v));
    }

    function nvSign(v) { return v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero'); }

    function nvTri(cx, cy, dir, size) {   // dir: 'up' 'down' 'left' 'right'
        const s = size || 6;
        if (dir === 'right') { return (cx) + ',' + cy + ' ' + (cx - s * 1.7) + ',' + (cy - s) + ' ' + (cx - s * 1.7) + ',' + (cy + s); }
        if (dir === 'left') { return (cx) + ',' + cy + ' ' + (cx + s * 1.7) + ',' + (cy - s) + ' ' + (cx + s * 1.7) + ',' + (cy + s); }
        if (dir === 'down') { return (cx) + ',' + cy + ' ' + (cx - s) + ',' + (cy - s * 1.7) + ' ' + (cx + s) + ',' + (cy - s * 1.7); }
        return (cx) + ',' + cy + ' ' + (cx - s) + ',' + (cy + s * 1.7) + ' ' + (cx + s) + ',' + (cy + s * 1.7);
    }

    /* 수직선 위의 이름표. '3/4' 처럼 적으면 진짜 분수 모양으로 그려요 */
    function nvLabel(x, axisY, text, tone) {
        const m = /^([+\u2212-]?)\s*(\d+)\s*\/\s*(\d+)$/.exec(String(text).trim());
        if (!m) {
            return '<text class="nl-mlabel ' + tone + '" x="' + x + '" y="' + (axisY - 14) + '">' + text + '</text>';
        }
        const sign = m[1] ? (m[1] === '-' ? '\u2212' : m[1]) : '';
        const num = m[2];
        const den = m[3];
        const w = Math.max(num.length, den.length) * 8 + 5;
        const baseY = axisY - 13;                 // 분모 글자의 기준선
        const barY = baseY - 10.5;                // 분수선 높이
        const cx = sign ? x + 5 : x;              // 부호가 있으면 분수를 살짝 오른쪽으로
        let s = '<g class="nl-mlabel ' + tone + '">';
        if (sign) {
            /* 부호 글자의 가운데가 분수선에 오도록 기준선을 내려 잡습니다 */
            s += '<text x="' + (cx - w / 2 - 3) + '" y="' + (barY + 3.6) +
                '" font-size="13" text-anchor="end">' + sign + '</text>';
        }
        s += '<text x="' + cx + '" y="' + (baseY - 14) + '" font-size="12.5">' + num + '</text>';
        s += '<line class="nl-fline ' + tone + '" x1="' + (cx - w / 2) + '" y1="' + barY +
            '" x2="' + (cx + w / 2) + '" y2="' + barY + '"/>';
        s += '<text x="' + cx + '" y="' + baseY + '" font-size="12.5">' + den + '</text>';
        return s + '</g>';
    }

    /* ---------- 수직선 그리기 ---------- */
    function nlBuild(el) {
        const min = nvNum(el.dataset.min, -5);
        const max = nvNum(el.dataset.max, 5);
        const tickStep = nvNum(el.dataset.tickstep, 1);
        const sub = nvNum(el.dataset.sub, 0);
        const plain = el.dataset.plain === '1';

        const marks = nvList(el.dataset.marks);
        const markLabels = (el.dataset.marklabels || '').split(',').map(function (s) { return s.trim(); });
        const absList = nvList(el.dataset.abs);
        const jumps = nvList(el.dataset.jump);
        const range = nvList(el.dataset.range);
        const closedRaw = (el.dataset.closed || '1,1').split(',');
        const zones = el.dataset.zones === '1';
        const compare = el.dataset.compare === '1';

        let H = 96;
        if (zones || compare) { H = 120; }
        if (absList.length) { H = 128; }
        if (jumps.length) { H = 146; }
        H = nvNum(el.dataset.h, H);

        const W = 640;
        const PAD = 36;
        const axisY = H - 34;
        const span = (max - min) || 1;
        const X = function (v) { return PAD + (v - min) / span * (W - PAD * 2); };

        const out = [];

        /* 보조 눈금 (등분) */
        const n = Math.max(1, Math.round((max - min) / tickStep));
        if (sub > 1) {
            for (let i = 0; i < n; i++) {
                for (let k = 1; k < sub; k++) {
                    const x = X(min + tickStep * (i + k / sub));
                    out.push('<line class="nl-tick sub" x1="' + x + '" y1="' + (axisY - 5) +
                        '" x2="' + x + '" y2="' + (axisY + 5) + '"/>');
                }
            }
        }

        /* 축 */
        out.push('<line class="nl-axis" x1="12" y1="' + axisY + '" x2="' + (W - 12) + '" y2="' + axisY + '"/>');
        out.push('<polygon class="nl-head" points="' + nvTri(W - 6, axisY, 'right', 5.5) + '"/>');
        out.push('<polygon class="nl-head" points="' + nvTri(6, axisY, 'left', 5.5) + '"/>');

        /* 눈금과 눈금 이름 */
        for (let i = 0; i <= n; i++) {
            const v = min + i * tickStep;
            const x = X(v);
            const isZero = Math.abs(v) < 1e-9;
            out.push('<line class="nl-tick' + (isZero ? ' zero' : '') + '" x1="' + x + '" y1="' + (axisY - 7) +
                '" x2="' + x + '" y2="' + (axisY + 7) + '"/>');
            const label = isZero ? '0' : (plain ? nvPlain(v) : nvSigned(v));
            out.push('<text class="nl-tlabel' + (isZero ? ' zero' : '') + '" x="' + x + '" y="' +
                (axisY + 25) + '">' + label + '</text>');
        }

        /* 양수 · 음수 영역 */
        if (zones) {
            const zy = axisY - 32;
            const x0 = X(0);
            out.push('<g class="nv-rv"><text class="nl-origin" x="' + x0 + '" y="' + (axisY - 13) + '">원점</text></g>');
            out.push('<g class="nv-rv">' +
                '<line class="nl-zone pos" x1="' + (x0 + 4) + '" y1="' + zy + '" x2="' + (W - 30) + '" y2="' + zy + '"/>' +
                '<polygon class="nl-zhead pos" points="' + nvTri(W - 18, zy, 'right', 5.5) + '"/>' +
                '<text class="nl-zlabel pos" x="' + ((x0 + W) / 2) + '" y="' + (zy - 9) + '">양수</text></g>');
            out.push('<g class="nv-rv">' +
                '<line class="nl-zone neg" x1="' + (x0 - 4) + '" y1="' + zy + '" x2="30" y2="' + zy + '"/>' +
                '<polygon class="nl-zhead neg" points="' + nvTri(18, zy, 'left', 5.5) + '"/>' +
                '<text class="nl-zlabel neg" x="' + (x0 / 2) + '" y="' + (zy - 9) + '">음수</text></g>');
        }

        /* 커지는 쪽 · 작아지는 쪽 */
        if (compare) {
            const cy = axisY - 32;
            out.push('<g class="nv-rv">' +
                '<line class="nl-cmp" x1="' + (W / 2 + 14) + '" y1="' + cy + '" x2="' + (W - 30) + '" y2="' + cy + '"/>' +
                '<polygon class="nl-cmphead" points="' + nvTri(W - 18, cy, 'right', 5.5) + '"/>' +
                '<text class="nl-cmplabel" x="' + (W - 96) + '" y="' + (cy - 9) + '">커져요</text></g>');
            out.push('<g class="nv-rv">' +
                '<line class="nl-cmp" x1="' + (W / 2 - 14) + '" y1="' + cy + '" x2="30" y2="' + cy + '"/>' +
                '<polygon class="nl-cmphead" points="' + nvTri(18, cy, 'left', 5.5) + '"/>' +
                '<text class="nl-cmplabel" x="96" y="' + (cy - 9) + '">작아져요</text></g>');
        }

        /* 범위 색칠 */
        if (range.length === 2) {
            const xa = X(range[0]);
            const xb = X(range[1]);
            const ca = String(closedRaw[0] || '1').trim() === '1';
            const cb = String(closedRaw[1] || '1').trim() === '1';
            out.push('<g class="nv-rv">' +
                '<line class="nl-range" x1="' + xa + '" y1="' + axisY + '" x2="' + xb + '" y2="' + axisY + '"/>' +
                '<circle class="nl-end ' + (ca ? 'closed' : 'open') + '" cx="' + xa + '" cy="' + axisY + '" r="6.5"/>' +
                '<circle class="nl-end ' + (cb ? 'closed' : 'open') + '" cx="' + xb + '" cy="' + axisY + '" r="6.5"/>' +
                '</g>');
        }

        /* 점 찍기 */
        marks.forEach(function (v, i) {
            const x = X(v);
            const cls = nvSign(v);
            const label = markLabels[i] ? markLabels[i] : (plain ? nvPlain(v) : nvSigned(v));
            out.push('<g class="nv-rv">' +
                '<circle class="nl-dot ' + cls + '" cx="' + x + '" cy="' + axisY + '" r="6.5"/>' +
                nvLabel(x, axisY, label, cls) + '</g>');
        });

        /* 원점에서의 거리 (절댓값) */
        const level = { pos: 0, neg: 0 };
        absList.forEach(function (v) {
            const side = v < 0 ? 'neg' : 'pos';
            const k = level[side]++;
            const ay = axisY - 30 - k * 20;
            const x = X(v);
            const x0 = X(0);
            const mid = (x + x0) / 2;
            const dir = v < 0 ? 'left' : 'right';
            out.push('<g class="nv-rv">' +
                '<circle class="nl-dot ' + side + '" cx="' + x + '" cy="' + axisY + '" r="6.5"/>' +
                '<line class="nl-guide" x1="' + x + '" y1="' + (axisY - 6) + '" x2="' + x + '" y2="' + ay + '"/>' +
                '<line class="nl-guide" x1="' + x0 + '" y1="' + (axisY - 6) + '" x2="' + x0 + '" y2="' + ay + '"/>' +
                '<line class="nl-abs ' + side + '" x1="' + x0 + '" y1="' + ay + '" x2="' + x + '" y2="' + ay + '"/>' +
                '<polygon class="nl-zhead ' + side + '" points="' + nvTri(x, ay, dir, 5) + '"/>' +
                '<text class="nl-abslabel ' + side + '" x="' + mid + '" y="' + (ay - 8) + '">거리 ' +
                nvFmt(Math.abs(v)) + '</text></g>');
        });

        /* 이동 화살표 (덧셈 · 뺄셈) */
        let cur = nvNum(el.dataset.jumpstart, 0);
        if (jumps.length) {
            out.push('<circle class="nl-dot zero" cx="' + X(cur) + '" cy="' + axisY + '" r="6"/>');
        }
        jumps.forEach(function (d, i) {
            const from = cur;
            const to = cur + d;
            const x1 = X(from);
            const x2 = X(to);
            const arc = 30 + (i % 2) * 18;
            const side = d < 0 ? 'neg' : 'pos';
            out.push('<g class="nv-rv">' +
                '<path class="nl-jump ' + side + '" d="M ' + x1 + ' ' + (axisY - 7) +
                ' Q ' + ((x1 + x2) / 2) + ' ' + (axisY - arc * 2) + ' ' + x2 + ' ' + (axisY - 12) + '"/>' +
                '<polygon class="nl-jhead ' + side + '" points="' + nvTri(x2, axisY - 2, 'down', 5.5) + '"/>' +
                '<text class="nl-jlabel ' + side + '" x="' + ((x1 + x2) / 2) + '" y="' + (axisY - arc - 8) + '">' +
                nvSigned(d) + '</text></g>');
            cur = to;
        });

        el.innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" ' +
            'xmlns="http://www.w3.org/2000/svg" role="img">' + out.join('') + '</svg>' +
            (el.dataset.note ? '<div class="nv-note">' + el.dataset.note + '</div>' : '');
    }

    /* ---------- 가운데를 계속 찍어 나가기 (두 수 사이) ---------- */
    function bsBuild(el) {
        const from = nvNum(el.dataset.from, 0);
        const to = nvNum(el.dataset.to, 1);
        const levels = Math.max(1, Math.min(4, nvNum(el.dataset.levels, 3)));
        const W = 640;
        const PAD = 60;
        const axisY = 74;
        const H = nvNum(el.dataset.h, axisY + 58);
        const X = function (t) { return PAD + t * (W - PAD * 2); };

        const out = [];
        out.push('<line class="nl-axis" x1="' + (X(0) - 26) + '" y1="' + axisY +
            '" x2="' + (X(1) + 26) + '" y2="' + axisY + '"/>');
        [[0, from], [1, to]].forEach(function (p) {
            out.push('<line class="nl-tick zero" x1="' + X(p[0]) + '" y1="' + (axisY - 9) +
                '" x2="' + X(p[0]) + '" y2="' + (axisY + 9) + '"/>');
            out.push('<circle class="nl-dot zero" cx="' + X(p[0]) + '" cy="' + axisY + '" r="6"/>');
            out.push('<text class="nl-tlabel zero" x="' + X(p[0]) + '" y="' + (axisY + 27) + '">' +
                nvFmt(p[1]) + '</text>');
        });

        /* 가운데 → 그 가운데 → 또 그 가운데 순서로 한 무리씩 나타납니다 */
        for (let k = 1; k <= levels; k++) {
            const den = Math.pow(2, k);
            let g = '<g class="nv-rv">';
            for (let i = 1; i < den; i += 2) {
                const x = X(i / den);
                const r = (k === 1) ? 7 : (k === 2 ? 6 : 4.5);
                g += '<circle class="nl-dot pos" cx="' + x + '" cy="' + axisY + '" r="' + r + '"/>';
                if (k <= 2) { g += nvLabel(x, axisY, i + '/' + den, 'pos'); }
            }
            out.push(g + '</g>');
        }
        out.push('<g class="nv-rv"><text class="nl-cmplabel" x="' + (W / 2) + '" y="' + (axisY + 50) + '">' +
            (el.dataset.caption || '가운데를 찍고, 또 그 가운데를 찍고 …') + '</text></g>');

        el.innerHTML =
            '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" ' +
            'xmlns="http://www.w3.org/2000/svg" role="img">' + out.join('') + '</svg>' +
            (el.dataset.note ? '<div class="nv-note">' + el.dataset.note + '</div>' : '');
    }

    /* ---------- 수의 포함 관계 ---------- */
    function nsBuild(el) {
        const nat = el.dataset.natural || '1, 2, 3, …';
        const int = el.dataset.integer || '−1, −2, −3, …';
        const rat = el.dataset.rational || '−1.5, +5/2, −3/4, …';
        el.innerHTML =
            '<div class="ns-box ns-rat nv-rv">' +
            '<div class="ns-name">유리수</div>' +
            '<div class="ns-nums">' + rat + '</div>' +
            '<div class="ns-box ns-int nv-rv">' +
            '<div class="ns-name">정수</div>' +
            '<div class="ns-nums">' + int + '</div>' +
            '<div class="ns-box ns-nat nv-rv">' +
            '<div class="ns-name">자연수 (= 양의 정수)</div>' +
            '<div class="ns-nums">' + nat + '</div>' +
            '</div></div></div>' +
            (el.dataset.note ? '<div class="nv-note">' + el.dataset.note + '</div>' : '');
    }

    /* ---------- 셈돌 ---------- */
    function chBuild(el) {
        const p = nvNum(el.dataset.plus, 0);
        const m = nvNum(el.dataset.minus, 0);
        let html = '<div class="ch-row">';
        for (let i = 0; i < p; i++) { html += '<span class="ch p">+</span>'; }
        if (p && m) { html += '<span class="ch-gap"></span>'; }
        for (let j = 0; j < m; j++) { html += '<span class="ch m">\u2212</span>'; }
        html += '</div><div class="ch-result"></div>';
        el.innerHTML = html;
    }

    /* ---------- 규칙성 표 ---------- */
    function stBuild(el) {
        const rows = (el.dataset.rows || '').split(';')
            .map(function (r) { return r.trim(); })
            .filter(function (r) { return r.length; });
        const ask = (el.dataset.ask || '').split(',')
            .map(function (s) { return nvNum(s, NaN); })
            .filter(function (n) { return !isNaN(n); });

        el.innerHTML = rows.map(function (row, i) {
            const cut = row.indexOf('=');
            const left = cut > -1 ? row.slice(0, cut).trim() : row;
            const right = cut > -1 ? row.slice(cut + 1).trim() : '';
            const isAsk = ask.indexOf(i) > -1;
            return '<div class="st-row' + (isAsk ? ' hi' : '') + '" data-answer="' + right + '">' +
                '<span class="st-l">' + left + '</span>' +
                (cut > -1 ? '<span class="st-eq">=</span>' : '') +
                '<span class="st-r' + (isAsk ? ' ask' : '') + '">' + (isAsk ? '?' : right) + '</span>' +
                '</div>';
        }).join('') +
            (el.dataset.note ? '<div class="nv-note">' + el.dataset.note + '</div>' : '');
    }

    /* =========================================================================
       3. 등록
       ========================================================================= */
    AhaMath.registerVis({
        build: function (el, type) {
            const t = type || el.dataset.vis;
            if (t === 'numline') { nlBuild(el); return; }
            if (t === 'bisect') { bsBuild(el); return; }
            if (t === 'numsets') { nsBuild(el); return; }
            if (t === 'chips') { chBuild(el); return; }
            if (t === 'steps') { stBuild(el); }
        },

        play: function (el, type) {
            const t = type || el.dataset.vis;
            const wait = AhaMath.wait;

            /* 순서대로 하나씩 나타나는 것들 */
            if (t === 'numline' || t === 'numsets' || t === 'bisect') {
                /* bisect 는 '가운데를 찍고 또 찍는' 것이 보이도록 조금 천천히 */
                const gap = (t === 'bisect') ? 620 : 280;
                const items = Array.prototype.slice.call(el.querySelectorAll('.nv-rv'));
                items.forEach(function (g, i) {
                    setTimeout(function () { g.classList.add('on'); }, wait(gap * i + 220));
                });
                return;
            }

            if (t === 'chips') {
                const plus = Array.prototype.slice.call(el.querySelectorAll('.ch.p'));
                const minus = Array.prototype.slice.call(el.querySelectorAll('.ch.m'));
                const box = el.querySelector('.ch-result');
                if (el.dataset.cancel !== '1') {
                    if (box && el.dataset.result) {
                        box.innerHTML = el.dataset.result;
                        setTimeout(function () { box.classList.add('on'); }, wait(400));
                    }
                    return;
                }
                const pair = Math.min(plus.length, minus.length);
                for (let i = 0; i < pair; i++) {
                    (function (k) {
                        setTimeout(function () {
                            plus[k].classList.add('gone');
                            minus[k].classList.add('gone');
                        }, wait(700 + 380 * k));
                    })(i);
                }
                if (box) {
                    const left = plus.length - minus.length;
                    box.innerHTML = el.dataset.result
                        ? el.dataset.result
                        : ('남은 셈돌 ' + Math.abs(left) + '개 \u2192 <b>' + nvSigned(left) + '</b>');
                    setTimeout(function () { box.classList.add('on'); }, wait(700 + 380 * pair + 300));
                }
                return;
            }

            if (t === 'steps') {
                const rows = Array.prototype.slice.call(el.querySelectorAll('.st-row'));
                rows.forEach(function (r, i) {
                    setTimeout(function () { r.classList.add('on'); }, wait(340 * i + 200));
                });
                /* ? 로 두었던 줄은 마지막에 답을 보여 줍니다 */
                const asks = rows.filter(function (r) { return r.querySelector('.st-r.ask'); });
                asks.forEach(function (r, i) {
                    setTimeout(function () {
                        const cell = r.querySelector('.st-r');
                        cell.textContent = r.dataset.answer;
                    }, wait(340 * rows.length + 700 + 420 * i));
                });
            }
        }
    });

})(window);