/**

 * ═══════════════════════════════════════════════════════════════════

 *  🏫 우리반 관계지도 — code.gs (서버)

 * ═══════════════════════════════════════════════════════════════════

 *  [흐름]

 *   학생: 학번(숫자 4~5자리, 예: 1630) + 비밀번호 → 처음이면 비밀번호 바꾸기 → 한 장짜리 설문지

 *         ① 우리 반 분위기 5점 척도(+이유 선택)

 *         ② 즐겁게 지내는 친구 ③ 불편한 친구 (고른 친구마다 분류 태그 + 자세한 이유)

 *         이미 제출한 달은 응답을 불러오지 않으며, 교사가 '수정 권한'을 줘야 불러와 고칠 수 있습니다.

 *   교사: 교사 비밀번호 로그인 → 관계지도(지난달과 비교 포함) · 학생 응답(표·엑셀·수정 권한) · 관리(설문 달·명단)

 *

 *  [시트 4개]

 *   학생      : 학생ID · 번호 · 학번 · 이름 · 비밀번호해시 · 초기비번 · 활성

 *   설문월    : 월(yyyy-MM) · 상태(진행중/마감) · 시작일 · 마감예약

 *   관계응답  : 누가 → 누구를, 구분(긍정/부정), 순서, 이유태그, 이유

 *   제출기록  : 학생별 그 달의 학급 분위기 점수 · 분위기 이유 · 수정허용

 *

 *  [온톨로지 추론 규칙]  buildFacts_()  (학생 정보창의 '규칙으로 찾은 관계'에 쓰임)

 *   ① 역관계 ② 상호선택 ③ 엇갈림 ④ 공통 친구(다리 놓기) ⑤ 한방향 선택(연결 기회) ⑥ 지난달과 비교

 *

 *  [파일]  code.gs · index.html(웹 앱) · settings.html(환경설정) · setup.html(DB 세팅)

 * ═══════════════════════════════════════════════════════════════════

 */





/* ─────────────────────────────────────────────────────────────

 * 1. 기본 상수

 * ───────────────────────────────────────────────────────────── */

const APP_TITLE = '우리반 관계지도';

const TEACHER_SESSION_SEC = 21600; // 교사 로그인 유지 6시간



const SH = { STUDENT: '학생', MONTH: '설문월', ANSWER: '관계응답', SUBMIT: '제출기록' };



// 이전 버전에서 쓰던 시트 (전체 초기화 때 정리)

const OBSOLETE_SHEETS = ['관계유형', '설문회차', '관계', '모둠', '관찰기록'];



// 학생 초기 비밀번호의 기본값: [환경설정]에서 '학생 초기 비밀번호'를 등록하지 않았을 때 씁니다.

// 새 학생 · [비밀번호 초기화] · 예시 데이터에 쓰이고, 이 값으로 로그인하면 먼저 비밀번호를 바꿔야 해요.

const FALLBACK_STUDENT_PASSWORD = '1234';

// 학번·비밀번호 규칙

const STUDENT_NO_PATTERN = /^\d{4,5}$/;   // 숫자 4~5자리 (예: 1630)

const PASSWORD_PATTERN = /^\S{4,20}$/;    // 띄어쓰기 없이 4~20자 (영문·숫자·기호 가능)



// 이전 버전에서 쓰던 스크립트 속성 (환경설정 창을 열 때 자동 삭제)

const OBSOLETE_PROPERTIES = ['GEMINI_API_KEY'];



// 관계응답 시트의 '구분' 값

const POL = { POS: '긍정', NEG: '부정' };



/**

 * 설문 문항 — 여기만 고치면 학생 화면이 바뀝니다.

 *  climate   : 1번 학급 분위기 5점 척도 (이유는 선택) — 설문의 첫 문항

 *  questions : 친구를 고르고, 고른 친구마다 분류 태그(1개 이상)와 자세한 이유(직접 입력)를 받는 문항 (2~3번)

 *  alertTags / alertWords: 이 태그를 고르거나 글에 이 낱말이 있으면 교사 화면 '세심한 확인' 표에 올라옵니다.

 */

const SURVEY_CONFIG = {

  questions: [

    { key: 'positive', pol: POL.POS, max: 3,

      title: '요즘 나와 즐겁게 지내는 친구는 누구인가요?',

      help: '함께 놀거나, 도와주거나, 이야기가 잘 통하는 친구를 골라요.',

      tags: ['함께 놀아요', '잘 도와줘요', '이야기가 잘 통해요', '친절하고 배려해요', '같이 있으면 즐거워요', '공부를 함께해요', '기타'],

      reasonLabel: '{name} 친구와 즐겁게 지낸다고 생각한 이유', placeholder: '예: 쉬는 시간마다 같이 놀고 이야기가 잘 통해요' },

    { key: 'negative', pol: POL.NEG, max: 2,

      title: '요즘 함께 있을 때 마음이 불편하거나 속상한 친구가 있나요?',

      help: '없다면 고르지 않고 넘어가도 괜찮아요.',

      note: '이 답은 선생님만 볼 수 있어요. 친구를 탓하려는 질문이 아니라, 모두가 편안한 교실을 만들기 위한 질문이에요.',

      tags: ['말 때문에 속상했어요', '놀리거나 장난이 심해요', '다툰 일이 있었어요', '나를 따돌리는 것 같아요', '함께 있으면 불편해요', '약속을 잘 안 지켜요', '기타'],

      reasonLabel: '{name} 친구와 있을 때 불편하거나 속상했던 이유', placeholder: '어떤 일이 있었는지 편하게 적어 주세요' }

  ],

  climate: {

    question: '지금까지 우리 반의 전반적인 분위기는 몇 점인가요?',

    scale: [

      { v: 5, label: '마음에 들고 활기차다' },

      { v: 4, label: '대체로 괜찮은 편이다' },

      { v: 3, label: '그저 그렇다' },

      { v: 2, label: '마음에 별로 안든다' },

      { v: 1, label: '교실에 있으면 불편하거나 불안하다' }

    ],

    reasonLabel: '그렇게 생각한 이유 (선택)',

    placeholder: '쓰지 않아도 괜찮아요'

  },

  reasonMax: 200,

  alertTags: ['나를 따돌리는 것 같아요', '말 때문에 속상했어요'],

  alertWords: ['따돌', '왕따', '괴롭', '때리', '때려', '맞았', '욕을', '욕해', '놀려', '놀림', '협박', '빼앗', '뺏', '죽고', '죽을', '자해', '사라지고']

};







/* ─────────────────────────────────────────────────────────────

 * 2. 스크립트 속성(민감 정보) 목록

 *    이 배열에 항목을 추가하면 [환경설정] 화면의 단계와 입력칸이 자동으로 늘어납니다.

 * ───────────────────────────────────────────────────────────── */

const APP_PROPERTIES = [

  {

    key: 'TEACHER_PIN',

    label: '교사 비밀번호',

    type: 'password',

    required: true,

    step: 1,

    hint: '웹 앱의 [교사] 로그인에서 입력해요. 띄어쓰기 없이 4~20자로 영문·숫자·기호를 쓸 수 있어요. 학생에게는 알려주지 마세요.',

    docUrl: '',

    placeholder: '예: class2026!',

    pattern: '^\\S{4,20}$',

    patternMessage: '띄어쓰기 없이 4~20자로 입력하세요.',

    testable: false

  },

  {

    key: 'STUDENT_DEFAULT_PASSWORD',

    label: '학생 초기 비밀번호',

    type: 'password',

    required: false,

    step: 2,

    hint: '학생을 추가하거나 [비밀번호 초기화]를 누를 때 쓰는 비밀번호예요. 학생은 이 값으로 처음 로그인한 뒤 자기 비밀번호로 바꿔요. 등록하지 않으면 1234를 써요. 바꾸면 그 뒤에 추가·초기화하는 학생부터 적용돼요.',

    docUrl: '',

    placeholder: '예: 0000',

    pattern: '^\\S{4,20}$',

    patternMessage: '띄어쓰기 없이 4~20자로 입력하세요.',

    testable: false

  }

];



/* ─────────────────────────────────────────────────────────────

 * 3. 시트(DB) 스키마

 * ───────────────────────────────────────────────────────────── */

const SHEET_SCHEMA = [

  {

    name: SH.STUDENT, tabColor: '#6B5BD6',

    headers: ['학생ID', '번호', '학번', '이름', '비밀번호해시', '초기비번', '활성'],

    textCols: ['학생ID', '학번', '비밀번호해시'], checkCols: ['초기비번', '활성'], lists: {},

    dummy: () => dummyStudents_()

  },

  {

    name: SH.MONTH, tabColor: '#F0CF5C',

    headers: ['월', '상태', '시작일', '마감예약'],

    textCols: ['월', '시작일', '마감예약'], checkCols: [], lists: { '상태': ['진행중', '마감'] },

    dummy: () => DUMMY_MONTHS

  },

  {

    name: SH.ANSWER, tabColor: '#24493D',

    headers: ['응답ID', '월', '학생ID', '대상ID', '구분', '순서', '이유태그', '이유', '기록일시'],

    textCols: ['응답ID', '월', '학생ID', '대상ID', '기록일시'], checkCols: [],

    lists: { '구분': [POL.POS, POL.NEG] },

    dummy: () => dummyAnswers_()

  },

  {

    name: SH.SUBMIT, tabColor: '#9AD0EC',

    headers: ['월', '학생ID', '학급분위기', '분위기이유', '제출일시', '수정허용'],

    textCols: ['월', '학생ID', '제출일시'], checkCols: ['수정허용'], lists: {},

    dummy: () => dummySubmits_()

  }

];





/* ─────────────────────────────────────────────────────────────

 * 4. 예시(Dummy) 데이터 — 9월(마감) · 10월(진행 중)

 *    10월 변화: 류현우(S19)에게 새 친구 · 전소율(S20)을 향한 불편 응답 감소

 *              임수아(S10)의 속상함 해소 · 오지아(S12)↔강지우(S06) 새 갈등

 * ───────────────────────────────────────────────────────────── */

const DUMMY_NAMES = ['김민준', '이서연', '박지호', '최하윤', '정도윤', '강지우', '조서준', '윤하은', '장예준', '임수아',

                     '한시우', '오지아', '서주원', '신채원', '권건우', '황다은', '안우진', '송유나', '류현우', '전소율'];

const DUMMY_MONTHS = [['2026-09', '마감', '2026-09-07', ''], ['2026-10', '진행중', '2026-10-05', '']];

const DUMMY_POS_SEP = {

  S01: ['S05', 'S07', 'S17'], S02: ['S04', 'S08', 'S10'], S03: ['S09', 'S13', 'S01'], S04: ['S02', 'S10', 'S08'],

  S05: ['S01', 'S11', 'S07'], S06: ['S12', 'S14', 'S17'], S07: ['S05', 'S01', 'S11'], S08: ['S02', 'S04', 'S17'],

  S09: ['S03', 'S15', 'S13'], S10: ['S04', 'S02', 'S06'], S11: ['S07', 'S05', 'S01'], S12: ['S06', 'S16', 'S14'],

  S13: ['S09', 'S03', 'S15'], S14: ['S16', 'S12', 'S06'], S15: ['S13', 'S09', 'S03'], S16: ['S14', 'S18', 'S12'],

  S17: ['S01', 'S08', 'S06'], S18: ['S16', 'S14', 'S12'], S19: ['S03', 'S09'], S20: ['S17', 'S05', 'S01']

};

// [이유태그, 이유]

const DUMMY_POS_TEXT = [[['함께 놀아요'], '쉬는 시간마다 같이 놀아요'], [['잘 도와줘요'], '모르는 문제를 친절하게 알려줘요'],

                        [['이야기가 잘 통해요'], '좋아하는 게 같아서 이야기가 잘 통해요'], [['친절하고 배려해요'], '힘들 때 먼저 말을 걸어줘요'],

                        [['같이 있으면 즐거워요'], '같이 있으면 웃을 일이 많아요'], [['공부를 함께해요', '잘 도와줘요'], '모둠 활동을 할 때 손발이 잘 맞아요'],

                        [['함께 놀아요'], '점심시간에 같이 운동해요'], [['이야기가 잘 통해요', '친절하고 배려해요'], '내 이야기를 잘 들어줘요']];

// 아래 목록은 [응답학생, 대상, 이유] — 이유태그는 dummyTag_()가 문항별 첫 낱말로 정합니다.

// [응답학생, 대상, 이유]

const DUMMY_NEG_SEP = [

  ['S01', 'S20', '장난이 심하고 자꾸 놀려요'],

  ['S02', 'S20', '같이 있으면 말을 함부로 해서 불편해요'],

  ['S03', 'S17', '제 말을 잘 안 들어줘요'],

  ['S05', 'S20', '체육 시간에 다퉜어요'],

  ['S07', 'S20', '장난이 너무 심해요'],

  ['S10', 'S12', '체육 시간에 못한다고 놀려서 속상했어요'],

  ['S11', 'S20', '약속을 잘 안 지켜요'],

  ['S12', 'S17', '자기 마음대로만 하려고 해요'],

  ['S14', 'S17', '같이 있으면 조금 불편해요'],

  ['S17', 'S20', '모둠 활동 때 다퉜어요']

];

const DUMMY_NEG_OCT = [

  ['S02', 'S20', '아직 말을 함부로 할 때가 있어요'],

  ['S03', 'S17', '같이 있으면 조금 불편해요'],

  ['S07', 'S20', '장난이 심해요'],

  ['S11', 'S20', '약속을 잘 안 지켜요'],

  ['S12', 'S17', '자기 마음대로만 하려고 해요'],

  ['S12', 'S06', '모둠 활동 때 의견이 달라서 싸웠어요'],

  ['S14', 'S17', '같이 있으면 조금 불편해요'],

  ['S17', 'S20', '다툰 뒤로 어색해요']

];

const DUMMY_OCT_SKIP = ['S16', 'S18', 'S20'];

// 학급 분위기 점수 (학생 순서대로, 10월 미응답은 0)

const DUMMY_CLIMATE_SEP = [4, 4, 3, 4, 4, 4, 5, 4, 3, 2, 4, 3, 4, 4, 3, 4, 4, 3, 2, 1];

const DUMMY_CLIMATE_OCT = [4, 5, 4, 4, 4, 2, 4, 4, 4, 4, 4, 3, 4, 4, 4, 0, 5, 0, 4, 0];

const DUMMY_CLIMATE_REASON = {

  '2026-09': { S10: '체육 시간에 놀림을 받아서 조금 싫어요', S19: '같이 놀 친구가 별로 없어요', S20: '쉬는 시간에 교실에 있으면 불편할 때가 많아요', S07: '다들 재미있게 지내요' },

  '2026-10': { S06: '요즘 모둠에서 다툼이 있어서 교실이 불편해요', S19: '친구가 생겨서 좋아요', S02: '학급 회의 뒤로 분위기가 좋아졌어요' }

};





/** 예시 학생: 학번 1601~1620, 비밀번호는 모두 학생 초기 비밀번호(해시로 저장, 첫 로그인 때 바꾸게 됨) */

function dummyStudents_() {

  const h = hashPw_(studentDefaultPassword_());

  return DUMMY_NAMES.map((name, i) => ['S' + pad2_(i + 1), i + 1, '16' + pad2_(i + 1), name, h, true, true]);

}



/** 예시 이유 글에 어울리는 분류 태그 고르기 (예시 데이터 전용) */

function dummyTag_(pol, text) {

  const rules = {};

  rules[POL.NEG] = [['놀려', '놀리거나 장난이 심해요'], ['장난', '놀리거나 장난이 심해요'], ['다퉜', '다툰 일이 있었어요'], ['싸웠', '다툰 일이 있었어요'], ['다툰', '다툰 일이 있었어요'],

                    ['약속', '약속을 잘 안 지켜요'], ['함부로', '말 때문에 속상했어요'], ['못한다고', '말 때문에 속상했어요'], ['', '함께 있으면 불편해요']];

  const hit = (rules[pol] || []).filter(r => text.indexOf(r[0]) >= 0)[0];

  return hit ? [hit[1]] : ['기타'];

}



function dummyOctPositive_() {

  const p = JSON.parse(JSON.stringify(DUMMY_POS_SEP));

  DUMMY_OCT_SKIP.forEach(s => delete p[s]);

  p.S03 = ['S09', 'S13', 'S19'];

  p.S09 = ['S03', 'S19', 'S15'];

  p.S19 = ['S03', 'S09', 'S15'];

  p.S10 = ['S04', 'S02', 'S12'];

  p.S06 = ['S14', 'S17', 'S10'];

  return p;

}



function dummyAnswers_() {

  const rows = [];

  let seq = 1;

  const id = () => 'A' + ('0000' + seq++).slice(-5);

  const addList = (month, pol, list, day) => {

    const order = {};

    list.forEach(n => {

      order[n[0]] = (order[n[0]] || 0) + 1;

      rows.push([id(), month, n[0], n[1], pol, order[n[0]], dummyTag_(pol, n[2]).join(', '), n[2], day + ' 09:30']);

    });

  };

  const addMonth = (month, posMap, neg, day) => {

    Object.keys(posMap).forEach((s, si) => posMap[s].forEach((o, i) => {

      const t = DUMMY_POS_TEXT[(si * 3 + i) % DUMMY_POS_TEXT.length];

      rows.push([id(), month, s, o, POL.POS, i + 1, t[0].join(', '), t[1], day + ' 09:' + pad2_(si)]);

    }));

    addList(month, POL.NEG, neg, day);

  };

  addMonth('2026-09', DUMMY_POS_SEP, DUMMY_NEG_SEP, '2026-09-08');

  addMonth('2026-10', dummyOctPositive_(), DUMMY_NEG_OCT, '2026-10-06');

  return rows;

}



function dummySubmits_() {

  const rows = [];

  DUMMY_NAMES.forEach((_, i) => {

    const s = 'S' + pad2_(i + 1);

    rows.push(['2026-09', s, DUMMY_CLIMATE_SEP[i], DUMMY_CLIMATE_REASON['2026-09'][s] || '', '2026-09-08 09:40', false]);

    if (DUMMY_OCT_SKIP.indexOf(s) < 0) rows.push(['2026-10', s, DUMMY_CLIMATE_OCT[i], DUMMY_CLIMATE_REASON['2026-10'][s] || '', '2026-10-06 09:40', false]);

  });

  return rows;

}





/* ─────────────────────────────────────────────────────────────

 * 5. 시트 메뉴 · 웹 앱 진입점

 * ───────────────────────────────────────────────────────────── */

function onOpen() {

  SpreadsheetApp.getUi()

    .createMenu('🌌 관계지도')

    .addItem('🗂️ DB 세팅 및 초기화', 'showSetupDialog')

    .addItem('🔐 환경설정 (비밀번호)', 'showSettingsDialog')

    .addToUi();

}



function doGet() {

  return HtmlService.createHtmlOutputFromFile('index')

    .setTitle(APP_TITLE)

    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')

    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

}



function showSetupDialog() {

  const html = HtmlService.createHtmlOutputFromFile('setup').setWidth(780).setHeight(680);

  SpreadsheetApp.getUi().showModalDialog(html, '🗂️ DB 세팅 및 초기화');

}



function showSettingsDialog() {

  // 이전 버전에서 쓰던 속성(예: Gemini API 키)은 창을 열 때 자동으로 지웁니다.

  const props = PropertiesService.getScriptProperties();

  OBSOLETE_PROPERTIES.forEach(k => { if (props.getProperty(k)) props.deleteProperty(k); });

  const html = HtmlService.createHtmlOutputFromFile('settings').setWidth(600).setHeight(640);

  SpreadsheetApp.getUi().showModalDialog(html, '🔐 환경설정');

}



/** 보안 장치: 시트 메뉴에서 연 창에서만 실행 (웹 앱에서는 getUi()가 예외를 던짐) */

function assertSheetContext_() {

  try { SpreadsheetApp.getUi(); }

  catch (e) { throw new Error('이 기능은 구글 시트의 [🌌 관계지도] 메뉴에서만 사용할 수 있습니다.'); }

}





/* ─────────────────────────────────────────────────────────────

 * 6. DB 세팅 및 초기화

 * ───────────────────────────────────────────────────────────── */

/**

 * 시트 구조 점검 (아무것도 바꾸지 않음)

 *  sheets[]: { name, exists, dataRows, headers, expected, status(ok|fix|missing), tasks[], warnings[] }

 *   - tasks    : [안전 세팅]을 누르면 할 일

 *   - warnings : 교사가 직접 확인할 것 (학번 형식·중복, 비밀번호 없는 학생, 진행 중인 달이 둘 이상 등)

 */

function diagnoseDatabase() {

  assertSheetContext_();

  const ss = SpreadsheetApp.getActive();

  const sheets = SHEET_SCHEMA.map(s => {

    const sh = ss.getSheetByName(s.name);

    if (!sh) return { name: s.name, exists: false, dataRows: 0, headers: [], expected: s.headers.slice(), status: 'missing', tasks: ['시트를 새로 만들고 예시 데이터를 채워요'], warnings: [] };

    const lastCol = sh.getLastColumn();

    const headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim()).filter(Boolean) : [];

    const dataRows = Math.max(0, sh.getLastRow() - 1);

    const missing = s.headers.filter(h => headers.indexOf(h) < 0);

    const tasks = [];

    if (sh.getLastRow() === 0) tasks.push('빈 시트에 머리 줄과 예시 데이터를 채워요');

    else if (missing.length) tasks.push('빠진 열을 오른쪽 끝에 추가해요: ' + missing.join(', '));

    const warnings = diagnoseWarnings_(s.name, sh, headers);

    return { name: s.name, exists: true, dataRows: dataRows, headers: headers, expected: s.headers.slice(), status: tasks.length ? 'fix' : 'ok', tasks: tasks, warnings: warnings };

  });

  return {

    sheets: sheets,

    obsolete: OBSOLETE_SHEETS.filter(n => ss.getSheetByName(n)),

    adminPasswordRegistered: !!getAppProperty_('TEACHER_PIN'),

    studentPasswordRegistered: !!getAppProperty_('STUDENT_DEFAULT_PASSWORD')

  };

}



/** 시트별로 교사가 직접 확인할 것 */

function diagnoseWarnings_(name, sh, headers) {

  const w = [];

  if (sh.getLastRow() < 2) return w;

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues();

  const col = h => headers.indexOf(h);

  if (name === SH.STUDENT) {

    const cNo = col('학번'), cName = col('이름'), cHash = col('비밀번호해시'), cAct = col('활성');

    const rows = values.filter(r => cName >= 0 && cellStr_(r[cName]) && (cAct < 0 || bool_(r[cAct], true)));

    if (cNo >= 0) {

      const bad = rows.filter(r => !STUDENT_NO_PATTERN.test(cellStr_(r[cNo]))).map(r => cellStr_(r[cName]));

      if (bad.length) w.push('학번이 숫자 4~5자리가 아닌 학생 ' + bad.length + '명: ' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? ' 등' : '') + ' (웹 앱 관리 탭에서 고쳐 주세요)');

      const seen = {}, dup = [];

      rows.forEach(r => { const no = cellStr_(r[cNo]); if (no && seen[no]) dup.push(no); seen[no] = true; });

      if (dup.length) w.push('학번이 겹치는 학생이 있어요: ' + [...new Set(dup)].join(', '));

    }

    if (cHash >= 0) {

      const noPw = rows.filter(r => !cellStr_(r[cHash])).length;

      if (noPw) w.push('비밀번호가 없는 학생 ' + noPw + '명 (웹 앱 관리 탭 명단에서 [비밀번호 초기화]를 눌러 초기 비밀번호를 정해 주세요)');

    }

  }

  if (name === SH.MONTH) {

    const cSt = col('상태');

    const open = cSt >= 0 ? values.filter(r => cellStr_(r[cSt]) === '진행중').length : 0;

    if (open > 1) w.push('진행 중인 달이 ' + open + '개예요. 학생은 가장 최근 달에만 응답해요.');

  }

  return w;

}



/**

 * DB 세팅 실행

 * @param {string} mode 'safe' = 없는 시트·열만 추가 / 'reset' = 모두 지우고 예시 데이터 + 옛 시트 정리

 * @param {boolean} withBackup 실행 전에 같은 파일 안에 '백업_시트명_날짜' 탭으로 복사

 * @return {logs: string[]}

 */

function runDatabaseSetup(mode, withBackup) {

  assertSheetContext_();

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {

    const ss = SpreadsheetApp.getActive();

    const logs = [];

    if (withBackup) {

      const stamp = nowStr_('yyMMdd_HHmm');

      SHEET_SCHEMA.forEach(s => {

        const sh = ss.getSheetByName(s.name);

        if (!sh || sh.getLastRow() === 0) return;

        const copy = sh.copyTo(ss).setName(('백업_' + s.name + '_' + stamp).slice(0, 90));

        copy.setTabColor('#B8C3BE');

        logs.push('[' + s.name + '] 백업 탭 \'' + copy.getName() + '\'을(를) 만들었어요');

      });

    }

    SHEET_SCHEMA.forEach(s => {

      let sh = ss.getSheetByName(s.name);

      const isNew = !sh;

      if (isNew) sh = ss.insertSheet(s.name);

      if (mode === 'reset' || isNew || sh.getLastRow() === 0) {

        writeSheetWithDummy_(sh, s);

        logs.push('[' + s.name + '] ' + (isNew ? '새로 만들고' : mode === 'reset' ? '모두 지우고' : '빈 시트에') + ' 예시 데이터 ' + (sh.getLastRow() - 1) + '행을 채웠어요');

      } else {

        const lastCol = Math.max(1, sh.getLastColumn());

        const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

        const missing = s.headers.filter(h => header.indexOf(h) < 0);

        if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);

        // 텍스트로 고정할 열(학번 등)의 서식을 다시 맞춤

        const all = header.concat(missing);

        s.textCols.forEach(h => { const c = all.indexOf(h) + 1; if (c > 0) sh.getRange(2, c, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('@'); });

        styleHeader_(sh, s, all.length);

        logs.push('[' + s.name + '] ' + (missing.length ? '빠진 열을 추가했어요: ' + missing.join(', ') : '바꿀 구조가 없어 서식만 다시 맞췄어요'));

      }

    });

    if (mode === 'reset') {

      OBSOLETE_SHEETS.forEach(n => {

        const sh = ss.getSheetByName(n);

        if (sh && ss.getSheets().length > 1) { ss.deleteSheet(sh); logs.push('[' + n + '] 이전 버전 시트라 삭제했어요'); }

      });

      logs.push('예시 학생은 학번 1601~1620이고, 비밀번호는 [환경설정]의 학생 초기 비밀번호(등록하지 않았다면 ' + FALLBACK_STUDENT_PASSWORD + ')예요.');

    }

    ['Sheet1', '시트1'].forEach(n => {

      const sh = ss.getSheetByName(n);

      if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);

    });

    return { logs: logs };

  } finally {

    lock.releaseLock();

  }

}



function writeSheetWithDummy_(sh, schema) {

  sh.clear();

  sh.getDataRange().clearDataValidations();

  const rows = schema.dummy();

  const width = schema.headers.length;

  const need = rows.length + 200;

  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());

  const maxRows = sh.getMaxRows();

  schema.textCols.forEach(h => {

    const c = schema.headers.indexOf(h) + 1;

    if (c > 0) sh.getRange(2, c, maxRows - 1, 1).setNumberFormat('@');

  });

  sh.getRange(1, 1, 1, width).setValues([schema.headers]);

  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);

  schema.checkCols.forEach(h => {

    const c = schema.headers.indexOf(h) + 1;

    if (c > 0 && rows.length) sh.getRange(2, c, rows.length, 1).insertCheckboxes();

  });

  Object.keys(schema.lists).forEach(h => {

    const c = schema.headers.indexOf(h) + 1;

    if (c > 0) sh.getRange(2, c, maxRows - 1, 1).setDataValidation(

      SpreadsheetApp.newDataValidation().requireValueInList(schema.lists[h], true).setAllowInvalid(true).build());

  });

  styleHeader_(sh, schema, width);

}



function styleHeader_(sh, schema, width) {

  sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#24493D').setFontColor('#F3F0E4');

  sh.setFrozenRows(1);

  sh.setTabColor(schema.tabColor);

  try { sh.autoResizeColumns(1, width); } catch (e) { /* 무시 */ }

}





/* ─────────────────────────────────────────────────────────────

 * 7. 스크립트 속성(환경설정) 헬퍼

 * ───────────────────────────────────────────────────────────── */

function findPropDef_(key) { return APP_PROPERTIES.filter(p => p.key === key)[0] || null; }



/** [서버 전용] 원본 값 조회 */

function getAppProperty_(key) { return PropertiesService.getScriptProperties().getProperty(key) || ''; }



function maskValue_(v) {

  v = String(v || '');

  if (!v) return '';

  if (v.length <= 8) return '•'.repeat(v.length);

  return v.slice(0, 4) + '••••••••' + v.slice(-4);

}



/** 설정 화면에 보낼 한 항목의 상태 (원본 값 대신 '등록 여부 + 마스킹 값'만) */

function propStatus_(p) {

  const v = PropertiesService.getScriptProperties().getProperty(p.key) || '';

  return {

    key: p.key, label: p.label, type: p.type, required: p.required, step: p.step, hint: p.hint,

    docUrl: p.docUrl || '', placeholder: p.placeholder || '', pattern: p.pattern || '', patternMessage: p.patternMessage || '',

    testable: !!p.testable, registered: !!v, masked: maskValue_(v)

  };

}



/** 값 저장 (환경설정 창 전용) */

function saveAppProperty(key, value) {

  assertSheetContext_();

  const def = findPropDef_(key);

  if (!def) return { success: false, message: '알 수 없는 설정 항목이에요.' };

  const v = String(value == null ? '' : value).trim();

  if (!v) return { success: false, message: '값을 입력해 주세요.' };

  if (def.pattern && !new RegExp(def.pattern).test(v)) return { success: false, message: def.patternMessage || ('형식이 올바르지 않아요. 예: ' + def.placeholder) };

  PropertiesService.getScriptProperties().setProperty(key, v);

  return { success: true, message: def.label + '을(를) 저장했어요.', status: propStatus_(def) };

}



/** 값 삭제 (환경설정 창 전용) */

function deleteAppProperty(key) {

  assertSheetContext_();

  const def = findPropDef_(key);

  if (!def) return { success: false, message: '알 수 없는 설정 항목이에요.' };

  PropertiesService.getScriptProperties().deleteProperty(key);

  return { success: true, message: def.label + '을(를) 삭제했어요.', status: propStatus_(def) };

}



/** 설정 화면용 목록 */

function getPropertyStatus() {

  assertSheetContext_();

  return APP_PROPERTIES.slice().sort((a, b) => a.step - b.step).map(propStatus_);

}



/** 위저드용 진행 현황 (아직 등록하지 않은 필수 항목의 단계부터 이어서) */

function getSetupProgress() {

  const items = getPropertyStatus();

  const missing = items.filter(i => i.required && !i.registered);

  return {

    total: items.length, done: items.filter(i => i.registered).length,

    requiredMissing: missing.map(i => i.key), nextStep: missing.length ? missing[0].step : null

  };

}



/** [연결 테스트] — 지금은 외부 API를 쓰지 않으므로 지원하는 항목이 없습니다. */

function testConnection(key) {

  assertSheetContext_();

  return { success: false, message: '이 항목은 연결 테스트를 지원하지 않아요.' };

}



/** [서버 전용] 학생 초기 비밀번호: [환경설정] 값, 없으면 1234 */

function studentDefaultPassword_() {

  return getAppProperty_('STUDENT_DEFAULT_PASSWORD') || FALLBACK_STUDENT_PASSWORD;

}



/* ─────────────────────────────────────────────────────────────

 * 8. 학생 비밀번호 (해시 저장)

 *    시트에는 원래 비밀번호가 아니라 "무작위 salt + 비밀번호"의 SHA-256 값만 저장합니다.

 *    salt는 처음 한 번 자동 생성되어 스크립트 속성(PASSWORD_SALT)에 보관됩니다.

 * ───────────────────────────────────────────────────────────── */

function getSalt_() {

  const props = PropertiesService.getScriptProperties();

  let salt = props.getProperty('PASSWORD_SALT');

  if (!salt) { salt = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PASSWORD_SALT', salt); }

  return salt;

}

function hashPw_(pw) {

  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, getSalt_() + '|' + String(pw), Utilities.Charset.UTF_8);

  return Utilities.base64Encode(bytes);

}





/* ─────────────────────────────────────────────────────────────

 * 9. 공통 유틸

 * ───────────────────────────────────────────────────────────── */

function tz_() { return Session.getScriptTimeZone(); }

function nowStr_(fmt) { return Utilities.formatDate(new Date(), tz_(), fmt || 'yyyy-MM-dd HH:mm'); }

function pad2_(n) { return ('0' + n).slice(-2); }

function round1_(n) { return Math.round(n * 10) / 10; }

function newId_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }

function esc_(s) { return String(s == null ? '' : s); }

function bool_(v, def) {

  if (v === '' || v === null || v === undefined) return !!def;

  return v === true || String(v).trim().toUpperCase() === 'TRUE';

}

function cellStr_(v, withTime) {

  if (v instanceof Date) return Utilities.formatDate(v, tz_(), withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');

  return v === null || v === undefined ? '' : String(v).trim();

}

/** 월 값 정규화: 시트가 날짜로 바꿔도 'yyyy-MM'으로 되돌림 */

function monthStr_(v) {

  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM');

  return String(v == null ? '' : v).trim().slice(0, 7);

}

function monthLabel_(m) { return m ? m.slice(0, 4) + '년 ' + Number(m.slice(5, 7)) + '월' : ''; }



function sheet_(name) {

  const sh = SpreadsheetApp.getActive().getSheetByName(name);

  if (!sh) throw new Error('DB_MISSING');

  return sh;

}



function readTable_(name) {

  const values = sheet_(name).getDataRange().getValues();

  if (!values.length) return { headers: [], rows: [] };

  const headers = values[0].map(h => String(h).trim());

  const rows = [];

  for (let r = 1; r < values.length; r++) {

    if (values[r].every(c => c === '' || c === null)) continue;

    const obj = { _row: r + 1 };

    headers.forEach((h, i) => { if (h) obj[h] = values[r][i]; });

    rows.push(obj);

  }

  return { headers: headers, rows: rows };

}



function appendObjects_(name, objs) {

  if (!objs.length) return;

  const sh = sheet_(name);

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());

  const data = objs.map(o => headers.map(h => (o[h] !== undefined ? o[h] : '')));

  const start = sh.getLastRow() + 1;

  ['월', '날짜', '학생ID', '대상ID', '관련학생ID', '학번', '비밀번호해시'].forEach(h => {

    const c = headers.indexOf(h) + 1;

    if (c > 0) sh.getRange(start, c, data.length, 1).setNumberFormat('@');

  });

  sh.getRange(start, 1, data.length, headers.length).setValues(data);

}



function removeRows_(name, predicate) {

  const sh = sheet_(name);

  const values = sh.getDataRange().getValues();

  if (values.length < 2) return 0;

  const headers = values[0].map(h => String(h).trim());

  const keep = [];

  let removed = 0;

  for (let r = 1; r < values.length; r++) {

    const obj = {};

    headers.forEach((h, i) => { obj[h] = values[r][i]; });

    if (predicate(obj)) removed++; else keep.push(values[r]);

  }

  if (!removed) return 0;

  sh.getRange(2, 1, values.length - 1, headers.length).clearContent();

  if (keep.length) sh.getRange(2, 1, keep.length, headers.length).setValues(keep);

  return removed;

}



function setCell_(name, rowNum, headers, header, value, asText) {

  const c = headers.indexOf(header) + 1;

  if (c <= 0) return;

  const rg = sheet_(name).getRange(rowNum, c);

  if (asText) rg.setNumberFormat('@');

  rg.setValue(value);

}



/** 마감예약 'yyyy-MM-dd HH:mm' → Date (형식이 틀리면 null) */

function parseSchedule_(s) {

  s = String(s || '').trim();

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return null;

  try { return Utilities.parseDate(s, tz_(), 'yyyy-MM-dd HH:mm'); } catch (e) { return null; }

}



/** 모든 시트를 읽어 데이터 모델로 (비밀번호 해시는 서버 안에서만 사용) */

function loadModel_() {

  const s = v => cellStr_(v);

  const tags = v => s(v).split(',').map(x => x.trim()).filter(Boolean);

  const now = new Date();

  return {

    students: readTable_(SH.STUDENT).rows.map(r => ({

      id: s(r['학생ID']), number: Number(r['번호']) || 0, studentNo: s(r['학번']), name: s(r['이름']),

      hash: s(r['비밀번호해시']), initPw: bool_(r['초기비번'], false), active: bool_(r['활성'], true), _row: r._row

    })).filter(x => x.id && x.name).sort((a, b) => (a.studentNo || '').localeCompare(b.studentNo || '', 'ko', { numeric: true }) || a.number - b.number),   // 학번 순

    // 마감예약 시각이 지난 '진행중' 달은 자동으로 '마감'으로 취급합니다.

    months: readTable_(SH.MONTH).rows.map(r => {

      const closeAt = cellStr_(r['마감예약'], true);

      const due = parseSchedule_(closeAt);

      const raw = s(r['상태']) || '마감';

      return { month: monthStr_(r['월']), status: raw === '진행중' && due && due <= now ? '마감' : raw, start: s(r['시작일']), closeAt: due ? closeAt : '', _row: r._row };

    }).filter(x => /^\d{4}-\d{2}$/.test(x.month)).sort((a, b) => a.month.localeCompare(b.month)),

    // 즐거움·불편 응답만 읽습니다. (이전 버전의 칭찬·도움필요 응답은 무시)

    answers: readTable_(SH.ANSWER).rows.map(r => ({

      month: monthStr_(r['월']), s: s(r['학생ID']), o: s(r['대상ID']), pol: s(r['구분']) || POL.POS,

      rank: Number(r['순서']) || 1, tags: tags(r['이유태그']), text: s(r['이유'])

    })).filter(x => x.month && x.s && x.o && x.s !== x.o && (x.pol === POL.POS || x.pol === POL.NEG)),

    submits: readTable_(SH.SUBMIT).rows.map(r => ({

      month: monthStr_(r['월']), s: s(r['학생ID']), climate: Number(r['학급분위기']) || '',

      climateReason: s(r['분위기이유']), at: cellStr_(r['제출일시'], true),

      editAllowed: bool_(r['수정허용'], false), _row: r._row

    })).filter(x => x.month && x.s)

  };

}



function friendlyError_(e) {

  const msg = String((e && e.message) || e);

  if (msg.indexOf('AUTH:') >= 0) throw e;

  if (msg === 'DB_MISSING') return { ok: false, message: '데이터베이스가 아직 준비되지 않았어요. 구글 시트 상단 [🌌 관계지도] > [DB 세팅 및 초기화]를 먼저 실행해 주세요.' };

  return { ok: false, message: '처리 중 문제가 생겼어요: ' + msg };

}





/* ─────────────────────────────────────────────────────────────

 * 10. 학생 설문 API (학번 + 비밀번호)

 * ───────────────────────────────────────────────────────────── */



/**

 * 학번·비밀번호 확인 (학번마다 5번 틀리면 10분 잠금).

 * needMonth=true면 진행 중인 설문 달도 함께 찾습니다.

 */

function checkStudent_(studentNo, pw, needMonth) {

  studentNo = String(studentNo || '').trim();

  pw = String(pw || '').trim();

  if (!STUDENT_NO_PATTERN.test(studentNo)) return { error: '학번은 숫자 4~5자리로 입력해 주세요. (예: 3101)' };

  if (!PASSWORD_PATTERN.test(pw)) return { error: '비밀번호를 띄어쓰기 없이 입력해 주세요.' };

  const cache = CacheService.getScriptCache();

  const k = 'pwfail_' + studentNo;

  const fails = Number(cache.get(k) || 0), all = Number(cache.get('pwfail_all') || 0);

  if (fails >= 5) return { error: '비밀번호를 5번 틀려서 10분 동안 잠겼어요. 잠시 후 다시 시도하거나 선생님께 문의해 주세요.' };

  if (all >= 60) return { error: '입력 시도가 너무 많아요. 10분 뒤에 다시 시도해 주세요.' };

  const m = loadModel_();

  const me = m.students.filter(x => x.active && x.studentNo === studentNo)[0];

  if (!me || !me.hash || hashPw_(pw) !== me.hash) {

    cache.put(k, String(fails + 1), 600);

    cache.put('pwfail_all', String(all + 1), 600);

    return { error: '학번이나 비밀번호가 맞지 않아요. 비밀번호를 잊었다면 선생님께 초기화를 부탁해 주세요.' };

  }

  cache.remove(k);

  // 초기 비밀번호로 들어오면 먼저 자기 비밀번호로 바꾸게 합니다.

  if (me.initPw || pw === studentDefaultPassword_()) return { mustChange: true, m: m, me: me };

  if (!needMonth) return { m: m, me: me };

  const open = m.months.filter(x => x.status === '진행중');

  if (!open.length) return { error: '지금은 설문 기간이 아니에요. 선생님께 문의해 주세요.' };

  const mo = open[open.length - 1];

  return { m: m, me: me, month: mo.month, closeAt: mo.closeAt };

}



/** 이번 달 이 학생의 제출 상태: { submitted, editAllowed, sub } */

function submitState_(m, month, sid) {

  const sub = m.submits.filter(x => x.month === month && x.s === sid)[0];

  const submitted = !!sub || m.answers.some(a => a.month === month && a.s === sid);

  return { submitted: submitted, editAllowed: !!(sub && sub.editAllowed), sub: sub };

}



/**

 * 설문 입장

 *  - 처음 제출: 빈 설문지

 *  - 이미 제출: 학생 정보 보호를 위해 답을 불러오지 않고 막습니다.

 *  - 교사가 수정 권한을 준 경우에만 지난 답을 불러와 고칠 수 있습니다.

 */

function enterSurvey(studentNo, pw) {

  try {

    const ctx = checkStudent_(studentNo, pw, true);

    if (ctx.error) return { ok: false, message: ctx.error };

    if (ctx.mustChange) return { ok: false, mustChange: true, message: '처음 로그인했거나 비밀번호가 초기화됐어요. 먼저 나만의 비밀번호로 바꿔 주세요.' };

    const m = ctx.m, me = ctx.me, month = ctx.month;

    const state = submitState_(m, month, me.id);

    if (state.submitted && !state.editAllowed) {

      return { ok: false, locked: true, message: monthLabel_(month) + ' 설문은 이미 제출했어요. 친구들의 정보를 지키기 위해 제출한 답은 다시 불러오지 않아요. 고칠 내용이 있으면 선생님께 수정 권한을 요청해 주세요.' };

    }

    const previous = { climate: '', climateReason: '' };

    SURVEY_CONFIG.questions.forEach(q => { previous[q.key] = []; });

    if (state.editAllowed) {

      const mine = m.answers.filter(a => a.month === month && a.s === me.id).sort((a, b) => a.rank - b.rank);

      SURVEY_CONFIG.questions.forEach(q => { previous[q.key] = mine.filter(a => a.pol === q.pol).map(a => ({ id: a.o, tags: a.tags, text: a.text })); });

      previous.climate = state.sub.climate; previous.climateReason = state.sub.climateReason;

    }

    return {

      ok: true, month: month, monthLabel: monthLabel_(month), closeAt: ctx.closeAt,

      me: { id: me.id, name: me.name, studentNo: me.studentNo },

      classmates: m.students.filter(x => x.active && x.id !== me.id).map(x => ({ id: x.id, name: x.name, number: x.number })),

      config: SURVEY_CONFIG,

      previous: previous,

      editing: state.editAllowed

    };

  } catch (e) { return friendlyError_(e); }

}



/** 학생 비밀번호 바꾸기 (띄어쓰기 없이 4~20자, 초기 비밀번호와 같으면 안 됨) */

function changeStudentPassword(studentNo, oldPw, newPw) {

  try {

    const ctx = checkStudent_(studentNo, oldPw, false);

    if (ctx.error) return { ok: false, message: ctx.error };

    newPw = String(newPw || '').trim();

    if (!PASSWORD_PATTERN.test(newPw)) return { ok: false, message: '새 비밀번호는 띄어쓰기 없이 4~20자로 정해 주세요.' };

    if (newPw === studentDefaultPassword_()) return { ok: false, message: '선생님이 알려 준 초기 비밀번호와 다르게 정해 주세요.' };

    if (newPw === String(oldPw).trim()) return { ok: false, message: '지금 비밀번호와 다르게 정해 주세요.' };

    const t = readTable_(SH.STUDENT);

    const row = t.rows.filter(r => cellStr_(r['학생ID']) === ctx.me.id)[0];

    setCell_(SH.STUDENT, row._row, t.headers, '비밀번호해시', hashPw_(newPw), true);

    setCell_(SH.STUDENT, row._row, t.headers, '초기비번', false);

    return { ok: true };

  } catch (e) { return friendlyError_(e); }

}



/**

 * 설문 제출: 처음 제출이거나 수정 권한이 있을 때만 저장하고, 수정 권한은 제출과 함께 사라집니다.

 * @param {Object} p { positive:[{id,tags,text}], negative:[...], climate(1~5), climateReason }

 */

function submitSurvey(studentNo, pw, p) {

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    const ctx = checkStudent_(studentNo, pw, true);

    if (ctx.error) return { ok: false, message: ctx.error };

    if (ctx.mustChange) return { ok: false, message: '먼저 비밀번호를 바꿔 주세요.' };

    const m = ctx.m, me = ctx.me, month = ctx.month;

    const state = submitState_(m, month, me.id);

    if (state.submitted && !state.editAllowed) return { ok: false, message: '이미 제출한 설문이에요. 고치려면 선생님께 수정 권한을 요청해 주세요.' };

    p = p || {};

    const nameOf = {}, valid = {};

    m.students.forEach(x => { if (x.active && x.id !== me.id) { valid[x.id] = true; nameOf[x.id] = x.name; } });

    const rows = [], at = nowStr_();

    const posIds = {};

    for (let qi = 0; qi < SURVEY_CONFIG.questions.length; qi++) {

      const q = SURVEY_CONFIG.questions[qi];

      const list = Array.isArray(p[q.key]) ? p[q.key].slice(0, q.max) : [];

      const used = {};

      for (let i = 0; i < list.length; i++) {

        const it = list[i] || {};

        const id = String(it.id || '');

        if (!valid[id] || used[id]) continue;

        if (q.pol === POL.NEG && posIds[id]) return { ok: false, message: nameOf[id] + ' 친구를 2번과 3번에 함께 고를 수 없어요.' };

        const tags = (Array.isArray(it.tags) ? it.tags : []).map(String).filter(t => q.tags.indexOf(t) >= 0);

        const text = String(it.text || '').trim().slice(0, SURVEY_CONFIG.reasonMax);

        if (!tags.length) return { ok: false, message: (qi + 2) + '번 문항에서 ' + nameOf[id] + ' 친구를 고른 이유의 분류를 하나 이상 골라 주세요.' };

        if (!text) return { ok: false, message: (qi + 2) + '번 문항에서 ' + nameOf[id] + ' 친구를 고른 이유를 자세히 적어 주세요.' };

        used[id] = true;

        if (q.pol === POL.POS) posIds[id] = true;

        rows.push({ '응답ID': newId_('A'), '월': month, '학생ID': me.id, '대상ID': id, '구분': q.pol, '순서': Object.keys(used).length, '이유태그': tags.join(', '), '이유': text, '기록일시': at });

      }

    }

    const climate = Number(p.climate);

    if ([1, 2, 3, 4, 5].indexOf(climate) < 0) return { ok: false, message: '1번 문항에서 우리 반 분위기 점수를 골라 주세요.' };

    const climateReason = String(p.climateReason || '').trim().slice(0, 300);



    removeRows_(SH.ANSWER, r => monthStr_(r['월']) === month && cellStr_(r['학생ID']) === me.id);

    removeRows_(SH.SUBMIT, r => monthStr_(r['월']) === month && cellStr_(r['학생ID']) === me.id);

    appendObjects_(SH.ANSWER, rows);

    appendObjects_(SH.SUBMIT, [{ '월': month, '학생ID': me.id, '학급분위기': climate, '분위기이유': climateReason, '제출일시': at, '수정허용': false }]);

    return { ok: true };

  } catch (e) {

    return friendlyError_(e);

  } finally {

    lock.releaseLock();

  }

}





/* ─────────────────────────────────────────────────────────────

 * 11. 교사 인증 (교사 비밀번호 → 세션 토큰)

 * ───────────────────────────────────────────────────────────── */

function teacherLogin(pin) {

  const saved = getAppProperty_('TEACHER_PIN');

  if (!saved) return { ok: false, message: '관리자가 아직 교사 비밀번호를 등록하지 않았습니다. 구글 시트 상단 [🌌 관계지도] > [환경설정] 메뉴에서 등록해 주세요.' };

  const cache = CacheService.getScriptCache();

  const fails = Number(cache.get('pinfail') || 0);

  if (fails >= 5) return { ok: false, message: '교사 비밀번호를 5번 잘못 입력해 5분간 잠겼어요. 잠시 후 다시 시도해 주세요.' };

  if (String(pin || '').trim() !== saved) {

    cache.put('pinfail', String(fails + 1), 300);

    return { ok: false, message: '교사 비밀번호가 일치하지 않아요. (남은 기회 ' + Math.max(0, 4 - fails) + '번)' };

  }

  cache.remove('pinfail');

  const token = Utilities.getUuid();

  cache.put('tk_' + token, '1', TEACHER_SESSION_SEC);

  return { ok: true, token: token };

}



function requireTeacher_(token) {

  const cache = CacheService.getScriptCache();

  if (!token || !cache.get('tk_' + token)) throw new Error('AUTH: 로그인 시간이 지났어요. 다시 로그인해 주세요.');

  cache.put('tk_' + token, '1', TEACHER_SESSION_SEC);

}



function teacherLogout(token) {

  if (token) CacheService.getScriptCache().remove('tk_' + token);

  return { ok: true };

}







/* ─────────────────────────────────────────────────────────────

 * 12. 교사 대시보드

 * ───────────────────────────────────────────────────────────── */



/** 선택한 달 + 그 이전 달을 분석하고, 비교 결과·온톨로지 사실·월별 추이까지 한 번에 돌려줍니다. */

function getDashboard(token, month) {

  requireTeacher_(token);

  try {

    const m = loadModel_();

    const ctx = buildContext_(m, month);

    const trend = m.months.map(x => {

      const a = x.month === ctx.month ? ctx.cur : (x.month === ctx.prevMonth ? ctx.prev : analyzeMonth_(m, x.month));

      return {

        month: x.month, status: x.status, closeAt: x.closeAt, responded: a.responded, total: a.total,

        mutual: a.mutualPairs.length, neg: a.edges.filter(e => e.pol === POL.NEG).length,

        isolated: a.responded ? Object.keys(a.stats).filter(id => a.stats[id].recvPos === 0).length : null,

        climateAvg: a.climate.avg

      };

    });

    return {

      ok: true,

      month: ctx.month, prevMonth: ctx.prevMonth, months: trend,

      cur: ctx.cur, diff: ctx.diff,

      facts: ctx.onto ? ctx.onto.facts : [],

      students: m.students.filter(x => x.active).map(x => ({ id: x.id, number: x.number, studentNo: x.studentNo, name: x.name })),

      roster: m.students.map(x => ({ id: x.id, number: x.number, studentNo: x.studentNo, name: x.name, hasPassword: !!x.hash, initPw: x.initPw, active: x.active })),

      config: SURVEY_CONFIG, pol: POL

    };

  } catch (e) { return friendlyError_(e); }

}



/** 선택 달·이전 달 분석 + 비교 + 온톨로지 (대시보드와 AI 분석이 함께 사용) */

function buildContext_(m, month) {

  const list = m.months.map(x => x.month);

  let sel = list.indexOf(month) >= 0 ? month : '';

  if (!sel) {

    const open = m.months.filter(x => x.status === '진행중');

    sel = open.length ? open[open.length - 1].month : (list[list.length - 1] || '');

  }

  const idx = list.indexOf(sel);

  const prevMonth = idx > 0 ? list[idx - 1] : '';

  const cur = sel ? analyzeMonth_(m, sel) : null;

  const prev = prevMonth ? analyzeMonth_(m, prevMonth) : null;

  const diff = cur && prev ? diffMonths_(cur, prev) : null;

  const onto = cur ? buildFacts_(cur, diff) : null;

  return { month: sel, prevMonth: prevMonth, cur: cur, prev: prev, diff: diff, onto: onto };

}



/** 학생이 쓴 글에 SURVEY_CONFIG.alertWords 낱말이 있으면 그 낱말들을 돌려줍니다. */

function alertWordsIn_(text) {

  text = String(text || '').replace(/\s+/g, ' ');

  return SURVEY_CONFIG.alertWords.filter(w => w && text.indexOf(w) >= 0);

}



/** 태그나 글에서 세심한 확인이 필요한 낱말·태그를 찾습니다. */

function sensitiveHits_(tags, text) {

  return (tags || []).filter(t => SURVEY_CONFIG.alertTags.indexOf(t) >= 0).concat(alertWordsIn_(text));

}



/**

 * 한 달 분석: 관계 선, 학생별 통계, 학급 분위기, 서로 친구, 엇갈림, 그리고 '살펴볼 점' 표 5가지

 *  watch.sensitive  세심한 확인이 필요한 태그·표현

 *  watch.climateLow 학급 분위기를 1~2점으로 매긴 학생

 *  watch.isolated   즐거운 친구로 선택받지 못한 학생

 *  watch.conflicts  서로 불편함 · 마음이 엇갈림

 *  watch.missing    미응답

 */

function analyzeMonth_(m, month) {

  const students = m.students.filter(x => x.active);

  const ids = {};

  students.forEach(x => { ids[x.id] = true; });

  const edges = m.answers.filter(a => a.month === month && ids[a.s] && ids[a.o]);

  const subs = {};

  m.submits.filter(x => x.month === month && ids[x.s]).forEach(x => { subs[x.s] = x; });

  const responded = {};

  Object.keys(subs).forEach(k => { responded[k] = true; });

  edges.forEach(e => { responded[e.s] = true; });

  const has = {};

  edges.forEach(e => { has[e.s + '|' + e.o + '|' + e.pol] = true; });



  const stats = {};

  students.forEach(x => {

    const sub = subs[x.id];

    stats[x.id] = { id: x.id, recvPos: 0, recvNeg: 0, givenPos: 0, givenNeg: 0, mutual: 0,

                    responded: !!responded[x.id], editAllowed: !!(sub && sub.editAllowed), submittedAt: sub ? sub.at : '',

                    climate: sub ? sub.climate : '', climateReason: sub ? sub.climateReason : '' };

  });

  edges.forEach(e => {

    if (e.pol === POL.POS) { stats[e.s].givenPos++; stats[e.o].recvPos++; }

    else { stats[e.s].givenNeg++; stats[e.o].recvNeg++; }

  });

  const mutualPairs = [], mutualNeg = [], mixed = [];

  edges.forEach(e => {

    if (e.pol === POL.POS && e.s < e.o && has[e.o + '|' + e.s + '|' + POL.POS]) { mutualPairs.push([e.s, e.o]); stats[e.s].mutual++; stats[e.o].mutual++; }

    if (e.pol === POL.NEG && e.s < e.o && has[e.o + '|' + e.s + '|' + POL.NEG]) mutualNeg.push([e.s, e.o]);

    if (e.pol === POL.POS && has[e.o + '|' + e.s + '|' + POL.NEG]) mixed.push([e.s, e.o]);

  });



  // 학급 분위기: 평균과 1~5점 분포

  const scores = students.map(x => Number(stats[x.id].climate)).filter(v => v >= 1 && v <= 5);

  const dist = [0, 0, 0, 0, 0];

  scores.forEach(v => { dist[v - 1]++; });

  const climate = { avg: scores.length ? round1_(scores.reduce((a, b) => a + b, 0) / scores.length) : null, count: scores.length, dist: dist };



  // 살펴볼 점 (소주제별 표)

  const anyResp = Object.keys(responded).length > 0;

  const watch = { sensitive: [], climateLow: [], isolated: [], conflicts: [], missing: [] };

  edges.filter(e => e.pol === POL.NEG).forEach(e => {

    const hits = sensitiveHits_(e.tags, e.text);

    if (hits.length) watch.sensitive.push({ s: e.s, o: e.o, where: '불편한 친구', hits: hits, tags: e.tags, text: e.text });

  });

  students.forEach(x => {

    const st = stats[x.id];

    const ch = alertWordsIn_(st.climateReason);

    if (ch.length) watch.sensitive.push({ s: x.id, o: '', where: '분위기 이유', hits: ch, tags: [], text: st.climateReason });

    const c = Number(st.climate);

    if (c && c <= 2) watch.climateLow.push({ id: x.id, score: c, reason: st.climateReason });

    if (anyResp && st.recvPos === 0) watch.isolated.push({ id: x.id, responded: st.responded, chose: edges.filter(e => e.s === x.id && e.pol === POL.POS).map(e => e.o) });

  });

  watch.climateLow.sort((a, b) => a.score - b.score);

  const textOf = (s, o, pol) => (edges.filter(e => e.s === s && e.o === o && e.pol === pol)[0] || {}).text || '';

  mutualNeg.forEach(p => watch.conflicts.push({ a: p[0], b: p[1], type: '서로 불편함', aText: textOf(p[0], p[1], POL.NEG), bText: textOf(p[1], p[0], POL.NEG) }));

  mixed.forEach(p => watch.conflicts.push({ a: p[0], b: p[1], type: '마음이 엇갈림', aText: textOf(p[0], p[1], POL.POS), bText: textOf(p[1], p[0], POL.NEG) }));

  watch.missing = anyResp ? students.filter(x => !responded[x.id]).map(x => x.id) : [];



  return {

    month: month, total: students.length, responded: Object.keys(responded).length, missing: watch.missing,

    edges: edges.map(e => ({ s: e.s, o: e.o, pol: e.pol, rank: e.rank, tags: e.tags, text: e.text })),

    stats: stats, climate: climate, mutualPairs: mutualPairs, mutualNeg: mutualNeg, mixed: mixed, watch: watch

  };

}



/** 지난달과 비교 — '두 달 모두 응답한 학생'이 한 선택만 견줘 착시를 막습니다. */

function diffMonths_(cur, prev) {

  const both = {};

  Object.keys(cur.stats).forEach(id => { if (cur.stats[id].responded && prev.stats[id] && prev.stats[id].responded) both[id] = true; });

  const key = e => e.s + '|' + e.o + '|' + e.pol;

  const ce = cur.edges.filter(e => both[e.s]);

  const pe = prev.edges.filter(e => both[e.s] && cur.stats[e.o]);

  const cm = {}, pm = {};

  ce.forEach(e => { cm[key(e)] = e; });

  pe.forEach(e => { pm[key(e)] = e; });

  const pick = (arr, pol, other, want) => arr.filter(e => e.pol === pol && !!other[key(e)] === want);

  const pairsOf = a => { const o = {}; a.mutualPairs.filter(p => both[p[0]] && both[p[1]]).forEach(p => { o[p[0] + '|' + p[1]] = p; }); return o; };

  const cp = pairsOf(cur), pp = pairsOf(prev);

  const cnt = (arr, id, pol) => arr.filter(e => e.o === id && e.pol === pol).length;



  const students = Object.keys(cur.stats).map(id => ({

    id: id, comparable: !!both[id],

    prevPos: cnt(pe, id, POL.POS), curPos: cnt(ce, id, POL.POS),

    prevNeg: cnt(pe, id, POL.NEG), curNeg: cnt(ce, id, POL.NEG),

    prevClimate: prev.stats[id] ? prev.stats[id].climate : '', curClimate: cur.stats[id].climate

  }));

  const hl = { escaped: [], grew: [], climateUp: [], newIsolated: [], shrank: [], newNegTarget: [], climateDown: [] };

  students.forEach(x => {

    const d = x.curPos - x.prevPos;

    if (x.prevPos === 0 && x.curPos > 0) hl.escaped.push(x.id);

    else if (d >= 2) hl.grew.push(x.id);

    if (x.prevPos > 0 && x.curPos === 0) hl.newIsolated.push(x.id);

    else if (d <= -2) hl.shrank.push(x.id);

    if (x.curNeg > x.prevNeg) hl.newNegTarget.push(x.id);

    const pc = Number(x.prevClimate), cc = Number(x.curClimate);

    if (pc && cc && pc - cc >= 2) hl.climateDown.push(x.id);

    if (pc && cc && cc - pc >= 2) hl.climateUp.push(x.id);

  });

  return {

    prevMonth: prev.month, comparable: Object.keys(both).length,

    newPos: pick(ce, POL.POS, pm, false), keptPos: pick(ce, POL.POS, pm, true), lostPos: pick(pe, POL.POS, cm, false),

    newNeg: pick(ce, POL.NEG, pm, false), keptNeg: pick(ce, POL.NEG, pm, true), resolvedNeg: pick(pe, POL.NEG, cm, false),

    newMutual: Object.keys(cp).filter(k => !pp[k]).map(k => cp[k]),

    lostMutual: Object.keys(pp).filter(k => !cp[k]).map(k => pp[k]),

    mutualPrev: prev.mutualPairs.length, mutualCur: cur.mutualPairs.length,

    climatePrev: prev.climate, climateCur: cur.climate,

    students: students, highlights: hl

  };

}





/* ─────────────────────────────────────────────────────────────

 * 13. 온톨로지: 사실(트리플) 만들기 + 추론

 *     사실 = { s(주어), p(관계), o(대상), src(설문/추론), rule(추론 규칙) }

 * ───────────────────────────────────────────────────────────── */

const REL_NAMES = {};

REL_NAMES[POL.POS] = ['즐겁게 지냄', '즐거운 친구로 선택받음'];

REL_NAMES[POL.NEG] = ['불편함을 느낌', '불편하다고 지목됨'];



function buildFacts_(cur, diff) {

  const ids = cur.stats;

  const facts = [];

  const add = (s, p, o, src, rule, extra) => facts.push(Object.assign({ s: s, p: p, o: o, src: src, rule: rule || '', oIsStudent: !!ids[o] }, extra || {}));

  const pk = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  const tone = pol => (pol === POL.NEG ? '부정' : '긍정');



  // 기본 사실 + ① 역관계

  cur.edges.forEach(e => {

    const meta = { pol: tone(e.pol), tags: e.tags, text: e.text };

    add(e.s, REL_NAMES[e.pol][0], e.o, '설문', '', meta);

    add(e.o, REL_NAMES[e.pol][1], e.s, '추론', '역관계', meta);

  });

  // ② 상호선택 · ③ 엇갈림

  cur.mutualPairs.forEach(p => { add(p[0], '서로 친구', p[1], '추론', '상호선택', { pol: '긍정', pair: true }); add(p[1], '서로 친구', p[0], '추론', '상호선택', { pol: '긍정', pair: true }); });

  cur.mutualNeg.forEach(p => { add(p[0], '서로 불편함', p[1], '추론', '상호선택', { pol: '부정', pair: true }); add(p[1], '서로 불편함', p[0], '추론', '상호선택', { pol: '부정', pair: true }); });

  cur.mixed.forEach(p => { add(p[0], '마음이 엇갈림', p[1], '추론', '엇갈림', { pol: '부정', pair: true }); add(p[1], '마음이 엇갈림', p[0], '추론', '엇갈림', { pol: '부정', pair: true }); });



  // 연결망: 즐거운 관계는 무방향 연결(먼저 고를수록 가중치 큼), 불편 관계는 '부정 쌍'

  const adj = {}, negPair = {}, posOut = {}, mutualSet = {};

  Object.keys(ids).forEach(id => { adj[id] = {}; posOut[id] = {}; mutualSet[id] = {}; });

  cur.edges.forEach(e => {

    if (e.pol === POL.NEG) { negPair[pk(e.s, e.o)] = true; return; }

    const w = Math.max(1, 4 - e.rank);

    posOut[e.s][e.o] = true;

    adj[e.s][e.o] = (adj[e.s][e.o] || 0) + w; adj[e.o][e.s] = (adj[e.o][e.s] || 0) + w;

  });

  cur.mutualPairs.forEach(p => { mutualSet[p[0]][p[1]] = true; mutualSet[p[1]][p[0]] = true; });



  // ④ 공통 친구 → 다리 놓기 후보

  const bridgeMap = {};

  Object.keys(ids).forEach(b => {

    const fr = Object.keys(mutualSet[b]);

    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {

      const a = fr[i], c = fr[j], k = pk(a, c);

      if (adj[a][c] || negPair[k]) continue;

      (bridgeMap[k] = bridgeMap[k] || { a: k.split('|')[0], c: k.split('|')[1], via: [] }).via.push(b);

    }

  });

  const bridges = Object.keys(bridgeMap).map(k => bridgeMap[k])

    .map(x => Object.assign(x, { need: Math.min(ids[x.a].recvPos, ids[x.c].recvPos) }))

    .sort((x, y) => x.need - y.need || y.via.length - x.via.length).slice(0, 15);

  bridges.forEach(x => {

    add(x.a, '다리 놓기 후보', x.c, '추론', '공통 친구', { via: x.via, pair: true, pol: '긍정' });

    add(x.c, '다리 놓기 후보', x.a, '추론', '공통 친구', { via: x.via, pair: true, pol: '긍정' });

  });



  // ⑤ 한방향 선택 → 연결 기회

  Object.keys(ids).forEach(s => {

    const st = ids[s];

    if (!st.responded || (st.recvPos > 0 && st.mutual > 0)) return;

    Object.keys(posOut[s]).forEach(o => {

      if (!posOut[o][s] && !negPair[pk(s, o)]) add(s, '연결 기회', o, '추론', '한방향 선택', { pol: '긍정' });

    });

  });



  // ⑥ 지난달과 비교

  if (diff) {

    const r = '지난달과 비교';

    diff.newPos.forEach(e => add(e.s, '새로 즐겁게 지냄', e.o, '추론', r, { pol: '긍정', text: e.text }));

    diff.lostPos.forEach(e => add(e.s, '즐거운 관계가 사라짐', e.o, '추론', r, { pol: '부정', text: e.text }));

    diff.newNeg.forEach(e => add(e.s, '새로 불편해짐', e.o, '추론', r, { pol: '부정', text: e.text }));

    diff.resolvedNeg.forEach(e => add(e.s, '불편함이 풀림', e.o, '추론', r, { pol: '긍정', text: e.text }));

    diff.newMutual.forEach(p => { add(p[0], '새로 서로 친구가 됨', p[1], '추론', r, { pol: '긍정', pair: true }); add(p[1], '새로 서로 친구가 됨', p[0], '추론', r, { pol: '긍정', pair: true }); });

    diff.lostMutual.forEach(p => { add(p[0], '서로 친구가 아니게 됨', p[1], '추론', r, { pol: '부정', pair: true }); add(p[1], '서로 친구가 아니게 됨', p[0], '추론', r, { pol: '부정', pair: true }); });

  }



  return { facts: facts, bridges: bridges };

}





/* ─────────────────────────────────────────────────────────────

 * 14. 설문 달 관리 (열기 · 바로 마감 · 마감 예약)

 * ───────────────────────────────────────────────────────────── */

/** 달 설문 열기: 다른 '진행중' 달은 자동 마감, 이 달의 마감 예약은 지웁니다. */

function openMonth(token, month) {

  requireTeacher_(token);

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    month = String(month || '').trim();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, message: '월 형식이 올바르지 않아요. (예: 2026-11)' };

    const t = readTable_(SH.MONTH);

    let found = false;

    t.rows.forEach(r => {

      const mo = monthStr_(r['월']);

      if (mo === month) {

        setCell_(SH.MONTH, r._row, t.headers, '상태', '진행중');

        setCell_(SH.MONTH, r._row, t.headers, '마감예약', '', true);

        found = true;

      } else if (cellStr_(r['상태']) === '진행중') setCell_(SH.MONTH, r._row, t.headers, '상태', '마감');

    });

    if (!found) appendObjects_(SH.MONTH, [{ '월': month, '상태': '진행중', '시작일': nowStr_('yyyy-MM-dd'), '마감예약': '' }]);

    return { ok: true, month: month };

  } catch (e) {

    return friendlyError_(e);

  } finally {

    lock.releaseLock();

  }

}



/** 바로 마감 */

function closeMonth(token, month) {

  requireTeacher_(token);

  try {

    const t = readTable_(SH.MONTH);

    const row = t.rows.filter(r => monthStr_(r['월']) === month)[0];

    if (!row) return { ok: false, message: '해당 달을 찾을 수 없어요.' };

    setCell_(SH.MONTH, row._row, t.headers, '상태', '마감');

    setCell_(SH.MONTH, row._row, t.headers, '마감예약', '', true);

    return { ok: true };

  } catch (e) { return friendlyError_(e); }

}



/**

 * 설문 삭제: 그 달의 설문월 행 · 관계응답 · 제출기록을 모두 지웁니다. (되돌릴 수 없음)

 */

function deleteMonth(token, month) {

  requireTeacher_(token);

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {

    month = String(month || '');

    if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: '삭제할 달을 다시 골라 주세요.' };

    const removedMonth = removeRows_(SH.MONTH, r => monthStr_(r['월']) === month);

    if (!removedMonth) return { ok: false, message: monthLabel_(month) + ' 설문을 찾을 수 없어요.' };

    const answers = removeRows_(SH.ANSWER, r => monthStr_(r['월']) === month);

    const submits = removeRows_(SH.SUBMIT, r => monthStr_(r['월']) === month);

    return { ok: true, answers: answers, submits: submits };

  } catch (e) {

    return friendlyError_(e);

  } finally {

    lock.releaseLock();

  }

}



/**

 * 마감 예약 저장·취소

 * @param {string} when 'yyyy-MM-ddTHH:mm' (datetime-local 값) — 빈 값이면 예약 취소

 */

function setCloseSchedule(token, month, when) {

  requireTeacher_(token);

  try {

    const t = readTable_(SH.MONTH);

    const row = t.rows.filter(r => monthStr_(r['월']) === month)[0];

    if (!row) return { ok: false, message: '해당 달을 찾을 수 없어요.' };

    if (t.headers.indexOf('마감예약') < 0) return { ok: false, message: '설문월 시트에 마감예약 열이 없어요. [DB 세팅 및 초기화] > [안전 세팅]을 먼저 실행해 주세요.' };

    if (!when) { setCell_(SH.MONTH, row._row, t.headers, '마감예약', '', true); return { ok: true, closeAt: '' }; }

    const text = String(when).replace('T', ' ').slice(0, 16);

    const due = parseSchedule_(text);

    if (!due) return { ok: false, message: '마감 날짜와 시간을 다시 골라 주세요.' };

    if (due <= new Date()) return { ok: false, message: '마감 예약은 지금보다 뒤의 시각으로 정해 주세요.' };

    setCell_(SH.MONTH, row._row, t.headers, '마감예약', text, true);

    return { ok: true, closeAt: text };

  } catch (e) { return friendlyError_(e); }

}



/**

 * 수정 권한 주기·거두기: 이미 제출한 학생이 다음 로그인 때 지난 답을 불러와 고칠 수 있게 합니다.

 * 학생이 다시 제출하면 권한은 자동으로 사라집니다.

 */

function setEditPermission(token, month, studentId, allow) {

  requireTeacher_(token);

  try {

    const t = readTable_(SH.SUBMIT);

    if (t.headers.indexOf('수정허용') < 0) return { ok: false, message: '제출기록 시트에 수정허용 열이 없어요. [DB 세팅 및 초기화] > [안전 세팅]을 먼저 실행해 주세요.' };

    const row = t.rows.filter(r => monthStr_(r['월']) === month && cellStr_(r['학생ID']) === String(studentId))[0];

    if (!row) return { ok: false, message: '이 학생의 ' + monthLabel_(month) + ' 제출 기록을 찾을 수 없어요.' };

    setCell_(SH.SUBMIT, row._row, t.headers, '수정허용', !!allow);

    return { ok: true };

  } catch (e) { return friendlyError_(e); }

}





/* ─────────────────────────────────────────────────────────────

 * 15. 학생 명단 관리 (학번 · 비밀번호)

 *     새 학생과 [비밀번호 초기화]는 [환경설정]의 학생 초기 비밀번호(없으면 1234)를 쓰고, 학생은 첫 로그인 때 자기 비밀번호로 바꿉니다.

 *     시트에는 비밀번호 원문이 아니라 해시만 저장합니다.

 * ───────────────────────────────────────────────────────────── */



/** 학생 추가. list = [{ studentNo, name }] — 번호는 자동, 비밀번호는 학생 초기 비밀번호 */

function addStudents(token, list) {

  requireTeacher_(token);

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    const m = loadModel_();

    const usedNo = {};

    m.students.forEach(x => { if (x.studentNo) usedNo[x.studentNo] = true; });

    let nextIdNum = m.students.reduce((mx, x) => Math.max(mx, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1;

    let nextNumber = m.students.reduce((mx, x) => Math.max(mx, x.number), 0) + 1;

    const h = hashPw_(studentDefaultPassword_());

    const rows = [], skipped = [];

    (list || []).forEach(it => {

      const name = String((it && it.name) || '').trim().slice(0, 20);

      const no = String((it && it.studentNo) || '').trim();

      if (!name) return;

      if (!STUDENT_NO_PATTERN.test(no)) { skipped.push(name + '(학번은 숫자 4~5자리)'); return; }

      if (usedNo[no]) { skipped.push(name + '(학번 ' + no + ' 중복)'); return; }

      usedNo[no] = true;

      const num = nextNumber++;   // 번호는 명단 마지막 번호 다음으로 자동

      rows.push({ '학생ID': 'S' + pad2_(nextIdNum++), '번호': num, '학번': no, '이름': name, '비밀번호해시': h, '초기비번': true, '활성': true });

    });

    if (!rows.length) return { ok: false, message: skipped.length ? '추가하지 못했어요: ' + skipped.join(', ') : '추가할 학생을 입력해 주세요.' };

    appendObjects_(SH.STUDENT, rows);

    return { ok: true, added: rows.length, skipped: skipped };

  } catch (e) {

    return friendlyError_(e);

  } finally {

    lock.releaseLock();

  }

}



/** 학생 정보 수정: 학번·이름 (활성 값으로 명단에서 숨기기도 가능) */

function updateStudent(token, v) {

  requireTeacher_(token);

  try {

    v = v || {};

    const t = readTable_(SH.STUDENT);

    const row = t.rows.filter(r => cellStr_(r['학생ID']) === String(v.id))[0];

    if (!row) return { ok: false, message: '학생을 찾을 수 없어요.' };

    if (v.studentNo !== undefined) {

      const no = String(v.studentNo).trim();

      if (!STUDENT_NO_PATTERN.test(no)) return { ok: false, message: '학번은 숫자 4~5자리로 입력해 주세요.' };

      if (t.rows.some(r => r !== row && cellStr_(r['학번']) === no)) return { ok: false, message: '같은 학번을 쓰는 학생이 이미 있어요.' };

      setCell_(SH.STUDENT, row._row, t.headers, '학번', no, true);

    }

    if (v.name !== undefined) {

      const name = String(v.name).trim().slice(0, 20);

      if (!name) return { ok: false, message: '이름을 입력해 주세요.' };

      setCell_(SH.STUDENT, row._row, t.headers, '이름', name);

    }

    if (v.number !== undefined) setCell_(SH.STUDENT, row._row, t.headers, '번호', Math.max(0, Math.floor(Number(v.number) || 0)));

    if (v.active !== undefined) setCell_(SH.STUDENT, row._row, t.headers, '활성', !!v.active);

    return { ok: true };

  } catch (e) { return friendlyError_(e); }

}



/** 한 학생 비밀번호를 학생 초기 비밀번호로 초기화 (잠금도 함께 풀림) */

function resetPassword(token, id) {

  requireTeacher_(token);

  try {

    const t = readTable_(SH.STUDENT);

    const row = t.rows.filter(r => cellStr_(r['학생ID']) === String(id))[0];

    if (!row) return { ok: false, message: '학생을 찾을 수 없어요.' };

    setCell_(SH.STUDENT, row._row, t.headers, '비밀번호해시', hashPw_(studentDefaultPassword_()), true);

    setCell_(SH.STUDENT, row._row, t.headers, '초기비번', true);

    CacheService.getScriptCache().remove('pwfail_' + cellStr_(row['학번']));

    return { ok: true };

  } catch (e) { return friendlyError_(e); }

}



/**

 * 명단에서 빼기: 응답 기록이 없으면 삭제하고, 기록이 있으면 지난 기록 보존을 위해 숨깁니다(활성 해제).

 */

function removeFromRoster(token, id) {

  requireTeacher_(token);

  try {

    id = String(id);

    const m = loadModel_();

    const hasRecord = m.answers.some(a => a.s === id || a.o === id) || m.submits.some(x => x.s === id);

    if (!hasRecord) return deleteStudent(token, id).ok ? { ok: true, mode: 'deleted' } : { ok: false, message: '삭제하지 못했어요.' };

    const r = updateStudent(token, { id: id, active: false });

    return r.ok ? { ok: true, mode: 'hidden' } : r;

  } catch (e) { return friendlyError_(e); }

}



/** 학생 삭제 — 응답 기록이 있으면 숨기기를 안내 */

function deleteStudent(token, id) {

  requireTeacher_(token);

  const lock = LockService.getScriptLock();

  lock.waitLock(20000);

  try {

    id = String(id);

    const m = loadModel_();

    if (m.answers.some(a => a.s === id || a.o === id) || m.submits.some(x => x.s === id)) {

      return { ok: false, message: '응답 기록이 있는 학생은 삭제할 수 없어요. 대신 [숨기기]를 쓰면 지난 기록은 보존되고 설문·지도에서만 빠져요.' };

    }

    removeRows_(SH.STUDENT, r => cellStr_(r['학생ID']) === id);

    return { ok: true };

  } catch (e) {

    return friendlyError_(e);

  } finally {

    lock.releaseLock();

  }

}