/**
 * dashboard-header.js  (v4)
 * 대시보드 상단 헤더 공통 렌더링 모듈
 *
 * 사용법:
 *   <script src="../../../js/dashboard-header.js"
 *           data-title="대시보드 타이틀"
 *           data-export="false"          엑셀 버튼 숨김
 *           data-student-link="false"    [학생 관리] 바로가기 숨김 (인증 모드가 없는 게임)
 *           data-select-id="admin-room-select"
 *           data-qr="false"></script>
 *
 * v4에서 달라진 것
 *  · PIN이 없어져 [PIN 초기화] 자리에 [학생 관리] 바로가기(새 탭)를 둡니다.
 *    예전 속성 data-pin-reset="false" 도 그대로 '숨김'으로 읽습니다.
 *    id="btn-reset-pin" 버튼은 더 이상 만들지 않습니다 (페이지에서는 ?. 로 접근).
 *
 * v3에서 달라진 것
 *  · data-pin-reset 추가. v2는 모든 대시보드에 PIN 초기화 버튼을 그렸는데,
 *    오목·가위바위보·블로토는 학생 인증 모드가 없어 핸들러도 없었습니다.
 *    선생님이 눌러도 아무 반응이 없어 고장으로 보였습니다.
 *  · data-title을 이스케이프합니다.
 */
(function () {
    const scriptTag = document.currentScript;
    const attr = (name, fallback) => (scriptTag ? (scriptTag.getAttribute(name) ?? fallback) : fallback);

    const title = attr('data-title', '대시보드');
    const hasExport = attr('data-export', '') !== 'false';
    const hasStudentLink = attr('data-student-link', attr('data-pin-reset', '')) !== 'false';
    const hasQr = attr('data-qr', '') !== 'false';
    const selectId = attr('data-select-id', 'roomSelect') || 'roomSelect';

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);

    // qr-modal.js가 어떤 <select>를 봐야 하는지 알려줍니다.
    window.dashboardSelectId = selectId;

    const exportBtnHtml = hasExport
        ? `<button id="btn-export-excel" class="btn btn-outline-success fw-bold dash-export"><i class="bi bi-file-earmark-excel"></i> 엑셀 다운로드</button>`
        : '';

    // js/ 폴더 기준으로 학생 관리 주소 계산 (페이지 깊이와 무관). 레이아웃은 예전 PIN 버튼 자리(.dash-reset-pin)를 씁니다.
    let studentHref = '#';
    try { studentHref = new URL('../pages/admin/student_manager.html', scriptTag.src).href; } catch (e) { }
    const studentBtnHtml = hasStudentLink
        ? `<a id="btn-student-manager" href="${esc(studentHref)}" target="_blank" rel="noopener" class="btn btn-outline-secondary fw-bold dash-reset-pin" style="white-space: nowrap;"><i class="bi bi-people-fill"></i> 학생 관리</a>`
        : '';

    const headerClass = hasExport ? 'dash-header mb-4' : 'dash-header dash-header-no-export mb-4';

    const headerHtml = `
        <div class="${headerClass}">
            <div class="dash-left">
                <div class="dash-title-group">
                    <div class="fs-3">👩‍🏫</div>
                    <h2 class="fw-bold mb-0 text-dark">${esc(title)}</h2>
                </div>
                <button id="btn-delete-room" class="btn btn-danger fw-bold dash-delete">현재 방 삭제하기</button>
            </div>
            <div class="dash-right">
                <label class="visually-hidden" for="${esc(selectId)}">방 선택</label>
                <select id="${esc(selectId)}" class="form-select fw-bold bg-light dash-select" style="cursor:pointer;">
                    <option value="">방을 선택하세요</option>
                </select>
                <button id="btn-create-room" class="btn btn-primary fw-bold dash-create">새로운 방 만들기</button>
                ${exportBtnHtml}
                ${studentBtnHtml}
            </div>
        </div>
    `;

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