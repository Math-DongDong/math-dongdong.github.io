/**
 * teacher-auth.js  (v3)
 *
 * v3에서 달라진 것
 *  · teachers 문서(이메일 포함)를 학생 화면이 읽지 않도록,
 *    school·name만 담은 공개 컬렉션 teacher_directory 를 따로 관리합니다.
 *    승인된 교사는 자기 항목만 갱신할 수 있습니다(규칙에서 강제).
 *  · 등록·수정 시 이름/학교명 길이와 문자를 검사합니다.
 *    이 값은 관리자 화면 표에 그대로 나오므로, 예전에는 이름 칸에
 *    스크립트를 넣어 관리자 세션을 노릴 수 있었습니다.
 *    (표시하는 쪽도 account_manager.html에서 이스케이프합니다 — 이중 방어)
 */
import { auth, googleProvider, db } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged, deleteUser, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { uiAlert, uiConfirm } from "./ui-dialog.js";   // 사이트 공용 모달

// 화면 표시용입니다. 실제 권한은 firestore.rules의 isAdmin() uid 비교가 결정합니다.
const ADMIN_EMAIL = 'jjes0107@gmail.com';

window.isApprovedTeacher = false;
window.isAdmin = false;
window.currentTeacherUid = null;
window.currentTeacherEmail = null;
window.currentTeacherName = null;
window.currentTeacherSchool = null;

const NAME_RE = /^[가-힣a-zA-Z0-9 .\-]{2,20}$/;
const SCHOOL_RE = /^[가-힣a-zA-Z0-9 .\-()]{2,30}$/;

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

/*
 * ── 드롭다운 위치에 대한 메모 ────────────────────────────────────────
 *
 * 이 컨테이너는 <nav class="navbar"> 안에 있습니다.
 * 부트스트랩 드롭다운은 버튼이 .navbar 안에 있으면
 *
 *     _detectNavbar() { return this._element.closest('.navbar') !== null }
 *
 * 판정에 걸려 **Popper를 스스로 끕니다.**
 * (applyStyles 모디파이어를 enabled:false 로 바꾸고
 *  메뉴에 data-bs-popper="static" 을 붙입니다)
 *
 * 그래서 여기서 popperConfig 로 위치를 조정하려는 시도는 전부 무시됩니다.
 * 위치 문제는 CSS로만 풀 수 있고, navbar.css 에 처방이 들어 있습니다.
 * 접힌 메뉴에서는 position: static 으로 흐름 안에 펼쳐집니다.
 *
 * 이 파일에서 드롭다운 위치를 건드리려 하지 마세요. 동작하지 않습니다.
 */

export function updateDashboardButtons() {
    document.querySelectorAll('#btnOpenDashboard, #btn-admin-dash').forEach(btn => {
        btn.style.display = (window.isApprovedTeacher || window.isAdmin) ? 'block' : 'none';
    });
}
window.updateDashboardButtons = updateDashboardButtons;

/**
 * 학생 화면이 읽는 공개 교사 목록을 갱신합니다.
 * ★ school·name만 넣습니다. 이메일·uid·가입일은 넣지 않습니다.
 */
export async function syncTeacherDirectory(uid, school, name) {
    const s = String(school || '').trim();
    const n = String(name || '').trim();
    if (!uid || !s || !n || s === '관리자') return;
    try {
        await setDoc(doc(db, "teacher_directory", uid), { school: s, name: n }, { merge: true });
        if (typeof window.clearTeacherCache === 'function') window.clearTeacherCache();
    } catch (e) {
        console.warn('공개 교사 목록 갱신 실패:', e);
    }
}
window.syncTeacherDirectory = syncTeacherDirectory;

// ── 교사 등록 모달 ────────────────────────────────────────────────
function ensureTeacherModalDOM() {
    if (document.getElementById('teacherRegModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="teacherRegModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold">교사 정보 등록</h5>
                </div>
                <div class="modal-body pb-0">
                    <div class="alert alert-danger fw-bold d-flex align-items-center" role="alert">
                        <i class="bi bi-exclamation-triangle-fill fs-5 me-2"></i>
                        <div>학교 정보를 등록하세요. 관리자 승인 후 이용할 수 있습니다.</div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold" for="teacherSchoolInput">학교명</label>
                        <input type="text" class="form-control" id="teacherSchoolInput" placeholder="예: 동동중학교" maxlength="30" aria-describedby="teacherSchoolHelp">
                        <div class="form-text" id="teacherSchoolHelp">내가 만든 방의 학교가 되며, 학생 계정은 이 학교 + 학번으로 구분됩니다.</div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold" for="teacherNameInput">이름</label>
                        <input type="text" class="form-control" id="teacherNameInput" placeholder="예: 홍길동" maxlength="20" aria-describedby="teacherNameHelp">
                        <div class="form-text" id="teacherNameHelp">학생이 방에 들어올 때 '담당 선생님'으로 표시됩니다.</div>
                    </div>
                    <div class="alert alert-light border small mb-3">
                        <div class="fw-bold mb-1"><i class="bi bi-info-circle me-1"></i>입력한 정보는 이렇게 쓰여요</div>
                        <ul class="mb-0 ps-3">
                            <li><b>가입 승인</b>: 관리자가 학교명·이름·이메일을 보고 교사인지 확인합니다.</li>
                            <li><b>학생 화면</b>: 학생이 방에 입장할 때 학교명과 담당 선생님 이름이 보입니다.</li>
                            <li><b>학생 관리</b>: 내 방에 들어온 학생이 학생 관리 목록에 모입니다.</li>
                            <li><b>공개 범위</b>: 학생에게는 학교명·이름만 보이고 <b>이메일은 공개되지 않습니다</b>.</li>
                            <li><b>학교 변경</b>: 나중에 정보수정에서 학교를 바꾸면 이전 학교로 만든 방은 삭제됩니다.</li>
                        </ul>
                    </div>
                    <div class="text-danger small fw-bold" id="teacherRegError" style="display:none;"></div>
                </div>
                <div class="modal-footer border-0 pt-3">
                    <button type="button" class="btn btn-secondary rounded-3 px-4" id="btnCancelReg">취소 (로그아웃)</button>
                    <button type="button" class="btn btn-primary rounded-3 px-4" id="btnSubmitReg">등록 신청</button>
                </div>
            </div>
        </div>
    </div>`);
}

function ensureTeacherInfoModalDOM() {
    if (document.getElementById('teacherInfoModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="teacherInfoModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold">교사 정보 수정</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pb-0">
                    <div class="alert alert-info py-2 small d-none" id="teacherInfoNote"></div>
                    <div class="mb-3">
                        <label class="form-label fw-bold" for="editTeacherSchoolInput">학교명</label>
                        <input type="text" class="form-control" id="editTeacherSchoolInput" placeholder="예: 동동중학교" maxlength="30">
                        <small class="text-muted">담당 학생이 있으면 학교를 바꿀 수 없습니다. (학생의 학교가 선생님을 따릅니다)<br>학교를 바꾸면 이전 학교로 만든 방은 확인 후 삭제됩니다.</small>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold" for="editTeacherNameInput">이름</label>
                        <input type="text" class="form-control" id="editTeacherNameInput" placeholder="예: 홍길동" maxlength="20" readonly>
                        <small class="text-muted" id="editTeacherNameHelp">이름은 변경할 수 없습니다.</small>
                    </div>
                    <div class="text-danger small fw-bold" id="teacherInfoError" style="display:none;"></div>
                </div>
                <div class="modal-footer border-0 pt-3 d-flex justify-content-between">
                    <button type="button" class="btn btn-outline-danger rounded-3" id="btnDeleteAccount">회원 탈퇴</button>
                    <div>
                        <button type="button" class="btn btn-secondary rounded-3" data-bs-dismiss="modal">닫기</button>
                        <button type="button" class="btn btn-primary rounded-3" id="btnSaveInfo">저장</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`);
}

function ensureAdminAlertModalDOM() {
    if (document.getElementById('adminAlertModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="adminAlertModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold text-primary">승인 대기 알림</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pb-3">
                    <p class="fs-5" id="adminAlertMessage"></p>
                    <div class="form-check mt-3">
                        <input class="form-check-input" type="checkbox" id="chkHideAdminAlert">
                        <label class="form-check-label text-muted" for="chkHideAdminAlert">오늘 하루 이 창 안 보기</label>
                    </div>
                </div>
                <div class="modal-footer border-0 pt-0">
                    <button type="button" class="btn btn-secondary rounded-3" data-bs-dismiss="modal">닫기</button>
                    <button type="button" class="btn btn-primary rounded-3" id="btnGoToAdmin">관리 페이지로 이동</button>
                </div>
            </div>
        </div>
    </div>`);
}

function ensureRoomPurgeModalDOM() {
    if (document.getElementById('roomPurgeModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="roomPurgeModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold text-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i>이전 학교 방 삭제</h5>
                </div>
                <div class="modal-body">
                    <div class="d-flex align-items-center justify-content-center flex-wrap gap-2 bg-light rounded-3 py-2 px-3 mb-3 fw-bold">
                        <span class="text-secondary text-decoration-line-through" id="purgePrevSchool"></span>
                        <i class="bi bi-arrow-right text-muted"></i>
                        <span class="text-primary" id="purgeNewSchool"></span>
                    </div>
                    <p class="mb-2">이전 학교로 만든 방 <b class="text-danger" id="purgeCount"></b>개와 그 안의 기록이 <b>모두 삭제</b>됩니다.</p>
                    <ul class="list-group small mb-2 overflow-auto" id="purgeRoomList" style="max-height: 180px;"></ul>
                    <small class="text-muted"><i class="bi bi-info-circle me-1"></i>삭제한 방과 기록은 되돌릴 수 없습니다.</small>
                    <div class="mt-3 d-none" id="purgeProgressWrap">
                        <div class="progress" role="progressbar" aria-label="방 삭제 진행률" style="height: 10px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated bg-danger" id="purgeProgressBar" style="width: 0%;"></div>
                        </div>
                        <div class="small text-muted text-center mt-1" id="purgeProgressText"></div>
                    </div>
                    <div class="alert alert-danger small py-2 mt-3 mb-0 d-none" id="purgeError"></div>
                </div>
                <div class="modal-footer border-0 pt-0">
                    <button type="button" class="btn btn-secondary rounded-3" id="btnPurgeCancel">취소</button>
                    <button type="button" class="btn btn-danger rounded-3" id="btnPurgeConfirm"></button>
                </div>
            </div>
        </div>
    </div>`);
}

function modalFor(el) { return bootstrap.Modal.getOrCreateInstance(el); }

/** 모달이 완전히 닫힌 뒤 이어 갑니다 — 닫히는 중에 다른 모달을 열면 배경이 남습니다. */
function hideModalAsync(el) {
    return new Promise(resolve => {
        if (!el.classList.contains('show')) return resolve();
        el.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
        modalFor(el).hide();
    });
}

/**
 * 안내 · 확인 모달 (alert/confirm 대체) — 사이트 공용 모달(ui-dialog.js)로 그립니다.
 * isConfirm=true 이면 취소 버튼을 보이고, 확인 버튼을 눌렀을 때만 true로 끝납니다.
 * type은 Bootstrap 색상 이름(primary, success, danger, warning…)입니다. message는 글자 그대로(줄바꿈 유지).
 */
function showAuthDialog(title, message, { isConfirm = false, confirmText = '확인', type = 'primary' } = {}) {
    return isConfirm
        ? uiConfirm(title, message, { confirmText, type })
        : uiAlert(title, message, { confirmText, type });
}

/**
 * 학교 변경 전 '이전 학교 방 삭제' 확인 모달.
 * 확인하면 모달 안에서 진행률을 보이며 지우고, 모두 지워야 true로 끝납니다.
 * 실패하면 [다시 시도]로 남은 방만 이어서 지웁니다. 취소하면 false.
 */
function confirmRoomPurge(registry, rooms, prevSchool, school) {
    ensureRoomPurgeModalDOM();
    const el = document.getElementById('roomPurgeModal');
    const $p = (id) => document.getElementById(id);
    const confirmBtn = $p('btnPurgeConfirm');
    const cancelBtn = $p('btnPurgeCancel');
    const errEl = $p('purgeError');
    const confirmLabel = '<i class="bi bi-trash3 me-1"></i>삭제하고 학교 변경';

    $p('purgePrevSchool').textContent = prevSchool;
    $p('purgeNewSchool').textContent = school;
    $p('purgeCount').textContent = rooms.length;
    $p('purgeRoomList').innerHTML = rooms.map(r => {
        const first = (r.parts || [])[0] || {};
        const store = first.fs || (first.rtdb ? new URL(first.rtdb).hostname.split('.')[0] : '');
        return `<li class="list-group-item d-flex justify-content-between align-items-center gap-2">
                    <span><b>${esc(r.code)}</b>${r.memo ? ` <span class="text-muted">· ${esc(r.memo)}</span>` : ''}</span>
                    <span class="badge text-bg-light border fw-normal">${esc(store)}</span>
                </li>`;
    }).join('');
    $p('purgeProgressWrap').classList.add('d-none');
    errEl.classList.add('d-none');
    confirmBtn.innerHTML = confirmLabel;
    confirmBtn.disabled = cancelBtn.disabled = false;

    return new Promise(resolve => {
        let done = 0;   // 지금까지 지운 방 수 — 다시 시도하면 여기부터 이어 갑니다
        const finish = (ok) => hideModalAsync(el).then(() => resolve(ok));

        cancelBtn.onclick = () => finish(false);
        confirmBtn.onclick = async () => {
            confirmBtn.disabled = cancelBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>삭제 중';
            errEl.classList.add('d-none');
            $p('purgeProgressWrap').classList.remove('d-none');
            const showProgress = () => {
                $p('purgeProgressBar').style.width = `${Math.round(done / rooms.length * 100)}%`;
                $p('purgeProgressText').textContent = `${done} / ${rooms.length}개 삭제`;
            };
            showProgress();
            try {
                await registry.purgeRooms(rooms.slice(done), () => { done++; showProgress(); });
                finish(true);
            } catch (e) {
                console.error(e);
                errEl.innerHTML = '<i class="bi bi-x-circle me-1"></i>방을 모두 지우지 못해 <b>학교는 바뀌지 않았습니다.</b> [다시 시도]를 누르면 남은 방만 지웁니다.';
                errEl.classList.remove('d-none');
                confirmBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>다시 시도';
                confirmBtn.disabled = cancelBtn.disabled = false;
            }
        };

        modalFor(el).show();
    });
}

// ── 회원 탈퇴 모달 ────────────────────────────────────────────────
function ensureWithdrawModalDOM() {
    if (document.getElementById('withdrawModal')) return;
    document.body.insertAdjacentHTML('beforeend', `
    <div class="modal fade" id="withdrawModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="withdrawTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold text-danger" id="withdrawTitle"><i class="bi bi-exclamation-triangle-fill me-2"></i>회원 탈퇴</h5>
                </div>
                <div class="modal-body">
                    <p class="mb-2" id="withdrawIntro"></p>
                    <ul class="list-group small mb-2" id="withdrawTargets">
                        <li class="list-group-item d-flex justify-content-between align-items-center gap-2">
                            <span>내가 만든 방 삭제 <span class="text-muted">(기록 포함)</span></span>
                            <b class="text-danger text-nowrap" id="withdrawRoomCount"></b>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center gap-2">
                            <span>학생 정보 삭제 <span class="text-muted">(담당 교사가 나뿐)</span></span>
                            <b class="text-danger text-nowrap" id="withdrawStudentCount"></b>
                        </li>
                        <li class="list-group-item d-flex justify-content-between align-items-center gap-2">
                            <span>담당 교사에서만 제외 <span class="text-muted">(다른 담당 교사 있음)</span></span>
                            <b class="text-nowrap" id="withdrawDetachCount"></b>
                        </li>
                    </ul>
                    <div class="alert alert-warning small py-2 mb-2 d-none" id="withdrawNameConflict"></div>
                    <small class="text-muted"><i class="bi bi-info-circle me-1"></i>삭제한 데이터는 되돌릴 수 없습니다. 본인 확인을 위해 구글 로그인 창이 한 번 뜹니다.</small>
                    <div class="mt-3 d-none" id="withdrawProgressWrap">
                        <div class="progress" role="progressbar" aria-label="탈퇴 정리 진행률" style="height: 10px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated bg-danger" id="withdrawProgressBar" style="width: 0%;"></div>
                        </div>
                        <div class="small text-muted text-center mt-1" id="withdrawProgressText"></div>
                    </div>
                    <div class="alert alert-danger small py-2 mt-3 mb-0 d-none" id="withdrawError" style="white-space: pre-line;"></div>
                </div>
                <div class="modal-footer border-0 pt-0 flex-wrap">
                    <button type="button" class="btn btn-secondary rounded-3" id="btnWithdrawCancel">취소</button>
                    <button type="button" class="btn btn-outline-secondary rounded-3 d-none" id="btnWithdrawRequest">관리자에게 탈퇴 요청</button>
                    <button type="button" class="btn btn-danger rounded-3" id="btnWithdrawConfirm"></button>
                </div>
            </div>
        </div>
    </div>`);
}

/**
 * 회원 탈퇴 — 내가 만든 방 · 담당 학생을 정리한 뒤 교사 정보와 로그인 연결을 지웁니다.
 * 관리자 계정 삭제(account_manager.html)와 같은 정리 로직(js/teacher-cleanup.js)을 씁니다.
 *
 * ★ 로그인 연결 해제(deleteUser)는 최근 로그인이 필요해서, [탈퇴]를 누를 때 구글 로그인을 먼저 다시 확인합니다.
 *   팝업은 버튼을 누른 그 순간에 열어야 브라우저가 막지 않으므로 await보다 먼저 엽니다.
 * ★ 순서: 방 · 학생 정리 → 교사 정보 → 로그인 연결. 로그인 연결을 먼저 끊으면 교사 정보를 지울 권한이 사라집니다.
 * ★ 실시간 게임 권한(RTDB teacher_uids)은 관리자만 지울 수 있어 남지만, 로그인 연결을 지우면 그 uid로는 다시 로그인할 수 없습니다.
 * ★ 지우지 못한 방 · 학생이 하나라도 있으면 탈퇴하지 않습니다 (데이터 찌꺼기 방지).
 *   [다시 시도]로 남은 것만 다시 지우거나, [관리자에게 탈퇴 요청]으로 관리자가 관리자 권한으로 마저 정리하게 합니다.
 *
 * @param {object|null} initialPlan  collectTeacherCleanupPlan 결과 (승인 전 교사는 null — 정리할 것이 없음)
 * @param {object|null} cleanup      teacher-cleanup.js 모듈
 * @returns {Promise<'done'|'requested'|false>} 탈퇴 완료 · 관리자에게 요청 · 취소 (모달이 완전히 닫힌 뒤)
 */
function openWithdrawModal(user, initialPlan, cleanup) {
    ensureWithdrawModalDOM();
    const el = document.getElementById('withdrawModal');
    const $w = (id) => document.getElementById(id);
    const btnCancel = $w('btnWithdrawCancel');
    const btnRequest = $w('btnWithdrawRequest');
    const btnConfirm = $w('btnWithdrawConfirm');
    const errEl = $w('withdrawError');
    const confirmLabel = '<i class="bi bi-person-x me-1"></i>탈퇴';

    let plan = initialPlan;
    let failures = [];
    let attempted = false;              // 한 번이라도 정리를 시도했는지 — 다시 시도할 때는 남은 대상만 새로 모읍니다
    let accountRecordDeleted = false;   // 교사 정보까지 지웠으면 되돌아갈 곳이 없으므로 취소를 숨깁니다

    function renderPlan() {
        $w('withdrawTargets').classList.toggle('d-none', !plan);
        $w('withdrawIntro').textContent = plan
            ? '내가 만든 방과 담당 학생 정보를 정리한 뒤 탈퇴합니다.'
            : '교사 정보를 지우고 탈퇴합니다.';
        if (plan) {
            $w('withdrawRoomCount').textContent = `${plan.rooms.length}개`;
            $w('withdrawStudentCount').textContent = `${plan.studentsToDelete.length}명`;
            $w('withdrawDetachCount').textContent = `${plan.studentsToDetach.length}명`;
        }
        const conflictEl = $w('withdrawNameConflict');
        const conflict = !!(plan && plan.nameConflict);
        conflictEl.classList.toggle('d-none', !conflict);
        conflictEl.textContent = conflict
            ? `같은 학교에 '${plan.name}' 이름의 다른 선생님이 있습니다. 그 선생님의 학생을 지우지 않도록, 학생 정보는 지우지 않고 나만 담당에서 뺍니다.`
            : '';
    }
    const setBusy = (busy) => { [btnCancel, btnRequest, btnConfirm].forEach(b => { b.disabled = busy; }); };
    const showError = (message) => { errEl.textContent = message; errEl.classList.remove('d-none'); };
    function setProgress(done, total) {
        $w('withdrawProgressBar').style.width = `${total ? Math.round(done / total * 100) : 100}%`;
        $w('withdrawProgressText').textContent = total ? `${done} / ${total} 정리 중...` : '정리할 방·학생이 없습니다.';
    }

    // 초기 상태
    renderPlan();
    errEl.classList.add('d-none');
    $w('withdrawProgressWrap').classList.add('d-none');
    btnRequest.classList.add('d-none');
    btnCancel.classList.remove('d-none');
    btnCancel.textContent = '취소';
    btnConfirm.innerHTML = confirmLabel;
    setBusy(false);

    return new Promise(resolve => {
        let result = false;
        const close = (value) => { result = value; hideModalAsync(el).then(() => resolve(result)); };

        /** 교사 정보 → 로그인 연결 순서로 지웁니다 */
        async function finishAccount() {
            try {
                await deleteDoc(doc(db, "teacher_directory", user.uid)).catch(() => { });
                await deleteDoc(doc(db, "teachers", user.uid));
                accountRecordDeleted = true;
                await deleteUser(user);
                close('done');
            } catch (e) {
                console.error(e);
                if (!accountRecordDeleted) {
                    showError('교사 정보를 지우지 못해 아직 탈퇴하지 않았습니다. 잠시 후 다시 시도해 주세요.');
                    setBusy(false);
                    return;
                }
                // 교사 정보는 이미 지웠고 로그인 연결만 남은 상태 — 다시 로그인을 확인해 마칩니다
                showError(String(e?.code || '') === 'auth/requires-recent-login'
                    ? '방·학생 정리와 교사 정보 삭제는 끝났습니다.\n로그인 연결을 끊으려면 [다시 로그인하고 마치기]를 눌러 주세요.'
                    : '탈퇴를 마치지 못했습니다. [다시 로그인하고 마치기]를 눌러 다시 시도해 주세요.');
                btnConfirm.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>다시 로그인하고 마치기';
                btnRequest.classList.add('d-none');
                btnCancel.classList.add('d-none');
                setBusy(false);
            }
        }

        /** 방 · 학생 정리 → (모두 지웠으면) 계정 삭제. 실패 항목이 있으면 계정은 남겨 둡니다 */
        async function cleanupThenFinish() {
            if (plan && cleanup) {
                $w('withdrawProgressWrap').classList.remove('d-none');
                try {
                    // 다시 시도할 때는 남은 항목만 다시 모읍니다 (지운 방 · 학생은 목록에서 빠져 있음)
                    if (attempted) { plan = await cleanup.collectTeacherCleanupPlan(user.uid); renderPlan(); }
                    attempted = true;
                    setProgress(0, cleanup.countCleanupTargets(plan));
                    failures = await cleanup.runTeacherCleanup(plan, setProgress);
                } catch (e) {
                    console.error(e);
                    failures = ['정리할 목록 불러오기'];
                }
                if (failures.length) {
                    // ★ 하나라도 남으면 탈퇴하지 않습니다 — 남은 방 · 학생이 주인 없는 찌꺼기가 되기 때문입니다
                    showError(`다음 항목을 지우지 못해 아직 탈퇴하지 않았습니다.\n${cleanup.formatCleanupFailures(failures)}\n\n` +
                        '[다시 시도]로 남은 것만 다시 지우거나, 계속 실패하면 [관리자에게 탈퇴 요청]을 눌러 주세요. ' +
                        '관리자가 관리자 권한으로 마저 정리한 뒤 계정을 삭제합니다.');
                    btnConfirm.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>다시 시도';
                    btnRequest.classList.remove('d-none');
                    btnCancel.textContent = '닫기';
                    setBusy(false);
                    return;
                }
            }
            await finishAccount();
        }

        btnConfirm.onclick = () => {
            setBusy(true);
            errEl.classList.add('d-none');
            const reauth = reauthenticateWithPopup(user, googleProvider);   // ★ 클릭 직후 바로 (팝업 차단 방지)
            reauth.then(
                () => (accountRecordDeleted ? finishAccount() : cleanupThenFinish()),
                (e) => {
                    const code = String(e?.code || '');
                    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
                        showError('본인 확인(구글 로그인)이 취소되어 탈퇴하지 않았습니다.');
                    } else if (code === 'auth/user-mismatch') {
                        showError('지금 로그인한 계정과 다른 구글 계정을 골랐습니다. 같은 계정으로 다시 시도해 주세요.');
                    } else if (code === 'auth/popup-blocked') {
                        showError('팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해 주세요.');
                    } else {
                        console.error(e);
                        showError('본인 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
                    }
                    setBusy(false);
                }
            );
        };
        // 관리자에게 탈퇴 요청 — 교사 정보에 표시만 남기고, 계정 관리에서 관리자가 정리 · 삭제합니다
        btnRequest.onclick = async () => {
            setBusy(true);
            try {
                await setDoc(doc(db, "teachers", user.uid),
                    { withdrawRequested: true, withdrawRequestedAt: serverTimestamp() }, { merge: true });
                close('requested');
            } catch (e) {
                console.error(e);
                showError('탈퇴 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
                setBusy(false);
            }
        };
        btnCancel.onclick = () => close(false);

        modalFor(el).show();
    });
}

async function showRegistrationModal(user) {
    ensureTeacherModalDOM();
    const modalEl = document.getElementById('teacherRegModal');
    const bsModal = modalFor(modalEl);
    const errEl = document.getElementById('teacherRegError');

    document.getElementById('teacherSchoolInput').value = '';
    document.getElementById('teacherNameInput').value = '';
    errEl.style.display = 'none';

    return new Promise((resolve) => {
        document.getElementById('btnSubmitReg').onclick = async () => {
            const school = document.getElementById('teacherSchoolInput').value.trim();
            const name = document.getElementById('teacherNameInput').value.trim();

            const fail = (m) => { errEl.textContent = m; errEl.style.display = 'block'; };
            if (!SCHOOL_RE.test(school)) return fail("학교명은 한글·영문·숫자 2~30자로 입력해주세요.");
            if (!NAME_RE.test(name)) return fail("이름은 한글·영문 2~20자로 입력해주세요.");

            try {
                // status는 반드시 pending — 규칙도 이 값만 허용합니다.
                await setDoc(doc(db, "teachers", user.uid), {
                    email: user.email,
                    school, name,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                });
                bsModal.hide();
                resolve(true);
            } catch (err) {
                console.error(err);
                fail("등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
            }
        };

        document.getElementById('btnCancelReg').onclick = async () => {
            try { await deleteUser(user); } catch (e) { await signOut(auth); }
            bsModal.hide();
            resolve(false);
        };

        bsModal.show();
    });
}

/**
 * 이 선생님에게 딸린 학생 수 — 학생 관리와 같은 기준입니다 (승인된 교사만 읽을 수 있습니다).
 *  ① teacherUids에 내 uid가 있는 학생  ② uid가 아직 없는 옛 학생: 같은 학교 + teachers에 내 이름
 *  (2단계 규칙 뒤에는 ②가 거부되므로 조용히 건너뜁니다)
 */
async function countMyStudents(school, name) {
    const uid = auth.currentUser?.uid;
    const ids = new Set();
    if (uid) {
        const byUid = await getDocs(query(collection(db, "student_auth"), where("teacherUids", "array-contains", uid)));
        byUid.forEach(d => { if (String(d.data()?.school || '') === school) ids.add(d.id); });
    }
    if (school && name) {
        try {
            const byName = await getDocs(query(collection(db, "student_auth"),
                where("school", "==", school), where("teachers", "array-contains", name)));
            byName.forEach(d => ids.add(d.id));
        } catch (e) { /* 2단계 규칙: 이름 조회 거부 — uid 조회만으로 충분 */ }
    }
    return ids.size;
}

async function showTeacherInfoModal(user, docData) {
    ensureTeacherInfoModalDOM();
    const modalEl = document.getElementById('teacherInfoModal');
    const bsModal = modalFor(modalEl);

    const isAdminUser = (user.email === ADMIN_EMAIL);
    const schoolInput = document.getElementById('editTeacherSchoolInput');
    const nameInput = document.getElementById('editTeacherNameInput');
    const nameHelp = document.getElementById('editTeacherNameHelp');
    const note = document.getElementById('teacherInfoNote');
    const errEl = document.getElementById('teacherInfoError');

    schoolInput.value = docData.school || '';
    nameInput.value = docData.name || '';
    errEl.style.display = 'none';

    nameInput.readOnly = !isAdminUser;
    nameHelp.textContent = isAdminUser
        ? '학생 등록 화면의 담당 선생님 목록에 이 이름이 표시됩니다.'
        : '이름은 변경할 수 없습니다.';
    note.classList.toggle('d-none', !isAdminUser);
    if (isAdminUser) {
        note.innerHTML = '학교명이 <b>관리자</b>로 되어 있으면 학생 화면의 학교 목록에 나타나지 않고, <b>학생 인증 방을 만들 수 없습니다.</b><br>' +
            '실제 학교명과 이름으로 바꾸면 학생이 선택할 수 있습니다.';
    }

    document.getElementById('btnSaveInfo').onclick = async () => {
        const school = schoolInput.value.trim();
        const name = isAdminUser ? nameInput.value.trim() : (docData.name || '');
        const fail = (m) => { errEl.textContent = m; errEl.style.display = 'block'; };

        if (!SCHOOL_RE.test(school) && school !== '관리자') return fail("학교명은 한글·영문·숫자 2~30자로 입력해주세요.");
        if (isAdminUser && !NAME_RE.test(name)) return fail("이름은 한글·영문 2~20자로 입력해주세요.");

        // v4: 학생의 학교는 방을 만든 선생님을 따릅니다. 담당 학생이 남은 채 학교를 바꾸면
        //     그 학생들이 학생 관리에서 사라지므로, 담당 학생이 없을 때만 바꿀 수 있습니다.
        const prevSchool = String(docData.school || '').trim();
        if (school !== prevSchool && (docData.status === 'approved' || isAdminUser)) {
            try {
                const mine = await countMyStudents(prevSchool, String(docData.name || '').trim());
                if (mine > 0) return fail(`담당 학생 ${mine}명이 있어 학교를 바꿀 수 없습니다. 학생 관리에서 학생을 삭제하거나 담당 선생님에서 빼 주세요.`);
            } catch (e) {
                console.error(e);
                return fail("담당 학생을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
            }
        }

        // 이전 학교로 만든 방은 들어오는 학생을 이전 학교로 등록하므로, 학교를 바꾸기 전에 지웁니다.
        //  ★ 이전 학교가 비어 있거나 '관리자'(관리자 계정의 처음 값)이면 실제 학교가 아니므로 건너뜁니다.
        //  ★ 방 목록(room_registry)은 학교를 바꿀 때만 불러옵니다 — 모든 페이지가 읽을 필요는 없습니다.
        const hadRealSchool = prevSchool && prevSchool !== '관리자';
        if (school !== prevSchool && hadRealSchool && (docData.status === 'approved' || isAdminUser)) {
            let registry, staleRooms;
            try {
                registry = await import('./room-registry.js');
                staleRooms = (await registry.findMyRooms())
                    .filter(r => String(r.creatorSchool || '').trim() !== school);
            } catch (e) {
                console.error(e);
                return fail("만든 방 목록을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
            }
            if (staleRooms.length) {
                // 정보수정 창 위에 겹쳐 띄우면 배경이 꼬이므로 잠시 닫고, 취소하면 다시 엽니다.
                await hideModalAsync(modalEl);
                if (!(await confirmRoomPurge(registry, staleRooms, prevSchool, school))) {
                    bsModal.show();
                    return;
                }
            }
        }

        try {
            const payload = isAdminUser ? { school, name } : { school };
            await setDoc(doc(db, "teachers", user.uid), payload, { merge: true });
            window.currentTeacherSchool = school;
            docData.school = school;          // 같은 창에서 다시 저장할 때 비교 기준
            if (isAdminUser) window.currentTeacherName = name;

            // 승인 상태라면 공개 목록도 함께 갱신 (학생 화면의 학교·교사 드롭다운)
            if (docData.status === 'approved' || isAdminUser) {
                await syncTeacherDirectory(user.uid, school, name);
            }
            if (typeof window.clearTeacherCache === 'function') window.clearTeacherCache();

            bsModal.hide();
            renderNavbarAuth();
        } catch (e) {
            console.error(e);
            if (!modalEl.classList.contains('show')) bsModal.show();   // 방 삭제 모달을 거쳐 닫혀 있을 수 있습니다
            fail("저장 중 오류가 발생했습니다.");
        }
    };

    document.getElementById('btnDeleteAccount').onclick = async () => {
        // 모달 두 개가 겹치면 배경이 남으므로 정보수정 모달을 먼저 닫습니다
        await hideModalAsync(modalEl);

        // 방 · 담당 학생은 승인된 교사(또는 관리자)에게만 있습니다. 승인 전에는 목록을 읽을 권한도 없습니다.
        // 정리 로직은 관리자 계정 삭제와 같은 teacher-cleanup.js를 탈퇴할 때만 불러옵니다.
        let cleanup = null;
        let plan = null;
        if (docData.status === 'approved' || isAdminUser) {
            try {
                cleanup = await import('./teacher-cleanup.js');
                plan = await cleanup.collectTeacherCleanupPlan(user.uid);
            } catch (e) {
                console.error(e);
                await showAuthDialog("탈퇴 준비 실패", "정리할 방·학생 목록을 불러오지 못했습니다.\n잠시 후 다시 시도해 주세요.", { type: 'danger' });
                bsModal.show();
                return;
            }
        }

        const outcome = await openWithdrawModal(user, plan, cleanup);
        if (outcome === 'requested') {
            await showAuthDialog("탈퇴 요청 완료",
                "관리자에게 탈퇴를 요청했습니다.\n관리자가 남은 방·학생 정보를 정리한 뒤 계정을 삭제합니다.", { type: 'success' });
            return;
        }
        if (outcome !== 'done') { bsModal.show(); return; }
        await showAuthDialog("탈퇴 완료", "탈퇴가 완료되었습니다.", { type: 'success' });
        location.reload();
    };

    bsModal.show();
}

function handleAdminAlert() {
    // 이미 승인 관리 페이지에 있으면 알림 불필요
    if (/\/pages\/admin\/account_manager(\.html)?$/.test(decodeURIComponent(window.location.pathname).replace(/\\/g, '/'))) return;

    const today = new Date().toLocaleDateString();
    if (localStorage.getItem('hideAdminAlertDate') === today) return;

    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js").then(async ({ collection, query, where, getDocs }) => {
        try {
            // 가입 승인 요청 + 교사 본인이 남긴 탈퇴 요청 (회원 탈퇴 중 지우지 못한 방 · 학생을 관리자가 마저 정리)
            const [pendingSnap, withdrawSnap] = await Promise.all([
                getDocs(query(collection(db, "teachers"), where("status", "==", "pending"))),
                getDocs(query(collection(db, "teachers"), where("withdrawRequested", "==", true)))
            ]);
            if (pendingSnap.empty && withdrawSnap.empty) return;

            ensureAdminAlertModalDOM();
            const items = [];
            if (!pendingSnap.empty) items.push(`교사 가입 승인 요청 <strong>${pendingSnap.size}건</strong>`);
            if (!withdrawSnap.empty) items.push(`교사 탈퇴 요청 <strong>${withdrawSnap.size}건</strong>`);
            document.querySelector('#adminAlertModal .modal-title').textContent = withdrawSnap.empty ? '승인 대기 알림' : '처리 대기 알림';
            document.getElementById('adminAlertMessage').innerHTML = `현재 ${items.join(', ')}이 대기 중입니다.`;

            const modalEl = document.getElementById('adminAlertModal');
            const bsModal = modalFor(modalEl);

            document.getElementById('btnGoToAdmin').onclick = () => { bsModal.hide(); goToAdminPage(); };
            modalEl.addEventListener('hidden.bs.modal', () => {
                if (document.getElementById('chkHideAdminAlert').checked) {
                    localStorage.setItem('hideAdminAlertDate', new Date().toLocaleDateString());
                }
            }, { once: true });

            bsModal.show();
        } catch (e) { /* 권한 없으면 조용히 무시 */ }
    });
}

function getRootPathForAuth() {
    const normalizedPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/');
    pathSegments.pop();
    const pagesIndex = pathSegments.lastIndexOf('pages');
    if (pagesIndex !== -1) return '../'.repeat(pathSegments.length - pagesIndex);
    return './';
}

function goToAdminPage() {
    window.location.href = `${getRootPathForAuth()}pages/admin/account_manager.html`;
}
function goToStudentManagerPage() {
    window.location.href = `${getRootPathForAuth()}pages/admin/student_manager.html`;
}
function goToReviewSystemPage() {
    window.open(`${getRootPathForAuth()}pages/admin/studentsreviewsystem.html`, '_blank');
}
function goToFormBuilderPage() {
    window.open(`${getRootPathForAuth()}pages/admin/formbuilder.html`, '_blank');
}
function goToRelationMapPage() {
    window.open(`${getRootPathForAuth()}pages/admin/relationmap.html`, '_blank');
}

function notifyAuthChanged() {
    window.dispatchEvent(new CustomEvent('teacherAuthChanged', {
        detail: {
            isApproved: window.isApprovedTeacher,
            isAdmin: window.isAdmin,
            uid: window.currentTeacherUid,
            email: window.currentTeacherEmail,
            name: window.currentTeacherName,
            school: window.currentTeacherSchool
        }
    }));
    updateDashboardButtons();
}

function renderNavbarAuth(retryCount = 0) {
    const container = document.getElementById('teacher-auth-container');
    if (!container) {
        if (retryCount < 30) setTimeout(() => renderNavbarAuth(retryCount + 1), 100);
        return;
    }

    const user = auth.currentUser;

    if (!user) {
        window.isApprovedTeacher = false;
        window.isAdmin = false;
        window.currentTeacherUid = null;
        window.currentTeacherEmail = null;
        window.currentTeacherName = null;
        window.currentTeacherSchool = null;
        notifyAuthChanged();
        container.innerHTML = `<button class="btn btn-outline-primary btn-sm fw-bold shadow-sm" id="btnTeacherLogin"><i class="bi bi-google me-1"></i> 교사 로그인</button>`;
        document.getElementById('btnTeacherLogin').onclick = () => {
            signInWithPopup(auth, googleProvider).catch(err => {
                const code = err.code || '';
                if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
                let message = `로그인에 실패했습니다.\n오류 코드: ${code}`;
                if (code === 'auth/popup-blocked') {
                    message = "팝업이 차단되었습니다. 브라우저의 팝업 차단 설정을 해제한 뒤 다시 시도해주세요.";
                } else if (code === 'auth/unauthorized-domain') {
                    message = "이 도메인은 Firebase에 등록되지 않았습니다.\n\nFirebase Console → Authentication → Settings → 승인된 도메인에 현재 도메인을 추가해주세요.";
                } else if (code === 'auth/operation-not-allowed') {
                    message = "Google 로그인이 비활성화 상태입니다.";
                }
                showAuthDialog("로그인 실패", message, { type: 'danger' });
            });
        };
        return;
    }

    window.currentTeacherUid = user.uid;
    window.currentTeacherEmail = user.email;

    getDoc(doc(db, "teachers", user.uid)).then(docSnap => {
        if (!docSnap.exists()) {
            if (user.email === ADMIN_EMAIL) {
                setDoc(doc(db, "teachers", user.uid), {
                    email: user.email, school: '관리자', name: '관리자',
                    status: 'pending',                 // 규칙이 create 시 pending만 허용합니다.
                    createdAt: new Date().toISOString()
                }).then(() => renderNavbarAuth());
                return;
            }
            showRegistrationModal(user).then(registered => { if (registered) renderNavbarAuth(); });
            return;
        }

        const data = docSnap.data() || {};
        window.currentTeacherName = data.name || user.displayName || '교사';
        window.currentTeacherSchool = data.school || '';
        let btnHtml = '';

        if (user.email === ADMIN_EMAIL) {
            window.isAdmin = true;
            window.isApprovedTeacher = true;
            notifyAuthChanged();
            btnHtml = `
                <div class="dropdown">
                    <button class="btn btn-primary btn-sm fw-bold dropdown-toggle shadow-sm" type="button" id="authDropdown" data-bs-toggle="dropdown" aria-expanded="false">관리자 접속</button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0" aria-labelledby="authDropdown">
                        <li><a class="dropdown-item" href="#" id="btnGoAdmin"><i class="bi bi-gear-fill me-2"></i>계정 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoStudents"><i class="bi bi-people-fill me-2"></i>학생 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoReviews"><i class="bi bi-journal-text me-2"></i>소감문 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoFormBuilder"><i class="bi bi-ui-checks-grid me-2"></i>설문조사 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoRelationMap"><i class="bi bi-diagram-3 me-2"></i>우리반 관계지도</a></li>
                        <li><a class="dropdown-item" href="#" id="btnEditInfo"><i class="bi bi-person-fill-gear me-2"></i>정보수정 (학교명)</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" id="btnTeacherLogout"><i class="bi bi-box-arrow-right me-2"></i>로그아웃</a></li>
                    </ul>
                </div>`;
            setTimeout(() => {
                document.getElementById('btnGoAdmin').onclick = (e) => { e.preventDefault(); goToAdminPage(); };
                document.getElementById('btnGoStudents').onclick = (e) => { e.preventDefault(); goToStudentManagerPage(); };
                document.getElementById('btnGoReviews').onclick = (e) => { e.preventDefault(); goToReviewSystemPage(); };
                document.getElementById('btnGoFormBuilder').onclick = (e) => { e.preventDefault(); goToFormBuilderPage(); };
                document.getElementById('btnGoRelationMap').onclick = (e) => { e.preventDefault(); goToRelationMapPage(); };
                document.getElementById('btnEditInfo').onclick = (e) => { e.preventDefault(); showTeacherInfoModal(user, data); };
                document.getElementById('btnTeacherLogout').onclick = (e) => { e.preventDefault(); signOut(auth); };
            }, 0);
            handleAdminAlert();

        } else if (data.status === 'approved') {
            window.isApprovedTeacher = true;
            notifyAuthChanged();
            // 공개 목록에 빠져 있으면 채워 둡니다(승인 직후 첫 로그인 등)
            syncTeacherDirectory(user.uid, data.school, data.name);
            btnHtml = `
                <div class="dropdown">
                    <button class="btn btn-outline-primary btn-sm fw-bold dropdown-toggle shadow-sm" type="button" id="authDropdown" data-bs-toggle="dropdown" aria-expanded="false">${esc(data.name)} 선생님</button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0" aria-labelledby="authDropdown">
                        <li><a class="dropdown-item" href="#" id="btnGoStudents"><i class="bi bi-people-fill me-2"></i>학생 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoReviews"><i class="bi bi-journal-text me-2"></i>소감문 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoFormBuilder"><i class="bi bi-ui-checks-grid me-2"></i>설문조사 관리</a></li>
                        <li><a class="dropdown-item" href="#" id="btnGoRelationMap"><i class="bi bi-diagram-3 me-2"></i>우리반 관계지도</a></li>
                        <li><a class="dropdown-item" href="#" id="btnEditInfo"><i class="bi bi-person-fill-gear me-2"></i>정보수정</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" id="btnTeacherLogout"><i class="bi bi-box-arrow-right me-2"></i>로그아웃</a></li>
                    </ul>
                </div>`;
            setTimeout(() => {
                document.getElementById('btnGoStudents').onclick = (e) => { e.preventDefault(); goToStudentManagerPage(); };
                document.getElementById('btnGoReviews').onclick = (e) => { e.preventDefault(); goToReviewSystemPage(); };
                document.getElementById('btnGoFormBuilder').onclick = (e) => { e.preventDefault(); goToFormBuilderPage(); };
                document.getElementById('btnGoRelationMap').onclick = (e) => { e.preventDefault(); goToRelationMapPage(); };
                document.getElementById('btnEditInfo').onclick = (e) => { e.preventDefault(); showTeacherInfoModal(user, data); };
                document.getElementById('btnTeacherLogout').onclick = (e) => { e.preventDefault(); signOut(auth); };
            }, 0);

        } else {
            window.isApprovedTeacher = false;
            notifyAuthChanged();
            btnHtml = `
                <button class="btn btn-warning btn-sm fw-bold me-2 shadow-sm" disabled>승인 대기 중</button>
                <button class="btn btn-outline-danger btn-sm fw-bold shadow-sm" id="btnTeacherLogout">로그아웃</button>`;
            setTimeout(() => {
                document.getElementById('btnTeacherLogout').onclick = () => signOut(auth);
            }, 0);
        }

        container.innerHTML = btnHtml;
        notifyAuthChanged();

    }).catch(err => {
        console.error("교사 정보 조회 오류:", err);
        container.innerHTML = `<button class="btn btn-danger btn-sm fw-bold" id="btnTeacherLogout">오류 발생 (로그아웃)</button>`;
        setTimeout(() => {
            document.getElementById('btnTeacherLogout').onclick = () => signOut(auth);
        }, 0);
    });
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.isApprovedTeacher = false;
        window.isAdmin = false;
        notifyAuthChanged();
    }
    renderNavbarAuth();
});

[300, 800, 1500, 3000].forEach(ms => setTimeout(updateDashboardButtons, ms));