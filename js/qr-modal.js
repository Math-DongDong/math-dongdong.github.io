/**
 * qr-modal.js
 * 대시보드용 "방 입장 QR" 플로팅 패널
 *
 *  - 방을 새로 만들거나 방 목록에서 방을 고르면 QR이 자동으로 뜹니다. (버튼 없음)
 *  - 제목 줄을 잡고 끌면 화면 어디로든 옮길 수 있습니다.
 *  - 오른쪽 아래 모서리를 끌면 QR 크기가 바뀝니다.
 *  - 위치와 크기는 브라우저에 저장되어 다음에도 그대로 복원됩니다.
 *  - 닫으면 오른쪽 아래에 작은 [QR] 버튼이 남아 언제든 다시 열 수 있습니다.
 *
 * 연결 방법: dashboard-header.js가 이 파일을 자동으로 불러옵니다.
 * (각 게임 페이지는 손댈 필요 없음)
 */

const PANEL_ID = 'roomQrPanel';
const CHIP_ID = 'roomQrChip';
const POS_KEY = 'roomQrPanel:pos';
const SIZE_KEY = 'roomQrPanel:size';
const QR_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

const MIN_SIZE = 140;
const MAX_SIZE = 620;

let qrSize = 240;
let currentUrl = '';
let currentCode = '';
let lastSeenCode = null;
let userClosed = false;      // 사용자가 직접 닫았는지 (같은 방에서는 다시 열지 않음)

// =====================================================================
// 유틸
// =====================================================================
function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

/** 대시보드의 방 선택 <select> 찾기 (페이지마다 id가 다를 수 있음) */
function roomSelectEl() {
    const custom = window.dashboardSelectId ? document.getElementById(window.dashboardSelectId) : null;
    return custom || document.getElementById('roomSelect') || document.getElementById('admin-room-select');
}

function currentRoomCode() {
    const sel = roomSelectEl();
    return sel && sel.value ? sel.value.trim().toUpperCase() : '';
}

/** 학생이 접속할 주소 (현재 페이지 + ?room=코드) */
function buildJoinUrl(roomCode) {
    try {
        const u = new URL(location.href);
        u.search = '';
        u.hash = '';
        u.searchParams.set('room', roomCode);
        return u.toString();
    } catch (e) {
        return location.href;
    }
}

function loadPos() {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) { return null; }
}
function savePos(left, top) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ left, top })); } catch (e) { }
}
function loadSize() {
    try {
        const v = parseInt(localStorage.getItem(SIZE_KEY), 10);
        return Number.isFinite(v) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, v)) : 240;
    } catch (e) { return 240; }
}
function saveSize(v) {
    try { localStorage.setItem(SIZE_KEY, String(Math.round(v))); } catch (e) { }
}

// =====================================================================
// 스타일
// =====================================================================
function ensureStyle() {
    if (document.getElementById('room-qr-style')) return;
    const style = document.createElement('style');
    style.id = 'room-qr-style';
    style.textContent = `
        .qr-panel {
            position: fixed;
            z-index: 1030;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
            overflow: hidden;
            max-width: calc(100vw - 16px);
        }
        .qr-panel-head {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.45rem 0.7rem;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            cursor: grab;
            user-select: none;
            touch-action: none;
        }
        .qr-panel-head.dragging { cursor: grabbing; }
        .qr-panel-head .qr-grip { color: #94a3b8; font-size: 1.05rem; line-height: 1; }
        .qr-panel-head .btn { --bs-btn-padding-y: .1rem; --bs-btn-padding-x: .45rem; }
        .qr-panel-body { padding: 0.7rem; text-align: center; }
        .qr-canvas-box {
            display: flex;
            justify-content: center;
            align-items: center;
            background: #ffffff;
            border-radius: 10px;
            min-height: 100px;
        }
        .qr-canvas-box canvas, .qr-canvas-box img { display: block; }
        .qr-room-code {
            font-weight: 800;
            letter-spacing: 0.25em;
            color: #0d6efd;
            margin-top: 0.45rem;
            line-height: 1.1;
        }
        .qr-hint { font-size: 0.72rem; color: #94a3b8; margin-top: 0.15rem; }
        .qr-resize {
            position: absolute;
            right: 2px;
            bottom: 2px;
            width: 20px;
            height: 20px;
            cursor: nwse-resize;
            touch-action: none;
            background:
                linear-gradient(135deg, transparent 0 55%, #cbd5e1 55% 62%, transparent 62% 70%, #cbd5e1 70% 77%, transparent 77%);
        }
        #${CHIP_ID} {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 1030;
        }
    `;
    document.head.appendChild(style);
}

// =====================================================================
// QR 라이브러리 로드
// =====================================================================
let qrLibPromise = null;
function loadQrLib() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = QR_LIB_URL;
        s.onload = () => resolve(window.QRCode);
        s.onerror = () => reject(new Error('QR 라이브러리를 불러오지 못했습니다.'));
        document.head.appendChild(s);
    });
    return qrLibPromise;
}

// =====================================================================
// 패널 생성 / 드래그 / 리사이즈
// =====================================================================
function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    ensureStyle();
    qrSize = loadSize();

    document.body.insertAdjacentHTML('beforeend', `
    <div class="qr-panel" id="${PANEL_ID}" role="dialog" aria-label="방 입장 QR 코드">
        <div class="qr-panel-head" id="qrPanelHead">
            <span class="qr-grip">⠿</span>
            <span class="fw-bold text-dark small">방 입장 QR</span>
            <div class="ms-auto">
                <button type="button" class="btn btn-sm btn-light border fw-bold" data-qr="close" title="닫기">✕</button>
            </div>
        </div>
        <div class="qr-panel-body">
            <div class="qr-canvas-box" id="qrCanvasBox">
                <span class="text-muted small">QR을 만드는 중...</span>
            </div>
            <div class="qr-room-code" id="qrRoomCode"></div>
            <div class="qr-hint">휴대폰 카메라로 스캔하면 방 코드가 자동 입력됩니다</div>
        </div>
        <div class="qr-resize" id="qrResizeHandle" title="끌어서 크기 조절"></div>
    </div>`);

    panel = document.getElementById(PANEL_ID);

    // 저장된 위치 복원 (없으면 우측 상단)
    const pos = loadPos();
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        panel.style.left = pos.left + 'px';
        panel.style.top = pos.top + 'px';
    } else {
        panel.style.left = Math.max(8, window.innerWidth - qrSize - 60) + 'px';
        panel.style.top = '90px';
    }

    setupDrag(panel);
    setupResize(panel);

    panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-qr="close"]')) closeQrPanel(true);
    });

    window.addEventListener('resize', () => clampIntoView(panel));
    requestAnimationFrame(() => clampIntoView(panel));

    return panel;
}

function clampIntoView(panel) {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const left = Math.min(Math.max(8, parseFloat(panel.style.left) || 0), maxLeft);
    const top = Math.min(Math.max(8, parseFloat(panel.style.top) || 0), maxTop);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
}

function setupDrag(panel) {
    const head = panel.querySelector('#qrPanelHead');
    let dragging = false, startX = 0, startY = 0, baseLeft = 0, baseTop = 0;

    head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        baseLeft = parseFloat(panel.style.left) || 0;
        baseTop = parseFloat(panel.style.top) || 0;
        head.classList.add('dragging');
        head.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    head.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        panel.style.left = Math.min(Math.max(8, baseLeft + (e.clientX - startX)), maxLeft) + 'px';
        panel.style.top = Math.min(Math.max(8, baseTop + (e.clientY - startY)), maxTop) + 'px';
    });

    const stop = (e) => {
        if (!dragging) return;
        dragging = false;
        head.classList.remove('dragging');
        if (head.hasPointerCapture(e.pointerId)) head.releasePointerCapture(e.pointerId);
        savePos(parseFloat(panel.style.left) || 0, parseFloat(panel.style.top) || 0);
    };
    head.addEventListener('pointerup', stop);
    head.addEventListener('pointercancel', stop);
}

/**
 * 오른쪽 아래 모서리를 끌어 크기 조절.
 * 끄는 동안에는 이미 그려진 캔버스를 CSS로 늘려 부드럽게 보여 주고,
 * 손을 뗀 뒤에 실제 크기로 QR을 다시 그립니다.
 */
function setupResize(panel) {
    const handle = panel.querySelector('#qrResizeHandle');
    const box = panel.querySelector('#qrCanvasBox');
    let resizing = false, startX = 0, startY = 0, baseSize = 0, previewSize = 0;

    const applyPreview = (size) => {
        const el = box.querySelector('canvas, img');
        if (el) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
        else { box.style.minHeight = size + 'px'; }
    };

    handle.addEventListener('pointerdown', (e) => {
        resizing = true;
        startX = e.clientX; startY = e.clientY;
        baseSize = qrSize;
        previewSize = qrSize;
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener('pointermove', (e) => {
        if (!resizing) return;
        const delta = Math.max(e.clientX - startX, e.clientY - startY);
        const limit = Math.min(MAX_SIZE, window.innerWidth - 60, window.innerHeight - 140);
        previewSize = Math.min(limit, Math.max(MIN_SIZE, baseSize + delta));
        applyPreview(previewSize);
    });

    const stop = async (e) => {
        if (!resizing) return;
        resizing = false;
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
        qrSize = previewSize;
        saveSize(qrSize);
        await renderQr();
        clampIntoView(panel);
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
}

// =====================================================================
// 닫았을 때 남는 작은 복귀 버튼
// =====================================================================
function showChip() {
    if (document.getElementById(CHIP_ID)) return;
    ensureStyle();
    document.body.insertAdjacentHTML('beforeend', `
        <button type="button" id="${CHIP_ID}" class="btn btn-dark btn-sm rounded-pill shadow fw-bold px-3 py-2">
            <i class="bi bi-qr-code"></i> QR 다시 보기
        </button>`);
    document.getElementById(CHIP_ID).addEventListener('click', () => {
        userClosed = false;
        openQrPanel();
    });
}

function hideChip() {
    document.getElementById(CHIP_ID)?.remove();
}

// =====================================================================
// QR 그리기
// =====================================================================
async function renderQr() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const box = panel.querySelector('#qrCanvasBox');
    const codeEl = panel.querySelector('#qrRoomCode');

    const roomCode = currentRoomCode();
    currentCode = roomCode;
    codeEl.style.fontSize = Math.max(1.05, qrSize / 190) + 'rem';
    box.style.minHeight = '';

    if (!roomCode) {
        currentUrl = '';
        box.innerHTML = '<span class="text-muted small px-3 py-4">방을 선택하면<br>QR 코드가 만들어집니다.</span>';
        codeEl.textContent = '';
        return;
    }

    currentUrl = buildJoinUrl(roomCode);
    codeEl.textContent = roomCode;

    if (location.protocol === 'file:') {
        box.innerHTML = '<span class="text-danger small px-3 py-4">로컬 파일(file://)에서는<br>QR로 접속할 수 없습니다.<br>웹 서버에 올린 뒤 사용하세요.</span>';
        return;
    }

    box.innerHTML = '<span class="text-muted small">QR을 만드는 중...</span>';
    try {
        const QRCodeLib = await loadQrLib();
        box.innerHTML = '';
        new QRCodeLib(box, {
            text: currentUrl,
            width: Math.round(qrSize),
            height: Math.round(qrSize),
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: QRCodeLib.CorrectLevel.M
        });
    } catch (err) {
        box.innerHTML = `<span class="text-muted small px-3 py-4">QR 이미지를 만들지 못했습니다.<br>아래 주소를 직접 알려주세요.<br><b class="text-dark">${escapeText(currentUrl)}</b></span>`;
    }
}

// =====================================================================
// 공개 API
// =====================================================================
export async function openQrPanel() {
    hideChip();
    ensurePanel();
    await renderQr();
    clampIntoView(document.getElementById(PANEL_ID));
}

export function closeQrPanel(byUser = false) {
    document.getElementById(PANEL_ID)?.remove();
    if (byUser) {
        userClosed = true;
        if (currentRoomCode()) showChip();
    } else {
        hideChip();
    }
}

export function refreshQrPanel() {
    if (document.getElementById(PANEL_ID)) renderQr();
}

// =====================================================================
// 방 선택 감시 — 새 방 생성 / 방 선택 시 자동으로 QR 표시
// (페이지마다 change 이벤트를 쏘는 방식이 달라, 값 자체를 주기적으로 확인합니다)
// =====================================================================
function syncWithRoomSelect() {
    const sel = roomSelectEl();
    if (!sel) return;

    const code = currentRoomCode();
    if (code === lastSeenCode) return;
    lastSeenCode = code;

    if (!code) {                       // 방 선택 해제
        userClosed = false;
        closeQrPanel(false);
        return;
    }

    userClosed = false;                // 방이 바뀌면 다시 보여 줍니다
    openQrPanel();
}

setInterval(syncWithRoomSelect, 700);
document.addEventListener('change', (e) => {
    const sel = roomSelectEl();
    if (sel && e.target === sel) syncWithRoomSelect();
});

if (typeof window !== 'undefined') {
    window.openQrPanel = openQrPanel;
    window.closeQrPanel = closeQrPanel;
    window.refreshQrPanel = refreshQrPanel;
}