/**
 * room-auth.js
 * 방 입장 카드 UI 렌더링, 공통 모달 및 교사 접속 코드 인증 공통 모듈
 *
 * [개선 사항]
 *  - escapeHtml / isValidRtdbKey / sanitizeKey 유틸 추가 (XSS 및 Firebase 키 오류 방지)
 *  - 모달 호출 직렬화(큐): 비동기 리스너에서 동시에 알림이 떠도 서로 밀어내지 않음
 *  - 닉네임 입력 시 Firebase 키로 쓸 수 없는 문자 자동 제거
 *  - 입장 버튼 중복 클릭(더블 탭) 방지
 *  - 접속 코드 오입력 시 짧은 지연 (연타 시도 억제)
 *  - [추가] 게임방법 안내 슬라이드 모달 (showGuideModal)
 *    · renderRoomEntrance 옵션에 guideSlides 배열을 넘기면
 *      [방 입장하기]와 [대시보드 열기] 사이에 게임방법 버튼이 자동 생성됩니다.
 *    · guideSlides를 넘기지 않으면 버튼이 렌더링되지 않으므로,
 *      게임방법이 필요 없는 페이지는 기존 호출 코드를 그대로 쓰면 됩니다.
 */

import { ADMIN_ACCESS_CODE } from './access-code.js';

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

    // Bootstrap이 아직 로드되지 않은 경우의 안전장치
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

        const handleConfirm = () => {
            if (settled) return;
            settled = true;
            resolveValue = isPrompt ? (document.getElementById('customModalInput')?.value ?? "") : true;
            customModalInstance.hide();
        };
        const handleCancel = () => {
            if (settled) return;
            settled = true;
            resolveValue = isConfirm ? false : null;
            customModalInstance.hide();
        };
        const handleHidden = () => {
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
            modalEl.removeEventListener('hidden.bs.modal', handleHidden);
            // 닫힘 애니메이션이 끝난 뒤 다음 모달이 열리도록 한 틱 대기
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
/**
 * 슬라이드 형식:
 *   { src: 이미지 경로, alt: 대체 텍스트, title: 제목, desc: 설명 }
 * src는 호출하는 페이지 기준 상대 경로를 그대로 넘기면 됩니다.
 * title/desc는 개발자가 작성한 문자열만 넘기세요. (학생 입력값이면 escapeHtml 필수)
 */
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
}

let guideModalInstance = null;

export function showGuideModal(slides, title = "게임 방법") {
    if (!Array.isArray(slides) || slides.length === 0) return;
    ensureGuideStyle();

    // Bootstrap이 없으면 슬라이드를 띄울 수 없으므로 조용히 무시
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

    // 매번 새로 그려서 항상 첫 번째 슬라이드부터 시작 (자동 넘김 없음, 학생이 직접 넘김)
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
// 3. 관리자 접속 코드 인증
// =====================================================================
let adminFailCount = 0;

export async function verifyAdminAccess(onSuccess, onFailure) {
    const code = await customPrompt("선생님 대시보드", "접속 코드를 입력하세요.", true);
    if (code === null) return false;

    if (code === ADMIN_ACCESS_CODE) {
        adminFailCount = 0;
        if (typeof onSuccess === 'function') onSuccess();
        return true;
    }

    // 연타 시도를 조금이라도 늦추기 위한 지연 (근본 대책은 아님, 아래 주석 참고)
    adminFailCount++;
    await new Promise(r => setTimeout(r, Math.min(2000, adminFailCount * 400)));

    await customAlert("접속 실패", "접속 코드가 일치하지 않습니다.");
    if (typeof onFailure === 'function') onFailure();
    return false;
}

// ⚠️ 접속 코드는 클라이언트 번들에 포함되므로 개발자 도구로 확인 가능합니다.
//    "장난 방지" 수준의 잠금장치일 뿐, 진짜 권한 분리가 필요하면
//    Firebase Authentication + Database Rules로 옮겨야 합니다.

// =====================================================================
// 4. 방 입장 카드 컴포넌트 렌더링
// =====================================================================
export function renderRoomEntrance(container, options = {}) {
    const target = typeof container === 'string' ? document.getElementById(container) : container;
    if (!target) return;

    ensureShakeStyle();

    const {
        title = "🧑‍🎓 게임 입장하기",
        roomCodePlaceholder = "방 코드 4자리 입력",
        nicknamePlaceholder = "닉네임 (예: 동동)",
        joinBtnText = "🎮 방 입장하기",
        dashBtnText = "대시보드 열기",
        // [추가] 게임방법 슬라이드: 배열을 넘기면 버튼이 생기고, 없으면 기존과 동일
        guideSlides = null,
        guideBtnText = "📖 게임방법 보기",
        guideTitle = "게임 방법",
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
            <input type="text" id="playerNameInput"
                class="form-control form-control-lg text-center mb-2 bg-light border-0 fw-bold"
                placeholder="${nicknamePlaceholder}" maxlength="10"
                autocomplete="off" spellcheck="false">
            <div class="text-center text-muted small mb-3" id="nicknameHint" style="min-height: 1.2rem;"></div>
            <button id="btnJoinRoom" class="btn btn-primary btn-lg w-100 mb-2 fw-bold"
                style="background:#0d6efd; border:none;">${joinBtnText}</button>
            ${guideBtnHtml}
            <button id="btnOpenDashboard" class="btn btn-dark btn-lg w-100 fw-bold">${dashBtnText}</button>
        </div>
    `;

    const roomInput = target.querySelector('#roomCodeInput');
    const nameInput = target.querySelector('#playerNameInput');
    const nameHint = target.querySelector('#nicknameHint');
    const joinBtn = target.querySelector('#btnJoinRoom');
    const guideBtn = target.querySelector('#btnShowGuide');
    const dashBtn = target.querySelector('#btnOpenDashboard');

    roomInput.addEventListener('input', () => {
        roomInput.value = roomInput.value.replace(/\s/g, '').slice(0, 4).toUpperCase();
    });

    // 닉네임에서 DB 키로 쓸 수 없는 문자를 즉시 제거하고 안내
    nameInput.addEventListener('input', () => {
        const before = nameInput.value;
        const after = sanitizeKey(before);
        if (before !== after) {
            nameInput.value = after;
            nameHint.textContent = '닉네임에 . # $ [ ] / 는 쓸 수 없어요.';
        } else {
            nameHint.textContent = '';
        }
    });

    let joining = false;

    const triggerJoin = async () => {
        if (joining) return;

        const roomCode = roomInput.value.trim().toUpperCase();
        const nickname = sanitizeKey(nameInput.value).trim();

        if (!roomCode || roomCode.length !== 4) {
            roomInput.classList.add('shake');
            setTimeout(() => roomInput.classList.remove('shake'), 400);
            await customAlert("알림", "올바른 방 코드 4자리를 입력해주세요.");
            return;
        }

        if (!nickname || !isValidRtdbKey(nickname)) {
            nameInput.classList.add('shake');
            setTimeout(() => nameInput.classList.remove('shake'), 400);
            await customAlert("알림", "사용할 수 있는 닉네임을 입력해주세요.");
            return;
        }

        if (typeof onJoin !== 'function') return;

        joining = true;
        joinBtn.disabled = true;
        dashBtn.disabled = true;
        if (guideBtn) guideBtn.disabled = true;
        const originalText = joinBtn.innerHTML;
        joinBtn.innerHTML = '입장하는 중...';

        try {
            await onJoin(roomCode, nickname);
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
        if (e.key === 'Enter') nameInput.focus();
    });
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') triggerJoin();
    });
}