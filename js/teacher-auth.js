import { auth, googleProvider, db } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const ADMIN_EMAIL = 'jjes0107@gmail.com';

window.isApprovedTeacher = false;
window.isAdmin = false;
window.pendingTeacherRequests = 0; // For admin alert

export function updateDashboardButtons() {
    const dashBtns = document.querySelectorAll('#btnOpenDashboard, #btn-admin-dash');
    dashBtns.forEach(btn => {
        if (window.isApprovedTeacher || window.isAdmin) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    });
}
window.updateDashboardButtons = updateDashboardButtons;

// Custom Modal setup for Teacher Registration
function ensureTeacherModalDOM() {
    if (document.getElementById('teacherRegModal')) return;
    const modalHtml = `
    <div class="modal fade" id="teacherRegModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold">교사 정보 등록</h5>
                </div>
                <div class="modal-body pb-0">
                    <div class="alert alert-danger fw-bold d-flex align-items-center" role="alert">
                        <i class="bi bi-exclamation-triangle-fill fs-5 me-2"></i>
                        <div>학교정보를 등록하세요.</div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">학교명</label>
                        <input type="text" class="form-control" id="teacherSchoolInput" placeholder="예: 동동중학교">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">이름</label>
                        <input type="text" class="form-control" id="teacherNameInput" placeholder="예: 홍길동">
                    </div>
                </div>
                <div class="modal-footer border-0 pt-3">
                    <button type="button" class="btn btn-secondary rounded-3 px-4" id="btnCancelReg">취소 (로그아웃)</button>
                    <button type="button" class="btn btn-primary rounded-3 px-4" id="btnSubmitReg">등록 신청</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Custom Modal setup for Teacher Info Edit/Delete
function ensureTeacherInfoModalDOM() {
    if (document.getElementById('teacherInfoModal')) return;
    const modalHtml = `
    <div class="modal fade" id="teacherInfoModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                    <h5 class="modal-title fw-bold">교사 정보 수정</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pb-0">
                    <div class="mb-3">
                        <label class="form-label fw-bold">학교명</label>
                        <input type="text" class="form-control" id="editTeacherSchoolInput">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">이름</label>
                        <input type="text" class="form-control" id="editTeacherNameInput" readonly>
                        <small class="text-muted">이름은 변경할 수 없습니다.</small>
                    </div>
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
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Admin Alert Modal
function ensureAdminAlertModalDOM() {
    if (document.getElementById('adminAlertModal')) return;
    const modalHtml = `
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
                        <label class="form-check-label text-muted" for="chkHideAdminAlert">
                            오늘 하루 이 창 안 보기
                        </label>
                    </div>
                </div>
                <div class="modal-footer border-0 pt-0">
                    <button type="button" class="btn btn-secondary rounded-3" data-bs-dismiss="modal">닫기</button>
                    <button type="button" class="btn btn-primary rounded-3" id="btnGoToAdmin">관리 페이지로 이동</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function showRegistrationModal(user) {
    ensureTeacherModalDOM();
    const modalEl = document.getElementById('teacherRegModal');
    const bsModal = new bootstrap.Modal(modalEl);
    
    document.getElementById('teacherSchoolInput').value = '';
    document.getElementById('teacherNameInput').value = '';
    
    return new Promise((resolve) => {
        document.getElementById('btnSubmitReg').onclick = async () => {
            const school = document.getElementById('teacherSchoolInput').value.trim();
            const name = document.getElementById('teacherNameInput').value.trim();
            
            if (!school || !name) {
                alert("학교명과 이름을 모두 입력해주세요.");
                return;
            }
            
            try {
                await setDoc(doc(db, "teachers", user.uid), {
                    email: user.email,
                    school: school,
                    name: name,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                });
                bsModal.hide();
                resolve(true);
            } catch (err) {
                console.error(err);
                alert("등록 중 오류가 발생했습니다.");
            }
        };
        
        document.getElementById('btnCancelReg').onclick = async () => {
            try {
                await deleteUser(user);
            } catch(e) {
                await signOut(auth);
            }
            bsModal.hide();
            resolve(false);
        };
        
        bsModal.show();
    });
}

async function showTeacherInfoModal(user, docData) {
    ensureTeacherInfoModalDOM();
    const modalEl = document.getElementById('teacherInfoModal');
    const bsModal = new bootstrap.Modal(modalEl);
    
    document.getElementById('editTeacherSchoolInput').value = docData.school || '';
    document.getElementById('editTeacherNameInput').value = docData.name || '';
    
    document.getElementById('btnSaveInfo').onclick = async () => {
        const school = document.getElementById('editTeacherSchoolInput').value.trim();
        if (!school) {
            alert("학교명을 입력해주세요.");
            return;
        }
        try {
            await setDoc(doc(db, "teachers", user.uid), { school: school }, { merge: true });
            alert("저장되었습니다.");
            bsModal.hide();
            renderNavbarAuth(); // Refresh
        } catch (e) {
            console.error(e);
            alert("저장 중 오류가 발생했습니다.");
        }
    };
    
    document.getElementById('btnDeleteAccount').onclick = async () => {
        if (confirm("정말 탈퇴하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) {
            try {
                await deleteDoc(doc(db, "teachers", user.uid));
                await deleteUser(user);
                alert("탈퇴가 완료되었습니다.");
                bsModal.hide();
            } catch (e) {
                console.error(e);
                alert("탈퇴 중 오류가 발생했습니다. (다시 로그인한 후 시도해주세요)");
            }
        }
    };
    
    bsModal.show();
}

function handleAdminAlert() {
    const today = new Date().toLocaleDateString();
    const hideAlertDate = localStorage.getItem('hideAdminAlertDate');
    
    if (hideAlertDate === today) return; // Hidden for today
    
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js").then(async ({ collection, query, where, getDocs }) => {
        const q = query(collection(db, "teachers"), where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            ensureAdminAlertModalDOM();
            document.getElementById('adminAlertMessage').innerHTML = `현재 <strong>${snapshot.size}건</strong>의 교사 가입 승인 요청이 대기 중입니다.`;
            
            const modalEl = document.getElementById('adminAlertModal');
            const bsModal = new bootstrap.Modal(modalEl);
            
            document.getElementById('btnGoToAdmin').onclick = () => {
                bsModal.hide();
                goToAdminPage();
            };
            
            modalEl.addEventListener('hidden.bs.modal', () => {
                if (document.getElementById('chkHideAdminAlert').checked) {
                    localStorage.setItem('hideAdminAlertDate', new Date().toLocaleDateString());
                }
            });
            
            bsModal.show();
        }
    });
}

function getRootPathForAuth() {
    const normalizedPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/');
    pathSegments.pop(); // remove filename
    const pagesIndex = pathSegments.lastIndexOf('pages');
    if (pagesIndex !== -1) {
        const depth = pathSegments.length - pagesIndex;
        return '../'.repeat(depth);
    }
    return './';
}

function goToAdminPage() {
    const rootPath = getRootPathForAuth();
    window.location.href = `${rootPath}pages/admin/account_manager.html`;
}

function notifyAuthChanged() {
    window.dispatchEvent(new CustomEvent('teacherAuthChanged', {
        detail: {
            isApproved: window.isApprovedTeacher,
            isAdmin: window.isAdmin
        }
    }));
    updateDashboardButtons();
}

function renderNavbarAuth(retryCount = 0) {
    const container = document.getElementById('teacher-auth-container');
    if (!container) {
        if (retryCount < 30) {
            setTimeout(() => renderNavbarAuth(retryCount + 1), 100);
        }
        return;
    }
    
    const user = auth.currentUser;
    
    if (!user) {
        window.isApprovedTeacher = false;
        window.isAdmin = false;
        notifyAuthChanged();
        container.innerHTML = `<button class="btn btn-outline-primary btn-sm fw-bold shadow-sm" id="btnTeacherLogin"><i class="bi bi-google me-1"></i> 교사 로그인</button>`;
        document.getElementById('btnTeacherLogin').onclick = () => {
            signInWithPopup(auth, googleProvider).catch(err => {
                console.error("Login Failed:", err);
                const code = err.code || '';
                // 사용자가 팝업을 직접 닫은 경우 → 알림 없이 조용히 종료
                if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;

                if (code === 'auth/popup-blocked') {
                    alert("팝업이 차단되었습니다. 브라우저의 팝업 차단 설정을 해제한 뒤 다시 시도해주세요.");
                } else if (code === 'auth/unauthorized-domain') {
                    alert("이 도메인은 Firebase에 등록되지 않았습니다.\n\nFirebase Console → Authentication → Settings → 승인된 도메인에 현재 도메인을 추가해주세요.");
                } else if (code === 'auth/operation-not-allowed') {
                    alert("Google 로그인이 비활성화 상태입니다.\n\nFirebase Console → Authentication → Sign-in method → Google을 활성화해주세요.");
                } else {
                    alert(`로그인에 실패했습니다.\n오류 코드: ${code}\n${err.message}`);
                }
            });
        };
        return;
    }
    
    // User is logged in, check Firestore
    getDoc(doc(db, "teachers", user.uid)).then(docSnap => {
        if (!docSnap.exists()) {
            if (user.email === ADMIN_EMAIL) {
                // Admin doesn't need to register as a teacher to get access, but let's register them automatically
                 setDoc(doc(db, "teachers", user.uid), {
                    email: user.email,
                    school: '관리자',
                    name: '관리자',
                    status: 'approved',
                    createdAt: new Date().toISOString()
                }).then(() => renderNavbarAuth());
                return;
            }
            
            // Show registration modal
            showRegistrationModal(user).then(registered => {
                if (registered) renderNavbarAuth();
            });
            return;
        }
        
        const data = docSnap.data();
        let btnHtml = '';
        
        if (user.email === ADMIN_EMAIL) {
            window.isAdmin = true;
            window.isApprovedTeacher = true; // Admin is also approved
            notifyAuthChanged();
            btnHtml = `
                <div class="dropdown">
                    <button class="btn btn-primary btn-sm fw-bold dropdown-toggle shadow-sm" type="button" id="authDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                        관리자 접속
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0" aria-labelledby="authDropdown">
                        <li><a class="dropdown-item" href="#" id="btnGoAdmin"><i class="bi bi-gear-fill me-2"></i>계정 관리</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" id="btnTeacherLogout"><i class="bi bi-box-arrow-right me-2"></i>로그아웃</a></li>
                    </ul>
                </div>
            `;
            
            setTimeout(() => {
                document.getElementById('btnGoAdmin').onclick = (e) => {
                    e.preventDefault();
                    goToAdminPage();
                };
                document.getElementById('btnTeacherLogout').onclick = (e) => {
                    e.preventDefault();
                    signOut(auth);
                };
            }, 0);
            
            // Check pending requests
            handleAdminAlert();
            
        } else if (data.status === 'pending') {
            window.isApprovedTeacher = false;
            notifyAuthChanged();
            btnHtml = `
                <button class="btn btn-warning btn-sm fw-bold me-2 shadow-sm" disabled>승인 대기 중</button>
                <button class="btn btn-outline-danger btn-sm fw-bold shadow-sm" id="btnTeacherLogout">로그아웃</button>
            `;
            setTimeout(() => {
                document.getElementById('btnTeacherLogout').onclick = () => signOut(auth);
            }, 0);
        } else if (data.status === 'approved') {
            window.isApprovedTeacher = true;
            notifyAuthChanged();
            btnHtml = `
                <div class="dropdown">
                    <button class="btn btn-outline-primary btn-sm fw-bold dropdown-toggle shadow-sm" type="button" id="authDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                        ${data.name} 선생님
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0" aria-labelledby="authDropdown">
                        <li><a class="dropdown-item" href="#" id="btnEditInfo"><i class="bi bi-person-fill-gear me-2"></i>정보수정</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" id="btnTeacherLogout"><i class="bi bi-box-arrow-right me-2"></i>로그아웃</a></li>
                    </ul>
                </div>
            `;
            setTimeout(() => {
                document.getElementById('btnEditInfo').onclick = (e) => {
                    e.preventDefault();
                    showTeacherInfoModal(user, data);
                };
                document.getElementById('btnTeacherLogout').onclick = (e) => {
                    e.preventDefault();
                    signOut(auth);
                };
            }, 0);
        }
        
        container.innerHTML = btnHtml;
        notifyAuthChanged();
        
    }).catch(err => {
        console.error("Error fetching teacher info:", err);
        container.innerHTML = `<button class="btn btn-danger btn-sm fw-bold" id="btnTeacherLogout">오류 발생 (로그아웃)</button>`;
        setTimeout(() => {
            document.getElementById('btnTeacherLogout').onclick = () => signOut(auth);
        }, 0);
    });
}

// Watch auth state
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.isApprovedTeacher = false;
        window.isAdmin = false;
        notifyAuthChanged();
    }
    renderNavbarAuth();
});

// Periodic dashboard button check for dynamically mounted rooms
[300, 800, 1500, 3000].forEach(ms => setTimeout(updateDashboardButtons, ms));
