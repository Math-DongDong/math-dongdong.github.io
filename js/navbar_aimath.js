/**
 * 인공지능 수학 페이지 공통 네비게이션 바 모듈
 */
(function () {
    // 현재 실행 중인 HTML 파일의 경로를 기반으로 상대 경로 자동 계산
    // 윈도우 로컬 경로(백슬래시) 호환 및 디코딩 처리 적용
    const normalizedPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/');
    pathSegments.pop(); // 파일명 제거

    const pagesIndex = pathSegments.lastIndexOf('pages');
    let rootPath = '';
    let basePath = '';

    if (pagesIndex !== -1) {
        // 'pages' 폴더가 경로에 존재하는 경우 (하위 페이지)
        const depth = pathSegments.length - pagesIndex;
        rootPath = '../'.repeat(depth);
        basePath = rootPath + 'pages/aimath/';
    } else {
        // 루트 페이지인 경우
        rootPath = './';
        basePath = './pages/aimath/';
    }

    const navbarHtml = `
    <!-- 상단 네비게이션 바 (인공지능 수학 전용) -->
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
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownAiMath" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            인공지능 수학
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdownAiMath">
                            <!-- 인공지능 수학 소속 파일 목록 -->
                            <li><a class="dropdown-item" href="${basePath}resolution.html">🖼️ 이미지 해상도</a></li>
                            <li><a class="dropdown-item" href="${basePath}grayscale.html">⚫ 흑백 이미지</a></li>
                            <li><a class="dropdown-item" href="${basePath}color.html">🎨 컬러 이미지</a></li>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>
    </nav>
    `;

    // navbar-container 요소가 있으면 거기에 삽입, 없으면 스크립트 위치에 삽입
    const container = document.getElementById('navbar-container');
    if (container) {
        container.innerHTML = navbarHtml;
    } else {
        const scriptTag = document.currentScript;
        if (scriptTag) {
            scriptTag.insertAdjacentHTML('beforebegin', navbarHtml);
        } else {
            document.write(navbarHtml);
        }
    }

    // 현재 페이지 활성화(파란색 글씨 강조) 표시 로직
    document.addEventListener('DOMContentLoaded', () => {
        const currentPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
        const currentFile = currentPath.split('/').pop();

        document.querySelectorAll('.dropdown-item').forEach(link => {
            const linkHref = decodeURIComponent(link.getAttribute('href')).replace(/\\/g, '/');
            const linkFile = linkHref.split('/').pop();
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