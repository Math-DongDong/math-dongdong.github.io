/**
 * middleschool.js
 * 중학 수학 페이지의 상단 네비게이션 드롭다운 활성화 표시를 관리하는 스크립트
 */

document.addEventListener('DOMContentLoaded', () => {

    // 현재 페이지에 해당하는 메뉴 항목 활성화 표시 함수 실행
    highlightCurrentPage();

    /**
     * 현재 페이지 URL을 기준으로 메뉴 항목을 활성화(active) 하는 함수
     */
    function highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const currentFile = currentPath.split('/').pop();

        // 부트스트랩 드롭다운 내부 링크 중 현재 파일과 일치하는 항목 활성화
        document.querySelectorAll('.dropdown-item').forEach(link => {
            const linkFile = link.getAttribute('href').split('/').pop();
            if (linkFile === currentFile) {
                // 해당 링크에 active 클래스 추가
                link.classList.add('active');
                
                // 부모 드롭다운 버튼(dropdown-toggle)도 활성화 표시
                const parentDropdown = link.closest('.dropdown');
                if (parentDropdown) {
                    const toggleBtn = parentDropdown.querySelector('.dropdown-toggle');
                    if (toggleBtn) {
                        toggleBtn.classList.add('active');
                    }
                }
            }
        });
    }
});
