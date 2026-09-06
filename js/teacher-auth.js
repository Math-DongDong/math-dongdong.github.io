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
import { signInWithPopup, signOut, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

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

/**
 * 교사·관리자 드롭다운을 '화면 기준 배치(fixed)'로 열도록 설정합니다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────
 * 모바일 네비게이션 바에는 가로 스크롤을 위해 overflow-x: auto 가 걸려
 * 있습니다. CSS에서 overflow가 visible이 아닌 요소는 잘라내기 상자가 되고,
 * 부트스트랩 드롭다운은 position: absolute 로 뜨므로 그 안에 갇혀 잘립니다.
 *
 * ── 왜 CSS만으로는 안 되는가 ─────────────────────────────────────────
 * CSS로 position: fixed 를 주면 잘리는 건 해결되지만, 이 네비게이션 바는
 * 화면에 고정된 것이 아니라 페이지와 함께 스크롤됩니다.
 * 드롭다운만 화면에 못 박히면 스크롤할 때 버튼과 떨어져 허공에 남습니다.
 *
 * ── 그래서 이렇게 합니다 ─────────────────────────────────────────────
 * 위치 계산은 부트스트랩이 쓰는 Popper에게 그대로 맡기고,
 * 배치 방식(strategy)만 'fixed' 로 바꿉니다.
 * Popper는 fixed 상태에서도 버튼의 화면상 위치를 매 스크롤마다 다시 계산해
 * 따라다닙니다. 잘리지도 않고 떨어지지도 않습니다.
 *
 * ※ navbar.css 에서 이 드롭다운의 top·left·transform 을 건드리면
 *   Popper의 계산을 덮어써 다시 허공에 뜹니다. 폭과 크기만 다듬어 주세요.
 */
function initAuthDropdown() {
    const toggle = document.getElementById('authDropdown');
    if (!toggle || typeof bootstrap === 'undefined' || !bootstrap.Dropdown) return;

    // 부트스트랩은 첫 클릭 때 기본 설정으로 인스턴스를 만듭니다.
    // 그 전에 우리가 먼저 만들어야 설정이 반영됩니다.
    bootstrap.Dropdown.getOrCreateInstance(toggle, {
        popperConfig: (defaultConfig) => ({
            ...defaultConfig,
            strategy: 'fixed',
            modifiers: [
                ...(defaultConfig.modifiers || []),
                // 네비게이션 바가 아니라 '화면'을 경계로 삼습니다.
                // 기본값(clippingParents)이면 스크롤 상자가 경계가 되어
                // 다시 좁은 영역에 갇힙니다.
                { name: 'preventOverflow', options: { boundary: 'viewport', padding: 8 } },
                { name: 'flip', options: { boundary: 'viewport', padding: 8 } }
            ]
        })
    });
}

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
                        <input type="text" class="form-control" id="teacherSchoolInput" placeholder="예: 동동중학교" maxlength="30">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold" for="teacherNameInput">이름</label>
                        <input type="text" class="form-control" id="teacherNameInput" placeholder="예: 홍길동" maxlength="20">
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

function modalFor(el) { return bootstrap.Modal.getOrCreateInstance(el); }

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
        note.innerHTML = '학교명이 <b>관리자</b>로 되어 있으면 학생 화면의 학교 목록에 나타나지 않습니다.<br>' +
            '실제 학교명과 이름으로 바꾸면 학생이 선택할 수 있습니다.';
    }

    document.getElementById('btnSaveInfo').onclick = async () => {
        const school = schoolInput.value.trim();
        const name = isAdminUser ? nameInput.value.trim() : (docData.name || '');
        const fail = (m) => { errEl.textContent = m; errEl.style.display = 'block'; };

        if (!SCHOOL_RE.test(school) && school !== '관리자') return fail("학교명은 한글·영문·숫자 2~30자로 입력해주세요.");
        if (isAdminUser && !NAME_RE.test(name)) return fail("이름은 한글·영문 2~20자로 입력해주세요.");

        try {
            const payload = isAdminUser ? { school, name } : { school };
            await setDoc(doc(db, "teachers", user.uid), payload, { merge: true });
            window.currentTeacherSchool = school;
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
            fail("저장 중 오류가 발생했습니다.");
        }
    };

    document.getElementById('btnDeleteAccount').onclick = async () => {
        if (!confirm("정말 탈퇴하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;
        try {
            await deleteDoc(doc(db, "teacher_directory", user.uid)).catch(() => { });
            await deleteDoc(doc(db, "teachers", user.uid));
            await deleteUser(user);
            alert("탈퇴가 완료되었습니다.");
            bsModal.hide();
        } catch (e) {
            console.error(e);
            alert("탈퇴 중 오류가 발생했습니다. (다시 로그인한 후 시도해주세요)");
        }
    };

    bsModal.show();
}

function handleAdminAlert() {
    const today = new Date().toLocaleDateString();
    if (localStorage.getItem('hideAdminAlertDate') === today) return;

    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js").then(async ({ collection, query, where, getDocs }) => {
        try {
            const snapshot = await getDocs(query(collection(db, "teachers"), where("status", "==", "pending")));
            if (snapshot.empty) return;

            ensureAdminAlertModalDOM();
            document.getElementById('adminAlertMessage').innerHTML =
                `현재 <strong>${snapshot.size}건</strong>의 교사 가입 승인 요청이 대기 중입니다.`;

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
                if (code === 'auth/popup-blocked') {
                    alert("팝업이 차단되었습니다. 브라우저의 팝업 차단 설정을 해제한 뒤 다시 시도해주세요.");
                } else if (code === 'auth/unauthorized-domain') {
                    alert("이 도메인은 Firebase에 등록되지 않았습니다.\n\nFirebase Console → Authentication → Settings → 승인된 도메인에 현재 도메인을 추가해주세요.");
                } else if (code === 'auth/operation-not-allowed') {
                    alert("Google 로그인이 비활성화 상태입니다.");
                } else {
                    alert(`로그인에 실패했습니다.\n오류 코드: ${code}`);
                }
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
                        <li><a class="dropdown-item" href="#" id="btnEditInfo"><i class="bi bi-person-fill-gear me-2"></i>정보수정 (학교명)</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" id="btnTeacherLogout"><i class="bi bi-box-arrow-right me-2"></i>로그아웃</a></li>
                    </ul>
                </div>`;
            setTimeout(() => {
                document.getElementById('btnGoAdmin').onclick = (e) => { e.preventDefault(); goToAdminPage(); };
                document.getElementById('btnGoStudents').onclick = (e) => { e.preventDefault(); goToStudentManagerPage(); };
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
                        <li><a class="dropdown-item" href="#" id="btnEditInfo"><i class="bi bi-person-fill-gear me-2"></i>정보수정</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" id="btnTeacherLogout"><i class="bi bi-box-arrow-right me-2"></i>로그아웃</a></li>
                    </ul>
                </div>`;
            setTimeout(() => {
                document.getElementById('btnGoStudents').onclick = (e) => { e.preventDefault(); goToStudentManagerPage(); };
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
        // 버튼이 새로 그려졌으므로 드롭다운 설정을 다시 걸어줍니다
        setTimeout(initAuthDropdown, 0);
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