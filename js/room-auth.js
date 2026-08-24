/**
 * room-auth.js
 * 방 입장 카드 UI 렌더링, 공통 모달 및 교사 접속 코드 인증 공통 모듈
 */

import { ADMIN_ACCESS_CODE } from './access-code.js';

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
}

let customModalInstance = null;

export function showCustomModal(title, message, isPrompt = false, isPassword = false, isConfirm = false) {
    ensureModalDOM();
    return new Promise((resolve) => {
        const modalEl = document.getElementById('customModal');
        if (!customModalInstance) {
            customModalInstance = new bootstrap.Modal(modalEl);
        }
        document.getElementById('customModalTitle').innerHTML = title;
        let bodyHtml = `<p class="mb-0 fs-5">${message}</p>`;
        if (isPrompt) {
            const type = isPassword ? 'password' : 'text';
            bodyHtml += `<input type="${type}" class="form-control form-control-lg mt-3 text-center fw-bold" id="customModalInput">`;
        }
        document.getElementById('customModalBody').innerHTML = bodyHtml;
        const btnCancel = document.getElementById('customModalCancel');
        const btnConfirm = document.getElementById('customModalConfirm');

        if (isPrompt || isConfirm) btnCancel.classList.remove('d-none');
        else btnCancel.classList.add('d-none');

        let resolveValue = null;
        const handleConfirm = () => {
            resolveValue = isPrompt ? (document.getElementById('customModalInput')?.value || "") : true;
            customModalInstance.hide();
        };
        const handleCancel = () => {
            resolveValue = isConfirm ? false : null;
            customModalInstance.hide();
        };
        const handleHidden = () => {
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            resolve(resolveValue);
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

export const customAlert = (t, m) => showCustomModal(t, m, false);
export const customPrompt = (t, m, pw = false) => showCustomModal(t, m, true, pw);
export const customConfirm = (t, m) => showCustomModal(t, m, false, false, true);

// =====================================================================
// 2. 관리자 접속 코드 인증
// =====================================================================
export async function verifyAdminAccess(onSuccess, onFailure) {
    const code = await customPrompt("선생님 대시보드", "접속 코드를 입력하세요.", true);
    if (code === null) return false;
    if (code === ADMIN_ACCESS_CODE) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
    } else {
        await customAlert("접속 실패", "접속 코드가 일치하지 않습니다.");
        if (typeof onFailure === 'function') onFailure();
        return false;
    }
}

// =====================================================================
// 3. 방 입장 카드 컴포넌트 렌더링
// =====================================================================
export function renderRoomEntrance(container, options = {}) {
    const target = typeof container === 'string' ? document.getElementById(container) : container;
    if (!target) return;

    const {
        title = "🧑‍🎓 게임 입장하기",
        roomCodePlaceholder = "방 코드 4자리 입력",
        nicknamePlaceholder = "닉네임 (예: 동동)",
        joinBtnText = "🎮 방 입장하기",
        dashBtnText = "대시보드 열기",
        onJoin = null,
        onAdminSuccess = null,
        onAdminFailure = null
    } = options;

    target.innerHTML = `
        <div class="card shadow-sm p-4 mb-4 border-0 rounded-4 bg-white" id="room-entrance-card">
            <h5 class="text-center fw-bold mb-4">${title}</h5>
            <input type="text" id="roomCodeInput"
                class="form-control form-control-lg text-center mb-3 bg-light border-0 fw-bold"
                placeholder="${roomCodePlaceholder}" maxlength="4"
                style="text-transform: uppercase;">
            <input type="text" id="playerNameInput"
                class="form-control form-control-lg text-center mb-4 bg-light border-0 fw-bold"
                placeholder="${nicknamePlaceholder}" maxlength="10">
            <button id="btnJoinRoom" class="btn btn-primary btn-lg w-100 mb-2 fw-bold"
                style="background:#0d6efd; border:none;">${joinBtnText}</button>
            <button id="btnOpenDashboard" class="btn btn-dark btn-lg w-100 fw-bold">${dashBtnText}</button>
        </div>
    `;

    const roomInput = target.querySelector('#roomCodeInput');
    const nameInput = target.querySelector('#playerNameInput');
    const joinBtn = target.querySelector('#btnJoinRoom');
    const dashBtn = target.querySelector('#btnOpenDashboard');

    roomInput.addEventListener('input', () => {
        roomInput.value = roomInput.value.slice(0, 4).toUpperCase();
    });

    const triggerJoin = async () => {
        const roomCode = roomInput.value.trim().toUpperCase();
        const nickname = nameInput.value.trim();

        if (!roomCode || roomCode.length !== 4) {
            roomInput.classList.add('shake');
            setTimeout(() => roomInput.classList.remove('shake'), 400);
            await customAlert("알림", "올바른 방 코드 4자리를 입력해주세요.");
            return;
        }

        if (!nickname) {
            nameInput.classList.add('shake');
            setTimeout(() => nameInput.classList.remove('shake'), 400);
            await customAlert("알림", "닉네임을 입력해주세요.");
            return;
        }

        if (typeof onJoin === 'function') {
            onJoin(roomCode, nickname);
        }
    };

    joinBtn.addEventListener('click', triggerJoin);
    dashBtn.addEventListener('click', () => verifyAdminAccess(onAdminSuccess, onAdminFailure));

    roomInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') nameInput.focus();
    });
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerJoin();
    });
}
