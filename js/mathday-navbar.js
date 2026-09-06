/* =========================================================
   Math Day 전용 네비게이션 바
   - 사용 위치: pages/middleschool/etc/mathday/*.html
   - 같은 폴더 내부 페이지끼리만 이동하는 독립 네비게이션
   - <body> 최상단에 <script src="../../../../js/mathday-navbar.js"></script>

   ★ 교사 로그인·관리자 메뉴는 표시하지 않습니다.
     Math Day 활동은 방을 만들거나 기록을 남기지 않아 교사 계정이 필요 없습니다.
     로그인 버튼이 있으면 학생이 눌러 볼 이유만 생깁니다.

     나중에 이 폴더의 어떤 페이지에 교사 대시보드가 생기면,
     그 페이지에서만 이렇게 켜면 됩니다.

         <script src="../../../../js/mathday-navbar.js" data-auth="true"></script>
   ========================================================= */
(function () {
  const currentScript = document.currentScript;

  // 사이트 루트까지의 상대 경로 (data-root 속성으로 덮어쓸 수 있음)
  const rootPath = currentScript.getAttribute('data-root') || '../../../../';

  // 교사 로그인 표시 여부. 기본은 '표시하지 않음'입니다.
  const showAuth = currentScript.getAttribute('data-auth') === 'true';

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

  // 교사 로그인 영역. 켜지 않으면 아예 만들지 않습니다.
  // 빈 <div>만 남겨 두면 teacher-auth.js 가 그 자리를 찾아 버튼을 그립니다.
  const authHtml = showAuth
    ? '<div id="teacher-auth-container" class="ms-auto d-flex align-items-center"></div>'
    : '';

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
    authHtml +
    '</div>' +
    '</div>' +
    '</nav>';

  currentScript.insertAdjacentHTML('afterend', navbarHtml);

  // teacher-auth.js 도 함께 불러오지 않습니다.
  // 로그인 상태를 확인하는 Firebase 연결 자체가 일어나지 않아,
  // 학생 기기에서 쓸데없는 요청이 줄어듭니다.
  if (showAuth && !document.querySelector('script[data-auth="teacher-auth"]')) {
    const authScript = document.createElement('script');
    authScript.type = 'module';
    authScript.dataset.auth = 'teacher-auth';
    authScript.src = `${rootPath}js/teacher-auth.js`;
    document.body.appendChild(authScript);
  }
})();