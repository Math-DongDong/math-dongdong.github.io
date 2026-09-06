/**
 * room-auth.js
 * 방 입장 카드 UI 렌더링, 공통 모달 및 학생/교사 인증 공통 모듈
 *
 * [이번 개정 요약]
 *  - 학교명 / 담당 교사명을 teachers 컬렉션에서 드롭다운·체크박스(다중)로 불러옴
 *  - 기기 등록 최대 3대 제한 (student_auth/{key}.devices 배열)
 *  - 게임(페이지 경로)별 닉네임 고정: 한 번 배정되면 계속 같은 닉네임 사용
 *  - 인증 모드 입장 시 "내 정보가 맞나요?" 확인 모달 → [맞아요] / [정보 수정]
 *  - 정보 수정 시 다른 학생 학번 탈취 방지:
 *      · 대상 학번이 접속 중(presence:online & 최근 기록)이면 변경 불가
 *      · 이미 등록된 학번이면 PIN이 일치해야만 변경 가능
 *      · 기존 PIN은 클라이언트에서 절대 덮어쓰지 않음 (초기화는 교사만)
 *  - PIN 초기화 모달에서 "현재 방 학생 선택" 제거 (방에 못 들어온 학생을 위한 기능이므로)
 *  - ★ 닉네임 충돌 시 숫자 접미사를 붙이지 않고 조합 자체를 다시 뽑음 (0.6 참고)
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
    isCryptoAvailable, verifyPinViaGate, buildPinRecord
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

/** Firebase Realtime Database 키에 쓸 수 없는 문자 */
export const INVALID_KEY_PATTERN = /[.#$\[\]\/]/;

/** 닉네임 등이 DB 키로 사용 가능한지 확인 */
export function isValidRtdbKey(str) {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (!trimmed) return false;
    if (INVALID_KEY_PATTERN.test(trimmed)) return false;
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    return true;
}

/** DB 키로 쓸 수 없는 문자를 제거 */
export function sanitizeKey(str) {
    return String(str ?? '')
        .replace(INVALID_KEY_PATTERN, '')
        .replace(/[\u0000-\u001F\u007F]/g, '');
}

// =====================================================================
// 0.5 입장 정보 기억 (방 코드·닉네임 자동 입력)
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
        const nick = sanitizeKey(localStorage.getItem(ENTRANCE_NICK_KEY) || '').trim().slice(0, 10);
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
// 0.55 학생 인증 정보 저장소 분리 (폰 주인 localStorage vs 게스트 sessionStorage)
// =====================================================================
export const OWNER_SCHOOL_KEY = 'studentAuth:school';
export const OWNER_STUID_KEY = 'studentAuth:studentId';
export const OWNER_PIN_KEY = 'studentAuth:pin';

export const GUEST_SCHOOL_KEY = 'guestAuth:school';
export const GUEST_STUID_KEY = 'guestAuth:studentId';
export const GUEST_PIN_KEY = 'guestAuth:pin';
export const GUEST_NICK_KEY = 'guestAuth:nickname';
export const GUEST_FLAG_KEY = 'guestAuth:isGuest';

/** 폰 주인 인증 정보 읽기 (localStorage) */
export function getPhoneOwnerAuth() {
    try {
        const school = (localStorage.getItem(OWNER_SCHOOL_KEY) || '').trim();
        const studentId = (localStorage.getItem(OWNER_STUID_KEY) || '').trim();
        const pin = (localStorage.getItem(OWNER_PIN_KEY) || '').trim();
        if (school && studentId && pin) {
            return { school, studentId, pin };
        }
        return null;
    } catch (e) {
        return null;
    }
}

/** 폰 주인 인증 정보 영구 저장 (localStorage) */
export function savePhoneOwnerAuth(school, studentId, pin) {
    try {
        localStorage.setItem(OWNER_SCHOOL_KEY, String(school ?? '').trim());
        localStorage.setItem(OWNER_STUID_KEY, String(studentId ?? '').trim());
        localStorage.setItem(OWNER_PIN_KEY, String(pin ?? '').trim());
    } catch (e) { }
}

/** 폰 주인 인증 정보 삭제 */
export function clearPhoneOwnerAuth() {
    try {
        localStorage.removeItem(OWNER_SCHOOL_KEY);
        localStorage.removeItem(OWNER_STUID_KEY);
        localStorage.removeItem(OWNER_PIN_KEY);
    } catch (e) { }
}

/** 게스트 정보 임시 저장 (sessionStorage만 사용, localStorage 접근 절대 금지) */
export function saveGuestAuth(school, studentId, pin, nickname) {
    try {
        sessionStorage.setItem(GUEST_SCHOOL_KEY, String(school ?? '').trim());
        sessionStorage.setItem(GUEST_STUID_KEY, String(studentId ?? '').trim());
        sessionStorage.setItem(GUEST_PIN_KEY, String(pin ?? '').trim());
        sessionStorage.setItem(GUEST_NICK_KEY, String(nickname ?? '').trim());
        sessionStorage.setItem(GUEST_FLAG_KEY, 'true');
    } catch (e) { }
}

/** 게스트 정보 읽기 (sessionStorage) */
export function getGuestAuth() {
    try {
        if (sessionStorage.getItem(GUEST_FLAG_KEY) !== 'true') return null;
        const school = (sessionStorage.getItem(GUEST_SCHOOL_KEY) || '').trim();
        const studentId = (sessionStorage.getItem(GUEST_STUID_KEY) || '').trim();
        const pin = (sessionStorage.getItem(GUEST_PIN_KEY) || '').trim();
        const nickname = (sessionStorage.getItem(GUEST_NICK_KEY) || '').trim();
        return { school, studentId, pin, nickname, isGuest: true };
    } catch (e) {
        return null;
    }
}

/** 게스트 정보 파기 (sessionStorage) */
export function clearGuestAuth() {
    try {
        sessionStorage.removeItem(GUEST_SCHOOL_KEY);
        sessionStorage.removeItem(GUEST_STUID_KEY);
        sessionStorage.removeItem(GUEST_PIN_KEY);
        sessionStorage.removeItem(GUEST_NICK_KEY);
        sessionStorage.removeItem(GUEST_FLAG_KEY);
    } catch (e) { }
}

/**
 * PIN 인증 (v2 게이트 방식)
 *
 * 예전에는 student_auth 문서를 통째로 받아 sData.pin과 비교했습니다.
 * 화면에는 "인증 실패"만 떴지만 PIN은 이미 브라우저에 들어와 있었습니다.
 * 이제는 해시를 게이트에 제출하고 서버가 대조합니다 — PIN도 해시도 내려오지 않습니다.
 *
 * 반환: 'ok' | 'wrong' | 'new'(등록된 해시가 없어 새로 설정해야 함)
 */
async function checkStudentPin(studentKey, pin) {
    // 학생은 private/auth를 읽지 못합니다. 그래서 '해시가 맞는지'도,
    // '해시가 있기는 한지'도 게이트 쓰기 결과로만 알 수 있습니다.
    // 둘 다 permission-denied로 돌아오므로 'wrong' 하나로 묶고,
    // 초기화된 계정인지는 호출한 쪽에서 writePinHash를 시도해 구분합니다.
    const ok = await verifyPinViaGate(
        { db, doc, setDoc, serverTimestamp }, studentKey, getDeviceId(), pin
    );
    return ok ? 'ok' : 'wrong';
}

/** 새 PIN을 해시로 기록합니다 (최초 등록 · 교사 초기화 후 재설정) */
async function writePinHash(studentKey, pin) {
    const rec = await buildPinRecord(pin, studentKey);
    await setDoc(doc(db, "student_auth", studentKey, "private", "auth"),
        { ...rec, updatedAt: serverTimestamp() }, { merge: true });
}

export function makeStudentKey(school, studentId) {
    return `${String(school || '').trim()}_${String(studentId || '').trim()}`
        .replace(INVALID_KEY_PATTERN, '_');
}

// =====================================================================
// 0.56 기기 등록 / 교사 목록 / 게임별 고정 닉네임
// =====================================================================
export const OWNER_DEVICE_KEY = 'studentAuth:deviceId';
export const MAX_DEVICES = 3;                 // 학생 1명당 등록 가능한 기기 수
const ONLINE_FRESH_MS = 90 * 1000;            // 이 시간 안에 기록이 있으면 '접속 중'으로 판단

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
 * 반환: { ok, list } — list는 저장할 devices 배열
 * (배열 안에는 serverTimestamp()를 넣을 수 없어 Date.now() 밀리초를 사용합니다)
 */
export function deviceCheck(devices) {
    const id = getDeviceId();
    const list = Array.isArray(devices) ? devices.filter(d => d && d.id) : [];
    const now = Date.now();
    if (list.some(d => d.id === id)) {
        return { ok: true, list: list.map(d => d.id === id ? { ...d, lastUsedAt: now } : d) };
    }
    if (list.length >= MAX_DEVICES) return { ok: false, list };
    return { ok: true, list: [...list, { id, label: describeDevice(), registeredAt: now, lastUsedAt: now }] };
}

/** 해당 학생 계정이 지금 접속 중인지 판단 (학번 탈취 방지용) */
export function isAccountOnline(data) {
    if (!data || data.presence !== 'online') return false;
    const ms = data.lastActive?.toMillis ? data.lastActive.toMillis()
        : (typeof data.lastActive === 'number' ? data.lastActive : 0);
    if (!ms) return false;
    return (Date.now() - ms) < ONLINE_FRESH_MS;
}

/** 승인된 교사 목록 (세션 내 1회 캐시) */
let _teacherCache = null;
export function clearTeacherCache() { _teacherCache = null; }
if (typeof window !== 'undefined') {
    window.clearTeacherCache = clearTeacherCache;
}

export async function fetchApprovedTeachers(force = false) {
    if (_teacherCache && !force) return _teacherCache;
    const out = [];
    try {
        const snap = await getDocs(query(collection(db, "teachers"), where("status", "==", "approved")));
        snap.forEach(d => {
            const t = d.data() || {};
            const school = String(t.school || '').trim();
            const name = String(t.name || '').trim();
            if (!school || !name || school === '관리자') return;   // 관리자 계정은 목록에서 제외
            out.push({ uid: d.id, school, name });
        });
    } catch (e) { }
    _teacherCache = out;
    return out;
}

/** 승인 교사들이 등록한 학교명 목록 */
export async function fetchSchoolList() {
    const list = await fetchApprovedTeachers();
    return [...new Set(list.map(t => t.school))].sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 특정 학교의 교사명 목록 */
export async function fetchTeacherNames(school) {
    const target = String(school || '').trim();
    const list = await fetchApprovedTeachers();
    return [...new Set(list.filter(t => t.school === target).map(t => t.name))]
        .sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 페이지(=게임) 단위 식별자 — 닉네임 고정 기준 */
export function gameKey() {
    return (location.pathname || '/')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(-60) || 'game';
}

// 게임(페이지)별 닉네임은 localStorage에 보관합니다.
// 사생활 보호 모드처럼 localStorage가 막힌 환경에서도 최소한 그 세션 동안은
// 같은 닉네임이 유지되도록 메모리 폴백을 함께 둡니다.
const GAME_NICK_PREFIX = 'gameNickname:';
const _memNickname = {};

// 게임별 '기본' 닉네임 (이 기기에서 처음 뽑은 이름)
function baseNickKey() { return GAME_NICK_PREFIX + gameKey(); }

// ★ 방별 확정 닉네임.
//   v2부터 닉네임은 '방 안에서만' 유일하면 됩니다. student_auth에 닉네임 매핑을
//   저장하지 않기 때문입니다(학번 ↔ 닉네임 연결을 아예 만들지 않으려는 것).
//   그래서 확정된 이름을 이 기기에, 방 단위로 기억합니다.
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

/** 이 기기가 이 방에서 이미 확정한 이름 */
export function getRoomNickname(roomCode) { return readLocal(roomNickKey(roomCode)); }
export function setRoomNickname(roomCode, nick) { writeLocal(roomNickKey(roomCode), nick); }

/**
 * 이 방에서 쓸 이름을 새로 받습니다.
 *
 * 닉네임 입력창을 없앤 뒤로, 이름이 겹쳤을 때 학생이 직접 바꿀 방법이 없어졌습니다.
 * RTDB 게임(가위바위보·오목·블로토)은 플레이어 노드 키가 곧 닉네임이라
 * '이어받기'를 거절한 학생이 아무것도 못 하고 막히는 막다른 길이 생깁니다.
 * 그 경로에서 이 함수를 불러 새 이름을 받고 다시 시도하게 합니다.
 *
 * ★ setRoomNickname까지 함께 갱신하는 것이 핵심입니다.
 *   이걸 빼먹으면 다음 접속 때 기억된 옛 이름으로 되돌아가 같은 충돌을 반복하고,
 *   그 사이에 쌓은 점수가 버려진 이름에 남아 사라집니다.
 */
export function rerollRoomNickname(roomCode, avoid = '') {
    // ★ 반드시 '무작위'로 다시 뽑습니다.
    //   규칙적으로(예: 다음 조합으로) 옮기면, 같은 이름을 받은 두 학생이
    //   똑같이 옮겨 가 영원히 같은 이름으로 부딪칩니다. 무작위가 그 대칭을 깹니다.
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
 *
 * 마커에 아무 내용도 넣지 않는 것이 핵심입니다. 공개로 읽혀도 잃을 게 없습니다.
 *
 * @param {(nick:string)=>DocumentReference} markerRefFn
 * @returns {Promise<string|null>} 확정된 닉네임 (실패 시 null)
 */
export async function claimRoomNickname(markerRefFn, startNick, maxTries = 40) {
    if (typeof markerRefFn !== 'function') return startNick || generateRandomNickname();

    // 시작점: 넘겨받은 이름 → 그 다음부터는 조합을 건너뛰며 탐색
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

/**
 * 형용사 × 동물 전체 조합 수 (60 × 60 = 3,600)
 * 한 교실(30~35명)에서 쓰기에 충분히 넉넉하므로, 이름이 겹쳐도
 * 숫자를 붙일 필요 없이 다른 조합을 고르면 됩니다.
 */
export const NICKNAME_POOL_SIZE = ADJECTIVES.length * ANIMALS.length;

/**
 * 조합을 순회할 때 쓰는 보폭. 3,600과 서로소(1187은 소수)라서
 * 어떤 시작점에서 출발해도 3,600개 조합을 한 번씩 모두 방문합니다.
 * 1187 = 19 × 60 + 47 이므로 한 걸음마다 형용사(+19)와 동물(+47)이 함께 바뀝니다.
 * → 연속으로 뽑히는 후보가 서로 전혀 다른 이름으로 보입니다.
 */
const NICKNAME_STRIDE = 1187;

/** 조합 번호 → 닉네임 (범위를 벗어난 번호는 순환) */
export function nicknameAt(index) {
    const size = NICKNAME_POOL_SIZE;
    const i = ((Math.trunc(index) % size) + size) % size;
    return `${ADJECTIVES[Math.floor(i / ANIMALS.length)]} ${ANIMALS[i % ANIMALS.length]}`;
}

/** 닉네임 → 조합 번호 (목록에 없는 이름이면 -1) */
export function nicknameIndexOf(nickname) {
    const parts = String(nickname || '').split(' ');
    if (parts.length !== 2) return -1;
    const a = ADJECTIVES.indexOf(parts[0]);
    const b = ANIMALS.indexOf(parts[1]);
    if (a < 0 || b < 0) return -1;
    return a * ANIMALS.length + b;
}

/** 랜덤 닉네임 생성 (형용사 + 공백 + 동물/캐릭터) - 최대 9자 */
export function generateRandomNickname() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adj} ${animal}`;
}
if (typeof window !== 'undefined') {
    window.generateRandomNickname = generateRandomNickname;
}

// ─────────────────────────────────────────────────────────────────────
//  하위 호환 shim
//  v2부터 닉네임 확정은 renderRoomEntrance가 claimRoomNickname으로 처리합니다.
//  게임 페이지가 직접 중복 검사를 할 필요가 없어졌지만, 예전 페이지가
//  import 해도 깨지지 않도록 남겨 둡니다.
// ─────────────────────────────────────────────────────────────────────

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
// 1. 공통 모달 DOM 자동 생성 및 유틸
// =====================================================================
function ensureModalDOM() {
    if (document.getElementById('customModal')) return;
    const modalHtml = `
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
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

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
        @media (prefers-reduced-motion: reduce) {
            .shake { animation: none; }
        }
    `;
    document.head.appendChild(style);
}

let customModalInstance = null;

/** 모달을 하나씩 순서대로 띄우기 위한 큐 */
let modalQueue = Promise.resolve();

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
        if (!customModalInstance) {
            customModalInstance = new bootstrap.Modal(modalEl);
        }

        // 주의: title/message는 개발자가 작성한 문자열만 넘겨야 합니다.
        //       학생이 입력한 값을 넣을 때는 반드시 escapeHtml()로 감싸세요.
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
            customModalInstance.hide();
        };
        const handleCancel = () => {
            if (settled) return;
            settled = true;
            resolveValue = isConfirm ? false : null;
            blurBeforeHide();
            customModalInstance.hide();
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

        customModalInstance.show();

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
            max-height: 52vh;
            max-width: 100%;
            object-fit: contain;
            border-radius: 12px;
            background-color: #ffffff;
            border: 1px solid #e2e8f0;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
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
    const html = `
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
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    document.getElementById('guideModal').addEventListener('hide.bs.modal', function () {
        if (document.activeElement && this.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    });
}

let guideModalInstance = null;

export function showGuideModal(slides, title = "게임 방법") {
    if (!Array.isArray(slides) || slides.length === 0) return;
    ensureGuideStyle();

    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) return;

    ensureGuideModalDOM();
    const modalEl = document.getElementById('guideModal');
    document.getElementById('guideModalTitle').innerHTML = title;

    const indicators = slides.map((s, i) => `
        <button type="button" data-bs-target="#guideCarousel" data-bs-slide-to="${i}"
            ${i === 0 ? 'class="active" aria-current="true"' : ''}
            aria-label="${escapeHtml(s.title || `슬라이드 ${i + 1}`)}"></button>`).join('');

    const items = slides.map((s, i) => `
        <div class="carousel-item ${i === 0 ? 'active' : ''}">
            <div class="d-flex flex-column align-items-center text-center px-4 px-md-5">
                <img src="${s.src}" alt="${escapeHtml(s.alt || s.title || '')}" class="guide-slide-media mb-3" loading="lazy">
                ${s.title ? `<h5 class="fw-bold text-dark mb-1">${s.title}</h5>` : ''}
                ${s.desc ? `<p class="text-secondary small mb-0">${s.desc}</p>` : ''}
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

    if (!guideModalInstance) guideModalInstance = new bootstrap.Modal(modalEl);
    guideModalInstance.show();
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
// 3.5 방 모드 선택 및 학생 인증 모달 유틸
// =====================================================================

/** 교사 방 생성 시 빠른 입장 모드 vs 학생 인증 모드 선택 모달 */
export function promptRoomMode() {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('roomModeModal');
        if (!modalEl) {
            const html = `
            <div class="modal fade" id="roomModeModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold">🎯 방 생성 모드 선택</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <p class="text-muted small mb-3">수업 상황과 학급 운영 방식에 알맞은 입장 모드를 선택해주세요.</p>
                            <div class="list-group">
                                <label class="list-group-item list-group-item-action d-flex gap-3 py-3 border rounded-3 mb-2" style="cursor:pointer;">
                                    <input class="form-check-input flex-shrink-0" type="radio" name="roomModeOption" id="modeQuick" value="quick" checked>
                                    <span>
                                        <strong class="d-block text-dark">🚀 A. 빠른 입장 모드</strong>
                                        <small class="d-block text-muted">학생 개인정보(학교명, 학번, PIN) 입력 없이 방 코드 4자리만으로 즉시 입장합니다.</small>
                                    </span>
                                </label>
                                <label class="list-group-item list-group-item-action d-flex gap-3 py-3 border rounded-3" style="cursor:pointer;">
                                    <input class="form-check-input flex-shrink-0" type="radio" name="roomModeOption" id="modeAuth" value="auth">
                                    <span>
                                        <strong class="d-block text-dark">🔐 B. 학생 인증 모드</strong>
                                        <small class="d-block text-muted">기기 등록(학교명, 담당 선생님, 학번, 4자리 PIN) 필수. 게스트 모드 및 교사 승인 시스템이 적용됩니다.</small>
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
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            modalEl = document.getElementById('roomModeModal');
        }

        const bsModal = new bootstrap.Modal(modalEl);
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
 * - 학교명: teachers 컬렉션 기반 드롭다운 (없으면 직접 입력)
 * - 담당 선생님: 선택한 학교의 교사명 체크박스 (다중 선택)
 */
export function promptStudentAuthModal({ isGuest = false, initialSchool = '', initialStudentId = '', initialTeachers = [] } = {}) {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('studentAuthModal');
        if (!modalEl) {
            const html = `
            <div class="modal fade" id="studentAuthModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold" id="studentAuthModalTitle">📱 학생 본인 인증</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <div class="alert alert-info py-2 small mb-3" id="studentAuthModalNotice">
                                최초 1회 인증 후 본인 기기에서는 자동 로그인됩니다.
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">학교명</label>
                                <select class="form-select form-select-lg bg-light fw-bold" id="authSchoolSelect">
                                    <option value="">불러오는 중...</option>
                                </select>
                            </div>
                            <div class="mb-3 d-none" id="authCustomSchoolGroup">
                                <label class="form-label small fw-bold text-secondary">학교명 직접 입력</label>
                                <input type="text" class="form-control bg-light" id="authSchoolInput" placeholder="예: 동동중학교" autocomplete="off">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">담당 선생님 <span class="text-muted fw-normal">(여러 명 선택 가능)</span></label>
                                <div id="authTeacherList" class="border rounded-3 p-2 bg-light" style="max-height:150px; overflow-y:auto;"></div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">학번 <span class="text-muted fw-normal">(숫자만)</span></label>
                                <input type="text" class="form-control form-control-lg bg-light text-center fw-bold" id="inputAuthStudentId" placeholder="예: 20315" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="off">
                                <div class="form-text small text-muted">학년·반·번호를 붙여 씁니다. 예) 2학년 3반 15번 → <b>20315</b></div>
                            </div>
                            <div class="mb-2">
                                <label class="form-label small fw-bold text-secondary">4자리 숫자 PIN (비밀번호)</label>
                                <input type="password" class="form-control form-control-lg bg-light text-center fw-bold" id="inputAuthPin" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
                                <div class="form-text small text-muted">다른 학생이 내 학번을 도용하지 못하도록 설정하는 4자리 숫자입니다. 기기는 최대 ${MAX_DEVICES}대까지 등록됩니다.</div>
                            </div>
                            <div id="authModalError" class="text-danger small fw-bold mt-2" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-secondary rounded-3 px-3" data-bs-dismiss="modal">취소</button>
                            <button type="button" class="btn btn-primary rounded-3 px-4 fw-bold" id="btnConfirmStudentAuth">확인</button>
                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
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
        const errEl = document.getElementById('authModalError');
        const confirmBtn = document.getElementById('btnConfirmStudentAuth');

        titleEl.textContent = isGuest ? "게스트 인증" : "📱 학생 본인 인증";
        noticeEl.className = isGuest ? "alert alert-warning py-2 small mb-3" : "alert alert-info py-2 small mb-3";
        noticeEl.innerHTML = isGuest
            ? "게스트 모드입니다.<br>선생님의 대시보드 승인 후 입장할 수 있습니다."
            : "최초 1회 기기 등록 후 다음부터는 자동으로 로그인됩니다.";

        studentIdIn.value = String(initialStudentId || '').replace(/[^0-9]/g, '').slice(0, 10);
        studentIdIn.oninput = () => {
            studentIdIn.value = studentIdIn.value.replace(/[^0-9]/g, '').slice(0, 10);
        };
        pinIn.oninput = () => {
            pinIn.value = pinIn.value.replace(/[^0-9]/g, '').slice(0, 4);
        };
        pinIn.value = '';
        errEl.style.display = 'none';
        teacherList.innerHTML = '<div class="text-muted small">학교를 먼저 선택해주세요.</div>';

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
                html += `<option value="${escapeHtml(s)}" ${s === initialSchool ? 'selected' : ''}>🏫 ${escapeHtml(s)}</option>`;
            });
            html += '<option value="__direct__">✏️ 직접 입력</option>';
            schoolSelect.innerHTML = html;

            if (initialSchool && !schools.includes(initialSchool)) {
                schoolSelect.value = '__direct__';
                customGroup.classList.remove('d-none');
                schoolInput.value = initialSchool;
            } else {
                customGroup.classList.add('d-none');
            }
            renderTeachers(Array.isArray(initialTeachers) ? initialTeachers : []);
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

        const bsModal = new bootstrap.Modal(modalEl);
        let result = null;

        const fail = (msg, el) => { errEl.textContent = msg; errEl.style.display = 'block'; if (el) el.focus(); };

        const onConfirm = () => {
            const school = currentSchool();
            const studentId = studentIdIn.value.trim();
            const pin = pinIn.value.trim();
            const boxes = [...teacherList.querySelectorAll('.auth-teacher-check')];
            const teachers = boxes.filter(b => b.checked).map(b => b.value);

            if (!school) return fail("학교명을 선택하거나 입력해주세요.", schoolSelect);
            if (boxes.length > 0 && teachers.length === 0) return fail("담당 선생님을 1명 이상 선택해주세요.");
            if (!/^\d{2,10}$/.test(studentId)) return fail("학번은 숫자 2~10자리로 입력해주세요. (예: 20315)", studentIdIn);
            if (!/^\d{4}$/.test(pin)) return fail("PIN 번호는 4자리 숫자로 입력해주세요.", pinIn);

            result = { school, studentId, pin, teachers };
            bsModal.hide();
        };

        const onHidden = () => {
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
            const html = `
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
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            modalEl = document.getElementById('studentConfirmModal');
        }

        const row = (label, value) => `
            <li class="list-group-item d-flex justify-content-between align-items-center px-3">
                <span class="text-secondary small fw-bold">${label}</span>
                <span class="fw-bold text-dark text-end">${value}</span>
            </li>`;

        document.getElementById('studentConfirmList').innerHTML =
            row('학교', escapeHtml(school)) +
            row('학번/이름', escapeHtml(studentId)) +
            row('담당 선생님', (teachers && teachers.length) ? escapeHtml(teachers.join(', ')) : '<span class="text-muted fw-normal">미지정</span>') +
            (nickname ? row('내 닉네임', `<span class="text-primary">${escapeHtml(nickname)}</span>`) : '') +
            row('등록 기기', `${deviceCount}/${MAX_DEVICES}대`);

        const okBtn = document.getElementById('btnConfirmStudentInfo');
        const editBtn = document.getElementById('btnEditStudentInfo');
        const bsModal = new bootstrap.Modal(modalEl);
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

/** PIN 번호 초기화 복구용 재설정 모달 */
export function promptNewPinModal(studentName = "") {
    return new Promise((resolve) => {
        let modalEl = document.getElementById('newPinModal');
        if (!modalEl) {
            const html = `
            <div class="modal fade" id="newPinModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold text-danger">🔑 PIN 번호 재설정</h5>
                        </div>
                        <div class="modal-body py-3">
                            <div class="alert alert-warning py-2 small mb-3">
                                선생님에 의해 PIN 번호가 초기화되었습니다.<br>
                                앞으로 사용할 새로운 4자리 숫자 PIN을 입력해주세요.
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">새로운 4자리 PIN</label>
                                <input type="password" class="form-control form-control-lg bg-light text-center fw-bold" id="inputNewPin" placeholder="••••" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
                            </div>
                            <div id="newPinModalError" class="text-danger small fw-bold" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0 pt-0">
                            <button type="button" class="btn btn-primary rounded-3 px-4 fw-bold w-100" id="btnConfirmNewPin">PIN 번호 설정 완료</button>
                        </div>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            modalEl = document.getElementById('newPinModal');
        }

        const pinIn = document.getElementById('inputNewPin');
        const errEl = document.getElementById('newPinModalError');
        const confirmBtn = document.getElementById('btnConfirmNewPin');
        pinIn.value = '';
        errEl.style.display = 'none';

        const bsModal = new bootstrap.Modal(modalEl);
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
        const html = `
        <div class="modal fade" id="guestWaitingModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content rounded-4 border-0 shadow text-center p-4">
                    <div class="spinner-border text-primary mx-auto my-3" style="width: 3.5rem; height: 3.5rem;" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <h5 class="fw-bold text-dark mb-2">선생님의 승인을 기다리고 있습니다</h5>
                    <p class="text-muted small mb-4">선생님이 대시보드에서 입장을 승인하면 자동으로 게임 화면으로 이동합니다.</p>
                    <div>
                        <button type="button" class="btn btn-outline-secondary rounded-3 px-4" id="btnCancelGuestWait">입장 대기 취소</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        modalEl = document.getElementById('guestWaitingModal');
    }

    const bsModal = new bootstrap.Modal(modalEl);
    const cancelBtn = document.getElementById('btnCancelGuestWait');

    const handleCancel = () => {
        bsModal.hide();
        if (typeof onCancel === 'function') onCancel();
    };

    cancelBtn.onclick = handleCancel;
    bsModal.show();

    return {
        close: () => {
            cancelBtn.onclick = null;
            bsModal.hide();
        }
    };
}

/** 화면 우측 상단 게스트 모드 종료 플로팅 버튼 */
export function showGuestExitButton(onExit) {
    hideGuestExitButton();
    const btnHtml = `
    <div id="guestExitFloatingBadge" style="position: fixed; top: 14px; right: 14px; z-index: 99999;">
        <button id="btnExitGuestMode" class="btn btn-danger btn-sm rounded-pill fw-bold shadow-lg px-3 py-2 border-2 border-white d-flex align-items-center gap-1">
            🚪 게스트 모드 종료
        </button>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', btnHtml);

    document.getElementById('btnExitGuestMode')?.addEventListener('click', async () => {
        const confirmed = await customConfirm("게스트 모드 종료", "게스트 모드를 종료하시겠습니까?");
        if (!confirmed) return;
        hideGuestExitButton();
        if (typeof onExit === 'function') {
            await onExit();
        }
    });
}

export function hideGuestExitButton() {
    const el = document.getElementById('guestExitFloatingBadge');
    if (el) el.remove();
}

/**
 * 교사 대시보드 PIN 초기화 모달
 * 방에 들어오지 못한 학생을 구제하는 기능이므로 "현재 방 학생 목록"은 사용하지 않고,
 * 학교(드롭다운) + 학번(직접 입력)만으로 초기화합니다.
 */
export async function showPinResetModal() {
    let teacherSchool = window.currentTeacherSchool || '';
    if (!teacherSchool && window.currentTeacherUid) {
        try {
            const tSnap = await getDoc(doc(db, "teachers", window.currentTeacherUid));
            if (tSnap.exists()) {
                teacherSchool = tSnap.data().school || '';
                window.currentTeacherSchool = teacherSchool;
            }
        } catch (e) { }
    }
    const schools = await fetchSchoolList();

    return new Promise((resolve) => {
        let modalEl = document.getElementById('pinResetModal');
        if (!modalEl) {
            const html = `
            <div class="modal fade" id="pinResetModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content rounded-4 border-0 shadow">
                        <div class="modal-header border-0 pb-0">
                            <h5 class="modal-title fw-bold text-danger"><i class="bi bi-key-fill"></i> 학생 PIN 초기화</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button>
                        </div>
                        <div class="modal-body py-3">
                            <p class="text-muted small mb-3">학교와 학번(식별번호)을 입력하면 해당 학생의 PIN이 삭제됩니다. 학생은 다음 접속 시 새 4자리 PIN을 설정합니다.</p>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">학교명 선택</label>
                                <select class="form-select bg-light fw-bold" id="pinResetSchoolSelect"></select>
                            </div>
                            <div class="mb-3 d-none" id="pinResetCustomSchoolGroup">
                                <label class="form-label small fw-bold text-secondary">학교명 직접 입력</label>
                                <input type="text" class="form-control bg-light" id="pinResetSchoolInput" placeholder="예: 동동중학교" autocomplete="off">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-secondary">학번 (숫자만)</label>
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
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
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

        const bsModal = new bootstrap.Modal(modalEl);
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
                // v2: PIN 해시는 하위 문서에 있습니다. null로 비우면
                //     학생이 다음 접속 때 새 PIN을 설정할 수 있게 됩니다.
                await setDoc(doc(db, "student_auth", sKey, "private", "auth"),
                    { pinHash: null, resetAt: serverTimestamp() }, { merge: true });
                await updateDoc(doc(db, "student_auth", sKey), {
                    presence: 'offline',
                    updatedAt: serverTimestamp()
                });
                executed = true;
                bsModal.hide();
                await customAlert("초기화 완료", `<strong>${escapeHtml(school)}</strong>의 <strong>${escapeHtml(studentId)}</strong> 학생 PIN이 초기화되었습니다.<br>학생이 다음 접속 시 새 4자리 PIN을 설정합니다.`);
            } catch (err) {
                errEl.textContent = "해당 학생을 찾지 못했습니다. 학교명과 학번을 다시 확인해주세요.";
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
        onJoin = null,
        onAdminSuccess = null,
        onAdminFailure = null
    } = options;

    const hasGuide = Array.isArray(guideSlides) && guideSlides.length > 0;
    const guideBtnHtml = hasGuide
        ? `<button id="btnShowGuide" class="btn btn-outline-primary btn-lg w-100 mb-2 fw-bold">${guideBtnText}</button>`
        : '';

    target.innerHTML = `
        <div class="card shadow-sm p-4 mb-4 border-0 rounded-4 bg-white" id="room-entrance-card">
            <h5 class="text-center fw-bold mb-4">${title}</h5>
            <input type="text" id="roomCodeInput"
                class="form-control form-control-lg text-center mb-3 bg-light border-0 fw-bold"
                placeholder="${roomCodePlaceholder}" maxlength="4"
                autocomplete="off" autocapitalize="characters" spellcheck="false"
                style="text-transform: uppercase;">
            <div class="text-center text-muted small mb-2" id="roomEntranceHint" style="min-height: 1.2rem;"></div>

            <div class="form-check form-switch mb-3 d-flex align-items-center justify-content-center gap-2">
                <input class="form-check-input" type="checkbox" id="guestModeCheck" style="cursor: pointer;">
                <label class="form-check-label small fw-bold text-secondary" for="guestModeCheck" style="cursor: pointer;">
                    게스트 모드(공용기기 사용)
                </label>
            </div>

            <button id="btnJoinRoom" class="btn btn-primary btn-lg w-100 mb-2 fw-bold"
                style="background:#0d6efd; border:none;">${joinBtnText}</button>
            ${guideBtnHtml}
            <button id="btnOpenDashboard" class="btn btn-dark btn-lg w-100 fw-bold" style="display: none;">${dashBtnText}</button>
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

    // QR 코드로 들어온 경우(?room=XXXX)를 최우선으로 채우고, 없으면 지난 접속 정보를 사용
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

    // 이미 세션에 게스트 정보가 남아 있다면 게스트 모드 종료 버튼 띄우기
    const activeGuest = getGuestAuth();
    if (activeGuest) {
        showGuestExitButton(async () => {
            const guestKey = makeStudentKey(activeGuest.school, activeGuest.studentId);
            await updateDoc(doc(db, "student_auth", guestKey), { presence: 'offline' }).catch(() => { });
            clearGuestAuth();
            const owner = getPhoneOwnerAuth();
            if (owner) {
                const ownerKey = makeStudentKey(owner.school, owner.studentId);
                await updateDoc(doc(db, "student_auth", ownerKey), { presence: 'online' }).catch(() => { });
            }
            location.reload();
        });
    }

    let joining = false;

    const triggerJoin = async () => {
        if (joining) return;

        const roomCode = roomInput.value.trim().toUpperCase();

        if (!roomCode || roomCode.length !== 4) {
            roomInput.classList.add('shake');
            setTimeout(() => roomInput.classList.remove('shake'), 400);
            await customAlert("알림", "올바른 방 코드 4자리를 입력해주세요.");
            return;
        }

        if (typeof onJoin !== 'function') return;

        joining = true;
        joinBtn.disabled = true;
        dashBtn.disabled = true;
        if (guideBtn) guideBtn.disabled = true;
        const originalText = joinBtn.innerHTML;
        joinBtn.innerHTML = '입장하는 중...';

        // ── v2 닉네임 확정 ────────────────────────────────────────────
        //
        //  student_auth에 '학번 → 닉네임' 매핑을 저장하지 않습니다.
        //  그 매핑 하나가 순위표의 익명성을 통째로 무너뜨리기 때문입니다.
        //  대신 방마다 빈 마커 문서로 이름을 선점하고, 확정된 이름은
        //  이 기기에 방 단위로 기억합니다.
        //
        //  옵션으로 넘어온 컬렉션 참조에서 형제 컬렉션 nicknames를 찾습니다.
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

        /** 이 방에서 쓸 이름을 확정합니다. 이미 확정해 둔 게 있으면 그대로 씁니다. */
        const resolveRoomNickname = async () => {
            const remembered = getRoomNickname(roomCode);
            if (remembered) return { nickname: remembered, isNew: false };

            const start = getLocalGameNickname() || generateRandomNickname();
            const probe = markerRefFn('__probe__');
            if (!probe) {
                // 마커 컬렉션을 쓸 수 없는 페이지(구버전) — 예전처럼 그냥 발급
                setLocalGameNickname(start);
                setRoomNickname(roomCode, start);
                return { nickname: start, isNew: true };
            }

            const claimed = await claimRoomNickname(markerRefFn, start);
            if (!claimed) return { nickname: null, isNew: true };

            setLocalGameNickname(claimed);      // 다음 방에서도 이 이름부터 시도
            setRoomNickname(roomCode, claimed);
            return { nickname: claimed, isNew: true };
        };

        try {
            // 1. 방 정보 조회 (모드 확인: quick vs auth)
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
            const isGuest = guestCheck ? guestCheck.checked : false;

            // =========================================================
            // [A. 빠른 입장 모드] 개인정보 없이 즉시 입장 + 닉네임 고정
            // =========================================================
            if (roomMode === 'quick') {
                const { nickname } = await resolveRoomNickname();
                if (!nickname) {
                    await customAlert("입장 실패", "이름을 배정하지 못했습니다.<br>잠시 후 다시 시도해주세요.");
                    return;
                }
                rememberEntrance(roomCode, nickname);
                // nicknameFixed: true — 방 안 유일성은 마커가 이미 보장했습니다.
                //                 게임 페이지가 중복 검사를 또 할 필요가 없습니다.
                await onJoin(roomCode, nickname, { mode: 'quick', isGuest: false, nicknameFixed: true });
                return;
            }

            // ★ 여기서부터는 PIN 인증이 필요하고, PIN 해시는 crypto.subtle로 만듭니다.
            //   https 또는 localhost에서만 동작합니다. 빠른 입장 모드는 위에서 이미
            //   끝났으므로 RTDB 게임(가위바위보·오목·블로토)은 이 검사를 타지 않습니다.
            if (!isCryptoAvailable()) {
                await customAlert("보안 연결 필요",
                    "학생 인증 모드는 <b>https</b>로 열어야 동작합니다.<br>" +
                    '<span class="text-muted small">파일을 직접 연 상태(file://)에서는 PIN 인증을 쓸 수 없습니다.</span>');
                return;
            }

            // =========================================================
            // [B-1. 학생 인증 모드 - 게스트(공용 기기)]
            // =========================================================
            if (isGuest) {
                const owner = getPhoneOwnerAuth();
                if (owner) {
                    updateDoc(doc(db, "student_auth", makeStudentKey(owner.school, owner.studentId)), {
                        presence: 'offline',
                        lastActive: serverTimestamp()
                    }).catch(() => { });
                }

                const guestInput = await promptStudentAuthModal({ isGuest: true });
                if (!guestInput) return;

                const guestKey = makeStudentKey(guestInput.school, guestInput.studentId);
                const sDocRef = doc(db, "student_auth", guestKey);
                const sSnap = await getDoc(sDocRef);
                let sData = sSnap.exists() ? sSnap.data() : null;

                // 중복 접속 차단
                if (isAccountOnline(sData)) {
                    await customAlert("접속 불가", "이미 다른 기기에서 접속 중인 학번입니다.<br>동일 학번으로 동시에 접속할 수 없습니다.");
                    return;
                }

                let verifiedPin = guestInput.pin;
                if (sData) {
                    // 등록된 계정 — 게이트로 PIN을 확인합니다.
                    const verdict = await checkStudentPin(guestKey, guestInput.pin);
                    if (verdict === 'wrong') {
                        // 교사가 초기화했을 수도 있으므로 새 PIN 설정을 한 번 제안합니다.
                        const newPin = await promptNewPinModal(guestInput.studentId);
                        if (!newPin) return;
                        try {
                            await writePinHash(guestKey, newPin);   // 초기화된 계정에서만 성공
                            verifiedPin = newPin;
                        } catch (e) {
                            await customAlert("인증 실패",
                                "PIN 번호가 일치하지 않습니다.<br>본인 학번이 맞는지 확인해주세요.<br>" +
                                "<span class=\"text-muted small\">잊었다면 선생님께 초기화를 요청하세요.</span>");
                            return;
                        }
                    }
                    if (guestInput.teachers?.length) {
                        await updateDoc(sDocRef, { teachers: guestInput.teachers, updatedAt: serverTimestamp() }).catch(() => { });
                    }
                } else {
                    // 게스트는 공용 기기이므로 devices에 기기를 등록하지 않습니다.
                    // ★ pin·nicknames는 이 공개 문서에 넣지 않습니다 (보안 규칙이 거부합니다).
                    await setDoc(sDocRef, {
                        school: guestInput.school,
                        studentId: guestInput.studentId,
                        teachers: guestInput.teachers || [],
                        devices: [],
                        presence: 'pending',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    });
                    await writePinHash(guestKey, verifiedPin);
                }

                // 이 방에서 쓸 이름을 마커로 선점합니다 (학번과 연결하지 않습니다)
                const { nickname: guestNick } = await resolveRoomNickname();
                if (!guestNick) {
                    await customAlert("입장 실패", "이름을 배정하지 못했습니다.<br>잠시 후 다시 시도해주세요.");
                    return;
                }

                saveGuestAuth(guestInput.school, guestInput.studentId, verifiedPin, guestNick);
                await updateDoc(sDocRef, { presence: 'pending', lastActive: serverTimestamp() });

                // 학번이 든 요약은 students에 (학생은 쓰기만 하고 읽지 못합니다)
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
                // ★ 승인 상태만 담은 별도 문서. 게스트가 실시간으로 지켜봐야 하므로
                //   공개로 읽히는데, status 밖에 없어서 잃을 정보가 없습니다.
                const guestGateRef = guestStatusRef(roomCode, guestNick);
                if (guestGateRef) {
                    await setDoc(guestGateRef, { status: 'pending' });
                }

                let approved = false;
                let unsubGuest = null;

                const waitingModal = showGuestWaitingModal(async () => {
                    if (unsubGuest) unsubGuest();
                    // students 문서는 학생이 지울 수 없으므로(교사 전용) 상태만 내립니다.
                    if (guestGateRef) deleteDoc(guestGateRef).catch(() => { });
                    if (typeof options.studentsCollectionRef === 'function') {
                        updateDoc(doc(options.studentsCollectionRef(roomCode), guestNick),
                            { status: 'rejected' }).catch(() => { });
                    }
                    updateDoc(sDocRef, { presence: 'offline' }).catch(() => { });
                    clearGuestAuth();
                });

                if (guestGateRef) {
                    unsubGuest = onSnapshot(guestGateRef, async (snap) => {
                        if (!snap.exists()) return;
                        const data = snap.data();
                        if (data.status === 'online' && !approved) {
                            approved = true;
                            if (unsubGuest) unsubGuest();
                            waitingModal.close();

                            showGuestExitButton(async () => {
                                if (guestGateRef) {
                                    await deleteDoc(guestGateRef).catch(() => { });
                                }
                                if (typeof options.studentsCollectionRef === 'function') {
                                    await updateDoc(doc(options.studentsCollectionRef(roomCode), guestNick), { status: 'offline' }).catch(() => { });
                                }
                                await updateDoc(sDocRef, { presence: 'offline' }).catch(() => { });
                                clearGuestAuth();

                                const currentOwner = getPhoneOwnerAuth();
                                if (currentOwner) {
                                    await updateDoc(doc(db, "student_auth", makeStudentKey(currentOwner.school, currentOwner.studentId)), {
                                        presence: 'online',
                                        lastActive: serverTimestamp()
                                    }).catch(() => { });
                                }
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
                            await updateDoc(sDocRef, { presence: 'offline' }).catch(() => { });
                            clearGuestAuth();
                            await customAlert("입장 거절", "선생님이 입장을 거절하셨습니다.");
                        }
                    });
                }
                return;
            }

            // =========================================================
            // [B-2. 학생 인증 모드 - 본인 기기]
            // =========================================================
            const savedOwner = getPhoneOwnerAuth();
            const savedKey = savedOwner ? makeStudentKey(savedOwner.school, savedOwner.studentId) : null;

            let school = savedOwner?.school || '';
            let studentId = savedOwner?.studentId || '';
            let pin = savedOwner?.pin || '';
            let teachersToSave = null;

            let sDocRef = null;
            let sData = null;
            let needInput = !savedOwner;

            if (savedOwner) {
                sDocRef = doc(db, "student_auth", savedKey);
                const snap = await getDoc(sDocRef);
                sData = snap.exists() ? snap.data() : null;

                if (!sData) {
                    needInput = true;                                   // 선생님이 정보를 삭제 → 재등록
                } else {
                    // v2: 저장해 둔 PIN이 아직 유효한지 게이트로 확인합니다.
                    //     (다른 기기에서 바꿨거나 선생님이 초기화했으면 여기서 걸립니다)
                    const verdict = await checkStudentPin(savedKey, pin);
                    if (verdict !== 'ok') {
                        needInput = true;                               // 재인증
                    } else {
                        const answer = await promptStudentConfirmModal({
                            school, studentId,
                            teachers: sData.teachers || [],
                            nickname: getRoomNickname(roomCode) || getLocalGameNickname(),
                            deviceCount: Array.isArray(sData.devices) ? sData.devices.length : 0
                        });
                        if (!answer) return;                            // 창을 닫음
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
                if (!input) return;                                     // 취소

                const nextKey = makeStudentKey(input.school, input.studentId);
                const nextRef = doc(db, "student_auth", nextKey);
                const nextSnap = await getDoc(nextRef);
                const nextData = nextSnap.exists() ? nextSnap.data() : null;

                // (1) 다른 학생의 학번으로 바꾸려는데 그 학생이 접속 중이면 차단
                if (nextKey !== savedKey && isAccountOnline(nextData)) {
                    await customAlert("변경할 수 없어요",
                        `<b>${escapeHtml(input.studentId)}</b> 학번은 지금 다른 기기에서 접속 중입니다.<br>` +
                        `본인 학번이 맞다면 그 기기에서 나온 뒤 다시 시도하거나 선생님께 문의해주세요.`);
                    continue;
                }

                // (2) 이미 등록된 학번이면 PIN이 맞아야 사용할 수 있습니다.
                //     게이트가 서버에서 대조하므로, 해시가 브라우저로 내려오지 않습니다.
                //     '초기화된 계정'은 게이트가 거부하는데, 그 경우는 아래에서
                //     새 PIN 기록을 시도해 구분합니다.
                if (nextData) {
                    const verdict = await checkStudentPin(nextKey, input.pin);
                    if (verdict !== 'ok') {
                        let recovered = false;
                        try {
                            await writePinHash(nextKey, input.pin);   // 초기화된 계정에서만 성공
                            recovered = true;
                        } catch (e) { }
                        if (!recovered) {
                            await customAlert("인증 실패",
                                "등록된 PIN 번호와 일치하지 않습니다.<br>본인 학번이 맞는지 확인해주세요.<br>" +
                                '<span class="text-muted small">잊었다면 선생님께 초기화를 요청하세요.</span>');
                            continue;
                        }
                    }
                }

                // (3) 다른 학번으로 갈아탄 경우 이전 계정은 접속 해제
                if (savedKey && nextKey !== savedKey) {
                    updateDoc(doc(db, "student_auth", savedKey), {
                        presence: 'offline', lastActive: serverTimestamp()
                    }).catch(() => { });
                    clearLocalGameNickname();                           // 신원이 바뀌었으므로 기기 닉네임 캐시 초기화
                }

                school = input.school;
                studentId = input.studentId;
                pin = input.pin;
                teachersToSave = input.teachers || [];
                sDocRef = nextRef;
                sData = nextData;
                needInput = false;
            }


            // 기기 등록 (최대 MAX_DEVICES대)
            const devCheck = deviceCheck(sData?.devices);
            if (!devCheck.ok) {
                await customAlert("기기 등록 한도 초과",
                    `이 학번에는 이미 <b>${MAX_DEVICES}대</b>의 기기가 등록되어 있습니다.<br>` +
                    `선생님께 <b>기기 정보 초기화</b>를 요청한 뒤 다시 시도해주세요.`);
                return;
            }

            const ownerKey = makeStudentKey(school, studentId);
            // ★ 공개 문서에는 pin·nicknames를 넣지 않습니다 (보안 규칙이 거부합니다).
            if (sData) {
                const patch = {
                    devices: devCheck.list,
                    presence: 'online',
                    lastActive: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                if (Array.isArray(teachersToSave) && teachersToSave.length) patch.teachers = teachersToSave;
                if (!sData.school) patch.school = school;
                if (!sData.studentId) patch.studentId = studentId;
                await updateDoc(sDocRef, patch);
            } else {
                // 신규 등록: 공개 문서 + PIN 해시(하위 문서)
                await setDoc(sDocRef, {
                    school, studentId,
                    teachers: teachersToSave || [],
                    devices: devCheck.list,
                    presence: 'online',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    lastActive: serverTimestamp()
                });
                await writePinHash(ownerKey, pin);
            }
            savePhoneOwnerAuth(school, studentId, pin);

            // 이 방에서 쓸 이름을 마커로 선점합니다.
            // 학번과 닉네임을 연결하는 기록은 어디에도 남기지 않습니다.
            const { nickname } = await resolveRoomNickname();
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
                    teachers: freshData?.teachers || teachersToSave || [],
                    status: 'online',
                    isGuest: false,
                    enteredAt: serverTimestamp()
                }, { merge: true });
            }

            rememberEntrance(roomCode, nickname);
            await onJoin(roomCode, nickname, {
                school,
                studentId,
                isGuest: false,
                mode: 'auth',
                nicknameFixed: true
            });
        } catch (err) {
            console.error('입장 처리 오류:', err);
            await customAlert("입장 실패", "입장 중 문제가 발생했습니다.<br>네트워크 상태를 확인하고 다시 시도해주세요.");
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