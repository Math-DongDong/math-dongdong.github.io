/**
 * game-kit.js  (v3)
 * 게임 페이지에서 반복되는 부분을 모아 둔 공통 부품
 *
 * ─────────────────────────────────────────────────────────────────────
 *  왜 만들었나
 *
 *  게임 7개를 만들면서 아래 코드가 그대로 복사되어 있었습니다.
 *    · 게스트 승인 배너            5곳에 동일
 *    · 방 목록 불러오기            6곳에 거의 동일
 *    · 방 코드 생성                7곳에 동일
 *    · 접속 상태 뱃지              3곳에 동일
 *    · 방 삭제 시 하위 컬렉션 정리  5곳에 동일
 *
 *  복사본이 늘어나면 한 곳을 고쳤을 때 나머지를 놓칩니다.
 *  (실제로 좀비헌터만 XSS 수정이 빠져 있었습니다)
 *  새 게임을 만들 때는 이 파일을 가져다 쓰세요.
 *
 *  ※ v4: 게임 7개가 모두 이 파일을 씁니다.
 *    페이지와 이 파일 모두 room-auth.js?v=4.5 으로 불러야 합니다 (주소가 다르면 모듈이 둘로 갈라집니다).
 * ─────────────────────────────────────────────────────────────────────
 */
import { db as fsdb, rtdbPresence } from "./firebase-config.js";
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, serverTimestamp as fsTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
    ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp as rtTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import {
    escapeHtml, safeNumber, customAlert, customConfirm, customPrompt, promptRoomMode
} from "./room-auth.js?v=4.5";
import {
    GAME_SUBS, rtdbUrl, registerRoom, unregisterRoom, presenceRoomPath, removeRoomPresence
} from "./room-registry.js";

// =====================================================================
// 1. 작은 도구들
// =====================================================================

/**
 * 방 코드 생성용 문자.
 * ★ O/0, I/1 을 뺐습니다. 저학년이 방 코드를 가장 많이 틀리는 지점입니다.
 */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 4) {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
    }
    return code;
}

/**
 * 닉네임 → 학번 대응표.
 *
 * ★ 학번은 Firestore students 문서에만 있고 교사만 읽을 수 있습니다.
 *   순위표(records)나 RTDB 노드에는 절대 넣지 않습니다 — 그쪽은 공개 읽기입니다.
 *   두 값은 선생님 화면에서만 합쳐집니다.
 *
 * @param {Array} students students 컬렉션 문서 배열
 */
export function buildSidMap(students) {
    const map = {};
    (students || []).forEach(st => {
        if (st && st.nickname && st.studentId) map[st.nickname] = String(st.studentId);
    });
    return map;
}

/**
 * 대전 게임(10초 신호) 대시보드의 '접속 끊김' 기준 — 오목·가위바위보·블로토 공통.
 * ★ 대시보드 표시용입니다. 게임 안의 중복 접속·장기 이탈 판정 기준은 각 게임 상수를 그대로 씁니다.
 */
export const RTDB_OFFLINE_MS = 60 * 1000;

/**
 * 대전 게임 players/{닉} 노드 접속 판정 (now는 서버 시각을 넘기세요)
 *   online   접속중     — 신호 60초 이내
 *   away     다른화면   — 신호 60초 이내, 탭 숨김
 *   offline  접속 끊김  — offline이 되었거나 신호가 60초 넘게 없음
 *   idle     미접속     — 마지막 신호 뒤 30분이 지남 (학생 관리 페이지와 같은 회색)
 * order: 정렬용 0 접속중 → 1 다른화면 → 2 접속 끊김 → 3 미접속
 */
export function heartbeatStatus(node, { now = Date.now(), offlineMs = RTDB_OFFLINE_MS, idleMs = PRESENCE_DROP_MS } = {}) {
    const hb = typeof node?.lastHeartbeat === 'number' ? node.lastHeartbeat : 0;
    const age = now - hb;
    if (!hb || age >= idleMs) return { key: 'idle', label: '미접속', text: 'text-muted', order: 3 };
    if (node.status === 'offline' || age >= offlineMs) return { key: 'offline', label: '접속 끊김', text: 'text-danger', order: 2 };
    if (node.status === 'away') return { key: 'away', label: '다른화면', text: 'text-warning', order: 1 };
    return { key: 'online', label: '접속중', text: 'text-success', order: 0 };
}

/**
 * RTDB 하트비트 기반 접속 상태 뱃지 HTML (heartbeatStatus 판정 + STATUS_DOT_CSS).
 * 문구와 색을 게임마다 맞추기 위해 여기 한 곳에 모았습니다.
 *
 * @param {object} node   players/{닉} 노드 값
 * @param {object} opts   { now, offlineMs, idleMs, short }  short: '접속 끊김' 대신 '끊김' (열이 좁은 표)
 */
export function statusBadge(node, { now = Date.now(), offlineMs = RTDB_OFFLINE_MS, idleMs = PRESENCE_DROP_MS, short = false } = {}) {
    const st = heartbeatStatus(node, { now, offlineMs, idleMs });
    const label = (short && st.key === 'offline') ? '끊김' : st.label;
    return `<span class="status-dot status-${st.key}"></span><span class="${st.text} small fw-bold">${label}</span>`;
}

/** statusBadge와 짝을 이루는 CSS. <style> 안에 한 번 붙여 넣으세요. */
export const STATUS_DOT_CSS = `
.status-dot { display:inline-block; width:9px; height:9px; border-radius:50%;
              margin-right:4px; vertical-align:middle; }
.status-online  { background-color:#198754; }
.status-away    { background-color:#ffc107; }
.status-offline { background-color:#dc3545; }
.status-idle    { background-color:#ced4da; }
`;

/** 학번 열 숨김 토글용 CSS. 표를 다시 그려도 유지되도록 클래스로만 제어합니다. */
export const STUDENT_ID_CSS = `
.col-studentid { display:none; }
.show-sid .col-studentid { display:table-cell; }
.sid-chip { display:none; font-size:0.72rem; background:#1e293b; color:#fff;
            border-radius:6px; padding:1px 6px; margin-right:4px; }
.show-sid .sid-chip { display:inline-block; }
`;

/**
 * 학번 표시 토글 연결.
 * @param {HTMLElement} checkbox  토글 체크박스
 * @param {Array} targets         show-sid 클래스를 걸 요소들 (표, 포스트잇 컨테이너 등)
 */
export function bindStudentIdToggle(checkbox, targets) {
    if (!checkbox) return;
    checkbox.addEventListener('change', (e) => {
        targets.filter(Boolean).forEach(el => el.classList.toggle('show-sid', e.target.checked));
    });
}

const adminRoomOptionRenderers = new WeakMap();

/**
 * 관리자 학교 필터의 기본값 — 정보수정에서 설정한 학교.
 * 비었거나 '관리자'(학교 미설정 기본값)면 빈 값 → '전체 학교'.
 */
export function adminDefaultSchool() {
    const school = String(window.currentTeacherSchool || '').trim();
    return school && school !== '관리자' ? school : '';
}

/**
 * 방 드롭다운 그리기. 관리자에게는 dashboard-header의 학교 필터(전체 학교)를 함께 보여 줍니다.
 * firestoreRoom·rtdbRoom을 쓰지 않고 방 목록을 직접 읽는 페이지(블로토)도 이 함수로 그립니다.
 * @param {Array} rooms [{ code, data }] — 학교 필터는 data.creatorSchool 로 나눕니다
 */
export function renderRoomOptions(selectEl, rooms, labelFn, emptyTeacherText = '') {
    // 메모 이름순 정렬 (한글·숫자 자연 정렬). 메모 없는 방은 뒤로, 같으면 코드순.
    const getMemo = room => String(room.data.memo || '').trim();
    rooms = [...rooms].sort((a, b) => {
        const memoA = getMemo(a), memoB = getMemo(b);
        if (!memoA !== !memoB) return memoA ? -1 : 1;
        return memoA.localeCompare(memoB, 'ko', { numeric: true }) || a.code.localeCompare(b.code);
    });
    const schoolFilter = document.getElementById('admin-school-select');
    const schoolFilterWrap = document.getElementById('admin-school-filter');
    const isAdmin = Boolean(window.isAdmin && schoolFilter && schoolFilterWrap);
    selectEl.closest('.dash-header')?.classList.toggle('has-admin-school-filter', isAdmin);
    const unspecifiedSchool = '__unspecified__';
    const getSchool = room => String(room.data.creatorSchool || '').trim() || unspecifiedSchool;
    const previousCode = selectEl.value;
    const explicitTargetCode = selectEl.dataset.targetCode;
    const targetCode = explicitTargetCode || previousCode;

    if (isAdmin) {
        schoolFilterWrap.classList.remove('d-none');
        const selectedSchool = schoolFilter.value;
        const schools = [...new Set(rooms.map(getSchool))].sort((a, b) => a.localeCompare(b, 'ko'));

        schoolFilter.innerHTML = '<option value="">전체 학교</option>' + schools.map(school => {
            const label = school === unspecifiedSchool ? '학교 미지정' : school;
            return `<option value="${escapeHtml(school)}">${escapeHtml(label)}</option>`;
        }).join('');
        // 관리자 기본 학교: 처음 그릴 때 한 번만 정보수정의 학교로 맞춥니다 (그 뒤 직접 고른 값 — 전체 학교 포함 — 은 유지)
        let initialSchool = selectedSchool;
        if (schoolFilter.dataset.defaultSchoolApplied !== 'true' && rooms.length) {
            schoolFilter.dataset.defaultSchoolApplied = 'true';
            const mySchool = adminDefaultSchool();
            if (!selectedSchool && !previousCode && schools.includes(mySchool)) initialSchool = mySchool;
        }
        schoolFilter.value = schools.includes(initialSchool) ? initialSchool : '';
        const targetRoom = explicitTargetCode && rooms.find(room => room.code === explicitTargetCode);
        if (targetRoom) schoolFilter.value = getSchool(targetRoom);

        const renderFilteredRooms = (shouldNotify = true) => {
            const keepCode = selectEl.value;
            const requestedCode = selectEl.dataset.targetCode || keepCode;
            const visibleRooms = rooms
                .filter(room => !schoolFilter.value || getSchool(room) === schoolFilter.value);
            selectEl.innerHTML = '<option value="">방을 선택하세요</option>' + visibleRooms.map(room =>
                `<option value="${escapeHtml(room.code)}">${escapeHtml(labelFn(room.code, room.data))}</option>`
            ).join('');

            if (requestedCode && visibleRooms.some(room => room.code === requestedCode)) {
                selectEl.value = requestedCode;
                selectEl.dataset.targetCode = '';
            } else if (requestedCode && selectEl.dataset.targetCode !== requestedCode) {
                selectEl.dataset.targetCode = '';
                if (shouldNotify) selectEl.dispatchEvent(new Event('change'));
            }
        };

        adminRoomOptionRenderers.set(selectEl, renderFilteredRooms);
        if (schoolFilter.dataset.roomFilterBound !== 'true') {
            schoolFilter.dataset.roomFilterBound = 'true';
            schoolFilter.addEventListener('change', () => {
                adminRoomOptionRenderers.get(selectEl)?.();
            });
        }
        renderFilteredRooms(false);
        if (targetCode && ![...selectEl.options].some(option => option.value === targetCode) && previousCode && !selectEl.dataset.targetCode) {
            selectEl.dispatchEvent(new Event('change'));
        }
        return;
    }

    if (schoolFilterWrap) schoolFilterWrap.classList.add('d-none');
    selectEl.innerHTML = '<option value="">방을 선택하세요</option>' + rooms.map(room =>
        `<option value="${escapeHtml(room.code)}">${escapeHtml(labelFn(room.code, room.data))}</option>`
    ).join('');
    if (!rooms.length && emptyTeacherText) {
        selectEl.innerHTML = `<option value="">${escapeHtml(emptyTeacherText)}</option>`;
    }
    if (targetCode && [...selectEl.options].some(option => option.value === targetCode)) {
        selectEl.value = targetCode;
        selectEl.dataset.targetCode = '';
    }
}

// =====================================================================
// 1-1. 접속 상태  (유형 A — 접속 전용 RTDB)
//
//  진행에 RTDB를 쓰지 않는 게임은 접속 전용 RTDB에 접속 상태만 둡니다.
//  (유형 B·C·D는 각 게임 RTDB의 players 노드를 그대로 씁니다)
//
//    presence/{Firestore 컬렉션}/{방}/{닉네임} = { status, lastHeartbeat }
//      status         'online' | 'away'(다른화면) | 'offline'  — 오목·블로토 players 노드와 같은 이름
//      lastHeartbeat  서버 시각(ms). offline이면 끊긴 시각 → 30분 계산의 기준
//
//  ★ 학번은 넣지 않습니다 (닉네임만 — 순위표 익명성).
//  ★ 창을 닫거나 연결이 끊기면 서버가 offline을 씁니다 (onDisconnect).
//    연결이 끊기면 예약도 사라지므로, 다시 연결될 때마다 예약을 새로 겁니다.
//  ★ 대시보드는 Firestore를 다시 읽지 않고 상태 칸만 바꿉니다 (읽기 과금 없음).
// =====================================================================
export const PRESENCE_FRESH_MS = 120 * 1000;      // 이 안에 신호가 있으면 접속중·다른화면 (학생 관리와 같은 값)
export const PRESENCE_DROP_MS = 30 * 60 * 1000;   // 끊긴 뒤 이 시간까지 '접속 끊김', 지나면 플레이 횟수
const PRESENCE_BEAT_MS = 30 * 1000;               // 신호 주기 (끊김은 서버가 잡으므로 느슨하게)
const PRESENCE_RETRY_MS = 60 * 1000;              // 권한 거부(규칙 배포 전 · App Check 토큰 문제) 뒤 다시 시도하기까지

const isPermissionError = (e) => String(e?.code || e?.message || '').toLowerCase().includes('permission');

/**
 * 학생: 방에 들어온 뒤 접속 신호를 시작합니다.
 * 권한이 거부되어도 멈춰 버리지 않고, 1분 뒤 또는 다시 연결될 때 다시 시도합니다
 * (아이폰 등에서 App Check 토큰이 잠깐 늦거나 실패해도 회복되도록).
 * @param {string} gameKey  Firestore 컬렉션 이름 (room.collectionName)
 * @returns {Function} stop — 같은 페이지에서 방을 떠날 때 부르면 offline으로 내리고 예약을 지웁니다.
 */
export function startRoomPresence(gameKey, code, nickname) {
    if (!gameKey || !code || !nickname) return () => { };
    const nodeRef = ref(rtdbPresence, `${presenceRoomPath(gameKey, code)}/${nickname}`);
    const offlineValue = () => ({ status: 'offline', lastHeartbeat: rtTimestamp() });
    let active = true, connected = false;
    let armed = false, arming = false, gen = 0;   // 이번 연결에 끊김 예약(onDisconnect)을 걸었는지 · 연결 세대
    let pausedUntil = 0, warned = false;          // 권한 거부 뒤 쉬는 시각 · 경고를 이미 띄웠는지 (콘솔 도배 방지)

    const onError = (e) => {
        if (isPermissionError(e)) {
            pausedUntil = Date.now() + PRESENCE_RETRY_MS;   // 게임은 그대로, 접속 신호만 잠시 쉼
            armed = false;
            if (!warned) {
                warned = true;
                console.warn('[presence] 접속 상태 쓰기 권한이 없습니다 — 1분 뒤 다시 시도합니다 (접속 전용 RTDB 규칙 · App Check 확인).', e);
            }
        } else {
            console.warn('[presence] 접속 신호 실패:', e);
        }
    };

    const write = () => set(nodeRef, { status: document.hidden ? 'away' : 'online', lastHeartbeat: rtTimestamp() })
        .then(() => { warned = false; })
        .catch(onError);

    // 연결되어 있을 때만 보냅니다 (끊긴 동안 쌓아 두지 않고, 다시 연결되면 지금 상태를 보냄)
    // 끊김 예약이 없으면 예약부터 겁니다 — 권한 거부로 쉬었다가 다시 시도할 때도 이 길로 옵니다.
    const send = () => {
        if (!active || !connected || Date.now() < pausedUntil) return;
        if (armed) { write(); return; }
        if (arming) return;
        arming = true;
        const myGen = gen;
        onDisconnect(nodeRef).set(offlineValue())
            .then(() => {
                if (myGen !== gen || !active) return;      // 그사이 연결이 바뀌었으면 새 연결 쪽에서 다시 겁니다
                arming = false;
                armed = true;
                write();
            })
            .catch((e) => {
                if (myGen !== gen) return;
                arming = false;
                onError(e);
            });
    };

    // 연결이 바뀔 때마다 예약을 새로 겁니다 (끊길 때 서버가 이미 실행했으므로). 다시 연결되면 쉬던 중이어도 바로 시도
    const unsubConnected = onValue(ref(rtdbPresence, '.info/connected'), (snap) => {
        connected = snap.val() === true;
        gen++;
        armed = false;
        arming = false;
        if (connected) {
            pausedUntil = 0;
            send();
        }
    });
    const timer = setInterval(send, PRESENCE_BEAT_MS);
    document.addEventListener('visibilitychange', send);

    return function stop() {
        if (!active) return;
        active = false;
        gen++;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', send);
        unsubConnected();
        onDisconnect(nodeRef).cancel().catch(() => { });
        set(nodeRef, offlineValue()).catch(() => { });
    };
}

let presenceOffset = null;
/** 서버 시각(ms) — 선생님 PC 시계가 틀려도 판정이 맞도록 RTDB 보정값을 더합니다. */
export function presenceNow() {
    if (presenceOffset === null) {
        presenceOffset = 0;
        onValue(ref(rtdbPresence, '.info/serverTimeOffset'), (snap) => { presenceOffset = Number(snap.val()) || 0; });
    }
    return Date.now() + presenceOffset;
}

/**
 * 선생님: 방의 접속 상태를 구독합니다.
 * 권한이 없거나(규칙 배포 전 · 교사 권한 teacher_uids 없음 · App Check 토큰 문제) 실패하면 빈 값을 넘겨 플레이 횟수만 보이게 하고,
 * 1분 뒤 다시 구독합니다 (구독이 한 번 거부되면 Firebase가 그 구독을 끝내 버리므로).
 * @param {Function} onChange (presenceMap) => void   — { 닉네임: { status, lastHeartbeat } }
 * @returns {Function} 구독 해제
 */
export function watchRoomPresence(gameKey, code, onChange) {
    if (!gameKey || !code) return () => { };
    presenceNow();   // 서버 시각 보정값 구독 시작
    let stopped = false, unsub = null, retryTimer = null, warned = false;
    const subscribe = () => {
        if (stopped) return;
        unsub = onValue(ref(rtdbPresence, presenceRoomPath(gameKey, code)),
            (snap) => { warned = false; onChange(snap.val() || {}); },
            (err) => {
                if (!warned) {
                    warned = true;
                    console.warn('[presence] 접속 상태를 읽지 못했습니다 — 1분 뒤 다시 시도합니다 (접속 전용 RTDB 규칙 · 교사 권한 teacher_uids · App Check 확인).', err);
                }
                if (stopped) return;
                onChange({});
                retryTimer = setTimeout(subscribe, PRESENCE_RETRY_MS);
            });
    };
    subscribe();
    return () => {
        stopped = true;
        clearTimeout(retryTimer);
        if (unsub) unsub();
    };
}

/**
 * 접속 판정 (서버 시각 기준)
 *   online   접속중     — online, 신호 2분 이내
 *   away     다른화면   — away, 신호 2분 이내
 *   offline  접속 끊김  — offline이 되었거나 신호가 멈춘 지 30분 이내
 *   idle     표시 없음  — 30분 경과 또는 접속 기록 없음 → 플레이 횟수를 보여 줍니다
 */
export function presenceStatus(node, now = presenceNow()) {
    const hb = typeof node?.lastHeartbeat === 'number' ? node.lastHeartbeat : 0;
    const age = now - hb;
    if (!hb || age >= PRESENCE_DROP_MS) return { key: 'idle', label: '', text: 'text-muted' };
    if (node.status !== 'offline' && age < PRESENCE_FRESH_MS) {
        return node.status === 'away'
            ? { key: 'away', label: '다른화면', text: 'text-warning' }
            : { key: 'online', label: '접속중', text: 'text-success' };
    }
    return { key: 'offline', label: '접속 끊김', text: 'text-danger' };
}

/** 플레이 열 HTML — 접속 중이면 상태(STATUS_DOT_CSS 필요), 끊긴 지 30분이 지나면 플레이 횟수 */
export function playStatusCell(node, plays, now = presenceNow()) {
    const st = presenceStatus(node, now);
    if (st.key === 'idle') return `<span class="badge bg-secondary">${safeNumber(plays)}회</span>`;
    return `<span class="text-nowrap"><span class="status-dot status-${st.key}"></span><span class="${st.text} small fw-bold">${st.label}</span></span>`;
}

// =====================================================================
// 2. Firestore 방 도구  (유형 A: 개인 기록형)
//
//  컬렉션 이름은 반드시 '..._records' 로 끝나야 합니다.
//  보안 규칙이 그 패턴으로 걸려 있어서, 새 게임을 만들어도
//  규칙을 고칠 필요가 없습니다.
//
//  subs: 방을 지울 때 비울 하위 컬렉션. 기본 4개 밖의 하위 컬렉션을 쓰면 여기에 더하세요.
//        (방 목록 room_registry에도 그대로 적혀, 학교를 바꿀 때 같은 순서로 지웁니다)
// =====================================================================
export function firestoreRoom(collectionName, { subs = GAME_SUBS } = {}) {
    if (!/_records$/.test(collectionName)) {
        console.warn(`[game-kit] 컬렉션 이름은 '_records'로 끝나야 보안 규칙이 적용됩니다: ${collectionName}`);
    }

    const roomDoc = (code) => doc(fsdb, collectionName, code);
    const students = (code) => collection(fsdb, collectionName, code, "students");
    const nicknames = (code) => collection(fsdb, collectionName, code, "nicknames");
    const guests = (code) => collection(fsdb, collectionName, code, "guests");
    const records = (code) => collection(fsdb, collectionName, code, "records");
    const parts = [{ fs: collectionName, subs }];

    return {
        collectionName, roomDoc, students, nicknames, guests, records, parts,

        /** renderRoomEntrance 의 getRoomData 로 그대로 넘기면 됩니다. */
        getRoomData: async (code) => {
            const snap = await getDoc(roomDoc(code));
            return snap.exists() ? snap.data() : null;
        },

        /**
         * 새 방 만들기. 입장 모드(빠른/인증)를 묻고 방 문서를 만듭니다.
         * @param {boolean} askMode  false면 항상 빠른 입장으로 만듭니다.
         * @returns {string|null} 만들어진 방 코드
         */
        async createRoom({ askMode = true, mode = null, extra = {} } = {}) {
            const finalMode = mode || (askMode ? await promptRoomMode() : 'quick');
            if (!finalMode) return null;

            // v4: 인증 방 학생의 학교는 방을 만든 선생님을 따릅니다 → 학교명이 꼭 있어야 합니다 (관리자 포함).
            const teacherSchool = String(window.currentTeacherSchool || '').trim();
            if (finalMode === 'auth' && (!teacherSchool || teacherSchool === '관리자')) {
                await customAlert("학교명이 필요해요",
                    "학생 인증 방의 학생은 <b>방을 만든 선생님의 학교</b>로 등록됩니다.<br>" +
                    "상단 메뉴 → <b>정보수정</b>에서 실제 학교명을 먼저 등록해주세요.");
                return null;
            }

            // 메모 입력 (선택 사항)
            const memoInput = await customPrompt("방 메모 입력", "이 방을 구분할 메모를 입력하세요 (예: 1반, 2교시)<br><span class='text-muted small'>빈칸으로 두면 메모 없이 생성됩니다.</span>");
            if (memoInput === null) return null;   // 취소
            const memo = String(memoInput).trim().slice(0, 40);

            let code = null;
            for (let i = 0; i < 20; i++) {
                const candidate = generateRoomCode();
                if (!(await getDoc(roomDoc(candidate))).exists()) { code = candidate; break; }
            }
            if (!code) { await customAlert('오류', '방 코드를 만들지 못했습니다. 잠시 후 다시 시도해주세요.'); return null; }

            await setDoc(roomDoc(code), {
                roomCode: code,
                roomMode: finalMode,
                settings: { mode: finalMode },
                createdAt: fsTimestamp(),
                createdBy: window.currentTeacherUid || '',
                creatorName: window.currentTeacherName || '',
                creatorSchool: teacherSchool,
                memo,
                ...extra
            });
            await registerRoom(code, parts, { creatorSchool: teacherSchool, memo });
            const roomSelect = document.getElementById(window.dashboardSelectId || 'roomSelect');
            if (roomSelect) roomSelect.dataset.targetCode = code;

            await customAlert("방 생성 완료",
                `새로운 방 [<strong>${escapeHtml(code)}</strong>]이 생성되었습니다.` +
                (memo ? `<br>메모: <strong>${escapeHtml(memo)}</strong>` : '') + `<br>` +
                `설정 모드: <strong>${finalMode === 'auth' ? '🔐 학생 인증 모드' : '🚀 빠른 입장 모드'}</strong>` +
                (finalMode === 'auth' ? `<br>학생 학교: <strong>${escapeHtml(teacherSchool)}</strong>` : ''));
            return code;
        },

        /**
         * 방 삭제.
         * ★ Firestore는 문서를 지워도 하위 컬렉션이 남습니다.
         *   subs(기본 students·records·nicknames·guests)를 먼저 비워야 고아 문서가 생기지 않습니다.
         * ★ await 없이 흘려보내면 중간에 끊겼을 때 일부만 지워집니다.
         */
        async deleteRoom(code) {
            for (const sub of subs) {
                const snap = await getDocs(collection(fsdb, collectionName, code, sub));
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            }
            await deleteDoc(roomDoc(code));
            await removeRoomPresence(collectionName, code);   // 접속 상태 RTDB (실패해도 계속)
            await unregisterRoom(code, parts);
        },

        /** 소유권 확인 — 옛 방(createdBy 없음)도 지울 수 있게 빈 값을 허용합니다. */
        async canDelete(code) {
            if (window.isAdmin) return true;
            const snap = await getDoc(roomDoc(code));
            const owner = (snap.data() || {}).createdBy;
            return !owner || owner === window.currentTeacherUid;
        },

        /**
         * 방 목록 실시간 구독.
         * ★ 교사가 아닐 때는 리스너를 걸지 않습니다. 학생 화면에서도 이 스크립트가
         *   돌기 때문에, 가드가 없으면 콘솔에 permission-denied가 계속 쌓입니다.
         * ★ 관리자가 아니면 내가 만든 방만 쿼리합니다.
         * @returns {Function|null} 구독 해제 함수
         */
        watchRooms(selectEl, onError) {
            if (!selectEl) return null;
            if (!window.isApprovedTeacher && !window.isAdmin) return null;

            const base = collection(fsdb, collectionName);
            const q = window.isAdmin
                ? base
                : query(base, where("createdBy", "==", window.currentTeacherUid || "__none__"));

            return onSnapshot(q, snap => {
                const rooms = snap.docs.map(d => ({ code: d.id, data: d.data() || {} }));
                renderRoomOptions(
                    selectEl,
                    rooms,
                    (code, data) => data.memo ? `${code} | ${data.memo}` : code,
                    '생성한 방이 없습니다 (새 방을 만드세요)'
                );
            }, err => {
                console.error('방 목록을 불러오지 못했습니다:', err);
                if (typeof onError === 'function') onError(err);
            });
        }
    };
}

// =====================================================================
// 3. RTDB 방 도구  (유형 B·C: 실시간형)
//
//  ★ 방 목록은 반드시 인덱스 노드에서 읽습니다.
//    rooms 전체를 읽으면 모든 방의 참가자·기록·의견까지 통째로 내려받습니다.
//
//  indexPath: null — 목록 인덱스가 없는 게임(블로토). 방 코드 발급(newCode)만 씁니다.
//  linked: 같은 방 코드로 함께 쓰는 Firestore 위치 (예: [{ fs: 'rps_records', subs: ['students', 'nicknames', 'guests'] }])
//          방 목록 room_registry에 함께 적혀, 학교를 바꿀 때 RTDB 방과 같이 지워집니다.
// =====================================================================
export function rtdbRoom(db, { roomsPath = 'rooms', indexPath = 'room_index', linked = [] } = {}) {

    const roomRef = (code) => ref(db, `${roomsPath}/${code}`);
    const indexRef = (code) => ref(db, code ? `${indexPath}/${code}` : indexPath);
    const childRef = (code, path) => ref(db, `${roomsPath}/${code}/${path}`);
    const parts = [{ rtdb: rtdbUrl(db), paths: indexPath ? [roomsPath, indexPath] : [roomsPath] }, ...linked];

    return {
        db, roomsPath, indexPath, roomRef, indexRef, childRef, parts,

        /**
         * 방이 살아 있는지 확인 — 학생이 읽어도 되는 한 칸만 봅니다.
         * @param {string} probe 확인용 자식 노드 이름 (예: 'status', 'topic')
         */
        async exists(code, probe = 'status') {
            return (await get(childRef(code, probe))).exists();
        },

        /** 중복되지 않는 방 코드 만들기 */
        async newCode(probe = 'status') {
            for (let i = 0; i < 20; i++) {
                const c = generateRoomCode();
                if (!(await get(childRef(c, probe))).exists()) return c;
            }
            return null;
        },

        /**
         * 방 만들기. 방 노드와 인덱스 노드에 함께 씁니다.
         * @param {object} roomData  방 노드에 넣을 값 (status·settings 등)
         * @param {object} indexData 인덱스에 넣을 값 (제목 등 가벼운 것만)
         */
        async createRoom(code, roomData = {}, indexData = {}) {
            const owner = {
                createdBy: window.currentTeacherUid || '',
                creatorName: window.currentTeacherName || '',
                creatorSchool: window.currentTeacherSchool || ''
            };
            await set(roomRef(code), { createdAt: rtTimestamp(), ...owner, ...roomData });
            await set(indexRef(code), { createdAt: Date.now(), ...owner, ...indexData });
            await registerRoom(code, parts, { creatorSchool: owner.creatorSchool, memo: indexData.memo });
            const roomSelect = document.getElementById(window.dashboardSelectId || 'roomSelect');
            if (roomSelect) roomSelect.dataset.targetCode = code;
            return code;
        },

        /**
         * 방 삭제 — RTDB는 부모를 지우면 하위 경로도 함께 지워집니다.
         * ★ linked(Firestore) 쪽은 페이지가 지웁니다. 여기서는 방 목록에서만 뺍니다.
         */
        async deleteRoom(code) {
            await remove(roomRef(code));
            await remove(indexRef(code));
            await unregisterRoom(code, parts);
        },

        async canDelete(code) {
            if (window.isAdmin) return true;
            const snap = await get(indexRef(code));
            const owner = (snap.exists() ? snap.val() : {}).createdBy;
            return !owner || owner === window.currentTeacherUid;
        },

        /**
         * 방 목록 채우기 (1회성 읽기).
         * 인덱스가 없던 시절 방을 위해 한 번만 자동으로 인덱스를 만들어 줍니다.
         * @param {Function} labelFn (code, indexData) → 화면에 보일 문자열
         */
        async loadRooms(selectEl, labelFn = (code, r) => (r && r.memo) ? `${code} | ${r.memo}` : code, migrateFields = []) {
            if (!selectEl) return;
            if (!window.isApprovedTeacher && !window.isAdmin) return;

            let snapshot = await get(indexRef());

            if (!snapshot.exists()) {
                const full = await get(ref(db, roomsPath));
                if (full.exists()) {
                    const all = full.val();
                    const migrate = {};
                    Object.keys(all).forEach(code => {
                        const r = all[code] || {};
                        const entry = {
                            createdAt: r.createdAt || 0,
                            createdBy: r.createdBy || '',
                            creatorName: r.creatorName || '',
                            creatorSchool: r.creatorSchool || '',
                            memo: r.memo || ''
                        };
                        migrateFields.forEach(f => { entry[f] = r[f] ?? ''; });
                        migrate[code] = entry;
                    });
                    if (Object.keys(migrate).length) {
                        await update(indexRef(), migrate).catch(() => { });
                        snapshot = await get(indexRef());
                    }
                }
            }

            const rooms = snapshot.exists() ? snapshot.val() : {};
            const visibleRooms = Object.keys(rooms)
                .filter(code => window.isAdmin || (rooms[code] || {}).createdBy === window.currentTeacherUid)
                .sort((a, b) => (rooms[b].createdAt || 0) - (rooms[a].createdAt || 0))
                .map(code => ({ code, data: rooms[code] || {} }));
            renderRoomOptions(
                selectEl,
                visibleRooms,
                labelFn,
                '생성한 방이 없습니다 (새 방을 만드세요)'
            );
        }
    };
}

// =====================================================================
// 4. 게스트 승인 배너  (유형 A·C)
//
//  학생 인증 모드 방에서 공용 기기로 들어온 학생을 선생님이 승인합니다.
//  승인하면 세 곳을 함께 바꿉니다.
//    students/{닉}.status → 'online'   (대시보드 표시용)
//    guests/{닉}.status   → 'online'   (학생 화면이 지켜보는 신호)
//    student_auth/{키}.presence → 'online'
// =====================================================================
export function renderGuestApproval(container, students, { studentsRef, guestsRef }) {
    if (!container) return;
    if (!studentsRef || !guestsRef) { container.innerHTML = ''; return; }

    const pending = (students || []).filter(s => s && s.isGuest && s.status === 'pending');
    if (pending.length === 0) { container.innerHTML = ''; return; }

    container.innerHTML = `
        <div class="card border-warning bg-warning-subtle shadow-sm rounded-4 p-3 mb-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <h6 class="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <span class="spinner-grow spinner-grow-sm text-danger" role="status"></span>
                    <span>⏳ 게스트 입장 대기자 (${pending.length}명)</span>
                </h6>
                <span class="badge bg-warning text-dark fw-bold">선생님 승인 필요</span>
            </div>
            <div class="d-flex flex-column gap-2">
                ${pending.map(g => `
                    <div class="bg-white p-2 px-3 rounded-3 d-flex align-items-center justify-content-between flex-wrap gap-2 shadow-sm border">
                        <div>
                            <strong class="text-primary fs-6">${escapeHtml(g.nickname)}</strong>
                            <span class="text-secondary small ms-2">(${escapeHtml(g.school || '')} / ${escapeHtml(g.studentId || '')})</span>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-success fw-bold px-3 gk-guest" data-act="approve"
                                data-nick="${escapeHtml(g.nickname)}" data-key="${escapeHtml(g.studentKey || '')}">
                                <i class="bi bi-check-lg"></i> 승인 허용
                            </button>
                            <button class="btn btn-sm btn-outline-danger fw-bold px-3 gk-guest" data-act="reject"
                                data-nick="${escapeHtml(g.nickname)}" data-key="${escapeHtml(g.studentKey || '')}">
                                <i class="bi bi-x-lg"></i> 거절
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;

    container.querySelectorAll('.gk-guest').forEach(btn => {
        btn.onclick = async () => {
            const nick = btn.dataset.nick;
            const sKey = btn.dataset.key;
            const approve = btn.dataset.act === 'approve';
            const label = btn.textContent.trim();

            btn.disabled = true;
            btn.textContent = '처리 중...';
            try {
                const status = approve ? 'online' : 'rejected';
                await updateDoc(doc(studentsRef, nick), { status });
                await setDoc(doc(guestsRef, nick), { status }, { merge: true });
                if (sKey) {
                    await updateDoc(doc(fsdb, "student_auth", sKey), approve
                        ? { presence: 'online', lastActive: fsTimestamp() }
                        : { presence: 'offline' });
                }
            } catch (e) {
                console.error('게스트 승인 처리 오류:', e);
                btn.disabled = false;
                btn.textContent = label;
            }
        };
    });
}

// =====================================================================
// 5. 방 삭제 버튼 연결  (유형 A·B·C 공용)
//
//  소유권 확인 → 확인 모달 → 삭제 → 버튼 잠금 해제까지 한 번에 처리합니다.
// =====================================================================
export function bindDeleteRoomButton(btn, {
    getCode,            // () => 현재 선택된 방 코드
    canDelete,          // async (code) => boolean
    doDelete,           // async (code) => void
    onDone              // async () => void  (목록 새로고침 등)
}) {
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const code = getCode();
        if (!code) return customAlert("알림", "삭제할 방을 선택하세요.");

        if (!(await canDelete(code))) {
            return customAlert("권한 없음", "직접 생성한 방만 삭제할 수 있습니다.");
        }

        const ok = await customConfirm("방 삭제",
            `방 [<b class="text-danger">${escapeHtml(code)}</b>] 데이터를 모두 삭제하시겠습니까?<br>` +
            `되돌릴 수 없습니다.`);
        if (!ok) return;

        btn.disabled = true;
        try {
            await doDelete(code);
            if (typeof onDone === 'function') await onDone();
            await customAlert("완료", "방이 삭제되었습니다.");
        } catch (e) {
            console.error(e);
            await customAlert("오류", "방을 삭제하지 못했습니다.<br>네트워크를 확인하고 다시 시도해주세요.");
        } finally {
            btn.disabled = false;
        }
    });
}

// 자주 함께 쓰는 것들을 다시 내보내, 게임 페이지의 import 줄을 짧게 유지합니다.
export { escapeHtml, safeNumber };