# Firebase RTDB 1:1 실시간 매칭 시스템 설계 가이드

> 두 개의 수업용 웹앱(**가위바위보**, **좌표평면 오목**)에서 실제로 검증된 매칭 로직을 추출·정리한 문서입니다.
> 새로운 1:1 대전 게임을 만들 때 이 문서만 보고 뼈대를 세울 수 있도록 작성했습니다.

- **대상 환경**: Firebase Realtime Database(RTDB) + 순수 JS(모듈) + 서버 코드 없음(클라이언트 전용)
- **사용 상황**: 교실에서 20~35명이 동시에 접속해 자동으로 짝을 지어 대전
- **핵심 난이도**: 서버가 없으므로 *모든 클라이언트가 동시에 같은 판단을 내리려 한다*. 이 경합을 어떻게 막느냐가 설계의 전부다.

---

## 목차

1. [한눈에 보는 전체 흐름](#1-한눈에-보는-전체-흐름)
2. [데이터 모델](#2-데이터-모델)
3. [기반 장치 1 — 서버 시간 동기화](#3-기반-장치-1--서버-시간-동기화)
4. [기반 장치 2 — 하트비트와 접속 상태](#4-기반-장치-2--하트비트와-접속-상태)
5. [기반 장치 3 — onDisconnect 3종 배치](#5-기반-장치-3--ondisconnect-3종-배치)
6. [매칭 알고리즘 6단계](#6-매칭-알고리즘-6단계)
7. [포인터 기반 경기 진입 (트래픽 최적화의 핵심)](#7-포인터-기반-경기-진입-트래픽-최적화의-핵심)
8. [경기 종료와 전적 정산 — 멱등성 설계](#8-경기-종료와-전적-정산--멱등성-설계)
9. [이탈·AFK 처리 3중 방어선](#9-이탈afk-처리-3중-방어선)
10. [중복 접속 처리](#10-중복-접속-처리)
11. [구독 수명주기와 트래픽 관리](#11-구독-수명주기와-트래픽-관리)
12. [두 구현 비교표](#12-두-구현-비교표)
13. [함정 모음 (실제로 밟았던 것들)](#13-함정-모음-실제로-밟았던-것들)
14. [새 게임 만들 때 체크리스트](#14-새-게임-만들-때-체크리스트)
15. [최소 뼈대 코드](#15-최소-뼈대-코드)

---

## 1. 한눈에 보는 전체 흐름

```
[랜딩] --방 코드+닉네임--> [입장 검증] --> [대기실] --매칭 성사--> [경기] --종료--> [대기실]
                               |                  ^                        |
                          중복접속 확인            |                    전적 정산(1회)
                          미완료 경기 복구 --------+                        |
                                                                     경기 데이터 정리
```

두 앱 모두 정확히 같은 골격을 쓴다.

| 단계 | 하는 일 |
|---|---|
| **입장** | 방 존재 확인 → 닉네임 검증 → 중복 접속 판정 → 플레이어 노드 생성/갱신 → 하트비트 시작 |
| **복구** | 새로고침·재접속 시 `currentMatch` 포인터를 보고 진행 중이던 경기로 되돌아감 |
| **대기실** | `waiting/{나}` 등록 → 매칭 시도 루프 → 포인터 감시 |
| **매칭** | 리더 선출 → 상대 고르기 → 잠금 → 재확인 → 원자적 다중 경로 쓰기 |
| **경기** | 트랜잭션으로 착수/선택 → 승패 판정 → 종료 |
| **정산** | 종료 사실을 원자적으로 확정 → 전적을 **정확히 1회만** 반영 |
| **복귀** | 포인터 정리 → 끝난 경기 데이터 삭제 → 대기실 재등록 |

**설계 원칙 3줄 요약**

1. 여러 명이 동시에 실행해도 되는 코드로 짜되, **딱 한 명만 성공하는 관문**(트랜잭션)을 통과시킨다.
2. 상태 변경은 **여러 경로를 한 번의 `update()`로** 묶어 원자적으로 처리한다.
3. 시간 판정은 `Date.now()`가 아니라 **서버 보정 시각**으로 한다.

---

## 2. 데이터 모델

### 2.1 가위바위보

```
rooms/{ROOM_CODE}
├─ status            : 'playing' | 'finished'
├─ createdAt         : number
├─ matchLock         : { by: 닉네임, until: number }   // 매칭 잠금 (TTL 3초)
├─ players/{닉네임}
│   ├─ wins, losses, total : number
│   ├─ forfeits            : number      // 무효 처리 횟수 (승패에 미포함)
│   ├─ status              : 'online' | 'away' | 'offline'
│   ├─ lastHeartbeat       : number(serverTimestamp)
│   └─ currentMatch        : matchId | null   ★ 경기 진입 포인터
├─ waiting/{닉네임}
│   ├─ ts       : number(serverTimestamp)
│   └─ visible  : boolean                ★ 화면을 실제로 보고 있는가
├─ matches/{matchId}
│   ├─ p1, p2              : 닉네임
│   ├─ p1_choice, p2_choice: '' | 'rock' | 'paper' | 'scissors'
│   ├─ status              : 'playing' | 'finished'
│   ├─ endReason           : 'forfeit' | 'abandoned'
│   ├─ leftBy              : 닉네임
│   └─ counted/{닉네임}     : 'win' | 'lose'   ★ 중복 집계 방지 도장
└─ (수업용) drawResult, drawComplete, feedbacks, feedbackLocked
```

### 2.2 좌표평면 오목

```
gomoku_room_index/{ROOM_CODE} : { createdAt }     ★ 방 목록 전용 경량 인덱스

gomoku_rooms/{ROOM_CODE}
├─ createdAt
├─ matchLock : { by, until }
├─ players/{닉네임}
│   ├─ nickname, wins, losses
│   ├─ status, lastHeartbeat, joinedAt
│   ├─ sessionId       : string          ★ 중복 접속 감지용
│   ├─ currentMatchId  : matchId | null  ★ 경기 진입 포인터
│   ├─ currentOpponent : 닉네임 | null    ★ 관리자 화면용(matches 구독 회피)
│   └─ lastOpponent    : 닉네임 | null    ★ 연속 재대결 방지
├─ waiting/{닉네임} : { nickname, joinedAt }
└─ matches/{matchId}
    ├─ player1(흑), player2(백)
    ├─ moves        : [{x,y} | {pass:true}, ...]
    ├─ status       : 'playing' | 'finished'
    ├─ currentTurn  : 'black' | 'white'
    ├─ lastMoveTime : number   ★ 타이머 기준(새로고침으로 초기화 불가)
    ├─ winner, endReason, winLine
    └─ statsApplied : true     ★ 전적 반영 도장
```

### 2.3 설계 포인트

| 필드 | 왜 필요한가 |
|---|---|
| `players/{me}/currentMatch(Id)` | **matches 전체를 구독하지 않기 위한 포인터.** 이게 없으면 모든 학생이 교실 안 모든 대국의 모든 착수를 실시간으로 내려받는다. |
| `waiting/{me}.visible` | 다른 앱을 보고 있는 학생과 매칭되면 상대가 30초를 허공에 기다린다. 화면을 보고 있는 사람끼리만 붙인다. |
| `matchLock` | 기기 시계 오차로 두 명이 동시에 "내가 1번이다"라고 착각하는 경합 차단. |
| `counted/{me}` · `statsApplied` | 리스너가 두 번 울리거나 새로고침해도 전적이 두 번 오르지 않게 하는 도장. |
| `forfeits` (별도 필드) | 자리를 비워 무효가 된 경기를 승/패에 섞으면 **수업의 승률 데이터가 오염된다.** 따로 센다. |
| `currentOpponent` | 관리자가 "누구 vs 누구"를 보기 위해 matches를 구독할 필요가 없어진다. |
| `gomoku_room_index` | 방 선택 드롭다운 때문에 모든 방의 전체 데이터를 내려받는 사고 방지. |

> **일반화 팁**: 게임 종류가 바뀌어도 `players / waiting / matches / matchLock` 네 갈래와
> `currentMatch 포인터 + 정산 도장` 두 장치는 그대로 재사용된다. 게임별로 바뀌는 건 `matches/{id}` 내부 필드뿐이다.

---

## 3. 기반 장치 1 — 서버 시간 동기화

학생 기기(특히 태블릿)의 시계는 몇 분씩 틀어져 있는 경우가 흔하다. 대기 순서·잠금 만료·AFK 판정을 로컬 시계로 하면 매칭이 통째로 무너진다.

```js
// 방법 A: 상시 구독 (오목)
let serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { serverTimeOffset = s.val() || 0; });
const getServerTime = () => Date.now() + serverTimeOffset;

// 방법 B: 입장 시 1회 동기화 + 타임아웃 폴백 (가위바위보)
function syncServerOffset() {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      onValue(ref(db, '.info/serverTimeOffset'), snap => {
        serverOffset = snap.val() || 0; finish();
      }, finish);
    } catch (e) { finish(); }
    setTimeout(finish, 1500);   // 네트워크가 느려도 입장이 막히지 않게
  });
}
```

**규칙**
- 시간 비교는 전부 `serverNow()` / `getServerTime()`으로.
- DB에 **기록**할 때는 가능하면 `serverTimestamp()` 센티널을 쓴다.
- 단, **트랜잭션 콜백 안에서는 센티널이 해석되지 않으므로** `getServerTime()` 값을 직접 넣는다.
  (오목 `submitMove`의 `cur.lastMoveTime = getServerTime()`가 그 예)

---

## 4. 기반 장치 2 — 하트비트와 접속 상태

### 4.1 3단계 상태

| 상태 | 의미 | 판정 |
|---|---|---|
| `online` | 화면을 보고 있음 | `!document.hidden` |
| `away` | 탭 전환·화면 잠금 | `document.hidden` |
| `offline` | 브라우저 종료·네트워크 단절 | `onDisconnect`가 서버에서 기록 |

여기에 **"하트비트가 오래됐다"** 는 파생 상태가 하나 더 있다. 상태 값만 믿지 말고 `now - lastHeartbeat`도 반드시 함께 본다. 조용히 끊긴 기기는 `status`가 `online`인 채로 남는다.

```js
const HEARTBEAT_MS = 10000;          // 주기
const HEARTBEAT_FRESH_MS = 15000;    // 매칭 대상으로 인정할 신선도
const OFFLINE_MS = 60000;            // 관리자 화면에서 '끊김' 표시 기준
```

### 4.2 하트비트 갱신 — 두 가지 방식

```js
// (가위바위보) 단순 update + serverTimestamp
await update(playerRef(), {
  lastHeartbeat: serverTimestamp(),
  status: document.hidden ? 'away' : 'online'
});

// (오목) 트랜잭션 — 강퇴된 학생이 유령 노드로 되살아나는 것을 차단
await runTransaction(playerRef(room, nick), cur => {
  if (cur === null) return;          // 이미 삭제됨 → 중단(되살리지 않음)
  cur.lastHeartbeat = getServerTime();
  cur.status = document.hidden ? 'away' : 'online';
  return cur;
});
```

> 관리자 강퇴 기능이 있다면 **반드시 트랜잭션 방식**을 써야 한다.
> 단순 `update()`는 없는 노드를 새로 만들어 버려서, 강퇴한 학생이 3초 뒤 표에 다시 나타난다.

### 4.3 visibilitychange 훅이 하는 4가지 일

```js
function handleVisibility() {
  const isHidden = document.hidden;

  // 1) 상태 즉시 반영
  update(playerRef(), { status: isHidden ? 'away' : 'online', lastHeartbeat: serverTimestamp() });

  // 2) 대기실이라면 매칭 대상에서 빠짐 / 복귀
  if (대기실인가) update(myWaitRef(), { visible: !isHidden });

  // 3) 경기 중 이탈이면 '유예 타이머' 시작 (즉시 몰수 금지)
  if (isHidden && 경기중) awayTimer = setTimeout(forfeitByAway, AWAY_GRACE_MS);

  // 4) 돌아왔으면 유예 타이머 해제
  if (!isHidden) clearTimeout(awayTimer);
}
```

**유예 시간(grace)은 필수다.** 알림 확인, 화면 자동 잠금, 앱 전환 같은 오탐이 교실에서 끊임없이 발생한다.
- 가위바위보: `AWAY_GRACE_MS = 15초` (한 판이 짧으므로 짧게)
- 오목: `AFK_LIMIT_MS = 65초` (한 수 제한이 30초이므로 그보다 넉넉히)

---

## 5. 기반 장치 3 — onDisconnect 3종 배치

`onDisconnect`는 **연결이 끊기면 서버가 대신 실행해 주는 예약 쓰기**다. 브라우저 강제 종료, 와이파이 끊김, 배터리 방전 같은 "인사도 없이 사라지는" 경우를 처리하는 유일한 수단이다.

| 대상 | 예약 내용 | 막아주는 사고 |
|---|---|---|
| `players/{me}` | `{status:'offline', lastHeartbeat, currentMatch:null}` | 유령 접속자가 명단에 계속 남음 |
| `waiting/{me}` | `remove()` | **대기실 잠김** — 사라진 학생이 계속 1순위라 아무도 매칭 못 함 |
| `matches/{id}` (오목만) | `{status:'finished', winner:상대, endReason:'offline'}` | 상대가 빈 화면을 무한정 기다림 |

```js
// 배치
await onDisconnect(playerRef()).update({ status: 'offline', currentMatch: null });
await onDisconnect(myWaitRef()).remove();
onDisconnect(matchRef(room, matchId)).update({ status:'finished', winner: oppId, endReason:'offline' });
matchDisconnectArmed = true;

// ★ 해제를 잊으면 안 된다
function disarmMatchDisconnect() {
  if (!matchDisconnectArmed) return;
  matchDisconnectArmed = false;
  onDisconnect(matchRef(room, matchId)).cancel();
}
```

> **가장 흔한 버그**: 경기가 정상 종료됐는데 `onDisconnect`를 `cancel()` 하지 않아,
> 나중에 브라우저를 닫는 순간 **끝난 경기가 다시 몰수패로 덮어쓰인다.**
> 오목 코드는 `status === 'finished'`를 감지하는 즉시 `disarmMatchDisconnect()`를 호출한다.
> 대기실을 떠날 때도 `onDisconnect(waitingRef).cancel()`을 해야 다음 경기 중에 엉뚱한 삭제가 예약되지 않는다.

---

## 6. 매칭 알고리즘 6단계

두 앱이 **완전히 동일한 6단계**를 밟는다. 이것이 이 문서의 핵심이다.

```
① 활성 대기자 필터링
② 리더 선출 (오직 1명만 매칭 로직을 실행)
③ 상대 고르기 (직전 상대 회피)
④ matchLock 선점 (트랜잭션)
⑤ 재확인 (잠금 얻는 사이 상대가 빠졌을 수 있음)
⑥ 원자적 다중 경로 쓰기 (매칭 성사 + 잠금 해제를 한 번에)
```

### 단계 ① — 활성 대기자 필터링

"대기 목록에 있다"와 "지금 실제로 매칭 가능하다"는 다르다.

```js
// 가위바위보: 화면을 보고 있는가로 판정
const visibleWaiters = Object.keys(waiters).filter(k => waiters[k].visible === true);

// 오목: 플레이어 노드의 상태 + 하트비트 신선도로 판정
function isActiveWaiter(id) {
  const d = playersData[id];
  return !!d && d.status === 'online'
      && (getServerTime() - (d.lastHeartbeat || 0)) < HEARTBEAT_FRESH_MS;
}
```

두 방식은 **함께 쓰는 게 가장 좋다**. `visible` 플래그는 즉각적이고, 하트비트 신선도는 조용히 끊긴 기기를 잡아낸다.

### 단계 ② — 리더 선출

> 서버가 없으므로 "누가 매칭을 주도할지"를 클라이언트끼리 합의해야 한다.
> **규칙: 대기 시각이 가장 이른 활성 대기자 1명만 매칭 코드를 실행한다.** 나머지는 즉시 return.

```js
// 가위바위보 — ts 오름차순 정렬 후 0번만 진행
visibleWaiters.sort((a, b) => (waiters[a].ts || 0) - (waiters[b].ts || 0));
if (visibleWaiters.length < 2 || visibleWaiters[0] !== currentUser) return;

// 오목 — joinedAt으로 정렬된 쿼리 결과에서 첫 활성자만 진행
const activeInitiator = currentWaitingList.find(p => isActiveWaiter(p.id));
if (!activeInitiator || activeInitiator.id !== currentNickname) return;
```

오목은 목록을 `query(waitingCollRef, orderByChild('joinedAt'))`로 받아 정렬 부담을 DB에 넘긴다.

리더 선출만으로는 부족하다. 서버 시간 보정에도 미세한 오차가 있고, 두 클라이언트가 서로 다른 스냅샷을 볼 수 있어 **동시에 자기가 리더라고 믿는 순간**이 존재한다. 그래서 ④가 필요하다.

### 단계 ③ — 상대 고르기 (직전 상대 회피)

같은 학생과 계속 붙으면 수업이 지루해지고 데이터도 편향된다.

```js
// 가위바위보 — 후보 중 무작위, 직전 상대는 가능하면 제외 (lastOpponent는 로컬 변수)
let candidates = visibleWaiters.slice(1);
if (lastOpponent && candidates.length > 1) {
  const filtered = candidates.filter(c => c !== lastOpponent);
  if (filtered.length) candidates = filtered;
}
const opponent = candidates[Math.floor(Math.random() * candidates.length)];
```

```js
// 오목 — lastOpponent를 DB에 저장하고 '양방향'으로 확인, 20초 지나면 재대결 허용
const myLastOpponent = playersData[currentNickname]?.lastOpponent || null;
let matchPartner = null, oldOpponent = null;

for (const c of currentWaitingList) {
  if (c.id === currentNickname || !isActiveWaiter(c.id)) continue;
  const cData = playersData[c.id];
  if (c.id !== myLastOpponent && currentNickname !== (cData.lastOpponent || null)) {
    matchPartner = c; break;                 // 서로 직전 상대가 아님 → 최우선
  } else if (!oldOpponent) oldOpponent = c;  // 차선책으로 보관
}
// 새 상대가 끝내 없으면 일정 시간 후 재대결 허용 (2명뿐인 교실에서 영영 못 붙는 사태 방지)
if (!matchPartner && oldOpponent && waitTimeSec >= REMATCH_WAIT_SEC) matchPartner = oldOpponent;
if (!matchPartner) return;
```

| 방식 | 장점 | 단점 |
|---|---|---|
| 로컬 변수(가위바위보) | 구현이 단순 | 새로고침하면 기억이 사라짐 |
| DB 저장 + 양방향(오목) | 새로고침에도 유지, 한쪽만 기억하는 비대칭 방지 | 쓰기 1회 추가 |
| **폴백 타이머(둘 다 권장)** | **대기자가 2명뿐일 때 교착 방지** | — |

> **반드시 폴백을 둘 것.** 남은 인원이 2명이고 서로 직전 상대이면, 폴백이 없으면 영원히 매칭되지 않는다.
> 가위바위보는 `candidates.length > 1`일 때만 필터링해서, 오목은 `REMATCH_WAIT_SEC` 경과로 이를 해결한다.

### 단계 ④ — matchLock 선점 (경합의 최종 방어선)

```js
const lock = await runTransaction(matchLockRef, (cur) => {
  const now = getServerTime();
  if (cur && cur.until && cur.until > now) return;   // 다른 사람이 매칭 중 → 중단
  return { by: currentNickname, until: now + MATCH_LOCK_MS };   // 선점
});
if (!lock.committed) return;   // 잠금 실패 → 이번 턴은 포기, 다음 스냅샷에서 재시도
lockHeld = true;
```

**핵심 3가지**

1. **`return;`(undefined)으로 트랜잭션을 중단**한다. `res.committed === false`가 곧 "내가 졌다"는 뜻이다.
2. **`until` TTL(3초)을 반드시 넣는다.** 잠금을 쥔 클라이언트가 그 순간 죽어도 3초 뒤 자동 해제된다. TTL 없는 잠금은 방 전체를 영구 동결시킨다.
3. **실패는 정상이다.** 에러 처리하지 말고 조용히 return, 다음 스냅샷에서 재시도.

### 단계 ⑤ — 재확인

잠금을 얻는 데 걸린 수백 ms 사이에 상대가 나갔을 수 있다. 캐시가 아닌 **서버 값을 다시 읽는다.**

```js
const fresh = await get(waitingCollRef(room));
const w = fresh.exists() ? fresh.val() : {};
if (!w[currentNickname] || !w[matchPartner.id]) {   // 둘 중 하나라도 빠졌으면
  await set(matchLockRef, null);                     // 잠금 반납 후 취소
  return;
}
```

### 단계 ⑥ — 원자적 다중 경로 쓰기

**여기가 가장 중요하다.** 매칭 성사에 필요한 모든 변경을 **단 한 번의 `update()`** 로 묶는다. RTDB의 다중 경로 업데이트는 전부 성공하거나 전부 실패한다.

```js
const matchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const updates = {};

updates[`matches/${matchId}`]                = { player1: 나, player2: 상대, status: 'playing', ... };
updates[`players/${나}/currentMatchId`]       = matchId;   // ★ 진입 포인터
updates[`players/${상대}/currentMatchId`]     = matchId;   // ★ 진입 포인터
updates[`players/${나}/currentOpponent`]      = 상대;
updates[`players/${상대}/currentOpponent`]    = 나;
updates[`players/${나}/lastOpponent`]         = 상대;
updates[`players/${상대}/lastOpponent`]       = 나;
updates[`waiting/${나}`]                      = null;      // 대기열에서 제거
updates[`waiting/${상대}`]                    = null;
updates[`matchLock`]                          = null;      // ★ 성사와 동시에 잠금 해제

await update(roomRef(roomCode), updates);   // 원자적
```

> 이걸 여러 번의 `set()`으로 쪼개면, 중간에 네트워크가 끊길 때
> "경기는 만들어졌는데 대기열에서 안 빠진 학생"이나 "한쪽만 포인터가 걸린 반쪽짜리 매칭"이 생긴다.

### 재진입 방지 플래그

6단계 전체를 `isMatching` 플래그로 감싼다. `waiting` 스냅샷은 짧은 시간에 여러 번 울리기 때문에, 이게 없으면 같은 사람이 동시에 두 경기를 만든다.

```js
async function attemptSmartMatch() {
  if (currentMatchId || isMatching || isKicked) return;
  isMatching = true;
  try {
    /* ① ~ ⑥ */
  } finally {
    isMatching = false;
    if (lockHeld) await set(matchLockRef, null);   // 예외로 빠져나가도 잠금 반납
  }
}
```

### 매칭 시도를 언제 실행하나

| | 가위바위보 | 오목 |
|---|---|---|
| 트리거 | `waiting` 컬렉션 `onValue` (이벤트 구동) | `onValue`(waiting) + `onValue`(players) + **1초 `setInterval`** |
| 특징 | 쓰기가 없으면 실행되지 않아 조용함 | 스냅샷을 놓쳐도 폴링이 회복시킴 |

> **권장: 이벤트 + 저빈도 폴링 병행.** 이벤트만 쓰면 마지막 한 명이 들어온 뒤
> 아무 쓰기도 없을 때 매칭이 멈출 수 있다. 1초 폴링은 안전망 역할을 하며 비용도 거의 없다(로컬 캐시만 읽음).

---

## 7. 포인터 기반 경기 진입 (트래픽 최적화의 핵심)

매칭을 성사시킨 리더는 자기가 만든 `matchId`를 안다. **문제는 상대방이 어떻게 아느냐**다.

### ❌ 나쁜 방법

```js
onValue(ref(db, `rooms/${room}/matches`), snap => { /* 내 경기 찾기 */ });
```

30명 교실에서 15개 대국이 동시에 돌아가면, **모든 학생이 모든 대국의 모든 착수를 실시간으로 내려받는다.** 오목처럼 `moves` 배열이 계속 커지는 게임에서는 트래픽이 제곱으로 폭증한다.

### ✅ 좋은 방법 — 내 포인터 한 칸만 구독

```js
// 가위바위보: 포인터 구독 → 바뀌면 그때 경기 1건만 get()
matchPtrUnsub = onValue(ref(db, `rooms/${room}/players/${me}/currentMatch`), async (snap) => {
  const matchId = snap.val();
  if (!matchId || matchId === currentMatchId) return;      // 중복 방지

  const mSnap = await get(ref(db, `rooms/${room}/matches/${matchId}`));
  if (!mSnap.exists()) return;
  const m = mSnap.val();
  if (m.status !== 'playing') return;                       // 끝난 경기로 되돌아가지 않음
  if (m.p1 !== me && m.p2 !== me) return;                    // 내 경기가 맞는지 검증

  stopWaiting();
  handleMatchFound(matchId, m);
});
```

```js
// 오목: 매칭 시도 루프 앞머리에서 포인터를 확인 (별도 구독 없이 겸용)
if (playersData[currentNickname]?.currentMatchId) {
  const myMatch = await resolveMyMatch();
  if (myMatch) { cleanupWaiting(); /* 게임 진입 */ return; }
}
```

`resolveMyMatch()`는 재접속 복구에도 그대로 쓰인다. 포인터가 가리키는 경기가 없거나 이미 끝났으면 포인터를 정리하고 `null`을 반환한다.

```js
async function resolveMyMatch() {
  let mid = playersData[me]?.currentMatchId;
  if (mid === undefined) mid = (await get(ref(db, `.../players/${me}/currentMatchId`))).val();
  if (!mid) return null;

  const mSnap = await get(matchRef(room, mid));
  if (!mSnap.exists()) {                                   // 경기가 삭제됨
    await update(playerRef(room, me), { currentMatchId: null, currentOpponent: null });
    return null;
  }
  const data = mSnap.val();
  if (data.status !== 'playing') {                          // 이미 끝남 → 정산만 하고 정리
    await settleMatch(room, mid, data);
    await update(playerRef(room, me), { currentMatchId: null, currentOpponent: null });
    return null;
  }
  return { id: mid, data };
}
```

> **부수 효과**: 이 포인터 덕분에 "새로고침해도 하던 경기로 복귀"가 공짜로 얻어진다.
> 대신 **대기실에 들어갈 때마다 포인터를 `null`로 초기화**해야 옛 경기로 되돌아가지 않는다.
> (가위바위보 `enterWaitingRoom`의 `update(playerRef(), { currentMatch: null })`)

---

## 8. 경기 종료와 전적 정산 — 멱등성 설계

가장 많은 버그가 나오는 지점이다. **종료 판정**과 **전적 반영**을 반드시 분리하고, 각각을 트랜잭션으로 1회만 성공하게 만든다.

```
[누구든 호출 가능] finishMatchAtomic()  →  status를 'finished'로 확정 (1명만 성공)
                          ↓
[누구든 호출 가능] settleMatch()        →  statsApplied 도장 선점 (1명만 성공) → wins/losses 반영
```

### 8.1 종료 확정 — `finishMatchAtomic`

```js
async function finishMatchAtomic(room, matchId, winnerId, reason) {
  const res = await runTransaction(matchRef(room, matchId), (cur) => {
    if (!cur || cur.status !== 'playing') return;   // 이미 끝났으면 중단
    cur.status = 'finished';
    cur.winner = winnerId || null;
    cur.endReason = reason;
    return cur;
  });
  return res.committed;   // 진짜로 내가 끝냈는지 여부
}
```

호출 경로가 이렇게 많다 — **그래서 원자적이어야 한다.**
- 5목 완성 / 판 가득 참 / 연속 패스 4회
- 내가 65초 이상 이탈 → 자진 몰수패
- 상대가 65초 이상 무응답 → 상대 몰수패
- 관리자 강퇴
- `onDisconnect` (서버가 실행)
- 재접속 시 "1분 넘게 끊겼던 경기" 정리

### 8.2 전적 반영 — `settleMatch`

```js
async function settleMatch(room, matchId, data) {
  if (!data || data.status !== 'finished' || data.statsApplied) return;

  // ★ 도장 선점: 먼저 찍은 1명만 통과
  const res = await runTransaction(
    ref(db, `.../matches/${matchId}/statsApplied`),
    (cur) => (cur === true ? undefined : true)
  );
  if (!res.committed) return;

  const { player1, player2, winner } = data;
  const winnerValid = winner && (winner === player1 || winner === player2);

  async function applyTo(nickname, field) {
    const pRef = playerRef(room, nickname);
    const snap = await get(pRef);            // ★ 존재 확인: 강퇴된 학생을 되살리지 않음
    if (!snap.exists()) return;
    const patch = { currentOpponent: null };
    if (field) patch[field] = increment(1);  // ★ 서버 원자 연산
    await update(pRef, patch);
  }
  await applyTo(player1, winnerValid ? (player1 === winner ? 'wins' : 'losses') : null);
  await applyTo(player2, winnerValid ? (player2 === winner ? 'wins' : 'losses') : null);
}
```

가위바위보는 같은 아이디어를 **개인별 도장**으로 구현한다. 각자 자기 결과만 기록하므로 상대의 네트워크 상태와 무관하게 동작한다.

```js
async function commitResultOnce(outcome) {   // outcome: 'win' | 'lose'
  const countedRef = ref(db, `.../matches/${matchId}/counted/${me}`);
  const res = await runTransaction(countedRef, (cur) => (cur ? undefined : outcome));
  if (!res.committed) return false;          // 이미 집계됨

  const updates = { total: increment(1) };
  updates[outcome === 'win' ? 'wins' : 'losses'] = increment(1);
  await update(playerRef(), updates);
  return true;
}
```

| 방식 | 장점 | 언제 쓰나 |
|---|---|---|
| 공용 도장 `statsApplied` | 한 번에 양쪽 정산, 관리자·서버도 호출 가능 | 몰수·강퇴 등 제3자가 결과를 확정하는 게임 |
| 개인 도장 `counted/{me}` | 상대가 이미 나갔어도 내 기록은 확실히 남음 | 판이 짧고 각자 결과가 자명한 게임 |

### 8.3 `increment()`를 쓰는 이유

전적 갱신에 트랜잭션 대신 `increment()`를 쓴다.

> **함정**: `runTransaction`은 해당 경로의 로컬 캐시가 없으면 첫 콜백에 `null`을 넘긴다.
> 이때 무심코 `return { wins: 1 }` 하면 기존 전적을 **덮어써 버린다.**
> 오목 코드의 주석 "트랜잭션은 캐시가 없으면 null로 중단되므로 서버 값을 직접 확인합니다"가 바로 이 이야기다.
> 카운터 증가는 `increment()`(서버 원자 연산)가 정답이다.

---

## 9. 이탈·AFK 처리 3중 방어선

혼자 남아 무한정 기다리는 학생이 생기지 않게 하려면 층을 나눠 방어해야 한다.

| 층 | 감지 주체 | 대상 | 지연 |
|---|---|---|---|
| **1. onDisconnect** | 서버 | 브라우저 종료·네트워크 단절 | 즉시(~수 초) |
| **2. 하트비트 노후화** | 상대 클라이언트 | 조용히 끊긴 기기, 절전 | AFK_LIMIT |
| **3. visibility 유예** | 본인 클라이언트 | 앱 전환·화면 잠금 | GRACE 후 |

### 9.1 본인이 이탈했을 때 (자진 신고)

```js
// 가위바위보 — 유예 후 '무효' 처리 (승패 아님)
async function forfeitByAway() {
  if (!document.hidden) return;                 // 돌아왔으면 취소
  const result = await runTransaction(mRef, (match) => {
    if (match && match.status === 'playing') {
      match.status = 'finished';
      match.endReason = 'forfeit';
      match.leftBy = currentUser;
      return match;
    }
    return;                                     // 이미 끝난 경기면 중단
  });
  if (result.committed) {
    await update(playerRef(), { forfeits: increment(1) });   // 승률 데이터 보호
  }
}

// 오목 — 복귀 시점에 이탈 시간이 한계를 넘었으면 몰수패
if (myAwayStartTime > 0 && (getServerTime() - myAwayStartTime) > AFK_LIMIT_MS) {
  if (currentMatchId && matchData?.status === 'playing') triggerSelfForfeit();
}
```

> **수업용 앱이라면 "패배"와 "무효"를 구분하라.**
> 자리를 비운 판을 패배로 기록하면 승률 통계 수업의 데이터가 통째로 오염된다.
> 가위바위보는 `forfeits`라는 별도 필드에만 세고 화면에도 "승패에 포함되지 않습니다"라고 명시한다.

### 9.2 상대가 이탈했을 때 (상대 감시)

```js
// 상대 플레이어 노드만 구독 (전체 players 구독 아님)
unsubOpponent = onValue(playerRef(room, oppId), (snap) => {
  const data = snap.val();
  opponentSynced = true;                         // ★ 첫 동기화 전에는 판정 금지
  if (data.lastHeartbeat !== opponentLastHeartbeatValue) {
    opponentLastHeartbeatValue = data.lastHeartbeat;
    opponentHeartbeatLocalTime = getServerTime();   // '값이 바뀐 시각'을 기록
  }
  if (data.status === 'away' && opponentStatus !== 'away') {
    opponentStatus = 'away'; opponentAwayStartTime = getServerTime();
  } else if (data.status === 'offline') opponentStatus = 'offline';
  else { opponentStatus = 'online'; opponentAwayStartTime = 0; }
});

// 타이머 루프에서 종합 판정
const gone = opponentStatus === 'offline'
          || (getServerTime() - opponentHeartbeatLocalTime) > AFK_LIMIT_MS
          || (opponentStatus === 'away' && (getServerTime() - opponentAwayStartTime) > AFK_LIMIT_MS);
if (gone) { unsubOpponent(); unsubOpponent = null; triggerOpponentForfeit(); }
```

**포인트 3가지**
- `opponentSynced` 가드: 구독 직후 데이터가 오기 전에 몰수 판정을 내리면 안 된다.
- `lastHeartbeat` **값의 변화**를 로컬 시각으로 기록한다. 서버 값끼리 빼면 시계 오차에 취약하다.
- 판정 후 즉시 구독을 해제해 몰수 처리가 반복 호출되지 않게 한다.

### 9.3 상대가 응답하지 않을 때의 '탈출구'

몰수 타이머와 별개로, **학생이 스스로 빠져나올 버튼**을 준다. 30초쯤 지나면 노출한다.

```js
matchTimeoutTimer = setTimeout(() => {
  $('btn-abandon-match').classList.remove('d-none');   // "🔄 상대를 바꿔서 다시 매칭하기"
}, MATCH_TIMEOUT_MS);

// 클릭 시 — 승패 기록 없이 종료
await runTransaction(matchRef, (m) => {
  if (m && m.status === 'playing') {
    m.status = 'finished'; m.endReason = 'abandoned'; m.leftBy = currentUser; return m;
  }
  return;
});
```

상대 클라이언트는 `endReason`을 보고 자기 화면에 맞는 안내를 띄운다.

```js
const msg = (match.leftBy === currentUser)
  ? '경기를 취소하고 대기실로 돌아갑니다.'
  : '상대방이 경기를 취소했습니다.<br>대기실로 돌아가 다음 매칭을 준비합니다.';
```

> **`endReason`을 반드시 남겨라.** 같은 `finished` 상태라도
> `forfeit`(자리 비움) / `abandoned`(자발적 취소) / `offline`(연결 끊김) / `kick`(강퇴) /
> `pass`(연속 패스 무승부) / `full`(판 가득) / `error`(정보 불일치)는 안내 문구도, 전적 반영 여부도 다르다.

### 9.4 매칭 정보 불일치 감지 (희귀 경합의 마지막 그물)

아주 드물게 A는 A-B 경기를, B는 B-C 경기를 보고 있는 상태가 만들어질 수 있다. 오목은 이걸 감지해 조용히 재매칭시킨다.

```js
if (opponentMatchId && opponentMatchId !== currentMatchId &&
    (matchData.moves?.length || 0) === 0 &&              // 아직 한 수도 안 뒀고
    (getServerTime() - gameSyncStartedAt) > 3000) {      // 3초 이상 지났을 때만
  finishMatchAtomic(room, currentMatchId, null, 'error'); // 승패 없이 종료 → 양쪽 대기실 복귀
}
```

조건이 까다로운 이유: 매칭 직후 몇 백 ms 동안은 상대 포인터가 아직 갱신 전일 수 있어 오탐이 난다.

---

## 10. 중복 접속 처리

같은 닉네임으로 두 기기에서 들어오면 전적이 두 배로 오르거나 경기가 꼬인다. 두 앱의 정책이 다르다.

### 방식 A — 경고 후 허용 (가위바위보)

```js
const looksOnline = p.status && p.status !== 'offline'
                 && (serverNow() - p.lastHeartbeat) < ONLINE_THRESHOLD_MS;
if (looksOnline) {
  const ok = await customConfirm('중복 접속 확인',
    `이미 접속 중인 기기가 있습니다.<br>연결이 끊겼던 것이라면 그대로 이어서 접속해도 됩니다. 계속할까요?`);
  if (!ok) return;
}
```
→ 와이파이가 끊겼다 돌아온 학생을 막지 않는다. 대신 이중 집계 위험은 남는다.

### 방식 B — 차단 + 세션 무효화 (오목)

```js
// 입장 시: 최근 하트비트가 살아 있으면 차단
if (diff <= OFFLINE_MS && pData.status === 'online') {
  return await customAlert("접속 불가", "현재 사용 중인 닉네임입니다. 다른 닉네임을 사용해주세요.");
}

// 입장 성공 시 세션 ID 발급
localSessionId = Date.now().toString() + Math.random().toString(36).substring(2, 6);
await update(playerRef(code, nickname), { sessionId: localSessionId, ... });

// 내 노드를 계속 감시 → sessionId가 바뀌면 '먼저 있던 기기'가 스스로 물러난다
unsubMe = onValue(playerRef(room, nick), (snap) => {
  if (!snap.exists()) {                                   // 강퇴됨
    isKicked = true; cleanupAll();
    customAlert("알림", "방에서 강퇴되었습니다.").then(() => location.reload());
    return;
  }
  if (snap.val().sessionId && snap.val().sessionId !== localSessionId) {
    isKicked = true; cleanupAll();
    customAlert("중복 접속", "다른 기기에서 접속하여 연결이 끊어졌습니다.").then(() => location.reload());
  }
});
```

> **권장 조합**: B의 `sessionId` 방식(마지막 접속이 이김)을 기본으로 하고,
> "오래 끊겨 있었다면 경고 후 이어받기"를 A처럼 허용하는 절충안이 교실에서 가장 잘 동작한다.
> `isKicked` 플래그는 하트비트·매칭 루프 앞머리에서 반드시 확인해 유령 노드 부활을 막는다.

### 재접속 복구 시나리오 (오목)

```js
const existing = await resolveMyMatch();
if (existing && wasOfflineTooLong) {              // 1분 넘게 끊겼던 경우
  const winnerId = (existing.data.player1 === nick) ? existing.data.player2 : existing.data.player1;
  await finishMatchAtomic(code, existing.id, winnerId, 'offline');
  await settleMatch(code, existing.id, (await get(matchRef(code, existing.id))).val());
  await update(playerRef(code, nick), { currentMatchId: null, currentOpponent: null });
  await customAlert("몰수패", "접속이 1분 이상 끊겨 기존 게임에서 몰수패 처리되었습니다.");
  enterWaitingRoom();
} else if (existing) {
  /* 진행 중이던 판으로 그대로 복귀 */
} else {
  enterWaitingRoom();
}
```

---

## 11. 구독 수명주기와 트래픽 관리

RTDB는 **다운로드 용량**으로 과금된다. 30명 교실에서 구독 하나를 잘못 걸면 요금과 성능이 동시에 무너진다.

### 구독을 3계층으로 나눈다

| 계층 | 구독 대상 | 살아 있는 기간 | 해제 함수 |
|---|---|---|---|
| 세션 | `players/{me}` | 입장 ~ 종료 | `cleanupAll` |
| 대기실 | `waiting`, `players`(전체) | 대기실에 있는 동안만 | `cleanupWaiting` |
| 경기 | `matches/{myMatch}`, `players/{opponent}` | 경기 중에만 | `cleanupMatchSubs` |

```js
function cleanupMatchSubs() {
  if (unsubMatch) { unsubMatch(); unsubMatch = null; }
  if (unsubOpponent) { unsubOpponent(); unsubOpponent = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}
function cleanupWaiting() {
  if (unsubWaiting) { unsubWaiting(); unsubWaiting = null; }
  if (unsubAllPlayers) { unsubAllPlayers(); unsubAllPlayers = null; }
  if (waitingInterval) { clearInterval(waitingInterval); waitingInterval = null; }
  onDisconnect(waitingRef(room, nick)).cancel();     // ★ 예약도 함께 해제
}
function cleanupAll() {
  cleanupMatchSubs(); cleanupWaiting(); cleanupAdmin();
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (unsubMe) unsubMe();
  document.removeEventListener('visibilitychange', handleVisibility);
}
```

### 하지 말아야 할 것

```js
onValue(ref(db, `rooms/${room}`), ...)          // ❌ 방 전체 — 남의 하트비트·남의 착수까지 전부 수신
onValue(ref(db, `rooms/${room}/matches`), ...)  // ❌ 모든 대국 — moves가 커질수록 폭증
onValue(ref(db, 'rooms'), ...)                  // ❌ 모든 방
```

### 관리자 화면 최적화 3종

```js
// 1) matches는 아예 구독하지 않고 players/{id}/currentOpponent로 대전 현황 표시
unsubAdminPlayers = onValue(playersCollRef(roomCode), snap => { adminPlayersData = snap.val() || {}; scheduleAdminRender(); });

// 2) 하트비트마다 표를 다시 그리지 않도록 1초 단위로 묶기(스로틀)
function scheduleAdminRender() {
  const now = Date.now();
  if (now - adminLastRender > 1000) { adminLastRender = now; renderAdminBoard(); return; }
  if (adminRenderPending) return;
  adminRenderPending = true;
  setTimeout(() => { adminRenderPending = false; adminLastRender = Date.now(); renderAdminBoard(); }, 1000);
}

// 3) 조용히 끊긴 학생의 '끊김' 표시를 갱신하기 위한 주기 렌더 (DB 읽기 없음)
adminRenderInterval = setInterval(renderAdminBoard, 5000);
```

방 목록도 전체 스캔 대신 경량 인덱스를 쓴다.

```js
// gomoku_room_index/{code} = { createdAt } 만 읽음. 없으면 1회 마이그레이션.
const idxSnap = await get(roomIndexRef());
```

---

## 12. 두 구현 비교표

| 항목 | 가위바위보 | 좌표평면 오목 |
|---|---|---|
| 한 판 길이 | 수 초 | 수 분 |
| 매칭 트리거 | `waiting` onValue (이벤트) | onValue ×2 + 1초 폴링 |
| 활성 판정 | `waiting.visible === true` | `status==='online' && 하트비트<15s` |
| 리더 선출 | `ts` 최소 = 나 | `joinedAt` 순 첫 활성자 = 나 |
| 상대 선택 | 후보 중 **무작위** | 앞에서부터 **첫 적합자** |
| 직전 상대 회피 | 로컬 변수, 후보 2명↑일 때만 | DB 저장 + 양방향 + 20초 후 해제 |
| 잠금 TTL | 3초 (하드코딩) | 3초 (`MATCH_LOCK_MS`) |
| 경기 진입 | `currentMatch` 포인터 **전용 구독** | 매칭 루프에서 포인터 확인 |
| 이탈 유예 | 15초 → **무효**(승패 미반영) | 65초 → **몰수패** |
| 결과 집계 | 개인 도장 `counted/{me}` | 공용 도장 `statsApplied` |
| onDisconnect | player, waiting | player, waiting, **match** |
| 중복 접속 | 경고 후 허용 | 차단 + `sessionId` 무효화 |
| 턴 타이머 | 결과 공개 3초 카운트다운 | `lastMoveTime` 기준 30초/수 |
| 종료 사유 | forfeit / abandoned | offline / kick / pass / full / error |
| 방 종료 | 교사가 `status:'finished'` + waiting·matches 정리 | 방 삭제만 존재 |

**어느 쪽을 참고할까**
- 판이 짧고 결과가 즉시 확정되는 게임(가위바위보, 주사위, 퀴즈 대결) → **가위바위보 쪽**. 개인 도장 + `visible` 필터가 잘 맞는다.
- 판이 길고 턴이 오가는 게임(오목, 체스, 보드게임) → **오목 쪽**. `lastMoveTime` 기준 타이머 + match onDisconnect + 공용 도장이 필요하다.

---

## 13. 함정 모음 (실제로 밟았던 것들)

### RTDB 관련

| 함정 | 증상 | 해법 |
|---|---|---|
| 트랜잭션 첫 콜백의 `null` | 기존 전적이 통째로 덮어써짐 | 카운터는 `increment()`, 또는 `get()`으로 존재 확인 후 `update()` |
| 트랜잭션 안의 `serverTimestamp()` | 센티널이 그대로 저장되어 시간 계산이 깨짐 | 트랜잭션 안에서는 `getServerTime()` 값 사용 |
| 트랜잭션 중단 방법 혼동 | 의도치 않게 값이 써짐 | 중단은 `return;`(undefined). `res.committed`로 성공 확인 |
| 삭제된 노드 부활 | 강퇴한 학생이 표에 다시 나타남 | 하트비트를 트랜잭션으로, `cur === null`이면 중단 |
| `onDisconnect` 미해제 | 끝난 경기가 나중에 몰수패로 덮어써짐 | 종료 감지 즉시 `cancel()`, `armed` 플래그로 관리 |
| 다중 경로 쓰기를 쪼갬 | 반쪽짜리 매칭, 대기열 잔류 | 매칭 성사는 **단일 `update()`** 로 |

### 매칭 로직 관련

| 함정 | 증상 | 해법 |
|---|---|---|
| 리더 선출만 하고 잠금 없음 | 시계 오차로 한 명이 두 경기에 동시 배정 | `matchLock` 트랜잭션 추가 |
| 잠금에 TTL 없음 | 잠금 보유자가 죽으면 방 전체 영구 정지 | `until = now + 3000` |
| 잠금 후 재확인 생략 | 이미 나간 학생과 매칭되어 유령 경기 발생 | 잠금 직후 `get()`으로 양쪽 재확인 |
| 직전 상대 필터에 폴백 없음 | 2명만 남으면 영원히 매칭 실패 | 후보 수 확인 또는 `REMATCH_WAIT_SEC` 경과 시 허용 |
| `isMatching` 가드 없음 | 스냅샷 연쇄로 중복 매칭 | 플래그 + `try/finally` |
| 대기실 복귀 시 포인터 미초기화 | 끝난 옛 경기로 되돌아감 | `enterWaitingRoom`에서 `currentMatch = null` |
| 하위 상태를 안 보고 포인터만 신뢰 | 종료된 경기로 진입 | 진입 전 `status === 'playing'` 및 본인 참가 여부 검증 |

### 브라우저 동작 관련

| 함정 | 증상 | 해법 |
|---|---|---|
| 백그라운드 탭의 타이머 스로틀링 | 카운트다운이 멈추거나 늦음 | 남은 시간을 **매 틱마다 실제 시각으로 재계산** |
| 화면 잠금을 이탈로 오판 | 멀쩡한 학생이 몰수패 | 유예 시간(grace) 부여 |
| 새로고침으로 턴 타이머 초기화 | 시간 무한 연장 꼼수 | 타이머 기준을 서버가 기록한 `lastMoveTime`으로 |

```js
// 백그라운드 스로틀링에 안전한 카운트다운 (setInterval 감소 방식 ❌)
function startCountdownAndResolve(match) {
  const endAt = Date.now() + 3000;
  const tick = () => {
    const remain = Math.ceil((endAt - Date.now()) / 1000);   // ★ 매번 재계산
    if (remain > 0) { render(remain); countdownTimer = setTimeout(tick, 200); }
    else resolveMatch(match);
  };
  tick();
}
```

### 게임 로직 관련

| 함정 | 증상 | 해법 |
|---|---|---|
| 무승부 초기화를 p1만 담당 | p1이 나가면 p2가 영구 대기 | **양쪽 모두** 트랜잭션으로 초기화 시도 (먼저 도착한 쪽만 성공) |
| 착수 연타 | 수가 중복되거나 사라짐 | `isSubmittingMove` 플래그 + 트랜잭션 내 턴 검증 |
| 클라이언트 턴 판단만 신뢰 | 순서 꼬임 | 트랜잭션 안에서 `moves.length % 2`로 재검증 |

```js
// 무승부 초기화: 어느 쪽이 먼저 도달하든 딱 한 번만 실행된다
await runTransaction(matchRef, (m) => {
  if (m && m.status === 'playing' && m.p1_choice && m.p2_choice && m.p1_choice === m.p2_choice) {
    m.p1_choice = ""; m.p2_choice = ""; return m;
  }
  return;
});
```

### 입력·보안 관련

- 닉네임은 **RTDB 키로 쓰이므로** `. $ # [ ] /` 및 제어문자를 반드시 막는다 (`isValidRtdbKey`, `NICKNAME_RE`).
- 정규식의 길이 제한과 입력창 `maxlength`를 **같은 값으로** 맞춘다(오목은 둘 다 10자).
- 방 코드에서 헷갈리는 문자(`0/O`, `1/I`)를 뺀다 → `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- 방 코드 생성은 **충돌 검사 + 재시도 루프**(최대 20회)로.
- 학생이 입력한 모든 값은 출력 전에 `escapeHtml()`.
- ⚠️ **이 두 앱은 보안 규칙 없이 클라이언트 신뢰 모델로 동작한다.** 교실 밖에서 쓸 거라면
  `.write` 규칙으로 "자기 노드만 수정", "matches는 참가자만 수정" 같은 제약을 반드시 추가할 것.

---

## 14. 새 게임 만들 때 체크리스트

### 설계 단계
- [ ] 한 판의 길이는? (짧음 → 가위바위보형 / 김 → 오목형)
- [ ] 이탈 유예 시간과 몰수 기준을 한 판 길이에 맞춰 정했는가?
- [ ] 이탈한 판을 **패배로 기록할지, 무효로 뺄지** 정했는가?
- [ ] 필요한 `endReason` 목록을 나열했는가?

### 데이터 모델
- [ ] `players / waiting / matches / matchLock` 4갈래 구성
- [ ] `players/{me}/currentMatch` 진입 포인터
- [ ] 정산 도장 (`counted/{me}` 또는 `statsApplied`)
- [ ] 관리자 화면용 비정규화 필드(`currentOpponent`)
- [ ] 방 목록용 경량 인덱스

### 기반 장치
- [ ] `.info/serverTimeOffset` 동기화, 모든 시간 비교를 서버 시각으로
- [ ] 하트비트 10초 + `visibilitychange` 훅
- [ ] `onDisconnect` 3종(player / waiting / match) 배치 **및 해제 경로**
- [ ] 강퇴 기능이 있다면 하트비트를 트랜잭션으로

### 매칭
- [ ] 활성 대기자 필터 (visible + 하트비트 신선도)
- [ ] 리더 선출 (가장 이른 활성 대기자)
- [ ] 직전 상대 회피 **+ 폴백**
- [ ] `matchLock` 트랜잭션 + TTL
- [ ] 잠금 후 재확인
- [ ] 단일 `update()`로 원자적 성사 (+ 잠금 동시 해제)
- [ ] `isMatching` 가드와 `try/finally` 잠금 반납
- [ ] 이벤트 트리거 + 저빈도 폴링 병행

### 경기·종료
- [ ] 모든 상태 변경은 트랜잭션 안에서 턴·유효성 재검증
- [ ] 타이머 기준은 서버가 기록한 `lastMoveTime`
- [ ] 카운트다운은 매 틱 실제 시각 재계산
- [ ] `finishMatchAtomic` / `settleMatch` 분리, 각각 1회만 성공
- [ ] 전적 갱신은 `increment()`
- [ ] 결과 안내는 `resultHandled` 플래그로 1회만
- [ ] 종료 후 양쪽이 떠났으면 `matches/{id}` 삭제

### 정리
- [ ] 구독 3계층 분리 + 각 계층 cleanup 함수
- [ ] 방 전체 / matches 전체 / rooms 전체 구독 없음
- [ ] 학생 입력 전부 `escapeHtml()`, 키 문자 검증
- [ ] 30명 동시 접속 부하 테스트, 새로고침·기내모드 토글 테스트

---

## 15. 최소 뼈대 코드

새 게임에 그대로 복사해 쓸 수 있는 골격이다. `TODO` 표시만 게임에 맞게 채우면 된다.

```js
// ===== 설정 =====
const HEARTBEAT_MS = 10000;
const HEARTBEAT_FRESH_MS = 15000;   // 매칭 대상 인정 기준
const AFK_LIMIT_MS = 65000;         // TODO: 한 판 길이에 맞게
const MATCH_LOCK_MS = 3000;
const REMATCH_WAIT_SEC = 20;

// ===== 서버 시간 =====
let serverOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => serverOffset = s.val() || 0);
const now = () => Date.now() + serverOffset;

// ===== 경로 =====
const R = (c) => ref(db, `rooms/${c}`);
const P = (c, n) => ref(db, `rooms/${c}/players/${n}`);
const W = (c, n) => ref(db, `rooms/${c}/waiting/${n}`);
const M = (c, id) => ref(db, `rooms/${c}/matches/${id}`);
const LOCK = (c) => ref(db, `rooms/${c}/matchLock`);

// ===== 하트비트 =====
function startHeartbeat() {
  onDisconnect(P(room, me)).update({ status: 'offline', currentMatch: null });
  const beat = () => runTransaction(P(room, me), cur => {
    if (cur === null) return;                       // 강퇴됨 → 부활 금지
    cur.lastHeartbeat = now();
    cur.status = document.hidden ? 'away' : 'online';
    return cur;
  });
  beat();
  heartbeatInterval = setInterval(beat, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', handleVisibility);
}

// ===== 대기실 =====
async function enterWaitingRoom() {
  cleanupMatchSubs();
  currentMatchId = null; isMatching = false;
  await update(P(room, me), { currentMatch: null });          // 옛 경기 복귀 방지

  await set(W(room, me), { ts: serverTimestamp(), visible: !document.hidden });
  onDisconnect(W(room, me)).remove();                          // 대기실 잠김 방지

  // 진입 포인터 구독
  unsubPtr = onValue(ref(db, `rooms/${room}/players/${me}/currentMatch`), async (snap) => {
    const id = snap.val();
    if (!id || id === currentMatchId) return;
    const m = (await get(M(room, id))).val();
    if (!m || m.status !== 'playing') return;
    if (m.p1 !== me && m.p2 !== me) return;
    cleanupWaiting();
    startMatch(id, m);
  });

  unsubWaiting = onValue(ref(db, `rooms/${room}/waiting`), s => { waiters = s.val() || {}; tryMatch(); });
  unsubPlayers = onValue(ref(db, `rooms/${room}/players`), s => { players = s.val() || {}; tryMatch(); });
  waitingInterval = setInterval(tryMatch, 1000);               // 안전망 폴링
}

// ===== 매칭 6단계 =====
async function tryMatch() {
  if (currentMatchId || isMatching || isKicked) return;
  isMatching = true;
  let lockHeld = false;
  try {
    // ① 활성 대기자
    const active = Object.keys(waiters).filter(k =>
      waiters[k].visible === true &&
      players[k]?.status === 'online' &&
      now() - (players[k].lastHeartbeat || 0) < HEARTBEAT_FRESH_MS
    ).sort((a, b) => (waiters[a].ts || 0) - (waiters[b].ts || 0));

    // ② 리더 선출
    if (active.length < 2 || active[0] !== me) return;

    // ③ 상대 고르기 (+ 폴백)
    const myLast = players[me]?.lastOpponent || null;
    let partner = active.slice(1).find(id => id !== myLast && players[id]?.lastOpponent !== me);
    if (!partner && waitedSec() >= REMATCH_WAIT_SEC) partner = active[1];
    if (!partner) return;

    // ④ 잠금
    const lock = await runTransaction(LOCK(room), cur => {
      const t = now();
      if (cur && cur.until > t) return;
      return { by: me, until: t + MATCH_LOCK_MS };
    });
    if (!lock.committed) return;
    lockHeld = true;

    // ⑤ 재확인
    const fresh = (await get(ref(db, `rooms/${room}/waiting`))).val() || {};
    if (!fresh[me] || !fresh[partner]) return;

    // ⑥ 원자적 성사
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await update(R(room), {
      [`matches/${id}`]: { p1: me, p2: partner, status: 'playing',
                           createdAt: serverTimestamp(), lastMoveTime: serverTimestamp()
                           /* TODO: 게임별 초기 상태 */ },
      [`players/${me}/currentMatch`]: id,      [`players/${partner}/currentMatch`]: id,
      [`players/${me}/lastOpponent`]: partner, [`players/${partner}/lastOpponent`]: me,
      [`players/${me}/currentOpponent`]: partner, [`players/${partner}/currentOpponent`]: me,
      [`waiting/${me}`]: null,                 [`waiting/${partner}`]: null,
      matchLock: null
    });
    lockHeld = false;
  } catch (e) {
    /* 실패는 정상 — 다음 스냅샷에서 재시도 */
  } finally {
    isMatching = false;
    if (lockHeld) await set(LOCK(room), null).catch(() => {});
  }
}

// ===== 종료 & 정산 =====
async function finishMatchAtomic(id, winner, reason) {
  const res = await runTransaction(M(room, id), cur => {
    if (!cur || cur.status !== 'playing') return;
    cur.status = 'finished'; cur.winner = winner || null; cur.endReason = reason;
    return cur;
  });
  return res.committed;
}

async function settleMatch(id, data) {
  if (!data || data.status !== 'finished' || data.statsApplied) return;
  const res = await runTransaction(ref(db, `rooms/${room}/matches/${id}/statsApplied`),
                                   cur => (cur === true ? undefined : true));
  if (!res.committed) return;

  const valid = data.winner === data.p1 || data.winner === data.p2;
  for (const n of [data.p1, data.p2]) {
    const pRef = P(room, n);
    if (!(await get(pRef)).exists()) continue;            // 강퇴된 학생 부활 금지
    const patch = { currentOpponent: null, total: increment(1) };
    if (valid) patch[n === data.winner ? 'wins' : 'losses'] = increment(1);
    await update(pRef, patch);
  }
}
```

---

## 부록 — 상수 기본값 정리

| 상수 | 가위바위보 | 오목 | 권장 기준 |
|---|---|---|---|
| `HEARTBEAT_MS` | 10,000 | 10,000 | 10초 고정 |
| 매칭 신선도 | (visible 플래그) | 15,000 | 하트비트 × 1.5 |
| 오프라인 판정 | 40,000 | 60,000 | 하트비트 × 4~6 |
| 이탈 유예 / 몰수 | 15,000 (무효) | 65,000 (몰수패) | 한 판 길이의 30~50% |
| 매칭 잠금 TTL | 3,000 | 3,000 | 3초 (왕복 지연 × 5 이상) |
| 탈출 버튼 노출 | 30,000 | — | 평균 한 판 시간 |
| 재대결 허용 | (후보 수 조건) | 20초 | 15~30초 |
| 턴 제한 | 결과 공개 3초 | 30초 | 게임에 맞게 |

---

*정리 대상: `가위바위보.html`, `좌표평면 오목.html` — Firebase RTDB v12.16.0, Bootstrap 5.3.2*