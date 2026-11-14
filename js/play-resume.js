/**
 * play-resume.js — 이어하기 (유형 A 개인 기록형 게임)
 *
 * ─────────────────────────────────────────────────────────────────────
 *  튕김·새로고침·실수로 뒤로가기를 한 뒤 같은 방 코드로 다시 들어오면
 *  하던 판(점수·하트·레벨·현재 문제)을 그대로 이어 갑니다.
 *
 *  · 판이 끝나기 전(하트가 남았고 종료를 누르지 않음)의 상태를 이 기기 localStorage에 둡니다.
 *      키: gameResume:{컬렉션}:{방}:{닉네임}
 *    같은 기기로 같은 방에 다시 들어오면 room-auth가 같은 닉네임을 주므로 그 판을 찾습니다.
 *  · 튕긴 뒤 1분(RESUME_TTL_MS) 안에 다시 들어와야 이어집니다. 그보다 늦으면 새 게임입니다.
 *  · 서버에는 쓰지 않습니다 — Firestore 읽기·쓰기 과금 없음, 보안 규칙 변경 없음.
 *  · 기록(records)은 지금처럼 판이 끝날 때 한 번만 저장됩니다.
 *
 *  ★ 판이 끝나면(endGame) 반드시 clear() — 남겨 두면 끝난 판이 되살아납니다.
 *  ★ 저장하는 상태 모양을 바꾸면 version을 올리세요. 옛 저장본은 버립니다.
 *
 *  사용법
 *    const resume = createPlayResume(room.collectionName, 1);
 *    onJoin: const saved = resume.open(roomCode, nickname);
 *            saved ? 이어하기(saved) : initGame();
 *    상태가 바뀔 때: resume.save({ score, lives, ... });
 *    endGame 시작:   resume.clear();
 * ─────────────────────────────────────────────────────────────────────
 */
const RESUME_PREFIX = 'gameResume:';
export const RESUME_TTL_MS = 60 * 1000;   // 튕긴 뒤 1분 안에 다시 들어와야 이어집니다
const RESUME_TOUCH_MS = 5 * 1000;         // 게임 중에는 이 주기로 '마지막으로 살아 있던 시각'을 갱신합니다

function getStore() {
    try { return window.localStorage; } catch (e) { return null; }
}

/**
 * 저장본의 시각만 지금으로 갱신합니다 (저장본이 있을 때만 — 끝난 판을 되살리지 않도록).
 * ★ 저장은 상태가 바뀔 때만 일어나므로, 이게 없으면 한 문제를 1분 넘게 고민하다 튕긴 학생은 이어하지 못합니다.
 *   1분은 '마지막 저장'이 아니라 '튕긴 순간'부터 셉니다.
 */
function touchEntry(key) {
    const store = getStore();
    if (!store || !key) return;
    try {
        const saved = JSON.parse(store.getItem(key) || 'null');
        if (!saved) return;
        saved.t = Date.now();
        store.setItem(key, JSON.stringify(saved));
    } catch (e) { }
}

/** 오래된 저장본 정리 (다른 방·다른 게임 것 포함) */
function pruneExpired(store, now) {
    try {
        for (let i = store.length - 1; i >= 0; i--) {
            const key = store.key(i);
            if (!key || !key.startsWith(RESUME_PREFIX)) continue;
            let saved = null;
            try { saved = JSON.parse(store.getItem(key)); } catch (e) { }
            if (!saved || typeof saved.t !== 'number' || now - saved.t > RESUME_TTL_MS) store.removeItem(key);
        }
    } catch (e) { }
}

/**
 * @param {string} gameKey  Firestore 컬렉션 이름 (room.collectionName)
 * @param {number} version  저장 상태 모양의 버전
 */
export function createPlayResume(gameKey, version = 1) {
    let key = '';
    let touchTimer = null;

    // 페이지가 살아 있는 동안 시각 갱신 + 떠나는 순간(새로고침·뒤로가기·창 닫기) 한 번 더
    function startTouch() {
        if (touchTimer) return;
        touchTimer = setInterval(() => touchEntry(key), RESUME_TOUCH_MS);
        window.addEventListener('pagehide', () => touchEntry(key));
    }

    function clear() {
        const store = getStore();
        if (!store || !key) return;
        try { store.removeItem(key); } catch (e) { }
    }

    return {
        /** 입장 직후: 이 방·닉네임으로 남은 판이 있으면 그 상태, 없으면 null */
        open(roomCode, nickname) {
            key = roomCode && nickname ? `${RESUME_PREFIX}${gameKey}:${roomCode}:${nickname}` : '';
            const store = getStore();
            if (!store || !key) return null;
            startTouch();
            pruneExpired(store, Date.now());
            try {
                const saved = JSON.parse(store.getItem(key) || 'null');
                if (saved && saved.v === version && saved.s && typeof saved.s === 'object') return saved.s;
            } catch (e) { }
            clear();
            return null;
        },

        /** 진행 상태 저장 (JSON으로 바꿀 수 있는 값만) */
        save(state) {
            const store = getStore();
            if (!store || !key || !state) return;
            try { store.setItem(key, JSON.stringify({ v: version, t: Date.now(), s: state })); } catch (e) { }
        },

        clear
    };
}
