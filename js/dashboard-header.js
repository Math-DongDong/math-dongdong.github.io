/**
 * dashboard-header.js
 * 대시보드 상단 헤더 공통 렌더링 모듈
 *
 * 사용법: <script src="../../../js/dashboard-header.js" data-title="대시보드 타이틀"></script>
 * 대시보드 섹션 내에 <div id="dash-header-placeholder"></div>를 배치하면
 * 해당 위치에 헤더 HTML이 자동 삽입됩니다.
 *
 * [추가] 같은 폴더의 qr-modal.js를 자동으로 불러와 [QR 코드] 버튼과 연결합니다.
 *        (각 게임 페이지는 수정할 필요가 없습니다)
 */
(function () {
    const scriptTag = document.currentScript;
    const title = scriptTag ? scriptTag.getAttribute('data-title') : '대시보드';
    const hasExport = scriptTag ? (scriptTag.getAttribute('data-export') !== 'false') : true;
    const selectId = scriptTag?.getAttribute('data-select-id') || 'roomSelect';
    const hasQr = scriptTag ? (scriptTag.getAttribute('data-qr') !== 'false') : true;

    // qr-modal.js가 어떤 <select>를 봐야 하는지 알려줍니다.
    window.dashboardSelectId = selectId;

    const exportBtnHtml = hasExport ? `
        <button id="btn-export-excel" class="btn btn-outline-success fw-bold dash-export"><i
                class="bi bi-file-earmark-excel"></i> 엑셀 다운로드</button>
    ` : '';

    const qrBtnHtml = hasQr ? `
        <button id="btn-show-qr" class="btn btn-outline-dark fw-bold dash-qr" style="white-space: nowrap;"><i
                class="bi bi-qr-code"></i> 입장 QR</button>
    ` : '';

    const headerClass = hasExport ? 'dash-header mb-4' : 'dash-header dash-header-no-export mb-4';

    const headerHtml = `
        <div class="${headerClass}">
            <div class="dash-left">
                <div class="dash-title-group">
                    <div class="fs-3">👩‍🏫</div>
                    <h2 class="fw-bold mb-0 text-dark">${title}</h2>
                </div>
                <button id="btn-delete-room" class="btn btn-danger fw-bold dash-delete">현재 방 삭제하기</button>
            </div>
            <div class="dash-right">
                <select id="${selectId}" class="form-select fw-bold bg-light dash-select" style="cursor:pointer;">
                    <option value="">방을 선택하세요</option>
                </select>
                <button id="btn-create-room" class="btn btn-primary fw-bold dash-create">새로운 방 만들기</button>
                ${exportBtnHtml}
                <button id="btn-reset-pin" class="btn btn-outline-danger fw-bold dash-reset-pin" style="white-space: nowrap;"><i class="bi bi-key-fill"></i> PIN 초기화</button>
                ${qrBtnHtml}
            </div>
        </div>
    `;

    // [QR 버튼] 모바일 그리드 배치용 보정 스타일
    // dashboard.css를 수정하지 않아도 되도록 여기서 주입합니다.
    if (hasQr && !document.getElementById('dash-qr-style')) {
        const style = document.createElement('style');
        style.id = 'dash-qr-style';
        style.textContent = `
            .dash-reset-pin { grid-column: 1; grid-row: 4; }
            .dash-qr { grid-column: 2; grid-row: 4; }
            .dash-qr {
                width: 100%;
                height: 42px;
                padding: 0.4rem 0.75rem;
                font-size: 0.95rem;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                white-space: nowrap;
            }
            @media (min-width: 768px) {
                .dash-qr {
                    height: 42px;
                    padding: 0.45rem 1rem;
                    font-size: 1rem;
                    width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const placeholder = document.getElementById('dash-header-placeholder');
    if (placeholder) {
        placeholder.innerHTML = headerHtml;
    } else if (scriptTag) {
        scriptTag.insertAdjacentHTML('beforebegin', headerHtml);
    }

    // 같은 js 폴더의 qr-modal.js를 모듈로 로드 (페이지별 상대경로 자동 계산)
    if (hasQr && scriptTag && !document.getElementById('qr-modal-loader')) {
        const base = scriptTag.src.replace(/dashboard-header\.js.*$/, '');
        const loader = document.createElement('script');
        loader.id = 'qr-modal-loader';
        loader.type = 'module';
        loader.src = base + 'qr-modal.js';
        document.head.appendChild(loader);
    }
})();