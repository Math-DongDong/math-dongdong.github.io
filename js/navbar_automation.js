/**
 * navbar_automation.js
 * 업무자동화(schoolautomation) 페이지 공통 네비게이션 바 모듈
 */
(function () {
    // 현재 실행 중인 HTML 파일의 경로를 기반으로 상대 경로 자동 계산
    const pathSegments = window.location.pathname.split('/');
    pathSegments.pop(); // 파일명 제거

    const pagesIndex = pathSegments.indexOf('pages');
    let rootPath = '';
    let basePath = '';

    if (pagesIndex !== -1) {
        // 'pages' 폴더가 경로에 존재하는 경우 (하위 페이지)
        const depth = pathSegments.length - pagesIndex;
        rootPath = '../'.repeat(depth);
        basePath = rootPath + 'pages/schoolautomation/';
    } else {
        // 루트 페이지인 경우
        rootPath = './';
        basePath = './pages/schoolautomation/';
    }

    const navbarHtml = `
    <!-- 상단 네비게이션 바 (업무자동화 전용) -->
    <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top py-2 shadow-sm">
        <div class="container-fluid px-3">
            <a class="navbar-brand d-flex align-items-center fw-bold" href="${rootPath}index.html">
                <img src="${rootPath}assets/images/mainPage/동동이.jpg" alt="동동이 로고" width="30" height="30" class="d-inline-block align-middle me-2 rounded-circle border">
                HOME
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="메뉴 토글">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-lg-3">
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownAutomation" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            업무자동화
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdownAutomation">
                            <!-- 업무자동화 소속 파일 목록 -->
                            <li><a class="dropdown-item" href="${basePath}appsheet.html">학생관리 앱</a></li>
                            <li><a class="dropdown-item" href="${basePath}travel_expense_report.html">여비정산 신청서</a></li>
                            
                            <!-- 추후 파일이 추가되면 아래와 같이 한 줄씩 복사해서 넣으세요 -->
                            <!-- <li><a class="dropdown-item" href="\${basePath}새로운파일.html">새로운 메뉴</a></li> -->
                        </ul>
                    </li>
                </ul>
            </div>
        </div>
    </nav>
    `;

    // 스크립트 태그 위치에 HTML 삽입
    const scriptTag = document.currentScript;
    if (scriptTag) {
        scriptTag.insertAdjacentHTML('beforebegin', navbarHtml);
    } else {
        document.write(navbarHtml);
    }

    // 현재 페이지 활성화(파란색 글씨 강조) 표시 로직
    document.addEventListener('DOMContentLoaded', () => {
        const currentPath = window.location.pathname;
        const currentFile = currentPath.split('/').pop();

        document.querySelectorAll('.dropdown-item').forEach(link => {
            const linkFile = link.getAttribute('href').split('/').pop();
            if (linkFile && linkFile === currentFile) {
                link.classList.add('active');
                const parentDropdown = link.closest('.dropdown');
                if (parentDropdown) {
                    const toggleBtn = parentDropdown.querySelector('.dropdown-toggle');
                    if (toggleBtn) {
                        toggleBtn.classList.add('active');
                    }
                }
            }
        });
    });
})();