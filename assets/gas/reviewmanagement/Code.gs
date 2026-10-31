/**
 * ==========================================================================
 *  📚 학생 소감문 관리 시스템 — code.gs (서버)
 * ==========================================================================
 *  ▸ 데이터베이스 : 이 스크립트가 연결된 구글 시트
 *      · [환경설정]   학번 | 패스워드 | 창체활동 | 날짜
 *                     (왼쪽 2열 = 학생 명단, 오른쪽 2열 = 활동 목록 → 서로 독립된 표)
 *      · [학생소감문] ID | 제출일시 | 창체활동 | 날짜 | 체크 | 학번 | 소감문 | 피드백 | 교사시점
 *      · [프롬프트]   구분 | 이름 | 프롬프트 | 수정일시  (AI 창의 프롬프트 보관함)
 *  ▸ 개인정보     : 학생 이름은 저장하지 않고 학번으로만 학생을 구분합니다.
 *  ▸ AI 기능      : Gemini API로 피드백과 교사 시점 글을 만듭니다. (API 키·모델·요청 간격은 스크립트 속성)
 *  ▸ 민감 정보    : 교사 비밀번호, 학생 초기 비밀번호 → 스크립트 속성(PropertiesService)
 *  ▸ 보안 구조    : 로그인하면 서버가 '세션 토큰'을 발급하고, 이후 모든 요청에서
 *                   토큰과 권한(학생/교사)을 서버가 다시 확인합니다.
 *                   → 브라우저 개발자도구로 서버 함수를 직접 불러도 남의 글을 보거나
 *                     지우거나, 남의 비밀번호를 바꿀 수 없습니다.
 *  ▸ 열 찾기      : 1행의 헤더 이름으로 열 위치를 찾습니다. 시트에서 열 순서를
 *                   바꾸거나 새 열을 끼워 넣어도 코드가 그대로 동작합니다.
 *  ▸ 함수 이름 끝의 '_' : 웹 앱(브라우저)에서 직접 호출할 수 없는 내부 전용 함수
 * ==========================================================================
 */


// ==========================================================================
// 0. 기본 설정값
// ==========================================================================

/** 교사 로그인을 뜻하는 식별값 (index.html의 값과 같아야 합니다) */
const ADMIN_LOGIN_ID = '관리자모드';

/** 스크립트 속성에 '학생 초기 비밀번호'가 없을 때 쓰는 기본값 */
const FALLBACK_STUDENT_PASSWORD = '1234';

/** 예시 데이터에서 '학생 초기 비밀번호'로 바꿔 넣을 자리표시 */
const DEFAULT_PW_MARK = '{{초기비밀번호}}';

/**
 * 학생 비밀번호 규칙: 영문·숫자·특수문자(!#$%^&*_.) 4~20자
 * (= + - @ 로 시작하면 구글 시트가 수식으로 착각하므로 이런 문자는 받지 않습니다)
 */
const STUDENT_PW_PATTERN = '^[A-Za-z0-9!#$%^&*_.]{4,20}$';

const SESSION_PREFIX = 'SESSION_';     // 캐시에 세션을 저장할 때 붙이는 접두어
const SESSION_TTL_SEC = 6 * 60 * 60;   // 세션 유지 시간: 6시간(CacheService 최대치), 사용할 때마다 연장
const LOGIN_MAX_FAIL = 5;              // 비밀번호를 이 횟수만큼 틀리면 잠금
const LOGIN_LOCK_MIN = 5;              // 잠금 시간(분)
const MAX_CONTENT_LENGTH = 5000;       // 소감문 최대 글자 수
const MAX_TEACHER_TEXT_LENGTH = 2000;  // 교사가 쓰는 글(피드백·교사 시점 글) 최대 글자 수
const MAX_PROMPT_LENGTH = 2000;        // AI 프롬프트 최대 글자 수
const AI_BATCH_SIZE = 5;               // AI 작업 한 번 호출에 받는 최대 글 수 (화면은 요청 간격을 지키려고 한 개씩 보냄)
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';   // [환경설정]에 모델 이름이 없을 때 쓰는 기본 모델
const DEFAULT_AI_INTERVAL_SEC = 4;     // [환경설정]에 요청 간격이 없을 때 쓰는 기본 간격(초)
const MAX_AI_INTERVAL_SEC = 60;        // 요청 간격 최댓값(초)
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/**
 * AI 작업 두 가지
 *  - feedback    : 학생에게 건네는 피드백 → [피드백] 열 (학생 화면에 보임)
 *  - teacherView : 학생 소감문을 교사가 관찰한 시점으로 바꾼 글 → [교사시점] 열 (교사만 봄, 학생별로 모아 엑셀로 받음)
 * system은 교사가 입력한 프롬프트와 함께 AI에게 주는 기본 역할입니다.
 */
const AI_TASKS = {
  feedback: {
    column: '피드백',
    field: 'feedback',
    system: [
      '당신은 학생이 창의적 체험활동 뒤에 쓴 소감문을 읽고 지도하는 학교 선생님입니다.',
      '교사의 시점에서, 교사가 요청한 방식에 맞춰 학생에게 건네는 피드백을 한국어로 씁니다.',
      '학생의 이름이나 학번 같은 개인정보를 추측하거나 지어내지 않습니다.',
      '결과 본문만 쓰고, 제목이나 마크다운 기호(#, * 등)는 쓰지 않습니다.'
    ].join('\n')
  },
  teacherView: {
    column: '교사시점',
    field: 'teacherView',
    system: [
      '당신은 학생이 창의적 체험활동 뒤에 쓴 소감문을 바탕으로 관찰 기록을 쓰는 학교 선생님입니다.',
      '학생이 1인칭으로 쓴 소감을, 교사가 학생을 지켜보고 서술하는 교사 시점의 글로 바꿉니다. 교사가 요청한 방식에 맞춰 한국어로 씁니다.',
      '소감문에 없는 활동 내용이나 성과를 지어내지 않고, 학생의 이름이나 학번을 쓰지 않습니다.',
      '결과 본문만 쓰고, 제목이나 마크다운 기호(#, * 등)는 쓰지 않습니다.'
    ].join('\n')
  }
};

/** 프롬프트 보관함: AI 작업 이름 → [프롬프트] 시트의 [구분] 값 ('공통'은 두 작업 모두에서 보임) */
const PROMPT_TYPES = { feedback: '피드백', teacherView: '교사시점' };
const COMMON_PROMPT_TYPE = '공통';
const MAX_PROMPT_NAME_LENGTH = 40;     // 프롬프트 이름 최대 글자 수


/**
 * ▼ 시트 구조 정의
 *   [DB 세팅 및 초기화] 화면이 이 배열을 기준으로 시트를 진단·생성·보완합니다.
 *   - headers       : 1행에 들어갈 헤더 (코드는 이 이름으로 열을 찾습니다)
 *   - textColumns   : '텍스트' 서식을 지정할 열 (0777 같은 앞자리 0 보존)
 *   - dummyRows     : [전체 초기화] 때 채워 넣을 예시 데이터
 *   ※ 학생 이름은 저장하지 않습니다. 학번으로만 학생을 구분합니다. (개인정보 최소화)
 */
const SHEET_SCHEMA = [
  {
    name: '환경설정',
    headers: ['학번', '패스워드', '창체활동', '날짜'],
    textColumns: ['학번', '패스워드'],
    columnWidths: [90, 120, 240, 110],
    dummyRows: [
      ['1101', DEFAULT_PW_MARK, '학교폭력 예방교육', '2026-03-12'],
      ['1102', DEFAULT_PW_MARK, '디지털 시민교육', '2026-04-09'],
      ['1103', DEFAULT_PW_MARK, '생명존중 교육', '2026-05-21'],
      ['1104', DEFAULT_PW_MARK, '진로 탐색 활동', '2026-06-18'],
      ['1105', DEFAULT_PW_MARK, '안전 체험교육', '2026-07-09'],
      ['1106', DEFAULT_PW_MARK, '', ''],
      ['1107', DEFAULT_PW_MARK, '', ''],
      ['1108', DEFAULT_PW_MARK, '', '']
    ]
  },
  {
    name: '학생소감문',
    headers: ['ID', '제출일시', '창체활동', '날짜', '체크', '학번', '소감문', '피드백', '교사시점'],
    optionalHeaders: ['피드백', '교사시점'],   // 이 열들이 아직 없어도 앱은 동작합니다. (해당 기능만 [안전 세팅] 뒤에 사용)
    textColumns: ['ID', '학번'],
    columnWidths: [150, 170, 170, 100, 50, 80, 420, 340, 400],
    dummyRows: [
      ['2026-03-12_1101', '2026. 3. 12 PM 3:41:08', '학교폭력 예방교육', '2026-03-12', 'O', '1101',
        '장난으로 한 말도 듣는 친구에게는 상처가 될 수 있다는 걸 알게 됐다. 앞으로는 말하기 전에 한 번 더 생각하겠다.',
        '장난과 상처의 경계를 스스로 돌아본 점이 좋아요. 말하기 전에 한 번 더 생각했을 때 달라진 경험이 있다면 한 가지 덧붙여 보세요. 글이 훨씬 생생해질 거예요.',
        '학교폭력 예방교육에 참여하여 장난으로 한 말도 친구에게 상처가 될 수 있음을 깨닫고, 말하기 전에 한 번 더 생각하겠다는 성숙한 태도를 보임.'],
      ['2026-03-12_1102', '2026. 3. 12 PM 3:44:51', '학교폭력 예방교육', '2026-03-12', '', '1102',
        '보고도 모른 척하는 것도 폭력이 될 수 있다는 내용이 가장 기억에 남는다. 힘들어하는 친구가 있으면 먼저 선생님께 알리겠다.', '', ''],
      ['2026-04-09_1101', '2026. 4. 9 PM 2:58:30', '디지털 시민교육', '2026-04-09', '', '1101',
        '사진 한 장에도 개인정보가 담길 수 있다는 사례가 놀라웠다. SNS에 올리기 전에 위치 정보부터 확인하겠다.', '',
        '디지털 시민교육에서 사진 한 장에도 개인정보가 담길 수 있다는 사례에 관심을 보이고, SNS에 올리기 전에 위치 정보를 확인하겠다는 구체적인 실천 의지를 밝힘.'],
      ['2026-04-09_1103', '2026. 4. 9 PM 3:05:12', '디지털 시민교육', '2026-04-09', 'O', '1103',
        '댓글 하나가 누군가의 하루를 망칠 수 있다는 걸 배웠다. 출처를 확인하고 정보를 나누는 습관을 들이고 싶다.',
        '출처를 확인하겠다는 다짐이 분명해서 좋아요. 앞으로 어떤 방법으로 출처를 확인할지 한 문장 더 적어 보면 실천 계획이 더 구체적으로 보일 거예요.', ''],
      ['2026-05-21_1104', '2026. 5. 21 PM 3:12:44', '생명존중 교육', '2026-05-21', 'O', '1104',
        '도움을 요청하는 것도 용기라는 말이 인상 깊었다. 친구의 이야기를 끝까지 들어 주는 사람이 되고 싶다.', '', '']
    ]
  },
  {
    name: '프롬프트',
    headers: ['구분', '이름', '프롬프트', '수정일시'],
    textColumns: [],
    columnWidths: [90, 220, 560, 170],
    seedWhenCreated: true,   // [안전 세팅]으로 시트를 처음 만들 때도 예시 프롬프트를 넣습니다. (이미 있는 시트에는 손대지 않음)
    dummyRows: [
      ['피드백', '칭찬 한 가지 + 보완 한 가지',
        '학생의 소감문을 읽고 담임교사로서 학생에게 줄 피드백을 써 주세요.\n1. 글에서 잘한 점 한 가지를 구체적인 내용을 들어 칭찬해 주세요.\n2. 더 좋은 글이 되도록 보완할 점 한 가지를 질문이나 제안으로 알려 주세요.\n3. 3~4문장으로, 학생에게 말하듯 따뜻한 해요체로 써 주세요.',
        '2026. 3. 2 AM 9:00:00'],
      ['피드백', '짧은 격려 두 문장',
        '학생의 소감문을 읽고 학생이 다음 활동에도 힘을 낼 수 있도록 격려하는 피드백을 써 주세요.\n1. 소감문에서 인상 깊은 표현 하나를 짚어 주세요.\n2. 두 문장 이내로, 따뜻한 해요체로 써 주세요.',
        '2026. 3. 2 AM 9:00:00'],
      ['교사시점', '생활기록부 명사형 2~3문장',
        '학생의 소감문을 교사가 학생을 관찰하고 쓴 기록으로 바꿔 주세요.\n1. 활동에서 학생이 배우고 느낀 점과 앞으로의 다짐이 드러나게 써 주세요.\n2. 소감문에 없는 내용은 덧붙이지 말아 주세요.\n3. \'~함.\', \'~을 보임.\'처럼 명사형으로 끝나는 문장 2~3개로 써 주세요.',
        '2026. 3. 2 AM 9:00:00'],
      ['교사시점', '참여 태도와 실천 의지 중심',
        '학생의 소감문을 바탕으로 활동 참여 태도와 실천 의지가 드러나는 교사 관찰 기록을 써 주세요.\n1. 학생이 무엇을 깨달았는지 한 문장으로 쓰고, 앞으로의 실천 계획을 한 문장으로 이어 주세요.\n2. 과장된 칭찬 표현은 쓰지 말아 주세요.\n3. 명사형(~함.)으로 끝나는 문장 2개로 써 주세요.',
        '2026. 3. 2 AM 9:00:00']
    ]
  }
];

/**
 * ▼ 이 앱에서 사용하는 스크립트 속성(민감 정보) 목록
 *   이 배열에 항목을 추가하면 [환경설정] 화면의 단계와 입력칸이 자동으로 늘어납니다.
 */
const APP_PROPERTIES = [
  {
    key: 'ADMIN_PASSWORD',
    label: '교사 비밀번호',
    type: 'password',
    required: true,
    step: 1,
    hint: '웹 앱 로그인 화면에서 [교사]를 고르고 입력할 비밀번호예요. 학생들이 짐작하기 어렵게 6자 이상으로 정하세요.',
    docUrl: '',
    placeholder: '공백 없이 4자 이상',
    pattern: '^\\S{4,}$',
    patternMessage: '공백 없이 4자 이상 입력하세요.',
    testable: true
  },
  {
    key: 'DEFAULT_STUDENT_PASSWORD',
    label: '학생 초기 비밀번호',
    type: 'text',
    required: false,
    step: 2,
    hint: '교사 화면에서 [학생 비밀번호 초기화]를 하면 이 값으로 바뀌고, 명단의 패스워드 칸이 비어 있는 학생도 이 값으로 로그인해요. 등록하지 않으면 1234를 씁니다.',
    docUrl: '',
    placeholder: '예: 1234',
    pattern: STUDENT_PW_PATTERN,
    patternMessage: '영문·숫자·특수문자(!#$%^&*_.)로 4~20자를 입력하세요.',
    testable: false
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API 키',
    type: 'password',
    required: false,
    step: 3,
    hint: '교사 화면의 [AI 피드백 생성]과 [교사 시점 일괄 변환]에 쓰여요. Google AI Studio에서 발급한 키를 그대로 붙여 넣으세요. 키가 어떤 글자로 시작하든 괜찮고, 저장한 뒤 [연결 테스트]로 확인할 수 있어요.',
    docUrl: 'https://aistudio.google.com/app/apikey',
    placeholder: 'Google AI Studio에서 복사한 키',
    pattern: '^\\S+$',
    patternMessage: '키 중간에 공백이나 줄바꿈이 없도록 붙여 넣으세요.',
    testable: true
  },
  {
    key: 'GEMINI_MODEL',
    label: 'Gemini 모델 이름',
    type: 'text',
    required: false,
    step: 4,
    hint: '비워 두면 gemini-3.5-flash-lite 모델을 써요. 나중에 새 모델로 바꾸고 싶으면 여기에 모델 이름을 입력하세요. 코드를 고치지 않아도 바로 바뀌어요.',
    docUrl: '',
    placeholder: 'gemini-3.5-flash-lite',
    pattern: '^[a-z0-9][a-z0-9.\\-]*$',
    patternMessage: '예: gemini-3.5-flash-lite 처럼 영문 소문자, 숫자, 점(.), 하이픈(-)만 입력하세요.',
    testable: false,
    showValue: true   // 비밀 값이 아니라서 설정 화면에 가리지 않고 보여 줌
  },
  {
    key: 'AI_REQUEST_INTERVAL',
    label: 'AI 요청 간격',
    type: 'text',
    required: false,
    step: 5,
    hint: 'AI에 글 하나를 보낸 뒤 다음 글을 보내기까지 기다리는 시간(초)이에요. 비워 두면 4초예요. 무료 키에서 "요청 한도를 넘었어요"가 자주 뜨면 늘리고, 유료 키라면 0으로 줄여도 돼요.',
    docUrl: '',
    placeholder: '4',
    pattern: '^([0-9]|[1-5][0-9]|60)$',
    patternMessage: '0부터 60까지의 정수(초)로 입력하세요.',
    testable: false,
    showValue: true
  }
];


// ==========================================================================
// 1. 구글 시트 상단 커스텀 메뉴 & 대화상자
// ==========================================================================

/** 시트를 열면 자동 실행되어 상단에 [📚 소감문 관리] 메뉴를 만듭니다. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📚 소감문 관리')
    .addItem('🗂️ DB 세팅 및 초기화', 'openDbSetupDialog')
    .addItem('🔐 환경설정 (비밀번호 등록)', 'openSettingsDialog')
    .addToUi();
}

/** [DB 세팅 및 초기화] 대화상자(dbSetup.html)를 엽니다. */
function openDbSetupDialog() {
  const html = HtmlService.createHtmlOutputFromFile('dbSetup').setWidth(760).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'DB 세팅 및 초기화');
}

/** [환경설정] 대화상자(settings.html)를 엽니다. */
function openSettingsDialog() {
  const html = HtmlService.createHtmlOutputFromFile('settings').setWidth(580).setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, '환경설정');
}


// ==========================================================================
// 2. 웹 앱 진입점
// ==========================================================================

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('학생 소감문 관리 시스템')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ==========================================================================
// 3. 로그인 · 세션
// ==========================================================================

/**
 * [로그인 확인]
 *  - id가 '관리자모드'이면 교사 로그인, 그 밖에는 학번으로 학생 로그인
 *  - 같은 계정으로 비밀번호를 5번 틀리면 5분 동안 잠급니다. (무작위 대입 방지)
 *  - 성공하면 세션 토큰을 발급합니다. 브라우저는 이후 모든 요청에 이 토큰을 함께 보냅니다.
 */
function verifyLogin(id, password) {
  const loginId = normalizeId_(id);
  const pw = toText_(password);
  if (!loginId || !pw) return { success: false, message: '학번과 비밀번호를 모두 입력하세요.' };
  if (loginId.length > 30) return { success: false, message: '학번 또는 비밀번호가 맞지 않아요.' };

  const isAdmin = loginId === ADMIN_LOGIN_ID;
  const cache = CacheService.getScriptCache();
  const failKey = 'LOGIN_FAIL_' + (isAdmin ? 'ADMIN' : loginId);
  const failCount = Number(cache.get(failKey) || 0);
  if (failCount >= LOGIN_MAX_FAIL) {
    return {
      success: false,
      message: '비밀번호를 ' + LOGIN_MAX_FAIL + '번 틀려서 ' + LOGIN_LOCK_MIN + '분 동안 로그인할 수 없어요. 잠시 후 다시 시도하세요.'
    };
  }

  // 실패 횟수를 1 늘리고, 남은 기회를 알려 주는 안내 문구를 만듭니다.
  const fail = (message) => {
    const count = failCount + 1;
    cache.put(failKey, String(count), LOGIN_LOCK_MIN * 60);
    const left = LOGIN_MAX_FAIL - count;
    return {
      success: false,
      message: left > 0 ? message + ' (남은 기회 ' + left + '번)' : message + ' ' + LOGIN_LOCK_MIN + '분 동안 로그인이 잠깁니다.'
    };
  };

  // ── 교사 로그인: 비밀번호는 시트가 아닌 스크립트 속성에서 확인 ──
  if (isAdmin) {
    const adminPw = getAppProperty_('ADMIN_PASSWORD');
    if (!adminPw) {
      return {
        success: false,
        message: '관리자가 아직 교사 비밀번호를 등록하지 않았습니다. 구글 시트 상단 [📚 소감문 관리] > [환경설정] 메뉴에서 등록해 주세요.'
      };
    }
    if (pw !== adminPw) return fail('교사 비밀번호가 맞지 않아요.');
    cache.remove(failKey);
    return { success: true, role: 'admin', token: createSession_({ role: 'admin' }) };
  }

  // ── 학생 로그인: [환경설정] A열(학번)으로 찾기 ──
  const student = readStudents_().list.filter(s => s.id === loginId)[0];
  const defaultPw = getDefaultStudentPassword_();
  const realPw = student ? (student.password || defaultPw) : '';   // 패스워드 칸이 비어 있으면 초기 비밀번호로 로그인
  if (!student || pw !== realPw) return fail('학번 또는 비밀번호가 맞지 않아요.');

  cache.remove(failKey);
  return {
    success: true,
    role: 'student',
    token: createSession_({ role: 'student', studentId: student.id }),
    studentId: student.id,
    isDefault: realPw === defaultPw
  };
}

/** [로그아웃] 서버에 저장된 세션을 지웁니다. */
function logout(token) {
  if (token) CacheService.getScriptCache().remove(SESSION_PREFIX + token);
  return { success: true };
}

/**
 * [학생 비밀번호 변경] 로그인한 학생 본인의 비밀번호만 바꿀 수 있습니다.
 *  (예전 코드는 이름만 알면 누구의 비밀번호든 바꿀 수 있어서 세션 확인을 추가했습니다)
 */
function changePassword(token, newPassword) {
  const session = requireSession_(token, 'student');
  const pw = toText_(newPassword);
  if (!new RegExp(STUDENT_PW_PATTERN).test(pw)) {
    return { success: false, message: '영문·숫자·특수문자(!#$%^&*_.)로 4~20자를 입력하세요.' };
  }
  if (pw === getDefaultStudentPassword_()) {
    return { success: false, message: '초기 비밀번호와 다른 비밀번호를 입력하세요.' };
  }
  return withLock_(() => {
    const result = readStudents_();
    const student = result.list.filter(s => s.id === session.studentId)[0];
    if (!student) return { success: false, message: '학생 명단에서 내 학번을 찾을 수 없어요. 선생님께 알려 주세요.' };
    setTextCell_(result.table.sheet.getRange(student.rowNum, result.table.col['패스워드'] + 1), pw);
    return { success: true, message: '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.' };
  });
}


// ==========================================================================
// 4. 학생 기능 (모두 학생 세션 필요)
// ==========================================================================

/** [학생 화면 데이터] 활동 목록 + 내가 쓴 글을 한 번에 가져옵니다. (서버 호출 횟수 절약) */
function getStudentDashboard(token) {
  const session = requireSession_(token, 'student');
  const reflections = readReflections_().list
    .filter(r => r.studentId === session.studentId)
    .sort(byDateDesc_)
    .map(toClient_);
  return { activities: readActivities_(), reflections: reflections };
}

/**
 * [소감문 저장] form.uniqueId가 있으면 수정, 없으면 새로 제출
 *  - 한 학생은 활동(날짜)마다 소감문을 하나만 낼 수 있습니다. (중복 제출 방지)
 *  - 활동명은 브라우저가 보낸 값을 믿지 않고 [환경설정] 시트에서 다시 찾습니다.
 *  - 여러 학생이 동시에 제출해도 행이 겹치지 않도록 잠금(Lock)을 겁니다.
 */
function saveReflection(token, form) {
  const session = requireSession_(token, 'student');
  form = form || {};
  const date = toText_(form.date);
  const content = String(form.content == null ? '' : form.content).replace(/\s+$/, '');
  const uniqueId = toText_(form.uniqueId);

  if (!date || !content.trim()) return { success: false, message: '활동을 고르고 소감문 내용을 입력하세요.' };
  if (content.length > MAX_CONTENT_LENGTH) {
    return { success: false, message: '소감문은 ' + MAX_CONTENT_LENGTH + '자까지 쓸 수 있어요. (지금 ' + content.length + '자)' };
  }

  return withLock_(() => {
    const settingTable = getTable_('환경설정');
    const student = readStudents_(settingTable).list.filter(s => s.id === session.studentId)[0];
    if (!student) return { success: false, message: '학생 명단에서 내 학번을 찾을 수 없어요. 선생님께 알려 주세요.' };

    const ref = readReflections_();
    const mine = ref.list.filter(r => r.studentId === student.id);
    const target = uniqueId ? mine.filter(r => r.uniqueId === uniqueId)[0] : null;
    if (uniqueId && !target) return { success: false, message: '수정할 글을 찾지 못했어요. 목록을 새로 불러온 뒤 다시 시도하세요.' };

    // 활동 목록에서 날짜로 활동명을 찾습니다. (목록에서 지워진 활동의 글은 기존 활동명 유지)
    const found = readActivities_(settingTable).filter(a => a.date === date)[0];
    const activity = found ? found.activity : (target && target.date === date ? target.activity : '');
    if (!activity) return { success: false, message: '고른 날짜의 활동을 찾지 못했어요. 새로고침한 뒤 다시 고르세요.' };

    const other = mine.filter(r => r.date === date && (!target || r.uniqueId !== target.uniqueId))[0];
    if (other) {
      return { success: false, duplicate: true, uniqueId: other.uniqueId, message: date + ' 활동의 소감문은 이미 냈어요. 낸 글을 수정하세요.' };
    }

    // ID = 날짜_학번 (혹시 겹치면 _2, _3을 붙여 항상 고유하게)
    const used = {};
    ref.list.forEach(r => { if (r.uniqueId && (!target || r.uniqueId !== target.uniqueId)) used[r.uniqueId] = true; });
    const newId = uniqueId_(date + '_' + student.id, used);
    const sheet = ref.table.sheet;
    const c = ref.table.col;

    if (target) {
      // [수정] 제출일시와 체크 상태는 그대로 두고 나머지만 바꿉니다.
      setTextCell_(sheet.getRange(target.rowNum, c['ID'] + 1), newId);
      sheet.getRange(target.rowNum, c['창체활동'] + 1).setValue(safeText_(activity));
      sheet.getRange(target.rowNum, c['날짜'] + 1).setValue(date);
      sheet.getRange(target.rowNum, c['소감문'] + 1).setValue(safeText_(content));
      return { success: true, message: '수정한 내용을 저장했어요.' };
    }

    // [신규] 헤더 순서에 맞춰 한 행을 만든 뒤 마지막 행 아래에 기록합니다.
    const tz = getSs_().getSpreadsheetTimeZone();
    const row = new Array(ref.table.headers.length).fill('');
    row[c['ID']] = newId;
    row[c['제출일시']] = Utilities.formatDate(new Date(), tz, 'yyyy. M. d a h:mm:ss');
    row[c['창체활동']] = safeText_(activity);
    row[c['날짜']] = date;
    row[c['체크']] = '';
    row[c['학번']] = student.id;
    row[c['소감문']] = safeText_(content);

    const rowNum = sheet.getLastRow() + 1;
    // ID·학번 칸은 값을 넣기 전에 '텍스트' 서식을 지정해야 앞자리 0이 사라지지 않습니다.
    sheet.getRange(rowNum, c['ID'] + 1).setNumberFormat('@');
    sheet.getRange(rowNum, c['학번'] + 1).setNumberFormat('@');
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
    return { success: true, message: '제출했어요.' };
  });
}

/** [체크 표시] 내 글의 체크(O)를 켜고 끕니다. */
function toggleSelfCheck(token, uniqueId) {
  const session = requireSession_(token, 'student');
  return withLock_(() => {
    const ref = readReflections_();
    const target = ref.list.filter(r => r.uniqueId === toText_(uniqueId) && r.studentId === session.studentId)[0];
    if (!target) return { success: false, message: '글을 찾지 못했어요. 새로고침한 뒤 다시 시도하세요.' };
    const newValue = target.check === 'O' ? '' : 'O';
    ref.table.sheet.getRange(target.rowNum, ref.table.col['체크'] + 1).setValue(newValue);
    return { success: true, check: newValue };
  });
}

/** [삭제] 학생은 자기 글만, 교사는 모든 글을 지울 수 있습니다. */
function deleteReflection(token, uniqueId) {
  const session = requireSession_(token);
  return withLock_(() => {
    const ref = readReflections_();
    const target = ref.list.filter(r =>
      r.uniqueId === toText_(uniqueId) && (session.role === 'admin' || r.studentId === session.studentId)
    )[0];
    if (!target) return { success: false, message: '지울 글을 찾지 못했어요. 새로고침한 뒤 다시 시도하세요.' };
    ref.table.sheet.deleteRow(target.rowNum);
    return { success: true, message: '삭제했어요.' };
  });
}


// ==========================================================================
// 5. 교사(관리자) 기능 (모두 교사 세션 필요)
// ==========================================================================

/** [교사 화면 데이터] 학번 명단 + 활동 목록 + 전체 소감문(피드백·교사 시점 글 포함)을 한 번에 가져옵니다. */
function getAdminDashboard(token) {
  requireSession_(token, 'admin');
  const settingTable = getTable_('환경설정');
  const ref = readReflections_();
  return {
    students: readStudents_(settingTable).list.map(s => s.id),
    activities: readActivities_(settingTable),
    reflections: ref.list.sort(byDateDesc_).map(toAdminClient_),
    usesFallbackPassword: !getAppProperty_('DEFAULT_STUDENT_PASSWORD'),   // 값 자체는 보내지 않고 사용 여부만
    aiReady: !!getAppProperty_('GEMINI_API_KEY'),                          // AI 키도 등록 여부만 보냄
    aiModel: getGeminiModel_(),
    aiIntervalSec: getAiIntervalSec_(),
    missingColumns: ['피드백', '교사시점'].filter(c => ref.table.col[c] === undefined)   // [안전 세팅]이 필요한 열
  };
}

/** [활동 추가] [환경설정] 시트의 창체활동·날짜 열 맨 아래에 새 활동을 적습니다. */
function addSetting(token, date, activity) {
  requireSession_(token, 'admin');
  const d = toText_(date);
  const act = toText_(activity);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !act) return { success: false, message: '날짜와 활동명을 모두 입력하세요.' };

  return withLock_(() => {
    const t = getTable_('환경설정');
    const exist = readActivities_(t).filter(a => a.date === d)[0];
    if (exist) {
      return { success: false, message: d + '에는 이미 \'' + exist.activity + '\' 활동이 있어요. 날짜 하나에 활동 하나만 등록할 수 있어요.' };
    }
    // 창체활동·날짜 열에서 마지막으로 값이 있는 행 바로 아래에 적습니다. (학생 명단 열과는 따로 셈)
    let lastFilled = 1;
    t.rows.forEach((r, i) => {
      if (toText_(r[t.col['창체활동']]) || String(r[t.col['날짜']]).trim()) lastFilled = i + 2;
    });
    const rowNum = lastFilled + 1;
    t.sheet.getRange(rowNum, t.col['창체활동'] + 1).setValue(safeText_(act));
    t.sheet.getRange(rowNum, t.col['날짜'] + 1).setValue(d);
    return { success: true, message: '\'' + act + '\' 활동을 추가했어요.' };
  });
}

/** [학생 비밀번호 초기화] 고른 학생의 비밀번호를 초기 비밀번호로 되돌리고 로그인 잠금도 풉니다. */
function adminResetPassword(token, studentId) {
  requireSession_(token, 'admin');
  const id = normalizeId_(studentId);
  return withLock_(() => {
    const result = readStudents_();
    const student = result.list.filter(s => s.id === id)[0];
    if (!student) return { success: false, message: '명단에서 학생을 찾지 못했어요.' };
    setTextCell_(result.table.sheet.getRange(student.rowNum, result.table.col['패스워드'] + 1), getDefaultStudentPassword_());
    CacheService.getScriptCache().remove('LOGIN_FAIL_' + id);
    return { success: true, message: student.id + ' 학생의 비밀번호를 초기화했어요.' };
  });
}


/** [피드백 저장] 학생에게 보이는 피드백을 씁니다. 모두 지우고 저장하면 삭제됩니다. */
function saveFeedback(token, uniqueId, feedback) {
  requireSession_(token, 'admin');
  return saveTeacherText_(uniqueId, '피드백', feedback, '피드백');
}

/** [교사 시점 글 저장] 학생 소감문을 교사 시점으로 바꾼 글(교사만 봄)을 씁니다. 모두 지우고 저장하면 삭제됩니다. */
function saveTeacherView(token, uniqueId, text) {
  requireSession_(token, 'admin');
  return saveTeacherText_(uniqueId, '교사시점', text, '교사 시점 글');
}

/** 교사가 쓰는 칸(피드백·교사시점)에 글을 저장하는 공통 처리 */
function saveTeacherText_(uniqueId, column, value, label) {
  const text = String(value == null ? '' : value).trim();
  if (text.length > MAX_TEACHER_TEXT_LENGTH) {
    return { success: false, message: label + josa_(label, '은/는') + ' ' + MAX_TEACHER_TEXT_LENGTH + '자까지 쓸 수 있어요. (지금 ' + text.length + '자)' };
  }
  return withLock_(() => {
    const ref = readReflections_();
    const col = ref.table.col[column];
    if (col === undefined) return { success: false, message: missingColumnGuide_(column) };
    const target = ref.list.filter(r => r.uniqueId === toText_(uniqueId))[0];
    if (!target) return { success: false, message: '글을 찾지 못했어요. 새로고침한 뒤 다시 시도하세요.' };
    ref.table.sheet.getRange(target.rowNum, col + 1).setValue(text ? safeText_(text) : '');
    return { success: true, text: text, message: label + josa_(label, '을/를') + (text ? ' 저장했어요.' : ' 지웠어요.') };
  });
}

/** 시트에 필요한 열이 없을 때 보여 줄 안내 */
function missingColumnGuide_(column) {
  return '\'학생소감문\' 시트에 ' + column + ' 열이 없어요. 구글 시트 상단 [📚 소감문 관리] > [DB 세팅 및 초기화]에서 [안전 세팅]을 실행해 주세요.';
}

/**
 * [AI 일괄 작업] 선택한 소감문을 Gemini에 보내 결과를 시트에 저장합니다.
 *  - task: 'feedback'(학생에게 보이는 피드백) 또는 'teacherView'(교사 시점으로 바꾼 글)
 *  - 한 번에 최대 AI_BATCH_SIZE개까지 받습니다. 화면은 [환경설정]의 요청 간격을 지키려고 한 개씩 보냅니다.
 *  - 학번은 보내지 않고 활동명과 소감문 내용만 보냅니다.
 *  - 글마다 결과를 돌려줍니다: { uniqueId, status: 'done' | 'skipped' | 'error', text, message, retryable, fatal }
 *      retryable : 잠시 뒤 다시 시도하면 되는 오류 (요청 한도, 서버 혼잡, 일시적 연결 오류)
 *      fatal     : API 키나 모델 문제라서 계속 보내도 소용없는 오류
 *  - requested(실제로 AI에 보낸 글 수)와 intervalSec(지금 요청 간격)도 함께 돌려줍니다.
 */
function generateAiText(token, task, uniqueIds, prompt, skipExisting) {
  requireSession_(token, 'admin');
  const config = AI_TASKS[task];
  if (!config) return { success: false, message: '알 수 없는 AI 작업이에요.' };
  const apiKey = getAppProperty_('GEMINI_API_KEY');
  if (!apiKey) {
    return { success: false, message: 'Gemini API 키가 등록되지 않았어요. 구글 시트 상단 [📚 소감문 관리] > [환경설정]에서 등록해 주세요.' };
  }
  const teacherPrompt = toText_(prompt);
  if (!teacherPrompt) return { success: false, message: '프롬프트를 입력하세요.' };
  if (teacherPrompt.length > MAX_PROMPT_LENGTH) {
    return { success: false, message: '프롬프트는 ' + MAX_PROMPT_LENGTH + '자까지 쓸 수 있어요.' };
  }

  const ref = readReflections_();
  if (ref.table.col[config.column] === undefined) return { success: false, message: missingColumnGuide_(config.column) };
  const byId = {};
  ref.list.forEach(r => { byId[r.uniqueId] = r; });

  const ids = (Array.isArray(uniqueIds) ? uniqueIds : []).map(toText_).filter(id => id).slice(0, AI_BATCH_SIZE);
  const results = [];
  const targets = [];
  ids.forEach(id => {
    const r = byId[id];
    if (!r) results.push({ uniqueId: id, status: 'error', message: '글을 찾지 못했어요. 삭제됐을 수 있어요.' });
    else if (skipExisting && r[config.field].trim()) results.push({ uniqueId: id, status: 'skipped', message: '이미 써 둔 글이 있어요.' });
    else if (!r.content.trim()) results.push({ uniqueId: id, status: 'skipped', message: '소감문 내용이 비어 있어요.' });
    else targets.push(r);
  });
  const reply = () => ({ success: true, results: results, requested: targets.length, intervalSec: getAiIntervalSec_() });

  // ① Gemini에 요청합니다.
  const model = getGeminiModel_();
  let responses = [];
  if (targets.length) {
    try {
      responses = UrlFetchApp.fetchAll(targets.map(r =>
        buildGeminiRequest_(apiKey, model, config.system, buildAiPrompt_(teacherPrompt, r))));
    } catch (e) {
      targets.forEach(r => results.push({ uniqueId: r.uniqueId, status: 'error', retryable: true, message: 'AI 서버에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.' }));
      return reply();
    }
  }
  const generated = [];
  responses.forEach((res, i) => {
    const parsed = parseGeminiResponse_(res, model);
    const id = targets[i].uniqueId;
    if (parsed.text) generated.push({ uniqueId: id, text: parsed.text.slice(0, MAX_TEACHER_TEXT_LENGTH) });
    else results.push({ uniqueId: id, status: 'error', message: parsed.message, retryable: !!parsed.retryable, fatal: !!parsed.fatal });
  });

  // ② 시트에 저장합니다. AI를 기다리는 사이 행 위치가 바뀌었을 수 있어 ID로 다시 찾습니다.
  if (generated.length) {
    withLock_(() => {
      const fresh = readReflections_();
      const rowById = {};
      fresh.list.forEach(r => { rowById[r.uniqueId] = r.rowNum; });
      generated.forEach(g => {
        if (!rowById[g.uniqueId]) {
          results.push({ uniqueId: g.uniqueId, status: 'error', message: 'AI가 답하는 사이에 글이 삭제됐어요.' });
          return;
        }
        fresh.table.sheet.getRange(rowById[g.uniqueId], fresh.table.col[config.column] + 1).setValue(safeText_(g.text));
        results.push({ uniqueId: g.uniqueId, status: 'done', text: g.text });
      });
    });
  }
  return reply();
}

/** 사용할 Gemini 모델 이름 ([환경설정]에 없으면 기본 모델) */
function getGeminiModel_() {
  return getAppProperty_('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
}

/** AI 요청 간격(초): [환경설정]에 없거나 형식이 맞지 않으면 기본 간격 */
function getAiIntervalSec_() {
  const raw = getAppProperty_('AI_REQUEST_INTERVAL');
  if (!/^\d+$/.test(raw)) return DEFAULT_AI_INTERVAL_SEC;
  return Math.min(Number(raw), MAX_AI_INTERVAL_SEC);
}

/** AI에게 보낼 본문: 교사의 요청 + 활동 + 학생 소감문 (학번·ID는 넣지 않습니다) */
function buildAiPrompt_(teacherPrompt, r) {
  return '[교사의 요청]\n' + teacherPrompt +
    '\n\n[활동]\n' + r.date + ' ' + r.activity +
    '\n\n[학생 소감문]\n' + r.content;
}

/** Gemini generateContent 요청을 만듭니다. API 키는 주소가 아닌 헤더에 넣어 주소 기록에 남지 않게 합니다. */
function buildGeminiRequest_(apiKey, model, systemText, userText) {
  const body = { contents: [{ role: 'user', parts: [{ text: userText }] }] };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  return {
    url: GEMINI_API_BASE + encodeURIComponent(model) + ':generateContent',
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
}

/** Gemini 응답 해석: 성공하면 { text }, 실패하면 { message, retryable, fatal } */
function parseGeminiResponse_(res, model) {
  const code = res.getResponseCode();
  let body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = {}; }
  const apiMessage = body.error && body.error.message ? String(body.error.message) : '';

  if (code === 200) {
    const candidate = (body.candidates || [])[0];
    const parts = candidate && candidate.content && candidate.content.parts ? candidate.content.parts : [];
    const text = cleanAiText_(parts.filter(p => !p.thought).map(p => p.text || '').join(''));
    if (text) return { text: text };
    const reason = (body.promptFeedback && body.promptFeedback.blockReason) || (candidate && candidate.finishReason) || '';
    return { message: 'AI가 답을 만들지 못했어요' + (reason ? ' (' + reason + ')' : '') + '. 글 내용이나 프롬프트를 확인해 주세요.' };
  }
  if (code === 400 && /api key/i.test(apiMessage)) {
    return { fatal: true, message: 'API 키가 올바르지 않아요. [환경설정]에서 Gemini API 키를 다시 확인하세요.' };
  }
  if (code === 401 || code === 403) {
    return { fatal: true, message: '이 API 키로는 Gemini를 쓸 수 없어요. Google AI Studio에서 키 상태를 확인하세요.' };
  }
  if (code === 404) {
    return { fatal: true, message: '\'' + model + '\' 모델을 찾을 수 없어요. [환경설정]의 Gemini 모델 이름을 확인하세요.' };
  }
  if (code === 429) {
    return { retryable: true, message: '요청 한도를 넘었어요. 잠시 뒤 다시 시도하거나 [환경설정]에서 AI 요청 간격을 늘려 주세요.' };
  }
  if (code >= 500) return { retryable: true, message: 'AI 서버가 잠시 바빠요. 잠시 뒤 다시 시도하세요.' };
  return { message: 'AI 요청이 실패했어요. (' + code + (apiMessage ? ': ' + apiMessage.slice(0, 120) : '') + ')' };
}

/** AI 답에서 마크다운 기호(**굵게**, # 제목)와 앞뒤 공백을 정리합니다. */
function cleanAiText_(text) {
  return String(text || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*#+\s*/gm, '').trim();
}


/** [프롬프트 보관함 읽기] 이 AI 작업에서 쓸 수 있는 프롬프트 목록 (시트에서 직접 고친 내용도 바로 반영) */
function getPrompts(token, task) {
  requireSession_(token, 'admin');
  return promptListResult_(task);
}

/** [프롬프트 저장] 이 작업에서 보이는 프롬프트 중 같은 이름이 있으면 덮어쓰고, 없으면 새 줄로 추가합니다. */
function savePrompt(token, task, name, text) {
  requireSession_(token, 'admin');
  const type = PROMPT_TYPES[task];
  if (!type) return { success: false, message: '알 수 없는 AI 작업이에요.' };
  const cleanName = toText_(name);
  const cleanText = String(text == null ? '' : text).trim();
  if (!cleanName) return { success: false, message: '저장할 이름을 입력하세요.' };
  if (cleanName.length > MAX_PROMPT_NAME_LENGTH) return { success: false, message: '이름은 ' + MAX_PROMPT_NAME_LENGTH + '자까지 쓸 수 있어요.' };
  if (!cleanText) return { success: false, message: '프롬프트 내용을 입력하세요.' };
  if (cleanText.length > MAX_PROMPT_LENGTH) return { success: false, message: '프롬프트는 ' + MAX_PROMPT_LENGTH + '자까지 쓸 수 있어요.' };

  return withLock_(() => {
    const table = getOptionalTable_('프롬프트');
    if (!table) return { success: false, message: missingPromptSheetGuide_() };
    const c = table.col;
    const now = Utilities.formatDate(new Date(), getSs_().getSpreadsheetTimeZone(), 'yyyy. M. d a h:mm:ss');
    const found = findPromptRow_(table, type, cleanName);
    if (found) {
      table.sheet.getRange(found.rowNum, c['프롬프트'] + 1).setValue(safeText_(cleanText));
      table.sheet.getRange(found.rowNum, c['수정일시'] + 1).setValue(now);
    } else {
      const row = table.headers.map(() => '');
      row[c['구분']] = type;
      row[c['이름']] = safeText_(cleanName);
      row[c['프롬프트']] = safeText_(cleanText);
      row[c['수정일시']] = now;
      table.sheet.getRange(table.sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    }
    const result = promptListResult_(task);
    result.message = '\'' + cleanName + '\' 프롬프트를 ' + (found ? '덮어썼어요.' : '보관함에 저장했어요.');
    result.overwritten = !!found;
    return result;
  });
}

/** [프롬프트 삭제] 이 작업에서 보이는 프롬프트 중 이름이 같은 줄을 시트에서 지웁니다. */
function deletePrompt(token, task, name) {
  requireSession_(token, 'admin');
  const type = PROMPT_TYPES[task];
  if (!type) return { success: false, message: '알 수 없는 AI 작업이에요.' };
  const cleanName = toText_(name);
  return withLock_(() => {
    const table = getOptionalTable_('프롬프트');
    if (!table) return { success: false, message: missingPromptSheetGuide_() };
    const found = findPromptRow_(table, type, cleanName);
    if (!found) return { success: false, message: '\'' + cleanName + '\' 프롬프트를 찾지 못했어요. 이미 지워졌을 수 있어요.' };
    table.sheet.deleteRow(found.rowNum);
    const result = promptListResult_(task);
    result.message = '\'' + cleanName + '\' 프롬프트를 삭제했어요.';
    return result;
  });
}

/** 없어도 되는 시트 읽기: 시트가 없으면 null (있는데 헤더가 틀리면 getTable_이 안내와 함께 오류) */
function getOptionalTable_(sheetName) {
  return getSs_().getSheetByName(sheetName) ? getTable_(sheetName) : null;
}

function missingPromptSheetGuide_() {
  return '\'프롬프트\' 시트가 없어요. 구글 시트 상단 [📚 소감문 관리] > [DB 세팅 및 초기화]에서 [안전 세팅]을 실행하면 예시 프롬프트와 함께 만들어져요.';
}

/** [프롬프트] 시트의 모든 줄 (이름과 내용이 모두 빈 줄은 건너뜀) */
function readPrompts_(table) {
  const c = table.col;
  const tz = getSs_().getSpreadsheetTimeZone();
  const list = [];
  table.rows.forEach((r, i) => {
    const name = toText_(r[c['이름']]);
    const text = r[c['프롬프트']] == null ? '' : String(r[c['프롬프트']]).trim();
    if (!name && !text) return;
    list.push({
      rowNum: i + 2,
      type: toText_(r[c['구분']]),
      name: name || '(이름 없음, ' + (i + 2) + '행)',
      text: text,
      updatedAt: formatDateTime_(r[c['수정일시']], tz)
    });
  });
  return list;
}

/** 이 구분에서 보이는 프롬프트인지: 같은 구분이거나, 구분이 '공통'이거나 비어 있으면 보임 */
function isVisiblePrompt_(p, type) {
  return p.type === type || p.type === COMMON_PROMPT_TYPE || p.type === '';
}

/** 이름이 같은 줄 찾기 (같은 구분의 줄을 공통 줄보다 먼저) */
function findPromptRow_(table, type, name) {
  const matches = readPrompts_(table).filter(p => isVisiblePrompt_(p, type) && p.name === name);
  matches.sort((a, b) => (a.type === type ? 0 : 1) - (b.type === type ? 0 : 1));
  return matches[0] || null;
}

/** 화면에 보낼 목록: 내용이 있는 프롬프트만, 시트에 적힌 순서대로 */
function promptListResult_(task) {
  const type = PROMPT_TYPES[task];
  if (!type) return { success: false, message: '알 수 없는 AI 작업이에요.' };
  const table = getOptionalTable_('프롬프트');
  if (!table) return { success: true, ready: false, prompts: [], message: missingPromptSheetGuide_() };
  const prompts = readPrompts_(table)
    .filter(p => p.text && isVisiblePrompt_(p, type))
    .map(p => ({ name: p.name, type: p.type || COMMON_PROMPT_TYPE, text: p.text, updatedAt: p.updatedAt }));
  return { success: true, ready: true, prompts: prompts };
}


// ==========================================================================
// 6. 스크립트 속성(민감 정보) 관리 — settings.html 전용
//    ※ 공개 함수는 모두 '구글 시트 편집자'만 실행할 수 있습니다.
//      (웹 앱에 접속한 학생이 개발자도구로 불러도 차단)
// ==========================================================================

/** [서버 내부 전용] 스크립트 속성 값 읽기 — 이름 끝의 _ 때문에 브라우저에서 호출할 수 없습니다. */
function getAppProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/** [저장] 형식을 검사한 뒤 스크립트 속성에 저장하고, 마스킹된 최신 상태를 돌려줍니다. */
function saveAppProperty(key, value) {
  assertSheetEditor_();
  const def = findPropDef_(key);
  const v = toText_(value);
  if (!v) return { success: false, message: '저장할 값을 입력하세요.' };
  if (def.pattern && !new RegExp(def.pattern).test(v)) {
    return { success: false, message: def.patternMessage || '형식이 올바르지 않아요.' };
  }
  if (key === 'ADMIN_PASSWORD' && v === getDefaultStudentPassword_()) {
    return { success: false, message: '교사 비밀번호는 학생 초기 비밀번호와 달라야 해요.' };
  }
  if (key === 'DEFAULT_STUDENT_PASSWORD' && v === getAppProperty_('ADMIN_PASSWORD')) {
    return { success: false, message: '학생 초기 비밀번호는 교사 비밀번호와 달라야 해요.' };
  }
  PropertiesService.getScriptProperties().setProperty(key, v);
  return { success: true, message: def.label + josa_(def.label, '을/를') + ' 저장했어요.', status: buildPropertyStatus_(def) };
}

/** [삭제] 스크립트 속성에서 값을 지웁니다. */
function deleteAppProperty(key) {
  assertSheetEditor_();
  const def = findPropDef_(key);
  PropertiesService.getScriptProperties().deleteProperty(key);
  return { success: true, message: def.label + josa_(def.label, '을/를') + ' 삭제했어요.', status: buildPropertyStatus_(def) };
}

/** [설정 화면용 현황] 원본 값은 절대 보내지 않고 '등록 여부 + 마스킹된 값'만 돌려줍니다. */
function getPropertyStatus() {
  assertSheetEditor_();
  return APP_PROPERTIES.slice().sort((a, b) => a.step - b.step).map(buildPropertyStatus_);
}

/** [위저드용 진행 상황] 전체 수, 등록 수, 미등록 필수 항목, 이어서 시작할 단계(0이면 요약 화면) */
function getSetupProgress() {
  assertSheetEditor_();
  const items = APP_PROPERTIES.slice().sort((a, b) => a.step - b.step).map(buildPropertyStatus_);
  const missing = items.filter(i => i.required && !i.registered);
  return {
    total: items.length,
    registered: items.filter(i => i.registered).length,
    missingRequired: missing.map(i => i.key),
    nextStep: missing.length ? missing[0].step : 0
  };
}

/** [연결 테스트] 저장된 값이 실제로 쓸 수 있는 상태인지 확인합니다. (외부 API가 없어 값 점검으로 대신) */
function testConnection(key) {
  assertSheetEditor_();
  const def = findPropDef_(key);
  const value = getAppProperty_(key);
  if (!value) return { success: false, message: def.label + josa_(def.label, '이/가') + ' 아직 등록되지 않았어요.' };
  if (key === 'ADMIN_PASSWORD') {
    if (value === getDefaultStudentPassword_()) {
      return { success: false, message: '교사 비밀번호가 학생 초기 비밀번호와 같아요. 다른 값으로 바꾸세요.' };
    }
    if (value.length < 6) {
      return { success: true, message: '로그인에 쓸 수 있어요. 6자 이상으로 바꾸면 더 안전해요.' };
    }
    return { success: true, message: '정상이에요. 웹 앱에서 [교사]를 고르고 이 비밀번호로 로그인하세요.' };
  }
  if (key === 'GEMINI_API_KEY') {
    const model = getGeminiModel_();
    let parsed;
    try {
      const res = UrlFetchApp.fetchAll([buildGeminiRequest_(value, model, '', '연결 확인입니다. "확인"이라고만 답해 주세요.')])[0];
      parsed = parseGeminiResponse_(res, model);
    } catch (e) {
      return { success: false, message: 'Gemini 서버에 연결하지 못했어요. 잠시 뒤 다시 시도하세요.' };
    }
    return parsed.text
      ? { success: true, message: '연결 성공: ' + model + ' 모델이 응답했어요.' }
      : { success: false, message: parsed.message };
  }
  return { success: true, message: def.label + josa_(def.label, '이/가') + ' 등록되어 있어요.' };
}


// ==========================================================================
// 7. DB 세팅 및 초기화 — dbSetup.html 전용 (구글 시트 편집자만 실행 가능)
//    진단(diagnoseDatabase) → 화면에서 확인 → 선택 실행(runDatabaseSetup)
// ==========================================================================

/**
 * [진단] 시트를 바꾸지 않고 현재 상태만 살펴봅니다.
 *  - 시트 존재 여부, 빠진 헤더, 시트에 적힌 관리자 패스워드 감지
 *  - 구조가 정상이면 명단·활동 데이터까지 점검 (빈 명단, 학번 중복, 같은 날짜 활동 중복)
 */
function diagnoseDatabase() {
  assertSheetEditor_();
  const ss = getSs_();
  const sheets = SHEET_SCHEMA.map(schema => {
    const sheet = ss.getSheetByName(schema.name);
    const item = {
      name: schema.name, expected: schema.headers, headers: [], exists: !!sheet,
      dataRows: 0, status: 'ok', tasks: [], warnings: []
    };
    if (!sheet) {
      item.status = 'missing';
      item.tasks.push('시트를 새로 만들고 1행에 헤더를 씁니다.' + (schema.seedWhenCreated ? ' 예시 ' + schema.dummyRows.length + '행도 함께 넣습니다.' : ''));
      return item;
    }
    const rawHeaders = readHeaderRow_(sheet);
    item.headers = rawHeaders.filter(h => h);
    item.dataRows = Math.max(0, sheet.getLastRow() - 1);
    if (!item.headers.length) {
      item.tasks.push('1행에 헤더를 씁니다.');
    } else {
      missingHeaders_(schema, rawHeaders).forEach(h => item.tasks.push('\'' + h + '\' 열을 추가합니다. 기존 열과 데이터는 그대로 둡니다.'));
    }
    if (schema.name === '환경설정' && findLegacyAdminCol_(rawHeaders) > -1) {
      item.tasks.push('시트에 적힌 관리자 패스워드를 스크립트 속성으로 옮기고, 시트에서는 지웁니다.');
    }
    if (item.tasks.length) item.status = 'fix';
    return item;
  });

  const setting = sheets.filter(s => s.name === '환경설정')[0];
  const data = analyzeData_();
  if (data.setting) {
    const d = data.setting;
    if (!d.students) setting.warnings.push('학생 명단이 비어 있어요. 학번 열에 학번을 입력하세요.');
    if (d.dupIds.length) setting.warnings.push('학번이 겹치는 학생이 있어요: ' + summarizeList_(d.dupIds));
    if (d.dupDates.length) setting.warnings.push('같은 날짜에 활동이 두 개 이상 있어요: ' + summarizeList_(d.dupDates) + ' (첫 번째 활동만 사용)');
  }

  return {
    sheets: sheets,
    adminPasswordRegistered: !!getAppProperty_('ADMIN_PASSWORD'),
    legacyAdminPassword: data.legacyAdminPassword
  };
}

/**
 * [실행]
 *  - mode 'safe'  : 기존 열과 데이터는 그대로 두고, 없는 시트와 빠진 열만 만듭니다.
 *  - mode 'reset' : 두 시트의 내용을 모두 지우고 예시 데이터로 다시 채웁니다. (되돌릴 수 없음)
 *  - withBackup   : true면 실행 전에 두 시트를 '백업_시트명_날짜' 시트로 복제합니다.
 */
function runDatabaseSetup(mode, withBackup) {
  assertSheetEditor_();
  if (mode !== 'safe' && mode !== 'reset') throw new Error('알 수 없는 세팅 방식입니다.');

  return withLock_(() => {
    const ss = getSs_();
    const logs = [];
    if (withBackup) backupSheets_(logs);

    // 시트에 적힌 관리자 패스워드는 어떤 방식이든 가장 먼저 스크립트 속성으로 옮깁니다. (보안 + 교사 로그인 유지)
    const settingSheet = ss.getSheetByName('환경설정');
    if (settingSheet) migrateLegacyAdminPassword_(settingSheet, logs);

    const defaultPw = getDefaultStudentPassword_();
    SHEET_SCHEMA.forEach(schema => {
      let sheet = ss.getSheetByName(schema.name);
      const isNew = !sheet;
      if (isNew) {
        sheet = ss.insertSheet(schema.name);
        logs.push('[' + schema.name + '] 시트를 새로 만들었습니다.');
      }

      if (mode === 'reset') {
        sheet.clear();
        sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
        styleSheet_(sheet, schema, true);   // 텍스트 서식을 먼저 지정해야 예시 학번의 앞자리 0이 보존됩니다.
        const rows = schema.dummyRows.map(row => row.map(v => (v === DEFAULT_PW_MARK ? defaultPw : v)));
        if (rows.length) sheet.getRange(2, 1, rows.length, schema.headers.length).setValues(rows);
        logs.push('[' + schema.name + '] 내용을 모두 지우고 예시 데이터 ' + rows.length + '행을 넣었습니다.');
      } else {
        applyHeaderFix_(sheet, schema, logs);
        styleSheet_(sheet, schema, isNew);
        if (isNew && schema.seedWhenCreated && schema.dummyRows.length) {
          sheet.getRange(2, 1, schema.dummyRows.length, schema.headers.length).setValues(schema.dummyRows);
          logs.push('[' + schema.name + '] 예시 ' + schema.dummyRows.length + '행을 넣었습니다.');
        }
      }
    });

    if (!logs.length) logs.push('모든 시트가 이미 올바른 구조라서 바뀐 내용이 없습니다.');
    return { success: true, logs: logs };
  }, 30000);
}

/** 1행(헤더)을 문자열 배열로 읽습니다. */
function readHeaderRow_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
}

/** 스키마에는 있는데 시트 1행에는 없는 헤더 목록 */
function missingHeaders_(schema, headers) {
  return schema.headers.filter(h => headers.indexOf(h) === -1);
}

/** 예전 구조의 '관리자 패스워드' 열 위치(0부터)를 찾습니다. 없으면 -1 */
function findLegacyAdminCol_(headers) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).replace(/\s/g, '');
    if (h === '관리자패스워드' || h === '관리자비밀번호') return i;
  }
  return -1;
}

/** [안전 세팅] 빠진 헤더를 스키마 순서에 맞는 자리에 끼워 넣습니다. (기존 열과 데이터는 건드리지 않음) */
function applyHeaderFix_(sheet, schema, logs) {
  const tag = '[' + schema.name + '] ';
  if (readHeaderRow_(sheet).every(h => !h)) {
    sheet.getRange(1, 1, 1, schema.headers.length).setValues([schema.headers]);
    logs.push(tag + '1행에 헤더를 썼습니다.');
    return;
  }
  missingHeaders_(schema, readHeaderRow_(sheet)).forEach(name => {
    const headers = readHeaderRow_(sheet);
    const k = schema.headers.indexOf(name);
    // 스키마에서 바로 앞 순서인 헤더를 찾아 그 오른쪽에 새 열을 넣습니다. (없으면 맨 앞)
    let anchor = 0;
    for (let j = k - 1; j >= 0; j--) {
      const idx = headers.indexOf(schema.headers[j]);
      if (idx > -1) { anchor = idx + 1; break; }
    }
    if (anchor === 0) sheet.insertColumnBefore(1);
    else sheet.insertColumnAfter(anchor);
    sheet.getRange(1, anchor + 1).setValue(name);
    logs.push(tag + '\'' + name + '\' 열을 ' + columnLetter_(anchor + 1) + '열에 추가했습니다.');
  });
}

/** 틀 고정, 텍스트 서식 지정. fullStyle이면 헤더 꾸미기·열 너비·줄바꿈까지 적용합니다. */
function styleSheet_(sheet, schema, fullStyle) {
  const headers = readHeaderRow_(sheet);
  const maxRows = sheet.getMaxRows();
  sheet.setFrozenRows(1);
  schema.textColumns.forEach(name => {
    const idx = headers.indexOf(name);
    if (idx > -1 && maxRows > 1) sheet.getRange(2, idx + 1, maxRows - 1, 1).setNumberFormat('@');
  });
  if (!fullStyle) return;
  sheet.getRange(1, 1, 1, schema.headers.length)
    .setFontWeight('bold').setBackground('#E1EBE6').setHorizontalAlignment('center');
  schema.columnWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  ['소감문', '피드백', '교사시점', '프롬프트'].forEach(name => {
    const idx = headers.indexOf(name);
    if (idx > -1 && maxRows > 1) sheet.getRange(2, idx + 1, maxRows - 1, 1).setWrap(true);
  });
}

/** 예전 E2의 '관리자 패스워드'를 스크립트 속성으로 옮기고 시트에서는 지웁니다. */
function migrateLegacyAdminPassword_(sheet, logs) {
  const idx = findLegacyAdminCol_(readHeaderRow_(sheet));
  if (idx === -1) return;
  const col = idx + 1;
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const values = sheet.getRange(1, col, lastRow, 1).getValues().map(r => toText_(r[0]));
  const legacyPw = values[1];
  const props = PropertiesService.getScriptProperties();

  if (legacyPw && !props.getProperty('ADMIN_PASSWORD')) {
    props.setProperty('ADMIN_PASSWORD', legacyPw);
    logs.push('[환경설정] 시트에 있던 관리자 패스워드를 스크립트 속성으로 옮겼습니다. 교사 로그인은 기존 비밀번호 그대로 쓰면 됩니다.');
  } else if (legacyPw) {
    logs.push('[환경설정] 스크립트 속성에 교사 비밀번호가 이미 있어서, 시트의 관리자 패스워드는 옮기지 않고 지웠습니다.');
  }

  // 그 열에 다른 데이터가 없으면 열째 삭제, 있으면 헤더와 비밀번호 칸만 비웁니다.
  const hasOtherData = values.slice(2).some(v => v !== '');
  if (!hasOtherData && sheet.getMaxColumns() > 1) sheet.deleteColumn(col);
  else sheet.getRange(1, col, 2, 1).clearContent();
  logs.push('[환경설정] \'관리자 패스워드\' 열을 시트에서 정리했습니다.');
}

/** 실행 전 백업: 두 시트를 같은 파일 안에 '백업_시트명_날짜' 이름으로 복제합니다. */
function backupSheets_(logs) {
  const ss = getSs_();
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyMMdd_HHmmss');
  SHEET_SCHEMA.forEach(schema => {
    const sheet = ss.getSheetByName(schema.name);
    if (!sheet) return;
    const name = '백업_' + schema.name + '_' + stamp;
    sheet.copyTo(ss).setName(name);
    logs.push('[' + schema.name + '] 백업 시트를 만들었습니다: ' + name);
  });
}

/** 진단용 데이터 점검 (시트를 바꾸지 않음) */
function analyzeData_() {
  const ss = getSs_();
  const result = { setting: null, legacyAdminPassword: false };

  const settingSheet = ss.getSheetByName('환경설정');
  if (settingSheet) {
    const idx = findLegacyAdminCol_(readHeaderRow_(settingSheet));
    if (idx > -1) result.legacyAdminPassword = toText_(settingSheet.getRange(2, idx + 1).getValue()) !== '';
  }

  let st = null;
  try { st = getTable_('환경설정'); } catch (e) { st = null; }
  if (!st) return result;

  const tz = ss.getSpreadsheetTimeZone();
  const students = readStudents_(st).list;
  const idCount = {};
  students.forEach(s => { idCount[s.id] = (idCount[s.id] || 0) + 1; });
  const dateCount = {};
  st.rows.forEach(r => {
    const d = formatDate_(r[st.col['날짜']], tz);
    if (d && toText_(r[st.col['창체활동']])) dateCount[d] = (dateCount[d] || 0) + 1;
  });

  result.setting = {
    students: students.length,
    dupIds: Object.keys(idCount).filter(k => idCount[k] > 1),
    dupDates: Object.keys(dateCount).filter(k => dateCount[k] > 1)
  };
  return result;
}

/** 긴 목록은 앞의 5개만 보여 주고 '외 N개'로 줄입니다. */
function summarizeList_(list, max) {
  const limit = max || 5;
  return list.length > limit ? list.slice(0, limit).join(', ') + ' 외 ' + (list.length - limit) + '개' : list.join(', ');
}


// ==========================================================================
// 8. 내부 헬퍼
// ==========================================================================

/** 이 스크립트가 연결된 스프레드시트 */
function getSs_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** SHEET_SCHEMA에서 시트 정의를 찾습니다. */
function getSchema_(sheetName) {
  return SHEET_SCHEMA.filter(s => s.name === sheetName)[0];
}

/**
 * 시트 전체를 읽어 '헤더 이름 → 열 번호' 지도와 함께 돌려줍니다.
 *  - col['학번'] = 0 처럼 0부터 시작하는 열 번호
 *  - rows는 2행부터의 데이터 (rows[i]는 시트의 i+2행)
 */
function getTable_(sheetName) {
  const guide = '구글 시트 상단 [📚 소감문 관리] > [DB 세팅 및 초기화]에서 [안전 세팅]을 실행해 주세요.';
  const sheet = getSs_().getSheetByName(sheetName);
  if (!sheet) throw new Error('\'' + sheetName + '\' 시트가 없습니다. ' + guide);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = (lastRow > 0 && lastCol > 0) ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
  const headers = values.length ? values[0].map(h => String(h).trim()) : [];
  const col = {};
  headers.forEach((h, i) => { if (h && col[h] === undefined) col[h] = i; });

  const schema = getSchema_(sheetName);
  const optional = schema.optionalHeaders || [];   // 없어도 되는 열 (예: 피드백)
  const missing = schema.headers.filter(h => col[h] === undefined && optional.indexOf(h) === -1);
  if (missing.length) throw new Error('\'' + sheetName + '\' 시트에 [' + missing.join(', ') + '] 열이 없습니다. ' + guide);
  return { sheet: sheet, headers: headers, col: col, rows: values.slice(1) };
}

/** 학생 명단 읽기: 학번이 있는 행만 [{id, password, rowNum}] */
function readStudents_(table) {
  const t = table || getTable_('환경설정');
  const list = [];
  t.rows.forEach((r, i) => {
    const id = normalizeId_(r[t.col['학번']]);
    if (!id) return;
    list.push({ id: id, password: toText_(r[t.col['패스워드']]), rowNum: i + 2 });
  });
  return { table: t, list: list };
}

/** 활동 목록 읽기: [{date, activity}] 최근 날짜가 위. 같은 날짜가 여러 번이면 첫 번째만 씁니다. */
function readActivities_(table) {
  const t = table || getTable_('환경설정');
  const tz = getSs_().getSpreadsheetTimeZone();
  const seen = {};
  const list = [];
  t.rows.forEach(r => {
    const activity = toText_(r[t.col['창체활동']]);
    const date = formatDate_(r[t.col['날짜']], tz);
    if (!activity || !date || seen[date]) return;
    seen[date] = true;
    list.push({ date: date, activity: activity });
  });
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 소감문 전체 읽기 (rowNum 포함, 서버 내부용). 피드백·교사시점 열이 없으면 빈 값으로 둡니다. */
function readReflections_() {
  const t = getTable_('학생소감문');
  const tz = getSs_().getSpreadsheetTimeZone();
  const textAt = (row, name) => {
    const idx = t.col[name];
    return idx === undefined || row[idx] == null ? '' : String(row[idx]);
  };
  const list = [];
  t.rows.forEach((r, i) => {
    const item = {
      rowNum: i + 2,
      uniqueId: toText_(r[t.col['ID']]),
      timestamp: formatDateTime_(r[t.col['제출일시']], tz),
      activity: toText_(r[t.col['창체활동']]),
      date: formatDate_(r[t.col['날짜']], tz),
      check: toText_(r[t.col['체크']]),
      studentId: normalizeId_(r[t.col['학번']]),
      content: textAt(r, '소감문'),
      feedback: textAt(r, '피드백'),
      teacherView: textAt(r, '교사시점')
    };
    if (item.uniqueId || item.content) list.push(item);
  });
  return { table: t, list: list };
}

/**
 * 학생에게 보낼 때: rowNum을 빼고 문자열만 보냅니다. (Date 객체는 google.script.run으로 보낼 수 없음)
 * 교사 시점 글은 교사만 보는 글이라 학생에게는 보내지 않습니다.
 */
function toClient_(r) {
  return {
    uniqueId: r.uniqueId, timestamp: r.timestamp, activity: r.activity, date: r.date,
    check: r.check, studentId: r.studentId, content: r.content, feedback: r.feedback
  };
}

/** 교사에게 보낼 때: 학생용 정보 + 교사 시점 글 */
function toAdminClient_(r) {
  const item = toClient_(r);
  item.teacherView = r.teacherView;
  return item;
}

/** 정렬: 날짜 최신순, 같은 날짜면 나중에 적힌 행이 위 */
function byDateDesc_(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.rowNum - a.rowNum;
}

/** 세션 만들기: 토큰(무작위 UUID)을 키로 캐시에 역할 정보를 저장합니다. */
function createSession_(data) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(SESSION_PREFIX + token, JSON.stringify(data), SESSION_TTL_SEC);
  return token;
}

/**
 * 세션 확인: 토큰이 없거나 만료되면 'SESSION_EXPIRED' 오류를 던집니다.
 * (브라우저는 이 오류를 받으면 로그인 화면으로 돌아갑니다)
 * role을 넘기면 그 역할이 아닐 때 거부합니다.
 */
function requireSession_(token, role) {
  const cache = CacheService.getScriptCache();
  const key = SESSION_PREFIX + String(token || '');
  const raw = token ? cache.get(key) : null;
  if (!raw) throw new Error('SESSION_EXPIRED');
  const session = JSON.parse(raw);
  if (role && session.role !== role) throw new Error('이 기능을 쓸 권한이 없어요.');
  cache.put(key, raw, SESSION_TTL_SEC);   // 사용할 때마다 유지 시간 연장
  return session;
}

/** 여러 사람이 동시에 저장해도 데이터가 꼬이지 않도록 스크립트 잠금을 걸고 실행합니다. */
function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 15000)) {
    throw new Error('지금 저장하는 사람이 많아요. 잠시 후 다시 시도하세요.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 스크립트 속성의 '학생 초기 비밀번호' (없으면 1234) */
function getDefaultStudentPassword_() {
  return getAppProperty_('DEFAULT_STUDENT_PASSWORD') || FALLBACK_STUDENT_PASSWORD;
}

/** APP_PROPERTIES에서 항목 정의를 찾습니다. 목록에 없는 키는 거부합니다. */
function findPropDef_(key) {
  const def = APP_PROPERTIES.filter(p => p.key === key)[0];
  if (!def) throw new Error('등록할 수 없는 설정 항목입니다: ' + key);
  return def;
}

/** 설정 화면에 보낼 항목 상태 (원본 값 대신 마스킹된 값) */
function buildPropertyStatus_(def) {
  const value = getAppProperty_(def.key);
  return {
    key: def.key, label: def.label, type: def.type, required: !!def.required, step: def.step,
    hint: def.hint || '', docUrl: def.docUrl || '', placeholder: def.placeholder || '',
    pattern: def.pattern || '', patternMessage: def.patternMessage || '', testable: !!def.testable,
    registered: value !== '', masked: def.showValue ? value : maskValue_(value, def.type)
  };
}

/** 마스킹: 비밀번호나 짧은 값은 길이까지 숨기고, 긴 키는 앞뒤 4자만 보여 줍니다. (예: AIza••••••••4f2c) */
function maskValue_(value, type) {
  const v = String(value || '');
  if (!v) return '';
  if (type === 'password' || v.length < 12) return '••••••••';
  return v.slice(0, 4) + '••••••••' + v.slice(-4);
}

/**
 * 구글 시트 편집자만 통과시킵니다.
 * 시트 메뉴의 대화상자에서 부르면 편집자 본인 계정으로 실행되어 이메일을 확인할 수 있고,
 * 웹 앱으로 접속한 학생은 이메일이 비어 있거나 편집자 목록에 없어서 차단됩니다.
 */
function assertSheetEditor_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (email) {
    const ss = getSs_();
    const allowed = ss.getEditors().map(u => String(u.getEmail()).toLowerCase());
    const owner = ss.getOwner();
    if (owner) allowed.push(String(owner.getEmail()).toLowerCase());
    if (allowed.indexOf(email) > -1) return;
  }
  throw new Error('이 기능은 구글 시트 편집자만 쓸 수 있어요. 구글 시트 상단 [📚 소감문 관리] 메뉴에서 실행하세요.');
}

/** 날짜 값을 'yyyy-MM-dd' 문자열로 (시트의 시간대 기준). 2026.3.12 같은 텍스트 날짜도 맞춰 줍니다. */
function formatDate_(value, tz) {
  if (value === '' || value == null) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, tz || getSs_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : s;
}

/** 제출일시 표시용 문자열 */
function formatDateTime_(value, tz) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, tz, 'yyyy-MM-dd HH:mm');
  }
  return toText_(value);
}

/** 값을 앞뒤 공백 없는 문자열로 */
function toText_(value) {
  return value == null ? '' : String(value).trim();
}

/** 학번 정리: 숫자로 저장된 1101도 '1101' 문자열로 맞춥니다. */
function normalizeId_(value) {
  if (value == null) return '';
  if (typeof value === 'number') return String(Math.round(value));
  return String(value).trim();
}

/**
 * 시트에 글을 쓸 때 수식·숫자·날짜로 바뀌지 않게 보호합니다.
 * 예) '=IMPORTXML(...)'(수식 주입), '- 느낀 점'(#ERROR!), '2026.3.12'(날짜로 변환) → 맨 앞에 ' 를 붙여 글자로 저장
 */
function safeText_(value) {
  const s = value == null ? '' : String(value);
  const risky = /^[=+\-@']/.test(s) ||
    /^\s*[\d.,]+\s*%?\s*$/.test(s) ||
    /^\s*\d{1,4}\s*[.\-\/]\s*\d{1,2}(\s*[.\-\/]\s*\d{1,4})?\.?\s*$/.test(s) ||
    /^\s*(true|false)\s*$/i.test(s);
  return risky ? '\'' + s : s;
}

/** 텍스트 서식을 지정한 뒤 값을 씁니다. (학번·비밀번호·ID의 앞자리 0 보존) */
function setTextCell_(range, value) {
  range.setNumberFormat('@').setValue(String(value));
  return range;
}

/** base가 이미 쓰였으면 _2, _3을 붙여 고유한 ID를 만듭니다. */
function uniqueId_(base, used) {
  let id = base;
  let n = 2;
  while (used[id]) id = base + '_' + (n++);
  return id;
}

/**
 * 받침에 맞는 조사를 고릅니다. (예: josa_('비밀번호', '을/를') → '를', josa_('학번', '으로/로') → '으로')
 * '으로/로'는 받침이 ㄹ이면 '로'를 씁니다. (예: '서울로')
 */
function josa_(word, pair) {
  const parts = pair.split('/');
  const w = String(word);
  const code = w.charCodeAt(w.length - 1);
  if (code < 0xAC00 || code > 0xD7A3) return parts[1];
  const batchim = (code - 0xAC00) % 28;
  if (pair === '으로/로') return batchim === 0 || batchim === 8 ? parts[1] : parts[0];
  return batchim === 0 ? parts[1] : parts[0];
}

/** 열 번호 → 열 문자 (1 → A, 27 → AA) */
function columnLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}