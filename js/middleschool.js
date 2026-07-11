/**
 * middleschool.js
 * 중학 수학 페이지의 상단 네비게이션 드롭다운 동작을 관리하는 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {

    // 모든 드롭다운 메뉴 버튼 가져오기
    const menuButtons = document.querySelectorAll('.nav-menu-btn');

    // 드롭다운 열기/닫기 토글
    menuButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parentItem = btn.closest('.nav-menu-item');
            const isOpen = parentItem.classList.contains('open');

            // 다른 열린 드롭다운 모두 닫기
            closeAllDropdowns();

            // 현재 클릭한 메뉴 토글
            if (!isOpen) {
                parentItem.classList.add('open');
            }
        });
    });

    // 페이지 아무 곳이나 클릭하면 드롭다운 닫기
    document.addEventListener('click', () => {
        closeAllDropdowns();
    });

    // 드롭다운 내부 클릭 시 이벤트 전파 방지 (메뉴가 닫히지 않도록)
    document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
        dropdown.addEventListener('click', (e) => {
            // 링크 클릭은 정상적으로 이동하되, 드롭다운 닫힘 방지는 하지 않음
        });
    });

    /**
     * 열려있는 모든 드롭다운을 닫는 함수
     */
    function closeAllDropdowns() {
        document.querySelectorAll('.nav-menu-item.open').forEach(item => {
            item.classList.remove('open');
        });
    }

    // 현재 페이지에 해당하는 메뉴 항목 활성화 표시
    highlightCurrentPage();

    /**
     * 현재 페이지 URL을 기준으로 메뉴 항목을 활성화(active) 하는 함수
     */
    function highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const currentFile = currentPath.split('/').pop();

        // 드롭다운 내부 링크 중 현재 파일과 일치하는 항목 활성화
        document.querySelectorAll('.nav-dropdown a').forEach(link => {
            const linkFile = link.getAttribute('href').split('/').pop();
            if (linkFile === currentFile) {
                link.classList.add('active');
                // 부모 메뉴 버튼도 활성화
                const parentBtn = link.closest('.nav-menu-item').querySelector('.nav-menu-btn');
                if (parentBtn) {
                    parentBtn.classList.add('active');
                }
            }
        });

        // index.html인 경우 첫 번째 메뉴(중1 수학)를 기본 활성화
        if (currentFile === 'index.html' || currentFile === '') {
            const firstMenuBtn = document.querySelector('.nav-menu-btn');
            if (firstMenuBtn && !document.querySelector('.nav-menu-btn.active')) {
                firstMenuBtn.classList.add('active');
            }
        }
    }
});
