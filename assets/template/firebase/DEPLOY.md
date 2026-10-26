# 배포 순서 (v4.2)

아래 본문은 v3 → v4.1 최초 전환 절차를 포함하고, 상단의 v4.2 갱신 항목은 현재 코드 배포에 추가로 적용합니다.
코드와 보안 규칙의 권한이 맞아야 학생 관리 삭제가 끝까지 동작합니다.

## v4.2 추가 갱신

- 학생 인증 학번은 `^[1-3]\d{3,4}$`입니다. 길이만 4~5자리로 검사하지 마세요.
- 새 설문·소감문 템플릿은 `assets/template/firebase/설문-소감문-통합형.html`입니다. 응답은 `custom_forms/{방}/responses/{학번}`을 사용해 같은 학생의 재제출을 기존 응답 수정으로 처리합니다.
- 좀비헌터 완료 체크포인트가 있는 플레이는 이후 게임오버에서 `isCompleted: false`로 되돌리지 않습니다.
- 학생 삭제는 학생 문서에 기록된 기기 지문으로 `gate/{기기ID}`를 직접 지정해 배치 삭제하고 `private/auth`도 직접 삭제합니다. Firestore 규칙은 교사에게 담당 학생의 `gate` 문서 delete 및 `private/auth` 문서 delete를 허용해야 합니다. `gate`와 `private/auth`의 read/list는 허용하지 마세요.
- 기존 기기 초기화로 부모 문서에서 지워진 지문에 해당하는 고아 `gate` 문서는 클라이언트 삭제 대상에서 찾을 수 없습니다. 전체 정리가 필요하면 관리자 콘솔 또는 서버 측 정리 작업을 사용하세요. PIN 증명값을 보기 위해 교사 list/read 권한을 추가하지 마세요.
- 통합 설문 템플릿에서 교사 검토를 저장하려면 `custom_forms/{room}/responses/{studentId}`의 `feedback`, `feedbackUpdatedAt`, `teacherView`, `teacherViewUpdatedAt` 필드 갱신을 교사 규칙에 허용하세요.
- Gemini 초안 생성에 쓰는 API 키는 선택적으로 이 기기의 localStorage에 저장됩니다. 학생 답변을 Gemini API로 전송하는 데 동의하는 내용만 입력하세요.
- 우리반 관계지도(`pages/admin/relationmap.html`)는 새 컬렉션 `relation_maps`를 씁니다. 가이드북 13장의 규칙 블록을 Firestore 규칙에 **추가**해야 동작하며, 기존 규칙(특히 `student_auth`의 `gate`)은 바꾸지 않습니다.

공통 모듈 주소는 `room-auth.js?v=4.2`, `game-kit.js?v=4.2`, `dashboard-header.js?v=4.2`로 맞춥니다.
순서가 바뀌면 예전 학생 관리 화면이 새 규칙에 막힙니다.

## 과거 최초 전환 안내 (v3 → v4.1)

아래 절차는 최초 v4.1 전환을 위한 참고 사항입니다. 현재 v4.2의 추가 규칙 권한은 위 항목을 우선 적용하세요.

수업이 없는 날 한 번에 진행하세요. 30분 정도 걸립니다.

---

## 0. 준비

- Firebase 콘솔에서 **Firestore 백업**(내보내기)을 한 번 받아 두세요.
- 학생용 기기 1대(휴대폰)를 준비하세요. 각 단계 뒤 실제로 입장해 봐야 합니다.
- 관리자 uid가 `81v0uN5YhFOFXtxn9xisGh5CTka2` 인지 확인하세요.
  (Firebase 콘솔 → Authentication → Users → 관리자 계정의 사용자 UID)
  다르면 게시된 Firestore/RTDB 규칙과 `pages/admin/account_manager.html`의 관리자 UID를 함께 확인합니다.
  이 저장소에는 규칙 원본 파일이 없으므로 Firebase Console의 현재 규칙을 먼저 백업하세요.
- **선생님 계정마다 학교명이 있는지** 확인하세요. v4.2에서도 학생의 학교가 방을 만든 선생님을 따르므로,
  학교명이 비었거나 `관리자`인 계정은 인증 방을 만들 수 없습니다.

---

## 1. 코드 올리기 (규칙은 아직 그대로)

```
js/room-auth.js
js/game-kit.js
js/dashboard-header.js
js/teacher-auth.js
  (student-crypto.js · qr-modal.js · firebase-config.js 는 바꾸지 않았습니다)

pages/admin/student_manager.html
pages/admin/formbuilder.html
pages/admin/studentsreviewsystem.html

pages/middleschool/**/plus_minus.html
pages/middleschool/**/multiply_divide.html
pages/middleschool/**/zombiehunter.html
pages/middleschool/**/relativefrequency.html
pages/middleschool/**/gridgomoku.html
pages/middleschool/**/blottogame.html
pages/middleschool/**/sentimentanalysis.html

assets/template/firebase/유형A-개인기록형.html · 유형B-빠른입장형.html · 유형C-실시간대전형.html · 유형D-익명대전형.html
assets/template/firebase/설문-소감문-통합형.html
가이드북.md · DEPLOY.md · PATCHES.md
```

**js 파일과 게임 페이지는 함께 배포**하세요. 모듈 주소를 `?v=4.2`로 통일하고 일부만 올려
한 페이지에서 서로 다른 모듈 버전이 섞이지 않게 합니다.

**확인:** 아무 게임이나 빠른 입장 방을 만들어 학생 기기로 들어가 봅니다.

---

## 2. Firestore 규칙 게시

Firebase Console → Firestore Database → [규칙]에서 현재 규칙을 먼저 백업한 뒤 변경합니다.
이 저장소에는 `rules/firestore-규칙.txt`가 없으므로 예전 규칙 파일을 찾아 붙여넣지 마세요.
기존 `student_auth` 및 `custom_forms` 규칙을 보존하면서 v4.2 권한만 추가해야 합니다.

게시 전에 [규칙] 탭의 **플레이그라운드**로 두 가지만 확인해 보세요.

| 시험 | 기대 |
|---|---|
| 선생님 uid로 다른 학교 `student_auth` 목록 조회 | 거부 |
| 로그인 없이 `student_auth/{학교_학번}` 한 개 읽기 | 허용 |
| 담당 교사가 등록된 기기 경로의 `gate` 문서 삭제 | 허용 |
| 담당 교사가 학생의 `private/auth` 문서 삭제 | 허용 |
| 교사가 `private/auth`의 PIN 해시 읽기 | 거부 |
| 교사가 설문 응답의 `feedback`·`teacherView` 필드 갱신 | 허용 |

**RTDB 규칙 4개(가위바위보·오목·블로토·감성 분석)는 바꾸지 않습니다.**
기존 RTDB 경로를 그대로 사용하는 경우 규칙은 바꾸지 않아도 됩니다. 변경한 RTDB 경로가 있다면 해당 인스턴스 규칙을 별도로 확인하세요.

---

## 3. 새로고침 안내

선생님들께 게임 대시보드와 학생 관리를 **강력 새로고침**(Ctrl+Shift+R)하도록 안내하세요.
`teacher-auth.js` 는 주소에 버전 표기가 없어 예전 파일이 남아 있을 수 있습니다.

---

## 4. 학생 기기로 확인

| 확인 항목 | 기대 결과 |
|---|---|
| 빠른 입장 방 | 방 코드만으로 즉시 시작 (게스트 체크와 무관) |
| 새 방 만들기 & 메모 | 메모 입력(선택) 후 드롭다운에 `[코드] \| [메모]` 로 표시 |
| 인증 방 만들기 (학교명 없는 계정) | 막히고 정보수정 안내 |
| 인증 방 첫 입장 | `1~3`으로 시작하는 학번(4~5자리)·PIN만 입력, 학교·선생님은 자동 표시 |
| 인증 방 두 번째 입장 | "내 정보가 맞나요?" 확인만 |
| 등록된 학번에 틀린 PIN | "인증 실패" |
| 게스트 체크 후 인증 방 | 학번·PIN 입력 → 선생님 승인 대기 → 승인 시 입장 |
| 대시보드 [PIN 초기화] | 내 학교·내 방 학생만 초기화, 다음 입장 때 새 PIN 등록 |
| 학생 관리 | 내 방 학생만 보이고, 학생이 다른 탭으로 가면 [새로고침] 후 '다른화면' |
| 정보수정에서 학교 변경 | 담당 학생이 있으면 막힘 |
| 같은 방에 두 기기 | 서로 다른 닉네임 |

게임 7개를 각각 한 번씩 돌려 보고, F12 콘솔에 `permission-denied` 가 0건인지 확인하세요.
학생 관리에서 "색인이 필요합니다" 오류가 나면 콘솔에 나온 링크를 눌러 색인을 만들면 됩니다.

---

## 5. App Check 적용 상태 점검

`firebase-config.js` 에 reCAPTCHA v3가 이미 들어가 있지만, **콘솔에서 "적용(Enforce)"까지 눌러야** 효과가 있습니다.

- Firebase 콘솔 → App Check → 앱 → Firestore / Realtime Database **각각** 적용 (RTDB는 4개 인스턴스 각각)
- GCP 콘솔 → API 및 서비스 → 사용자 인증 정보 → 웹 API 키에 **HTTP 리퍼러 제한** 추가
- Authentication → Settings → 승인된 도메인을 본인 도메인만으로 좁히기

> App Check는 페이지 밖에서 오는 요청(curl, 외부 스크립트)을 막습니다.
> **학생이 F12로 페이지 안에서 호출하는 것은 막지 못합니다.** 규칙을 대체하지 않습니다.

---

## 6. 뒷정리

- `pages/admin/migrate_v3.html` 이 남아 있다면 삭제
- 예전에 받은 `GUIDE.md` 가 있다면 삭제 (내용은 `가이드북.md` 로 합쳤습니다)
- GCP 콘솔에서 **예산 알림** 확인

---

# 게임별 입장 방식

| 활동 | 유형 | 빠른 입장 | 학생 인증 | 게스트 승인 | PIN 초기화 | 학번 표시 |
|---|---|---|---|---|---|---|
| 정수와 유리수 | A | ✅ | ✅ | ✅ | ✅ | ✅ |
| 곱셈과 나눗셈 | A | ✅ | ✅ | ✅ | ✅ | ✅ |
| 좀비헌터 | A | ✅ | ✅ | ✅ | ✅ | ✅ |
| 가위바위보 | C | ✅ | ✅ | ✅ | ✅ | ✅ (표 + 의견) |
| 텍스트 감성 분석 | B | ✅ | — | — | — | — |
| 좌표평면 오목 | D | ✅ | — | — | — | — |
| 블로토 | D | ✅ | — | — | — | — |

**학생 인증 모드**는 처음 한 번만 **1~3으로 시작하는 학번(4~5자리)과 4자리 PIN**을 입력받습니다. 학교·담당 선생님은
방을 만든 선생님을 따르고, 그 뒤부터는 기기에 저장된 증명값(PIN 아님)으로 조용히 확인만 하고 들어갑니다.
들어온 학생은 선생님의 **학생 관리**에 자동으로 쌓입니다.

**게스트 모드**는 인증 모드 방에서만 동작합니다. 기기에 저장된 정보를 쓰지 않고 학번·PIN을 새로 입력받으며,
이미 접속 중인 학번이면 막고, PIN이 맞아야 하고, 선생님이 승인해야 들어갑니다. 닉네임도 새로 뽑습니다.

**빠른 입장 모드**에서는 게스트 체크박스를 켜든 끄든 결과가 같습니다. 방 코드만으로 바로 시작합니다.

**가위바위보**는 대전을 RTDB에, 인증에 필요한 것(방 모드·학교·이름표·게스트 승인·학번)을 Firestore `rps_records` 에 둡니다.
방을 만들 때 두 DB에 함께 쓰고, 지울 때 두 DB에서 함께 지웁니다.

**오목·블로토**는 학생 정보를 쓰지 않는 유형 D입니다. Firestore는 닉네임 중복 방지 이름표에만 씁니다
(`gomoku_records` / `blotto_records` 아래 `nicknames`, 필드가 없는 빈 문서).
**감성 분석**은 Firestore를 전혀 쓰지 않습니다.

---

# 남아 있는 한계

`가이드북.md` 10장에 정리했습니다. 요약하면 학생에게 로그인이 없어 규칙만으로는
남의 닉네임 기록 덮어쓰기·자기 점수 올리기·4자리 PIN 전수 대입을 완전히 막을 수 없고,
'내 학생'을 이름으로 가르므로 같은 학교의 동명이인 선생님은 서로의 학생이 보입니다.
근본 해결책은 Firebase 익명 인증입니다.
