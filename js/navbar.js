/**
 * navbar.js
 * 통합 네비게이션 바 모듈 (중학 수학, 인공지능 수학, 업무자동화 통합)
 */
(function () {
    // 1. 네비게이션 메뉴 구조 정의 (JSON 데이터)
    const NAVBAR_DATA = {
        "middleschool": {
            "brand": "HOME",
            "menu": [
                {
                    "title": "중1 수학",
                    "items": [
                        { "name": "덧셈, 뺄셈", "path": "pages/middleschool/1/plus_minus.html" },
                        { "name": "곱셈, 나눗셈", "path": "pages/middleschool/1/multiply_divide.html" },
                        { "name": "다항식 챌린지", "path": "pages/middleschool/1/polynomial.html" },
                        { "name": "생각을 읽는 마법구슬", "path": "pages/middleschool/1/read_mind.html" },
                        { "name": "균형을 잡아라", "path": "pages/middleschool/1/equation.html" },
                        { "name": "회전체 탐구", "path": "pages/middleschool/1/rotation.html" }
                    ]
                },
                {
                    "title": "중2 수학",
                    "items": [
                        { "name": "지수법칙", "path": "pages/middleschool/2/exponents.html" }
                    ]
                },
                {
                    "title": "체험수학",
                    "items": [
                        { "name": "보로노이 시뮬레이터", "path": "pages/middleschool/etc/voronoi.html" }
                    ]
                },
                {
                    "title": "보드게임",
                    "items": [
                        { "name": "스트림스", "path": "pages/middleschool/game/streams.html" },
                        { "name": "Pig Game", "path": "pages/middleschool/game/pig_game.html" },
                        { "name": "숫자야구", "path": "pages/middleschool/game/number_baseball.html" },
                        { "name": "성냥개비 퍼즐", "path": "pages/middleschool/game/matchstick.html" },
                        { "name": "주사위 모음", "path": "pages/middleschool/game/dice.html" }
                    ]
                }
            ]
        },
        "aimath": {
            "brand": "HOME",
            "menu": [
                {
                    "title": "이미지 데이터의 표현",
                    "items": [
                        { "name": "🖼️ 이미지 해상도", "path": "pages/aimath/image/resolution.html" },
                        { "name": "⚫ 흑백 이미지", "path": "pages/aimath/image/blackandwhite.html" },
                        { "name": "🎨 컬러 이미지", "path": "pages/aimath/image/color.html" }
                    ]
                },
                {
                    "title": "이미지 데이터의 변환 및 분류",
                    "items": [
                        { "name": "🔘 그레이 필터", "path": "pages/aimath/image/grayscale.html" },
                        { "name": "💡 밝기 조절", "path": "pages/aimath/image/brightness_adjust.html" },
                        { "name": "➕ 이미지의 합성", "path": "pages/aimath/image/matrix_composite.html" },
                        { "name": "✍️ 손글씨 인식", "path": "pages/aimath/image/hammingdistance.html" },

                    ]
                },
                {
                    "title": "텍스트 데이터의 표현",
                    "items": [
                        { "name": "✍️ 손글씨 인식", "path": "pages/aimath/image/hammingdistance.html" },
                    ]
                }

            ]
        },
        "automation": {
            "brand": "HOME",
            "menu": [
                {
                    "title": "업무자동화",
                    "items": [
                        { "name": "여비정산 신청서", "path": "pages/automation/work/travel_expense_report.html" }
                    ]
                },
                {
                    "title": "학생관리",
                    "items": [
                        { "name": "학생관리 앱", "path": "pages/automation/student/appsheet.html" },
                    ]
                }

            ]
        }
    };

    // 2. 현재 실행 중인 HTML 파일의 경로를 기반으로 루트 경로 계산
    const normalizedPath = decodeURIComponent(window.location.pathname).replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/');
    pathSegments.pop(); // 파일명 제거

    const pagesIndex = pathSegments.lastIndexOf('pages');
    let rootPath = '';

    if (pagesIndex !== -1) {
        const depth = pathSegments.length - pagesIndex;
        rootPath = '../'.repeat(depth);
    } else {
        rootPath = './';
    }

    // 3. 네비게이션 타입 결정 (속성 지정 우선 -> 경로 분석 자동 감지)
    const scriptTag = document.currentScript;
    let navType = scriptTag ? scriptTag.getAttribute('data-type') : null;

    if (!navType) {
        if (normalizedPath.includes('/pages/aimath/')) {
            navType = 'aimath';
        } else if (normalizedPath.includes('/pages/automation/')) {
            navType = 'automation';
        } else {
            navType = 'middleschool'; // 기본값
        }
    }

    const navData = NAVBAR_DATA[navType];
    if (!navData) return;

    // 4. HTML 동적 생성
    let menuHtml = '';
    navData.menu.forEach((group, index) => {
        let itemsHtml = '';
        group.items.forEach(item => {
            itemsHtml += `<li><a class="dropdown-item" href="${rootPath}${item.path}">${item.name}</a></li>`;
        });

        menuHtml += `
        <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown${navType}${index}" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                ${group.title}
            </a>
            <ul class="dropdown-menu" aria-labelledby="navbarDropdown${navType}${index}">
                ${itemsHtml}
            </ul>
        </li>
        `;
    });

    const navbarHtml = `
    <!-- 상단 네비게이션 바 -->
    <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top py-2 shadow-sm">
        <div class="container-fluid px-3">
            <a class="navbar-brand d-flex align-items-center fw-bold" href="${rootPath}index.html">
                <img src="${rootPath}assets/images/mainPage/동동이.jpg" alt="동동이 로고" width="30" height="30" class="d-inline-block align-middle me-2 rounded-circle border">
                ${navData.brand}
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="메뉴 토글">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-lg-3">
                    ${menuHtml}
                </ul>
            </div>
        </div>
    </nav>
    `;

    // 5. navbar-container 요소가 있으면 내부 삽입, 없으면 스크립트 태그 앞 삽입
    const container = document.getElementById('navbar-container');
    if (container) {
        container.innerHTML = navbarHtml;
    } else if (scriptTag) {
        scriptTag.insertAdjacentHTML('beforebegin', navbarHtml);
    } else {
        document.write(navbarHtml);
    }

    // 6. 현재 페이지 활성화 표시 로직
    document.addEventListener('DOMContentLoaded', () => {
        const currentFile = normalizedPath.split('/').pop();

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

