/**
 * navbar.js
 * 중학 수학 페이지 공통 네비게이션 바 모듈
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
        basePath = rootPath + 'pages/middleschool/';
    } else {
        // 루트 페이지인 경우 (예: index.html)
        rootPath = './';
        basePath = './pages/middleschool/';
    }

    const navbarHtml = `
    <!-- 상단 네비게이션 바 (공통 모듈) -->
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
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown1" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            중1 수학
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdown1">
                            <li><a class="dropdown-item" href="${basePath}1/plus_minus.html">덧셈, 뺄셈</a></li>
                            <li><a class="dropdown-item" href="${basePath}1/multiply_divide.html">곱셈, 나눗셈</a></li>
                            <li><a class="dropdown-item" href="${basePath}1/polynomial.html">다항식 챌린지</a></li>
                            <li><a class="dropdown-item" href="${basePath}1/read_mind.html">생각을 읽는 마법구슬</a></li>
                            <li><a class="dropdown-item" href="${basePath}1/equation.html">균형을 잡아라</a></li>
                            <li><a class="dropdown-item" href="${basePath}1/rotation.html">회전체 탐구</a></li>
                        </ul>
                    </li>
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown2" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            중2 수학
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdown2">
                            <li><a class="dropdown-item" href="${basePath}2/exponents.html">지수법칙</a></li>
                        </ul>
                    </li>
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown3" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            체험수학
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdown3">
                            <li><a class="dropdown-item" href="${basePath}etc/voronoi.html">영역의 분할</a></li>
                        </ul>
                    </li>
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown4" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                            보드게임
                        </a>
                        <ul class="dropdown-menu" aria-labelledby="navbarDropdown4">
                            <li><a class="dropdown-item" href="${basePath}game/streams.html">스트림스</a></li>
                            <li><a class="dropdown-item" href="${basePath}game/pig_game.html">Pig Game</a></li>
                            <li><a class="dropdown-item" href="${basePath}game/number_baseball.html">숫자야구</a></li>
                            <li><a class="dropdown-item" href="${basePath}game/matchstick.html">성냥개비 퍼즐</a></li>
                            <li><a class="dropdown-item" href="${basePath}game/dice.html">주사위 모음</a></li>
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

    // 현재 페이지 활성화 표시 로직
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
