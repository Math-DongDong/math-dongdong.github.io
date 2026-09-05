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
// - 방 코드: 페이지(게임)마다 다르므로 경로별로 따로 저장
// - 닉네임: 같은 학생이 다른 게임에서도 쓰므로 전체 공용으로 저장
// - 저장 시점은 각 페이지가 "입장 성공" 지점에서 rememberEntrance()를 호출해 결정
//   (실패한 입력까지 저장되지 않도록 자동 저장하지 않습니다)
// - localStorage가 막힌 환경(사생활 보호 모드 등)에서는 조용히 무시됩니다.
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
        // 저장값도 입력값과 같은 규칙으로 정제해서 돌려줍니다 (조작·손상 대비)
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
// 0.6 자동 닉네임 생성기 (형용사 + 동물명/캐릭터)
// =====================================================================
// 형용사 60종 (길이 2~4자)
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

// 동물 및 친근한 캐릭터 60종 (길이 1~4자)
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

/** 랜덤 닉네임 생성 (형용사 + 공백 + 동물/캐릭터) - 최대 길이 9자로 10자 이내 보장 */
export function generateRandomNickname() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adj} ${animal}`;
}
if (typeof window !== 'undefined') {
    window.generateRandomNickname = generateRandomNickname;
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

    // [수정] X 버튼·ESC·배경 클릭으로 닫는 경로는 handleConfirm/handleCancel을 거치지 않으므로,
    // 모든 닫힘 경로를 한 번에 커버하도록 hide.bs.modal에 포커스 해제를 걸어둡니다.
    // (bootstrap이 aria-hidden을 적용하기 전에 먼저 실행되어야 하므로 hide.bs.modal 단계에서 처리)
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

        // [수정] 부트스트랩이 모달에 aria-hidden을 거는 순간 방금 클릭한 버튼이
        // 여전히 포커스를 쥐고 있으면 "포커스가 숨겨진 조상 안에 있다"는 접근성 경고가 뜹니다.
        // hide() 호출 직전에 포커스를 명시적으로 빼서 이 경합을 없앱니다.
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

    // [수정] 캐러셀 이전/다음 버튼이 포커스를 쥔 채 닫힐 때 나는 aria-hidden 경고 방지
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
    if (window.isApprovedTeacher || window.isAdmin) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
    }

    await customAlert("접근 권한 없음", "교사 로그인을 완료하고 승인된 선생님만 이용할 수 있습니다.");
    if (typeof onFailure === 'function') onFailure();
    return false;
}

// ⚠️ 기존의 접속 코드 방식은 제거되고 구글 로그인 기반의 교사 인증으로 대체되었습니다.

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
        // [추가] 지난 접속 정보 자동 입력 (끄고 싶은 페이지는 false 전달)
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
            <div class="text-center text-muted small mb-3" id="roomEntranceHint" style="min-height: 1.2rem;"></div>
            <button id="btnJoinRoom" class="btn btn-primary btn-lg w-100 mb-2 fw-bold"
                style="background:#0d6efd; border:none;">${joinBtnText}</button>
            ${guideBtnHtml}
            <button id="btnOpenDashboard" class="btn btn-dark btn-lg w-100 fw-bold" style="display: none;">${dashBtnText}</button>
        </div>
    `;

    const roomInput = target.querySelector('#roomCodeInput');
    const roomHint = target.querySelector('#roomEntranceHint');
    const joinBtn = target.querySelector('#btnJoinRoom');
    const guideBtn = target.querySelector('#btnShowGuide');
    const dashBtn = target.querySelector('#btnOpenDashboard');

    // [추가] 선생님/관리자 권한 확인 후 대시보드 버튼 보이기 (인증 상태 변화 이벤트도 즉시 반영)
    const updateDashVisibility = () => {
        if (window.isApprovedTeacher || window.isAdmin) {
            dashBtn.style.display = 'block';
        } else {
            dashBtn.style.display = 'none';
        }
    };
    updateDashVisibility();
    window.addEventListener('teacherAuthChanged', updateDashVisibility);

    // [추가] 지난 접속 정보 자동 입력
    // 공용 기기(학급 태블릿)를 여러 학생이 돌려 쓸 수 있으므로 지우기 링크 제공
    if (rememberLastEntry) {
        const saved = loadRememberedEntrance();
        if (saved.room) roomInput.value = saved.room;
        if (saved.room) {
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

        // 동일 세션 내에서 같은 방 재접속 시 일관된 닉네임 유지 (새로고침/재입장 편의)
        let nickname = sessionStorage.getItem(`roomEntrance:autoNick:${roomCode}`);
        if (!nickname) {
            nickname = generateRandomNickname();
            try {
                sessionStorage.setItem(`roomEntrance:autoNick:${roomCode}`, nickname);
            } catch (e) { }
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
        if (e.key === 'Enter') triggerJoin();
    });
}