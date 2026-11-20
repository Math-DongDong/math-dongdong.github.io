/* =============================================================================
   아하! 수학 학습 페이지 공통 엔진          js/ahamath.js
   -----------------------------------------------------------------------------
   학습 페이지에서는 이렇게만 부르면 됩니다.

     <script src="../../../../js/ahamath.js"></script>
     <script>
         AhaMath.start({
             topicId: 'coordinate',      // ahamath.html 의 TOPICS id 와 같게
             recordVersion: 1,           // 문항 구성이 바뀌면 숫자를 올려요
             questions: { q1: { ... } }  // 기초 q1~, 도전 x1~
         });
     </script>

   주제마다 다른 시각 자료가 필요하면 start 보다 먼저 등록하세요.

     AhaMath.registerVis({
         build: function (el, type) { if (type === 'plane') { ... } },
         play:  function (el, type) { if (type === 'plane') { ... } },
         describe: function (el, type) { return ''; }   // 화면 읽기 프로그램용 그림 설명 (없어도 됨)
     });

   그림 설명 : 그림마다 data-alt="보이는 것을 말로" 를 적으면 화면 읽기 프로그램이 읽어요.
              문항 속 그림은 data-alt 필수. 기본 10종은 자료 숫자로 설명을 자동으로 만들어요.

   기본 제공 시각 자료 10종
   cards · level · outlier · sort · stack · stemleaf · histogram · grid · segbar · dualpoly
   ============================================================================= */
(function (global) {
    'use strict';

    // 이 파일(js/ahamath.js)의 주소 — 같은 폴더의 공용 모달(ui-dialog.js)을 찾을 때 씁니다
    const SCRIPT_URL = (document.currentScript && document.currentScript.src) || '';

    /**
     * 확인 모달 (window.confirm 대체) — 사이트 공용 모달(js/ui-dialog.js)로 그립니다.
     * 확인 버튼을 눌렀을 때만 true로 끝나고, 공용 모달을 못 불러오면 기본 확인창으로 대신합니다.
     */
    function confirmDialog(title, message, okText) {
        if (!SCRIPT_URL) return Promise.resolve(global.confirm(message));
        return import(new URL('ui-dialog.js', SCRIPT_URL).href)
            .then(function (m) { return m.uiConfirm(title, message, { confirmText: okText || '확인', type: 'danger' }); })
            .catch(function () { return global.confirm(message); });
    }

    const CHART_H = 150;
    const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const RANK = { missed: 0, solved: 1, firstTry: 2 };
    const plugins = [];

    let TOPIC_ID = '';
    let RECORD_VERSION = 1;
    let STORAGE_KEY = '';
    let LIST_HREF = '../../ahamath.html';   // 주제 목록(메인) 경로
    let QUESTIONS = {};
    let FLOW = null;
    let ALL_IDS = [];
    let record = null;
    let activeView = 'view-read';
    let session = null;
    let attempts = {};
    let choiceOrder = {};   // 이번 미션에서 문항별 보기 순서 (미션에 들어올 때마다 새로 섞어요)

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
        const backRow = document.getElementById('backRow');   /* '개념 다시 보기' 줄 : 결과 화면에서만 (미션 화면은 mission-top 의 버튼) */
        const bar = document.getElementById('progressBar');

        if (activeView === 'view-read' || activeView === 'view-cread') {
            backRow.hidden = true;
            updateScrollUI();
            return;
        }
        backRow.hidden = activeView !== 'view-done';

        if (activeView === 'view-mission' && session) {
            bar.style.width = Math.round((session.index + 1) / session.ids.length * 100) + '%';
            return;
        }
        bar.style.width = '100%';
    }

    function updateScrollUI() {
        if (activeView !== 'view-read' && activeView !== 'view-cread') { return; }
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        const percent = scrollable <= 0 ? 0 : Math.min(100, Math.round(window.scrollY / scrollable * 100));
        document.getElementById('progressBar').style.width = percent + '%';
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
        choiceOrder = {};   // 보기 순서도 새로 섞어서, 정답 자리를 외워 맞히지 못하게 해요
        showView('view-mission');
        renderCurrentQuestion();
        focusQuestionTitle();
    }

    /* 보기 순서 섞기 : 같은 미션 안에서는 [이전]·[다음]으로 오가도 순서가 그대로예요 */
    function shuffledCopy(list) {
        const copy = list.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = copy[i];
            copy[i] = copy[j];
            copy[j] = temp;
        }
        return copy;
    }

    function choicesOf(id) {
        if (!choiceOrder[id]) { choiceOrder[id] = shuffledCopy(QUESTIONS[id].choices); }
        return choiceOrder[id];
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
            '<h2 class="card-title" tabindex="-1">' + q.badge + '</h2>' +
            '<p class="lead-text">' + q.stem + '</p>' +
            /* 조건 상자가 비어 있으면 아예 만들지 않습니다 */
            (String(q.data || '').trim() ? '<div class="data-line">' + q.data + '</div>' : '') +
            choicesOf(id).map(function (c) {
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
        speakFractions(card);

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

        /* 화면 읽기 프로그램 : 안내 문구를 읽어 주고, 다음에 누를 곳으로 초점을 옮겨요
           (카드를 새로 그리면 누른 버튼이 사라져 초점이 페이지 맨 앞으로 튕기기 때문이에요) */
        const fb = document.getElementById('fb');
        if (fb && !fb.hidden) { announce(fb.innerHTML); }
        if (picked.correct) {
            focusQuietly(document.getElementById('nextQ'));
        } else {
            focusQuietly(document.querySelector('#questionCard .choice:not(:disabled)'));
        }
    }

    /* ---------- 화면 읽기 프로그램 도우미 ---------- */
    let liveRegion = null;

    /* 화면에는 보이지 않고 소리로만 읽히는 안내 상자 (페이지에 하나만 두고 계속 씁니다) */
    function announce(html) {
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.className = 'visually-hidden';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            document.body.appendChild(liveRegion);
        }
        const text = speechText(html);
        liveRegion.textContent = '';   // 같은 문구가 이어져도 다시 읽히도록 한 번 비워요
        setTimeout(function () { liveRegion.textContent = text; }, 80);
    }

    /* 화면은 움직이지 않고 초점만 옮겨요 */
    function focusQuietly(el) {
        if (!el) { return; }
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    }

    function focusQuestionTitle() {
        focusQuietly(document.querySelector('#questionCard .card-title'));
    }

    /* 분수 모양(.frac) 하나를 'b분의 a' 로 읽는 글 (분수 표기 방식 세 가지를 모두 받아요) */
    function fractionWords(frac) {
        const signEl = frac.querySelector('b');   // 분수 안에 넣은 부호 (+ 또는 −) 를 그대로 읽어요
        const sign = signEl ? signEl.textContent.trim() : '';
        const parts = Array.prototype.filter.call(frac.children, function (c) { return c.tagName !== 'B'; });
        if (parts.length < 2) { return ''; }
        return sign + parts[parts.length - 1].textContent.trim() + '분의 ' + parts[0].textContent.trim();
    }

    /* 화면의 분수 모양은 '1 5' 처럼 붙어 읽혀서, 보이지 않는 '5분의 1' 을 앞에 덧붙이고 모양은 읽지 않게 해요 */
    function speakFractions(root) {
        if (!root || !root.querySelectorAll) { return; }
        root.querySelectorAll('.frac:not([aria-hidden])').forEach(function (frac) {
            const words = fractionWords(frac);
            if (!words || !frac.parentNode) { return; }
            const voice = document.createElement('span');
            voice.className = 'visually-hidden';
            voice.textContent = ' ' + words + ' ';
            frac.setAttribute('aria-hidden', 'true');
            frac.parentNode.insertBefore(voice, frac);
        });
    }

    /* 소리로 읽기 좋은 글로 바꿔요 : 분수 모양 → 'b분의 a', ‾AB → '선분 AB', ∠ → '각' */
    function speechText(source) {
        const box = document.createElement('template');
        box.innerHTML = String(source || '');
        const root = box.content;
        root.querySelectorAll('[aria-hidden="true"]').forEach(function (el) { el.remove(); });   // 소리용 글이 이미 있는 분수는 한 번만 읽게
        root.querySelectorAll('br').forEach(function (br) { br.replaceWith(' '); });
        root.querySelectorAll('.frac').forEach(function (frac) {
            const words = fractionWords(frac);
            if (words) { frac.replaceWith(' ' + words + ' '); }
        });
        return root.textContent
            .replace(/‾([A-Z]{2,})/g, '선분 $1')
            .replace(/→([A-Z]{2,})/g, '반직선 $1')
            .replace(/↔([A-Z]{2,})/g, '직선 $1')
            .replace(/∠\s*/g, '각 ')
            .replace(/(\d+)\s*\/\s*(\d+)/g, '$2분의 $1')
            .replace(/(\d)\s*~\s*(\d)/g, '$1에서 $2')
            .replace(/\s+/g, ' ')
            .trim();
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
        if (thisTime * 2 >= total) { return '끝까지 풀었어요. 개념을 한 번 더 읽고 아래 다시 볼 문제에 도전해 볼까요?'; }
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

        /* 안내 문구는 '이번 결과' 기준 : 예전에 모두 맞힌 기록이 있어도 이번에 틀렸으면 완벽하다고 하지 않아요 */
        const master = document.getElementById('doneMaster');
        const allThisTime = thisTime === sessionIds.length;
        if (isMastered(flow) && allThisTime) {
            master.className = 'badge-master on';
            master.innerHTML = '<i class="bi bi-lightbulb-fill"></i> ' +
                (flow === 'basic' ? '기초 미션' : '도전 미션') + '을 모두 한 번에 맞혔어요! 완벽해요!';
        } else if (isMastered(flow)) {
            master.className = 'badge-master off';
            master.innerHTML = '<i class="bi bi-bookmark-fill"></i> 전에 모두 맞힌 기록은 <b>그대로 남아 있어요.</b><br>' +
                '이번에 헷갈린 문제는 개념을 다시 보며 확인해 봐요.';
        } else {
            master.className = 'badge-master off';
            master.innerHTML = '<i class="bi bi-bookmark-fill"></i> 아래 <b>다시 볼 문제</b>를 한 번에 맞히면<br><b>기록에 하나씩 쌓여요!</b>';
        }
        master.hidden = false;

        const items = reviewItems(ids);
        document.getElementById('doneReviewBox').hidden = (items.length === 0);
        fillReviewList('doneReviewList', items);
        document.getElementById('doneReviewList').classList.toggle('is-challenge', flow === 'challenge');

        const actions = document.getElementById('doneActions');
        actions.innerHTML = '';

        /* '다시 볼 문제만 풀어 보기'는 개념을 다시 읽은 뒤 풀도록 첫 화면의 다시 볼 문제 영역에 둬요 */
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
        /* '개념 다시 보기'는 화면 왼쪽 위 링크(#backBtn)가 맡아요 */
        const link = document.createElement('a');
        link.className = 'btn btn-light fw-bold w-100 py-2';
        link.href = LIST_HREF;
        link.textContent = '다른 주제 보러 가기';
        actions.appendChild(link);

        showView('view-done');
        const doneTitle = document.getElementById('doneTitle');
        if (doneTitle) {
            doneTitle.setAttribute('tabindex', '-1');
            focusQuietly(doneTitle);
        }
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
                /* 제목 안의 <br>은 한 줄로 펴고, 반복되는 '한 번에 맞히지 못했어요'는 생략 */
                label: QUESTIONS[id].title.replace(/<br\s*\/?>/gi, ' ') + (bestOf(id) === 'solved' ? '' : ' · 아직 못 맞혔어요')
            };
        });
    }

    function fillReviewList(listId, items) {
        const list = document.getElementById(listId);
        /* 목록은 보여 주기만 해요. 다시 풀기는 첫 화면의 '다시 볼 문제만 풀어 보기' 버튼으로 */
        list.innerHTML = items.map(function (item) {
            return '<li><span class="review-item">' + item.label + '</span></li>';
        }).join('');
    }

    function renderReview() {
        const items = reviewItems(ALL_IDS);
        const reviewCard = document.getElementById('reviewCard');
        reviewCard.hidden = (items.length === 0);
        /* 예전 단일 목록은 쓰지 않아요 (기초 · 도전 상자로 나눠서 보여 줌) */
        document.getElementById('reviewList').hidden = true;

        /* 기초는 노랑, 도전은 분홍 상자 : 상자 전체를 누르면 그 문제들만 다시 풀어요 */
        let groups = document.getElementById('reviewGroups');
        if (!groups) {
            groups = document.createElement('div');
            groups.id = 'reviewGroups';
            groups.className = 'd-grid gap-2 mt-1';
            reviewCard.appendChild(groups);
        }
        groups.innerHTML = '';
        ['basic', 'challenge'].forEach(function (flow) {
            const flowItems = items.filter(function (item) { return item.flow === flow; });
            if (!flowItems.length) { return; }
            const name = (flow === 'basic' ? '기초 미션' : '도전 미션');
            const html =
                '<span class="review-group-head">' +
                    '<span>' + name + ' · ' + flowItems.length + '문제</span>' +
                    '<span class="review-go">다시 풀기 <i class="bi bi-chevron-right"></i></span>' +
                '</span>' +
                flowItems.map(function (item) {
                    return '<span class="review-item">' + item.label + '</span>';
                }).join('');
            const box = makeButton(
                html,
                'review-group ' + (flow === 'basic' ? 'is-basic' : 'is-challenge'),
                function () { startMission(flow, 'review', null); }
            );
            box.type = 'button';
            box.setAttribute('aria-label', name + ' 다시 볼 문제 ' + flowItems.length + '개 다시 풀기');
            groups.appendChild(box);
        });
    }

    /* 그림을 그리고, 화면 읽기 프로그램이 읽을 설명을 붙여요 */
    function buildVis(el) {
        drawVis(el);
        try {
            labelVis(el);
            speakFractions(el);
        } catch (e) { /* 설명을 못 붙여도 그림은 그대로 보여요 */ }
    }

    /* ---------- 그림 설명 (화면 읽기 프로그램용) ----------
       쓰는 순서 : ① data-alt (직접 적은 설명)
                  ② registerVis 의 describe(el, type) (페이지 · 단원 전용 그림이 스스로 내는 설명)
                  ③ 기본 10종은 data-values · data-counts 같은 자료로 자동 설명
                  ④ data-caption
       설명이 있으면 그림 전체를 '이미지 한 장 + 설명'으로 읽혀요.
       설명이 없으면 손대지 않아요 (글자로 된 그림은 원래대로 글자가 읽혀요). */
    function labelVis(el) {
        /* 버튼 · 입력 칸이 들어 있는 그림은 학생이 직접 다뤄야 하니 그대로 둬요 */
        if (el.querySelector('button, input, select, textarea, a[href]')) { return; }
        const text = speechText(describeVis(el));
        if (!text) { return; }
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', text);
    }

    function describeVis(el) {
        const type = el.dataset.vis;
        if (el.dataset.alt) { return el.dataset.alt; }
        for (let i = 0; i < plugins.length; i++) {
            const text = plugins[i].describe ? plugins[i].describe(el, type) : '';
            if (text) { return text; }
        }
        return describeBuiltIn(el, type) || el.dataset.caption || '';
    }

    function listOf(text) {
        return String(text || '').split(',').map(function (v) { return v.trim(); })
            .filter(function (v) { return v !== ''; });
    }

    function roundText(v) { return String(Math.round(v * 100) / 100); }

    /* 숫자 뒤에 붙는 '은/는' (받침이 있는 영 · 일 · 삼 · 육 · 칠 · 팔 뒤에는 '은') */
    function topicOf(v) {
        const last = String(v).trim().slice(-1);
        return v + ('013678'.indexOf(last) > -1 ? '은' : '는');
    }

    function axisText(el) {
        const strip = function (s) { return String(s || '').replace(/[()]/g, '').trim(); };
        const x = strip(el.dataset.xlabel), y = strip(el.dataset.ylabel);
        return (x || y) ? ' (가로축 ' + (x || '계급') + ', 세로축 ' + (y || '도수') + ')' : '';
    }

    function classText(labels, i) {
        return (labels[i] !== undefined && labels[i + 1] !== undefined)
            ? labels[i] + ' 이상 ' + labels[i + 1] + ' 미만' : (labels[i] || '');
    }

    /* 기본 10종 : 자료 숫자로 설명을 자동으로 만들어요 */
    function describeBuiltIn(el, type) {
        const d = el.dataset;

        if (type === 'cards') {
            const values = listOf(d.values);
            return '숫자 카드 ' + values.length + '장: ' + values.join(', ');
        }

        if (type === 'sort') {
            const sorted = listOf(d.sorted);
            const mids = listOf(d.mid).map(function (i) { return sorted[Number(i)]; });
            return '숫자 카드 ' + listOf(d.values).join(', ') + ' 를 작은 수부터 줄 세우면 ' + sorted.join(', ') +
                (mids.length ? '. 가운데 ' + (mids.length > 1 ? '두 수: ' : '수: ') + mids.join(', ') : '');
        }

        if (type === 'stack') {
            const counts = {};
            listOf(d.values).forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
            const keys = Object.keys(counts).sort(function (a, b) { return Number(a) - Number(b); });
            const max = Math.max.apply(null, keys.map(function (k) { return counts[k]; }));
            const tops = keys.filter(function (k) { return counts[k] === max; });
            return '같은 값끼리 블록을 쌓은 그림: ' +
                keys.map(function (k) { return topicOf(k) + ' ' + counts[k] + '개'; }).join(', ') +
                (d.nomode === '1' ? '' : '. 가장 높이 쌓인 값: ' + tops.join(', '));
        }

        if (type === 'level' || type === 'outlier') {
            const values = listOf(d.values).map(Number);
            const avg = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
            const head = '막대 ' + values.length + '개의 높이: ' + values.join(', ');
            if (type === 'level') {
                return head + '. 높이를 똑같이 맞추면 모두 ' + roundText(avg) + ', 평균 ' + roundText(avg);
            }
            const extra = Number(d.extra);
            const all = values.concat([extra]);
            const avg2 = all.reduce(function (a, b) { return a + b; }, 0) / all.length;
            return head + '. 평균 ' + roundText(avg) + '. 여기에 높이 ' + extra + ' 인 막대가 더해지면 평균 ' + roundText(avg2);
        }

        if (type === 'stemleaf') {
            const rows = Array.prototype.map.call(el.querySelectorAll('.sl-row'), function (row) {
                const leaves = Array.prototype.map.call(row.querySelectorAll('.sl-leaves b'), function (b) { return b.textContent; });
                return '줄기 ' + row.querySelector('.sl-stem').textContent + ', 잎 ' + (leaves.join(' ') || '없음');
            });
            return '줄기와 잎 그림' + (d.note ? ' (' + d.note + ')' : '') + ': ' + rows.join('; ');
        }

        if (type === 'histogram') {
            const counts = listOf(d.counts);
            const labels = listOf(d.labels);
            const missing = (d.missing !== undefined && d.missing !== '') ? Number(d.missing) : -1;
            return (d.poly === '1' ? '히스토그램과 도수분포다각형' : '히스토그램') + axisText(el) + ': ' +
                counts.map(function (c, i) {
                    return classText(labels, i) + ' ' + (i === missing ? '알 수 없음' : c);
                }).join(', ');
        }

        if (type === 'grid') {
            return '전체 ' + d.total + '칸 중 ' + d.part + '칸 색칠' +
                (d.caption ? '. ' + d.caption : '') + (d.ratio ? '. ' + d.ratio : '');
        }

        if (type === 'segbar') {
            const labels = listOf(d.labels);
            return '전체를 1로 본 띠: ' + listOf(d.parts).map(function (p, i) {
                return (labels[i] ? labels[i] + ' ' : '') + p;
            }).join(', ') + '. ' + (d.totaltext || '모두 더하면 1');
        }

        if (type === 'dualpoly') {
            const names = (d.names || 'A,B').split(',');
            const labels = listOf(d.labels);
            const line = function (values) {
                return listOf(values).map(function (v, i) { return classText(labels, i) + ' ' + v; }).join(', ');
            };
            return '두 자료를 겹쳐 그린 그래프' + axisText(el) + '. ' +
                names[0] + ': ' + line(d.a) + '. ' + names[1] + ': ' + line(d.b);
        }

        return '';
    }

    function drawVis(el) {
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
                focusQuestionTitle();
            }
        });

        document.getElementById('nextQ').addEventListener('click', function () {
            if (session.index < session.ids.length - 1) {
                session.index++;
                renderCurrentQuestion();
                window.scrollTo({ top: 0, behavior: 'auto' });
                focusQuestionTitle();
            } else {
                showResult(session.flow);
            }
        });

        const gateJump = document.getElementById('gateJump');

        /* 도전 버튼 표시 : 심화 문항이 있고, '아직은....' 을 누르지 않았을 때만 보여요 */
        function setGateJumpVisible(isVisible) {
            if (gateJump) { gateJump.hidden = !(isVisible && FLOW.challenge.ids.length); }
        }

        /* '아직은....'을 누르면 같은 줄의 두 버튼(.gate-choice)을 숨기고, 미션으로 넘어갈 때 다시 보이게 해요 */
        function toggleGateChoice(waitButtonId, isVisible) {
            const choice = document.getElementById(waitButtonId).closest('.gate-choice');
            if (choice) { choice.classList.toggle('d-none', !isVisible); }
        }

        /* '아직은....' 안내 상자 : 미션 대신 다른 주제로 갈 수 있도록 목록 링크를 넣어요 (모든 학습 페이지 공통) */
        function addListLink(noteId, anywayId) {
            const note = document.getElementById(noteId);
            const anyway = document.getElementById(anywayId);
            if (!note || !anyway || note.querySelector('.to-list')) { return; }
            const link = document.createElement('a');
            link.className = 'btn btn-light w-100 mb-2 fw-bold to-list';
            link.href = LIST_HREF;
            link.innerHTML = '<i class="bi bi-grid"></i> 다른 주제 보러 가기';
            anyway.parentNode.insertBefore(link, anyway);
        }
        addListLink('gateWaitNote', 'gateOpenAnyway');
        addListLink('cgateWaitNote', 'cgateOpenAnyway');

        document.getElementById('gateAha').addEventListener('click', function () {
            record.gate = 'aha';
            saveRecord();
            document.getElementById('gateWaitNote').hidden = true;
            setGateJumpVisible(true);
            startMission('basic', 'full', null);
        });

        document.getElementById('gateWait').addEventListener('click', function () {
            record.gate = 'notYet';
            saveRecord();
            document.getElementById('gateWaitNote').hidden = false;
            toggleGateChoice('gateWait', false);   // '아하! 이해했어요' · '아직은....' 버튼 숨김
            setGateJumpVisible(false);   // 아직 어려운 학생에게는 도전 코스를 감춰요
        });

        document.getElementById('gateOpenAnyway').addEventListener('click', function () {
            toggleGateChoice('gateWait', true);
            document.getElementById('gateWaitNote').hidden = true;
            startMission('basic', 'full', null);
        });

        if (gateJump) {
            gateJump.addEventListener('click', function () { showView('view-cread'); });
            setGateJumpVisible(true);
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
                toggleGateChoice('cgateWait', false);
            });
            document.getElementById('cgateOpenAnyway').addEventListener('click', function () {
                toggleGateChoice('cgateWait', true);
                document.getElementById('cgateWaitNote').hidden = true;
                startMission('challenge', 'full', null);
            });
        }

        function goBack() {
            if (activeView === 'view-read' || activeView === 'view-cread') {
                window.location.href = LIST_HREF;
            } else if (session) {   /* 미션 · 결과 화면 : 방금 푼 미션의 개념 화면으로 (도전이면 심화 개념) */
                showView(FLOW[session.flow].readView);
            } else {
                showView('view-read');
            }
        }
        document.getElementById('backBtn').addEventListener('click', goBack);
        const missionBackBtn = document.getElementById('missionBackBtn');
        if (missionBackBtn) { missionBackBtn.addEventListener('click', goBack); }

        document.getElementById('resetBtn').addEventListener('click', function () {
            confirmDialog('학습 기록 지우기', '이 주제의 학습 기록을 모두 지울까요?\n지운 기록은 되돌릴 수 없어요.', '지우기')
                .then(function (confirmed) {
                    if (!confirmed) { return; }
                    Store.remove(STORAGE_KEY);
                    window.location.reload();
                });
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
        speakFractions(document.querySelector('main') || document.body);   // 본문의 분수도 소리로 읽히게
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
