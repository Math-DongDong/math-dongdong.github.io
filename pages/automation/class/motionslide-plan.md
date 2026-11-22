# 모션 슬라이드 통합 설계서 — 함께 보기 · 발표 리모컨 · 수업 활동

> **최종 상태**: **함께 보기 & 발표 리모컨 1단계 및 수업 활동 0·1·2단계 구현 완료 (2026-11-22)** — 콘솔 보안 규칙 배포 및 실제 교실 수업 시험 단계  
> **대상 파일**: [motionslide.html](file:///c:/Users/jjes0/OneDrive/Desktop/VibeCoding/math-dongdong.github.io/pages/automation/class/motionslide.html), `js/firebase-config.js` (`rtdbLive`), `pages/admin/account_manager.html` ([권한 동기화]), `js/teacher-cleanup.js`, `assets/json/motionslide-prompts.json`  
> **문서 목적**: 실시간 화면 공유(함께 보기), 모바일 발표 리모컨, 그리고 그 위에 얹은 수업 활동(객관식·장문형 의견 모으기 및 학생 슬라이드 보기)의 아키텍처, 데이터 구조, 보안 규칙, 작업 목록, 의사결정 기록을 단일 문서로 종합 보존합니다.

---

## 0. 한눈에 보기

```
[교사 PC: 편집기]
  장 ⋯ 메뉴 / 직접 삽입 → [질문 붙이기] → slide.ask (덱에 저장)
  [Firebase Storage 관리] ──► Storage motion_slides/{uid}/{파일}.html (슬라이드 영구 보관)
                             RTDB    live/{code}/mode (보기 모드 전환) / live/{code} (취소 및 정리)

[교사 PC: 발표자 모드 / 청중 모드]
  [함께 보기 ▾] → 실시간 시작 → 덱 {이름}.json(난독화) + 영상 파일을 Storage에 업로드
  Show.paint / applyStep ────► Live.sync()    ──► RTDB live/{code}/state      {slideId, step, deckV}
  [⏸ 학생 화면 멈추기] (S) ───► Live.pause()   ──► RTDB live/{code}/paused     true / false
  질문 장 진입 / 이탈       ───► Live.openAsk() ──► RTDB live/{code}/asks/{id}  'open' / 'closed'
  발표자 바 [👥 27] [❓ 12/27] ◄── RTDB live_answers/{code}/{id}/* (학생 답안 구독, 교사만 읽음)
  [청중 화면에 결과 띄우기]  ───► 청중 화면에 이름 숨김 형태로 결과 표시

[교사 모바일/태블릿: 발표 리모컨] (화면이 1개인 교실, D34~D37, 6.13)
  PC [발표 시작 ▾] → [휴대폰으로 진행] → 같은 교사 계정 로그인으로 자동 연결
  휴대폰 UI: 이전/다음 넘기기, 클릭 요소 진행 배지, 발표 시나리오, 타이머, 모든 장 썸네일, 화면 일시정지
  수업 활동 결과 판(A21): [응답 n · 결과] → 모바일에서 학생 답 확인 및 ★ 선택 후 PC 화면에 띄우기/내리기

[학생 기기: 휴대폰 · 태블릿 · PC] (로그인 없음, D12, A7)
  메인 [함께 보기] / QR(?room=CODE) → 빠른 입장(닉네임 자동) / 학번 인증
  → 덱 파일 1회 수신 (메모리 전용, 지금 장만 DOM 렌더링)
  → RTDB live/{code}/state 구독으로 장·단계 동기화
  → 일시정지(paused=true) 시: 화면 전체 덮개 "👀 선생님을 봐 주세요"
  → 질문 열림(asks/{id}='open') 시:
      - 객관식/장문형: 알약 단추 클릭 → 답안 판 / 📷 사진 첨부 → [제출]
      - 학생 슬라이드: [✏️ 내 슬라이드 활동] → 장 위 활동 막대 → 인터랙티브 조작 + 글상자(10개) + 판서 → [제출]
  → [제출] ──► RTDB live_answers/{code}/{id}/{닉 또는 학번} (무작위 제출 열쇠 token 기반 위변조 방지)
```

| 주요 기능 | 상세 설명 |
|---|---|
| **함께 보기 (Live)** | 승인된 교사와 관리자 전용. 발표자 모드에서 이름을 붙여 방을 열면 QR·코드가 생성됩니다. 학생은 메인 화면의 [함께 보기] 단추나 QR을 통해 들어와 슬라이드를 실시간으로 봅니다. |
| **입장 방식** | 교사가 시작 시 선택. **[빠른 입장]**(방 코드만 입력, 닉네임 자동 발급) / **[학번 인증]**(기존 게임과 동일한 학번 + PIN, 공용 기기는 게스트 승인). |
| **보기 모드** | **[실시간 페이지]**: 교사가 넘기는 장·단계를 학생이 그대로 따라 봄(수업 중). **[전체 보기]**: 학생이 모든 장을 직접 넘겨보고 동영상도 각자 재생(수업 후 복습용). 모드 전환은 **[Storage 관리]**에서만 수행합니다. |
| **학생 화면 일시정지** | 발표자 화면의 **[⏸ 학생 화면 멈추기]**(단축키 `S`). 학생 화면 전체가 어두워지며 "👀 선생님을 봐 주세요"가 표시되어 설명 집중을 유도합니다(실시간 모드 전용). |
| **휴대폰 리모컨** | 화면이 프로젝터 1대뿐인 교실용. PC는 청중 화면만 전체화면으로 띄우고, 교사 휴대폰·태블릿이 장 넘기기, 시나리오, 타이머, 모든 장 보기, 화면 멈추기, 활동 결과 띄우기를 원격 제어합니다. |
| **수업 활동 (의견 모으기)** | 객관식(단일/복수 선택, 이유 작성) 및 장문형(텍스트 + 학생 촬영 사진 1장). 교사가 해당 장에 머무는 동안만 질문이 열리며, 학생 화면에 알약 단추가 활성화됩니다. |
| **학생 슬라이드 보기** | 학생이 인터랙티브 요소를 조작한 결과, 장 위에 붙인 글상자(최대 10개), 판서 층을 교사가 학생별 축소판으로 모아 확인합니다. |
| **결과를 장으로 넣기** | 수집된 의견이나 학생 슬라이드 조작 결과를 일반 슬라이드로 변환하여 질문 장 바로 뒤에 삽입합니다. 이후 덱 저장, PDF/HTML 내보내기 시 그대로 반영됩니다. |

---

## Part 1. 아키텍처 및 통신 원리

### 1.1 내용 전송과 진행 신호의 분리 (A 방식, D15)
- **슬라이드 내용 (Firebase Storage)**: 함께 보기를 열 때 덱 전체를 단일 난독화 JSON 파일로 업로드하고, 학생은 입장 시 1회 다운로드하여 메모리에 캐시합니다.
- **진행 신호 (RTDB asia-southeast1 `motionslide-live`)**: 현재 장(`slideId`), 단계(`step`), 버전(`deckV`) 등 약 100바이트의 초경량 상태만 `live/{code}/state`에 덮어씁니다(D24).
- **효과**: 네트워크 대역폭 및 Firestore 읽기 비용을 극적으로 절감하며, 학생 기기는 네트워크 지연 없이 0.1~0.3초 내에 즉각 로컬 렌더링됩니다.

### 1.2 무로그인 학생 구분과 제출 열쇠 (A7, 4.1)
- 학생은 Firebase 로그인을 거치지 않고 익명 세션으로 참여합니다.
- **구분자 (`key`)**: 빠른 입장은 Firestore에서 자동 발급받은 `nick`, 학번 인증은 학번 `sid`.
- **덮어쓰기 방지 (제출 열쇠, `token`)**: 첫 제출 시 학생 기기가 암호학적 난수(24자 이상) `token`을 생성하여 RTDB 답안과 로컬스토리지에 함께 저장합니다. 수정 제출 시 기존 `token`과 일치해야만 RTDB 보안 규칙이 쓰기를 승인합니다. 다른 학생이 임의로 타인의 답안을 덮어쓰거나 변조할 수 없습니다.

### 1.3 동영상 및 대용량 미디어 분리 (D9)
- 동영상(`data:` URL)은 덱 본문에서 분리하여 `live_slides/{uid}/{code}/media/{해시}.mp4`로 별도 업로드합니다.
- **[실시간 페이지]**: 수업 중 네트워크 부하 및 소리 중첩을 방지하기 위해 자리표시자("🎬 선생님 화면을 보세요")로 대체합니다.
- **[전체 보기]**: 학생이 복습 중 ▶ 재생 단추를 누를 때만 해당 미디어를 온디맨드로 스트리밍/다운로드합니다.

### 1.4 미리보기 방지 걸림돌 (D15-1, 5.2-1)
- **DOM 격리**: 다운로드된 덱 전체는 JS 클로저 메모리에만 유지되며, 브라우저 DOM(`innerHTML`)에는 오직 현재 활성화된 장 1개만 주입됩니다.
- **XOR 난독화**: Storage 덱 파일은 방 코드를 기반으로 생성된 키를 이용해 XOR 변환 후 Base64로 패킹되어 저장됩니다. 네트워크 탭 분석을 통한 단순 열람을 차단합니다.

---

## Part 2. 학생과 함께 보기 (실시간 화면 공유)

### 2.1 교사 흐름 ([함께 보기 ▾] 드롭다운)
- 발표자 모드(`.pv-bar`)에 승인 교사 및 관리자에게만 메뉴 노출.
- **함께 보기가 없을 때**: [실시간 시작…] 클릭 → 이름 입력(기본값: 제목 + 날짜), 입장 방식(빠른 입장 / 학번 인증) 선택 → Storage 덱 업로드 → RTDB 방 개설 → QR 코드 표시.
- **함께 보기가 열려 있을 때**: 방 코드 표시, [⏸ 학생 화면 멈추기 (S)], [QR 다시 보기]. 모드 전환 및 취소는 실수를 방지하기 위해 [Storage 관리]에서만 수행(D26).
- **덱 1개당 함께 보기 1개(D32)**: 동일한 덱으로 여러 반 수업 진행 시 동일 코드를 유지하거나, 필요 시 Storage 관리에서 취소 후 재생성합니다.

### 2.2 학생 흐름
- 메인 화면(`motionslide.html`), 모바일 차단 화면, 웰컴 화면의 [함께 보기] 단추 또는 QR 촬영(`?room={code}#/live`)으로 접속.
- 입장 모달(`renderRoomEntrance`)에서 닉네임 자동 선점 또는 학번/PIN 검증 후 학생 전용 뷰어(`#live-view`)로 전환.
- 덱 다운로드 완료 후 교사의 진행 신호에 맞추어 캔버스가 자동 동기화됩니다.

### 2.3 학생 화면 일시정지 (D28, 6.12)
- 교사 단축키 `S`(또는 버튼) 입력 시 `live/{code}/paused = true` 전송.
- 학생 화면 전체에 반투명 덮개(`rgba(17,24,39,0.92)`)와 "👀 선생님을 봐 주세요" 문구가 오버레이되어 터치 및 클릭을 완전 차단합니다.
- 실시간 페이지 모드에서만 동작하며, 교사가 발표 모드를 종료하거나 접속이 끊어지면 `onDisconnect`를 통해 자동 해제됩니다.

### 2.4 수업 중 수정본 자동 반영 (D27)
- 수업 도중 슬라이드 내용을 수정한 뒤 다시 발표자 모드로 진입(`Show.enter()`)하면, 기존 방에 자동으로 재연결(`Live.attach()`)되며 변경된 덱 해시를 감지하여 Storage 덱 파일을 즉시 덮어씁니다.
- 학생 기기는 `deckV` 변경 신호를 수신하여 백그라운드에서 새 덱을 받아 즉시 리렌더링하므로, 재입장할 필요가 없습니다.

### 2.5 Firebase Storage 관리 (D19, D29, D33)
- 메인 및 메뉴의 [Storage 관리] 모달(`CloudUI`)에서 두 가지 작업을 통합 관리합니다:
  1. **저장된 슬라이드**: 승인 교사는 본인 폴더(`motion_slides/{uid}/`)의 덱을 저장/불러오기/삭제. 관리자는 전체 교사의 덱을 조회.
  2. **열린 함께 보기**: 열려 있는 방 목록 확인, [실시간 페이지 ↔ 전체 보기] 모드 전환, [함께 보기 취소].
- **관리자 필터(D33)**: 학교별 / 교사별 셀렉트 필터를 통해 방대한 목록을 즉시 필터링하여 관리 가능.

---

## Part 3. 발표 리모컨 (1화면 교실 모바일 진행)

### 3.1 사용 흐름 (D34~D37, 6.13)
1. PC 편집 화면 [발표 시작 ▾] → **[휴대폰으로 진행]** 클릭.
2. PC 화면은 슬라이드 청중 뷰가 전체화면으로 실행되고, 좌측 하단에 연결 QR 코드가 오버레이됩니다.
3. 교사가 스마트폰으로 QR을 스캔하거나 모바일 브라우저에서 `#/remote`로 접속(PC와 동일한 교사 계정 로그인 필요).
4. 연결 성공 시 PC 화면의 안내 카드가 사라지고 모바일 리모컨 인터페이스가 활성화됩니다.

### 3.2 리모컨 UI 및 조작 기능
- **상태 및 네비게이션**: 상단에 연결 상태, 현재 장/전체 장 수, 현재 장 제목, 다음 장 소제목 미리보기.
- **클릭 요소 진행 배지**: 장 내에 클릭으로 나타나는 요소가 있을 경우 `👆 클릭 요소 n번 남음 (k/total)` 배지 표시.
- **발표 시나리오 (Presenter Notes)**: 발표 대본을 읽기 쉽게 스크롤 지원하며 글자 크기 조정(`가-`, `가+`) 지원.
- **모든 장 보기**: 썸네일 그리드를 열어 원하는 장으로 직접 점프 이동.
- **원격 제어 단추**: `[◀ 이전]` / `[👆 요소 보이기 / 다음 장 ▶]`, `[⏸ 학생 화면 멈추기]`.
- **블루투스 리모컨 지원**: 모바일에 페어링된 블루투스 프리젠터의 방향키 및 PageUp/PageDown 키 입력 대응, 화면 꺼짐 방지(Wake Lock), 터치 진동 피드백.

### 3.3 리모컨 통신 프로토콜 (`remote/{uid}`)
```json
RTDB remote/{uid}/
  session: { "sid": "...", "pcOnline": true, "deckV": "...", "total": 20 }
  state:   { "index": 3, "step": 1, "maxStep": 2, "cid": "c_123" }
  cmd:     { "sid": "...", "cid": "c_124", "type": "next", "from": { "i": 3, "s": 1 } }
  live:    { "code": "AB3K", "mode": "live", "paused": false, "count": 27 }
```
- PC는 수신된 명령(`cmd`)의 `from` 좌표가 현재 PC의 좌표와 일치할 때만 실행하여, 네트워크 지연에 따른 중복 넘김을 완벽히 방지합니다.

---

## Part 4. 수업 활동 (의견 모으기 & 학생 슬라이드 보기)

### 4.1 활동 개요 및 생명주기 (A16)
- 교사는 슬라이드 편집기에서 원하는 장에 질문(`slide.ask`)을 지정합니다.
- **자동 열림/닫힘**: 발표 중 교사가 해당 장에 도달하면 RTDB `live/{code}/asks/{askId} = 'open'`으로 자동 전환되며, 다른 장으로 넘어가면 `'closed'`로 잠깁니다.
- **학생 화면 알약 단추**: 평상시에는 캔버스를 가리지 않도록 우측 상단/하단에 이동 가능한 알약 단추(예: `❓ 객관식`, `✏️ 내 슬라이드 활동`)로 대기하다가, 교사가 해당 장에 진입하여 열리면 활성화되어 클릭 시 입력 창 또는 활동 막대가 전개됩니다.

### 4.2 질문 유형 (A3, A4, 5.1)
1. **객관식 (`choice`)**: 최대 10개 보기, 단일/복수 선택, 이유 작성(없음/선택/필수).
2. **장문형 (`long`)**: 텍스트 답변(최대 2000자) + **[📷 학생 사진 촬영/첨부]**(긴 변 1280px 이하 압축, Base64 JPEG data URL).
3. **학생 슬라이드 (`slide`)**: 인터랙티브 조작 결과 + 글상자 + 판서 종합 제출.

### 4.3 학생 슬라이드 활동 막대 및 조작 도구 (A5, A15, 6.2)
- 학생 슬라이드 질문이 열리면 슬라이드 상단에 드래그 가능한 **장 위 활동 막대** 표시:
  - `[🔤 글상자]`: 클릭 시 장 중앙에 글상자 삽입 (최대 10개, 개당 200자). 굵게, 기울임, 밑줄, 크기(20~120px), 정렬, 8가지 색상 팔레트 지원. 슬라이드 1920×1080 상대 좌표로 저장.
  - `[✏️ 판서]`: 슬라이드 위에 투명 캔버스 레이어가 활성화되어 펜(4색), 형광펜, 지우개, 되돌리기로 필기 수행.
  - `[인터랙티브 조작]`: 슬라이더, 드래그 포인트 등을 자유롭게 조작.
  - `[제출]`: 인터랙티브 사본 + 글상자 목록 + 판서 이미지를 패키징하여 전송.

### 4.4 인터랙티브 정적 사본 생성 및 보안 (A6, 6.5)
- 학생이 [제출]을 누르면 내부 `appBridge`에 `snapshot` 메시지를 요청하여 현재 시점의 DOM 상태를 추출합니다.
- 스크립트 실행 태그(`<script>`, `onclick`, 동적 루프)를 완전히 제거하고 캔버스/SVG를 정적 상태로 박제한 HTML 스냅샷(`snap`)을 생성합니다.
- 교사 화면에서 이를 렌더링할 때는 엄격한 `sandbox=""` iframe과 안전한 CSP 헤더를 적용하여 학생 기기 발 스크립트 인젝션 공격을 원천 차단합니다.

### 4.5 교사 결과 보기 대시보드 (5.3, 6.4)
- **객관식**: 보기 번호별 인원수 집계 카드 및 선택 이유 포스트잇 묶음 표시.
- **장문형**: 포스트잇 그리드 뷰 및 대시보드형 콘솔 카드 표 뷰 지원. 사진 클릭 시 고화질 확대 모달.
- **학생 슬라이드 모아보기**: 교사의 원본 슬라이드 위에 각 학생의 인터랙티브 사본 + 글상자 + 판서를 결합하여 30인 축소판 그리드로 실시간 렌더링.
- **공통 제어**: [이름 보이기/숨기기] 토글, 즐겨찾기(★), [답 지우기], [청중 화면에 띄우기].
- **모바일 리모컨 결과 제어 (A21)**: 휴대폰 리모컨의 `[응답 n · 결과]`를 누르면 모바일 화면에 결과 판이 열리며, 학생 답을 검토한 뒤 `[모두 띄우기]`, `[★만 띄우기]`, `[하나 띄우기]`, `[내리기]`로 PC 프로젝터 화면에 안전하게 송출할 수 있습니다.

### 4.6 결과를 장으로 넣기 (A13, 270)
- 결과 창에서 **[장으로 넣기]** 실행 시, 수집된 학생 답변 및 슬라이드 조작 결과가 영구적인 표준 슬라이드 객체로 변환되어 질문 장 바로 뒤에 삽입됩니다.
- 학생 이름은 기본적으로 익명 마스킹 처리되며, 삽입된 결과 슬라이드는 발표, 덱 저장, HTML/PDF 내보내기에 완전하게 포함됩니다.

---

## Part 5. 데이터 구조 및 통신 명세

### 5.1 Firestore
```
motionslide_live_records/{code}/
  roomMode: 'quick' | 'auth'
  createdBy, creatorName, creatorSchool, createdAt, memo
  nicknames/{nick}     // 닉네임 선점 마커 (빈 문서)
  students/{nick}      // 학번 인증 시 학번 및 학생 정보
  guests/{nick}        // 공용 기기 게스트 승인 대기 문서
```

### 5.2 Firebase Storage
```
live_slides/{uid}/{code}/{safeName}.json       // 난독화된 학생용 전체 덱 (A 방식)
live_slides/{uid}/{code}/media/{hash}.mp4      // 분리된 동영상 미디어 (전체 보기 전용)
motion_slides/{uid}/{safeName}.html           // 교사 개인 보관 슬라이드 (HTML)
motion_remote/{uid}/deck.json                  // 리모컨용 덱 (대본 포함, 교사 전용)
```

### 5.3 RTDB (전용 인스턴스: `motionslide-live`)
```
live/{code}/
  createdBy, creatorName, creatorSchool, createdAt, name, deckId, deckTitle
  file: "live_slides/{uid}/{code}/{name}.json"
  status: "live"
  mode: "live" | "browse"
  presenting: boolean
  paused: boolean
  state: { slideId, index, total, step, deckV, at }
  asks/{askId}: "open" | "closed"

live_index/{code}/
  { createdBy, creatorName, creatorSchool, name, deckId, deckTitle, mode, entry, createdAt }

live_answers/{code}/{askId}/{key}/             // key: 닉네임 또는 학번
  token: "무작위 24자 이상 토큰"
  nick: "청록 돌고래"
  sid: "30105" (학번 인증 시)
  choice: [0, 2]                               // 객관식 선택 인덱스 배열
  reason: "포물선의 최고점이 양수이기 때문"         // 객관식 이유
  text: "서술형 답안 텍스트..."                   // 장문형 본문
  photo: "data:image/jpeg;base64,..."          // 장문형 첨부 사진 (40만 자 이하)
  notes: "[{x, y, w, t, s, c, b, i, u, a}]"    // 글상자 배열 JSON (4000자 이하)
  snap: "{\"frames\":[...]}"                   // 인터랙티브 정적 스냅샷 JSON (150만 자 이하)
  pen: "data:image/png;base64,..."             // 판서 투명 PNG (30만 자 이하)
  at: ServerTimestamp

remote/{uid}/
  session: { sid, pcOnline, startedAt, deckV, deckId, deckTitle, total }
  state:   { index, step, maxStep, total, slideId, cid, at }
  cmd:     { sid, cid, type, from: {i, s}, index, on, at }
  live:    { code, mode, paused, count, qr }
  phones/{deviceId}: { at }
```

---

## Part 6. 보안 규칙 (Security Rules)

### 6.1 Firebase Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isAdmin() {
      return request.auth != null && request.auth.uid == '<ADMIN_UID>';
    }
    function isApprovedTeacher() {
      return firestore.get(/databases/(default)/documents/teachers/$(request.auth.uid)).data.status == 'approved';
    }
    function isOwnerTeacher(uid) {
      return request.auth != null && request.auth.uid == uid && isApprovedTeacher();
    }

    // 1. 개인 저장 슬라이드
    match /motion_slides/{uid}/{file} {
      allow get, delete: if isAdmin() || isOwnerTeacher(uid);
      allow create, update: if (isAdmin() || isOwnerTeacher(uid))
                            && file.matches('^.+\\.html$')
                            && request.resource.size < 50 * 1024 * 1024
                            && request.resource.contentType.matches('text/html.*');
    }
    match /motion_slides/{uid}/{rest=**} { allow list: if isAdmin() || isOwnerTeacher(uid); }
    match /motion_slides/{rest=**}       { allow list: if isAdmin(); }

    // 2. 함께 보기 덱 및 미디어
    match /live_slides/{uid}/{rest=**} {
      allow get: if true; // 학생 무로그인 다운로드 허용
      allow list, delete: if isAdmin() || isOwnerTeacher(uid);
      allow create, update: if (isAdmin() || isOwnerTeacher(uid))
                            && request.resource.size < 100 * 1024 * 1024
                            && request.resource.contentType.matches('(application/json|video/).*');
    }

    // 3. 발표 리모컨 덱
    match /motion_remote/{uid}/{file} {
      allow get, delete: if isAdmin() || isOwnerTeacher(uid);
      allow create, update: if (isAdmin() || isOwnerTeacher(uid))
                            && request.resource.size < 30 * 1024 * 1024
                            && request.resource.contentType.matches('application/json.*');
    }
    match /motion_remote/{uid}/{rest=**} { allow list: if isAdmin() || isOwnerTeacher(uid); }
  }
}
```

### 6.2 Realtime Database Rules (`motionslide-live`)
```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "teacher_uids": {
      ".read": "auth != null && auth.uid === '<ADMIN_UID>'",
      ".write": "auth != null && auth.uid === '<ADMIN_UID>'",
      "$uid": { ".validate": "newData.isBoolean()" }
    },
    "live_index": {
      ".indexOn": ["createdBy"],
      ".read": "auth != null && (auth.uid === '<ADMIN_UID>' || (root.child('teacher_uids').child(auth.uid).val() === true && query.orderByChild === 'createdBy' && query.equalTo === auth.uid))",
      "$code": {
        ".read": "auth != null && (auth.uid === '<ADMIN_UID>' || data.child('createdBy').val() === auth.uid)",
        ".write": "auth != null && (auth.uid === '<ADMIN_UID>' || (root.child('teacher_uids').child(auth.uid).val() === true && (data.exists() ? data.child('createdBy').val() === auth.uid : newData.child('createdBy').val() === auth.uid)))"
      }
    },
    "live": {
      "$code": {
        ".read": "auth != null && (auth.uid === '<ADMIN_UID>' || data.child('createdBy').val() === auth.uid)",
        ".write": "auth != null && (auth.uid === '<ADMIN_UID>' || (root.child('teacher_uids').child(auth.uid).val() === true && (data.exists() ? data.child('createdBy').val() === auth.uid : newData.child('createdBy').val() === auth.uid)))",
        "status":     { ".read": true },
        "name":       { ".read": true },
        "file":       { ".read": true },
        "mode":       { ".read": true },
        "presenting": { ".read": true },
        "paused":     { ".read": true },
        "state":      { ".read": true },
        "asks": {
          ".read": true,
          "$askId": { ".validate": "newData.val() === 'open' || newData.val() === 'closed'" }
        }
      }
    },
    "live_answers": {
      "$code": {
        ".read": "auth != null && (auth.uid === '<ADMIN_UID>' || root.child('live').child($code).child('createdBy').val() === auth.uid)",
        ".write": "auth != null && (auth.uid === '<ADMIN_UID>' || root.child('live').child($code).child('createdBy').val() === auth.uid)",
        "$askId": {
          "$key": {
            ".write": "root.child('live').child($code).child('asks').child($askId).val() === 'open' && newData.exists() && (!data.exists() || data.child('token').val() === newData.child('token').val())",
            ".validate": "newData.hasChildren(['token', 'nick', 'at']) && $key.length <= 30 && (newData.child('nick').val() === $key || newData.child('sid').val() === $key)",
            "token":  { ".validate": "newData.isString() && newData.val().length >= 24 && newData.val().length <= 64" },
            "nick":   { ".validate": "newData.isString() && newData.val().length <= 30" },
            "sid":    { ".validate": "newData.isString() && newData.val().length <= 10" },
            "choice": { ".validate": "newData.hasChildren()", "$i": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() < 10" } },
            "reason": { ".validate": "newData.isString() && newData.val().length <= 500" },
            "text":   { ".validate": "newData.isString() && newData.val().length <= 2000" },
            "photo":  { ".validate": "newData.isString() && newData.val().beginsWith('data:image/jpeg;base64,') && newData.val().length <= 400000" },
            "notes":  { ".validate": "newData.isString() && newData.val().length <= 4000" },
            "snap":   { ".validate": "newData.isString() && newData.val().length <= 1500000" },
            "pen":    { ".validate": "newData.isString() && newData.val().beginsWith('data:image/png;base64,') && newData.val().length <= 300000" },
            "at":     { ".validate": "newData.val() === now" },
            "$other": { ".validate": false }
          }
        }
      }
    },
    "remote": {
      "$uid": {
        ".read":  "auth != null && (auth.uid === '<ADMIN_UID>' || (auth.uid === $uid && root.child('teacher_uids').child(auth.uid).val() === true))",
        ".write": "auth != null && (auth.uid === '<ADMIN_UID>' || (auth.uid === $uid && root.child('teacher_uids').child(auth.uid).val() === true))"
      }
    }
  }
}
```

---

## Part 7. 리소스 사용량 및 비용 계산

### 7.1 수업 1회 기준 사용량 (학생 30명, 20장 슬라이드, 활동 5회)
| 구분 | 전송/조작 내용 | 예상 트래픽/사용량 |
|---|---|---|
| **Storage (학생 덱)** | 6MB × 30명 1회 수신 | 약 180MB |
| **Storage (수정본 재전송)** | 수업 중 1회 수정 시 | 약 +180MB |
| **RTDB (진행 신호)** | 장 넘김 100회 × 30명 × 0.5KB | 약 1.5MB |
| **RTDB (수업 활동 답변)** | 30명 × 5문항 (글상자/사본/판서 포함) | 약 3~10MB |
| **Firestore** | 입장 및 닉네임 확인 30명 | 수백 건 (일일 무료 5만 건 대비 0.5% 미만) |

- **월간 추산 (교사 1인, 월 100회 수업 기준)**: Storage 다운로드 약 18GB~36GB로 미국 버킷 무료 한도(월 100GB) 이내 충족. RTDB 월간 수백 MB 수준으로 무료 한도(월 10GB) 대비 극히 미미함.

---

## Part 8. 방 및 데이터 정리 정책

1. **발표자 모드 이탈 시 (`Show.exit`)**:
   - 방 및 덱 데이터 유지. RTDB의 `presenting = false`, `paused = false`만 업데이트.
2. **함께 보기 취소 시 ([Storage 관리] → [함께 보기 취소])**:
   - **삭제 순서 준수**:
     1. RTDB 학생 답안 `live_answers/{code}` 선제 삭제 (방 소유권 검증 유지 목적)
     2. RTDB 방 노드 `live/{code}` 및 색인 `live_index/{code}` 삭제
     3. Storage 파일 `live_slides/{uid}/{code}/` 폴더 전체 삭제
     4. Firestore 방 문서 및 서브컬렉션 정리 (`purgeRoomParts`)
   - 확인 다이얼로그에서 미저장 활동 결과가 있을 경우 **[장으로 넣고 닫기] / [그냥 닫기]** 선택 유도.
3. **교사 계정 삭제 및 탈퇴 시 (`teacher-cleanup.js`)**:
   - `live_slides/{uid}/`, `motion_slides/{uid}/`, `motion_remote/{uid}/` 및 RTDB `remote/{uid}` 자동 완전 삭제.

---

## Part 9. 코드 재사용 및 파일 구조 지도

| 대상 모듈 | 파일 경로 / 구현체 | 주요 역할 |
|---|---|---|
| **CloudUI** | `motionslide.html` | Firebase Storage 관리 모달 UI (슬라이드 목록, 함께 보기 목록, 필터) |
| **SlideCloud** | `motionslide.html` | Storage API 추상화 (`save`, `load`, `list`, `remove`) |
| **LIVE / Live** | `motionslide.html` | 교사용 실시간 함께 보기 관리자 (방 생성, 이어붙이기, 진행 신호 동기화, 일시정지, 질문 개폐) |
| **LiveDeck** | `motionslide.html` | 학생용 배포 덱 패키징 (미디어 분리, notes 제거, XOR 난독화 인코딩) |
| **LiveView** | `motionslide.html` | 학생용 뷰어 컨트롤러 (실시간 동기화, 일시정지 오버레이, 답변 제출, 활동 막대, 판서 캔버스) |
| **REMOTE / Remote** | `motionslide.html` | 발표 리모컨 PC 측 호스트 (원격 명령 수신, 진행 상태 푸시, 활동 결과 송출) |
| **RemoteView** | `motionslide.html` | 발표 리모컨 모바일 클라이언트 UI (`#/remote`) |
| **AskEditor** | `motionslide.html` | 편집기 내 질문 작성/수정 모달 |
| **AskResult** | `motionslide.html` | 교사용 활동 결과 대시보드 창 (포스트잇, 표, 축소판, 장으로 넣기) |

---

## Part 10. 구현 및 검증 체크리스트

### 10.1 Firebase 콘솔 및 인프라
- [x] RTDB 인스턴스 `motionslide-live` 생성 및 `firebase-config.js` 연동
- [x] `account_manager.html` 권한 동기화 목록에 `motionslide-live` 추가
- [ ] RTDB 보안 규칙(Part 6.2) 및 Storage 규칙(Part 6.1) 최종 배포
- [ ] Firebase Storage 버킷 위치(미국 리전 권장) 및 CORS 정책 검증

### 10.2 기능 동작 검증
- [x] 승인 교사 및 관리자 권한에 따른 [함께 보기 ▾], [Storage 관리], [질문 붙이기] 노출 제어
- [x] 실시간 진행 신호 동기화 및 단축키 `S`를 통한 학생 화면 멈추기 오버레이
- [x] 발표 리모컨(`#/remote`)을 통한 무선 슬라이드 제어 및 클릭 요소 배지 표시
- [x] 질문 장 도달 시 질문 자동 활성화 및 타 장 이동 시 자동 잠금
- [x] 장문형 답변 사진 첨부(압축 JPEG) 및 학생 슬라이드 활동(글상자 + 인터랙티브 사본 + 판서) 제출
- [x] 제출 열쇠(`token`)를 통한 타 학생 답안 위변조 차단 검증
- [x] 활동 결과 대시보드 열람 및 [장으로 넣기]를 통한 일반 슬라이드 변환
- [x] 모바일 리모컨 결과 판에서 PC 청중 화면으로의 선택적 결과 송출(A21)
- [x] [함께 보기 취소] 시 `live_answers` 선제 삭제 및 Storage/Firestore 클린업

---

## 부록 A. 의사결정 기록 (Decisions)

### A.1 함께 보기 & 발표 리모컨 (D1 ~ D37)
- **D2**: 진행 신호는 Firestore 읽기 제한(일 5만 건) 절약을 위해 RTDB asia-southeast1 전용 인스턴스를 사용함.
- **D3**: 덱 파일은 수업 후 [전체 보기] 복습 및 늦은 입장을 지원하기 위해 방 취소 전까지 보존함.
- **D5**: 발표자 모드를 종료해도 열린 방은 유지되며, 공식 종료는 [Storage 관리]에서만 수행함.
- **D7**: 시간 기준 자동 만료는 두지 않고 교사 명시적 취소로 관리함.
- **D8**: 학생 입장은 카메라 QR 스캔(`?room={code}#/live`)과 4자리 코드 직접 입력을 모두 지원함.
- **D9**: 동영상은 실시간 모드에서 자리표시자로 두고, 전체 보기에서만 개별 스트리밍 재생함.
- **D10**: 학생 화면의 인터랙티브 요소는 미러링 대신 로컬 기기에서 독립적으로 조작함.
- **D11**: 승인된 교사 모두 사용 가능하며, 교사는 본인 데이터만, 관리자는 전체를 관리함.
- **D12**: 학생 전용 진입점은 `motionslide.html` 메인의 [함께 보기] 및 모바일 차단 화면에 배치함.
- **D14**: 방 생성 시 [빠른 입장](자동 닉네임)과 [학번 인증](학번+PIN) 중 선택함.
- **D15/D15-1**: 덱 전체 1회 전송(A 방식)을 채택하고, 뒤쪽 장 사전 열람 방지를 위해 DOM 단일 장 격리 및 XOR 난독화를 적용함.
- **D18**: [실시간 페이지]와 [전체 보기] 간 전환은 교사만 [Storage 관리]에서 결정함.
- **D19**: 별도 대시보드 없이 기존 Storage 불러오기 모달을 [Firebase Storage 관리]로 확장 통합함.
- **D20**: 방 생성 시 고유 이름을 부여하며 파일 경로는 `live_slides/{uid}/{code}/{name}.json`을 따름.
- **D24**: 진행 신호는 누적 로그 없이 현재 상태 1개 노드(`live/{code}/state`)만 덮어씀.
- **D25**: 교사의 레이저 포인터/하이라이트는 학생 기기로 동기화하지 않고 프로젝터 화면에만 표시함.
- **D26**: 발표자 모드 드롭다운에는 [실시간 시작], [일시정지], [QR 보기]만 배치하여 조작 실수를 예방함.
- **D27**: 덱 수정 후 발표자 재진입 시 기존 코드와 방에 자동 동기화되어 수정본이 배포됨.
- **D28**: 발표자 일시정지 단축키 `S` 도입, 학생 화면에 전체 가림막 및 설명 집중 안내문 표시.
- **D29/D30**: 슬라이드 영구 저장을 승인 교사에게 개방하고 `motion_slides/{uid}/` 경로로 규격화함.
- **D31**: 진행 신호 전용 RTDB 인스턴스(`motionslide-live`) 분리 운영.
- **D32**: 덱 1개당 함께 보기 방 1개 원칙 적용.
- **D33**: [Storage 관리] 모달에 관리자 전용 학교/교사 필터 추가.
- **D34~D37**: 화면 1개 교실을 위한 모바일 웹 발표 리모컨 구현. 교사 계정 기반 무인증 자동 페어링(`remote/{uid}`).

### A.2 수업 활동 (A1 ~ A21)
- **A1**: 학생 상호 간에는 답안을 열람할 수 없으며 오직 교사만 확인함.
- **A2**: 가볍고 빈도가 높은 '의견 모으기'를 선행 구축하고 그 위에 학생 슬라이드 보기를 확장함.
- **A3/A17/A18**: 질문 유형은 객관식, 장문형, 학생 슬라이드로 한정(단답형 제외, 객관식 정답 미지정).
- **A4**: 장문형 답변 시 학생이 직접 촬영/첨부한 압축 사진 1장을 허용함.
- **A5**: 모바일 기기에서도 글상자, 인터랙티브 조작, 판서, 제출이 완벽히 지원됨.
- **A6/6.5**: 학생 제출 사본은 스크립트가 배제된 정적 HTML로 변환 후 샌드박스 처리함.
- **A7/4.1**: 학생 로그인을 요구하지 않으며, 무작위 발급된 제출 열쇠(`token`)로 답안 위변조를 방지함.
- **A8**: 청중 화면으로 결과 송출 시 학생 식별 정보(이름, 학번)는 기본 숨김 처리됨.
- **A9/4.3**: 방 종료 시 학생 답안은 영구 삭제되며, 보존이 필요한 결과는 [장으로 넣기]를 통해 슬라이드로 영구화함.
- **A10**: 무거운 학생용 개체 편집기 대신 가벼운 글상자(10개) 및 투명 판서 레이어로 구현함.
- **A11**: 슬라이드 전체를 이미지로 캡처하지 않고, 원래 장 위에 학생 변동분(사본, 글상자, 판서)을 교사 브라우저에서 재합성함.
- **A12**: 실시간 조작 스트리밍이 아닌 최종 [제출] 시점의 스냅샷만 수신함.
- **A13**: [결과를 장으로 넣기]를 통해 결과물을 표준 슬라이드로 변환 삽입함.
- **A14**: 객관식 결과는 막대그래프 대신 보기별 인원수 및 이유 포스트잇 카드군으로 시각화함.
- **A15/A16**: 교사가 해당 장에 머무는 동안에만 질문이 열리고 학생 입력 도구가 활성화됨.
- **A19**: 전체 보기(복습) 모드에서는 질문 응답이 비활성화됨.
- **A20**: 결과 창의 대시보드 표 보기는 외부 라이브러리 없이 콘솔 카드 스타일로 렌더링함.
- **A21**: 모바일 리모컨 진행 시 스마트폰에서 결과를 선별 검토한 뒤 PC 화면에 선택적으로 송출함.

---

## 부록 B. 변경 이력 (Changelog)

- **2026-11-15**: 함께 보기 1차 아키텍처 수립 (D1~D25, A 방식 전송, RTDB 진행 신호, Storage 덱 분리).
- **2026-11-16**: 일시정지(S), Storage 관리자 필터(D33), 승인 교사 클라우드 저장(D29) 및 1단계 구현 완료.
- **2026-11-17**: 1화면 교실을 위한 모바일 발표 리모컨(D34~D37) 설계 및 구현 완료.
- **2026-11-21**: 수업 활동(의견 모으기 & 학생 슬라이드) 아키텍처 정립 (A1~A20, 무로그인 제출 열쇠, 장으로 넣기).
- **2026-11-22**:
  - 학생 슬라이드 종합 활동(글상자 10개, 투명 판서 레이어, 인터랙티브 정적 스냅샷) 구현.
  - 학생 화면 드래그 가능한 알약 단추 및 장 위 활동 막대 도입.
  - 장문형 첨부 사진(압축 Base64 JPEG) 파이프라인 복원.
  - 모바일 발표 리모컨용 활동 결과 검토 판 및 PC 청중 화면 송출 제어(A21) 추가.
  - 질문 결과 모달 내 방향키(`ArrowLeft`, `ArrowRight`) 슬라이드 탐색 및 모바일 토스트 상단 재배치.
  - 글상자 편집 시 서식 툴바 즉시 연동 및 글자 크기 숫자 직접 입력 지원.
  - `motionslide-live-plan.md`와 `motionslide-activity-plan.md`를 단일 통합 설계서(`motionslide-plan.md`)로 최종 병합.
