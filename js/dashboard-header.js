/**
 * dashboard-header.js
 * 대시보드 상단 헤더 공통 렌더링 모듈
 * 
 * 사용법: <script src="../../../js/dashboard-header.js" data-title="대시보드 타이틀"></script>
 * 대시보드 섹션 내에 <div id="dash-header-placeholder"></div>를 배치하면
 * 해당 위치에 헤더 HTML이 자동 삽입됩니다.
 */
(function () {
    const scriptTag = document.currentScript;
    const title = scriptTag ? scriptTag.getAttribute('data-title') : '대시보드';
    const hasExport = scriptTag ? (scriptTag.getAttribute('data-export') !== 'false') : true;
    const selectId = scriptTag?.getAttribute('data-select-id') || 'roomSelect';

    const exportBtnHtml = hasExport ? `
        <button id="btn-export-excel" class="btn btn-outline-success fw-bold dash-export"><i
                class="bi bi-file-earmark-excel"></i> 엑셀 다운로드</button>
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
            </div>
        </div>
    `;

    const placeholder = document.getElementById('dash-header-placeholder');
    if (placeholder) {
        placeholder.innerHTML = headerHtml;
    } else if (scriptTag) {
        scriptTag.insertAdjacentHTML('beforebegin', headerHtml);
    }
})();
