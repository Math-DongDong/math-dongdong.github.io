/* =========================================================
   Math Day 전용 네비게이션 바
   - 사용 위치: pages/middleschool/etc/mathday/*.html
   - 같은 폴더 내부 페이지끼리만 이동하는 독립 네비게이션
   - <body> 최상단에 <script src="../../../../js/mathday-navbar.js"></script>
   ========================================================= */
(function () {
  const currentScript = document.currentScript;

  // 사이트 루트까지의 상대 경로 (data-root 속성으로 덮어쓸 수 있음)
  const rootPath = currentScript.getAttribute('data-root') || '../../../../';

  // 메뉴 목록: 파일을 추가하면 이 배열에만 항목을 넣으면 됩니다.
  const menuItems = [
    { file: 'memorize.html', label: 'π 외우자!', icon: 'bi-lightbulb' },
    { file: 'stopwatch.html', label: 'π×10초 멈춰라!', icon: 'bi-stopwatch' },
    { file: 'slider.html', label: 'π×10 맞추기!', icon: 'bi-sliders' },
    { file: 'circle.html', label: '완벽한 원 그리기', icon: 'bi-circle' },
  ];

  const currentFile = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const menuHtml = menuItems.map(function (item) {
    const isActive = item.file.toLowerCase() === currentFile;
    return '<li class="nav-item">' +
      '<a class="nav-link' + (isActive ? ' active' : '') + '" href="' + item.file + '"' +
      (isActive ? ' aria-current="page"' : '') + '>' +
      '<i class="bi ' + item.icon + ' me-1"></i>' + item.label +
      '</a></li>';
  }).join('');

  const navbarHtml =
    '<nav class="navbar navbar-expand-lg mathday-navbar sticky-top">' +
    '<div class="container-fluid px-3 px-lg-4">' +
    '<a class="navbar-brand d-flex align-items-center gap-2" href="index.html">' +
    '<span class="brand-pi">π</span><span>Math Day!</span>' +
    '</a>' +
    '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" ' +
    'data-bs-target="#mathdayNavMenu" aria-controls="mathdayNavMenu" ' +
    'aria-expanded="false" aria-label="메뉴 열기">' +
    '<span class="navbar-toggler-icon"></span>' +
    '</button>' +
    '<div class="collapse navbar-collapse" id="mathdayNavMenu">' +
    '<ul class="navbar-nav ms-lg-3 align-items-lg-center">' +
    menuHtml +
    '</ul>' +
    '<div id="teacher-auth-container" class="ms-auto d-flex align-items-center"></div>' +
    '</div>' +
    '</div>' +
    '</nav>';

  currentScript.insertAdjacentHTML('afterend', navbarHtml);

  if (!document.querySelector('script[data-auth="teacher-auth"]')) {
    const authScript = document.createElement('script');
    authScript.type = 'module';
    authScript.dataset.auth = 'teacher-auth';
    authScript.src = `${rootPath}js/teacher-auth.js`;
    document.body.appendChild(authScript);
  }
})();
