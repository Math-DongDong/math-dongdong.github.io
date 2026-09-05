/**
 * qr-modal.js
 * 대시보드용 "방 입장 QR" 플로팅 패널
 *
 *  - 마우스(또는 손가락)로 제목 줄을 잡아 화면 어디로든 옮길 수 있습니다.
 *  - − / + 버튼으로 QR 크기를 4단계로 조절합니다. (프로젝터 투사용)
 *  - 위치와 크기는 브라우저에 저장되어 다음에 열 때 그대로 복원됩니다.
 *  - 대시보드에서 방을 바꾸면 QR이 자동으로 갱신됩니다.
 *
 * 연결 방법:
 *  dashboard-header.js가 이 파일을 자동으로 불러오고 [QR 코드] 버튼(#btn-show-qr)에
 *  이벤트를 연결하므로, 각 게임 페이지는 손댈 필요가 없습니다.
 *
 * 직접 제어가 필요하면 아래 함수를 import 해서 쓸 수 있습니다.
 *  import { openQrPanel, closeQrPanel, toggleQrPanel } from './qr-modal.js';
 */

const PANEL_ID = 'roomQrPanel';
const POS_KEY = 'roomQrPanel:pos';
const SIZE_KEY = 'roomQrPanel:sizeIndex';
const QR_SIZES = [180, 260, 340, 440];
const QR_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

let sizeIndex = 1;
let currentUrl = '';

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
function loadSizeIndex() {
    try {
        const v = parseInt(localStorage.getItem(SIZE_KEY), 10);
        return Number.isInteger(v) && v >= 0 && v < QR_SIZES.length ? v : 1;
    } catch (e) { return 1; }
}
function saveSizeIndex(i) {
    try { localStorage.setItem(SIZE_KEY, String(i)); } catch (e) { }
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
            padding: 0.5rem 0.75rem;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            cursor: grab;
            user-select: none;
            touch-action: none;
        }
        .qr-panel-head.dragging { cursor: grabbing; }
        .qr-panel-head .qr-grip { color: #94a3b8; font-size: 1.1rem; line-height: 1; }
        .qr-panel-body { padding: 0.75rem; text-align: center; }
        .qr-canvas-box {
            display: flex;
            justify-content: center;
            align-items: center;
            background: #ffffff;
            border-radius: 10px;
            min-height: 120px;
        }
        .qr-canvas-box canvas, .qr-canvas-box img { display: block; }
        .qr-room-code {
            font-weight: 800;
            letter-spacing: 0.25em;
            color: #0d6efd;
            margin-top: 0.5rem;
            line-height: 1.1;
        }
        .qr-url {
            word-break: break-all;
            font-size: 0.72rem;
            color: #94a3b8;
            margin-top: 0.25rem;
        }
        .qr-panel-head .btn { --bs-btn-padding-y: .1rem; --bs-btn-padding-x: .45rem; }
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
// 패널 생성 / 드래그
// =====================================================================
function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    ensureStyle();
    sizeIndex = loadSizeIndex();

    document.body.insertAdjacentHTML('beforeend', `
    <div class="qr-panel" id="${PANEL_ID}" role="dialog" aria-label="방 입장 QR 코드">
        <div class="qr-panel-head" id="qrPanelHead">
            <span class="qr-grip">⠿</span>
            <span class="fw-bold text-dark small">방 입장 QR</span>
            <div class="ms-auto d-flex gap-1">
                <button type="button" class="btn btn-sm btn-light border fw-bold" data-qr="smaller" title="작게">−</button>
                <button type="button" class="btn btn-sm btn-light border fw-bold" data-qr="bigger" title="크게">+</button>
                <button type="button" class="btn btn-sm btn-light border fw-bold" data-qr="close" title="닫기">✕</button>
            </div>
        </div>
        <div class="qr-panel-body">
            <div class="qr-canvas-box" id="qrCanvasBox">
                <span class="text-muted small">QR을 만드는 중...</span>
            </div>
            <div class="qr-room-code" id="qrRoomCode"></div>
            <div class="qr-url" id="qrUrlText"></div>
            <div class="d-flex gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-primary fw-bold flex-fill" data-qr="copy">링크 복사</button>
                <button type="button" class="btn btn-sm btn-outline-secondary fw-bold flex-fill" data-qr="open">새 탭</button>
            </div>
        </div>
    </div>`);

    panel = document.getElementById(PANEL_ID);

    // 저장된 위치 복원 (없으면 우측 하단)
    const pos = loadPos();
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        panel.style.left = pos.left + 'px';
        panel.style.top = pos.top + 'px';
    } else {
        panel.style.left = Math.max(8, window.innerWidth - 340) + 'px';
        panel.style.top = '90px';
    }

    setupDrag(panel);
    setupButtons(panel);
    window.addEventListener('resize', () => clampIntoView(panel));
    requestAnimationFrame(() => clampIntoView(panel));

    return panel;
}

function clampIntoView(panel) {
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
        if (e.target.closest('button')) return;      // 버튼 클릭은 드래그로 처리하지 않음
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
        const nextLeft = Math.min(Math.max(8, baseLeft + (e.clientX - startX)), maxLeft);
        const nextTop = Math.min(Math.max(8, baseTop + (e.clientY - startY)), maxTop);
        panel.style.left = nextLeft + 'px';
        panel.style.top = nextTop + 'px';
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

function setupButtons(panel) {
    panel.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-qr]');
        if (!btn) return;
        const act = btn.dataset.qr;

        if (act === 'close') {
            closeQrPanel();
        } else if (act === 'smaller' || act === 'bigger') {
            sizeIndex = Math.min(QR_SIZES.length - 1, Math.max(0, sizeIndex + (act === 'bigger' ? 1 : -1)));
            saveSizeIndex(sizeIndex);
            await renderQr();
            clampIntoView(panel);
        } else if (act === 'copy') {
            if (!currentUrl) return;
            try {
                await navigator.clipboard.writeText(currentUrl);
            } catch (err) {
                const ta = document.createElement('textarea');
                ta.value = currentUrl;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e2) { }
                ta.remove();
            }
            const original = btn.textContent;
            btn.textContent = '복사 완료!';
            setTimeout(() => { btn.textContent = original; }, 1500);
        } else if (act === 'open') {
            if (currentUrl) window.open(currentUrl, '_blank', 'noopener');
        }
    });
}

// =====================================================================
// QR 그리기
// =====================================================================
async function renderQr() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const box = panel.querySelector('#qrCanvasBox');
    const codeEl = panel.querySelector('#qrRoomCode');
    const urlEl = panel.querySelector('#qrUrlText');
    const size = QR_SIZES[sizeIndex];

    const roomCode = currentRoomCode();
    codeEl.style.fontSize = Math.max(1.1, size / 180) + 'rem';

    if (!roomCode) {
        currentUrl = '';
        box.innerHTML = '<span class="text-muted small px-3 py-4">방을 먼저 선택하면<br>QR 코드가 만들어집니다.</span>';
        codeEl.textContent = '';
        urlEl.textContent = '';
        return;
    }

    currentUrl = buildJoinUrl(roomCode);
    codeEl.textContent = roomCode;
    urlEl.textContent = currentUrl;

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
            width: size,
            height: size,
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
    ensurePanel();
    await renderQr();
    clampIntoView(document.getElementById(PANEL_ID));
}

export function closeQrPanel() {
    document.getElementById(PANEL_ID)?.remove();
}

export function toggleQrPanel() {
    if (document.getElementById(PANEL_ID)) closeQrPanel();
    else openQrPanel();
}

export function refreshQrPanel() {
    if (document.getElementById(PANEL_ID)) renderQr();
}

// =====================================================================
// 자동 연결 (dashboard-header.js가 만든 [QR 코드] 버튼)
// =====================================================================
document.addEventListener('click', (e) => {
    if (!e.target.closest('#btn-show-qr')) return;
    e.preventDefault();
    toggleQrPanel();
});

// 방을 바꾸면 열려 있는 QR도 자동 갱신
document.addEventListener('change', (e) => {
    const sel = roomSelectEl();
    if (sel && e.target === sel) refreshQrPanel();
});

if (typeof window !== 'undefined') {
    window.openQrPanel = openQrPanel;
    window.closeQrPanel = closeQrPanel;
    window.toggleQrPanel = toggleQrPanel;
    window.refreshQrPanel = refreshQrPanel;
}