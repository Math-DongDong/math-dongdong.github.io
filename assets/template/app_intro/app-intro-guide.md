# 앱 소개 페이지 제작 가이드

`pages/automation/**` 아래에 있는 앱 소개 페이지(학생관리 앱, 자리배치 앱, 소감문 관리 앱 등)를 새로 만들거나 고칠 때 따르는 규칙입니다.
AI 에이전트에게 작업을 맡길 때도 이 문서와 템플릿 파일을 함께 알려 주세요. 사이트 전체 HTML 규칙은 `html-guide.md`를 함께 따릅니다.

- 템플릿: `assets/template/app_intro/app-intro-template.html`
- 완성 예시: `pages/automation/student/seatingarrangement.html`, `pages/automation/student/reviewmanagement.html`

---

## 1. 파일 위치

| 무엇 | 경로 | 예시 |
| --- | --- | --- |
| 소개 페이지 | `pages/automation/{분류}/{앱이름}.html` | `pages/automation/student/reviewmanagement.html` |
| 기능 이미지 | `assets/images/{플랫폼}/{앱이름}/` | `assets/images/appscript/reviewmanagement/` |
| 템플릿 | `assets/template/app_intro/app-intro-template.html` | |
| 가이드(이 문서) | `assets/template/app_intro/app-intro-guide.md` | |

- **분류**: `pages/automation` 안의 폴더 이름을 씁니다. (`class`, `student`, `work`)
- **플랫폼**: 구글 시트 + Apps Script 앱은 `appscript`, AppSheet 앱은 `appsheet`
- **앱이름**: 영문 소문자만 붙여 씁니다. 페이지 파일 이름과 이미지 폴더 이름을 똑같이 맞춥니다. (예: `seatingarrangement`)
- 페이지 안의 공통 파일 경로는 `../../../`로 시작합니다. `pages/automation/{분류}/` 기준으로 세 단계 위가 사이트 루트이기 때문입니다.

## 2. 반드시 넣는 공통 요소

빠지면 사이트 모양이나 캐러셀이 깨집니다. 템플릿에 모두 들어 있습니다.

| 위치 | 요소 |
| --- | --- |
| `<head>` | `meta charset`, `meta viewport`, `<title>` |
| `<head>` | 파비콘 `../../../assets/images/mainPage/동동이.jpg` |
| `<head>` | Bootstrap CSS `5.3.2`, Bootstrap Icons `1.11.1` (jsdelivr CDN) |
| `<head>` | 네비게이션바 CSS `../../../css/navbar.css` |
| `<style>` 첫 줄 | Pretendard `@import` (반드시 `<style>`의 맨 처음) |
| `<body>` 첫 줄 | `<script src="../../../js/navbar.js"></script>` |
| 본문 | `<main class="container py-4">` |
| `</body>` 바로 앞 | Bootstrap `5.3.2` bundle JS (캐러셀 작동에 필요) |

## 3. 페이지 구성 순서

1. **헤더**: `h1.fw-bold.text-primary` (아이콘 + 앱 이름), `p.text-muted.fs-6` 한 줄 소개
2. **기능 캐러셀**: `#featureCarousel`
3. **복사(다운로드) 및 배포 가이드**: 제목 오른쪽에 CTA 버튼, 아래에 번호 단계 카드
4. **데이터 관리 & 팁**: 팁 카드, 필요하면 주의 카드
5. (선택) 버튼이 안 될 때를 위한 안내 `alert alert-info` (appsheet.html 참고)

## 4. 컴포넌트 규칙

### 4-1. 기능 캐러셀

- 슬라이드 수와 indicator 버튼 수를 똑같이 맞춥니다. `data-bs-slide-to`는 `0`부터 빠짐없이 이어집니다.
- 첫 슬라이드(`carousel-item active`)와 첫 indicator(`class="active" aria-current="true"`)에만 active를 붙입니다.
- `data-bs-interval="30000"`(30초)로 둡니다. 사용자가 읽을 시간을 줍니다.
- indicator마다 `aria-label`에 기능의 짧은 이름을 넣습니다.
- 이미지는 `class="carousel-media"`, `alt`에는 화면이 보여 주는 내용을 적습니다.
- 두 번째 슬라이드부터 `loading="lazy"`를 붙입니다. 첫 화면이 빨리 뜹니다.
- 제목 `h4.fw-bold.text-dark`: 사용자가 할 수 있는 일을 한 줄로 씁니다.
- 설명 `p.text-secondary`: 1~2문장, 합니다체로 씁니다.
- 슬라이드 순서는 실제 사용 흐름을 따릅니다. (예: 학생 화면 → 교사 화면 → 보안/설정)

### 4-2. 단계 카드 `.guide-step`

| 클래스 | 색 | 쓰는 곳 | 동그라미 안 |
| --- | --- | --- | --- |
| `guide-step` | 파랑 | 순서대로 하는 설치 단계 | 숫자 |
| `guide-step guide-deploy` | 초록 | 웹 앱 배포 단계 | 숫자 |
| `guide-step guide-tip` | 연한 파랑 | 데이터 관리, 활용 팁 | 아이콘 (`bi-lightbulb-fill` 등) |
| `guide-step guide-warn` | 노랑 | 개인정보, AI 사용 등 꼭 읽을 주의 | `bi-exclamation-lg` |

- 숫자는 실제로 순서대로 해야 하는 과정에만 씁니다. 팁과 주의에는 아이콘을 씁니다.
- 내용이 긴 카드는 `step-content`에 `w-100`을 붙입니다.
- 하위 목록은 `ol`(순서 있음) 또는 `ul`(순서 없음)에 `class="ps-3 mb-2 text-secondary" style="line-height: 1.8;"`을 씁니다.
- 시트 열 안내는 흰 상자 안에 배지로 씁니다. `<span class="badge bg-primary me-2">A열</span> 번호 &nbsp;|&nbsp; ...`
- 보충 설명은 카드 끝에 `p.text-muted.small` + `bi-info-circle-fill` 아이콘으로 씁니다.

### 4-3. CTA(복사·다운로드) 버튼

- 클래스: `btn btn-primary fw-bold shadow-sm rounded-pill px-4`
- 새 창으로 엽니다: `target="_blank" rel="noopener noreferrer"`
- 구글 시트 템플릿: `https://docs.google.com/spreadsheets/d/{시트ID}/copy?usp=sharing`
  - 버튼 이름은 **구글 시트 템플릿 복사하기**, 아이콘은 `bi-file-earmark-spreadsheet`
- AppSheet 템플릿: AppSheet 템플릿 주소를 넣고, 버튼 이름은 **앱 다운받기**, 아이콘은 `bi-download`

## 5. 이미지 규칙

- 조작 과정을 보여 줄 때는 GIF, 한 화면을 보여 줄 때는 JPG를 씁니다.
- 파일 이름은 `번호. 기능 이름.확장자` 형식으로 씁니다. (예: `1. 소감문 작성.jpg`)
  - 번호는 캐러셀 순서와 같게 붙입니다. 폴더에서도 순서대로 보입니다.
  - 대괄호 `[ ]`, `#`, `?`, `%`는 쓰지 않습니다. 주소에서 문제가 될 수 있습니다.
  - 이름 앞뒤에 공백을 넣지 않습니다. (`랜덤 배치 .gif`처럼 끝에 공백이 들어가면 경로를 틀리기 쉽습니다)
- 페이지의 `src`와 실제 파일 이름은 띄어쓰기와 확장자(`.jpg`/`.JPG`)까지 똑같아야 합니다. GitHub Pages는 대소문자를 구분합니다.
- 캡처 너비는 1000~1300px 정도, 한 장에 300KB 안팎을 권장합니다.
- 캡처에 실제 학생 이름, 연락처, 비밀번호, API 키가 보이지 않게 합니다. 예시 학번과 예시 데이터로 찍습니다.

## 6. 문구 규칙

- 합니다체로 통일합니다. (`~할 수 있습니다`, `~하세요`)
- 버튼과 메뉴 이름은 `<strong>[버튼 이름]</strong>`으로 감싸고, 메뉴 경로는 `&gt;`로 잇습니다.
  - 예: `<strong>[확장 프로그램] &gt; [Apps Script]</strong>`
- 기능 설명은 사용자가 얻는 결과 중심으로 씁니다. 코드나 내부 구조 이름은 쓰지 않습니다.
- 앱 이름은 제목, 가이드 제목, 본문에서 같은 이름으로 씁니다.
- 앱 화면에 실제로 있는 버튼 이름과 똑같이 씁니다. 앱을 고쳐 버튼 이름이 바뀌면 소개 페이지도 함께 고칩니다.

## 7. Apps Script 앱 공통 안내 문구

아래 단계는 모든 Apps Script 앱에 공통이라 템플릿 문구를 그대로 씁니다. 앱마다 다른 준비 과정만 가운데에 끼워 넣습니다.

1. **구글 시트 템플릿 내 드라이브로 복사하기**
2. (앱마다 다름) 명단 입력, 커스텀 메뉴 실행, 환경설정 등록 등
3. **웹 앱(Web App)으로 배포하기**
   - 실행 권한: `나(내 계정)`
   - 액세스: 학생이 접속하는 앱은 `모든 사용자(Anyone)`, 교사만 쓰는 앱은 `나만`
   - 최초 권한 승인: [액세스 승인] > 계정 선택 > [고급] > [~(으)로 이동(안전하지 않음)] > [허용]
   - 코드를 고친 뒤: [배포] > [배포 관리] > 연필 아이콘 > 버전 [새 버전] > [배포] (주소 유지)
4. **웹 앱 URL로 접속 및 공유**

## 8. 구글 시트 템플릿 공유 전 점검표

소개 페이지의 [구글 시트 템플릿 복사하기] 버튼이 가리키는 시트를 준비할 때 확인합니다.

- [ ] 수업에서 쓰는 시트와 **따로** 공유용 시트를 만들었다. (예시 데이터만 들어 있음)
- [ ] 실제 학생 학번, 이름, 소감문, 비밀번호가 남아 있지 않다.
- [ ] 공유용 시트의 **스크립트 속성**(교사 비밀번호, API 키 등)을 모두 지웠다. 사본에 함께 복사될 수 있으므로 비워 둔 채로 공유합니다.
- [ ] 공유 설정이 `링크가 있는 모든 사용자` + `뷰어`로 되어 있다.
- [ ] 시트 주소의 `/edit...` 부분을 `/copy?usp=sharing`으로 바꾼 주소를 CTA 버튼에 넣었다.
- [ ] 로그아웃한 다른 계정(또는 시크릿 창)에서 버튼을 눌러 [사본 만들기] 화면이 뜨는지 확인했다.

## 9. 완성 전 점검표

- [ ] 템플릿 자리표시(중괄호 두 개로 감싼 부분)가 남아 있지 않다. 편집기에서 여는 중괄호 두 개를 붙여 검색해 확인합니다.
- [ ] 이미지 경로가 실제 파일 이름과 같다. (띄어쓰기, 확장자 대소문자 포함)
- [ ] 캐러셀 indicator 수 = 슬라이드 수, active는 첫 번째에만 있다.
- [ ] CTA 버튼 주소가 실제 템플릿 주소로 바뀌었다.
- [ ] `navbar.js`, `navbar.css`, 파비콘 경로가 `../../../`로 맞다.
- [ ] 스마트폰 폭(360px)에서 가로 스크롤이 생기지 않는다.
- [ ] 페이지에 적은 버튼·메뉴 이름이 실제 앱 화면과 같다.
- [ ] 사이트의 목록 페이지나 네비게이션에 새 페이지 링크를 추가했다. (필요한 경우)
- [ ] 사이트 폴더 안의 md 파일에 여는 중괄호 두 개, 또는 중괄호와 퍼센트 기호를 붙인 글자가 없다. (11번 참고)

## 10. AI 에이전트에게 맡길 때 요청 예시

```text
assets/template/app_intro/app-intro-guide.md 규칙을 따르고 assets/template/app_intro/app-intro-template.html 을 복사해서
pages/automation/{분류}/{앱이름}.html 소개 페이지를 만들어 줘.

- 앱 이름: {예) 학생 소감문 관리 앱}
- 한 줄 소개: {무엇과 연동해 무엇을 할 수 있는지}
- 플랫폼: {Apps Script / AppSheet}
- 이미지 폴더: assets/images/{플랫폼}/{앱이름}/
- 이미지 파일 목록(캐러셀 순서대로): {1. ○○.gif, 2. ○○.jpg ...}
- 템플릿 복사 주소: {https://docs.google.com/spreadsheets/d/.../copy?usp=sharing}
- 가운데 준비 단계에 꼭 들어갈 내용: {명단 입력 열, 메뉴 이름, 환경설정 항목 등}
- 데이터 관리 & 팁에 넣을 내용: {시트 탭별로 쌓이는 데이터, 주의할 점}
- 참고할 앱 코드: {code.gs, index.html 등 경로}

완성하면 9번 완성 전 점검표를 하나씩 확인하고 결과를 알려 줘.
```

## 11. GitHub Pages(Jekyll)에서 배포가 멈추지 않게

이 사이트는 GitHub Pages가 Jekyll로 만듭니다. Jekyll은 md 파일과 맨 위에 `---` 앞머리가 있는 파일을 Liquid 문법으로 먼저 읽습니다. 그래서 아래 글자가 들어가면 배포가 `Liquid syntax error`로 멈춥니다.

- md 파일에는 **여는 중괄호 두 개를 붙여 쓰지 않습니다.** 중괄호와 퍼센트 기호를 붙여 쓰는 것도 마찬가지입니다. 코드 블록이나 백틱 안에 써도 똑같이 오류가 납니다.
- md에서 자리표시가 필요하면 중괄호 하나만 씁니다. (예: `{앱이름}`)
- 템플릿 HTML처럼 중괄호 두 개 자리표시를 쓰는 HTML 파일에는 맨 위에 `---` 앞머리를 넣지 않습니다. 앞머리가 없는 HTML은 Jekyll이 손대지 않고 그대로 복사하므로 괜찮습니다.
- 점(.)이나 밑줄(_)로 시작하는 폴더는 Jekyll이 배포에서 뺍니다. 사이트에 올릴 필요가 없는 개발용 문서는 이런 폴더(예: `.agents`)에 두어도 됩니다.
- 푸시하기 전에 md 파일에서 여는 중괄호 두 개, 중괄호와 퍼센트 기호를 붙인 글자를 검색해 봅니다.

---

## 부록 A. 지금 있는 앱 소개 페이지

| 페이지 | 플랫폼 | 다운로드 방식 | 캐러셀 |
| --- | --- | --- | --- |
| `pages/automation/student/appsheet.html` | AppSheet | AppSheet 템플릿 [Copy and Customize] | 4장 |
| `pages/automation/student/seatingarrangement.html` | Apps Script | 구글 시트 템플릿 복사 | 8장 |
| `pages/automation/student/reviewmanagement.html` | Apps Script | 구글 시트 템플릿 복사 | 9장 |

## 부록 B. 소감문 관리 앱(reviewmanagement) 이미지 목록

`assets/images/appscript/reviewmanagement/` 폴더, 캐러셀 순서대로입니다.

| 파일 이름 | 보여 주는 화면 |
| --- | --- |
| `1. 소감문 작성.jpg` | 학생: 활동을 골라 소감문 작성 |
| `2. 소감문 목록 및 피드백 확인.jpg` | 학생: 내 글 목록과 선생님 피드백 |
| `3. 활동 추가.gif` | 교사: 날짜와 활동명으로 활동 추가 |
| `4. 소감문 내역 조회.gif` | 교사: 활동별 제출 현황, 학번별 조회 |
| `5. AI 피드백 생성.jpg` | 교사: 선택한 글에 AI 피드백 일괄 생성 |
| `6. 교사시점 변환.jpg` | 교사: 교사 시점 일괄 변환 |
| `7. 교사시점 글 모아보기.jpg` | 교사: 학생별 교사 시점 글 표 (활동 날짜 범위·학번으로 좁히기), 엑셀 다운로드 |
| `8. 학생 비밀번호 초기화.gif` | 교사: 학생 비밀번호 초기화 |
| `9. 스크립트 속성.jpg` | 보안: 환경설정(스크립트 속성) 등록 창 |

소감문 관리 앱 소개 페이지의 가운데 준비 단계는 다음 순서입니다. 앱 메뉴나 설정 항목이 바뀌면 이 부분을 함께 고칩니다.

1. [📚 소감문 관리] > [DB 세팅 및 초기화]: 안전 세팅 또는 전체 초기화 (환경설정, 학생소감문, 프롬프트 탭)
2. [📚 소감문 관리] > [환경설정]: 교사 비밀번호(필수), 학생 초기 비밀번호, Gemini API 키, Gemini 모델 이름, AI 요청 간격
3. `환경설정` 탭 A열에 학번 입력 (B열 패스워드는 비워 두면 초기 비밀번호)