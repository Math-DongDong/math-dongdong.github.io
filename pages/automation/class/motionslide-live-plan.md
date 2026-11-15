# 모션 슬라이드 — 학생과 함께 보기 · 의견 모으기 설계

> **상태**: 구상만 끝남 (구현 전) · **작성일**: 2026-11-15 · **대상 파일**: `motionslide.html` (같은 폴더)
>
> 나중에 이 기능을 만들 때 이 문서만 보고 시작할 수 있게, 대화에서 정한 결정과 기존 코드의 연결 지점, 데이터 구조, 보안 규칙 초안, 비용 계산, 단계별 작업 목록을 모았습니다.
> 코드 위치는 줄 번호가 바뀌므로 **객체·함수 이름**으로 적었습니다. `motionslide.html`에서 이름으로 검색하세요.

---

## 0. 한눈에 보기

| 기능 | 하는 일 |
|---|---|
| **함께 보기** | **관리자만** 쓰는 기능입니다. 발표자 모드에서 방을 열면 QR·방 코드가 뜹니다. 학생은 모션 슬라이드 메인 페이지의 **[함께 보기]** 단추(AI 설정 왼쪽)를 눌러 코드를 입력하고 들어와, 교사가 넘기는 장·단계를 그대로 따라 봅니다. |
| **의견 모으기** | 슬라이드에 [의견 모으기 판]을 올려 두면, 학생이 직접 입력한 글·선택·숫자가 그 판에 실시간으로 쌓입니다. 인터랙티브 요소의 결과값을 코드로 바로 받는 기능은 **넣지 않습니다**(오류 위험, D13). 학생이 조작한 뒤 값을 직접 적어 냅니다. |

**목적**: 함께 보기는 **의견 모으기 판을 쓰기 위한 수단**입니다(D16).

**핵심 구조 (A 방식, D15)**
- 슬라이드 내용 → **Firebase Storage**: 방을 열 때 **덱 전체를 파일 하나로** 올리고, 학생은 입장할 때 한 번 받습니다.
- 진행 신호(몇 번째 장·몇 단계) → **Realtime Database(RTDB)**: 아주 작은 값만 씁니다. 학생은 받아 둔 덱에서 그 장을 꺼내 그립니다.
- 학생 의견 → 수업 중에는 **RTDB**에 쌓이고, 함께 보기를 끝낼 때 **덱 안의 의견 판에 결과로 저장**됩니다(D17). 그래서 이후 [Firebase Storage에 저장]·HTML 내보내기·자동 저장에 의견이 함께 들어가고, 다시 불러오면 판에 그대로 보입니다.
- 학생 화면은 받은 HTML을 **자기 브라우저에서 직접 그립니다**. 파일이 기기에 저장되지는 않습니다.

---

## 1. 목표와 범위

### 하는 것
- 관리자 발표자 모드 ↔ 학생 기기의 장·단계 동기화
- 학생 입장: 모션 슬라이드 메인 페이지 [함께 보기] → 코드 입력 창. QR을 찍으면 코드가 자동으로 채워짐. 접속 인원 표시
- 수업 중 고친 덱의 재전송
- 의견 모으기 판: 짧은 글 · 선택지 · 숫자(+분포), 바로 쓸 수 있는 예시(7.8)
- 교사 제어: 제출 열기·닫기, 결과 공개·숨기기, 의견 숨기기, 초기화, CSV 저장
- **함께 보기를 끝낼 때 의견을 덱에 저장** → [Firebase Storage에 저장]으로 의견까지 보관하고 다시 불러오기(7.10)
- 수업이 끝난 뒤 정리(삭제)

### 하지 않는 것 (또는 뒤로 미룸)
- 승인된 교사(관리자가 아닌)의 함께 보기 사용 → 관리자 전용(D11)
- **인터랙티브 요소의 결과값을 코드로 바로 제출**(`lsSubmit` 같은 통로) → 하지 않음(D13)
  - AI가 쓴 코드가 제출 함수를 늘 정확히 부른다는 보장이 없고, 잘못되면 수업 중에 오류가 납니다. 대신 학생이 조작해 본 뒤 그 값을 의견 판에 **직접 입력**합니다(7.8의 예시 4·5).
- 교사가 인터랙티브 요소를 조작하는 모습을 학생 기기에 똑같이 보이기
  - 입력 이벤트를 네트워크로 흘려야 해서 무겁고 잘 어긋납니다. 학생은 **각자 자기 기기에서 조작**합니다.
- 동영상을 학생 기기에서 함께 재생하기 (소리가 겹치고 시간이 어긋남 → 정지 화면만)
- 내보낸 HTML 파일(오프라인)에서의 실시간 기능 (Firebase·방이 필요해 웹 편집기에서만)
- 레이저·하이라이트 동기화, 학생 자유 넘기기, 워드클라우드 → 4단계(선택)

---

## 2. 대화에서 정한 결정

| # | 결정 | 이유 |
|---|---|---|
| D1 | ~~장마다 올리는 C 방식~~ → **D15(A 방식)로 바뀜** | — |
| D2 | 진행 신호는 **RTDB** (Firestore 아님) | Firestore는 리스너 하나마다 읽기 1건이 쌓임(30명 × 넘김 횟수). 하루 5만 건 한도를 사이트의 다른 게임과 함께 씀 |
| D3 | 덱 파일은 **방을 닫을 때까지 지우지 않음** | 늦게 들어오거나 새로고침한 학생도 받을 수 있음 |
| D4 | 수업 중 의견은 덱 파일과 **따로** RTDB에 저장 | 장을 오가거나 덱을 고쳐 다시 올려도 의견이 유지됨 |
| D5 | **"잠시 멈춤"과 "함께 보기 끝내기"를 나눔** | 실수로 발표를 끝냈거나 쉬는 시간 뒤에 같은 코드로 다시 들어올 수 있어야 함 |
| D6 | 방을 닫을 때 **의견을 덱에 저장한 뒤**(D17) 덱 파일·RTDB 의견을 모두 삭제 | 의견은 덱 안에 남으므로 서버에 오래 둘 필요가 없음 |
| D7 | ~~의견 30일 보관~~ → D17로 의견이 덱에 남으므로 **서버 보관 기한 없음**. 시간 기준 자동 정리도 두지 않고, [함께 보기 끝내기]에서만 서버를 정리(10장) | 사용자 결정. 서버 정리가 단순해짐 |
| D8 | QR은 학생이 **카메라로 찍는** 것. 찍으면 `motionslide.html#/live/{코드}`가 열려 코드 입력 창이 채워진 채로 뜸. 방 코드는 카메라가 없는 기기용 | 학생이 주소를 몰라도 되고, 코드를 잘못 칠 일이 없음 |
| D9 | 동영상은 학생 기기로 보내지 않고 자리표시만 | 영상이 슬라이드 안에 data URL로 들어 있어 장 하나가 수십 MB가 될 수 있음 |
| D10 | 학생 화면의 인터랙티브 요소는 **각자 조작** | 미러링은 무겁고, 직접 조작이 수업에도 더 맞음 |
| D11 | 함께 보기(방 열기)는 **관리자 전용** | 사용자 결정. 화면 표시는 기존 `window.SlideCloud.isAdmin`(teacher-auth의 `isAdmin` + `ADMIN_EMAIL`)과 같은 조건, 실제 권한은 보안 규칙이 정함 |
| D12 | 학생 입장은 **별도 페이지 없이 `motionslide.html` 안에서**: 메인 페이지 **[AI 설정] 왼쪽 [함께 보기]** → 코드 입력 창 → 학생 보기 화면 | 사용자 결정. 학생은 Gemini 키가 없으므로 키 없을 때의 메인(`#home-setup`)과 휴대폰 화면(`#mobile-block`)에도 단추를 둠 |
| D13 | 인터랙티브 결과값의 **코드 제출은 제외**, 학생이 직접 입력 | 사용자 결정. AI 생성 코드의 오류 위험 |
| D14 | 학생 입장은 기존 게임의 **빠른 입장 모드처럼 방 코드만** 입력. 닉네임은 자동 발급(`room-auth.js`의 형용사+동물 닉네임). 학번·PIN 인증은 쓰지 않음 | 사용자 결정. 입장이 가장 빠르고 다른 게임과 같은 경험 |
| D15 | 내용 전송은 **A 방식**: 방을 열 때 덱 전체를 파일 하나로 올리고, 학생은 입장할 때 한 번 받아 진행 신호에 맞춰 그 장만 그림 | 사용자 결정. 넘김이 바로 되고 구현이 단순함. 사용량은 C와 비슷함 |
| D15-1 | A의 한계: **뒤쪽 장을 정상적인 방법으로는 못 보지만**, PC에서 개발자 도구(F12)로는 볼 수 있음. 휴대폰·태블릿은 사실상 불가능 | 걸림돌 두 가지를 둠: ① 덱은 메모리에만 두고 화면(DOM)에는 지금 장만 넣음 ② 덱 파일을 간단히 뒤섞어 저장(난독화). 마음먹은 학생까지 막지는 못함 |
| D16 | 함께 보기의 목적은 **의견 모으기 판 사용** | 사용자 설명. 기능 우선순위를 의견 모으기에 둠 |
| D17 | 함께 보기를 끝낼 때 학생 의견을 **덱 안의 의견 판(`data-board`의 `results`)에 저장** → 이후 [Firebase Storage에 저장]·HTML 내보내기·자동 저장에 함께 들어가고, 불러오면 판에 보임 | 사용자 요청. 저장 경로를 새로 만들지 않고 기존 저장·불러오기를 그대로 씀 |

> **정정 기록**: 대화 중 "room-registry가 오래된 방을 정리한다"고 말한 것은 사실이 아닙니다. 지금 `js/room-registry.js`에는 **시간 기준 정리 기능이 없습니다**(10장 참고). 이 기능을 만들 때 새로 추가해야 합니다.

---

## 3. 전체 구조

```
 [관리자 PC: motionslide.html 발표자 모드]
   │  방 열기 ──► 덱 전체를 deck.json 하나로 Storage에 올림 (덱을 고치면 새 버전으로 다시 올림)
   │  Show.go / next / prev  ──►  Live.sync() ──► RTDB live/{code}/state 에 {slideId, step, deckV} 씀
   │  의견 판: RTDB responses 구독 → 발표자 미리보기·청중 창에 그림
   │  함께 보기 끝내기 ──► 의견을 덱의 판(data-board.results)에 저장 ──► [Firebase Storage에 저장]으로 보관
   │
   ├──► Firebase Storage   live_slides/{code}/deck.css
   │                       live_slides/{code}/deck.json        ← 덱 전체(난독화), 버전 deckV
   ├──► RTDB (전용 인스턴스) live/{code}/{createdBy,status,…,state,boards,responses,hidden}
   │                       live_index/{code}
   └──► Firestore           room_registry/...            ← rtdbRoom().createRoom()이 자동 등록(기존 방 목록)

 [학생 기기: motionslide.html 메인 → [함께 보기] → 코드 입력, 닉네임 자동  (QR이면 #/live/CODE 로 바로)]
   입장 → 학생 보기 화면(#live-view) → deck.css · deck.json 받기(메모리에만) → state 구독
     → state.deckV가 받아 둔 것과 다르면 deck.json 다시 받기
     → 덱에서 state.slideId 장만 꺼내 캔버스에 그리기 → 단계 적용
     → 열린 의견 판이 있으면 아래쪽 입력칸 → responses/{boardId}/{deviceTag} 에 씀
```

---

## 4. 기존 코드 재사용 지도

| 필요한 것 | 기존 코드 | 쓰는 법 / 주의 |
|---|---|---|
| 방 코드 만들기 | `js/game-kit.js` `generateRoomCode()` | 헷갈리는 O/0, I/1을 뺀 4자리 |
| RTDB 방 + 목록 + 등록 | `game-kit.js` `rtdbRoom(db, { roomsPath, indexPath })` | `createRoom()`이 방·인덱스를 만들고 `registerRoom()`까지 합니다. 방 만든 사람은 `window.currentTeacherUid`(관리자도 이 값이 채워짐) |
| 방 정리(삭제) | `js/room-registry.js` `purgeRoomParts` · `unregisterRoom` · `findMyRooms` | RTDB 부분은 `purgeRoomParts`로, Storage 장 파일은 `deleteStorageFolder`로 따로 지웁니다(parts의 `storage`는 Firestore part에만 붙는 형식이라) |
| 학생 입장 창 | **새로 만듦** (`motionslide.html`의 Bootstrap 모달) | 기존 `renderRoomEntrance`는 게임용 카드 UI라 쓰지 않습니다. 코드 4자리 입력 방식(대문자 변환, 공백 제거)만 따라 합니다 |
| 화면 이동(라우팅) | `motionslide.html`의 해시 라우터(`#/`, `#/edit/{id}`)와 `MobileView.route` | `#/live/{code}`를 더합니다 |
| 메인 페이지 단추 자리 | `#home-actions`(키 있음)·`#home-setup`(키 없음)의 `[data-act="settings"]` 바로 앞, `#mobile-block`의 단추 줄 | 학생은 키가 없으므로 세 곳 모두에 둡니다 |
| 관리자 판단 | `window.SlideCloud.isAdmin` (`teacherAuthChanged` 이벤트에서 `isAdmin` + `ADMIN_EMAIL`로 정함), `CloudUI.sync()`의 `.cloud-only` 표시 방식 | 발표자 바의 [학생과 함께 보기]도 같은 방식으로 관리자에게만 보입니다 |
| 학생 기기 식별 | `room-auth.js` `getRoomDeviceTag(roomCode)` | 방마다 다른 16자리 해시. 누구나 읽는 칸에 써도 되게 만든 값 (가져오면 room-auth 전체가 로드되므로, 같은 계산을 작은 함수로 옮겨 써도 됨) |
| 접속 인원 | `game-kit.js` `startRoomPresence(gameKey, code, nickname)` · `watchRoomPresence` | 접속 전용 RTDB(`rtdbPresence`) |
| QR | `js/qr-modal.js` (참고만) | 대시보드의 방 `<select>`에 묶여 있어 그대로는 못 씁니다. 같은 라이브러리(cdnjs `qrcodejs 1.0.0`)와 `buildJoinUrl` 방식을 따라 만듭니다. |
| 로그인 상태 | `js/teacher-auth.js` (`motionslide.html`이 이미 불러옴) | `window.isAdmin` · `currentTeacherUid`, 이벤트 `teacherAuthChanged`. 학생은 로그인하지 않습니다 |
| Firebase 초기화 | `js/firebase-config.js` | App Check(reCAPTCHA v3) 포함. 새 RTDB 인스턴스를 쓰면 여기에 추가해 export |
| Storage | `js/firebase-storage.js` `storage` · `deleteStorageFolder(path)` | 지금 규칙은 `custom_forms/...`와 관리자용 `motion_slides`만 허용 → 경로 추가 필요 |
| Storage 저장 예시 | `motionslide.html` 아래쪽 `window.SlideCloud` (관리자 전용, `motion_slides/`) | `uploadString` · `getBlob` 사용법, CORS 오류 안내(`CloudUI.errorText`) 참고 |
| RTDB 의견 수집 예시 | `pages/aimath/text/sentimentanalysis.html` | `rtdbRoom(db)` + `push` + `onValue`로 학생 글을 모으는 같은 형태 |
| 발표 진행 | `motionslide.html` `Show` (`enter` · `exit` · `go` · `next` · `prev` · `paint` · `applyStep` · `openAudience` · `popup` · `canvases`) | 신호를 쓰는 연결점 |
| 학생에게 보낼 장 형태 | `Exporter.view(slide)` → `{ cls, css, html }` | 인터랙티브 코드(`data-code`)를 빼고, 격리 iframe(srcdoc)과 그려 둔 SVG로 바꿉니다. **시나리오(notes)는 들어가지 않습니다.** |
| 보기 화면 코드 | `exportRuntime()` 안 `fillCanvas` · `freeze`, 편집기의 `fitStage(host, scaler, pad)` | 학생 보기 화면은 편집기 안이므로 `fitStage`를 그대로 쓰고, `view`를 캔버스에 넣는 부분만 `fillCanvas`를 본떠 만듭니다(`SlideView.fill`은 원본 slide용이라 쓰지 않음) |
| 단계별 공개 | 공용 ES5 함수 `slideSteps(canvas)` · `applySteps(canvas, step, replay)` | 그대로 씁니다 |
| 슬라이드 공용 CSS | `<style id="ls-slide-css">` | 방을 열 때 `deck.css`로 올려, 학생 기기에 캐시된 옛 `motionslide.html`과 관리자 쪽 버전이 어긋나지 않게 합니다 |
| 인터랙티브 칸 통신 | `appBridge(seed)` (srcdoc 안에 `toString()`으로 넣음), 메시지 `lsApp: escape · nav · evt · snapshot · replay` | **바꾸지 않습니다**(D13). 학생 보기 화면에서는 칸이 보내는 `nav`·`escape`를 무시합니다 |
| 인터랙티브 격리 | `AppKit` (`sandbox="allow-scripts"`, `AppKit.CSP`가 네트워크를 막음) | 학생 기기에서도 그대로 격리된 채 실행됩니다 |
| HTML 정리 | `Sanitizer.clean()` (DOMPurify), `RESERVED_CLASS` | `ls-`로 시작하는 class는 지워집니다. data 속성은 `ADD_ATTR`에 있는 것만 남습니다(`ALLOW_DATA_ATTR: false`). |
| 덱 저장소 | `DeckStore` (IndexedDB `htmlSlideStudio`) | 덱은 교사 브라우저에만 있음 → 방을 열 때 올려야 함 |

---

## 5. 데이터 구조

### 5.1 Firestore — 따로 두지 않음
- 방을 여는 사람이 관리자 한 명뿐이라(D11), Storage·RTDB 규칙은 "관리자인가"만 확인하면 됩니다. 소유자 확인용 Firestore 방 문서가 필요 없습니다.
- 방 목록 `room_registry` 등록은 `rtdbRoom().createRoom()`이 자동으로 합니다(기존 방식).
- 방 상태는 RTDB 방 노드에 둡니다(Firestore 쓰기 건수를 쓰지 않음).

### 5.2 Storage
```
live_slides/{code}/deck.css      // ls-slide-css 내용(방을 열 때 1번)
live_slides/{code}/deck.json     // 덱 전체(A 방식, D15). 덱을 고치면 덮어씀
```

**deck.json 형식** (저장할 때는 아래 JSON을 뒤섞어(난독화) 올림, 5.2-1)
```json
{
  "format": 1,
  "deckV": "9f3a1c2e",        // 본문의 SHA-256 앞 8자리. 바뀌면 학생이 다시 받음
  "title": "일차방정식의 활용",
  "slides": [
    {
      "id": "s_ab12cd",
      "bg": "#ffffff",
      "view": { "cls": "slide-canvas", "css": "…범위가 한정된 CSS…", "html": "…" },
      "maxStep": 3,
      "boards": ["b_k3x9q2"]
    }
  ]
}
```
- **넣지 않는 것**: `notes`(발표자 시나리오), `data-code`(인터랙티브 원본 코드), `<video>` data URL(→ 자리표시), 판의 지난 수업 `results`(학생에게 보낼 필요 없음, 7.10)
- 만드는 법: 장마다 `Exporter.view(slide)` → 영상 자리표시로 바꿈(6.6) → 모아서 JSON → 해시 계산 → 뒤섞기
- 업로드: `uploadString(ref, text, 'raw', { contentType: 'application/json; charset=utf-8', cacheControl: 'private, max-age=0' })`
  - 같은 이름에 덮어쓰므로 캐시를 끕니다. 학생은 `state.deckV`로 새 버전인지 판단합니다.

**5.2-1 걸림돌 (뒤쪽 장 미리 보기 줄이기, D15-1)**
- **뒤섞기(난독화)**: JSON 문자열을 간단한 방식(예: 방 코드에서 만든 키로 XOR 후 base64)으로 바꿔 올립니다. 네트워크 탭에서 열어도 바로 읽히지 않습니다. 보안 장치가 아니라 **호기심에 F12를 눌러 보는 정도를 막는 걸림돌**입니다.
- **화면에는 지금 장만**: 받은 덱은 자바스크립트 변수(메모리)에만 두고, 캔버스에는 교사가 넘긴 장만 넣습니다. 개발자 도구의 요소(Elements) 탭에는 지금 장만 보입니다.
- 학생 화면 코드에서 덱 변수를 `window`에 걸지 않습니다(콘솔에서 바로 꺼내 보지 못하게).

### 5.3 RTDB (전용 인스턴스 권장, 예: `motionslide-live` asia-southeast1)
```
live/{code}/
  createdBy, creatorName, creatorSchool, createdAt     // rtdbRoom().createRoom()이 방 노드 바로 아래에 씀
  title
  status: 'live' | 'paused' | 'closed'                 // rtdbRoom().exists(code, 'status')가 확인하는 칸
  state: { slideId, index, total, step, deckV, at }    // 관리자만 씀
  boards/{boardId}: {
      slideId, kind, question, options[], min, max, unit, open: bool, reveal: bool,
      anonymous: bool, allowEdit: bool, resetAt }        // 관리자만 씀
  responses/{boardId}/{deviceTag}: {
      nick, value, text, at }                            // 학생이 자기 칸에 씀
  hidden/{boardId}/{deviceTag}: true                     // 교사가 숨긴 의견
  pointer: { x, y, at }                                  // (4단계 선택) 레이저
live_index/{code}: { createdBy, creatorName, creatorSchool, title, createdAt }
```
- `rtdbRoom(rtdbLive, { roomsPath: 'live', indexPath: 'live_index' })` 로 만들면 방 목록·등록이 기존 방식과 맞습니다.
  - 방을 지울 때는 `deleteStorageFolder('live_slides/' + code)` → `purgeRoomParts(code, parts)` → `unregisterRoom(code, parts)` 순서입니다.
  - `createRoom(code, roomData, indexData)`는 `set(live/{code}, { createdAt, createdBy, creatorName, creatorSchool, ...roomData })`로 **방 노드 전체**를 씁니다. 그래서 소유자·상태 칸은 `meta/` 아래가 아니라 방 노드 바로 아래에 둡니다(8.3 규칙도 이 모양 기준).
- `responses`를 `boardId` 아래에 두는 이유: 교사·청중 창이 판 하나만 구독하고, 공개 여부(`reveal`)를 판 단위로 규칙에서 확인하기 위해서입니다.

### 5.4 크기·형식 제한 (규칙과 앱 양쪽에서 확인)
| 항목 | 제한 |
|---|---|
| deck.json | 30MB 미만 (영상을 빼면 20장에 보통 수 MB). 넘으면 방을 열 때 "그림이 너무 커요"로 안내 |
| `text` | 200자 |
| `value` | 숫자(유한값) 또는 80자 이하 글 |
| `nick` | 20자 |
| `deviceTag` | `^[0-9a-f]{16}$` 또는 `^h[0-9a-f]{16}$` (`getRoomDeviceTag`의 대체 해시) |
| 제출 빈도 | 같은 기기 1초에 1번 (앱에서 막고, 규칙은 `at`이 직전 값보다 1000ms 이상 큰지 확인) |

---

## 6. 기능 1 — 함께 보기

### 6.1 교사 흐름
1. 발표자 모드(`Show.kind === 'presenter'`) 상단 바에 **[학생과 함께 보기]** 단추를 둡니다(`data-pv="live"`).
   - **관리자에게만 보입니다**(D11). `window.SlideCloud.isAdmin`이 참일 때만 표시하고(`.cloud-only`와 같은 방식), 실제 쓰기 권한은 보안 규칙이 확인합니다.
2. 처음 누르면:
   - 같은 덱으로 연 방 중 `status !== 'closed'`인 방이 있으면 → **[이어서 하기] / [새 방]** 을 묻습니다.
   - 새 방이면 `rtdbRoom.newCode()` → `createRoom()` + `deck.css`·`deck.json` 업로드(6.3) → `boards` 메타 → `state`를 씁니다.
   - 덱 업로드는 크기에 따라 몇 초 걸릴 수 있어 "학생 화면 준비 중…(n%)"을 보입니다(`uploadBytesResumable`로 진행률).
3. 청중 창(`Show.popup`)에 **QR + 방 코드 + 안내 문구**를 크게 덮어 보입니다.
   - QR 주소: `{사이트}/pages/automation/class/motionslide.html#/live/{code}`
   - 안내 문구: "QR을 찍거나, AI 모션 슬라이드 첫 화면의 [함께 보기]를 눌러 코드를 입력하세요"
   - 학생이 다 들어오면 [QR 닫기]. 발표자 바에서 언제든 다시 띄울 수 있게 합니다.
4. 발표자 바에 **접속 인원**(`watchRoomPresence`)과 전송 상태(보내는 중 / 보냄 / 실패)를 작게 표시합니다.
5. 진행은 평소처럼 하면 됩니다. 넘길 때마다 6.3·6.4가 자동으로 동작합니다.
6. **[편집 모드로]·Esc**(`Show.exit`) → 방은 **잠시 끄기**(`live/{code}/status = 'paused'`). 학생 화면에는 "선생님이 발표를 잠시 멈췄어요"가 뜹니다.
7. **[함께 보기 끝내기]**(발표자 바의 함께 보기 메뉴) → 의견을 덱에 저장(7.10) → 서버 정리(10장). 이후 평소처럼 **[Firebase Storage에 저장]**을 누르면 의견까지 보관됩니다.

### 6.2 학생 흐름 (새 페이지 없이 `motionslide.html` 안에서, D12)

**입장 단추 자리** — 학생은 Gemini 키가 없으므로 아래 세 곳 모두에 둡니다.
| 화면 | 위치 |
|---|---|
| 메인, 키 있음 `#home-actions` | `[AI 설정]` 단추 **바로 왼쪽** |
| 메인, 키 없음 `#home-setup` | `[AI 설정]` 단추 **바로 왼쪽** (학생은 대부분 이 화면) |
| 휴대폰 `#mobile-block` | `[파일 불러오기]` 줄의 맨 앞 (휴대폰은 메인 대신 이 화면이 뜸) |

```html
<button type="button" class="btn btn-outline-success" data-act="live-join"><i class="bi bi-people"></i> 함께 보기</button>
```

**입장 창 (Bootstrap 모달 `#live-join-modal`)**
```
┌ 함께 보기 ───────────────────────┐
│ 선생님 화면에 보이는 코드를 입력하세요 │
│ [ A B 3 K ]   ← 4자리, 자동 대문자    │
│              [취소] [입장하기]       │
└──────────────────────────────────┘
```
- **빠른 입장 모드와 같은 방식**(D14): 방 코드만 받습니다.
- 코드: 공백 제거·대문자 변환·4자리. 틀리면 "열려 있는 수업이 없어요. 코드를 다시 확인해 주세요"
- 닉네임: 입장하면 자동 발급(`room-auth.js`의 `getRoomNickname` · `rerollRoomNickname` · `claimRoomNickname` 방식, 예: "용감한 수달"). 같은 기기·같은 방이면 다시 들어와도 같은 닉네임. 학생 보기 화면 위쪽에 "내 닉네임: 용감한 수달"을 보입니다.
- QR로 들어오면(`#/live/{code}`) 코드가 채워진 채로 창이 뜨고, [입장하기]만 누르면 됩니다.

**입장 뒤**
1. 해시를 `#/live/{code}`로 바꾸고, 메인·편집 화면을 숨긴 채 **학생 보기 화면 `#live-view`**(전체 화면 캔버스 + 아래 입력칸 자리)를 보입니다. `MobileView.route`·해시 라우터에 `#/live/` 분기를 더합니다.
2. `live/{code}/status` 확인 → `closed`면 "끝난 수업입니다", `paused`면 대기 화면
3. `deck.css`를 받아 `#live-view` 전용 `<style>`에 넣고, `deck.json`을 받아 풀어서(뒤섞기 되돌림) **메모리에만** 둡니다. 받는 동안 "수업 자료 받는 중…(n%)"을 보입니다.
4. `state`를 구독(`onValue`)합니다. 값이 바뀔 때마다:
   - `state.deckV`가 받아 둔 덱과 다르면 → `deck.json`을 다시 받음(교사가 덱을 고친 경우)
   - 덱에서 `state.slideId` 장을 꺼내 캔버스에 그리기(`fillCanvas` 방식) → `applySteps(canvas, state.step, true)`. 이미 받아 둔 덱이라 **바로 넘어갑니다**
   - 의견 판이 있으면 판을 그리고, 열린 판이면 입력칸을 띄움
5. 화면: 16:9 캔버스를 화면 폭에 맞춤(`fit`). 두 손가락으로 확대할 수 있게 합니다(`meta viewport`에서 확대 허용).
6. 학생은 앞뒤로 넘길 수 없습니다(따라 보기). 자유롭게 넘기는 기능은 4단계 선택입니다.
7. 오른쪽 위 **[나가기]** → 구독을 끊고 메인(`#/`)으로 돌아갑니다.
8. 참고: 학생도 `motionslide.html` 전체(편집기 코드·라이브러리)를 내려받습니다. 첫 로딩이 별도 페이지보다 조금 무겁지만, 브라우저 캐시에 남아 두 번째부터는 빠릅니다.

### 6.3 덱 올리기 규칙 (관리자)
```
Live.ensureDeck():
  slides = deck.slides.map(slide => ({ id, bg, view: 자리표시(Exporter.view(slide)), maxStep, boards }))
  body   = JSON.stringify({ format, title, slides })
  deckV  = sha256(body).slice(0, 8)
  if (Live.deckV === deckV) return deckV             // 이미 같은 내용이 올라가 있음
  upload(`live_slides/${code}/deck.json`, scramble({ ...body, deckV }, code))
  Live.deckV = deckV
  return deckV
```
- 부르는 때: 방을 열 때, 이어서 하기로 다시 시작할 때, 발표를 다시 시작할 때(`Show.enter`) — 편집 모드에서 고쳤으면 해시가 달라져 자동으로 다시 올라갑니다.
- 장은 **id 기준**으로 찾습니다. 장 순서를 바꿔도 `state.slideId`로 정확한 장을 그립니다.
- 올리기가 **끝난 뒤에** `state.deckV`를 바꿉니다. 학생이 아직 올라가지 않은 덱을 찾는 일을 막기 위해서입니다.
- 실패하면 3번까지 다시 시도하고, 그래도 안 되면 발표자 바에 "학생 화면 전송 실패 [다시 보내기]"를 띄웁니다.
- 덱을 다시 올리면 30명이 덱 전체를 다시 받습니다. 수업 중 수정은 꼭 필요할 때만 하도록 안내합니다(9.2).

### 6.4 진행 신호 쓰기 — 연결점
- `Show.paint()` 끝과 `Show.applyStep()` 끝에서 `Live.sync()`를 부릅니다. 모든 넘김이 결국 이 둘을 지나갑니다.
- `Live.sync()`는 150ms 디바운스(빠르게 연타할 때 마지막 것만)를 겁니다.
  ```
  state = { slideId, index: Show.index, total, step: Show.step (Infinity면 maxStep), deckV, at: serverTimestamp }
  ```
- `Show.step`은 앞 장으로 돌아갈 때 `Infinity`가 들어가므로, RTDB에 쓰기 전에 `maxStep`으로 바꿉니다(RTDB는 Infinity를 저장 못 함).

### 6.5 학생 화면 그리기 (`#live-view`)
- 캔버스 배율은 편집기의 `fitStage(host, scaler, 0)`을 그대로 씁니다.
- `view`를 캔버스에 넣는 부분은 `exportRuntime()`의 `fillCanvas`를 본떠 만듭니다: `canvas.className = view.cls`, `innerHTML = view.html`, `view.css`를 `<style>`로 맨 앞에 넣고, 배경색 적용.
- 화면 전환 효과(`paint`의 ghost 복제)는 그대로 써도 되고, 저사양 기기를 생각하면 끌 수 있게 합니다.
- 인터랙티브 iframe(srcdoc)은 학생 기기에서 그대로 실행됩니다. 칸 안의 `appBridge`가 보내는 `nav`·`escape` 메시지는 학생 보기 화면에서 무시합니다(따라 보기라 넘기지 않음). 편집기의 기존 `message` 처리기가 `#live-view`의 칸에 반응하지 않는지 확인합니다.
- **미리 보기의 한계(D15-1)**: 뒤쪽 장과 아직 공개하지 않은 단계의 상자도 받은 덱 안에 들어 있습니다. 화면에서는 볼 수 없지만, PC에서 개발자 도구로 덱을 풀어 보면 볼 수 있습니다(휴대폰·태블릿은 사실상 불가능). 5.2-1의 걸림돌로 가볍게 막고, 정말 숨겨야 하는 정답은 함께 보기 덱에서 빼 두도록 안내합니다.

### 6.6 동영상 · 유튜브 · 인터랙티브
| 개체 | 학생 화면 | 방법 |
|---|---|---|
| 동영상 파일(`<video>` data URL) | 자리표시 "🎬 선생님 화면을 보세요" | 업로드 전에 `freeze()`의 자리표시 방식으로 바꿈. `poster`가 있으면 정지 그림으로 |
| 유튜브·비메오 iframe | 같은 자리표시 | 소리 겹침 방지. (선택) 교사가 허용하면 각자 재생 |
| 인터랙티브 요소 | 그대로 실행, 각자 조작 | 교사 조작은 따라 보이지 않음(D10) |
| 모션그래픽·수식 | 그대로 | 이미 SVG로 그려져 있음 |

### 6.7 재접속 · 늦은 입장 · 새로고침
- 늦게 들어온 학생: 덱 전체를 받은 뒤 `state`의 지금 장부터 봅니다(덱 파일은 방을 닫을 때까지 남아 있음, D3).
- 새로고침: 받은 덱(뒤섞인 그대로)을 IndexedDB에 `{code, deckV}`로 보관해 두면 다시 받지 않습니다(사용량 절약). 방을 나가거나 방이 닫히면 지웁니다.
- RTDB 연결이 끊기면 SDK가 다시 연결합니다. 학생 화면에 "연결이 끊겼어요, 다시 연결 중…"을 표시합니다(`.info/connected` 구독).
- 학생이 다른 탭으로 가면 접속 상태가 '다른화면'으로 보입니다(`startRoomPresence`가 처리).

### 6.8 수업 중 수정 반영
- 편집 모드로 나가 장을 고친 뒤 다시 발표를 시작하면, 덱 해시가 달라져 자동으로 덱 전체를 다시 올리고 학생들이 새로 받습니다.
- 발표자 바에 **[학생 화면 다시 보내기]**도 둡니다(강제 재전송).
- (선택 최적화) 고친 장만 `live_slides/{code}/patch/{slideId}.json`으로 올리고 `state.patches`로 알리면 다시 받는 양을 줄일 수 있습니다. 처음 구현에서는 덱 전체 재전송으로 충분합니다.
- 의견 판의 `boardId`가 같으면 의견은 그대로 이어집니다(D4).

### 6.9 끝내기
- `Show.exit()` → `Live.pause()`: `live/{code}/status = 'paused'`, 신호 쓰기를 멈춤. 파일·의견은 그대로입니다.
  - 이때 "함께 보기를 끝낼까요? [잠시 멈춤] [끝내고 의견 저장]"을 묻습니다. [끝내고 의견 저장]은 7.10 → 10장 순서로 진행합니다.
- 다시 발표자 모드로 들어와 [학생과 함께 보기]를 누르면 → [이어서 하기]로 같은 코드를 씁니다.
- 교사 브라우저가 갑자기 닫힘 → RTDB `onDisconnect`로 `live/{code}/status = 'paused'`를 걸어 둡니다.

---

## 7. 기능 2 — 의견 모으기

### 7.1 개체 형태 (슬라이드 HTML에 저장되는 모양)
```html
<div class="draggable-box" style="left:960px;top:300px;width:820px;height:600px;">
  <div class="live-board" data-board='{"id":"b_k3x9q2","kind":"choice","question":"어느 풀이가 맞을까요?","options":["가","나","다"],"view":"bars","anonymous":true,"allowEdit":true}'></div>
</div>
```
- `data-board` 필드: `id` · `kind`(`text`/`choice`/`number`) · `question` · `options`(choice) · `view` · `anonymous` · `allowEdit` · `min`/`max`/`unit`/`answer`(number, 선택) · `results`(함께 보기를 끝낼 때 저장한 의견, 7.10)
- class는 **`live-board`**로 씁니다. `ls-`로 시작하면 `Sanitizer`가 지웁니다(`RESERVED_CLASS`).
- 설정은 **`data-board` 하나에 JSON**으로 넣습니다. `Sanitizer.clean()`의 `ADD_ATTR`과 `ADD_URI_SAFE_ATTR`에 `data-board`를 추가해야 남습니다.
- 판 안의 버튼·입력칸은 **저장하지 않고** 화면에 그릴 때만 만듭니다. 정리기가 `button`·`input`을 지우기 때문입니다(`FORBID_TAGS`).
- `canvasHtml()`이 저장할 때, 그려 둔 판 내용을 비우도록 `.live-board` 처리를 더합니다(지금 `.app-frame`을 비우는 것처럼).

### 7.2 boardId 규칙 (중요)
- 만들 때 `b_` + 무작위 6~8자
- **장 복제(Ctrl+D, `slideAction`)·개체 복제·덱 합치기·불러오기**를 하면 새 id로 바꿉니다. 바꾸지 않으면 두 판이 같은 의견을 함께 씁니다.
- 판을 지우는데 함께 보기 방에 그 판의 의견이 있으면 → "의견 N개도 지울까요?"를 묻습니다.

### 7.3 답 형식과 보기 방식
| kind | 학생 입력 | 보기 방식(`view`) |
|---|---|---|
| `text` | 한 줄~세 줄 글(200자) | `cards`: 카드 벽(최신 순, 교사가 눌러 크게 보기) |
| `choice` | 단추 중 하나(선택지 2~8개) | `bars`: 막대그래프 + 사람 수·% |
| `number` | 숫자 입력(소수 허용, 범위·단위 지정 가능) | `histogram`: 구간 분포 + 평균·중앙값·최빈값, (선택) 정답 위치 표시 |

- 그리기는 외부 라이브러리 없이 DOM·SVG로 합니다. 크기는 1920×1080 기준이라 화면 배율을 따라갑니다.
- 결과가 많으면(예: 카드 60장 이상) 카드는 최근 N장만 보이고 "외 N개"로 묶습니다.

### 7.4 편집 화면에서 만들기
- AI 창 [삽입] 메뉴 또는 개체 메뉴에 **[의견 모으기 판]** → 설정 창(질문, 형식, 선택지, 보기 방식, 익명, 고쳐 내기 허용)
  - 설정 창 맨 위에 **[예시에서 고르기]**: 7.8의 예시를 고르면 질문·형식·보기 방식이 채워지고, 글만 고쳐 쓰면 됩니다.
- 편집 화면에서는 **예시 데이터로 미리보기**(흐린 글씨 "학생 의견이 여기에 모입니다")를 보입니다.
- 더블클릭하면 설정 창을 다시 엽니다(`onDoubleClick`의 개체 분기에 추가).
- (선택) AI가 슬라이드를 만들 때 "의견 받기"를 요청하면 판을 넣도록 프롬프트에 규칙을 더합니다.

### 7.5 화면별 모습
| 화면 | 공개 전 (`reveal: false`) | 공개 후 |
|---|---|---|
| 교사 발표자 미리보기(`pv-c-canvas`) | **전체 결과** + "공개 전" 표시 | 전체 결과 |
| 청중 창(프로젝터) | "23명 제출" 숫자만 | 결과(숨긴 의견 제외) |
| 학생 기기 | 자기 답만 + "제출함" | 결과(숨긴 의견 제외) |
| 편집 화면·발표(함께 보기 아님) | 저장된 `results`가 있으면 그 결과, 없으면 질문 + 자리표시 | — |
| 내보낸 HTML | 질문 + 자리표시 (2단계 이후 선택: 저장된 결과 그리기) | — |

- 공개 전에는 숫자만 보여 서로 베끼지 않게 합니다.

### 7.6 교사 제어 (발표자 보기 오른쪽, 시나리오 칸 아래 "의견" 영역)
- 이 장의 판 목록마다: **[제출 열기/닫기]** · **[결과 공개/숨기기]** · **[초기화]** · "23 / 28명 제출"
- 의견 카드를 눌러 **숨기기/다시 보이기** (`hidden/{boardId}/{deviceTag}`)
- **[CSV 저장]**: 시각, 장 번호, 질문, 닉네임(익명이면 빈칸), 값/글, 숨김 여부. 한글이 깨지지 않게 UTF-8 BOM을 붙입니다.
- 결과 보관은 따로 누를 필요 없이 **함께 보기를 끝낼 때 자동으로 덱에 저장**됩니다(7.10).

### 7.7 인터랙티브 요소와 함께 쓰기 (직접 입력)
- 인터랙티브 요소의 결과값을 코드로 바로 받는 통로(`lsSubmit` 등)는 **만들지 않습니다**(D13). `appBridge`·AI 프롬프트도 바꾸지 않습니다.
- 대신 **인터랙티브 요소 옆(또는 다음 단계)에 `number`·`choice`·`text` 판을 두고**, 학생이 자기 기기에서 조작해 본 뒤 나온 값을 직접 입력합니다.
- 판의 질문에 "무엇을 조작해서 어떤 값을 적을지"를 분명히 씁니다(예: "슬라이더를 움직여 직선이 점 A를 지날 때의 a 값을 적으세요").
- 숫자 판에 `unit`(단위)·`min`·`max`를 정해 두면 엉뚱한 값이 덜 들어옵니다.
- 이렇게 하면 인터랙티브 코드에 오류가 있어도 의견 모으기는 영향을 받지 않습니다.

### 7.8 의견 모으기 예시
판 설정 창의 [예시에서 고르기]에 넣을 목록입니다. 모두 2단계(`text`·`choice`)와 3단계(`number`) 형식만 씁니다.

| # | 쓰임 | 질문 예 | 형식 · 보기 | 진행 팁 |
|---|---|---|---|---|
| 1 | 수업 시작 이해도 | "지난 시간 내용, 얼마나 기억나나요?" ①전혀 ②조금 ③대부분 ④완벽 | `choice` · `bars`, 익명 | 바로 공개. 결과를 보고 복습 양을 정함 |
| 2 | 예상하기(어림) | "주사위를 60번 던지면 6의 눈은 몇 번 나올까요?" | `number` · `histogram`, 범위 0~60 | **공개는 실험 뒤**. 인터랙티브 시뮬레이션을 돌려 본 다음 분포와 실제 값을 비교 |
| 3 | 오개념 진단 | "(−3)² 과 −3² 의 값이 같을까요?" ①같다 ②다르다 ③모르겠다 | `choice` · `bars`, 익명 | 공개 전 짝 토론 → 다시 묻기(예시 10) |
| 4 | 조작 후 값 적기 | "슬라이더로 a를 바꿔 y = ax + 1 이 점 (2, 5)를 지나게 하세요. a는?" | `number` · `histogram`, 정답 표시 2 | 인터랙티브 요소 옆에 둠(7.7). 분포에서 많이 나온 오답을 함께 살펴봄 |
| 5 | 조작 후 발견 적기 | "삼각형 꼭짓점을 움직여 보며 늘 변하지 않는 것을 한 가지 적어 보세요" | `text` · `cards` | 카드를 크게 보며 "내각의 합" 같은 답을 골라 정리 |
| 6 | 풀이 비교 | "어느 풀이가 맞을까요?" ①풀이 가 ②풀이 나 ③둘 다 ④둘 다 틀림 | `choice` · `bars` | 풀이 그림은 같은 장에, 판은 오른쪽에 |
| 7 | 실생활 예 모으기 | "정비례 관계인 예를 생활 속에서 하나 들어 보세요" | `text` · `cards`, 닉네임 공개 | 좋은 예를 크게 보이고, 정비례가 아닌 예로 반례 토론 |
| 8 | 어림 대회 | "이 병에 든 사탕은 몇 개일까요?" | `number` · `histogram` | 마지막에 정답 공개, 가장 가까운 사람 찾기 |
| 9 | 풀이 전략 고르기 | "이 문제를 어떻게 풀고 싶나요?" ①표 ②식 ③그래프 ④그림 | `choice` · `bars` | 전략별로 모둠을 나눌 때 |
| 10 | 생각 변화 보기 | 예시 3과 **같은 질문을 토론 뒤에 다시** | `choice` · `bars` | 토론 전 판과 나란히 두어 생각이 바뀐 정도를 비교 |
| 11 | 헷갈리는 점 받기 | "지금 가장 헷갈리는 것을 적어 주세요" | `text` · `cards`, **익명** | 공개하지 않고 교사만 보며 수업 중 바로 답함 |
| 12 | 출구 티켓 | "오늘 배운 것을 한 문장으로 정리해 보세요" | `text` · `cards`, 닉네임 공개 | 끝내면 덱에 저장됨 → 다음 시간 도입에 다시 보여 줌 |
| 13 | 자신감 체크 | "비슷한 문제를 혼자 풀 수 있을 것 같나요?" 1~5 | `number` · `histogram`, 범위 1~5 | 수업 처음과 끝에 같은 판을 두 번 |
| 14 | 다음 활동 투표 | "다음 활동으로 무엇을 할까요?" ①게임 ②문제 풀이 ③탐구 | `choice` · `bars` | 바로 공개 |

**예시를 쓸 때의 원칙**
- 정답이 있는 질문(2·3·4·6·8)은 **공개를 늦춰** 서로 따라 하지 않게 합니다.
- 솔직한 답이 필요한 질문(1·11·13)은 **익명**으로 둡니다.
- 활동 결과를 모으는 질문(7·12)은 **닉네임 공개**로 둡니다. 빠른 입장이라 실명은 없으므로(D14), 누가 썼는지 알아야 하면 질문에 "이름을 함께 적어 주세요"를 넣습니다.

### 7.9 학생 입력 화면
- 지금 장에 열린 판이 있으면 화면 아래에서 **입력칸이 올라옵니다**(슬라이드를 가리지 않게 접고 펼 수 있음).
- 판이 여러 개면 탭으로 나눕니다.
- 제출 뒤: "제출함 ✓" + (`allowEdit`이면) [고치기]. 자기 답은 `localStorage`에 `{code, boardId}`별로 기억해 새로고침해도 보입니다.
- 교사가 제출을 닫으면 입력칸이 잠깁니다("제출이 마감되었어요").

### 7.10 함께 보기를 끝낼 때 의견을 덱에 저장 → Firebase 저장·불러오기 (D17)

**가능 여부: 가능합니다.** 기존 저장·불러오기 경로가 장의 HTML을 그대로 담기 때문입니다(2026-11-15 코드 확인).
- [Firebase Storage에 저장] = `CloudUI.save()` → `window.SlideCloud.save(fileName, title, Exporter.build('presenter'))`
  - `Exporter.build`는 장마다 `html: slide.html`을 `deck-data` JSON에 넣습니다.
- [Storage에서 불러오기] = `CloudUI.open()` → `SlideCloud.load()` → `Importer.open(file)` → `Importer.read()`가 `slide.html`을 `Editor.normalizeSlide`로 되살립니다.
- 그래서 의견을 **판의 `data-board` 안 `results`**에 넣어 두면, 덱 자동 저장(`DeckStore`, IndexedDB)·HTML 내보내기·Firebase 저장에 모두 함께 들어가고, 불러오면 판이 그 결과를 그립니다.

**흐름**
1. 관리자가 [함께 보기 끝내기]를 누릅니다(또는 `Show.exit` 때 [끝내고 의견 저장]).
2. 방의 모든 판에 대해 RTDB `responses/{boardId}`·`hidden/{boardId}`를 한 번 읽습니다(`get`).
3. 덱의 각 장에서 `.live-board[data-board]`를 찾아 `results`를 채웁니다.
   ```json
   "results": {
     "sessions": [
       {
         "at": "2026-11-20T10:05:00+09:00",   // 이 수업(방)을 끝낸 시각
         "code": "AB3K",
         "count": 27,
         "items": [ { "nick": "용감한 수달", "value": 3, "text": "", "at": 1763600700000, "hidden": false } ]
       }
     ]
   }
   ```
   - `anonymous` 판은 `nick`을 저장하지 않습니다.
   - 같은 판으로 여러 수업을 하면 `sessions`가 쌓입니다(반별 비교 가능). 너무 커지지 않게 판마다 최근 10회, 회마다 200개까지만 둡니다.
   - 기기 태그(`deviceTag`)는 저장하지 않습니다(덱 파일이 공유될 수 있으므로).
4. 바뀐 장 HTML을 `slide.html`에 반영하고 `Editor.commit()` → 자동 저장(IndexedDB)과 되돌리기 기록에 남습니다.
5. 안내: "학생 의견 27개를 슬라이드에 저장했습니다. [Firebase Storage에 저장]을 누르면 의견까지 보관됩니다." + 바로 저장 단추
6. 저장이 끝나면 서버 정리(10장): `deck.json`·RTDB 방 삭제.

**불러온 뒤 보기**
- 편집 화면·발표에서 판은 `results`의 **가장 최근 수업 결과**를 그립니다. 판 설정 창에서 다른 회차를 고르거나 회차를 지울 수 있습니다.
- 판의 [결과 지우기]로 저장된 의견을 모두 지울 수 있습니다(되돌리기 가능).
- 다음 수업에서 같은 덱으로 함께 보기를 열면, 학생 쪽 판은 **빈 상태로 새로 시작**합니다(`deck.json`에는 `results`를 넣지 않음, 5.2). 끝내면 새 회차로 덧붙습니다.
- [CSV 저장]도 저장된 `results`에서 언제든 만들 수 있습니다.

**주의할 점**
- `Sanitizer`가 `data-board`를 지우지 않게 허용해야 합니다(7.1). 불러오기도 같은 정리기를 지나가므로, 허용하지 않으면 의견이 사라집니다.
- 의견 글은 JSON으로 속성에 들어가므로 `setAttribute`로 넣어 자동 이스케이프되게 합니다(문자열을 HTML에 직접 이어 붙이지 않음).
- 크기: 의견 200개 × 약 200B = 판 하나에 약 40KB. 덱 크기에 비하면 작습니다.
- 학생 의견이 덱 파일에 들어가므로, 덱을 HTML로 내보내 다른 사람에게 줄 때는 의견도 함께 간다는 점을 내보내기 창에 안내합니다(필요하면 "의견 빼고 내보내기" 선택).
- 관리자가 끝내기 전에 브라우저를 닫으면 의견은 RTDB에 남아 있습니다. 다음에 함께 보기를 열 때 "끝내지 않은 수업이 있어요. 의견을 덱에 저장할까요?"를 묻습니다(덱 id가 같을 때). 덱이 없으면 CSV로만 받을 수 있게 합니다.

---

## 8. 보안 규칙 초안

> **초안**입니다. 콘솔의 실제 규칙과 기존 앱 규칙 스타일에 맞춰 다듬고, 배포 전에 Rules Playground로 시험하세요.
> 학생은 **Firebase 로그인을 하지 않습니다**(`signInAnonymously` 없음). 그래서 학생 쓰기는 `auth` 대신 **App Check + 값 검사 + 방 상태 확인**으로 막습니다.
> 방을 열고 고치는 쪽은 **관리자 한 명**(D11)이라, 소유자 확인 대신 **관리자 조건**만 씁니다. 아래 `isAdmin` 조건은 기존 `motion_slides/` Storage 규칙(관리자 전용 저장)에 이미 쓰고 있는 조건과 **같은 것**으로 맞추세요. 예시는 이메일 기준으로 적었습니다(`<ADMIN_EMAIL>` = `motionslide.html`의 `ADMIN_EMAIL`).

### 8.1 Storage
```
function isAdmin() {
  return request.auth != null && request.auth.token.email == '<ADMIN_EMAIL>' && request.auth.token.email_verified == true;
}
match /live_slides/{code}/{allPaths=**} {
  allow get: if true;                    // 학생 읽기 (목록은 못 봄 → 앞으로 올 장 이름을 알 수 없음)
  allow list: if isAdmin();              // 정리할 때 deleteStorageFolder가 listAll을 씀
  allow create, update: if isAdmin()
    && request.resource.size < 15 * 1024 * 1024
    && request.resource.contentType.matches('(application/json|text/css).*');
  allow delete: if isAdmin();
}
```
- 버킷 **CORS**에 사이트 주소가 허용돼 있어야 학생 `getBlob`이 됩니다(`CloudUI.errorText`가 이미 이 오류를 안내함).

### 8.2 Firestore
- 새 컬렉션이 없으므로 추가할 규칙이 없습니다. `room_registry` 등록은 기존 규칙을 따릅니다(관리자는 이미 쓸 수 있음).

### 8.3 RTDB (전용 인스턴스)
```json
{
  "rules": {
    "live_index": {
      ".read": "auth != null && auth.token.email === '<ADMIN_EMAIL>'",
      ".write": "auth != null && auth.token.email === '<ADMIN_EMAIL>'"
    },
    "live": {
      "$code": {
        ".read": "auth != null && auth.token.email === '<ADMIN_EMAIL>'",
        ".write": "auth != null && auth.token.email === '<ADMIN_EMAIL>'",
        "status": { ".read": true },
        "title":  { ".read": true },
        "state":  { ".read": true },
        "boards": { ".read": true },
        "hidden": { ".read": true },
        "responses": {
          "$boardId": {
            ".read": "root.child('live/'+$code+'/boards/'+$boardId+'/reveal').val() === true",
            "$tag": {
              ".write": "root.child('live/'+$code+'/status').val() === 'live' && root.child('live/'+$code+'/boards/'+$boardId+'/open').val() === true && $tag.matches(/^h?[0-9a-f]{16}$/) && newData.exists() && (!data.exists() || root.child('live/'+$code+'/boards/'+$boardId+'/allowEdit').val() === true)",
              ".validate": "newData.hasChildren(['at']) && newData.child('at').val() <= now && (!data.exists() || newData.child('at').val() >= data.child('at').val() + 1000)",
              "nick":  { ".validate": "newData.isString() && newData.val().length <= 20" },
              "text":  { ".validate": "newData.isString() && newData.val().length <= 200" },
              "value": { ".validate": "newData.isNumber() || (newData.isString() && newData.val().length <= 80)" },
              "at":    { ".validate": "newData.isNumber()" },
              "$other": { ".validate": false }
            }
          }
        }
      }
    }
  }
}
```
**남는 위험 (학생이 로그인하지 않기 때문)**
- 방 코드를 알면 다른 기기 태그로 위장해 쓸 수 있습니다. → App Check, 방 코드가 수업 중에만 쓰이는 짧은 수명, 교사의 숨기기로 줄입니다.
- 빠른 입장이라 닉네임만 있고 누가 누구인지는 알 수 없습니다(D14). 성적·기록용으로 본인 확인이 필요해지면 학번·PIN 인증(기존 `room-auth.js`)을 붙이는 것을 따로 검토합니다.
- `firebase-config.js`의 App Check가 RTDB·Storage에서 **실제로 강제(enforce)되는지** 콘솔에서 확인하세요. 최근 커밋 "앱체크 설정 약화"가 있었습니다.

---

## 9. 사용량과 비용

> 2026-11 기준 공식 요금 페이지 수치입니다. 바뀔 수 있으니 구현 전에 다시 확인하세요.

### 9.1 요금이 매겨지는 기준
| 서비스 | 기준 | 무료 한도 |
|---|---|---|
| Storage | 저장 용량 + **내려받은 양(GB)** | 5GB 저장, 월 100GB 내려받기. **버킷이 us-central1 · us-west1 · us-east1일 때만** 적용. 2026-02-03부터 Storage는 Blaze 요금제가 필요 |
| RTDB | **내려받은 양**(접속 유지 부가 데이터 포함) + 저장 용량 | 하루 약 360MB(월 약 10GB), 넘으면 GB당 $1. 저장 1GB(GB당 월 $5) |
| Firestore | **문서 읽기·쓰기 건수** | 하루 읽기 5만, 쓰기 2만 (사이트의 다른 앱과 함께 씀) |

### 9.2 한 수업 계산 (학생 30명, 20장, 장당 평균 300KB, 넘김 100번)
| 항목 | 계산 | 양 |
|---|---|---|
| 덱 전체 (Storage, A 방식) | 6MB × 30명 (입장할 때 한 번) | 약 180MB |
| 수업 중 덱을 한 번 고쳐 다시 보냄 | 6MB × 30명 | +180MB |
| 진행 신호 (RTDB) | 100번 × 30명 × 약 0.5KB | 약 1.5MB |
| 의견 (RTDB) | 30개 × 수백 B × 받는 화면 수 | 수백 KB |
| Firestore | 방 목록(`room_registry`) 등록·해제 | 몇 건 |

- 하루 5반 × 20일 = 월 100회 → Storage 월 **약 18GB**: 미국 지역 버킷이면 무료 한도(100GB) 안.
- 같은 양을 RTDB로 보냈다면 18GB − 무료 10GB = 8GB × $1 = **월 약 $8**. 덱을 RTDB가 아닌 Storage에 두는 이유입니다.
- A 방식은 장마다 받는 방식(C)과 전체 양이 거의 같습니다. 차이는 **입장 순간 30명이 동시에 6MB씩 받는 몰림**입니다. 학교 와이파이가 느리면 입장에 수십 초 걸릴 수 있으니, 수업 시작 전에 미리 입장시키도록 안내합니다.
- (4단계) 레이저 동기화: 5회/초로 줄이고 움직일 때만 보내도 1시간에 수~수십 MB. 꼭 필요할 때만 켭니다.

### 9.3 많이 쓰게 되는 경우와 줄이는 법
| 원인 | 줄이는 법 |
|---|---|
| 동영상이 든 장 | 자리표시로 바꿔 보냄(D9) |
| 큰 그림이 여러 장에 반복 | (4단계) 그림을 `media/{sha256}`로 빼서 한 번만 받음 |
| 새로고침·재접속 | 받은 덱을 학생 브라우저에 보관(6.7) |
| 수업 중 덱 수정 | 다시 보낼 때마다 30명이 덱 전체를 다시 받음 → 꼭 필요할 때만, 또는 고친 장만 보내기(6.8 선택 최적화) |
| 버킷이 미국 밖 지역 | Storage 무료 한도가 없음 → 콘솔에서 버킷 위치 확인 |
| 의외의 청구 | Firebase 예산 알림 설정 (알림만 보내고 사용을 막지는 않음) |

---

## 10. 정리(삭제) 정책

### 10.1 지금 room-registry가 하는 일 (2026-11-15 확인)
- 방을 만들 때 `room_registry`에 위치(`parts`)·만든 사람·`createdAt`을 기록합니다.
- 방이 지워지는 경우는 **교사가 직접 지울 때, 학교를 바꿀 때, 교사 계정 삭제·탈퇴 때**(`js/teacher-cleanup.js`)뿐입니다.
- **시간이 지났다고 자동으로 지우는 기능은 없습니다.**

### 10.2 이 기능의 정리 절차
의견이 덱 안에 저장되므로(D17) 서버에 오래 둘 것이 없습니다.

| 동작 | 덱 파일(Storage) | 의견(RTDB) | 방 |
|---|---|---|---|
| 잠시 멈춤 (`Show.exit` → [잠시 멈춤]) | 유지 | 유지 | `paused` |
| 함께 보기 끝내기 | 의견을 덱에 저장(7.10)한 **뒤** 삭제 | 덱에 저장한 **뒤** 삭제 | 방 전체 삭제 |

- 끝내기 순서: 의견 읽기 → 덱에 저장·`Editor.commit()` → `deleteStorageFolder('live_slides/' + code)` → `purgeRoomParts(code, parts)`(RTDB 방·인덱스) → `unregisterRoom(code, parts)`
- 덱 저장이 실패하면 **서버 삭제를 하지 않습니다**(의견을 잃지 않게). 실패 안내와 함께 [CSV로 받기]를 보입니다.
- **시간 기준 자동 정리는 두지 않습니다**(사용자 결정). 서버 정리는 [함께 보기 끝내기]에서만 합니다. 끝내지 않은 방은 다음에 [학생과 함께 보기]를 열 때 [이어서 하기]로 이어 가거나 끝내면 됩니다(6.1).

---

## 11. 단계별 구현 계획

### 0단계 — Firebase 콘솔 준비
- [ ] RTDB 인스턴스 만들기(예: `motionslide-live`, asia-southeast1) → `firebase-config.js`에 `rtdbLive` 추가·export
- [ ] RTDB 규칙(8.3), Storage 규칙(8.1) 배포 — 관리자 조건은 기존 `motion_slides/` 규칙과 같게
- [ ] Storage 버킷 **위치**·**CORS** 확인
- [ ] App Check가 RTDB·Storage에서 강제되는지 확인
- [ ] 예산 알림 설정

### 1단계 — 함께 보기
- [ ] `motionslide.html`: `Live` 객체 (`start` · `resume` · `pause` · `finish` · `ensureDeck` · `sync`)
- [ ] 덱 전체 업로드(진행률), 뒤섞기·풀기(5.2-1), 영상 자리표시, notes·`results` 제외
- [ ] 발표자 바: [학생과 함께 보기] 메뉴(관리자에게만 표시 · QR 다시 보기 · 학생 화면 다시 보내기 · 함께 보기 끝내기), 접속 인원, 전송 상태
- [ ] 청중 창 QR 덮개(qrcodejs 1.0.0, `motionslide.html#/live/{code}` + 코드 크게 + 안내 문구)
- [ ] `Show.paint` · `Show.applyStep` 끝에 `Live.sync()`, `Show.exit`에 `Live.pause()`
- [ ] 메인 `#home-actions` · `#home-setup`의 [AI 설정] 왼쪽, `#mobile-block`에 [함께 보기] 단추
- [ ] 입장 모달 `#live-join-modal`(빠른 입장처럼 코드 4자리만, 닉네임 자동 발급), 해시 `#/live/{code}` 라우팅(QR이면 코드 자동 입력)
- [ ] 학생 보기 화면 `#live-view`: `deck.css`·`deck.json` 받기(진행률, 메모리에만), `state` 구독, 지금 장만 화면에 넣기, 단계, 대기·종료 화면, 연결 상태, [나가기]
- [ ] 방 정리(10장): 끝내기 절차, 열 때 오래된 방 정리

### 2단계 — 의견 모으기 (글 · 선택지)
- [ ] `Sanitizer`: `data-board` 허용, `.live-board` 처리, `canvasHtml()`에서 판 내용 비우기
- [ ] 판 만들기·설정 창([예시에서 고르기] 포함, 7.8), 편집 화면 미리보기, 더블클릭으로 설정
- [ ] 복제·불러오기·합치기 때 `boardId` 새로 만들기, 판 삭제 때 의견 확인
- [ ] deck.json의 장마다 `boards` 포함, 방을 열 때 `boards/{id}` 메타 씀
- [ ] **함께 보기 끝내기 → 의견을 `data-board.results`에 저장 → `Editor.commit()`**(7.10), 저장 성공 뒤에만 서버 삭제
- [ ] 저장된 `results` 그리기(편집·발표), 회차 고르기·지우기, [결과 지우기]
- [ ] [Firebase Storage에 저장] → [Storage에서 불러오기] 뒤 의견이 그대로 보이는지
- [ ] 발표자 "의견" 영역: 열기·닫기 · 공개·숨기기 · 초기화 · 제출 수 · 카드 숨기기 · CSV
- [ ] 청중 창·학생 화면 결과 그리기(`cards` · `bars`), 공개 전 숫자만
- [ ] 학생 입력칸(아래에서 올라옴), 제출함·고치기, 마감

### 3단계 — 숫자 · 내보내기
- [ ] `number` 입력(`min`·`max`·`unit`) + `histogram`(평균·중앙값·최빈값, 정답 위치 표시)
- [ ] 인터랙티브 요소 옆에 숫자 판을 두는 예시(7.8의 4번) 동작 확인 — 코드 제출 통로는 만들지 않음(D13)
- [ ] (선택) 내보낸 HTML에서 저장된 `results` 그리기, 내보내기 창의 "의견 빼고 내보내기"

### 4단계 — 선택
- [ ] 레이저·하이라이트 동기화(`live/{code}/pointer`, 5회/초, 움직일 때만)
- [ ] 학생 자유 넘기기(이미 공개된 장까지만)
- [ ] 그림을 `media/{sha256}`로 분리
- [ ] 워드클라우드(한글 띄어쓰기 기준의 한계 있음)
- [ ] 청중 화면만 쓰는 모드(`Show.kind === 'audience'`)에서도 함께 보기

---

## 12. 시험 목록

**함께 보기**
- [ ] 관리자 PC + 학생 기기 2대 이상(휴대폰 1, 태블릿 1)
- [ ] 관리자가 아닌 계정·비로그인에서 [학생과 함께 보기]가 안 보이는지, 규칙이 쓰기를 막는지
- [ ] [함께 보기] 단추: 메인(키 있음·없음)과 휴대폰 화면 세 곳
- [ ] QR 입장(코드 자동 입력), 코드 직접 입력, 잘못된 코드, 닫힌 방, 다시 들어왔을 때 같은 닉네임
- [ ] 넘김·단계 진행·앞 장으로 돌아가기(`step = Infinity` → `maxStep` 변환)
- [ ] 늦게 들어오기, 새로고침, 와이파이 껐다 켜기
- [ ] 수업 중 장 고치고 발표 재시작 → 덱 다시 올라가고 학생 화면 갱신
- [ ] 덱 크기 큰 경우(그림 많음) 입장 시간, 학생 30명 동시 입장
- [ ] 학생 화면 요소(Elements) 탭에 지금 장만 있는지, 네트워크 탭의 deck.json이 바로 읽히지 않는지
- [ ] 장 순서 바꾸기, 장 삭제 후 진행
- [ ] 동영상·유튜브 장이 자리표시로 보이는지, 시나리오가 학생에게 가지 않는지
- [ ] 발표 중 교사 브라우저 강제 종료 → `paused` 처리
- [ ] 규칙 거부 때 안내 문구(App Check 실패 / 권한 없음)

**의견 모으기**
- [ ] 제출·고치기·마감·공개·숨기기·초기화
- [ ] 장을 오간 뒤 의견 유지
- [ ] 장 복제한 판이 다른 의견을 쓰는지(boardId 새로 만들기)
- [ ] 글자 수·빈도 제한, 다른 기기 태그로 쓰기 시도(규칙 확인)
- [ ] CSV 한글 깨짐(엑셀로 열기)
- [ ] 예시 14개를 골랐을 때 설정이 맞게 채워지는지
- [ ] 끝내기 → 의견이 판에 저장 → Firebase 저장 → 다른 PC에서 불러오기 → 의견 보임
- [ ] 같은 덱으로 두 번째 수업 → 학생 판은 빈 상태, 끝내면 회차가 덧붙음
- [ ] 익명 판에 닉네임이 저장되지 않는지, 덱 저장 실패 때 서버 의견이 지워지지 않는지
- [ ] 숫자 판 범위 밖 값, 단위 표시, 정답 위치 표시

**사용량**
- [ ] 한 수업 뒤 Firebase 콘솔 사용량(Storage 내려받기, RTDB 내려받기, Firestore 읽기) 확인 → 9.2 계산과 비교

---

## 13. 남은 결정 사항

| # | 질문 | 제안 |
|---|---|---|
| Q1 | RTDB: 새 인스턴스 vs 기존 기본 인스턴스의 하위 경로 | 새 인스턴스(규칙·사용량을 분리해서 보기 쉬움) |
| Q6 | 같은 판의 수업 회차를 몇 번까지 쌓을지 | 판마다 최근 10회, 회마다 200개 (7.10) |
| Q3 | 의견 기본값: 익명 / 고쳐 내기 허용 | 익명 켜짐, 고쳐 내기 허용 |
| Q4 | 익명이 아닌 판에 무엇을 보일지 | 자동 닉네임(D14). 실명이 필요하면 판에서 "이름을 함께 적어 주세요"로 안내 |
| Q5 | 유튜브를 학생 기기에서 각자 재생하게 할지 | 기본은 자리표시 |

**결정됨 (2026-11-15)**: 함께 보기는 관리자 전용(D11) · 학생 입장은 메인 [함께 보기] → 코드 입력(D12) · 인터랙티브 결과값 코드 제출 제외(D13) · 빠른 입장처럼 코드만, 닉네임 자동(D14) · 덱 전체를 한 번에 받는 A 방식(D15) · 끝낼 때 의견을 덱에 저장해 Firebase 저장·불러오기로 보관(D17)

---

## 14. 참고

**관련 파일**
- `pages/automation/class/motionslide.html` — 편집기·발표·내보내기 (이 기능을 붙일 곳)
- `js/firebase-config.js` · `js/firebase-storage.js` — Firebase 초기화, Storage 도우미
- `js/game-kit.js` · `js/room-registry.js` — 방 만들기·등록·정리
- `js/room-auth.js` — `getRoomDeviceTag`(기기 식별) 참고
- `js/teacher-auth.js` — 로그인 상태(관리자 판단)
- `js/qr-modal.js` — QR 패널(참고)
- `pages/aimath/text/sentimentanalysis.html` — RTDB로 학생 글을 모으는 예

**요금·한도 문서**
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Understand Realtime Database billing](https://firebase.google.com/docs/database/usage/billing)
- [Understand Cloud Firestore billing](https://firebase.google.com/docs/firestore/pricing)
- [Firestore pricing](https://cloud.google.com/firestore/pricing)
