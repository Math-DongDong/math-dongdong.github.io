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
 *  ※ 기존 게임 7개는 이 파일 없이도 그대로 동작합니다.
 *    당장 바꾸실 필요는 없고, 손볼 일이 생겼을 때 옮기시면 됩니다.
 * ─────────────────────────────────────────────────────────────────────
 */
import { db as fsdb } from "./firebase-config.js";
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
    onSnapshot, query, where, serverTimestamp as fsTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
    ref, get, set, update, remove, serverTimestamp as rtTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import {
    escapeHtml, safeNumber, customAlert, customConfirm, promptRoomMode
} from "./room-auth.js?v=3.0";

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
 * RTDB 하트비트 기반 접속 상태 뱃지 HTML.
 * 문구와 색을 게임마다 맞추기 위해 여기 한 곳에 모았습니다.
 *
 * @param {object} node   players/{닉} 노드 값
 * @param {object} opts   { now, offlineMs, short }
 */
export function statusBadge(node, { now = Date.now(), offlineMs = 40000, short = false } = {}) {
    const hb = typeof node?.lastHeartbeat === 'number' ? node.lastHeartbeat : 0;
    const fresh = (now - hb) < offlineMs;

    if (!fresh || node?.status === 'offline') {
        return `<span class="status-dot status-offline"></span><span class="text-danger small fw-bold">${short ? '끊김' : '접속 끊김'}</span>`;
    }
    if (node?.status === 'away') {
        return '<span class="status-dot status-away"></span><span class="text-warning small fw-bold">다른화면</span>';
    }
    return '<span class="status-dot status-online"></span><span class="text-success small fw-bold">접속중</span>';
}

/** statusBadge와 짝을 이루는 CSS. <style> 안에 한 번 붙여 넣으세요. */
export const STATUS_DOT_CSS = `
.status-dot { display:inline-block; width:9px; height:9px; border-radius:50%;
              margin-right:4px; vertical-align:middle; }
.status-online  { background-color:#198754; }
.status-away    { background-color:#ffc107; }
.status-offline { background-color:#dc3545; }
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

// =====================================================================
// 2. Firestore 방 도구  (유형 A: 개인 기록형)
//
//  컬렉션 이름은 반드시 '..._records' 로 끝나야 합니다.
//  보안 규칙이 그 패턴으로 걸려 있어서, 새 게임을 만들어도
//  규칙을 고칠 필요가 없습니다.
// =====================================================================
export function firestoreRoom(collectionName) {
    if (!/_records$/.test(collectionName)) {
        console.warn(`[game-kit] 컬렉션 이름은 '_records'로 끝나야 보안 규칙이 적용됩니다: ${collectionName}`);
    }

    const roomDoc = (code) => doc(fsdb, collectionName, code);
    const students = (code) => collection(fsdb, collectionName, code, "students");
    const nicknames = (code) => collection(fsdb, collectionName, code, "nicknames");
    const guests = (code) => collection(fsdb, collectionName, code, "guests");
    const records = (code) => collection(fsdb, collectionName, code, "records");

    return {
        collectionName, roomDoc, students, nicknames, guests, records,

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
        async createRoom({ askMode = true, extra = {} } = {}) {
            const mode = askMode ? await promptRoomMode() : 'quick';
            if (!mode) return null;

            // v4: 인증 방 학생의 학교는 방을 만든 선생님을 따릅니다 → 학교명이 꼭 있어야 합니다.
            const teacherSchool = String(window.currentTeacherSchool || '').trim();
            if (mode === 'auth' && (!teacherSchool || teacherSchool === '관리자')) {
                await customAlert("학교명이 필요해요",
                    "학생 인증 방의 학생은 <b>방을 만든 선생님의 학교</b>로 등록됩니다.<br>" +
                    "상단 메뉴 → <b>정보수정</b>에서 실제 학교명을 먼저 등록해주세요.");
                return null;
            }

            let code = null;
            for (let i = 0; i < 20; i++) {
                const candidate = generateRoomCode();
                if (!(await getDoc(roomDoc(candidate))).exists()) { code = candidate; break; }
            }
            if (!code) { await customAlert('오류', '방 코드를 만들지 못했습니다. 잠시 후 다시 시도해주세요.'); return null; }

            await setDoc(roomDoc(code), {
                roomCode: code,
                roomMode: mode,
                settings: { mode },
                createdAt: fsTimestamp(),
                createdBy: window.currentTeacherUid || '',
                creatorName: window.currentTeacherName || '',
                creatorSchool: teacherSchool,
                ...extra
            });

            await customAlert("방 생성 완료",
                `새로운 방 [<strong>${escapeHtml(code)}</strong>]이 생성되었습니다.<br>` +
                `설정 모드: <strong>${mode === 'auth' ? '🔐 학생 인증 모드' : '🚀 빠른 입장 모드'}</strong>`);
            return code;
        },

        /**
         * 방 삭제.
         * ★ Firestore는 문서를 지워도 하위 컬렉션이 남습니다.
         *   students·records·nicknames·guests 를 먼저 비워야 고아 문서가 생기지 않습니다.
         * ★ await 없이 흘려보내면 중간에 끊겼을 때 일부만 지워집니다.
         */
        async deleteRoom(code) {
            for (const collRef of [students, records, nicknames, guests]) {
                const snap = await getDocs(collRef(code));
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            }
            await deleteDoc(roomDoc(code));
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
                const keep = selectEl.value;
                let html = '<option value="">방을 선택하세요</option>';
                let count = 0;
                snap.forEach(d => {
                    count++;
                    html += `<option value="${escapeHtml(d.id)}">${escapeHtml(d.id)}</option>`;
                });
                if (count === 0 && !window.isAdmin) {
                    html = '<option value="">생성한 방이 없습니다 (새 방을 만드세요)</option>';
                }
                selectEl.innerHTML = html;
                if (keep && [...selectEl.options].some(o => o.value === keep)) selectEl.value = keep;
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
// =====================================================================
export function rtdbRoom(db, { roomsPath = 'rooms', indexPath = 'room_index' } = {}) {

    const roomRef = (code) => ref(db, `${roomsPath}/${code}`);
    const indexRef = (code) => ref(db, code ? `${indexPath}/${code}` : indexPath);
    const childRef = (code, path) => ref(db, `${roomsPath}/${code}/${path}`);

    return {
        db, roomsPath, indexPath, roomRef, indexRef, childRef,

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
                creatorName: window.currentTeacherName || ''
            };
            await set(roomRef(code), { createdAt: rtTimestamp(), ...owner, ...roomData });
            await set(indexRef(code), { createdAt: Date.now(), ...owner, ...indexData });
            return code;
        },

        /** 방 삭제 — RTDB는 부모를 지우면 하위 경로도 함께 지워집니다. */
        async deleteRoom(code) {
            await remove(roomRef(code));
            await remove(indexRef(code));
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
        async loadRooms(selectEl, labelFn = (code) => code, migrateFields = []) {
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
                            creatorName: r.creatorName || ''
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

            const keep = selectEl.value;
            selectEl.innerHTML = '<option value="">방을 선택하세요</option>';
            if (!snapshot.exists()) return;

            const rooms = snapshot.val();
            let count = 0;
            Object.keys(rooms)
                .filter(code => window.isAdmin || (rooms[code] || {}).createdBy === window.currentTeacherUid)
                .sort((a, b) => (rooms[b].createdAt || 0) - (rooms[a].createdAt || 0))
                .forEach(code => {
                    count++;
                    const option = document.createElement('option');
                    option.value = code;
                    // textContent라 방 제목에 무엇이 들어 있어도 코드로 해석되지 않습니다.
                    option.textContent = labelFn(code, rooms[code]);
                    selectEl.appendChild(option);
                });

            if (count === 0 && !window.isAdmin) {
                selectEl.innerHTML = '<option value="">생성한 방이 없습니다 (새 방을 만드세요)</option>';
            }
            if (keep && [...selectEl.options].some(o => o.value === keep)) selectEl.value = keep;
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