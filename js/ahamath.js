/* =============================================================================
   아하! 수학 학습 페이지 공통 엔진          js/ahamath.js
   -----------------------------------------------------------------------------
   학습 페이지에서는 이렇게만 부르면 됩니다.

     <script src="../../../../js/ahamath.js"></script>
     <script>
         AhaMath.start({
             topicId: 'coordinate',      // 메인 index.html 의 TOPICS id 와 같게
             recordVersion: 1,           // 문항 구성이 바뀌면 숫자를 올려요
             questions: { q1: { ... } }  // 기초 q1~, 도전 x1~
         });
     </script>

   주제마다 다른 시각 자료가 필요하면 start 보다 먼저 등록하세요.

     AhaMath.registerVis({
         build: function (el, type) { if (type === 'plane') { ... } },
         play:  function (el, type) { if (type === 'plane') { ... } }
     });

   기본 제공 시각 자료 10종
   cards · level · outlier · sort · stack · stemleaf · histogram · grid · segbar · dualpoly
   ============================================================================= */
(function (global) {
    'use strict';

    const TOTAL_STEPS = 4;
    const CHART_H = 150;
    const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const RANK = { missed: 0, solved: 1, firstTry: 2 };
    const plugins = [];

    let TOPIC_ID = '';
    let RECORD_VERSION = 1;
    let STORAGE_KEY = '';
    let LIST_HREF = '../../index.html';   // 주제 목록(메인) 경로
    let QUESTIONS = {};
    let FLOW = null;
    let ALL_IDS = [];
    let record = null;
    let activeView = 'view-read';
    let session = null;
    let attempts = {};

    /* ---------- 저장소 (localStorage, 차단 환경이면 메모리로 대체) ---------- */
    const Store = (function () {
        let useLocal = true;
        const memory = {};
        try {
            window.localStorage.setItem('__t__', '1');
            window.localStorage.removeItem('__t__');
        } catch (e) { useLocal = false; }
        return {
            read: function (k) {
                try { return useLocal ? window.localStorage.getItem(k) : (memory[k] || null); }
                catch (e) { return memory[k] || null; }
            },
            write: function (k, v) {
                try { if (useLocal) { window.localStorage.setItem(k, v); } else { memory[k] = v; } }
                catch (e) { memory[k] = v; }
            },
            remove: function (k) {
                try { if (useLocal) { window.localStorage.removeItem(k); } else { delete memory[k]; } }
                catch (e) { delete memory[k]; }
            }
        };
    })();

    function emptyRecord() {
        return {
            version: RECORD_VERSION, topic: TOPIC_ID,
            gate: null, challengeGate: null,
            best: {}, summary: {}, updatedAt: null
        };
    }

    function loadRecord() {
        const raw = Store.read(STORAGE_KEY);
        if (!raw) { return emptyRecord(); }
        let data;
        try { data = JSON.parse(raw); } catch (e) { return emptyRecord(); }
        const merged = Object.assign(emptyRecord(), data);
        if (merged.version !== RECORD_VERSION) {   // 문항이 바뀐 버전이면 문항별 기록만 초기화
            merged.best = {};
            merged.version = RECORD_VERSION;
        }
        if (data.quiz && !data.best) {         // 아주 예전 형식의 기록 옮기기
            merged.best = {};
            Object.keys(data.quiz).forEach(function (id) {
                const q = data.quiz[id];
                merged.best[id] = q.isCorrect ? (q.tryCount === 1 ? 'firstTry' : 'solved') : 'missed';
            });
        }
        return merged;
    }

    function saveRecord() {
        record.updatedAt = new Date().toISOString();
        record.summary = buildSummary();
        Store.write(STORAGE_KEY, JSON.stringify(record));
    }

    function keepBest(id, status) {
        const now = record.best[id];
        if (!now || RANK[status] > RANK[now]) { record.best[id] = status; }
    }

    function bestOf(id) { return record.best[id] || null; }

    function firstTryCount(ids) { return ids.filter(function (id) { return bestOf(id) === 'firstTry'; }).length; }

    function isMastered(flow) { return firstTryCount(FLOW[flow].ids) === FLOW[flow].ids.length; }

    function buildSummary() {
        const basicFirst = firstTryCount(FLOW.basic.ids);
        const done = (record.gate ? 1 : 0) + basicFirst;
        return {
            gate: record.gate,
            challengeGate: record.challengeGate,
            basicFirstTry: basicFirst,                             // 메인 페이지가 읽는 기초 미션 개수
            basicTotal: FLOW.basic.ids.length,
            challengeFirstTry: firstTryCount(FLOW.challenge.ids),   // 메인 페이지가 읽는 도전 미션 개수
            challengeTotal: FLOW.challenge.ids.length,
            mastered: isMastered('basic'),
            challengeMastered: isMastered('challenge'),
            percent: Math.round(done / (1 + FLOW.basic.ids.length) * 100),
            updatedAt: new Date().toISOString()
        };
    }

    function syncRecord() {
        if (!Store.read(STORAGE_KEY)) { return; }
        const stamp = (record.summary && record.summary.updatedAt) || record.updatedAt;
        Object.keys(record.best).forEach(function (id) {
            if (!QUESTIONS[id]) { delete record.best[id]; }
        });
        record.summary = buildSummary();
        if (stamp) { record.summary.updatedAt = stamp; }   // 마지막 학습 시각은 그대로 둡니다
        Store.write(STORAGE_KEY, JSON.stringify(record));
    }

    function showView(id) {
        document.querySelectorAll('.view').forEach(function (v) { v.hidden = (v.id !== id); });
        activeView = id;
        window.scrollTo({ top: 0, behavior: 'auto' });
        updateTopbar();
        refreshInView(document.getElementById(id));
    }

    function updateTopbar() {
        const backText = document.getElementById('backText');
        const label = document.getElementById('stepLabel');
        const total = document.getElementById('stepTotal');
        const bar = document.getElementById('progressBar');

        if (activeView === 'view-read' || activeView === 'view-cread') {
            backText.textContent = '아하! 수학';
            updateScrollUI();
            return;
        }
        backText.textContent = '개념으로';

        if (activeView === 'view-mission' && session) {
            const step = session.flow === 'basic' ? 3 : 4;
            label.textContent = step + '단계: ' + FLOW[session.flow].label;
            total.textContent = step + ' / ' + TOTAL_STEPS + '단계';
            bar.style.width = Math.round((session.index + 1) / session.ids.length * 100) + '%';
            return;
        }
        label.textContent = '학습 마무리';
        total.textContent = '총 ' + TOTAL_STEPS + '단계';
        bar.style.width = '100%';
    }

    function updateScrollUI() {
        if (activeView !== 'view-read' && activeView !== 'view-cread') { return; }
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const percent = scrollable <= 0 ? 0 : Math.min(100, Math.round(window.scrollY / scrollable * 100));
        document.getElementById('progressBar').style.width = percent + '%';

        const marks = Array.prototype.slice.call(
            document.getElementById(activeView).querySelectorAll('[data-step][data-stepname]')
        );
        let current = marks[0];
        marks.forEach(function (el) {
            if (el.getBoundingClientRect().top <= 130) { current = el; }
        });
        if (!current) { return; }
        document.getElementById('stepLabel').textContent = current.dataset.step + '단계: ' + current.dataset.stepname;
        document.getElementById('stepTotal').textContent = current.dataset.step + ' / ' + TOTAL_STEPS + '단계';
    }

    function reviewIdsOf(flow) {
        return FLOW[flow].ids.filter(function (id) {
            const b = bestOf(id);
            return b && b !== 'firstTry';
        });
    }

    function startMission(flow, mode, startId) {
        const ids = (mode === 'review') ? reviewIdsOf(flow) : FLOW[flow].ids.slice();
        if (!ids.length) { return; }
        let index = 0;
        if (mode === 'review' && startId) { index = Math.max(0, ids.indexOf(startId)); }
        session = { flow: flow, mode: mode, ids: ids, index: index };
        attempts = {};   // 다시 풀 때마다 '한 번에 맞힐' 기회가 새로 주어집니다
        showView('view-mission');
        renderCurrentQuestion();
    }

    function renderCurrentQuestion() {
        const id = session.ids[session.index];
        const q = QUESTIONS[id];
        const state = attempts[id] || { tryCount: 0, wrong: [], solvedWith: null, lastHint: '' };
        const card = document.getElementById('questionCard');

        const flowLabel = document.getElementById('missionFlowLabel');
        flowLabel.textContent = FLOW[session.flow].label + (session.mode === 'review' ? ' · 다시 풀기' : '');
        flowLabel.className = 'q-badge' + (session.flow === 'challenge' ? ' gold' : '');
        document.getElementById('missionProgressText').textContent =
            '문제 ' + (session.index + 1) + ' / ' + session.ids.length;

        card.innerHTML =
            '<h2 class="card-title">' + q.badge + '</h2>' +
            '<p class="lead-text">' + q.stem + '</p>' +
            /* 조건 상자가 비어 있으면 아예 만들지 않습니다 */
            (String(q.data || '').trim() ? '<div class="data-line">' + q.data + '</div>' : '') +
            q.choices.map(function (c) {
                let cls = 'choice';
                let dis = '';
                if (state.solvedWith) { dis = ' disabled'; if (state.solvedWith === c.id) { cls += ' correct'; } }
                if (state.wrong.indexOf(c.id) > -1) { cls += ' wrong'; dis = ' disabled'; }
                return '<button class="' + cls + '" data-choice="' + c.id + '"' + dis + '>' + c.text + '</button>';
            }).join('') +
            '<div class="feedback" id="fb" hidden></div>';

        card.querySelectorAll('.choice').forEach(function (b) {
            b.addEventListener('click', function () { answer(id, b.dataset.choice); });
        });

        /* 문제나 보기 안에 시각 자료가 있으면 바로 그려 줍니다 */
        card.querySelectorAll('[data-vis]').forEach(function (v) {
            buildVis(v);
            playVis(v);
        });

        const fb = document.getElementById('fb');
        if (state.solvedWith) {
            fb.className = 'feedback ok';
            fb.innerHTML = state.tryCount === 1
                ? '<b>한 번에 맞혔어요!</b> ' + q.ok
                : '<b>맞았어요!</b> ' + q.ok + '<br><b>다시 볼 문제</b>에서 한 번에 맞히면 그때 기록에 쌓여요.';
            fb.hidden = false;
        } else if (state.lastHint) {
            fb.className = 'feedback no';
            fb.innerHTML = '<b>거의 다 왔어요.</b> ' + state.lastHint + '<br>남은 것 중에서 다시 골라 볼까요?';
            fb.hidden = false;
        }

        updateMissionNav();
        updateTopbar();
    }

    function answer(id, choiceId) {
        const q = QUESTIONS[id];
        const picked = q.choices.filter(function (c) { return c.id === choiceId; })[0];
        const state = attempts[id] || { tryCount: 0, wrong: [], solvedWith: null, lastHint: '' };

        state.tryCount++;
        if (picked.correct) {
            state.solvedWith = choiceId;
            // 이번에 처음 고른 답이 정답일 때만 개수로 인정됩니다
            keepBest(id, state.tryCount === 1 ? 'firstTry' : 'solved');
        } else {
            state.wrong.push(choiceId);
            state.lastHint = picked.hint;
            keepBest(id, 'missed');
        }
        attempts[id] = state;
        saveRecord();

        renderCurrentQuestion();
        renderReview();
    }

    function updateMissionNav() {
        const id = session.ids[session.index];
        const solved = !!(attempts[id] && attempts[id].solvedWith);
        const last = (session.index === session.ids.length - 1);

        document.getElementById('prevQ').disabled = (session.index === 0);
        const next = document.getElementById('nextQ');
        next.disabled = !solved;
        next.innerHTML = last
            ? '결과 보기 <i class="bi bi-flag"></i>'
            : '다음 문제 <i class="bi bi-chevron-right"></i>';
    }

    function doneLeadText(flow, thisTime, total) {
        if (!total) { return '끝까지 풀었어요.'; }
        if (thisTime === total) {
            return (flow === 'basic')
                ? '한 문제도 헤매지 않았어요. 정말 잘했어요.'
                : '조건이 늘어난 문제까지 한 번에 해냈어요. 대단해요.';
        }
        if (thisTime * 2 >= total) { return '끝까지 풀었어요. 아래 다시 볼 문제만 한 번 더 풀어 볼까요?'; }
        if (thisTime > 0) { return '끝까지 포기하지 않았어요. 헷갈린 문제는 아래에 담아 두었어요.'; }
        return '끝까지 풀어냈어요. 아직 한 번에 맞힌 문제가 없으니 개념을 한 번 더 보고 올까요?';
    }

    function showResult(flow) {
        const ids = FLOW[flow].ids;
        const sessionIds = session ? session.ids : ids;

        const thisTime = sessionIds.filter(function (id) {
            return attempts[id] && attempts[id].solvedWith && attempts[id].tryCount === 1;
        }).length;

        document.getElementById('doneTitle').textContent =
            (flow === 'basic' ? '기초 미션 완료!' : '도전 미션 완료!');
        document.getElementById('doneLead').textContent =
            doneLeadText(flow, thisTime, sessionIds.length);
        document.getElementById('doneThisTime').textContent = thisTime + ' / ' + sessionIds.length;
        document.getElementById('doneBest').textContent = firstTryCount(ids) + ' / ' + ids.length;

        const master = document.getElementById('doneMaster');
        if (isMastered(flow)) {
            master.className = 'badge-master on';
            master.innerHTML = '<i class="bi bi-lightbulb-fill"></i> ' +
                (flow === 'basic' ? '기초 미션' : '도전 미션') + '을 모두 한 번에 맞혔어요! 완벽해요!';
        } else {
            master.className = 'badge-master off';
            master.innerHTML = '<i class="bi bi-bookmark-fill"></i> 아래 <b>다시 볼 문제</b>를 한 번에 맞히면<br><b>기록에 하나씩 쌓여요!</b>';
        }
        master.hidden = false;

        const items = reviewItems(ids);
        document.getElementById('doneReviewBox').hidden = (items.length === 0);
        fillReviewList('doneReviewList', items);

        const actions = document.getElementById('doneActions');
        actions.innerHTML = '';

        if (items.length) {
            actions.appendChild(makeButton(
                '<i class="bi bi-arrow-repeat"></i> 다시 볼 문제만 풀어 보기',
                'btn btn-outline-primary fw-bold w-100 py-2 mb-2',
                function () { startMission(flow, 'review', null); }
            ));
        }
        if (flow === 'basic' && FLOW.challenge.ids.length) {
            /* 도전 미션을 이미 다 맞혔어도 심화 개념으로 돌아갈 길은 남겨 둡니다 */
            const cleared = isMastered('challenge');
            actions.appendChild(makeButton(
                cleared
                    ? '<i class="bi bi-stars"></i> 도전 코스 다시 보기'
                    : '<i class="bi bi-stars"></i> 도전! 한 걸음 더 시작하기',
                'btn fw-bold w-100 py-2 mb-2' + (cleared ? '' : ' text-white'),
                function () { showView('view-cread'); },
                cleared
                    ? 'background:var(--wait-soft);border-color:var(--wait-line);color:var(--wait)'
                    : 'background:var(--wait);border-color:var(--wait)'
            ));
        }
        if (flow === 'challenge' && !isMastered('basic')) {
            actions.appendChild(makeButton(
                '<i class="bi bi-check2-circle"></i> 기초 미션도 남아 있어요 · 풀러 가기',
                'btn btn-primary fw-bold w-100 py-2 mb-2',
                function () { startMission('basic', 'full', null); }
            ));
        }
        actions.appendChild(makeButton(
            '<i class="bi bi-book"></i> 개념 다시 보기',
            'btn btn-light fw-bold w-100 py-2 mb-2',
            function () { showView(FLOW[flow].readView); }
        ));
        const link = document.createElement('a');
        link.className = 'btn btn-light fw-bold w-100 py-2';
        link.href = LIST_HREF;
        link.textContent = '다른 주제 보러 가기';
        actions.appendChild(link);

        showView('view-done');
    }

    function makeButton(html, cls, onClick, style) {
        const b = document.createElement('button');
        b.className = cls;
        b.innerHTML = html;
        if (style) { b.setAttribute('style', style); }
        b.addEventListener('click', onClick);
        return b;
    }

    function reviewItems(ids) {
        return ids.filter(function (id) {
            const b = bestOf(id);
            return b && b !== 'firstTry';
        }).map(function (id) {
            return {
                id: id,
                flow: QUESTIONS[id].group,
                label: QUESTIONS[id].title + '<br>' + (bestOf(id) === 'solved' ? '한 번에 맞히지 못했어요' : '아직 못 맞혔어요')
            };
        });
    }

    function fillReviewList(listId, items) {
        const list = document.getElementById(listId);
        list.innerHTML = items.map(function (item) {
            return '<li><button data-q="' + item.id + '" data-flow="' + item.flow + '">' + item.label + '</button></li>';
        }).join('');
        list.querySelectorAll('[data-q]').forEach(function (button) {
            button.addEventListener('click', function () {
                startMission(button.dataset.flow, 'review', button.dataset.q);
            });
        });
    }

    function renderReview() {
        const items = reviewItems(ALL_IDS);
        document.getElementById('reviewCard').hidden = (items.length === 0);
        fillReviewList('reviewList', items);
    }

    function buildVis(el) {
        const type = el.dataset.vis;

        if (type === 'cards' || type === 'sort') {
            const values = el.dataset.values.split(',');
            el.innerHTML = values.map(function (v) { return '<div class="num-card">' + v + '</div>'; }).join('');
            return;
        }

        if (type === 'stack') {
            const values = el.dataset.values.split(',').map(Number);
            const counts = {};
            values.forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
            const keys = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });
            const maxCount = Math.max.apply(null, keys.map(function (k) { return counts[k]; }));
            const noMode = el.dataset.nomode === '1';
            el.innerHTML = keys.map(function (k) {
                const isTop = !noMode && counts[k] === maxCount;
                let dots = '';
                for (let i = 0; i < counts[k]; i++) { dots += '<div class="stack-dot"></div>'; }
                return '<div class="stack-item' + (isTop ? ' top' : '') + '">' +
                    '<div class="stack-col">' + dots + '</div>' +
                    '<div class="stack-label">' + k + '</div></div>';
            }).join('');
            return;
        }

        if (type === 'level' || type === 'outlier') {
            const values = el.dataset.values.split(',').map(Number);
            const extra = el.dataset.extra ? Number(el.dataset.extra) : null;
            const all = extra === null ? values : values.concat([extra]);
            const max = Math.max.apply(null, all);
            el.innerHTML =
                all.map(function (v, i) {
                    const isExtra = (extra !== null && i === all.length - 1);
                    const drawNow = (type === 'level') || (type === 'outlier' && !isExtra);
                    const h = drawNow ? ' style="height:' + (v / max * CHART_H) + 'px"' : '';
                    return '<div class="bar' + (isExtra ? ' tall ghost' : '') + '" data-value="' + v +
                        '" data-max="' + max + '"' + h + '>' +
                        '<span class="bar-val">' + v + '</span></div>';
                }).join('') +
                '<div class="avg-line"><span></span></div>';
            return;
        }

        if (type === 'stemleaf') {
            let rows;
            if (el.dataset.rows) {
                rows = el.dataset.rows.split(';').map(function (r) {
                    const p = r.split('=');
                    return { stem: p[0], leaves: p[1] ? p[1].split(',') : [] };
                });
            } else {
                const values = el.dataset.values.split(',').map(Number);
                const bucket = {};
                values.forEach(function (v) {
                    const s = Math.floor(v / 10);
                    (bucket[s] = bucket[s] || []).push(v % 10);
                });
                rows = Object.keys(bucket).map(Number).sort(function (a, b) { return a - b; })
                    .map(function (k) {
                        return {
                            stem: String(k),
                            leaves: bucket[k].sort(function (a, b) { return a - b; }).map(String)
                        };
                    });
            }
            el.innerHTML =
                (el.dataset.note ? '<div class="sl-note">(' + el.dataset.note + ')</div>' : '') +
                '<div class="sl-head"><span>줄기</span><span>잎</span></div>' +
                rows.map(function (r) {
                    return '<div class="sl-row"><span class="sl-stem">' + r.stem + '</span>' +
                        '<span class="sl-leaves">' +
                        r.leaves.map(function (l) { return '<b>' + l + '</b>'; }).join('') +
                        '</span></div>';
                }).join('');
            return;
        }

        if (type === 'histogram') {
            const counts = el.dataset.counts.split(',').map(Number);
            const labels = el.dataset.labels.split(',');
            const missing = (el.dataset.missing !== undefined && el.dataset.missing !== '')
                ? Number(el.dataset.missing) : -1;
            el.innerHTML =
                '<div class="histo-y">' + (el.dataset.ylabel || '') + '</div>' +
                '<div class="histo-bars">' +
                counts.map(function (c, i) {
                    const unknown = (i === missing);
                    return '<div class="hbar' + (unknown ? ' unknown' : '') + '">' +
                        '<span class="hval">' + (unknown ? '?' : c) + '</span></div>';
                }).join('') +
                '</div>' +
                (el.dataset.poly === '1' ? '<svg class="histo-poly"></svg>' : '') +
                '<div class="histo-axis">' +
                labels.map(function (l, i) {
                    return '<span style="left:' + (i / counts.length * 100) + '%">' + l + '</span>';
                }).join('') +
                (el.dataset.xlabel ? '<em>' + el.dataset.xlabel + '</em>' : '') +
                '</div>';
            return;
        }

        if (type === 'grid') {
            const total = Number(el.dataset.total);
            const warm = (el.dataset.tone === 'warm') ? ' warm' : '';
            let cells = '';
            for (let i = 0; i < total; i++) { cells += '<span class="gv-cell' + warm + '"></span>'; }
            el.innerHTML =
                (el.dataset.caption ? '<div class="gv-caption">' + el.dataset.caption + '</div>' : '') +
                '<div class="gv-cells">' + cells + '</div>' +
                (el.dataset.ratio ? '<div class="gv-ratio' + warm + '">' + el.dataset.ratio + '</div>' : '');
            return;
        }

        if (type === 'segbar') {
            const parts = el.dataset.parts.split(',').map(Number);
            const labels = (el.dataset.labels || '').split(',');
            el.innerHTML =
                '<div class="segbar">' +
                parts.map(function (p) {
                    return '<div class="seg" style="width:' + (p * 100) + '%"><span>' + p + '</span></div>';
                }).join('') + '</div>' +
                '<div class="segbar-labels">' +
                parts.map(function (p, i) {
                    return '<span style="width:' + (p * 100) + '%">' + (labels[i] || '') + '</span>';
                }).join('') + '</div>' +
                '<div class="segbar-total">' + (el.dataset.totaltext || '모두 더하면 1') + '</div>';
            return;
        }

        if (type === 'dualpoly') {
            const names = (el.dataset.names || 'A,B').split(',');
            const labels = el.dataset.labels.split(',');
            const n = el.dataset.a.split(',').length;
            el.innerHTML =
                '<div class="dual-y">' + (el.dataset.ylabel || '') + '</div>' +
                '<div class="dual-legend"><span class="a">' + names[0] + '</span><span class="b">' + names[1] + '</span></div>' +
                '<svg class="dual-svg"></svg>' +
                '<div class="histo-axis">' +
                labels.map(function (l, i) {
                    return '<span style="left:' + (i / n * 100) + '%">' + l + '</span>';
                }).join('') +
                (el.dataset.xlabel ? '<em>' + el.dataset.xlabel + '</em>' : '') +
                '</div>';
            return;
        }

        plugins.forEach(function (p) { if (p.build) { p.build(el, type); } });
    }

    function pointsOf(values, n, bw, height, usable, max) {
        const pts = [[-bw / 2, height]];
        values.forEach(function (v, i) { pts.push([(i + 0.5) * bw, height - v / max * usable]); });
        pts.push([(n + 0.5) * bw, height]);
        return pts;
    }

    function svgShapes(pts) {
        return '<polyline points="' +
            pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"></polyline>' +
            pts.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4"></circle>'; }).join('');
    }

    function playVis(el) {
        const type = el.dataset.vis;
        const wait = function (ms) { return REDUCE_MOTION ? 0 : ms; };

        if (type === 'cards') { return; }

        if (type === 'sort') {
            const sorted = el.dataset.sorted.split(',');
            const mid = (el.dataset.mid || '').split(',').map(Number);
            setTimeout(function () {
                el.innerHTML = sorted.map(function (v, i) {
                    return '<div class="num-card' + (mid.indexOf(i) > -1 ? ' mid' : '') + '">' + v + '</div>';
                }).join('');
            }, wait(700));
            return;
        }

        if (type === 'stack') {
            Array.prototype.slice.call(el.querySelectorAll('.stack-dot')).forEach(function (d, i) {
                setTimeout(function () { d.classList.add('show'); }, wait(90 * i));
            });
            return;
        }

        if (type === 'stemleaf') {
            Array.prototype.slice.call(el.querySelectorAll('.sl-leaves b')).forEach(function (leaf, i) {
                setTimeout(function () { leaf.classList.add('show'); }, wait(70 * i));
            });
            return;
        }

        if (type === 'level' || type === 'outlier') {
            const bars = Array.prototype.slice.call(el.querySelectorAll('.bar'));
            const line = el.querySelector('.avg-line');
            const max = Number(bars[0].dataset.max);

            if (type === 'level') {
                const nums = bars.map(function (b) { return Number(b.dataset.value); });
                const avg = nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
                setTimeout(function () {
                    bars.forEach(function (b) {
                        b.style.height = (avg / max * CHART_H) + 'px';
                        b.classList.add('leveled');
                        b.querySelector('.bar-val').textContent = avg;
                    });
                    line.style.bottom = (avg / max * CHART_H) + 'px';
                    line.style.opacity = '1';
                    line.querySelector('span').textContent = '평균 ' + avg;
                }, wait(1100));
                return;
            }

            if (type === 'outlier') {
                const base = bars.slice(0, bars.length - 1);
                const extraBar = bars[bars.length - 1];
                const baseNums = base.map(function (b) { return Number(b.dataset.value); });
                const avg1 = baseNums.reduce(function (a, b) { return a + b; }, 0) / baseNums.length;
                const allNums = baseNums.concat([Number(extraBar.dataset.value)]);
                const avg2 = allNums.reduce(function (a, b) { return a + b; }, 0) / allNums.length;

                setTimeout(function () {
                    line.style.bottom = (avg1 / max * CHART_H) + 'px';
                    line.style.opacity = '1';
                    line.querySelector('span').textContent = '평균 ' + avg1;
                }, wait(600));
                setTimeout(function () {
                    extraBar.classList.remove('ghost');
                    extraBar.style.height = (Number(extraBar.dataset.value) / max * CHART_H) + 'px';
                }, wait(1300));
                setTimeout(function () {
                    line.style.bottom = (avg2 / max * CHART_H) + 'px';
                    line.querySelector('span').textContent = '평균 ' + avg2;
                }, wait(1900));
            }
            return;
        }

        if (type === 'histogram') {
            const counts = el.dataset.counts.split(',').map(Number);
            const missing = (el.dataset.missing !== undefined && el.dataset.missing !== '')
                ? Number(el.dataset.missing) : -1;
            const bars = Array.prototype.slice.call(el.querySelectorAll('.hbar'));
            const height = el.clientHeight;
            const usable = height - 16;
            const rawMax = Math.max.apply(null, counts);
            const max = rawMax > 0 ? rawMax : 1;

            bars.forEach(function (b, i) {
                setTimeout(function () {
                    const c = (i === missing) ? max * 0.45 : counts[i];
                    b.style.height = (c / max * usable) + 'px';
                    b.classList.add('show');
                }, wait(130 * i));
            });

            if (el.dataset.poly === '1') {
                setTimeout(function () {
                    const svg = el.querySelector('.histo-poly');
                    if (!svg) { return; }
                    const bw = el.clientWidth / counts.length;
                    svg.innerHTML = svgShapes(pointsOf(counts, counts.length, bw, height, usable, max));
                    setTimeout(function () { svg.classList.add('dots'); }, REDUCE_MOTION ? 0 : 40);
                    setTimeout(function () { svg.classList.add('line'); }, REDUCE_MOTION ? 0 : 650);
                }, wait(130 * bars.length + 400));
            }
            return;
        }

        if (type === 'grid') {
            const part = Number(el.dataset.part);
            const cells = Array.prototype.slice.call(el.querySelectorAll('.gv-cell'));
            cells.slice(0, part).forEach(function (c, i) {
                setTimeout(function () { c.classList.add('fill'); }, wait(90 * i));
            });
            const ratio = el.querySelector('.gv-ratio');
            if (ratio) { setTimeout(function () { ratio.classList.add('show'); }, wait(90 * part + 250)); }
            return;
        }

        if (type === 'segbar') {
            const segs = Array.prototype.slice.call(el.querySelectorAll('.seg'));
            segs.forEach(function (s, i) {
                setTimeout(function () { s.classList.add('show'); }, wait(220 * i));
            });
            const total = el.querySelector('.segbar-total');
            if (total) { setTimeout(function () { total.classList.add('show'); }, wait(220 * segs.length + 200)); }
            return;
        }

        if (type === 'dualpoly') {
            const a = el.dataset.a.split(',').map(Number);
            const b = el.dataset.b.split(',').map(Number);
            const n = a.length;
            const height = el.clientHeight;
            const usable = height - 16;
            const max = Math.max(Math.max.apply(null, a), Math.max.apply(null, b)) || 1;
            const bw = el.clientWidth / n;
            const svg = el.querySelector('.dual-svg');
            if (!svg) { return; }

            svg.innerHTML =
                '<g class="pa">' + svgShapes(pointsOf(a, n, bw, height, usable, max)) + '</g>' +
                '<g class="pb">' + svgShapes(pointsOf(b, n, bw, height, usable, max)) + '</g>';

            setTimeout(function () { svg.querySelector('.pa').classList.add('on'); }, wait(200));
            setTimeout(function () { svg.querySelector('.pb').classList.add('on'); }, wait(900));
        }

        plugins.forEach(function (p) { if (p.play) { p.play(el, type); } });
    }

    function setupMotion() {
        document.querySelectorAll('[data-vis]').forEach(function (el) {
            if (el.dataset.built === '1') { return; }
            buildVis(el);
            el.dataset.built = '1';
            const replay = el.parentElement.querySelector('.replay');
            if (replay) {
                /* 한 카드 안에 시각 자료가 여러 개면 함께 다시 재생합니다 */
                replay.addEventListener('click', function () {
                    el.parentElement.querySelectorAll('[data-vis]').forEach(function (sib) {
                        buildVis(sib);
                        playVis(sib);
                    });
                });
            }
            visObserver.observe(el);
        });
        document.querySelectorAll('.solve-item').forEach(function (el) {
            if (el.dataset.watch === '1') { return; }
            el.dataset.watch = '1';
            if (REDUCE_MOTION) { el.classList.add('in'); return; }
            solveObserver.observe(el);
        });
    }

    function refreshInView(container) {
        if (!container) { return; }
        const half = window.innerHeight * 0.5;
        container.querySelectorAll('[data-vis]').forEach(function (el) {
            if (el.dataset.played === '1') { return; }
            if (el.getBoundingClientRect().top < half) {
                el.dataset.played = '1';
                playVis(el);
            }
        });
        container.querySelectorAll('.solve-item').forEach(function (el) {
            if (el.getBoundingClientRect().top < window.innerHeight * 0.75) { el.classList.add('in'); }
        });
    }

    const visObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) { return; }
            if (entry.target.dataset.played === '1') { return; }
            entry.target.dataset.played = '1';
            playVis(entry.target);
        });
    }, { threshold: 0, rootMargin: '0px 0px -50% 0px' });

    const solveObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                solveObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0, rootMargin: '0px 0px -25% 0px' });

    /* ---------- 화면 · 버튼 연결 ---------- */
    function bindEvents() {
        document.getElementById('prevQ').addEventListener('click', function () {
            if (session.index > 0) {
                session.index--;
                renderCurrentQuestion();
                window.scrollTo({ top: 0, behavior: 'auto' });
            }
        });

        document.getElementById('nextQ').addEventListener('click', function () {
            if (session.index < session.ids.length - 1) {
                session.index++;
                renderCurrentQuestion();
                window.scrollTo({ top: 0, behavior: 'auto' });
            } else {
                showResult(session.flow);
            }
        });

        document.getElementById('gateAha').addEventListener('click', function () {
            record.gate = 'aha';
            saveRecord();
            document.getElementById('gateWaitNote').hidden = true;
            startMission('basic', 'full', null);
        });

        document.getElementById('gateWait').addEventListener('click', function () {
            record.gate = 'notYet';
            saveRecord();
            document.getElementById('gateWaitNote').hidden = false;
        });

        document.getElementById('gateOpenAnyway').addEventListener('click', function () { startMission('basic', 'full', null); });

        const gateJump = document.getElementById('gateJump');
        if (gateJump) {
            gateJump.addEventListener('click', function () { showView('view-cread'); });
            if (!FLOW.challenge.ids.length) { gateJump.hidden = true; }   // 심화 문항이 없으면 버튼 숨김
        }

        const cgateAha = document.getElementById('cgateAha');
        if (cgateAha) {
            cgateAha.addEventListener('click', function () {
                record.challengeGate = 'aha';
                saveRecord();
                document.getElementById('cgateWaitNote').hidden = true;
                startMission('challenge', 'full', null);
            });
            document.getElementById('cgateWait').addEventListener('click', function () {
                record.challengeGate = 'notYet';
                saveRecord();
                document.getElementById('cgateWaitNote').hidden = false;
            });
            document.getElementById('cgateOpenAnyway').addEventListener('click', function () { startMission('challenge', 'full', null); });
        }

        document.getElementById('backBtn').addEventListener('click', function () {
            if (activeView === 'view-read' || activeView === 'view-cread') {
                window.location.href = LIST_HREF;
            } else if (activeView === 'view-mission' && session) {
                showView(FLOW[session.flow].readView);
            } else {
                showView('view-read');
            }
        });

        document.getElementById('resetBtn').addEventListener('click', function () {
            if (!window.confirm('이 주제의 학습 기록을 모두 지울까요?')) { return; }
            Store.remove(STORAGE_KEY);
            window.location.reload();
        });

        const toTop = document.getElementById('toTop');
        toTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
        });

        let ticking = false;
        window.addEventListener('scroll', function () {
            if (ticking) { return; }
            ticking = true;
            window.requestAnimationFrame(function () {
                updateScrollUI();
                toTop.classList.toggle('show', window.scrollY > 600);
                ticking = false;
            });
        }, { passive: true });
    }

    /* ---------- 시작 ---------- */
    function start(config) {
        TOPIC_ID = config.topicId;
        RECORD_VERSION = config.recordVersion || 1;
        QUESTIONS = config.questions || {};
        LIST_HREF = config.listHref || LIST_HREF;
        STORAGE_KEY = 'ahamath.' + TOPIC_ID + '.v1';

        FLOW = {
            basic: {
                ids: Object.keys(QUESTIONS).filter(function (k) { return QUESTIONS[k].group === 'basic'; }),
                label: '기초 확인 미션', readView: 'view-read'
            },
            challenge: {
                ids: Object.keys(QUESTIONS).filter(function (k) { return QUESTIONS[k].group === 'challenge'; }),
                label: '도전 미션', readView: 'view-cread'
            }
        };
        ALL_IDS = Object.keys(QUESTIONS);
        record = loadRecord();

        bindEvents();
        syncRecord();
        setupMotion();
        renderReview();
        showView('view-read');
    }

    function registerVis(plugin) { plugins.push(plugin); }

    global.AhaMath = {
        start: start,
        registerVis: registerVis,
        wait: function (ms) { return REDUCE_MOTION ? 0 : ms; },
        REDUCE_MOTION: REDUCE_MOTION,
        pointsOf: pointsOf,
        svgShapes: svgShapes,
        buildVis: buildVis,
        playVis: playVis
    };
})(window);
