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
                    "title": "아하! 수학",
                    "path": "pages/middleschool/ahamath.html"
                },
                {
                    "title": "중1 수학",
                    "items": [
                        { "name": "덧셈, 뺄셈", "path": "pages/middleschool/1/plus_minus.html" },
                        { "name": "곱셈, 나눗셈", "path": "pages/middleschool/1/multiply_divide.html" },
                        { "name": "생각을 읽는 마법구슬", "path": "pages/middleschool/1/read_mind.html" },
                        { "name": "좌표평면 오목", "path": "pages/middleschool/1/gridgomoku.html" },
                        { "name": "좀비 헌터", "path": "pages/middleschool/1/zombiehunter.html" },
                        { "name": "도형의 작도", "path": "pages/middleschool/1/construction.html" },
                        { "name": "삼각형이 되는 조건", "path": "pages/middleschool/1/triangle_condition.html" },
                        { "name": "삼각형의 합동", "path": "pages/middleschool/1/congruence.html" },
                        { "name": "원과 부채꼴의 넓이", "path": "pages/middleschool/1/circle_sector_area.html" },
                        { "name": "회전체 탐구", "path": "pages/middleschool/1/rotation.html" },
                        { "name": "가위바위보", "path": "pages/middleschool/1/relativefrequency.html" }
                    ]
                },
                {
                    "title": "중2 수학",
                    "items": [
                        { "name": "삼각형의 닮음", "path": "pages/middleschool/2/similarity.html" }
                    ]
                },

                {
                    "title": "체험수학",
                    "items": [
                        { "name": "보로노이 시뮬레이터", "path": "pages/middleschool/etc/voronoi.html" },
                        { "name": "파이데이", "path": "pages/middleschool/etc/mathday/mathday.html", external: true }
                    ]
                },
                {
                    "title": "보드게임",
                    "items": [
                        { "name": "스트림스", "path": "pages/middleschool/game/streams.html" },
                        { "name": "Pig Game", "path": "pages/middleschool/game/pig_game.html" },
                        { "name": "블로토 대령 게임", "path": "pages/middleschool/game/blottogame.html" },
                        { "name": "숫자야구", "path": "pages/middleschool/game/number_baseball.html" },
                        { "name": "성냥개비 퍼즐", "path": "pages/middleschool/game/matchstick.html" },
                        { "name": "주사위 모음", "path": "pages/middleschool/game/dice.html" }
                    ]
                }
            ]
        },
        // 아하! 수학 학습 페이지 전용: 로고는 아하! 수학 목차로, 학년별 주제 드롭다운
        // (페이지의 header.topbar 안에 들어가 진행률 줄과 함께 고정되므로 네비바 자체는 sticky 를 쓰지 않음)
        "ahamath": {
            "brand": "아하! 수학",
            "brandPath": "pages/middleschool/ahamath.html",
            "sticky": false,
            "menu": [
                {
                    "title": "중1",
                    "items": [
                        { "header": "소인수분해" },
                        { "name": "소수와 합성수", "path": "pages/middleschool/ahamath/1/prime.html" },
                        { "name": "소인수분해", "path": "pages/middleschool/ahamath/1/factorization.html" },
                        { "name": "최대공약수와 최소공배수", "path": "pages/middleschool/ahamath/1/gcdlcm.html" },
                        { "header": "정수와 유리수" },
                        { "name": "정수와 유리수", "path": "pages/middleschool/ahamath/1/rational.html" },
                        { "name": "절댓값과 수의 대소 관계", "path": "pages/middleschool/ahamath/1/compare.html" },
                        { "name": "정수와 유리수의 덧셈과 뺄셈", "path": "pages/middleschool/ahamath/1/addsub.html" },
                        { "name": "정수와 유리수의 곱셈과 나눗셈", "path": "pages/middleschool/ahamath/1/muldiv.html" },
                        { "header": "문자와 식" },
                        { "name": "문자의 사용과 식의 값", "path": "pages/middleschool/ahamath/1/letter.html" },
                        { "name": "일차식과 수의 곱셈, 나눗셈", "path": "pages/middleschool/ahamath/1/linearmuldiv.html" },
                        { "name": "일차식의 덧셈과 뺄셈", "path": "pages/middleschool/ahamath/1/linearaddsub.html" },
                        { "name": "등식과 방정식", "path": "pages/middleschool/ahamath/1/equation.html" },
                        { "name": "일차방정식의 풀이", "path": "pages/middleschool/ahamath/1/linearequation.html" },
                        { "header": "좌표평면과 그래프" },
                        { "name": "순서쌍과 좌표", "path": "pages/middleschool/ahamath/1/coordinate.html" },
                        { "name": "그래프", "path": "pages/middleschool/ahamath/1/graph.html" },
                        { "name": "정비례와 반비례", "path": "pages/middleschool/ahamath/1/proportion.html" },
                        { "header": "기본 도형과 작도" },
                        { "name": "점, 선, 면과 거리", "path": "pages/middleschool/ahamath/1/basicfigure.html" },
                        { "name": "각과 맞꼭지각", "path": "pages/middleschool/ahamath/1/angle.html" },
                        { "name": "평행선의 성질", "path": "pages/middleschool/ahamath/1/parallel.html" },
                        { "name": "위치 관계", "path": "pages/middleschool/ahamath/1/position.html" },
                        { "name": "작도와 삼각형의 작도", "path": "pages/middleschool/ahamath/1/construct.html" },
                        { "name": "삼각형의 합동 조건", "path": "pages/middleschool/ahamath/1/congruent.html" },
                        { "header": "자료의 정리와 해석" },
                        { "name": "대푯값", "path": "pages/middleschool/ahamath/1/representativevalue.html" },
                        { "name": "도수분포표와 히스토그램", "path": "pages/middleschool/ahamath/1/frequency.html" },
                        { "name": "상대도수와 그 그래프", "path": "pages/middleschool/ahamath/1/relative.html" }
                    ]
                },
                { "title": "중2", "items": [{ "disabled": "준비 중이에요" }] },
                { "title": "중3", "items": [{ "disabled": "준비 중이에요" }] }
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
                        { "name": "✍️ 손글씨 인식", "path": "pages/aimath/image/hammingdistance.html" }
                    ]
                },
                {
                    "title": "텍스트 데이터의 표현",
                    "items": [
                        { "name": "👜 텍스트 데이터의 표현과 주제어", "path": "pages/aimath/text/textexpression.html" },
                        { "name": "🧮 유용한 정보 찾기", "path": "pages/aimath/text/textconversion.html" },
                        { "name": "💬 텍스트 감성 분석", "path": "pages/aimath/text/sentimentanalysis.html" }
                    ]
                }
            ]
        },
        "automation": {
            "brand": "HOME",
            "menu": [
                {
                    "title": "수업도구",
                    "items": [
                        { "name": "수직선 만들기", "path": "pages/automation/class/numberline.html" },
                        { "name": "AI 모션 슬라이드", "path": "pages/automation/class/motionslide.html", "external": true }
                    ]
                },

                {
                    "title": "업무자동화",
                    "items": [
                        { "name": "여비정산 신청서", "path": "pages/automation/work/travel_expense_report.html" },
                        { "name": "PDF 편집 도구", "path": "pages/automation/work/pdfedit.html" },
                        { "name": "GIF 편집 도구", "path": "pages/automation/work/gifedit.html" },
                        { "name": "엑셀 이미지 추출기", "path": "pages/automation/work/xlimagedownloader.html" }
                    ]
                },
                {
                    "title": "학생관리",
                    "items": [
                        { "name": "학생관리 앱", "path": "pages/automation/student/appsheet.html" },
                        { "name": "자리배치 앱", "path": "pages/automation/student/seatingarrangement.html" },
                        { "name": "소감문 관리 앱", "path": "pages/automation/student/reviewmanagement.html" },
                        { "name": "우리반 관계지도 앱", "path": "pages/automation/student/relationmap.html" }
                    ]
                }
            ]
        }
    };

    // 다른 스크립트(index.html 등)에서 접근할 수 있도록 전역 객체로 참조 설정
    window.NAVBAR_DATA = NAVBAR_DATA;

    const scriptTag = document.currentScript;

    // data-no-render="true" 속성이 있으면 네비바 HTML 생성을 수행하지 않음 (index.html 전용)
    if (scriptTag && scriptTag.getAttribute('data-no-render') === 'true') {
        return;
    }

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

    // 3. 네비게이션 타입 결정
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

    // 전체화면 버튼 아이콘용 Bootstrap Icons CSS가 페이지에 없으면 자동 추가
    if (!document.querySelector('link[href*="bootstrap-icons"]')) {
        const iconsLink = document.createElement('link');
        iconsLink.rel = 'stylesheet';
        iconsLink.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css';
        document.head.appendChild(iconsLink);
    }

    // 4. HTML 동적 생성
    let menuHtml = '';
    navData.menu.forEach((group, index) => {
        if (group.items && Array.isArray(group.items) && group.items.length > 0) {
            let itemsHtml = '';
            group.items.forEach(item => {
                if (item.header) {
                    itemsHtml += `<li><h6 class="dropdown-header">${item.header}</h6></li>`;
                    return;
                }
                if (item.disabled) {
                    itemsHtml += `<li><span class="dropdown-item disabled">${item.disabled}</span></li>`;
                    return;
                }
                const isHttp = item.path && item.path.startsWith('http');
                const href = isHttp ? item.path : `${rootPath}${item.path}`;
                const target = (item.external || isHttp) ? ' target="_blank" rel="noopener noreferrer"' : '';
                itemsHtml += `<li><a class="dropdown-item" href="${href}"${target}>${item.name}</a></li>`;
            });

            menuHtml += `
            <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown${navType}${index}" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    ${group.title}
                </a>
                <ul class="dropdown-menu dropdown-scroll" aria-labelledby="navbarDropdown${navType}${index}">
                    ${itemsHtml}
                </ul>
            </li>
            `;
        } else {
            const isHttp = group.path && group.path.startsWith('http');
            const href = isHttp ? group.path : `${rootPath}${group.path}`;
            const target = (group.external || isHttp) ? ' target="_blank" rel="noopener noreferrer"' : '';
            menuHtml += `
            <li class="nav-item">
                <a class="nav-link" href="${href}"${target}>
                    ${group.title}
                </a>
            </li>
            `;
        }
    });

    const stickyClass = navData.sticky === false ? '' : ' sticky-top';
    const navbarHtml = `
    <!-- 상단 네비게이션 바 -->
    <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom${stickyClass} py-2 shadow-sm">
        <div class="container-fluid px-3">
            <a class="navbar-brand d-flex align-items-center fw-bold" href="${rootPath}${navData.brandPath || 'index.html'}">
                <img src="${rootPath}assets/images/mainPage/동동이.jpg" alt="동동이 로고" width="30" height="30" class="d-inline-block align-middle me-2 rounded-circle border">
                ${navData.brand}
            </a>
            <div class="d-flex align-items-center d-lg-none ms-auto gap-2">
                <button class="btn btn-outline-secondary btn-sm rounded-circle p-0 d-flex align-items-center justify-content-center" id="btnFullscreenMobile" title="전체화면 모드" style="width:36px;height:36px;">
                    <i class="bi bi-arrows-fullscreen" id="fullscreenIconMobile"></i>
                </button>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="메뉴 토글">
                    <span class="navbar-toggler-icon"></span>
                </button>
            </div>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-lg-3">
                    ${menuHtml}
                </ul>
                <div class="ms-auto d-flex align-items-center gap-2">
                    <div id="teacher-auth-container" class="d-flex align-items-center"></div>
                    <button class="btn btn-outline-secondary btn-sm fw-bold shadow-sm d-none d-lg-inline-flex align-items-center" id="btnFullscreenDesktop" title="전체화면 모드">
                        <i class="bi bi-arrows-fullscreen me-1" id="fullscreenIconDesktop"></i><span id="fullscreenBtnText">전체화면 모드</span>
                    </button>
                </div>
            </div>
        </div>
    </nav>
    `;

    // 5. navbar-container 요소가 있으면 내부 삽입, 없으면 스크립트 태그 앞 삽입
    const container = document.getElementById('navbar-container');
    const placeholder = document.getElementById('navbar-placeholder');

    if (container) {
        container.innerHTML = navbarHtml;
    } else if (placeholder) {
        placeholder.innerHTML = navbarHtml;
    } else if (scriptTag) {
        scriptTag.insertAdjacentHTML('beforebegin', navbarHtml);
    } else {
        document.write(navbarHtml);
    }

    // 6. 현재 페이지 활성화 표시 로직 및 교사 인증 모듈 로드
    function initNavbarFeatures() {
        const currentFile = normalizedPath.split('/').pop();

        // 단일 링크 메뉴 활성화 체크
        document.querySelectorAll('.navbar-nav > .nav-item > .nav-link:not(.dropdown-toggle)').forEach(link => {
            const linkHref = decodeURIComponent(link.getAttribute('href')).replace(/\\/g, '/');
            const cleanLinkHref = linkHref.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
            if (cleanLinkHref && (
                normalizedPath.endsWith(cleanLinkHref) ||
                (cleanLinkHref.endsWith('index.html') && normalizedPath.endsWith(cleanLinkHref.replace('index.html', ''))) ||
                (cleanLinkHref === 'pages/middleschool/ahamath.html' && normalizedPath.includes('/pages/middleschool/ahamath/'))
            )) {
                link.classList.add('active');
            }
        });

        document.querySelectorAll('.dropdown-item').forEach(link => {
            const linkHref = decodeURIComponent(link.getAttribute('href')).replace(/\\/g, '/');
            const cleanLinkHref = linkHref.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
            if (cleanLinkHref && (
                normalizedPath.endsWith(cleanLinkHref) ||
                (cleanLinkHref.endsWith('index.html') && normalizedPath.endsWith(cleanLinkHref.replace('index.html', '')))
            )) {
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

        // Load teacher auth module dynamically if not already added
        if (!document.querySelector('script[data-auth="teacher-auth"]')) {
            const authScript = document.createElement('script');
            authScript.type = 'module';
            authScript.dataset.auth = 'teacher-auth';
            authScript.src = `${rootPath}js/teacher-auth.js`;
            document.body.appendChild(authScript);
        }

        // fullscreen: false 인 타입(아하! 수학)은 페이지 자체 전체화면 버튼을 쓰므로 네비바 버튼 제거
        if (navData.fullscreen === false) {
            ['btnFullscreenMobile', 'btnFullscreenDesktop'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.remove();
            });
        }

        // 전체화면 토글 버튼 초기화 (모바일 아이콘 + 데스크탑 텍스트 버튼)
        const fsMobile = document.getElementById('btnFullscreenMobile');
        const fsDesktop = document.getElementById('btnFullscreenDesktop');
        const fsText = document.getElementById('fullscreenBtnText');
        const fsIconMobile = document.getElementById('fullscreenIconMobile');
        const fsIconDesktop = document.getElementById('fullscreenIconDesktop');

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                // 네비바 접기 (모바일에서 열려있는 경우)
                const navCollapse = document.getElementById('navbarNav');
                if (navCollapse && navCollapse.classList.contains('show')) {
                    const bsCollapse = bootstrap.Collapse.getOrCreateInstance(navCollapse);
                    bsCollapse.hide();
                }
                document.documentElement.requestFullscreen().catch(() => { });
            } else {
                document.exitFullscreen().catch(() => { });
            }
        }

        function updateFullscreenUI() {
            const isFs = !!document.fullscreenElement;
            const iconClass = isFs ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen';
            if (fsText) fsText.textContent = isFs ? '전체화면 종료' : '전체화면 모드';
            if (fsIconMobile) fsIconMobile.className = iconClass;
            if (fsIconDesktop) fsIconDesktop.className = iconClass + ' me-1';
            if (fsMobile) fsMobile.title = isFs ? '전체화면 종료' : '전체화면 모드';
            if (fsDesktop) fsDesktop.title = isFs ? '전체화면 종료' : '전체화면 모드';
        }

        if (fsMobile) fsMobile.addEventListener('click', toggleFullscreen);
        if (fsDesktop) fsDesktop.addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', updateFullscreenUI);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavbarFeatures);
    } else {
        initNavbarFeatures();
    }
})();