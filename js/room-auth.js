/**
 * room-auth.js  (v3)
 * 방 입장 카드 UI, 공통 모달, 학생/교사 인증 공통 모듈
 *
 * ═══════════════════════════════════════════════════════════════════
 *  v3에서 고친 것 (v2 검토에서 나온 문제들)
 * ═══════════════════════════════════════════════════════════════════
 *  [치명] freshData 오타로 학생 인증 모드 입장이 항상 실패하던 문제
 *  [치명] 같은 기기에서 게스트가 폰 주인의 닉네임을 그대로 이어받아
 *         남의 기록에 자기 학번이 붙던 문제 → 게스트는 항상 새 이름을 뽑습니다
 *  [보안] localStorage/sessionStorage에 PIN 평문을 두던 문제
 *         → 증명값(proof)만 저장하고, 게스트는 아무것도 저장하지 않습니다
 *  [보안] 공개 문서에 기기 원본 id를 적던 문제 → 지문(해시)만 적습니다
 *  [보안] 교사 목록을 teachers에서 읽어 이메일까지 공개되던 문제
 *         → school·name만 담긴 teacher_directory를 읽습니다
 *  [버그] PIN 초기화가 공개 문서의 pin 필드를 건드려 아무 효과가 없던 문제
 *         → private/auth의 pinHash를 비웁니다
 *  [버그] 게스트가 두 번째 입장할 때 guests 문서 덮어쓰기가 거부되던 문제
 *  [버그] sanitizeKey가 첫 글자만 치환하던 정규식 g 플래그 누락
 *
 * ═══════════════════════════════════════════════════════════════════
 *  입장 모드 정리
 * ═══════════════════════════════════════════════════════════════════
 *  A. 빠른 입장 모드 (roomMode !== 'auth')
 *     학생 정보 입력이 전혀 없습니다. 방 코드 4자리만 맞으면 바로 시작합니다.
 *     ★ 게스트 모드 체크박스를 켜든 끄든 결과가 같습니다 — 아예 보지 않습니다.
 *
 *  B. 학생 인증 모드 + 본인 기기 (게스트 체크 해제)
 *     최초 1회만 학교·담당교사·학번·PIN을 입력해 기기를 등록합니다.
 *     그 다음부터는 이 기기에 저장된 정보로 조용히 확인만 하고 들어갑니다.
 *
 *  C. 학생 인증 모드 + 게스트 (게스트 체크)
 *     이 기기에 저장된 정보를 '일절 쓰지 않고' 새로 입력받습니다.
 *     이미 접속 중인 학번이면 막고, PIN이 맞아야 하며,
 *     교사가 대시보드에서 승인해야 게임 화면으로 넘어갑니다.
 *
 *  세 경우 모두 닉네임은 자동 발급입니다. 학생이 이름을 입력하는 칸은 없습니다.
 */
import { db } from "./firebase-config.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    onSnapshot,
    serverTimestamp,
    query,
    where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
    isCryptoAvailable, derivePinProof, deriveDeviceFingerprint,
    verifyProofViaGate, buildPinRecordFromProof
} from "./student-crypto.js";

// =====================================================================
// 0. 공통 유틸
// =====================================================================

/** 사용자가 입력한 문자열을 화면에 안전하게 표시하기 위한 이스케이프 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);
}

/** 숫자로 표시할 값을 강제로 숫자로 만듭니다 (DB에 문자열이 섞여 들어와도 안전) */
export function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** Firebase Realtime Database 키에 쓸 수 없는 문자 (g 플래그 필수) */
export const INVALID_KEY_PATTERN = /[.#$\[\]\/]/g;

/** 닉네임 등이 DB 키로 사용 가능한지 확인 */
export function isValidRtdbKey(str) {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (!trimmed) return false;
    if (/[.#$\[\]\/]/.test(trimmed)) return false;
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    return true;
}

/** DB 키로 쓸 수 없는 문자를 제거 */
export function sanitizeKey(str) {
    return String(str ?? '')
        .replace(/[.#$\[\]\/]/g, '')
        .replace(/[\u0000-\u001F\u007F]/g, '');
}

export function makeStudentKey(school, studentId) {
    return `${String(school || '').trim()}_${String(studentId || '').trim()}`
        .replace(/[.#$\[\]\/]/g, '_');
}

// =====================================================================
// 0.5 입장 정보 기억 (방 코드 자동 입력)
// =====================================================================
const ENTRANCE_NICK_KEY = 'roomEntrance:nickname';
function entranceRoomKey() { return `roomEntrance:room:${location.pathname}`; }

export function rememberEntrance(roomCode, nickname) {
    try {
        localStorage.setItem(entranceRoomKey(), String(roomCode ?? ''));
        localStorage.setItem(ENTRANCE_NICK_KEY, String(nickname ?? ''));
    } catch (e) { }
}

export function loadRememberedEntrance() {
    try {
        const room = String(localStorage.getItem(entranceRoomKey()) || '')
            .replace(/\s/g, '').slice(0, 4).toUpperCase();
        const nick = sanitizeKey(localStorage.getItem(ENTRANCE_NICK_KEY) || '').trim().slice(0, 12);
        return { room, nick };
    } catch (e) { return { room: '', nick: '' }; }
}

export function clearRememberedEntrance() {
    try {
        localStorage.removeItem(entranceRoomKey());
        localStorage.removeItem(ENTRANCE_NICK_KEY);
    } catch (e) { }
}

// =====================================================================
// 0.55 학생 인증 정보 저장소
//
//  ★ PIN 평문은 어디에도 저장하지 않습니다.
//    본인 기기는 '증명값(proof)'만 보관합니다. 증명값은 해당 학번 전용이라
//    다른 학생에게 재사용할 수 없고, PBKDF2 10만 회를 거꾸로 풀어야
//    PIN 네 자리가 나옵니다.
//    게스트(공용 기기)는 증명값조차 남기지 않습니다. 다음 학생이 씁니다.
// =====================================================================
export const OWNER_SCHOOL_KEY = 'studentAuth:school';
export const OWNER_STUID_KEY = 'studentAuth:studentId';
export const OWNER_PROOF_KEY = 'studentAuth:proof';
const LEGACY_OWNER_PIN_KEY = 'studentAuth:pin';   // v2 잔재 — 발견 즉시 지웁니다

export const GUEST_SCHOOL_KEY = 'guestAuth:school';
export const GUEST_STUID_KEY = 'guestAuth:studentId';
export const GUEST_NICK_KEY = 'guestAuth:nickname';
export const GUEST_FLAG_KEY = 'guestAuth:isGuest';
const LEGACY_GUEST_PIN_KEY = 'guestAuth:pin';     // v2 잔재

/** v2에서 남은 평문 PIN을 조용히 제거합니다 (모듈 로드 시 1회) */
(function purgeLegacyPlainPins() {
    try { localStorage.removeItem(LEGACY_OWNER_PIN_KEY); } catch (e) { }
    try { sessionStorage.removeItem(LEGACY_GUEST_PIN_KEY); } catch (e) { }
})();

/** 폰 주인 인증 정보 읽기 (localStorage) */
export function getPhoneOwnerAuth() {
    try {
        const school = (localStorage.getItem(OWNER_SCHOOL_KEY) || '').trim();
        const studentId = (localStorage.getItem(OWNER_STUID_KEY) || '').trim();
        const proof = (localStorage.getItem(OWNER_PROOF_KEY) || '').trim();
        if (school && studentId && proof) return { school, studentId, proof };
        return null;
    } catch (e) {
        return null;
    }
}

/** 폰 주인 인증 정보 저장 — pin이 아니라 proof를 넣습니다 */
export function savePhoneOwnerAuth(school, studentId, proof) {
    try {
        localStorage.setItem(OWNER_SCHOOL_KEY, String(school ?? '').trim());
        localStorage.setItem(OWNER_STUID_KEY, String(studentId ?? '').trim());
        localStorage.setItem(OWNER_PROOF_KEY, String(proof ?? '').trim());
        localStorage.removeItem(LEGACY_OWNER_PIN_KEY);
    } catch (e) { }
}

export function clearPhoneOwnerAuth() {
    try {
        localStorage.removeItem(OWNER_SCHOOL_KEY);
        localStorage.removeItem(OWNER_STUID_KEY);
        localStorage.removeItem(OWNER_PROOF_KEY);
        localStorage.removeItem(LEGACY_OWNER_PIN_KEY);
    } catch (e) { }
}

/** 게스트 정보 임시 저장 — PIN도 증명값도 저장하지 않습니다 */
export function saveGuestAuth(school, studentId, nickname) {
    try {
        sessionStorage.setItem(GUEST_SCHOOL_KEY, String(school ?? '').trim());
        sessionStorage.setItem(GUEST_STUID_KEY, String(studentId ?? '').trim());
        sessionStorage.setItem(GUEST_NICK_KEY, String(nickname ?? '').trim());
        sessionStorage.setItem(GUEST_FLAG_KEY, 'true');
    } catch (e) { }
}

export function getGuestAuth() {
    try {
        if (sessionStorage.getItem(GUEST_FLAG_KEY) !== 'true') return null;
        return {
            school: (sessionStorage.getItem(GUEST_SCHOOL_KEY) || '').trim(),
            studentId: (sessionStorage.getItem(GUEST_STUID_KEY) || '').trim(),
            nickname: (sessionStorage.getItem(GUEST_NICK_KEY) || '').trim(),
            isGuest: true
        };
    } catch (e) {
        return null;
    }
}

export function clearGuestAuth() {
    try {
        sessionStorage.removeItem(GUEST_SCHOOL_KEY);
        sessionStorage.removeItem(GUEST_STUID_KEY);
        sessionStorage.removeItem(GUEST_NICK_KEY);
        sessionStorage.removeItem(GUEST_FLAG_KEY);
        sessionStorage.removeItem(LEGACY_GUEST_PIN_KEY);
    } catch (e) { }
}

// =====================================================================
// 0.56 PIN 게이트 · 기기 등록
// =====================================================================
export const OWNER_DEVICE_KEY = 'studentAuth:deviceId';
export const MAX_DEVICES = 3;                 // ★ 바꾸면 firestore.rules의 size() <= 3 도 함께 고치세요
const ONLINE_FRESH_MS = 120 * 1000;           // 이 시간 안에 신호가 있으면 '접속 중'
const PRESENCE_BEAT_MS = 45 * 1000;           // 접속 신호 주기

const cryptoDeps = { db, doc, setDoc, serverTimestamp };

/** 이 브라우저(기기)의 고유 ID — 없으면 생성해서 저장 */
export function getDeviceId() {
    try {
        let id = localStorage.getItem(OWNER_DEVICE_KEY);
        if (!id) {
            id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(OWNER_DEVICE_KEY, id);
        }
        return id;
    } catch (e) {
        if (!window.__tempDeviceId) window.__tempDeviceId = 'tmp_' + Math.random().toString(36).slice(2, 10);
        return window.__tempDeviceId;
    }
}

/** 대시보드에서 알아보기 쉬운 기기 이름 */
export function describeDevice() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad';
    if (/Android/i.test(ua)) return '안드로이드';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows PC';
    return '기타 기기';
}

/**
 * 기기 등록 가능 여부 확인
 * @param {Array} devices  기존 devices 배열
 * @param {string} fp      이 기기의 지문 (원본 id 아님)
 * 반환: { ok, list }
 */
export function deviceCheck(devices, fp) {
    const list = Array.isArray(devices) ? devices.filter(d => d && d.id) : [];
    const now = Date.now();
    if (list.some(d => d.id === fp)) {
        return { ok: true, list: list.map(d => d.id === fp ? { ...d, lastUsedAt: now } : d) };
    }
    if (list.length >= MAX_DEVICES) return { ok: false, list };
    return { ok: true, list: [...list, { id: fp, label: describeDevice(), registeredAt: now, lastUsedAt: now }] };
}

/** 해당 학생 계정이 지금 접속 중인지 판단 (학번 도용·중복 접속 방지용) */
export function isAccountOnline(data) {
    if (!data) return false;
    if (data.presence !== 'online' && data.presence !== 'pending') return false;
    const ms = data.lastActive?.toMillis ? data.lastActive.toMillis()
        : (typeof data.lastActive === 'number' ? data.lastActive : 0);
    if (!ms) return false;
    return (Date.now() - ms) < ONLINE_FRESH_MS;
}

/**
 * 접속 신호 유지
 *
 * v2에서는 입장할 때 lastActive를 한 번만 찍었습니다. 그래서 '이미 접속 중'
 * 판정이 입장 후 90초만 살아 있었고, 그 뒤에는 학번 도용을 막지 못했습니다.
 * 이제 45초마다 갱신하고, 창을 닫을 때 offline으로 내립니다.
 */
let _beatTimer = null;
let _beatKey = null;

export function startPresenceHeartbeat(studentKey, state = 'online') {
    stopPresenceHeartbeat();
    if (!studentKey) return;
    _beatKey = studentKey;
    const beat = () => {
        updateDoc(doc(db, "student_auth", _beatKey), {
            presence: state, lastActive: serverTimestamp()
        }).catch(() => { });
    };
    beat();
    _beatTimer = setInterval(beat, PRESENCE_BEAT_MS);

    window.addEventListener('pagehide', releasePresence, { once: true });
}

export function stopPresenceHeartbeat() {
    if (_beatTimer) clearInterval(_beatTimer);
    _beatTimer = null;
}

/** 화면을 떠날 때 접속 상태를 내려 다음 접속을 막지 않도록 합니다 */
export function releasePresence() {
    stopPresenceHeartbeat();
    if (!_beatKey) return;
    const key = _beatKey;
    _beatKey = null;
    updateDoc(doc(db, "student_auth", key), { presence: 'offline' }).catch(() => { });
}

if (typeof window !== 'undefined') {
    window.releaseStudentPresence = releasePresence;
}

/** 새 PIN 증명값을 기록합니다 (최초 등록 · 교사 초기화 후 재설정) */
async function writePinProof(studentKey, proof) {
    await setDoc(doc(db, "student_auth", studentKey, "private", "auth"),
        { ...buildPinRecordFromProof(proof), updatedAt: serverTimestamp() }, { merge: true });
    // 대시보드에서 'PIN 설정됨'을 표시하기 위한 플래그 (해시가 아니라 상태만)
    updateDoc(doc(db, "student_auth", studentKey), { pinSetAt: serverTimestamp() }).catch(() => { });
}

// =====================================================================
// 0.57 승인 교사 목록 (teacher_directory — school·name만 들어 있는 공개 컬렉션)
//
//  ★ teachers 컬렉션을 직접 읽지 않습니다. 그 문서에는 이메일과 uid가 있어서,
//    학생 화면이 읽으면 전 교사 이메일이 통째로 공개됩니다.
// =====================================================================
let _teacherCache = null;
export function clearTeacherCache() { _teacherCache = null; }
if (typeof window !== 'undefined') {
    window.clearTeacherCache = clearTeacherCache;
}

export async function fetchApprovedTeachers(force = false) {
    if (_teacherCache && !force) return _teacherCache;
    const out = [];
    try {
        const snap = await getDocs(collection(db, "teacher_directory"));
        snap.forEach(d => {
            const t = d.data() || {};
            const school = String(t.school || '').trim();
            const name = String(t.name || '').trim();
            if (!school || !name || school === '관리자') return;
            out.push({ uid: d.id, school, name });
        });
    } catch (e) { }
    _teacherCache = out;
    return out;
}

export async function fetchSchoolList() {
    const list = await fetchApprovedTeachers();
    return [...new Set(list.map(t => t.school))].sort((a, b) => a.localeCompare(b, 'ko'));
}

export async function fetchTeacherNames(school) {
    const target = String(school || '').trim();
    const list = await fetchApprovedTeachers();
    return [...new Set(list.filter(t => t.school === target).map(t => t.name))]
        .sort((a, b) => a.localeCompare(b, 'ko'));
}

// =====================================================================
// 0.58 게임(페이지)별 닉네임 기억
// =====================================================================
export function gameKey() {
    return (location.pathname || '/')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(-60) || 'game';
}

const GAME_NICK_PREFIX = 'gameNickname:';
const _memNickname = {};

function baseNickKey() { return GAME_NICK_PREFIX + gameKey(); }
function roomNickKey(roomCode) { return `${GAME_NICK_PREFIX}${gameKey()}:${roomCode}`; }

function readLocal(key) {
    try { return localStorage.getItem(key) || _memNickname[key] || ''; }
    catch (e) { return _memNickname[key] || ''; }
}
function writeLocal(key, value) {
    _memNickname[key] = String(value || '');
    try { localStorage.setItem(key, _memNickname[key]); } catch (e) { }
}

export function getLocalGameNickname() { return readLocal(baseNickKey()); }
export function setLocalGameNickname(nick) { writeLocal(baseNickKey(), nick); }
export function clearLocalGameNickname() {
    const key = baseNickKey();
    delete _memNickname[key];
    try { localStorage.removeItem(key); } catch (e) { }
}

export function getRoomNickname(roomCode) { return readLocal(roomNickKey(roomCode)); }
export function setRoomNickname(roomCode, nick) { writeLocal(roomNickKey(roomCode), nick); }

/**
 * 이 방에서 쓸 이름을 새로 받습니다. (RTDB 게임의 이름 충돌 탈출구)
 *
 * ★ setRoomNickname까지 함께 갱신하는 것이 핵심입니다.
 *   빼먹으면 다음 접속 때 기억된 옛 이름으로 되돌아가 같은 충돌을 반복하고,
 *   그 사이에 쌓은 점수가 버려진 이름에 남아 사라집니다.
 */
export function rerollRoomNickname(roomCode, avoid = '') {
    // ★ 반드시 '무작위'로 다시 뽑습니다.
    //   규칙적으로 옮기면 같은 이름을 받은 두 학생이 똑같이 옮겨 가
    //   영원히 부딪칩니다. 무작위가 그 대칭을 깹니다.
    const cur = String(avoid || '');
    let nick = generateRandomNickname();
    for (let i = 0; i < 10 && nick === cur; i++) nick = generateRandomNickname();
    setLocalGameNickname(nick);
    setRoomNickname(roomCode, nick);
    return nick;
}

/**
 * 방 안에서 닉네임을 '선점'합니다.
 *
 * {게임}_records/{방}/nicknames/{닉} 는 필드가 하나도 없는 빈 문서입니다.
 * 보안 규칙이 create만 허용하므로, 쓰기에 성공했다는 것이 곧
 * "이 이름은 지금 내 것이 되었다"는 뜻입니다. 두 학생이 동시에 시도해도
 * 한 명만 성공합니다 — 읽고 나서 쓰는 사이의 경합이 원천적으로 없습니다.
 */
export async function claimRoomNickname(markerRefFn, startNick, maxTries = 40) {
    if (typeof markerRefFn !== 'function') return startNick || generateRandomNickname();

    let candidate = (startNick || '').trim() || generateRandomNickname();
    let index = nicknameIndexOf(candidate);
    if (index < 0) { candidate = generateRandomNickname(); index = nicknameIndexOf(candidate); }

    for (let step = 0; step < maxTries; step++) {
        const nick = step === 0 ? candidate : nicknameAt(index + step * NICKNAME_STRIDE);
        try {
            await setDoc(markerRefFn(nick), {});   // create 전용 → 이미 있으면 거부됨
            return nick;
        } catch (err) {
            const code = String(err?.code || err?.message || '').toLowerCase();
            if (code.includes('permission')) continue;   // 남이 쓰는 이름 → 다음 조합
            throw err;                                   // 네트워크·설정 오류는 위로
        }
    }
    return null;
}

// =====================================================================
// 0.6 자동 닉네임 생성기 (형용사 + 동물명/캐릭터)
// =====================================================================
export const ADJECTIVES = [
    "부끄러운", "용감한", "씩씩한", "행복한", "다정한",
    "신난", "영리한", "날렵한", "귀여운", "멋진",
    "활기찬", "따뜻한", "지혜로운", "차분한", "유쾌한",
    "당당한", "느긋한", "순수한", "든든한", "똑똑한",
    "재빠른", "얌전한", "엉뚱한", "상냥한", "친절한",
    "쾌활한", "슬기로운", "긍정적인", "열정적인", "침착한",
    "명랑한", "호기로운", "당찬", "맑은", "눈부신",
    "풋풋한", "온화한", "부지런한", "성실한", "끈기있는",
    "반짝이는", "총명한", "사랑스런", "포근한", "듬직한",
    "깜찍한", "재치있는", "신비로운", "정직한", "솔직한",
    "똘똘한", "꼼꼼한", "자상한", "패기있는", "호탕한",
    "용맹한", "기운찬", "재미있는", "빛나는", "장난스런"
];

export const ANIMALS = [
    "어피치", "라이언", "무지", "콘", "프로도",
    "네오", "튜브", "제이지", "춘식이", "조르디",
    "호랑이", "사자", "표범", "치타", "늑대",
    "여우", "북극곰", "판다", "레서판다", "코알라",
    "캥거루", "알파카", "토끼", "다람쥐", "수달",
    "해달", "비버", "바다표범", "물개", "돌고래",
    "고래", "펭귄", "플라밍고", "부엉이", "올빼미",
    "독수리", "참새", "까치", "앵무새", "두루미",
    "코끼리", "기린", "얼룩말", "하마", "코뿔소",
    "사슴", "노루", "고양이", "강아지", "댕댕이",
    "햄스터", "고슴도치", "미어캣", "쿼카", "나무늘보",
    "카멜레온", "북극여우", "두더지", "너구리", "라쿤"
];

/** 형용사 × 동물 전체 조합 수 (60 × 60 = 3,600) */
export const NICKNAME_POOL_SIZE = ADJECTIVES.length * ANIMALS.length;

/**
 * 조합을 순회할 때 쓰는 보폭. 3,600과 서로소(1187은 소수)라서
 * 어떤 시작점에서 출발해도 3,600개 조합을 한 번씩 모두 방문합니다.
 */
const NICKNAME_STRIDE = 1187;

export function nicknameAt(index) {
    const size = NICKNAME_POOL_SIZE;
    const i = ((Math.trunc(index) % size) + size) % size;
    return `${ADJECTIVES[Math.floor(i / ANIMALS.length)]} ${ANIMALS[i % ANIMALS.length]}`;
}

export function nicknameIndexOf(nickname) {
    const parts = String(nickname || '').split(' ');
    if (parts.length !== 2) return -1;
    const a = ADJECTIVES.indexOf(parts[0]);
    const b = ANIMALS.indexOf(parts[1]);
    if (a < 0 || b < 0) return -1;
    return a * ANIMALS.length + b;
}

export function generateRandomNickname() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adj} ${animal}`;
}
if (typeof window !== 'undefined') {
    window.generateRandomNickname = generateRandomNickname;
}

// ── 하위 호환 shim (예전 게임 페이지가 import 해도 깨지지 않도록) ──
export function getOrCreateGameNickname() {
    let nick = getLocalGameNickname();
    if (!nick) { nick = generateRandomNickname(); setLocalGameNickname(nick); }
    return nick;
}

export async function generateUniqueNickname(isTakenFn, maxChecks = 40) {
    const start = Math.floor(Math.random() * NICKNAME_POOL_SIZE);
    if (typeof isTakenFn !== 'function') return nicknameAt(start);
    const limit = Math.max(1, Math.min(maxChecks, NICKNAME_POOL_SIZE));
    for (let step = 0; step < limit; step++) {
        const cand = nicknameAt(start + step * NICKNAME_STRIDE);
        try { if (!(await isTakenFn(cand))) return cand; } catch (e) { return cand; }
    }
    return nicknameAt(start + limit * NICKNAME_STRIDE);
}

/** (하위 호환) 이제 서버에 저장하지 않습니다 — 방별 이름은 입장 시 확정됩니다. */
export async function saveGameNickname(nickname) {
    const nick = String(nickname || '').trim();
    if (nick) setLocalGameNickname(nick);
}

// =====================================================================
// 1. 공통 모달
// =====================================================================
function ensureModalDOM() {
    if (document.getElementById('customModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="customModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold" id="customModalTitle">알림</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pb-0" id="customModalBody"></div>
                <div class="modal-footer border-0 pt-3">
                    <button type="button" class="btn btn-secondary rounded-3 px-4 d-none" id="customModalCancel">취소</button>
                    <button type="button" class="btn btn-primary rounded-3 px-4" id="customModalConfirm">확인</button>
                </div>
            </div>
        </div>
    </div>`);

    document.getElementById('customModal').addEventListener('hide.bs.modal', function () {
        if (document.activeElement && this.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    });
}

function ensureShakeStyle() {
    if (document.getElementById('room-auth-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'room-auth-inline-style';
    style.textContent = `
        @keyframes roomAuthShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-6px); }
            40% { transform: translateX(6px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
        }
        .shake { animation: roomAuthShake 0.4s ease; }
        @media (prefers-reduced-motion: reduce) { .shake { animation: none; } }
    `;
    document.head.appendChild(style);
}

/** 모달을 하나씩 순서대로 띄우기 위한 큐 */
let modalQueue = Promise.resolve();

function bsModalFor(el) {
    return bootstrap.Modal.getOrCreateInstance(el);
}

function openCustomModal(title, message, isPrompt, isPassword, isConfirm) {
    ensureModalDOM();
    ensureShakeStyle();

    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
        const plain = String(message).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
        if (isPrompt) return Promise.resolve(window.prompt(`${title}\n${plain}`));
        if (isConfirm) return Promise.resolve(window.confirm(`${title}\n${plain}`));
        window.alert(`${title}\n${plain}`);
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        const modalEl = document.getElementById('customModal');
        const instance = bsModalFor(modalEl);

        // 주의: title/message는 개발자가 작성한 문자열만 넘겨야 합니다.
        //       학생이 입력한 값은 반드시 escapeHtml()로 감싸세요.
        document.getElementById('customModalTitle').innerHTML = title;

        let bodyHtml = `<p class="mb-0 fs-5">${message}</p>`;
        if (isPrompt) {
            const type = isPassword ? 'password' : 'text';
            bodyHtml += `<input type="${type}" class="form-control form-control-lg mt-3 text-center fw-bold" id="customModalInput" autocomplete="off">`;
        }
        document.getElementById('customModalBody').innerHTML = bodyHtml;

        const btnCancel = document.getElementById('customModalCancel');
        const btnConfirm = document.getElementById('customModalConfirm');

        if (isPrompt || isConfirm) btnCancel.classList.remove('d-none');
        else btnCancel.classList.add('d-none');

        let resolveValue = null;
        let settled = false;

        const blurBeforeHide = () => {
            if (document.activeElement && modalEl.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        };

        const handleConfirm = () => {
            if (settled) return;
            settled = true;
            resolveValue = isPrompt ? (document.getElementById('customModalInput')?.value ?? "") : true;
            blurBeforeHide();
            instance.hide();
        };
        const handleCancel = () => {
            if (settled) return;
            settled = true;
            resolveValue = isConfirm ? false : null;
            blurBeforeHide();
            instance.hide();
        };
        const handleHidden = () => {
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            setTimeout(() => resolve(resolveValue), 0);
        };

        btnConfirm.addEventListener('click', handleConfirm);
        btnCancel.addEventListener('click', handleCancel);
        modalEl.addEventListener('hidden.bs.modal', handleHidden);

        instance.show();

        if (isPrompt) {
            modalEl.addEventListener('shown.bs.modal', function onShown() {
                const input = document.getElementById('customModalInput');
                if (input) {
                    input.focus();
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') handleConfirm();
                    });
                }
                modalEl.removeEventListener('shown.bs.modal', onShown);
            });
        }
    });
}

export function showCustomModal(title, message, isPrompt = false, isPassword = false, isConfirm = false) {
    const run = () => openCustomModal(title, message, isPrompt, isPassword, isConfirm);
    const result = modalQueue.then(run, run);
    modalQueue = result.catch(() => { });
    return result;
}

export const customAlert = (t, m) => showCustomModal(t, m, false);
export const customPrompt = (t, m, pw = false) => showCustomModal(t, m, true, pw);
export const customConfirm = (t, m) => showCustomModal(t, m, false, false, true);

// =====================================================================
// 2. 게임방법 안내 슬라이드 모달
// =====================================================================
function ensureGuideStyle() {
    if (document.getElementById('room-auth-guide-style')) return;
    const style = document.createElement('style');
    style.id = 'room-auth-guide-style';
    style.textContent = `
        .guide-slide-media {
            max-height: 52vh; max-width: 100%; object-fit: contain;
            border-radius: 12px; background-color: #ffffff;
            border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
        }
        #guideCarousel { padding-bottom: 2.5rem; }
        #guideCarousel .carousel-indicators { bottom: 0; margin-bottom: 0.25rem; }
        #guideCarousel .carousel-control-prev,
        #guideCarousel .carousel-control-next { width: 8%; }
    `;
    document.head.appendChild(style);
}

function ensureGuideModalDOM() {
    if (document.getElementById('guideModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="guideModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold" id="guideModalTitle">게임 방법</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                </div>
                <div class="modal-body pt-2" id="guideModalBody"></div>
            </div>
        </div>
    </div>`);

    document.getElementById('guideModal').addEventListener('hide.bs.modal', function () {
        if (document.activeElement && this.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    });
}

export function showGuideModal(slides, title = "게임 방법") {
    if (!Array.isArray(slides) || slides.length === 0) return;
    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) return;

    ensureGuideStyle();
    ensureGuideModalDOM();
    const modalEl = document.getElementById('guideModal');
    document.getElementById('guideModalTitle').textContent = title;

    const indicators = slides.map((s, i) => `
        <button type="button" data-bs-target="#guideCarousel" data-bs-slide-to="${i}"
            ${i === 0 ? 'class="active" aria-current="true"' : ''}
            aria-label="${escapeHtml(s.title || `슬라이드 ${i + 1}`)}"></button>`).join('');

    const items = slides.map((s, i) => `
        <div class="carousel-item ${i === 0 ? 'active' : ''}">
            <div class="d-flex flex-column align-items-center text-center px-4 px-md-5">
                <img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.alt || s.title || '')}" class="guide-slide-media mb-3" loading="lazy">
                ${s.title ? `<h5 class="fw-bold text-dark mb-1">${escapeHtml(s.title)}</h5>` : ''}
                ${s.desc ? `<p class="text-secondary small mb-0">${escapeHtml(s.desc)}</p>` : ''}
            </div>
        </div>`).join('');

    document.getElementById('guideModalBody').innerHTML = `
        <div id="guideCarousel" class="carousel carousel-dark slide" data-bs-interval="false" data-bs-touch="true">
            <div class="carousel-indicators">${indicators}</div>
            <div class="carousel-inner">${items}</div>
            <button class="carousel-control-prev" type="button" data-bs-target="#guideCarousel" data-bs-slide="prev">
                <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                <span class="visually-hidden">이전</span>
            </button>
            <button class="carousel-control-next" type="button" data-bs-target="#guideCarousel" data-bs-slide="next">
                <span class="carousel-control-next-icon" aria-hidden="true"></span>
                <span class="visually-hidden">다음</span>
            </button>
        </div>`;

    bsModalFor(modalEl).show();
}

// =====================================================================
// 3. 관리자(교사) 권한 확인
// =====================================================================
export async function verifyAdminAccess(onSuccess, onFailure) {
    if (window.isApprovedTeacher || window.isAdmin) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
    }
    await customAlert("접근 권한 없음", "교사 로그인을 완료하고 승인된 선생님만 이용할 수 있습니다.");
    if (typeof onFailure === 'function') onFailure();
    return false;
}

// =====================================================================
// 3.5 방 모드 선택 / 학생 인증 모달
// =====================================================================

/** 교사 방 생성 시 빠른 입장 모드 vs 학생 인증 모드 선택 */
export function promptRoomMode() {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('roomModeModal');
        if (!modalEl) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="roomModeModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold">🎯 방 생성 모드 선택</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <p class="text-muted small mb-3">수업 상황에 알맞은 입장 방식을 선택해주세요.</p>
                            <div class="list-group">
                                <label class="list-group-item list-group-item-action d-flex gap-3 py-3 border rounded-3 mb-2" style="cursor:pointer;">
                                    <input class="form-check-input flex-shrink-0" type="radio" name="roomModeOption" id="modeQuick" value="quick" checked>
                                    <span>
                                        <strong class="d-block text-dark">🚀 A. 빠른 입장 모드</strong>
                                        <small class="d-block text-muted">방 코드 4자리만으로 즉시 입장합니다. 학교·학번·PIN을 묻지 않고, 게스트 승인 절차도 없습니다.</small>
                                    </span>
                                </label>
                                <label class="list-group-item list-group-item-action d-flex gap-3 py-3 border rounded-3" style="cursor:pointer;">
                                    <input class="form-check-input flex-shrink-0" type="radio" name="roomModeOption" id="modeAuth" value="auth">
                                    <span>
                                        <strong class="d-block text-dark">🔐 B. 학생 인증 모드</strong>
                                        <small class="d-block text-muted">기기 등록(학교·담당 선생님·학번·4자리 PIN)이 필요합니다. 공용 기기는 게스트로 들어와 선생님 승인을 받습니다.</small>
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-secondary rounded-3 px-3" data-bs-dismiss="modal">취소</button>
                            <button type="button" class="btn btn-primary rounded-3 px-4 fw-bold" id="btnConfirmRoomMode">선택 완료</button>
                        </div>
                    </div>
                </div>
            </div>`);
            modalEl = document.getElementById('roomModeModal');
        }

        const bsModal = bsModalFor(modalEl);
        const confirmBtn = document.getElementById('btnConfirmRoomMode');
        let selected = null;

        const onConfirm = () => {
            const checked = modalEl.querySelector('input[name="roomModeOption"]:checked');
            selected = checked ? checked.value : 'quick';
            bsModal.hide();
        };
        const onHidden = () => {
            confirmBtn.removeEventListener('click', onConfirm);
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            resolve(selected);
        };

        confirmBtn.addEventListener('click', onConfirm);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        bsModal.show();
    });
}

/**
 * 학생 본인 인증 / 게스트 인증 모달
 *
 * ★ 게스트(isGuest=true)로 열 때는 호출하는 쪽에서 initial* 을 넘기지 않습니다.
 *   공용 기기에 남아 있는 폰 주인 정보가 새 학생 화면에 미리 채워지면,
 *   그대로 확인만 누른 학생이 남의 학번으로 들어가게 됩니다.
 */
export function promptStudentAuthModal({ isGuest = false, initialSchool = '', initialStudentId = '', initialTeachers = [] } = {}) {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('studentAuthModal');
        if (!modalEl) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="studentAuthModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold" id="studentAuthModalTitle">📱 학생 본인 인증</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <div class="alert alert-info py-2 small mb-3" id="studentAuthModalNotice"></div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary" for="authSchoolSelect">학교명</label>
                                <select class="form-select form-select-lg bg-light fw-bold" id="authSchoolSelect">
                                    <option value="">불러오는 중...</option>
                                </select>
                            </div>
                            <div class="mb-3 d-none" id="authCustomSchoolGroup">
                                <label class="form-label small fw-bold text-secondary" for="authSchoolInput">학교명 직접 입력</label>
                                <input type="text" class="form-control bg-light" id="authSchoolInput" placeholder="예: 동동중학교" autocomplete="off" maxlength="30">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">담당 선생님 <span class="text-muted fw-normal">(여러 명 선택 가능)</span></label>
                                <div id="authTeacherList" class="border rounded-3 p-2 bg-light" style="max-height:150px; overflow-y:auto;"></div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary" for="inputAuthStudentId">학번 <span class="text-muted fw-normal">(숫자만)</span></label>
                                <input type="text" class="form-control form-control-lg bg-light text-center fw-bold" id="inputAuthStudentId" placeholder="예: 20315" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="off">
                                <div class="form-text small text-muted">학년·반·번호를 붙여 씁니다. 예) 2학년 3반 15번 → <b>20315</b></div>
                            </div>
                            <div class="mb-2">
                                <label class="form-label small fw-bold text-secondary" for="inputAuthPin">4자리 숫자 PIN</label>
                                <input type="password" class="form-control form-control-lg bg-light text-center fw-bold" id="inputAuthPin" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
                                <div class="form-text small text-muted" id="authPinHelp"></div>
                            </div>
                            <div id="authModalError" class="text-danger small fw-bold mt-2" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-secondary rounded-3 px-3" data-bs-dismiss="modal">취소</button>
                            <button type="button" class="btn btn-primary rounded-3 px-4 fw-bold" id="btnConfirmStudentAuth">확인</button>
                        </div>
                    </div>
                </div>
            </div>`);
            modalEl = document.getElementById('studentAuthModal');
        }

        const titleEl = document.getElementById('studentAuthModalTitle');
        const noticeEl = document.getElementById('studentAuthModalNotice');
        const schoolSelect = document.getElementById('authSchoolSelect');
        const customGroup = document.getElementById('authCustomSchoolGroup');
        const schoolInput = document.getElementById('authSchoolInput');
        const teacherList = document.getElementById('authTeacherList');
        const studentIdIn = document.getElementById('inputAuthStudentId');
        const pinIn = document.getElementById('inputAuthPin');
        const pinHelp = document.getElementById('authPinHelp');
        const errEl = document.getElementById('authModalError');
        const confirmBtn = document.getElementById('btnConfirmStudentAuth');

        titleEl.textContent = isGuest ? "🙋 게스트로 입장하기" : "📱 학생 본인 인증";
        noticeEl.className = isGuest ? "alert alert-warning py-2 small mb-3" : "alert alert-info py-2 small mb-3";
        noticeEl.innerHTML = isGuest
            ? "공용 기기로 들어옵니다. 이 기기에는 <b>아무것도 저장하지 않습니다.</b><br>본인 학교·학번·PIN을 입력한 뒤 선생님 승인을 기다려주세요."
            : "최초 1회 기기 등록 후 다음부터는 자동으로 로그인됩니다.";
        pinHelp.textContent = isGuest
            ? "본인 학번의 PIN이 맞아야 입장할 수 있습니다."
            : `다른 학생이 내 학번을 도용하지 못하도록 설정하는 4자리 숫자입니다. 기기는 최대 ${MAX_DEVICES}대까지 등록됩니다.`;

        studentIdIn.value = isGuest ? '' : String(initialStudentId || '').replace(/[^0-9]/g, '').slice(0, 10);
        studentIdIn.oninput = () => {
            studentIdIn.value = studentIdIn.value.replace(/[^0-9]/g, '').slice(0, 10);
        };
        pinIn.oninput = () => {
            pinIn.value = pinIn.value.replace(/[^0-9]/g, '').slice(0, 4);
        };
        pinIn.value = '';
        errEl.style.display = 'none';
        teacherList.innerHTML = '<div class="text-muted small">학교를 먼저 선택해주세요.</div>';

        const presetSchool = isGuest ? '' : initialSchool;
        const presetTeachers = isGuest ? [] : (Array.isArray(initialTeachers) ? initialTeachers : []);

        const currentSchool = () => (schoolSelect.value === '__direct__' ? schoolInput.value : schoolSelect.value).trim();

        const renderTeachers = async (preset = []) => {
            const school = currentSchool();
            if (!school) { teacherList.innerHTML = '<div class="text-muted small">학교를 먼저 선택해주세요.</div>'; return; }
            teacherList.innerHTML = '<div class="text-muted small">불러오는 중...</div>';
            const names = await fetchTeacherNames(school);
            if (names.length === 0) {
                teacherList.innerHTML = '<div class="text-muted small">이 학교에 등록된 선생님이 없습니다. 그대로 진행해도 됩니다.</div>';
                return;
            }
            teacherList.innerHTML = names.map((n, i) => `
                <div class="form-check">
                    <input class="form-check-input auth-teacher-check" type="checkbox" value="${escapeHtml(n)}" id="authTeacher${i}" ${preset.includes(n) ? 'checked' : ''}>
                    <label class="form-check-label fw-bold" for="authTeacher${i}">${escapeHtml(n)} 선생님</label>
                </div>`).join('');
        };

        const buildSchoolOptions = async () => {
            const schools = await fetchSchoolList();
            let html = '<option value="">-- 학교를 선택하세요 --</option>';
            schools.forEach(s => {
                html += `<option value="${escapeHtml(s)}" ${s === presetSchool ? 'selected' : ''}>🏫 ${escapeHtml(s)}</option>`;
            });
            html += '<option value="__direct__">✏️ 직접 입력</option>';
            schoolSelect.innerHTML = html;

            if (presetSchool && !schools.includes(presetSchool)) {
                schoolSelect.value = '__direct__';
                customGroup.classList.remove('d-none');
                schoolInput.value = presetSchool;
            } else {
                customGroup.classList.add('d-none');
                schoolInput.value = '';
            }
            renderTeachers(presetTeachers);
        };

        schoolSelect.onchange = () => {
            if (schoolSelect.value === '__direct__') {
                customGroup.classList.remove('d-none');
                schoolInput.value = '';
                schoolInput.focus();
            } else {
                customGroup.classList.add('d-none');
            }
            renderTeachers([]);
        };

        let schoolTypeTimer = null;
        schoolInput.oninput = () => {
            clearTimeout(schoolTypeTimer);
            schoolTypeTimer = setTimeout(() => renderTeachers([]), 400);
        };

        buildSchoolOptions();

        const bsModal = bsModalFor(modalEl);
        let result = null;

        const fail = (msg, el) => { errEl.textContent = msg; errEl.style.display = 'block'; if (el) el.focus(); };

        const onConfirm = () => {
            const school = currentSchool();
            const studentId = studentIdIn.value.trim();
            const pin = pinIn.value.trim();
            const boxes = [...teacherList.querySelectorAll('.auth-teacher-check')];
            const teachers = boxes.filter(b => b.checked).map(b => b.value);

            if (!school) return fail("학교명을 선택하거나 입력해주세요.", schoolSelect);
            if (school.length > 30) return fail("학교명이 너무 깁니다.", schoolInput);
            if (boxes.length > 0 && teachers.length === 0) return fail("담당 선생님을 1명 이상 선택해주세요.");
            if (!/^\d{2,10}$/.test(studentId)) return fail("학번은 숫자 2~10자리로 입력해주세요. (예: 20315)", studentIdIn);
            if (!/^\d{4}$/.test(pin)) return fail("PIN 번호는 4자리 숫자로 입력해주세요.", pinIn);

            result = { school, studentId, pin, teachers };
            bsModal.hide();
        };

        const onHidden = () => {
            pinIn.value = '';                       // 화면을 떠날 때 PIN 흔적 제거
            confirmBtn.removeEventListener('click', onConfirm);
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            resolve(result);
        };

        confirmBtn.addEventListener('click', onConfirm);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        bsModal.show();
    });
}

/**
 * 인증 모드 입장 시 저장된 학생 정보 확인 모달
 * 반환: 'ok'(이대로 입장) | 'edit'(정보 수정) | null(취소)
 */
export function promptStudentConfirmModal({ school = '', studentId = '', teachers = [], nickname = '', deviceCount = 0 } = {}) {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('studentConfirmModal');
        if (!modalEl) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="studentConfirmModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold">🙋 내 정보가 맞나요?</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <p class="text-muted small mb-3">이 정보로 게임에 접속합니다. 내 정보가 아니면 [정보 수정]을 눌러주세요.</p>
                            <ul class="list-group list-group-flush border rounded-3" id="studentConfirmList"></ul>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-outline-secondary rounded-3 px-3 fw-bold" id="btnEditStudentInfo">✏️ 정보 수정</button>
                            <button type="button" class="btn btn-primary rounded-3 px-4 fw-bold" id="btnConfirmStudentInfo">맞아요, 입장하기</button>
                        </div>
                    </div>
                </div>
            </div>`);
            modalEl = document.getElementById('studentConfirmModal');
        }

        const row = (label, value) => `
            <li class="list-group-item d-flex justify-content-between align-items-center px-3">
                <span class="text-secondary small fw-bold">${label}</span>
                <span class="fw-bold text-dark text-end">${value}</span>
            </li>`;

        document.getElementById('studentConfirmList').innerHTML =
            row('학교', escapeHtml(school)) +
            row('학번', escapeHtml(studentId)) +
            row('담당 선생님', (teachers && teachers.length) ? escapeHtml(teachers.join(', ')) : '<span class="text-muted fw-normal">미지정</span>') +
            (nickname ? row('내 닉네임', `<span class="text-primary">${escapeHtml(nickname)}</span>`) : '') +
            row('등록 기기', `${safeNumber(deviceCount)}/${MAX_DEVICES}대`);

        const okBtn = document.getElementById('btnConfirmStudentInfo');
        const editBtn = document.getElementById('btnEditStudentInfo');
        const bsModal = bsModalFor(modalEl);
        let answer = null;

        const onOk = () => { answer = 'ok'; bsModal.hide(); };
        const onEdit = () => { answer = 'edit'; bsModal.hide(); };
        const onHidden = () => {
            okBtn.removeEventListener('click', onOk);
            editBtn.removeEventListener('click', onEdit);
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            resolve(answer);
        };

        okBtn.addEventListener('click', onOk);
        editBtn.addEventListener('click', onEdit);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        bsModal.show();
    });
}

/** PIN 초기화 복구용 재설정 모달 (취소 가능) */
export function promptNewPinModal() {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('newPinModal');
        if (!modalEl) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="newPinModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold text-danger">🔑 PIN 번호 재설정</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <div class="alert alert-warning py-2 small mb-3">
                                선생님이 PIN 번호를 초기화했습니다.<br>
                                앞으로 사용할 새로운 4자리 숫자 PIN을 입력해주세요.
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary" for="inputNewPin">새로운 4자리 PIN</label>
                                <input type="password" class="form-control form-control-lg bg-light text-center fw-bold" id="inputNewPin" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
                            </div>
                            <div id="newPinModalError" class="text-danger small fw-bold" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-secondary rounded-3 px-3" data-bs-dismiss="modal">취소</button>
                            <button type="button" class="btn btn-primary rounded-3 px-4 fw-bold" id="btnConfirmNewPin">PIN 설정 완료</button>
                        </div>
                    </div>
                </div>
            </div>`);
            modalEl = document.getElementById('newPinModal');
        }

        const pinIn = document.getElementById('inputNewPin');
        const errEl = document.getElementById('newPinModalError');
        const confirmBtn = document.getElementById('btnConfirmNewPin');
        pinIn.value = '';
        errEl.style.display = 'none';
        pinIn.oninput = () => { pinIn.value = pinIn.value.replace(/[^0-9]/g, '').slice(0, 4); };

        const bsModal = bsModalFor(modalEl);
        let newPin = null;

        const onConfirm = () => {
            const p = pinIn.value.trim();
            if (!/^\d{4}$/.test(p)) {
                errEl.textContent = "PIN 번호는 4자리 숫자로 입력해주세요.";
                errEl.style.display = 'block';
                pinIn.focus();
                return;
            }
            newPin = p;
            bsModal.hide();
        };
        const onHidden = () => {
            pinIn.value = '';
            confirmBtn.removeEventListener('click', onConfirm);
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            resolve(newPin);
        };

        confirmBtn.addEventListener('click', onConfirm);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        bsModal.show();
    });
}

/** 게스트 입장 대기 스피너 모달 */
export function showGuestWaitingModal(onCancel) {
    let modalEl = document.getElementById('guestWaitingModal');
    if (!modalEl) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="guestWaitingModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content rounded-4 border-0 shadow text-center p-4">
                    <div class="spinner-border text-primary mx-auto my-3" style="width: 3.5rem; height: 3.5rem;" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <h5 class="fw-bold text-dark mb-2">선생님의 승인을 기다리고 있습니다</h5>
                    <p class="text-muted small mb-1">내 이름: <b class="text-primary" id="guestWaitNickname"></b></p>
                    <p class="text-muted small mb-4">선생님이 대시보드에서 입장을 승인하면 자동으로 게임 화면으로 이동합니다.</p>
                    <div>
                        <button type="button" class="btn btn-outline-secondary rounded-3 px-4" id="btnCancelGuestWait">입장 대기 취소</button>
                    </div>
                </div>
            </div>
        </div>`);
        modalEl = document.getElementById('guestWaitingModal');
    }

    const bsModal = bsModalFor(modalEl);
    const cancelBtn = document.getElementById('btnCancelGuestWait');

    const handleCancel = () => {
        bsModal.hide();
        if (typeof onCancel === 'function') onCancel();
    };

    cancelBtn.onclick = handleCancel;
    bsModal.show();

    return {
        setNickname: (nick) => {
            const el = document.getElementById('guestWaitNickname');
            if (el) el.textContent = nick || '';
        },
        close: () => {
            cancelBtn.onclick = null;
            bsModal.hide();
        }
    };
}

/** 화면 우측 상단 게스트 모드 종료 플로팅 버튼 */
export function showGuestExitButton(onExit) {
    hideGuestExitButton();
    document.body.insertAdjacentHTML('beforeend', `
    <div id="guestExitFloatingBadge" style="position: fixed; top: 14px; right: 14px; z-index: 99999;">
        <button id="btnExitGuestMode" class="btn btn-danger btn-sm rounded-pill fw-bold shadow-lg px-3 py-2 border-2 border-white d-flex align-items-center gap-1">
            🚪 게스트 모드 종료
        </button>
    </div>`);

    document.getElementById('btnExitGuestMode')?.addEventListener('click', async () => {
        const confirmed = await customConfirm("게스트 모드 종료",
            "게스트 모드를 종료하시겠습니까?<br><span class='text-muted small'>이 기기에 남는 정보는 없습니다.</span>");
        if (!confirmed) return;
        hideGuestExitButton();
        if (typeof onExit === 'function') await onExit();
    });
}

export function hideGuestExitButton() {
    document.getElementById('guestExitFloatingBadge')?.remove();
}

/**
 * 교사 대시보드 PIN 초기화 모달
 *
 * ★ v2는 공개 문서의 pin 필드를 비웠는데, v2부터 PIN은 그 문서에 없습니다.
 *   그래서 눌러도 아무 일이 일어나지 않았습니다. 이제 private/auth의
 *   pinHash를 비웁니다 — 학생은 다음 접속 때 새 PIN을 설정하게 됩니다.
 */
export async function showPinResetModal() {
    let teacherSchool = window.currentTeacherSchool || '';
    const schools = await fetchSchoolList();

    return new Promise((resolve) => {
        let modalEl = document.getElementById('pinResetModal');
        if (!modalEl) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="pinResetModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold text-danger"><i class="bi bi-key-fill"></i> 학생 PIN 초기화</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <p class="text-muted small mb-3">학교와 학번을 입력하면 해당 학생의 PIN이 초기화됩니다. 학생은 다음 접속 시 새 4자리 PIN을 설정합니다.</p>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary" for="pinResetSchoolSelect">학교명 선택</label>
                                <select class="form-select bg-light fw-bold" id="pinResetSchoolSelect"></select>
                            </div>
                            <div class="mb-3 d-none" id="pinResetCustomSchoolGroup">
                                <label class="form-label small fw-bold text-secondary" for="pinResetSchoolInput">학교명 직접 입력</label>
                                <input type="text" class="form-control bg-light" id="pinResetSchoolInput" placeholder="예: 동동중학교" autocomplete="off">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary" for="pinResetStudentIdInput">학번 (숫자만)</label>
                                <input type="text" class="form-control bg-light" id="pinResetStudentIdInput" placeholder="예: 20315" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="off">
                            </div>
                            <div class="alert alert-light border small text-muted mb-0">
                                여러 명을 한 번에 처리하거나 기기 등록을 초기화하려면 상단 메뉴의 <b>학생 관리</b> 페이지를 이용하세요.
                            </div>
                            <div id="pinResetError" class="text-danger small fw-bold mt-2" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-secondary rounded-3 px-3" data-bs-dismiss="modal">취소</button>
                            <button type="button" class="btn btn-danger rounded-3 px-4 fw-bold" id="btnExecutePinReset">초기화 실행</button>
                        </div>
                    </div>
                </div>
            </div>`);
            modalEl = document.getElementById('pinResetModal');
        }

        const schoolSelect = document.getElementById('pinResetSchoolSelect');
        const customGroup = document.getElementById('pinResetCustomSchoolGroup');
        const schoolInput = document.getElementById('pinResetSchoolInput');
        const studentIdInput = document.getElementById('pinResetStudentIdInput');
        const errEl = document.getElementById('pinResetError');
        const confirmBtn = document.getElementById('btnExecutePinReset');

        errEl.style.display = 'none';
        studentIdInput.value = '';
        studentIdInput.oninput = () => {
            studentIdInput.value = studentIdInput.value.replace(/[^0-9]/g, '').slice(0, 10);
        };

        const merged = [...new Set([teacherSchool, ...schools].filter(Boolean))];
        schoolSelect.innerHTML =
            merged.map(s => `<option value="${escapeHtml(s)}" ${s === teacherSchool ? 'selected' : ''}>🏫 ${escapeHtml(s)}${s === teacherSchool ? ' (내 학교)' : ''}</option>`).join('')
            + `<option value="__direct__">✏️ 직접 학교명 입력</option>`;

        schoolSelect.onchange = () => {
            const direct = schoolSelect.value === '__direct__';
            customGroup.classList.toggle('d-none', !direct);
            if (direct) { schoolInput.value = ''; schoolInput.focus(); }
        };

        const bsModal = bsModalFor(modalEl);
        let executed = false;

        const onConfirm = async () => {
            const school = (schoolSelect.value === '__direct__' ? schoolInput.value : schoolSelect.value).trim();
            const studentId = studentIdInput.value.trim();

            if (!school) { errEl.textContent = "학교명을 선택하거나 입력해주세요."; errEl.style.display = 'block'; return; }
            if (!/^\d{2,10}$/.test(studentId)) { errEl.textContent = "학번은 숫자 2~10자리로 입력해주세요."; errEl.style.display = 'block'; studentIdInput.focus(); return; }

            confirmBtn.disabled = true;
            confirmBtn.textContent = "처리 중...";
            try {
                const sKey = makeStudentKey(school, studentId);
                const snap = await getDoc(doc(db, "student_auth", sKey));
                if (!snap.exists()) {
                    errEl.textContent = "해당 학생을 찾지 못했습니다. 학교명과 학번을 다시 확인해주세요.";
                    errEl.style.display = 'block';
                    return;
                }
                await resetStudentPin(sKey);
                executed = true;
                bsModal.hide();
                await customAlert("초기화 완료",
                    `<strong>${escapeHtml(school)}</strong>의 <strong>${escapeHtml(studentId)}</strong> 학생 PIN이 초기화되었습니다.<br>학생이 다음 접속 시 새 4자리 PIN을 설정합니다.`);
            } catch (err) {
                console.error('PIN 초기화 실패:', err);
                errEl.textContent = "초기화에 실패했습니다. 교사 로그인 상태와 네트워크를 확인해주세요.";
                errEl.style.display = 'block';
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "초기화 실행";
            }
        };

        const onHidden = () => {
            confirmBtn.removeEventListener('click', onConfirm);
            modalEl.removeEventListener('hidden.bs.modal', onHidden);
            resolve(executed);
        };

        confirmBtn.addEventListener('click', onConfirm);
        modalEl.addEventListener('hidden.bs.modal', onHidden);
        bsModal.show();
    });
}

/**
 * PIN 초기화 실제 처리 (교사 전용) — 학생 관리 페이지에서도 씁니다.
 * pinHash를 null로 두면 규칙이 "초기화된 계정"으로 보고 학생의 새 PIN 기록을 허용합니다.
 */
export async function resetStudentPin(studentKey) {
    await setDoc(doc(db, "student_auth", studentKey, "private", "auth"),
        { pinHash: null, resetAt: serverTimestamp() }, { merge: true });
    await updateDoc(doc(db, "student_auth", studentKey), {
        presence: 'offline', pinSetAt: null, updatedAt: serverTimestamp()
    }).catch(() => { });
}

/**
 * 학생 완전 삭제 (교사 전용)
 *
 * ★ Firestore는 문서를 지워도 하위 컬렉션이 남습니다.
 *   private/auth를 남겨 두면 그 학번은 재등록이 영원히 막힙니다.
 *   (새 PIN 기록이 '이미 해시가 있음'으로 거부되기 때문)
 */
export async function purgeStudent(studentKey) {
    await deleteDoc(doc(db, "student_auth", studentKey, "private", "auth")).catch(() => { });
    await deleteDoc(doc(db, "student_auth", studentKey));
}

// =====================================================================
// 4. 방 입장 카드 렌더링
// =====================================================================
export function renderRoomEntrance(container, options = {}) {
    const target = typeof container === 'string' ? document.getElementById(container) : container;
    if (!target) return;

    ensureShakeStyle();

    const {
        title = "🧑‍🎓 게임 입장하기",
        roomCodePlaceholder = "방 코드 4자리 입력",
        joinBtnText = "🎮 방 입장하기",
        dashBtnText = "대시보드 열기",
        guideSlides = null,
        guideBtnText = "📖 게임방법 보기",
        guideTitle = "게임 방법",
        rememberLastEntry = true,
        // ★ RTDB 게임(오목·가위바위보·블로토)처럼 인증 모드가 없는 페이지는
        //   showGuestToggle: false 로 두면 헷갈리는 체크박스가 사라집니다.
        showGuestToggle = true,
        onJoin = null,
        onAdminSuccess = null,
        onAdminFailure = null
    } = options;

    const hasGuide = Array.isArray(guideSlides) && guideSlides.length > 0;
    const guideBtnHtml = hasGuide
        ? `<button id="btnShowGuide" class="btn btn-outline-primary btn-lg w-100 mb-2 fw-bold">${escapeHtml(guideBtnText)}</button>`
        : '';

    const guestToggleHtml = showGuestToggle ? `
            <div class="form-check form-switch mb-1 d-flex align-items-center justify-content-center gap-2">
                <input class="form-check-input" type="checkbox" id="guestModeCheck" style="cursor: pointer;">
                <label class="form-check-label small fw-bold text-secondary" for="guestModeCheck" style="cursor: pointer;">
                    게스트 모드(공용기기 사용)
                </label>
            </div>
            <div class="text-center text-muted mb-3" style="font-size: 0.72rem;">
                학생 인증 모드 방에서만 적용됩니다. 선생님 승인 후 입장합니다.
            </div>` : '';

    target.innerHTML = `
        <div class="card shadow-sm p-4 mb-4 border-0 rounded-4 bg-white" id="room-entrance-card">
            <h5 class="text-center fw-bold mb-4">${escapeHtml(title)}</h5>
            <label class="visually-hidden" for="roomCodeInput">방 코드</label>
            <input type="text" id="roomCodeInput"
                class="form-control form-control-lg text-center mb-3 bg-light border-0 fw-bold"
                placeholder="${escapeHtml(roomCodePlaceholder)}" maxlength="4"
                autocomplete="off" autocapitalize="characters" spellcheck="false"
                style="text-transform: uppercase;">
            <div class="text-center text-muted small mb-2" id="roomEntranceHint" style="min-height: 1.2rem;"></div>
            ${guestToggleHtml}
            <button id="btnJoinRoom" class="btn btn-primary btn-lg w-100 mb-2 fw-bold"
                style="background:#0d6efd; border:none;">${escapeHtml(joinBtnText)}</button>
            ${guideBtnHtml}
            <button id="btnOpenDashboard" class="btn btn-dark btn-lg w-100 fw-bold" style="display: none;">${escapeHtml(dashBtnText)}</button>
        </div>
    `;

    const roomInput = target.querySelector('#roomCodeInput');
    const roomHint = target.querySelector('#roomEntranceHint');
    const guestCheck = target.querySelector('#guestModeCheck');
    const joinBtn = target.querySelector('#btnJoinRoom');
    const guideBtn = target.querySelector('#btnShowGuide');
    const dashBtn = target.querySelector('#btnOpenDashboard');

    const updateDashVisibility = () => {
        dashBtn.style.display = (window.isApprovedTeacher || window.isAdmin) ? 'block' : 'none';
    };
    updateDashVisibility();
    window.addEventListener('teacherAuthChanged', updateDashVisibility);

    // QR(?room=XXXX)로 들어온 경우를 최우선, 없으면 지난 접속 정보
    const urlRoom = (new URLSearchParams(location.search).get('room') || '')
        .replace(/\s/g, '').slice(0, 4).toUpperCase();

    if (urlRoom) {
        roomInput.value = urlRoom;
        roomHint.textContent = 'QR 코드로 방 번호가 자동 입력되었어요.';
    } else if (rememberLastEntry) {
        const saved = loadRememberedEntrance();
        if (saved.room) {
            roomInput.value = saved.room;
            roomHint.innerHTML =
                `지난 접속 방 번호를 불러왔어요 · <a href="#" id="btnClearSaved" class="link-secondary">지우기</a>`;
            target.querySelector('#btnClearSaved')?.addEventListener('click', (e) => {
                e.preventDefault();
                clearRememberedEntrance();
                roomInput.value = '';
                roomHint.textContent = '';
                roomInput.focus();
            });
        }
    }

    roomInput.addEventListener('input', () => {
        roomInput.value = roomInput.value.replace(/\s/g, '').slice(0, 4).toUpperCase();
    });

    // 세션에 게스트 정보가 남아 있으면 종료 버튼 복원
    const activeGuest = getGuestAuth();
    if (activeGuest && activeGuest.studentId) {
        showGuestExitButton(async () => {
            const guestKey = makeStudentKey(activeGuest.school, activeGuest.studentId);
            await updateDoc(doc(db, "student_auth", guestKey), { presence: 'offline' }).catch(() => { });
            clearGuestAuth();
            location.reload();
        });
    }

    let joining = false;

    const triggerJoin = async () => {
        if (joining) return;

        const roomCode = roomInput.value.trim().toUpperCase();

        if (!/^[A-Z0-9]{4}$/.test(roomCode)) {
            roomInput.classList.add('shake');
            setTimeout(() => roomInput.classList.remove('shake'), 400);
            await customAlert("알림", "방 코드는 영문 대문자와 숫자 4자리입니다.");
            return;
        }
        if (typeof onJoin !== 'function') return;

        joining = true;
        joinBtn.disabled = true;
        dashBtn.disabled = true;
        if (guideBtn) guideBtn.disabled = true;
        const originalText = joinBtn.innerHTML;
        joinBtn.innerHTML = '입장하는 중...';

        // ── 닉네임 마커 참조 ──────────────────────────────────────
        //  student_auth에 '학번 → 닉네임' 매핑을 저장하지 않습니다.
        //  그 매핑 하나가 순위표의 익명성을 통째로 무너뜨립니다.
        //  대신 방마다 빈 마커 문서로 이름을 선점합니다.
        const markerRefFn = (nick) => {
            if (typeof options.nicknameMarkerRef === 'function') {
                return options.nicknameMarkerRef(roomCode, nick);
            }
            if (typeof options.studentsCollectionRef === 'function') {
                const parent = options.studentsCollectionRef(roomCode).parent;   // 방 문서
                return doc(collection(parent, 'nicknames'), nick);
            }
            return null;
        };

        /** 게스트 승인 상태 문서 ({방}/guests/{닉}) */
        const guestStatusRef = (code, nick) => {
            if (typeof options.guestStatusRef === 'function') return options.guestStatusRef(code, nick);
            if (typeof options.studentsCollectionRef !== 'function') return null;
            const parent = options.studentsCollectionRef(code).parent;
            return doc(collection(parent, 'guests'), nick);
        };

        const hasMarker = () => markerRefFn('__probe__') !== null;

        /** 이 기기가 이 방에서 쓰던 이름을 그대로 씁니다 (본인 기기 · 빠른 입장) */
        const resolveRoomNickname = async () => {
            const remembered = getRoomNickname(roomCode);
            if (remembered) return remembered;

            const start = getLocalGameNickname() || generateRandomNickname();
            if (!hasMarker()) {
                // 마커 컬렉션을 쓸 수 없는 페이지(RTDB 게임) — 예전처럼 발급만
                setLocalGameNickname(start);
                setRoomNickname(roomCode, start);
                return start;
            }
            const claimed = await claimRoomNickname(markerRefFn, start);
            if (!claimed) return null;
            setLocalGameNickname(claimed);
            setRoomNickname(roomCode, claimed);
            return claimed;
        };

        /**
         * 게스트 전용 — 이 기기의 기억을 절대 쓰지 않고 새 이름을 뽑습니다.
         *
         * ★ v2의 사고: 폰 주인이 쓰던 이름을 게스트가 그대로 이어받아,
         *   주인의 기록 문서에 게스트의 학번이 덮어써졌습니다.
         *   확정된 이름도 이 기기에 저장하지 않습니다(sessionStorage만).
         */
        const claimFreshNickname = async () => {
            const start = generateRandomNickname();
            if (!hasMarker()) return start;
            return await claimRoomNickname(markerRefFn, start);
        };

        try {
            // ── 1. 방 정보 조회 (모드 판정) ──────────────────────
            let roomData = null;
            if (typeof options.getRoomData === 'function') {
                roomData = await options.getRoomData(roomCode);
            } else if (options.roomCollection) {
                const snap = await getDoc(doc(db, options.roomCollection, roomCode));
                if (snap.exists()) roomData = snap.data();
            }

            if (options.getRoomData && !roomData) {
                roomInput.classList.add('shake');
                setTimeout(() => roomInput.classList.remove('shake'), 400);
                await customAlert("오류", "존재하지 않는 방 코드입니다.");
                return;
            }

            const roomMode = roomData?.roomMode || roomData?.settings?.mode || 'quick';

            // =========================================================
            // [A. 빠른 입장 모드]
            //
            //  ★ 게스트 체크박스를 아예 보지 않습니다.
            //    켜든 끄든 결과가 같습니다 — 학생 정보 없이 바로 시작합니다.
            // =========================================================
            if (roomMode !== 'auth') {
                const nickname = await resolveRoomNickname();
                if (!nickname) {
                    await customAlert("입장 실패", "이름을 배정하지 못했습니다.<br>잠시 후 다시 시도해주세요.");
                    return;
                }
                rememberEntrance(roomCode, nickname);
                await onJoin(roomCode, nickname, { mode: 'quick', isGuest: false, nicknameFixed: true });
                return;
            }

            // ── 여기부터는 학생 인증 모드 ────────────────────────
            //  PIN 해시는 crypto.subtle로 만듭니다. https 또는 localhost 필요.
            if (!isCryptoAvailable()) {
                await customAlert("보안 연결 필요",
                    "학생 인증 모드는 <b>https</b>로 열어야 동작합니다.<br>" +
                    '<span class="text-muted small">파일을 직접 연 상태(file://)에서는 PIN 인증을 쓸 수 없습니다.</span>');
                return;
            }

            const isGuest = guestCheck ? guestCheck.checked : false;
            const deviceFp = await deriveDeviceFingerprint(getDeviceId());

            /** PIN 확인 — 'ok' | 'wrong' | 'reset'(초기화되어 새 PIN 필요) */
            const checkPin = async (studentKey, proof) => {
                const ok = await verifyProofViaGate(cryptoDeps, studentKey, deviceFp, proof);
                if (ok) return 'ok';
                // 게이트가 거부한 이유는 두 가지입니다: PIN 불일치 / 해시 없음(초기화됨).
                // 새 해시 기록을 조용히 시도해 구분합니다 — 초기화된 계정에서만 성공합니다.
                try {
                    await writePinProof(studentKey, proof);
                    return 'reset';
                } catch (e) {
                    return 'wrong';
                }
            };

            // =========================================================
            // [C. 게스트 — 공용 기기]
            //
            //  이 기기에 저장된 폰 주인 정보를 일절 쓰지 않습니다.
            //  학교·학번·PIN을 새로 입력받고, 이미 접속 중이면 막고,
            //  PIN이 맞아야 하며, 교사 승인 후에만 게임으로 넘어갑니다.
            // =========================================================
            if (isGuest) {
                // 폰 주인은 잠시 접속 해제 (같은 학번 중복 접속 판정 방지)
                releasePresence();
                const owner = getPhoneOwnerAuth();
                if (owner) {
                    updateDoc(doc(db, "student_auth", makeStudentKey(owner.school, owner.studentId)),
                        { presence: 'offline' }).catch(() => { });
                }

                const guestInput = await promptStudentAuthModal({ isGuest: true });   // ★ 프리필 없음
                if (!guestInput) return;

                const guestKey = makeStudentKey(guestInput.school, guestInput.studentId);
                const sDocRef = doc(db, "student_auth", guestKey);
                const sSnap = await getDoc(sDocRef);
                const sData = sSnap.exists() ? sSnap.data() : null;

                // (1) 이미 접속 중인 학번이면 입장 불가
                if (isAccountOnline(sData)) {
                    await customAlert("접속 불가",
                        "이미 다른 기기에서 접속 중인 학번입니다.<br>" +
                        "같은 학번으로 동시에 접속할 수 없습니다.<br>" +
                        '<span class="text-muted small">본인이 맞다면 그 기기에서 나온 뒤 다시 시도하거나 선생님께 문의하세요.</span>');
                    return;
                }

                const guestProof = await derivePinProof(guestInput.pin, guestKey);

                // (2) PIN 확인 — 등록된 계정이면 반드시 일치해야 합니다
                if (sData) {
                    const verdict = await checkPin(guestKey, guestProof);
                    if (verdict === 'wrong') {
                        await customAlert("인증 실패",
                            "PIN 번호가 일치하지 않습니다.<br>본인 학번이 맞는지 확인해주세요.<br>" +
                            '<span class="text-muted small">잊었다면 선생님께 초기화를 요청하세요.</span>');
                        return;
                    }
                    if (guestInput.teachers?.length) {
                        updateDoc(sDocRef, { teachers: guestInput.teachers, updatedAt: serverTimestamp() }).catch(() => { });
                    }
                } else {
                    // 신규 학번 — 게스트는 공용 기기이므로 devices에 기기를 등록하지 않습니다.
                    await setDoc(sDocRef, {
                        school: guestInput.school,
                        studentId: guestInput.studentId,
                        teachers: guestInput.teachers || [],
                        devices: [],
                        presence: 'pending',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastActive: serverTimestamp()
                    });
                    await writePinProof(guestKey, guestProof);
                }

                // (3) 이 방에서 쓸 새 이름 선점 (기기 기억 무시)
                const guestNick = await claimFreshNickname();
                if (!guestNick) {
                    await customAlert("입장 실패", "이름을 배정하지 못했습니다.<br>잠시 후 다시 시도해주세요.");
                    return;
                }

                saveGuestAuth(guestInput.school, guestInput.studentId, guestNick);   // PIN 저장 안 함
                startPresenceHeartbeat(guestKey, 'pending');

                // (4) 승인 대기 등록
                if (typeof options.studentsCollectionRef === 'function') {
                    await setDoc(doc(options.studentsCollectionRef(roomCode), guestNick), {
                        nickname: guestNick,
                        school: guestInput.school,
                        studentId: guestInput.studentId,
                        studentKey: guestKey,
                        teachers: guestInput.teachers || [],
                        status: 'pending',
                        isGuest: true,
                        requestedAt: serverTimestamp()
                    }, { merge: true });
                }

                // 승인 상태만 담은 문서. 게스트가 실시간으로 지켜봐야 하므로 공개로 읽히는데,
                // status 밖에 없어서 잃을 정보가 없습니다.
                const guestGateRef = guestStatusRef(roomCode, guestNick);
                if (guestGateRef) {
                    await setDoc(guestGateRef, { status: 'pending' });   // 규칙: pending으로만 create/update 가능
                }

                let approved = false;
                let unsubGuest = null;

                const waitingModal = showGuestWaitingModal(async () => {
                    if (unsubGuest) unsubGuest();
                    if (guestGateRef) deleteDoc(guestGateRef).catch(() => { });
                    if (typeof options.studentsCollectionRef === 'function') {
                        updateDoc(doc(options.studentsCollectionRef(roomCode), guestNick),
                            { status: 'rejected' }).catch(() => { });
                    }
                    releasePresence();
                    clearGuestAuth();
                });
                waitingModal.setNickname(guestNick);

                if (!guestGateRef) {
                    waitingModal.close();
                    await customAlert("입장 실패", "이 게임은 게스트 승인을 지원하지 않습니다.<br>선생님께 알려주세요.");
                    return;
                }

                unsubGuest = onSnapshot(guestGateRef, async (snap) => {
                    if (!snap.exists()) return;
                    const data = snap.data() || {};

                    if (data.status === 'online' && !approved) {
                        approved = true;
                        if (unsubGuest) unsubGuest();
                        waitingModal.close();
                        startPresenceHeartbeat(guestKey, 'online');

                        showGuestExitButton(async () => {
                            await deleteDoc(guestGateRef).catch(() => { });
                            if (typeof options.studentsCollectionRef === 'function') {
                                await updateDoc(doc(options.studentsCollectionRef(roomCode), guestNick),
                                    { status: 'offline' }).catch(() => { });
                            }
                            releasePresence();
                            clearGuestAuth();
                            location.reload();
                        });

                        await onJoin(roomCode, guestNick, {
                            school: guestInput.school,
                            studentId: guestInput.studentId,
                            isGuest: true,
                            mode: 'auth',
                            nicknameFixed: true
                        });
                    } else if (data.status === 'rejected') {
                        if (unsubGuest) unsubGuest();
                        waitingModal.close();
                        releasePresence();
                        clearGuestAuth();
                        await customAlert("입장 거절", "선생님이 입장을 거절하셨습니다.");
                    }
                });
                return;
            }

            // =========================================================
            // [B. 본인 기기]
            //
            //  최초 1회만 입력받고, 그 다음부터는 이 기기에 저장된
            //  학교·학번·증명값으로 조용히 확인만 합니다.
            // =========================================================
            const savedOwner = getPhoneOwnerAuth();
            const savedKey = savedOwner ? makeStudentKey(savedOwner.school, savedOwner.studentId) : null;

            let school = savedOwner?.school || '';
            let studentId = savedOwner?.studentId || '';
            let proof = savedOwner?.proof || '';
            let teachersToSave = null;

            let sDocRef = savedKey ? doc(db, "student_auth", savedKey) : null;
            let sData = null;
            let needInput = !savedOwner;

            if (savedOwner) {
                const snap = await getDoc(sDocRef);
                sData = snap.exists() ? snap.data() : null;

                if (!sData) {
                    needInput = true;                       // 선생님이 정보를 삭제 → 재등록
                } else {
                    const verdict = await checkPin(savedKey, proof);
                    if (verdict === 'wrong') {
                        needInput = true;                   // 다른 기기에서 PIN을 바꿈 → 재인증
                    } else {
                        // 'ok' 또는 'reset'(초기화 후 이 기기의 PIN으로 재설정 성공)
                        const answer = await promptStudentConfirmModal({
                            school, studentId,
                            teachers: sData.teachers || [],
                            nickname: getRoomNickname(roomCode) || getLocalGameNickname(),
                            deviceCount: Array.isArray(sData.devices) ? sData.devices.length : 0
                        });
                        if (!answer) return;                // 창을 닫음
                        if (answer === 'edit') needInput = true;
                    }
                }
            }

            // 정보 입력 / 수정 (검증 실패 시 다시 입력할 기회를 줌)
            while (needInput) {
                const input = await promptStudentAuthModal({
                    isGuest: false,
                    initialSchool: school,
                    initialStudentId: studentId,
                    initialTeachers: sData?.teachers || []
                });
                if (!input) return;                         // 취소

                const nextKey = makeStudentKey(input.school, input.studentId);
                const nextRef = doc(db, "student_auth", nextKey);
                const nextSnap = await getDoc(nextRef);
                const nextData = nextSnap.exists() ? nextSnap.data() : null;

                // (1) 남의 학번으로 바꾸려는데 그 학생이 접속 중이면 차단
                if (nextKey !== savedKey && isAccountOnline(nextData)) {
                    await customAlert("변경할 수 없어요",
                        `<b>${escapeHtml(input.studentId)}</b> 학번은 지금 다른 기기에서 접속 중입니다.<br>` +
                        `본인 학번이 맞다면 그 기기에서 나온 뒤 다시 시도하거나 선생님께 문의해주세요.`);
                    continue;
                }

                const nextProof = await derivePinProof(input.pin, nextKey);

                // (2) 이미 등록된 학번이면 PIN이 맞아야 사용할 수 있습니다.
                if (nextData) {
                    const verdict = await checkPin(nextKey, nextProof);
                    if (verdict === 'wrong') {
                        await customAlert("인증 실패",
                            "등록된 PIN 번호와 일치하지 않습니다.<br>본인 학번이 맞는지 확인해주세요.<br>" +
                            '<span class="text-muted small">잊었다면 선생님께 초기화를 요청하세요.</span>');
                        continue;
                    }
                }

                // (3) 다른 학번으로 갈아탄 경우 이전 계정은 접속 해제
                if (savedKey && nextKey !== savedKey) {
                    updateDoc(doc(db, "student_auth", savedKey), { presence: 'offline' }).catch(() => { });
                    clearLocalGameNickname();               // 신원이 바뀌었으므로 기기 닉네임 캐시 초기화
                }

                school = input.school;
                studentId = input.studentId;
                proof = nextProof;
                teachersToSave = input.teachers || [];
                sDocRef = nextRef;
                sData = nextData;
                needInput = false;
            }

            // ── 기기 등록 (최대 MAX_DEVICES대) ──────────────────
            //  공개 문서에는 기기 원본 id가 아니라 지문(해시)만 적습니다.
            const devCheck = deviceCheck(sData?.devices, deviceFp);
            if (!devCheck.ok) {
                await customAlert("기기 등록 한도 초과",
                    `이 학번에는 이미 <b>${MAX_DEVICES}대</b>의 기기가 등록되어 있습니다.<br>` +
                    `선생님께 <b>기기 정보 초기화</b>를 요청한 뒤 다시 시도해주세요.`);
                return;
            }

            const ownerKey = makeStudentKey(school, studentId);

            if (sData) {
                const patch = {
                    devices: devCheck.list,
                    presence: 'online',
                    lastActive: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                // ★ v2의 freshData 오타 자리 — 미선언 변수라 항상 여기서 죽었습니다.
                if (Array.isArray(teachersToSave) && teachersToSave.length) patch.teachers = teachersToSave;
                if (!sData.school) patch.school = school;
                if (!sData.studentId) patch.studentId = studentId;
                await updateDoc(sDocRef, patch);
            } else {
                await setDoc(sDocRef, {
                    school, studentId,
                    teachers: teachersToSave || [],
                    devices: devCheck.list,
                    presence: 'online',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    lastActive: serverTimestamp()
                });
                await writePinProof(ownerKey, proof);
            }

            savePhoneOwnerAuth(school, studentId, proof);   // ★ PIN 평문 아님
            startPresenceHeartbeat(ownerKey, 'online');

            // ── 이 방에서 쓸 이름 ────────────────────────────────
            //  학번과 닉네임을 연결하는 기록은 어디에도 남기지 않습니다.
            const nickname = await resolveRoomNickname();
            if (!nickname) {
                await customAlert("입장 실패", "이름을 배정하지 못했습니다.<br>잠시 후 다시 시도해주세요.");
                return;
            }

            if (typeof options.studentsCollectionRef === 'function') {
                await setDoc(doc(options.studentsCollectionRef(roomCode), nickname), {
                    nickname,
                    school,
                    studentId,
                    studentKey: ownerKey,
                    teachers: (Array.isArray(teachersToSave) && teachersToSave.length)
                        ? teachersToSave
                        : (sData?.teachers || []),
                    status: 'online',
                    isGuest: false,
                    enteredAt: serverTimestamp()
                }, { merge: true });
            }

            rememberEntrance(roomCode, nickname);
            await onJoin(roomCode, nickname, {
                school, studentId, isGuest: false, mode: 'auth', nicknameFixed: true
            });

        } catch (err) {
            console.error('입장 처리 오류:', err);
            const msg = String(err?.code || err?.message || err).toLowerCase();
            if (msg.includes('permission')) {
                await customAlert("입장 실패",
                    "데이터베이스 접근이 거부되었습니다.<br>네트워크가 아니라 <b>보안 규칙</b> 문제입니다.<br>선생님께 알려주세요.");
            } else {
                await customAlert("입장 실패", "입장 중 문제가 발생했습니다.<br>네트워크 상태를 확인하고 다시 시도해주세요.");
            }
        } finally {
            joining = false;
            joinBtn.disabled = false;
            dashBtn.disabled = false;
            if (guideBtn) guideBtn.disabled = false;
            joinBtn.innerHTML = originalText;
        }
    };

    joinBtn.addEventListener('click', triggerJoin);
    if (guideBtn) guideBtn.addEventListener('click', () => showGuideModal(guideSlides, guideTitle));
    dashBtn.addEventListener('click', () => verifyAdminAccess(onAdminSuccess, onAdminFailure));

    roomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerJoin();
    });
}
