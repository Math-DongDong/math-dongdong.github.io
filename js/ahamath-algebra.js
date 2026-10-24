/* =============================================================================
   아하! 수학 — 문자와 식 단원 전용 시각 자료      js/ahamath-algebra.js
   -----------------------------------------------------------------------------
   css/ahamath.css 와 js/ahamath.js 는 건드리지 않습니다.
   이 단원(문자와 식)의 학습 페이지에서만 ahamath.js 뒤에 한 줄 더 부릅니다.

     <script src="../../../../js/ahamath.js"></script>
     <script src="../../../../js/ahamath-algebra.js"></script>
     <script> AhaMath.start({ ... }); </script>

   담고 있는 시각 자료 6종
     border   정사각형 테두리 벽돌 (같은 색 묶음으로 세기)
     terms    식을 항으로 나누고 이름표 달기 (항 · 상수항 · 계수 …)
     tiles    대수 막대 (x 막대 · 1 조각) 모으기 / 빼기
     area     직사각형 넓이로 보는 분배법칙
     balance  양팔 저울 (양변에서 같은 것을 빼거나 같은 수로 나누기)
     chain    식을 한 줄씩 고쳐 쓰기 (= 를 세로로 맞추고, 줄 사이에 설명)

   분수 표기
     본문에 class="fx" 를 붙이고 a/b, (x+2)/3, 3/(y+8) 처럼 적으면 분수 모양이 됩니다.
     문항 안에서는 AhaAlgebra.fracText('1/2 x') 로 감쌉니다.
     분수 뒤에 문자가 오면 띄어 씁니다. 1/2x 는 '2x 분의 1' 로 읽힙니다 → 1/2 x
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
        /* ---------- 분수 표기 ---------- */
        '.frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;',
        '    line-height:1.15;margin:0 .12em;font-size:.82em}',
        '.frac>i{font-style:normal;padding:0 .3em}',
        '.frac>i:last-of-type{border-top:2px solid currentColor}',

        /* ---------- 문자(변수) : 기울인 글꼴로 × 와 구별 ---------- */
        '.v{font-style:italic;font-family:"Times New Roman",Times,serif;font-size:1.12em;line-height:1;',
        '    padding:0 .03em}',

        /* ---------- 공통 ---------- */
        '.al-cap{text-align:center;font-weight:700;margin:.7rem 0 0;opacity:0;transition:opacity .4s ease}',
        '.al-cap.on{opacity:1}',
        '.al-rv{opacity:0;transform:translateY(-6px);transition:opacity .4s ease,transform .4s ease}',
        '.al-rv.on{opacity:1;transform:none}',

        /* ---------- 벽돌 테두리 ---------- */
        '.al-border{display:grid;gap:3px;margin:0 auto}',
        '.al-cell{aspect-ratio:1/1;border-radius:3px}',
        '.al-brick{background:#d6d3d1;transition:background .35s ease,transform .35s ease}',
        '.al-brick.on{transform:scale(1.06)}',
        '.al-brick.g0.on{background:#2563eb}.al-brick.g1.on{background:#f59e0b}',
        '.al-brick.g2.on{background:#16a34a}.al-brick.g3.on{background:#db2777}',

        /* ---------- 항 나누기 ---------- */
        '.al-terms{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.35rem}',
        '.al-term{display:flex;flex-direction:column;align-items:center;padding:.35rem .6rem;',
        '    border:2px dashed transparent;border-radius:10px;transition:border-color .35s ease,background .35s ease}',
        '.al-term .t{font-size:1.35rem;font-weight:800;white-space:nowrap}',
        '.al-term .l{font-size:.8rem;font-weight:700;color:var(--primary);opacity:0;transition:opacity .35s ease;',
        '    white-space:nowrap}',
        '.al-term.on{border-color:#93c5fd;background:#eff6ff}',
        '.al-term.on .l{opacity:1}',
        '.al-term.const.on{border-color:#fcd34d;background:#fffbeb}',
        '.al-term.const .l{color:var(--wait)}',

        /* ---------- 대수 막대 ---------- */
        '.tl-groups{display:flex;justify-content:center;align-items:flex-end;gap:.5rem;flex-wrap:wrap}',
        '.tl-group{display:flex;flex-direction:column;align-items:center;gap:.3rem}',
        '.tl-name{font-weight:800;font-size:.95rem}',
        '.tl-row{display:flex;align-items:flex-end;gap:3px;min-height:66px;padding:6px 7px;',
        '    border:1.5px solid var(--border);border-radius:10px;background:#fafafa}',
        '.tl-op{font-size:1.4rem;font-weight:800;color:var(--muted);align-self:center;padding:0 .1rem}',
        '.tl-x,.tl-1{display:flex;align-items:center;justify-content:center;font-weight:800;border-radius:4px}',
        '.tl-x{width:17px;height:54px;background:#facc15;border:1.5px solid #ca8a04;color:#713f12;font-size:.8rem}',
        '.tl-1{width:17px;height:17px;background:#38bdf8;border:1.5px solid #0284c7;color:#0c4a6e;font-size:.62rem}',
        '.tl-gap{width:10px}',
        '.tl-merge{margin-top:.9rem;display:flex;flex-direction:column;align-items:center;gap:.3rem}',
        '.tl-merge .tl-x,.tl-merge .tl-1{opacity:0;transform:translateY(-10px);',
        '    transition:opacity .3s ease,transform .3s ease}',
        '.tl-merge .tl-x.on,.tl-merge .tl-1.on{opacity:1;transform:none}',
        '.tl-merge .tl-x.out,.tl-merge .tl-1.out{opacity:.15;transform:scale(.8)}',

        /* ---------- 넓이 ---------- */
        '.al-area svg{width:100%;max-width:380px;height:auto;display:block;margin:0 auto}',
        '.al-area text{font-family:inherit;text-anchor:middle}',
        '.ar-p0{fill:#ccfbf1;stroke:#0d9488}.ar-p1{fill:#ffedd5;stroke:#ea580c}.ar-p2{fill:#e0e7ff;stroke:#4f46e5}',
        '.ar-side{font-size:14px;font-weight:700;fill:#6b7280}',
        '.ar-in{font-size:17px;font-weight:800;fill:#1f2937;opacity:0;transition:opacity .4s ease}',
        '.ar-in.on{opacity:1}',

        /* ---------- 양팔 저울 ---------- */
        '.al-balance{max-width:360px;margin:0 auto}',
        '.bl-pans{display:flex;justify-content:space-between;gap:10px}',
        '.bl-pan{flex:1;display:flex;flex-wrap:wrap-reverse;justify-content:center;align-content:flex-start;',
        '    gap:4px;min-height:74px;padding:4px}',
        '.bl-beam{height:5px;border-radius:3px;background:#475569}',
        '.bl-stand{width:0;height:0;margin:0 auto;border-left:16px solid transparent;',
        '    border-right:16px solid transparent;border-bottom:22px solid #94a3b8}',
        '.bl-names{display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;color:var(--muted);',
        '    padding:0 .4rem;margin-top:-1.3rem}',
        '.bl-x,.bl-1{display:flex;align-items:center;justify-content:center;font-weight:800;',
        '    transition:opacity .4s ease,transform .4s ease}',
        '.bl-x{width:32px;height:32px;border-radius:7px;background:#fb923c;border:2px solid #c2410c;color:#fff}',
        '.bl-1{width:24px;height:24px;border-radius:50%;background:#60a5fa;border:2px solid #1d4ed8;',
        '    color:#fff;font-size:.75rem}',
        '.bl-x.out,.bl-1.out{opacity:0;transform:scale(.4)}',
        '.bl-x.hide,.bl-1.hide{display:none}',
        '.bl-steps{list-style:none;padding:0;margin:.8rem 0 0;text-align:center;font-weight:700}',
        '.bl-steps li{padding:.15rem 0}',

        /* ---------- 식 고쳐 쓰기 ---------- */
        '.al-chain{display:grid;grid-template-columns:auto auto auto;justify-content:center;column-gap:.45rem;',
        '    row-gap:.15rem;align-items:center;font-size:1.15rem;font-weight:700}',
        '.al-chain .c-l{text-align:right}',
        '.al-chain .c-r{text-align:left}',
        '.al-chain .c-full{grid-column:1/-1;text-align:center}',
        '.al-chain .c-note{grid-column:1/-1;text-align:center;font-size:.85rem;font-weight:600;color:var(--muted)}',
        '.al-chain .last{color:var(--primary)}',
        '.al-chain .hi{color:var(--aha);background:var(--aha-soft);border-radius:6px}',
        '@media (max-width:420px){.al-chain{font-size:1rem;column-gap:.3rem}}'
    ].join('\n');

    if (!document.getElementById('ahamath-algebra-style')) {
        const tag = document.createElement('style');
        tag.id = 'ahamath-algebra-style';
        tag.textContent = CSS;
        document.head.appendChild(tag);
    }

    /* =========================================================================
       2. 분수 표기 (페이지에서도 씁니다 : AhaAlgebra.fracText)
       ========================================================================= */
    const TOKEN = '([0-9a-zA-Z.²³]+)';

    function fracHtml(num, den) {
        return '<span class="frac"><i>' + num + '</i><i>' + den + '</i></span>';
    }

    function fracText(s) {
        const both = /\(([^()]+)\)\/\(([^()]+)\)/g;
        const topParen = new RegExp('\\(([^()]+)\\)\\/' + TOKEN, 'g');
        const bottomParen = new RegExp(TOKEN + '\\/\\(([^()]+)\\)', 'g');
        const plain = new RegExp(TOKEN + '\\/' + TOKEN, 'g');
        const make = function (m, n, d) { return fracHtml(n, d); };
        return String(s)
            .replace(both, make)
            .replace(topParen, make)
            .replace(bottomParen, make)
            .replace(plain, make);
    }

    /* =========================================================================
       3. 작은 도우미 (registerVis 괄호 바깥에 둡니다)
       ========================================================================= */
    function alList(s, sep) {
        if (!s) { return []; }
        return String(s).split(sep || ',').map(function (t) { return t.trim(); });
    }

    function capHtml(el) {
        return el.dataset.caption ? '<p class="al-cap">' + fracText(el.dataset.caption) + '</p>' : '';
    }

    function showCap(el, ms) {
        const cap = el.querySelector('.al-cap');
        if (cap) { setTimeout(function () { cap.classList.add('on'); }, A.wait(ms)); }
    }

    /* '1*4' → ['1','1','1','1'] , 'x,x,1' → ['x','x','1'] */
    function tokenList(s) {
        const out = [];
        alList(s).forEach(function (t) {
            const m = /^(.+)\*(\d+)$/.exec(t);
            const n = m ? parseInt(m[2], 10) : 1;
            for (let i = 0; i < n; i++) { out.push(m ? m[1] : t); }
        });
        return out;
    }

    /* ---------- 벽돌 테두리 ---------- */
    function borderBuild(el) {
        const n = Math.max(3, parseInt(el.dataset.n, 10) || 5);
        const size = Math.min(260, n * 34);
        let html = '<div class="al-border" style="width:' + size + 'px;grid-template-columns:repeat(' + n + ',1fr)">';
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                let g = -1;
                if (r === 0 && c < n - 1) { g = 0; }
                else if (c === n - 1 && r < n - 1) { g = 1; }
                else if (r === n - 1 && c > 0) { g = 2; }
                else if (c === 0 && r > 0) { g = 3; }
                html += g < 0 ? '<div class="al-cell"></div>' : '<div class="al-cell al-brick g' + g + '"></div>';
            }
        }
        el.innerHTML = html + '</div>' + capHtml(el);
    }

    /* ---------- 항 나누기 ---------- */
    function termsBuild(el) {
        const terms = alList(el.dataset.terms);
        const labels = alList(el.dataset.labels, '|');
        el.innerHTML = '<div class="al-terms">' + terms.map(function (t, i) {
            const isConst = !/[a-zA-Z]/.test(t);
            const label = labels[i] !== undefined && labels[i] !== '' ? labels[i] : (isConst ? '상수항' : '항');
            const shown = (i === 0 && t.charAt(0) === '+') ? t.slice(1) : t;
            return '<div class="al-term' + (isConst ? ' const' : '') + '">' +
                '<span class="t">' + fracText(shown) + '</span>' +
                '<span class="l">' + fracText(label) + '</span></div>';
        }).join('') + '</div>' + capHtml(el);
    }

    /* ---------- 대수 막대 ---------- */
    function tileHtml(kind, extra) {
        return kind === 'x'
            ? '<span class="tl-x' + (extra || '') + '">x</span>'
            : '<span class="tl-1' + (extra || '') + '">1</span>';
    }

    function tileRow(xs, ones, extra) {
        let s = '';
        for (let i = 0; i < xs; i++) { s += tileHtml('x', extra); }
        if (xs && ones) { s += '<span class="tl-gap"></span>'; }
        for (let j = 0; j < ones; j++) { s += tileHtml('1', extra); }
        return s;
    }

    function tilesBuild(el) {
        const groups = alList(el.dataset.groups, ';').map(function (g) {
            const p = g.split(',');
            return { x: parseInt(p[0], 10) || 0, one: parseInt(p[1], 10) || 0 };
        });
        const names = alList(el.dataset.names, '|');
        const minus = el.dataset.op === '-';

        let html = '<div class="tl-groups">';
        groups.forEach(function (g, i) {
            if (i > 0) { html += '<span class="tl-op">' + (minus ? '−' : '+') + '</span>'; }
            html += '<div class="tl-group"><span class="tl-name">' + (names[i] || '') + '</span>' +
                '<div class="tl-row">' + tileRow(g.x, g.one) + '</div></div>';
        });
        html += '</div>';

        /* 아래 줄 : 더하기는 같은 종류끼리 모으고, 빼기는 첫 묶음에서 덜어 냅니다 */
        let mx = 0;
        let mo = 0;
        if (minus) {
            mx = groups[0].x;
            mo = groups[0].one;
        } else {
            groups.forEach(function (g) { mx += g.x; mo += g.one; });
        }
        html += '<div class="tl-merge"><div class="tl-row">' + tileRow(mx, mo) + '</div></div>';
        el.innerHTML = html + capHtml(el);
        el.dataset.takex = minus ? groups.slice(1).reduce(function (a, g) { return a + g.x; }, 0) : 0;
        el.dataset.takeone = minus ? groups.slice(1).reduce(function (a, g) { return a + g.one; }, 0) : 0;
    }

    /* ---------- 넓이 ---------- */
    function areaBuild(el) {
        const parts = alList(el.dataset.parts);
        const inside = alList(el.dataset.results);
        const H = 90;
        const top = 12;
        const left = 40;
        const widths = parts.map(function (p) { return /[a-zA-Z]/.test(p) ? 160 : 84; });
        const total = widths.reduce(function (a, b) { return a + b; }, 0);
        const W = left + total + 16;

        let s = '<svg viewBox="0 0 ' + W + ' ' + (top + H + 30) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="직사각형의 넓이">';
        let x = left;
        parts.forEach(function (p, i) {
            s += '<rect class="ar-p' + (i % 3) + '" x="' + x + '" y="' + top + '" width="' + widths[i] +
                '" height="' + H + '" stroke-width="2"/>';
            s += '<text class="ar-side" x="' + (x + widths[i] / 2) + '" y="' + (top + H + 21) + '">' + p + '</text>';
            s += '<text class="ar-in" x="' + (x + widths[i] / 2) + '" y="' + (top + H / 2 + 6) + '">' + (inside[i] || '') + '</text>';
            x += widths[i];
        });
        s += '<text class="ar-side" x="' + (left - 18) + '" y="' + (top + H / 2 + 5) + '">' + (el.dataset.h || '') + '</text>';
        el.innerHTML = s + '</svg>' + capHtml(el);
    }

    /* ---------- 양팔 저울 ---------- */
    function panHtml(list) {
        return list.map(function (t) {
            return t === '1'
                ? '<span class="bl-1" data-t="1">1</span>'
                : '<span class="bl-x" data-t="' + t + '">' + t + '</span>';
        }).join('');
    }

    function balanceBuild(el) {
        const notes = alList(el.dataset.notes, '|');
        el.innerHTML = '<div class="al-balance">' +
            '<div class="bl-pans"><div class="bl-pan left">' + panHtml(tokenList(el.dataset.left)) + '</div>' +
            '<div class="bl-pan right">' + panHtml(tokenList(el.dataset.right)) + '</div></div>' +
            '<div class="bl-beam"></div><div class="bl-stand"></div>' +
            '<div class="bl-names"><span>좌변</span><span>우변</span></div>' +
            (notes.length && notes[0] ? '<ol class="bl-steps">' + notes.map(function (n) {
                return '<li class="al-rv">' + fracText(n) + '</li>';
            }).join('') + '</ol>' : '') +
            '</div>' + capHtml(el);
    }

    /* 한쪽 접시에서 '-1*4'(1을 4개 빼기) 또는 '/2'(같은 종류를 2묶음으로 나눠 하나만 남기기) */
    function panApply(pan, step) {
        const live = Array.prototype.slice.call(pan.querySelectorAll('[data-t]:not(.out)'));
        let gone = [];
        const take = /^-(.+)\*(\d+)$/.exec(step);
        if (take) {
            gone = live.filter(function (t) { return t.dataset.t === take[1]; })
                .slice(-parseInt(take[2], 10));
        }
        const split = /^\/(\d+)$/.exec(step);
        if (split) {
            const k = parseInt(split[1], 10);
            const kinds = {};
            live.forEach(function (t) { (kinds[t.dataset.t] = kinds[t.dataset.t] || []).push(t); });
            Object.keys(kinds).forEach(function (key) {
                const list = kinds[key];
                gone = gone.concat(list.slice(Math.round(list.length / k)));
            });
        }
        gone.forEach(function (t) { t.classList.add('out'); });
        setTimeout(function () { gone.forEach(function (t) { t.classList.add('hide'); }); }, A.wait(450));
    }

    /* ---------- 식 고쳐 쓰기 ---------- */
    function chainBuild(el) {
        const rows = alList(el.dataset.rows, '|');
        const notes = alList(el.dataset.notes, '|');
        /* = 가 하나라도 있으면 = 없는 줄(첫 식)은 왼쪽 칸에 두어 아래 줄의 = 와 맞춥니다 */
        const aligned = rows.some(function (r) { return r.indexOf('=') > -1; });
        let html = '';
        rows.forEach(function (raw, i) {
            const hi = raw.charAt(0) === '!';
            const row = hi ? raw.slice(1).trim() : raw;
            const tone = (hi ? ' hi' : '') + (i === rows.length - 1 && !hi ? ' last' : '');
            if (i > 0 && notes[i]) {
                html += '<div class="c-note al-rv" data-i="' + i + '"><i class="bi bi-arrow-down"></i> ' + fracText(notes[i]) + '</div>';
            }
            const cut = row.indexOf('=');
            if (cut < 0 && aligned) {
                html += '<div class="c-l al-rv' + tone + '" data-i="' + i + '">' + fracText(row) + '</div>' +
                    '<div></div><div></div>';
            } else if (cut < 0) {
                html += '<div class="c-full al-rv' + tone + '" data-i="' + i + '">' + fracText(row) + '</div>';
            } else {
                html += '<div class="c-l al-rv' + tone + '" data-i="' + i + '">' + fracText(row.slice(0, cut).trim()) + '</div>' +
                    '<div class="al-rv' + tone + '" data-i="' + i + '">=</div>' +
                    '<div class="c-r al-rv' + tone + '" data-i="' + i + '">' + fracText(row.slice(cut + 1).trim()) + '</div>';
            }
        });
        el.innerHTML = '<div class="al-chain">' + html + '</div>' + capHtml(el);
    }

    /* =========================================================================
       4. 등록
       ========================================================================= */
    AhaMath.registerVis({
        build: function (el, type) {
            const t = type || el.dataset.vis;
            if (t === 'border') { borderBuild(el); return; }
            if (t === 'terms') { termsBuild(el); return; }
            if (t === 'tiles') { tilesBuild(el); return; }
            if (t === 'area') { areaBuild(el); return; }
            if (t === 'balance') { balanceBuild(el); return; }
            if (t === 'chain') { chainBuild(el); }
        },

        play: function (el, type) {
            const t = type || el.dataset.vis;
            const wait = A.wait;

            /* 같은 색 묶음이 하나씩 켜집니다 */
            if (t === 'border') {
                for (let g = 0; g < 4; g++) {
                    (function (k) {
                        setTimeout(function () {
                            el.querySelectorAll('.al-brick.g' + k).forEach(function (b) { b.classList.add('on'); });
                        }, wait(300 + 650 * k));
                    })(g);
                }
                showCap(el, 300 + 650 * 4);
                return;
            }

            if (t === 'terms') {
                const items = el.querySelectorAll('.al-term');
                items.forEach(function (box, i) {
                    setTimeout(function () { box.classList.add('on'); }, wait(400 + 420 * i));
                });
                showCap(el, 400 + 420 * items.length + 200);
                return;
            }

            if (t === 'tiles') {
                const merged = Array.prototype.slice.call(el.querySelectorAll('.tl-merge .tl-x, .tl-merge .tl-1'));
                merged.forEach(function (tile, i) {
                    setTimeout(function () { tile.classList.add('on'); }, wait(700 + 110 * i));
                });
                let end = 700 + 110 * merged.length;
                const takeX = parseInt(el.dataset.takex, 10) || 0;
                const takeOne = parseInt(el.dataset.takeone, 10) || 0;
                if (takeX || takeOne) {
                    const xs = Array.prototype.slice.call(el.querySelectorAll('.tl-merge .tl-x'));
                    const ones = Array.prototype.slice.call(el.querySelectorAll('.tl-merge .tl-1'));
                    const out = (takeX ? xs.slice(-takeX) : []).concat(takeOne ? ones.slice(-takeOne) : []);
                    out.forEach(function (tile, i) {
                        setTimeout(function () { tile.classList.add('out'); }, wait(end + 500 + 260 * i));
                    });
                    end += 500 + 260 * out.length;
                }
                showCap(el, end + 300);
                return;
            }

            if (t === 'area') {
                const labels = el.querySelectorAll('.ar-in');
                labels.forEach(function (lb, i) {
                    setTimeout(function () { lb.classList.add('on'); }, wait(400 + 600 * i));
                });
                showCap(el, 400 + 600 * labels.length);
                return;
            }

            if (t === 'balance') {
                const steps = alList(el.dataset.steps, '|');
                const lines = el.querySelectorAll('.bl-steps li');
                const pans = el.querySelectorAll('.bl-pan');
                steps.forEach(function (step, i) {
                    setTimeout(function () { if (lines[i]) { lines[i].classList.add('on'); } }, wait(700 + 1700 * i));
                    setTimeout(function () {
                        pans.forEach(function (pan) { panApply(pan, step); });
                    }, wait(1200 + 1700 * i));
                });
                showCap(el, 1200 + 1700 * steps.length);
                return;
            }

            if (t === 'chain') {
                const cells = el.querySelectorAll('.al-rv');
                let count = 0;
                cells.forEach(function (c) { count = Math.max(count, parseInt(c.dataset.i, 10)); });
                cells.forEach(function (c) {
                    const i = parseInt(c.dataset.i, 10);
                    const isNote = c.classList.contains('c-note');
                    setTimeout(function () { c.classList.add('on'); }, wait(250 + 750 * i - (isNote ? 350 : 0)));
                });
                showCap(el, 250 + 750 * (count + 1));
            }
        }
    });

    /* 본문에 a/b 처럼 적어 둔 곳(class="fx")을 분수 모양으로 바꿉니다 */
    document.querySelectorAll('.fx').forEach(function (el) {
        el.innerHTML = fracText(el.innerHTML);
    });

    /* =========================================================================
       5. 문자(변수) 기울이기
          굵은 글씨에서 x 와 × 가 똑같아 보이므로, 본문의 영문자를 모두
          <span class="v"> 로 감쌉니다. 시각 자료를 다시 그리거나 문항이 바뀌어도
          MutationObserver 가 새로 생긴 글자를 다시 감쌉니다. cm · kg 같은 단위는 그대로 둡니다.
       ========================================================================= */
    const LETTER = /(cm|kg|km)|([A-Za-z])/g;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function wrapLetters(textNode) {
        const text = textNode.nodeValue;
        const parent = textNode.parentNode;
        if (!parent || !/[A-Za-z]/.test(text)) { return; }
        if (parent.closest('.v, script, style, .bi')) { return; }
        const inSvg = !!parent.closest('svg');
        if (inSvg && parent.nodeName.toLowerCase() !== 'text') { return; }

        const frag = document.createDocumentFragment();
        let last = 0;
        text.replace(LETTER, function (m, unit, ch, at) {
            if (unit) { return m; }
            if (at > last) { frag.appendChild(document.createTextNode(text.slice(last, at))); }
            const box = inSvg ? document.createElementNS(SVG_NS, 'tspan') : document.createElement('span');
            box.setAttribute('class', 'v');
            box.textContent = ch;
            frag.appendChild(box);
            last = at + 1;
            return m;
        });
        if (last === 0) { return; }
        if (last < text.length) { frag.appendChild(document.createTextNode(text.slice(last))); }
        parent.replaceChild(frag, textNode);
    }

    function wrapAll(root) {
        if (root.nodeType === 3) { wrapLetters(root); return; }
        if (root.nodeType !== 1) { return; }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const list = [];
        while (walker.nextNode()) { list.push(walker.currentNode); }
        list.forEach(wrapLetters);
    }

    const main = document.querySelector('main');
    if (main) {
        wrapAll(main);
        new MutationObserver(function (records) {
            records.forEach(function (r) {
                r.addedNodes.forEach(wrapAll);
                if (r.type === 'characterData') { wrapLetters(r.target); }
            });
        }).observe(main, { childList: true, subtree: true, characterData: true });
    }

    global.AhaAlgebra = { fracText: fracText, fracHtml: fracHtml };

})(window);
