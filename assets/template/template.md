# 📚 웹앱 & 게임 HTML 템플릿 개발 가이드

이 폴더(`assets/html/`)는 수학동동 프로젝트의 일관된 UI/UX 및 빠른 신규 콘텐츠 개발을 위한 **표준 보일러플레이트 템플릿**을 제공합니다.

---

## 📑 템플릿 목록

| 파일명 | 유형 | 데이터베이스 | 주요 기능 | 대표 예시 |
| :--- | :--- | :--- | :--- | :--- |
| **`basic.html`** | 일반 웹 페이지 | 없음 / 커스텀 | 네비바 + 기본 반응형 카드 레이아웃 | 기본 설명/소개 페이지 |
| **`template-match-game.html`** | 1:1 실시간 대전 게임 | **Firebase RTDB** | 실시간 대기실, 1:1 매칭, 턴 동기화, 모니터링 대시보드 | `gridgomoku.html` (오목), `relativefrequency.html` (가위바위보) |
| **`template-stage-game.html`** | 스테이지/진단형 싱글 게임 | **Firestore** / RTDB | 명예의 전당, 스테이지/체력/콤보, 통계 대시보드, 엑셀 다운로드 | `zombiehunter.html` (좀비헌터), `plus_minus.html` (정수/유리수) |

---

## 1. 🎮 실시간 1:1 대전 템플릿 (`template-match-game.html`)

### 1) 화면 흐름 (SPA 4단계 구조)
```
[1. 랜딩 섹션]  ──(방 코드 & 닉네임 입력)──▶  [2. 대기실 섹션] (스마트 매칭 대기)
     │                                            │
 (교사 비번 인증)                           (상대 입장 시 자동 매칭)
     │                                            ▼
[4. 대시보드 섹션]                         [3. 1:1 대전 게임 섹션] (턴제 플레이)
```

### 2) Firebase RTDB 데이터 구조
```json
{
  "sample_match_rooms": {
    "ROOM_CODE": {
      "settings": { "computerMatchEnabled": false },
      "createdAt": 1700000000000,
      "players": {
        "홍길동": { "nickname": "홍길동", "wins": 2, "losses": 1, "status": "online", "lastHeartbeat": 1700000000000 }
      },
      "waiting": {
        "홍길동": { "nickname": "홍길동", "joinedAt": 1700000000000 }
      },
      "matches": {
        "MATCH_ID": {
          "player1": "홍길동",
          "player2": "김철수",
          "currentTurn": "player1",
          "status": "playing",
          "moves": []
        }
      }
    }
  }
}
```

### 3) 신규 게임 개발 시 필수 수정 항목 (TODO)
1. **RTDB 노드명 변경**: `const DB_ROOT = "새로운_게임_노드명";`
2. **게임 인터페이스 교체**: `<div id="custom-game-board">` 내부를 캔버스(Canvas) 또는 인터랙티브 게임 버튼으로 변경.
3. **게임 플레이 로직 구현**:
   - `executeMove(...)`: 착수/행동 시 `matchRef`의 `moves` 및 `currentTurn` 업데이트
   - `checkWin(...)`: 승패 조건 검증 및 `status: 'finished'`, `winner` 업데이트

---

## 2. 🎯 스테이지/진단형 싱글플레이 템플릿 (`template-stage-game.html`)

### 1) 화면 흐름 (SPA 4단계 구조)
```
[1. 로그인 & 명예의 전당]  ──(입장)──▶  [2. 게임 플레이 섹션] (Stage 1 ~ N)
         │                                       │
     (교사 인증)                          (클리어 or 게임오버)
         │                                       ▼
    [4. 진단 대시보드]                    [3. 최종 결과 화면] (점수/정답률/콤보)
(통계/이력/엑셀다운로드)
```

### 2) Firestore 컬렉션 구조
```
sample_stage_records (컬렉션)
  └── ROOM_CODE (문서)
        ├── students (하위 컬렉션)
        │     └── NICKNAME (문서: 최고점수, 누적 정답률, 최대 스테이지, 플레이 횟수)
        └── records (하위 컬렉션)
              └── AUTO_ID (문서: 플레이별 점수, 정답률, 스테이지, 타임스탬프 상세 로그)
```

### 3) 신규 게임 개발 시 필수 수정 항목 (TODO)
1. **Firestore 컬렉션명 변경**: `const DB_COLLECTION = "새로운_게임_컬렉션명";`
2. **문제 생성 함수 (`generateProblem`)**: 원하는 학습 주제/수학 공식의 난이도별 문제 출제 알고리즘 작성.
3. **채점 함수 (`checkAnswer`)**: 정답 판정, 점수/콤보 가산, 스테이지 승급 규칙 조정.
4. **대시보드 통계 지표 커스텀**: 필요 시 문항별 오답률, 풀이 속도 등의 추가 통계 차트 연동.

---

## 3. 🧩 공통 모듈 및 표준 컴포넌트

모든 템플릿은 유지보수와 토큰 최적화를 위해 아래 공통 컴포넌트를 사용합니다:

* **네비게이션바 (`navbar.js` & `navbar.css`)**:
  ```html
  <link rel="stylesheet" href="../../../css/navbar.css">
  <script src="../../../js/navbar.js"></script>
  ```
* **방 입장 모듈 (`room-auth.js`)**:
  ```javascript
  renderRoomEntrance('room-entrance-container', {
      joinBtnText: "입장하기",
      onJoin: (code, nickname) => { /* 학생 입장 로직 */ },
      onAdminSuccess: () => { /* 교사 대시보드 진입 로직 */ }
  });
  ```
* **대시보드 헤더 자동 생성 (`dashboard-header.js` & `dashboard.css`)**:
  ```html
  <link rel="stylesheet" href="../../../css/dashboard.css">
  <div id="dash-header-placeholder"></div>
  <script src="../../../js/dashboard-header.js" 
          data-title="대시보드 제목" 
          data-export="true" 
          data-select-id="admin-room-select"></script>
  ```
  *(※ `data-export="true"` 설정 시 엑셀 다운로드 버튼 자동 포함)*
