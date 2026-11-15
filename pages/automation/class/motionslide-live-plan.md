# 모션 슬라이드 — 학생과 함께 보기(실시간 화면 공유) 설계

> **상태**: 구상만 끝남 (구현 전) · **작성일**: 2026-11-15 · **대상 파일**: `motionslide.html` (같은 폴더)
>
> 나중에 이 기능을 만들 때 이 문서만 보고 시작할 수 있게, 대화에서 정한 결정과 기존 코드의 연결 지점, 데이터 구조, 보안 규칙 초안, 비용 계산, 단계별 작업 목록을 모았습니다.
> 코드 위치는 줄 번호가 바뀌므로 **객체·함수 이름**으로 적었습니다. `motionslide.html`에서 이름으로 검색하세요.
>
> **범위 변경 기록**: 한때 함께 설계했던 "의견 모으기"(학생 제출·결과 보기·덱에 의견 저장) 기능은 **빼기로 했습니다**(D16). 이 문서는 **실시간 화면 공유**만 다룹니다. 학생은 보기만 하고 서버에 아무것도 쓰지 않습니다(접속 표시 제외).

---

## 0. 한눈에 보기

| 기능 | 하는 일 |
|---|---|
| **함께 보기** | **관리자만** 쓰는 기능입니다. 발표자 모드에서 **이름을 붙여** 함께 보기를 열면 QR·방 코드가 뜹니다. 학생은 모션 슬라이드 메인 페이지의 **[함께 보기]** 단추(AI 설정 왼쪽)를 눌러 코드를 입력하고 들어와 슬라이드를 봅니다. |
| **두 가지 모드** | **[실시간 페이지]**: 선생님이 넘기는 장·단계를 그대로 따라 봄(수업 중). **[전체 보기]**: 학생이 모든 장을 직접 넘겨 봄(수업 뒤 복습). 관리자만 정하고, 학생은 고를 수 없습니다. |
| **관리** | 발표자 모드의 **[함께 보기 ▾] 드롭다운**(시작·모드 전환·QR·취소)과, 기존 [Storage에서 불러오기]를 바꾼 **[Firebase Storage 관리]**(저장된 슬라이드 불러오기 + 열린 함께 보기 취소). |

**핵심 구조 (A 방식, D15)**
- 슬라이드 내용 → **Firebase Storage**: 함께 보기를 열 때 **덱 전체를 파일 하나로** 올리고, 학생은 입장할 때 한 번 받습니다.
- 진행 신호(몇 번째 장·몇 단계)와 모드 → **Realtime Database(RTDB)**: 아주 작은 값만 씁니다. 학생은 받아 둔 덱에서 그 장을 꺼내 그립니다.
- 학생 화면은 받은 HTML을 **자기 브라우저에서 직접 그립니다**. 파일이 기기에 저장되지는 않습니다.

---

## 1. 목표와 범위

### 하는 것
- 관리자 발표자 모드 ↔ 학생 기기의 장·단계 동기화([실시간 페이지])
- 같은 코드에서 [전체 보기]로 바꿔 학생이 모든 장을 직접 넘겨 보며 복습(관리자만 전환)
- 학생 입장: 메인 페이지 [함께 보기] → 코드 입력 창. QR을 찍으면 코드가 자동으로 채워짐. 발표자 화면에 접속 인원 표시
- 함께 보기 이름 붙이기, [Firebase Storage 관리]에서 함께 보기 취소
- 수업 중 고친 덱의 자동 재전송

### 하지 않는 것
- **의견 모으기(학생 제출·결과 보기)** → 빼기로 함(D16)
- 승인된 교사(관리자가 아닌)의 함께 보기 사용 → 관리자 전용(D11)
- 학생이 스스로 실시간/전체 보기를 고르기 → 관리자만 정함(D18)
- 교사가 인터랙티브 요소를 조작하는 모습을 학생 기기에 똑같이 보이기 → 학생은 **각자 자기 기기에서 조작**(D10)
- 동영상을 학생 기기에서 함께 재생하기 (소리가 겹치고 시간이 어긋남 → 자리표시, D9)
- 시간 기준 자동 정리(D7)
- 내보낸 HTML 파일(오프라인)에서의 실시간 기능 (Firebase·방이 필요해 웹 편집기에서만)
- 레이저·하이라이트 동기화 → 2단계(선택)

---

## 2. 대화에서 정한 결정

| # | 결정 | 이유 |
|---|---|---|
| D2 | 진행 신호는 **RTDB** (Firestore 아님) | Firestore는 리스너 하나마다 읽기 1건이 쌓임(30명 × 넘김 횟수). 하루 5만 건 한도를 사이트의 다른 게임과 함께 씀 |
| D3 | 덱 파일은 **함께 보기를 취소할 때까지 지우지 않음** | 늦게 들어온 학생, 새로고침, 수업 뒤 [전체 보기] 복습에 필요 |
| D5 | 발표자 모드를 나가도(`Show.exit`) **함께 보기는 계속 열려 있음**. 끝내는 것은 **[함께 보기 취소]** 하나뿐 | 수업 뒤에도 [전체 보기]로 복습시킬 수 있어야 함 |
| D7 | **시간 기준 자동 정리는 두지 않음**. 관리자가 [함께 보기 취소]를 누를 때만 서버를 정리 | 사용자 결정 |
| D8 | QR은 학생이 **카메라로 찍는** 것. 찍으면 `motionslide.html#/live/{코드}`가 열려 코드 입력 창이 채워진 채로 뜸. 방 코드는 카메라가 없는 기기용 | 학생이 주소를 몰라도 되고, 코드를 잘못 칠 일이 없음 |
| D9 | 동영상은 학생 기기로 보내지 않고 자리표시만 | 영상이 슬라이드 안에 data URL로 들어 있어 장 하나가 수십 MB가 될 수 있음 |
| D10 | 학생 화면의 인터랙티브 요소는 **각자 조작** | 미러링은 무겁고, 직접 조작이 수업에도 더 맞음 |
| D11 | 함께 보기는 **관리자 전용** | 사용자 결정. 화면 표시는 기존 `window.SlideCloud.isAdmin`(teacher-auth의 `isAdmin` + `ADMIN_EMAIL`)과 같은 조건, 실제 권한은 보안 규칙이 정함 |
| D12 | 학생 입장은 **별도 페이지 없이 `motionslide.html` 안에서**: 메인 페이지 **[AI 설정] 왼쪽 [함께 보기]** → 코드 입력 창 → 학생 보기 화면 | 사용자 결정. 학생은 Gemini 키가 없으므로 키 없을 때의 메인(`#home-setup`)과 휴대폰 화면(`#mobile-block`)에도 단추를 둠 |
| D14 | 학생 입장은 기존 게임의 **빠른 입장 모드처럼 방 코드만** 입력. 닉네임은 자동 발급(접속 표시용). 학번·PIN 인증은 쓰지 않음 | 사용자 결정 |
| D15 | 내용 전송은 **A 방식**: 함께 보기를 열 때 덱 전체를 파일 하나로 올리고, 학생은 입장할 때 한 번 받아 진행 신호에 맞춰 그 장만 그림 | 사용자 결정. 넘김이 바로 되고 구현이 단순함 |
| D15-1 | A의 한계: 실시간 페이지에서 **뒤쪽 장을 정상적인 방법으로는 못 보지만**, PC에서 개발자 도구(F12)로는 볼 수 있음. 휴대폰·태블릿은 사실상 불가능 | 걸림돌 두 가지: ① 덱은 메모리에만 두고 화면(DOM)에는 지금 장만 넣음 ② 덱 파일을 간단히 뒤섞어 저장(난독화). 마음먹은 학생까지 막지는 못함 |
| D16 | **의견 모으기 기능은 빼고 실시간 화면 공유만** | 사용자 결정(2026-11-15) |
| D18 | 같은 코드 안에서 **[실시간 페이지] / [전체 보기]**를 **관리자만** 전환. 시작할 때 고르고, 이후 발표자 드롭다운에서 바꿈. 전체 보기는 **복습 전용** | 사용자 결정 |
| D19 | 따로 대시보드를 두지 않고, 기존 **[Firebase Storage에서 불러오기]를 [Firebase Storage 관리]로 바꿔** 저장된 슬라이드 불러오기와 **열린 함께 보기 목록·취소**를 함께 함. 내려받기는 없음 | 사용자 결정 |
| D20 | 함께 보기를 만들 때 **이름**을 받아 Storage 관리 목록·Storage 파일 이름·메타데이터에 씀. 파일은 `live_slides/{코드}/{이름}.json` | 사용자 제안. 경로 앞부분은 코드로 두어 이름이 겹치거나 특수문자가 있어도 문제없게 함 |

> 빠진 번호(D1·D4·D6·D13·D17·D21·D22·D23)는 바뀌었거나 의견 모으기와 함께 빠진 결정입니다.
>
> **정정 기록**: 대화 중 "room-registry가 오래된 방을 정리한다"고 말한 것은 사실이 아닙니다. 지금 `js/room-registry.js`에는 **시간 기준 정리 기능이 없습니다**. 이 기능에서도 시간 기준 정리는 두지 않기로 했습니다(D7).

---

## 3. 전체 구조

```
 [관리자 PC: motionslide.html 발표자 모드]
   │  [함께 보기 ▾] → 시작: 이름·모드 → 덱 전체를 {이름}.json 하나로 Storage에 올림 (덱을 고치면 다시 올림)
   │  Show.go / next / prev  ──►  Live.sync() ──► RTDB live/{code}/state 에 {slideId, step, deckV} 씀
   │  [함께 보기 ▾] → 모드: 실시간 페이지 / 전체 보기 ──► RTDB live/{code}/mode
   │  [함께 보기 ▾] → 함께 보기 취소 ──► Storage·RTDB 정리
   │
 [관리자 PC: [Firebase Storage 관리]]  ← 저장된 슬라이드 불러오기 + 열린 함께 보기 취소(6.11)
   │
   ├──► Firebase Storage   live_slides/{code}/deck.css
   │                       live_slides/{code}/{이름}.json        ← 덱 전체(난독화), 버전 deckV
   ├──► RTDB (전용 인스턴스) live/{code}/{createdBy,name,file,status,mode,presenting,state}
   │                       live_index/{code}
   └──► Firestore           room_registry/...                    ← rtdbRoom().createRoom()이 자동 등록(기존 방 목록)

 [학생 기기: motionslide.html 메인 → [함께 보기] → 코드 입력  (QR이면 #/live/CODE 로 바로)]
   입장 → 학생 보기 화면(#live-view) → deck.css · 덱 파일(live/{code}/file) 받기(메모리에만) → mode·state 구독
     → state.deckV가 받아 둔 것과 다르면 덱 파일 다시 받기
     → mode = 'live'  : 덱에서 state.slideId 장만 꺼내 그리기 → 단계 적용 (넘기기 단추 없음)
     → mode = 'browse': 학생이 ◀ ▶·밀기로 모든 장을 넘겨 봄, 단계는 모두 펼침
```

---

## 4. 기존 코드 재사용 지도

| 필요한 것 | 기존 코드 | 쓰는 법 / 주의 |
|---|---|---|
| 방 코드 만들기 | `js/game-kit.js` `generateRoomCode()` | 헷갈리는 O/0, I/1을 뺀 4자리 |
| RTDB 방 + 목록 + 등록 | `game-kit.js` `rtdbRoom(db, { roomsPath, indexPath })` | `createRoom()`이 방·인덱스를 만들고 `registerRoom()`까지 합니다. 방 만든 사람은 `window.currentTeacherUid`(관리자도 이 값이 채워짐) |
| 방 정리(삭제) | `js/room-registry.js` `purgeRoomParts` · `unregisterRoom` | RTDB 부분은 `purgeRoomParts`로, Storage 파일은 `deleteStorageFolder`로 따로 지웁니다(parts의 `storage`는 Firestore part에만 붙는 형식이라) |
| 학생 입장 창 | **새로 만듦** (`motionslide.html`의 Bootstrap 모달) | 기존 `renderRoomEntrance`는 게임용 카드 UI라 쓰지 않습니다. 코드 4자리 입력 방식(대문자 변환, 공백 제거)만 따라 합니다 |
| 화면 이동(라우팅) | `motionslide.html`의 해시 라우터(`#/`, `#/edit/{id}`)와 `MobileView.route` | `#/live/{code}`를 더합니다 |
| 메인 페이지 단추 자리 | `#home-actions`(키 있음)·`#home-setup`(키 없음)의 `[data-act="settings"]` 바로 앞, `#mobile-block`의 단추 줄 | 학생은 키가 없으므로 세 곳 모두에 둡니다 |
| 관리자 판단 | `window.SlideCloud.isAdmin` (`teacherAuthChanged` 이벤트에서 `isAdmin` + `ADMIN_EMAIL`로 정함), `CloudUI.sync()`의 `.cloud-only` 표시 방식 | 발표자 바의 [함께 보기 ▾]와 [Firebase Storage 관리]도 같은 방식으로 관리자에게만 보입니다 |
| 닉네임·기기 식별 | `room-auth.js` `getRoomNickname` · `claimRoomNickname` · `getRoomDeviceTag(roomCode)` | 접속 표시에만 씀. room-auth 전체를 불러오기 무거우면 같은 계산을 작은 함수로 옮겨 써도 됨 |
| 접속 인원 | `game-kit.js` `startRoomPresence(gameKey, code, nickname)` · `watchRoomPresence` | 접속 전용 RTDB(`rtdbPresence`). 학생이 서버에 쓰는 유일한 곳 |
| QR | `js/qr-modal.js` (참고만) | 대시보드의 방 `<select>`에 묶여 있어 그대로는 못 씁니다. 같은 라이브러리(cdnjs `qrcodejs 1.0.0`)와 `buildJoinUrl` 방식을 따라 만듭니다 |
| 로그인 상태 | `js/teacher-auth.js` (`motionslide.html`이 이미 불러옴) | `window.isAdmin` · `currentTeacherUid`, 이벤트 `teacherAuthChanged`. 학생은 로그인하지 않습니다 |
| Firebase 초기화 | `js/firebase-config.js` | App Check(reCAPTCHA v3) 포함. 새 RTDB 인스턴스를 쓰면 여기에 추가해 export |
| Storage | `js/firebase-storage.js` `storage` · `deleteStorageFolder(path)` | 지금 규칙은 `custom_forms/...`와 관리자용 `motion_slides`만 허용 → 경로 추가 필요 |
| Storage 저장 예시 | `motionslide.html` 아래쪽 `window.SlideCloud` (관리자 전용, `motion_slides/`) | `uploadString` · `getBlob` 사용법, CORS 오류 안내(`CloudUI.errorText`) 참고 |
| 발표 진행 | `motionslide.html` `Show` (`enter` · `exit` · `go` · `next` · `prev` · `paint` · `applyStep` · `openAudience` · `popup` · `canvases`) | 신호를 쓰는 연결점 |
| 학생에게 보낼 장 형태 | `Exporter.view(slide)` → `{ cls, css, html }` | 인터랙티브 코드(`data-code`)를 빼고, 격리 iframe(srcdoc)과 그려 둔 SVG로 바꿉니다. **시나리오(notes)는 들어가지 않습니다** |
| Storage 관리 모달 | `CloudUI.open()` · `CloudUI.sync()` · `#cloud-modal` · `window.SlideCloud.list/load/remove` | 이름을 [Firebase Storage 관리]로 바꾸고 "함께 보기 중" 영역을 더함(6.11) |
| 보기 화면 코드 | `exportRuntime()` 안 `fillCanvas` · `freeze`, 편집기의 `fitStage(host, scaler, pad)` | 학생 보기 화면은 편집기 안이므로 `fitStage`를 그대로 쓰고, `view`를 캔버스에 넣는 부분만 `fillCanvas`를 본떠 만듭니다 |
| 단계별 공개 | 공용 ES5 함수 `slideSteps(canvas)` · `applySteps(canvas, step, replay)` | 그대로 씁니다 |
| 슬라이드 공용 CSS | `<style id="ls-slide-css">` | 함께 보기를 열 때 `deck.css`로 올려, 학생 기기에 캐시된 옛 `motionslide.html`과 버전이 어긋나지 않게 합니다 |
| 인터랙티브 칸 통신 | `appBridge(seed)`, 메시지 `lsApp: escape · nav · evt · snapshot · replay` | 바꾸지 않습니다. 학생 보기 화면에서는 칸이 보내는 `nav`·`escape`를 무시합니다 |
| 인터랙티브 격리 | `AppKit` (`sandbox="allow-scripts"`, `AppKit.CSP`가 네트워크를 막음) | 학생 기기에서도 그대로 격리된 채 실행됩니다 |
| 덱 저장소 | `DeckStore` (IndexedDB `htmlSlideStudio`) | 덱은 관리자 브라우저에만 있음 → 함께 보기를 열 때 올려야 함 |

---

## 5. 데이터 구조

### 5.1 Firestore — 따로 두지 않음
- 방을 여는 사람이 관리자 한 명뿐이라(D11), Storage·RTDB 규칙은 "관리자인가"만 확인하면 됩니다.
- 방 목록 `room_registry` 등록은 `rtdbRoom().createRoom()`이 자동으로 합니다(기존 방식).

### 5.2 Storage
```
live_slides/{code}/deck.css            // ls-slide-css 내용(함께 보기를 열 때 1번)
live_slides/{code}/{이름}.json         // 학생용 덱 전체(A 방식, D15). 덱을 고치면 덮어씀
```

**파일 이름 규칙 (D20)**
- 이름은 함께 보기를 시작할 때 묻습니다. 기본값: `덱 제목 + 날짜`(예: "일차방정식의 활용 11-20 3반").
- 파일 이름은 `Util.safeFileName(이름)`으로 파일에 못 쓰는 글자를 바꿔 씁니다(기존 [Firebase Storage에 저장]과 같은 함수).
- **앞부분은 방 코드 폴더**(`live_slides/{code}/`)로 둡니다. 이름이 같은 함께 보기를 두 번 만들어도 겹치지 않고, 지울 때는 코드 폴더째 지우면 됩니다.
- 원래 이름(특수문자 그대로)은 Storage `customMetadata.name`과 RTDB `live/{code}/name`·`live_index/{code}/name`에 둡니다. [Firebase Storage 관리]는 이 값을 보입니다.
- 학생은 파일 이름을 몰라도 됩니다. RTDB `live/{code}/file`(전체 경로)을 읽어 받습니다.

**학생용 덱 파일 형식** (올릴 때는 아래 JSON을 뒤섞어(난독화) 올림, 5.2-1)
```json
{
  "format": 1,
  "deckV": "9f3a1c2e",
  "title": "일차방정식의 활용",
  "slides": [
    { "id": "s_ab12cd", "bg": "#ffffff", "view": { "cls": "slide-canvas", "css": "…", "html": "…" }, "maxStep": 3 }
  ]
}
```
- `deckV`: 본문의 SHA-256 앞 8자리. 바뀌면 학생이 다시 받습니다.
- **넣지 않는 것**: `notes`(발표자 시나리오), `data-code`(인터랙티브 원본 코드), `<video>` data URL(→ 자리표시)
- 만드는 법: 장마다 `Exporter.view(slide)` → 영상 자리표시로 바꿈(6.6) → 모아서 JSON → 해시 계산 → 뒤섞기
- 업로드: `uploadString(ref, text, 'raw', { contentType: 'application/json; charset=utf-8', cacheControl: 'private, max-age=0' })` — 같은 이름에 덮어쓰므로 캐시를 끕니다.

**5.2-1 걸림돌 (뒤쪽 장 미리 보기 줄이기, D15-1)**
- **뒤섞기(난독화)**: JSON 문자열을 간단한 방식(예: 방 코드에서 만든 키로 XOR 후 base64)으로 바꿔 올립니다. 보안 장치가 아니라 **호기심에 F12를 눌러 보는 정도를 막는 걸림돌**입니다.
- **화면에는 지금 장만**: 받은 덱은 자바스크립트 변수(메모리)에만 두고, 캔버스에는 지금 보여 줄 장만 넣습니다.
- 학생 화면 코드에서 덱 변수를 `window`에 걸지 않습니다(콘솔에서 바로 꺼내 보지 못하게).

### 5.3 RTDB (전용 인스턴스 권장, 예: `motionslide-live` asia-southeast1)
```
live/{code}/
  createdBy, creatorName, creatorSchool, createdAt     // rtdbRoom().createRoom()이 방 노드 바로 아래에 씀
  name                                                 // 함께 보기 이름(D20)
  deckId, deckTitle                                    // 관리자 PC의 어떤 덱인지(발표자 모드에서 이어 붙일 때 찾음)
  file: 'live_slides/{code}/{이름}.json'                // 학생이 받을 덱 파일
  status: 'live'                                       // rtdbRoom().exists(code, 'status')가 확인하는 칸. 취소하면 방째 지움
  mode: 'live' | 'browse'                              // 실시간 페이지 / 전체 보기 (관리자만 씀, D18)
  presenting: bool                                     // 관리자가 지금 발표자 모드에 있는지(onDisconnect로 false)
  state: { slideId, index, total, step, deckV, at }    // 관리자만 씀
  pointer: { x, y, at }                                // (4단계 선택) 레이저
live_index/{code}: { createdBy, creatorName, creatorSchool, name, deckId, deckTitle, mode, createdAt }   // [Firebase Storage 관리]의 함께 보기 목록
```
- `rtdbRoom(rtdbLive, { roomsPath: 'live', indexPath: 'live_index' })` 로 만들면 방 목록·등록이 기존 방식과 맞습니다.
- `createRoom(code, roomData, indexData)`는 `set(live/{code}, { createdAt, createdBy, creatorName, creatorSchool, ...roomData })`로 **방 노드 전체**를 씁니다. 그래서 소유자·상태 칸은 방 노드 바로 아래에 둡니다(7.2 규칙도 이 모양 기준).
- **학생은 이 RTDB에 아무것도 쓰지 않습니다**(읽기만). 접속 표시는 기존 접속 전용 RTDB(`rtdbPresence`)에 씁니다.

### 5.4 크기 제한
| 항목 | 제한 |
|---|---|
| 학생용 덱 파일 | 30MB 미만 (영상을 빼면 20장에 보통 수 MB). 함께 보기를 열 때 크기를 보이고, 20MB를 넘으면 "학생 1명당 많이 받아요"로 경고 |

---

## 6. 함께 보기

### 6.1 관리자 흐름 — 발표자 모드의 [함께 보기 ▾] 드롭다운
발표자 모드(`Show.kind === 'presenter'`) 상단 바에 **[함께 보기 ▾]** 드롭다운을 둡니다(`data-pv="live"`).
- **관리자에게만 보입니다**(D11). `window.SlideCloud.isAdmin`이 참일 때만 표시하고(`.cloud-only`와 같은 방식), 실제 쓰기 권한은 보안 규칙이 확인합니다.

**이 덱으로 연 함께 보기가 없을 때**
```
[ 함께 보기 ▾ ]
   ▶ 함께 보기 시작…
```
- [함께 보기 시작…] → **시작 창**
  ```
  ┌ 함께 보기 시작 ─────────────────────────────────────────┐
  │ 이름 [ 일차방정식의 활용 11-20 3반          ]            │  ← 기본값 "덱 제목 + 날짜"(D20)
  │ 모드 (●) 실시간 페이지 — 수업 중, 선생님 장을 따라 봄     │
  │      ( ) 전체 보기     — 복습용, 학생이 모든 장을 넘겨 봄 │
  │ 학생 1명당 받는 양: 약 6MB                              │
  │                                  [취소] [시작]          │
  └────────────────────────────────────────────────────────┘
  ```
  → `rtdbRoom.newCode()` → `createRoom()`(name·deckId·deckTitle·file·mode) → `deck.css`·학생용 덱 파일 업로드(6.3) → `state`
- 덱 업로드는 크기에 따라 몇 초 걸릴 수 있어 "학생 화면 준비 중…(n%)"을 보입니다(`uploadBytesResumable`로 진행률).

**이 덱으로 연 함께 보기가 있을 때** (같은 `deckId`인 `live_index`가 있으면 자동으로 이어 붙음)
```
[ 함께 보기 · AB3K ▾ ]
   일차방정식의 활용 11-20 3반     ← 이름 (접속 27명)
   ───────────────
   ◉ 실시간 페이지
   ○ 전체 보기
   ───────────────
   QR 다시 보기
   ───────────────
   함께 보기 취소…                 ← 빨간 글씨
```
- 같은 덱으로 함께 보기를 여러 개 열었으면 드롭다운 맨 위에서 고릅니다(예: 3반용, 4반용).
- **모드 전환**은 `live/{code}/mode`와 `live_index/{code}/mode`만 바꿉니다. 학생 화면은 바로 바뀝니다(6.10). 전체 보기를 고를 때 "학생이 모든 장을 볼 수 있어요"를 한 번 알립니다.
- 덱을 고친 경우 다시 보내는 메뉴는 없습니다. 발표를 다시 시작할 때 자동으로 올라갑니다(6.3).
- **[함께 보기 취소…]** → 확인 창("취소하면 학생 화면과 Storage 파일이 모두 지워집니다") → 서버 정리(9장).

**그 밖의 흐름**
1. 시작하면 청중 창(`Show.popup`)에 **QR + 방 코드 + 이름 + 안내 문구**를 크게 덮어 보입니다.
   - QR 주소: `{사이트}/pages/automation/class/motionslide.html#/live/{code}`
   - 안내 문구: "QR을 찍거나, AI 모션 슬라이드 첫 화면의 [함께 보기]를 눌러 코드를 입력하세요"
   - 학생이 다 들어오면 [QR 닫기]. 드롭다운의 [QR 다시 보기]로 언제든 다시 띄웁니다.
2. 발표자 바에 **접속 인원**(`watchRoomPresence`)과 전송 상태(보내는 중 / 보냄 / 실패)를 작게 표시합니다.
3. 진행은 평소처럼 하면 됩니다. 넘길 때마다 6.4가 자동으로 동작합니다.
4. **[편집 모드로]·Esc**(`Show.exit`) → 함께 보기는 **그대로 열려 있습니다**(D5). `presenting = false`가 되고, 실시간 페이지 모드의 학생 화면에는 "선생님이 발표 화면을 잠시 나갔어요"가 뜹니다. 전체 보기 모드면 학생은 계속 넘겨 볼 수 있습니다.

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
- **빠른 입장 모드와 같은 방식**(D14): 방 코드만 받습니다. 닉네임은 접속 표시용으로 자동 발급합니다.
- 코드: 공백 제거·대문자 변환·4자리. 틀리면 "열려 있는 수업이 없어요. 코드를 다시 확인해 주세요"
- QR로 들어오면(`#/live/{code}`) 코드가 채워진 채로 창이 뜨고, [입장하기]만 누르면 됩니다.
- 관리자가 눌러도 같은 코드 입력 창만 뜹니다(학생 화면 확인용). 함께 보기 관리는 [Firebase Storage 관리](6.11)에서 합니다.

**입장 뒤**
1. 해시를 `#/live/{code}`로 바꾸고, 메인·편집 화면을 숨긴 채 **학생 보기 화면 `#live-view`**(전체 화면 캔버스)를 보입니다. `MobileView.route`·해시 라우터에 `#/live/` 분기를 더합니다.
2. `live/{code}/status`가 없으면(취소된 함께 보기) "끝난 수업입니다"
3. `deck.css`와 덱 파일(`live/{code}/file`)을 받아, 덱은 풀어서(뒤섞기 되돌림) **메모리에만** 둡니다. 받는 동안 "수업 자료 받는 중…(n%)"을 보입니다.
4. `mode`·`state`를 구독(`onValue`)합니다.
   - `state.deckV`가 받아 둔 덱과 다르면 → 덱 파일을 다시 받음(관리자가 덱을 고친 경우)
   - 그리기는 모드에 따라 6.10을 따릅니다. 이미 받아 둔 덱이라 **바로 넘어갑니다**
5. 화면: 16:9 캔버스를 화면 폭에 맞춤. 두 손가락으로 확대할 수 있게 합니다(`meta viewport`에서 확대 허용).
6. 학생은 모드를 **고를 수 없습니다**(D18). 화면 위쪽에 지금 모드를 글자로만 보입니다("📡 선생님 화면을 따라 보는 중" / "📚 자유롭게 넘겨 보세요").
7. 오른쪽 위 **[나가기]** → 구독을 끊고 메인(`#/`)으로 돌아갑니다.
8. 참고: 학생도 `motionslide.html` 전체(편집기 코드·라이브러리)를 내려받습니다. 첫 로딩이 별도 페이지보다 조금 무겁지만, 브라우저 캐시에 남아 두 번째부터는 빠릅니다.

### 6.3 덱 올리기 규칙 (관리자)
```
Live.ensureDeck():
  slides = deck.slides.map(slide => ({ id, bg, view: 자리표시(Exporter.view(slide)), maxStep }))
  body   = JSON.stringify({ format, title, slides })
  deckV  = sha256(body).slice(0, 8)
  if (Live.deckV === deckV) return deckV             // 이미 같은 내용이 올라가 있음
  upload(`live_slides/${code}/${safeFileName(name)}.json`, scramble({ ...body, deckV }, code))
  Live.deckV = deckV
  return deckV
```
- 부르는 때: 함께 보기를 시작할 때, 발표를 다시 시작할 때(`Show.enter`, 이 덱의 함께 보기가 열려 있으면) — 편집 모드에서 고쳤으면 해시가 달라져 자동으로 다시 올라갑니다.
- 장은 **id 기준**으로 찾습니다. 장 순서를 바꿔도 `state.slideId`로 정확한 장을 그립니다.
- 올리기가 **끝난 뒤에** `state.deckV`를 바꿉니다. 학생이 아직 올라가지 않은 덱을 찾는 일을 막기 위해서입니다.
- 실패하면 3번까지 다시 시도하고, 그래도 안 되면 발표자 바에 "학생 화면 전송 실패"를 띄웁니다(다음에 발표를 다시 시작할 때 또 시도).
- 덱을 다시 올리면 접속한 학생 모두가 덱 전체를 다시 받습니다. 수업 중 수정은 꼭 필요할 때만 하도록 안내합니다(8.2).

### 6.4 진행 신호 쓰기 — 연결점
- `Show.paint()` 끝과 `Show.applyStep()` 끝에서 `Live.sync()`를 부릅니다. 모든 넘김이 결국 이 둘을 지나갑니다.
- 전체 보기 모드에서도 `state`는 계속 씁니다(실시간으로 되돌렸을 때 바로 맞추기 위해). 학생 화면이 전체 보기일 때는 무시합니다.
- `Live.sync()`는 150ms 디바운스(빠르게 연타할 때 마지막 것만)를 겁니다.
  ```
  state = { slideId, index: Show.index, total, step: Show.step (Infinity면 maxStep), deckV, at: serverTimestamp }
  ```
- `Show.step`은 앞 장으로 돌아갈 때 `Infinity`가 들어가므로, RTDB에 쓰기 전에 `maxStep`으로 바꿉니다(RTDB는 Infinity를 저장 못 함).

### 6.5 학생 화면 그리기 (`#live-view`)
- 캔버스 배율은 편집기의 `fitStage(host, scaler, 0)`을 그대로 씁니다.
- `view`를 캔버스에 넣는 부분은 `exportRuntime()`의 `fillCanvas`를 본떠 만듭니다: `canvas.className = view.cls`, `innerHTML = view.html`, `view.css`를 `<style>`로 맨 앞에 넣고, 배경색 적용.
- 화면 전환 효과(`paint`의 ghost 복제)는 그대로 써도 되고, 저사양 기기를 생각하면 끌 수 있게 합니다.
- 인터랙티브 iframe(srcdoc)은 학생 기기에서 그대로 실행됩니다. 칸 안의 `appBridge`가 보내는 `nav`·`escape` 메시지는 학생 보기 화면에서 무시합니다. 편집기의 기존 `message` 처리기가 `#live-view`의 칸에 반응하지 않는지 확인합니다.
- **미리 보기의 한계(D15-1)**: 실시간 페이지 모드에서도 뒤쪽 장과 아직 공개하지 않은 단계의 상자가 받은 덱 안에 들어 있습니다. 화면에서는 볼 수 없지만, PC에서 개발자 도구로 덱을 풀어 보면 볼 수 있습니다(휴대폰·태블릿은 사실상 불가능). 5.2-1의 걸림돌로 가볍게 막습니다.

### 6.6 동영상 · 유튜브 · 인터랙티브
| 개체 | 학생 화면 | 방법 |
|---|---|---|
| 동영상 파일(`<video>` data URL) | 자리표시 "🎬 선생님 화면을 보세요" | 업로드 전에 `freeze()`의 자리표시 방식으로 바꿈. `poster`가 있으면 정지 그림으로 |
| 유튜브·비메오 iframe | 같은 자리표시 | 소리 겹침 방지 |
| 인터랙티브 요소 | 그대로 실행, 각자 조작 | 교사 조작은 따라 보이지 않음(D10) |
| 모션그래픽·수식 | 그대로 | 이미 SVG로 그려져 있음 |

### 6.7 재접속 · 늦은 입장 · 새로고침
- 늦게 들어온 학생: 덱 전체를 받은 뒤 `state`의 지금 장부터 봅니다(덱 파일은 함께 보기를 취소할 때까지 남아 있음, D3).
- 새로고침: 받은 덱(뒤섞인 그대로)을 IndexedDB에 `{code, deckV}`로 보관해 두면 다시 받지 않습니다(사용량 절약). 나가거나 함께 보기가 취소되면 지웁니다.
- RTDB 연결이 끊기면 SDK가 다시 연결합니다. 학생 화면에 "연결이 끊겼어요, 다시 연결 중…"을 표시합니다(`.info/connected` 구독). 다시 연결되면 지금 장으로 바로 맞춰집니다.
- 학생이 다른 탭으로 가면 접속 상태가 '다른화면'으로 보입니다(`startRoomPresence`가 처리).

### 6.8 수업 중 수정 반영
- 편집 모드로 나가 장을 고친 뒤 다시 발표를 시작하면, 덱 해시가 달라져 자동으로 덱 전체를 다시 올리고 학생들이 새로 받습니다.
- (선택 최적화) 고친 장만 `live_slides/{code}/patch/{slideId}.json`으로 올리고 `state.patches`로 알리면 다시 받는 양을 줄일 수 있습니다. 처음 구현에서는 덱 전체 재전송으로 충분합니다.

### 6.9 발표자 모드를 나가거나 다시 들어올 때
- `Show.exit()` → `presenting = false`, 신호 쓰기를 멈춤. 함께 보기·파일은 그대로입니다(D5). 끝내려면 [함께 보기 취소]를 눌러야 합니다.
- 같은 덱으로 다시 발표자 모드에 들어오면 열린 함께 보기에 자동으로 이어 붙고(`presenting = true`), 덱을 고쳤으면 다시 올립니다.
- 관리자 브라우저가 갑자기 닫힘 → RTDB `onDisconnect`로 `presenting = false`를 걸어 둡니다.

### 6.10 실시간 페이지 / 전체 보기 (관리자만 전환, D18)
| | 실시간 페이지 (`mode: 'live'`) | 전체 보기 (`mode: 'browse'`) |
|---|---|---|
| 쓰임 | 수업 중 | **수업 뒤 복습 전용** |
| 학생 화면 | 선생님이 보는 장·단계를 따라 봄. 넘기기 단추 없음 | 아래쪽 **◀ 3 / 20 ▶** 단추·좌우 밀기·키보드 화살표로 **모든 장**을 넘겨 봄 |
| 단계별 공개 | 선생님이 공개한 단계까지 | 모든 단계를 펼친 상태(`applySteps(canvas, Infinity)`) |

- 모드는 **[함께 보기 시작…] 창에서 고르고**, 이후 발표자 드롭다운(6.1)에서 바꿀 수 있습니다. [Firebase Storage 관리]에서는 바꾸지 않습니다(D19).
  - 실시간 → 전체 보기: 학생은 지금 보던 장에서 시작합니다.
  - 전체 보기 → 실시간: 학생 화면이 선생님 장(`state`)으로 바로 맞춰집니다.
- 전체 보기는 복습용이라 선생님 위치 표시나 [선생님 장으로] 같은 수업 중 기능은 두지 않습니다.
- [전체 보기]에서는 **뒤쪽 장(정답 포함)도 보입니다.**

### 6.11 [Firebase Storage 관리] — 불러오기 + 함께 보기 취소 (관리자 전용, D19)
따로 대시보드를 만들지 않고, 지금 있는 관리자 전용 **[Firebase Storage에서 불러오기]**(`CloudUI.open()`, 모달 `#cloud-modal`)를 **[Firebase Storage 관리]**로 이름을 바꿔 두 가지를 함께 합니다.

**이름을 바꿀 곳** (모두 `.cloud-only`, 관리자에게만 보임)
| 위치 | 지금 | 바꾼 뒤 |
|---|---|---|
| 메인 `#home-actions` 단추 | Storage에서 불러오기 | **Storage 관리** |
| 휴대폰 `#mobile-block` 단추 | Storage에서 불러오기 | **Storage 관리** |
| 편집 화면 불러오기 메뉴 `[data-act="cloud-list"]` | Firebase Storage에서 (관리자) | **Firebase Storage 관리 (관리자)** |
| 모달 제목 | Firebase Storage에서 불러오기 | **Firebase Storage 관리** |

**모달 구성**
```
┌ Firebase Storage 관리 ───────────────────────────────────────────┐
│ 저장된 슬라이드                                                    │
│  일차방정식의 활용      11-20 14:02 저장 · 5.8MB   [불러오기] [🗑]  │  ← 지금 기능 그대로(motion_slides/)
│  확률                  11-18 09:40 저장 · 3.1MB   [불러오기] [🗑]  │
│ ─────────────────────────────────────────────────────────────── │
│ 함께 보기 중 (2)                                                   │  ← 열린 함께 보기가 있을 때만 보임
│  일차방정식의 활용 11-20 3반   AB3K · 실시간 페이지   [함께 보기 취소] │
│  확률 복습                    K2PD · 전체 보기       [함께 보기 취소] │
└──────────────────────────────────────────────────────────────────┘
```
- **저장된 슬라이드**: 지금 `CloudUI.open()`이 하는 목록·[불러오기]·[🗑 삭제]를 그대로 둡니다(`motion_slides/` 폴더).
- **함께 보기 중**: `live_index` 전체(관리자만 읽기, 7.2)를 읽어 이름 · 코드 · 모드를 보입니다. 열린 함께 보기가 없으면 이 영역을 숨깁니다.
  - 동작은 **[함께 보기 취소]** 하나뿐입니다. 확인 창("취소하면 학생 화면과 함께 보기용 Storage 파일이 지워집니다. 저장된 슬라이드는 그대로입니다") → 서버 정리(9장) → 목록 새로 그림.
  - 함께 보기용 파일(`live_slides/`)은 **저장된 슬라이드 목록에 섞이지 않습니다**(다른 폴더).
- 모드 전환·QR은 여기서 하지 않고 발표자 모드 드롭다운(6.1)에서 합니다.
- 메인 페이지의 **[함께 보기]** 단추는 관리자에게도 학생과 같은 **코드 입력 창만** 엽니다(학생 화면 확인용).

---

## 7. 보안 규칙 초안

> **초안**입니다. 콘솔의 실제 규칙과 기존 앱 규칙 스타일에 맞춰 다듬고, 배포 전에 Rules Playground로 시험하세요.
> 학생은 **Firebase 로그인을 하지 않고**, 이 기능의 RTDB·Storage에 **쓰지 않습니다**(읽기만). 쓰기는 모두 관리자입니다.
> 아래 `isAdmin` 조건은 기존 `motion_slides/` Storage 규칙(관리자 전용 저장)에 이미 쓰고 있는 조건과 **같은 것**으로 맞추세요(`<ADMIN_EMAIL>` = `motionslide.html`의 `ADMIN_EMAIL`).

### 7.1 Storage
```
function isAdmin() {
  return request.auth != null && request.auth.token.email == '<ADMIN_EMAIL>' && request.auth.token.email_verified == true;
}
match /live_slides/{code}/{allPaths=**} {
  allow get: if true;                    // 학생 읽기 (목록은 못 봄)
  allow list: if isAdmin();              // 정리할 때 deleteStorageFolder가 listAll을 씀
  allow create, update: if isAdmin()
    && request.resource.size < 30 * 1024 * 1024
    && request.resource.contentType.matches('(application/json|text/css).*');
  allow delete: if isAdmin();
}
```
- 버킷 **CORS**에 사이트 주소가 허용돼 있어야 학생 `getBlob`이 됩니다(`CloudUI.errorText`가 이미 이 오류를 안내함).

### 7.2 RTDB (전용 인스턴스)
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
        "status":     { ".read": true },
        "name":       { ".read": true },
        "file":       { ".read": true },
        "mode":       { ".read": true },
        "presenting": { ".read": true },
        "state":      { ".read": true }
      }
    }
  }
}
```
- 학생은 위 칸들을 읽기만 합니다. 접속 표시는 기존 `rtdbPresence` 규칙을 따릅니다.
- `firebase-config.js`의 App Check가 RTDB·Storage에서 **실제로 강제(enforce)되는지** 콘솔에서 확인하세요. 최근 커밋 "앱체크 설정 약화"가 있었습니다.
- Firestore는 새 컬렉션이 없어 추가 규칙이 없습니다(`room_registry`는 기존 규칙).

---

## 8. 사용량과 비용

> 2026-11 기준 공식 요금 페이지 수치입니다. 바뀔 수 있으니 구현 전에 다시 확인하세요.

### 8.1 요금이 매겨지는 기준
| 서비스 | 기준 | 무료 한도 |
|---|---|---|
| Storage | 저장 용량 + **내려받은 양(GB)** | 5GB 저장, 월 100GB 내려받기. **버킷이 us-central1 · us-west1 · us-east1일 때만** 적용. 2026-02-03부터 Storage는 Blaze 요금제가 필요 |
| RTDB | **내려받은 양**(접속 유지 부가 데이터 포함) + 저장 용량 | 하루 약 360MB(월 약 10GB), 넘으면 GB당 $1 |
| Firestore | **문서 읽기·쓰기 건수** | 하루 읽기 5만, 쓰기 2만 (사이트의 다른 앱과 함께 씀) |

### 8.2 한 수업 계산 (학생 30명, 20장, 장당 평균 300KB, 넘김 100번)
| 항목 | 계산 | 양 |
|---|---|---|
| 학생용 덱 (Storage) | 6MB × 30명 (입장할 때 한 번) | 약 180MB |
| 수업 중 덱을 한 번 고쳐 다시 보냄 | 6MB × 30명 | +180MB |
| 진행 신호 (RTDB) | 100번 × 30명 × 약 0.5KB | 약 1.5MB |
| 접속 표시 (RTDB) | 기존 게임과 같은 방식 | 수 MB 이하 |
| Firestore | 방 목록(`room_registry`) 등록·해제 | 몇 건 |

- 하루 5반 × 20일 = 월 100회 → Storage 월 **약 18GB**: 미국 지역 버킷이면 무료 한도(100GB) 안. RTDB는 하루 수십 MB 이하로 무료 한도(360MB/일) 안.
- 덱을 RTDB로 보냈다면 18GB − 무료 10GB = 8GB × $1 = **월 약 $8**. 덱을 Storage에 두는 이유입니다.
- 입장 순간 30명이 동시에 덱을 받는 **몰림**이 있습니다. 학교 와이파이가 느리면 입장에 수십 초 걸릴 수 있으니, 수업 시작 전에 미리 입장시키도록 안내합니다.

### 8.3 많이 쓰게 되는 경우와 줄이는 법
| 원인 | 줄이는 법 |
|---|---|
| 동영상이 든 장 | 학생용 덱에는 자리표시로 바꿔 보냄(D9) |
| 큰 그림이 여러 장에 반복 | (2단계) 그림을 장 밖으로 빼서 한 번만 받음 |
| 새로고침·재접속 | 받은 덱을 학생 브라우저에 보관(6.7) |
| 수업 중 덱 수정 | 다시 보낼 때마다 덱 전체를 다시 받음 → 꼭 필요할 때만, 또는 고친 장만 보내기(6.8) |
| 버킷이 미국 밖 지역 | Storage 무료 한도가 없음 → **콘솔에서 버킷 위치 확인** |
| 의외의 청구 | Firebase 예산 알림 설정 (알림만 보내고 사용을 막지는 않음) |

---

## 9. 정리(삭제) 정책

### 9.1 지금 room-registry가 하는 일 (2026-11-15 확인)
- 방을 만들 때 `room_registry`에 위치(`parts`)·만든 사람·`createdAt`을 기록합니다.
- 방이 지워지는 경우는 **교사가 직접 지울 때, 학교를 바꿀 때, 교사 계정 삭제·탈퇴 때**(`js/teacher-cleanup.js`)뿐입니다.
- **시간이 지났다고 자동으로 지우는 기능은 없습니다.**

### 9.2 이 기능의 정리 절차
| 동작 | Storage 파일 | RTDB 방 |
|---|---|---|
| 발표자 모드 나가기 (`Show.exit`) | 유지 | 유지(`presenting = false`) |
| 모드 전환 | 유지 | 유지 |
| **[함께 보기 취소]** (발표자 드롭다운·[Firebase Storage 관리]) | 삭제 | 삭제 |

- 취소 순서: `deleteStorageFolder('live_slides/' + code)` → `purgeRoomParts(code, parts)`(RTDB 방·인덱스) → `unregisterRoom(code, parts)`
- 취소하면 그 코드로 들어와 있던 학생 화면에는 "끝난 수업입니다"가 뜹니다.
- **시간 기준 자동 정리는 두지 않습니다**(D7). 열린 함께 보기는 [Firebase Storage 관리]에서 한눈에 보고 정리합니다(6.11).

---

## 10. 단계별 구현 계획

### 0단계 — Firebase 콘솔 준비
- [ ] RTDB 인스턴스 만들기(예: `motionslide-live`, asia-southeast1) → `firebase-config.js`에 `rtdbLive` 추가·export
- [ ] RTDB 규칙(7.2), Storage 규칙(7.1) 배포 — 관리자 조건은 기존 `motion_slides/` 규칙과 같게
- [ ] Storage 버킷 **위치**·**CORS** 확인
- [ ] App Check가 RTDB·Storage에서 강제되는지 확인
- [ ] 예산 알림 설정

### 1단계 — 함께 보기
- [ ] `motionslide.html`: `Live` 객체 (`start` · `attach` · `detach` · `setMode` · `cancel` · `ensureDeck` · `uploadOriginal` · `sync`)
- [ ] 시작 창: 이름(기본값 덱 제목 + 날짜) + 모드 선택 + 학생 1명당 받는 양 표시
- [ ] 학생용 덱 업로드(진행률), 뒤섞기·풀기(5.2-1), 영상 자리표시, notes 제외
- [ ] 발표자 바 **[함께 보기 ▾] 드롭다운**(관리자에게만): 시작… / 이름·코드·접속 인원 / ◉실시간 페이지 ○전체 보기 / QR 다시 보기 / 함께 보기 취소…, 전송 상태
- [ ] 청중 창 QR 덮개(qrcodejs 1.0.0, `motionslide.html#/live/{code}` + 코드·이름 크게 + 안내 문구)
- [ ] `Show.paint` · `Show.applyStep` 끝에 `Live.sync()`, `Show.enter`에 `Live.attach()`, `Show.exit`에 `Live.detach()`
- [ ] 메인 `#home-actions` · `#home-setup`의 [AI 설정] 왼쪽, `#mobile-block`에 [함께 보기] 단추
- [ ] 입장 모달 `#live-join-modal`(코드 4자리만, 닉네임 자동), 해시 `#/live/{code}` 라우팅(QR이면 코드 자동 입력)
- [ ] 학생 보기 화면 `#live-view`: 덱 받기(진행률, 메모리에만), `mode`·`state` 구독, 지금 장만 화면에 넣기, 단계, 대기·종료 화면, 연결 상태, [나가기], 접속 표시
- [ ] 전체 보기 모드(6.10): ◀ ▶·밀기·화살표, 단계 모두 펼침
- [ ] **[Storage에서 불러오기] → [Firebase Storage 관리]로 이름 변경**(메인·휴대폰·편집 화면 메뉴·모달 제목), 모달에 "함께 보기 중" 영역(이름·코드·모드·[함께 보기 취소]) 추가(6.11)
- [ ] 취소 절차(9장)

### 2단계 — 선택
- [ ] 레이저·하이라이트 동기화(`live/{code}/pointer`, 5회/초, 움직일 때만)
- [ ] 그림을 장 밖으로 분리해 중복 전송 줄이기
- [ ] 고친 장만 다시 보내기(6.8)
- [ ] 청중 화면만 쓰는 모드(`Show.kind === 'audience'`)에서도 함께 보기

---

## 11. 시험 목록

- [ ] 관리자 PC + 학생 기기 2대 이상(휴대폰 1, 태블릿 1)
- [ ] 관리자가 아닌 계정·비로그인에서 [함께 보기 ▾]·[Firebase Storage 관리]가 안 보이는지, 규칙이 쓰기를 막는지
- [ ] [함께 보기] 단추: 메인(키 있음·없음)과 휴대폰 화면 세 곳
- [ ] QR 입장(코드 자동 입력), 코드 직접 입력, 잘못된 코드, 취소된 함께 보기
- [ ] 시작 창에서 고른 모드로 시작하는지
- [ ] 넘김·단계 진행·앞 장으로 돌아가기(`step = Infinity` → `maxStep` 변환)
- [ ] 늦게 들어오기, 새로고침, 와이파이 껐다 켜기(다시 연결되면 지금 장으로 맞춰지는지)
- [ ] 수업 중 장 고치고 발표 재시작 → 덱 다시 올라가고 학생 화면 갱신
- [ ] 장 순서 바꾸기, 장 삭제 후 진행
- [ ] 동영상·유튜브 장이 자리표시로 보이는지, 시나리오가 학생에게 가지 않는지
- [ ] 덱 크기 큰 경우 입장 시간, 학생 30명 동시 입장
- [ ] 학생 화면 요소(Elements) 탭에 지금 장만 있는지, 네트워크 탭의 덱 파일이 바로 읽히지 않는지
- [ ] 발표 중 관리자 브라우저 강제 종료 → `presenting = false`, 함께 보기는 유지
- [ ] 실시간 ↔ 전체 보기 전환이 학생 화면에 바로 반영되는지, 학생 화면에 모드 선택이 없는지
- [ ] 전체 보기에서 모든 장·모든 단계가 보이는지
- [ ] 발표자 모드를 나간 뒤에도 전체 보기로 복습이 되는지
- [ ] [Firebase Storage 관리]: 저장된 슬라이드 불러오기·삭제가 그대로 되는지, 열린 함께 보기가 있을 때만 "함께 보기 중"이 보이는지, 함께 보기 파일이 저장된 슬라이드 목록에 섞이지 않는지
- [ ] [Firebase Storage 관리]·드롭다운 [함께 보기 취소] → Storage·RTDB가 지워지고 학생 화면에 "끝난 수업입니다"
- [ ] 같은 덱으로 함께 보기 두 개(3반·4반) 동시에 열고 드롭다운에서 고르기
- [ ] Storage 콘솔에서 `live_slides/{code}/{이름}.json`으로 구분되는지, 특수문자 이름
- [ ] 규칙 거부 때 안내 문구(App Check 실패 / 권한 없음)
- [ ] 한 수업 뒤 Firebase 콘솔 사용량(Storage 내려받기, RTDB 내려받기) 확인 → 8.2 계산과 비교

---

## 12. 남은 결정 사항

| # | 질문 | 제안 |
|---|---|---|
| Q1 | RTDB: 새 인스턴스 vs 기존 기본 인스턴스의 하위 경로 | 새 인스턴스(규칙·사용량을 분리해서 보기 쉬움) |
| Q2 | 유튜브를 학생 기기에서 각자 재생하게 할지 | 기본은 자리표시 |

**결정됨 (2026-11-15)**: 함께 보기는 관리자 전용(D11) · 학생 입장은 메인 [함께 보기] → 코드 입력(D12) · 빠른 입장처럼 코드만(D14) · 덱 전체를 한 번에 받는 A 방식(D15) · 의견 모으기 제외, 실시간 화면 공유만(D16) · 실시간/전체 보기는 관리자만 전환(D18) · [Firebase Storage 관리]와 발표자 드롭다운에서 관리·취소(D19) · 함께 보기 이름 = Storage 파일 이름(D20) · 시간 기준 자동 정리 없음(D7)

---

## 13. 참고

**관련 파일**
- `pages/automation/class/motionslide.html` — 편집기·발표·내보내기 (이 기능을 붙일 곳)
- `js/firebase-config.js` · `js/firebase-storage.js` — Firebase 초기화, Storage 도우미
- `js/game-kit.js` · `js/room-registry.js` — 방 만들기·등록·정리, 접속 표시
- `js/room-auth.js` — 닉네임·기기 식별 참고
- `js/teacher-auth.js` — 로그인 상태(관리자 판단)
- `js/qr-modal.js` — QR 패널(참고)

**요금·한도 문서**
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Understand Realtime Database billing](https://firebase.google.com/docs/database/usage/billing)
- [Understand Cloud Firestore billing](https://firebase.google.com/docs/firestore/pricing)
- [Firestore pricing](https://cloud.google.com/firestore/pricing)
