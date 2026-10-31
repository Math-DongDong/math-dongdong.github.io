/**
 * ==========================================================
 *  학급 자리 배치 시스템 - 서버 코드 (code.gs)
 * ==========================================================
 */

// ▼ 자리 규칙(고급설정: 분리 / 근접 배치) 시트 설정
const RULE_SHEET_NAME = '분리규칙';
const RULE_HEADERS = ['규칙유형', '학생번호목록', '학생이름', '적용방향', '수정일시'];

// 방향 코드 ↔ 한글 라벨 (시트에는 사람이 읽기 쉬운 한글로 저장)
const DIR_LABELS = { v: '상하', h: '좌우', d: '대각선' };
// 규칙 유형 코드 ↔ 한글 라벨
const TYPE_LABELS = { separate: '분리', together: '근접' };

// ▼ 최근 랜덤 배치의 규칙 충족 결과 (교사용 고급설정 창에서만 확인)
//    민감 정보가 아닌 '내부 기록용' 값이라 별도 설정 화면 없이 코드에서만 관리합니다.
const LAST_CHECK_KEY = 'LAST_PLACEMENT_CHECK';

/**
 * 구글 시트 열릴 때 커스텀 메뉴 생성
 * - 고급설정(분리·근접 배치 규칙)은 웹 앱이 아닌 이 메뉴에서만 편집/확인
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎲 자리 배치 시스템')
    .addItem('DB 세팅 및 초기화 (샘플데이터 포함)', 'setupDatabase')
    .addSeparator()
    .addItem('⚙️ 고급설정 (분리·근접 배치 규칙)', 'openAdvancedSettings')
    .addToUi();
}

/**
 * 웹앱 접속 시 index.html 파일 렌더링
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('학급 자리 배치 시스템')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * [메뉴] 고급설정 화면(advanced.html)을 구글 시트 위 모달 창으로 열기
 */
function openAdvancedSettings() {
  const html = HtmlService.createHtmlOutputFromFile('advanced')
    .setWidth(560)
    .setHeight(740);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ 고급설정 · 분리 및 짝꿍 도움(근접) 규칙');
}

/**
 * 고급설정 화면용 초기 데이터
 * (학생 명단 + 저장된 규칙 + 최근 랜덤 배치 결과를 한 번에 전달)
 */
function getAdvancedSettingsData() {
  return {
    students: getStudents(),
    rules: getSeparationRules(),
    lastCheck: getLastPlacementCheck_()
  };
}

/**
 * 데이터베이스(시트) 초기화 및 샘플 데이터 입력
 * - 학생명단 : 샘플 30명으로 덮어씀
 * - 배치이력 : 없을 때만 헤더 생성 (기존 이력 보존)
 * - 분리규칙 : 없을 때만 헤더 생성, 구버전 4열이면 5열로 자동 업그레이드 (기존 규칙 보존)
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 학생명단 시트 생성/초기화
  let studentSheet = ss.getSheetByName('학생명단');
  if (!studentSheet) {
    studentSheet = ss.insertSheet('학생명단');
  } else {
    studentSheet.clear();
  }

  // 헤더 및 예시 데이터 넣기 (30명 데이터)
  const studentHeaders = ['번호', '이름', '비고'];
  const sampleStudents = [
    [1, '강민준', ''], [2, '고윤아', ''], [3, '김도윤', ''], [4, '김서연', ''],
    [5, '김동현', ''], [6, '박지민', ''], [7, '박준우', ''], [8, '배수아', ''],
    [9, '백시우', ''], [10, '서아린', ''], [11, '성현우', ''], [12, '송지후', ''],
    [13, '신유진', ''], [14, '안재현', ''], [15, '양하은', ''], [16, '오건우', ''],
    [17, '유예원', ''], [18, '윤도현', ''], [19, '이서준', ''], [20, '이채원', ''],
    [21, '임지호', ''], [22, '장민서', ''], [23, '정예준', ''], [24, '조수빈', ''],
    [25, '최현준', ''], [26, '한지아', ''], [27, '허준서', ''], [28, '황유나', ''],
    [29, '구본욱', ''], [30, '권나은', '']
  ];

  studentSheet.getRange(1, 1, 1, studentHeaders.length).setValues([studentHeaders])
    .setBackground('#4F46E5').setFontColor('#FFFFFF').setFontWeight('bold');
  studentSheet.getRange(2, 1, sampleStudents.length, studentHeaders.length).setValues(sampleStudents);

  // 2. 배치이력 시트 생성/초기화
  let historySheet = ss.getSheetByName('배치이력');
  if (!historySheet) {
    historySheet = ss.insertSheet('배치이력');
  }
  if (historySheet.getLastRow() === 0) {
    const historyHeaders = ['배치일시', '배치제목', '배치데이터(JSON)'];
    historySheet.getRange(1, 1, 1, historyHeaders.length).setValues([historyHeaders])
      .setBackground('#10B981').setFontColor('#FFFFFF').setFontWeight('bold');
  }

  // 3. 분리규칙 시트 생성 및 헤더 정비 (기존 규칙 보존)
  getOrCreateRuleSheet_();

  SpreadsheetApp.getUi().alert('DB 세팅이 완료되었습니다! 30명의 샘플 학생 데이터가 생성되었습니다.\n(분리·근접 배치 규칙 탭도 준비되었습니다.)');
}

/**
 * 학생 명단 가져오기
 */
function getStudents() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('학생명단');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const students = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1]) { // 이름이 있는 경우만
      students.push({
        id: Number(data[i][0]) || i,
        name: String(data[i][1]).trim(),
        note: data[i][2] ? String(data[i][2]) : ''
      });
    }
  }
  return students;
}

/**
 * 최종 배치 결과 저장하기
 */
function saveResult(title, layoutJson) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('배치이력');
  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName('배치이력');
  }

  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([now, title, layoutJson]);
  return '저장 완료';
}

/**
 * 이전 배치 이력 목록 가져오기
 */
function getHistoryList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('배치이력');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const list = [];
  for (let i = data.length - 1; i >= 1; i--) {
    list.push({
      rowIndex: i + 1,
      date: Utilities.formatDate(new Date(data[i][0]), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      title: data[i][1],
      json: data[i][2]
    });
  }
  return list;
}

// ==========================================================
// ▼ 자리 배치 규칙(분리 / 근접·짝꿍도움) 관련 함수
// ==========================================================

/**
 * [내부용] 분리규칙 시트를 찾고, 없으면 헤더와 함께 새로 만든다.
 * - 구버전(4열: 학생번호목록이 1열) 시트인 경우 앞에 '규칙유형' 열을 자동 추가하여 마이그레이션
 * - 학생번호목록 열(2열)은 '텍스트' 서식으로 고정
 */
function getOrCreateRuleSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RULE_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(RULE_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RULE_HEADERS.length).setValues([RULE_HEADERS])
      .setBackground('#E11D48').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.getRange(2, 2, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 90);
    sheet.setColumnWidth(2, 130);
    sheet.setColumnWidth(3, 240);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(5, 150);
  } else {
    // 구버전 4열 헤더('학생번호목록'으로 시작)인 경우 1열 앞에 '규칙유형' 열 삽입
    const firstHeader = String(sheet.getRange(1, 1).getDisplayValue()).trim();
    if (firstHeader === '학생번호목록') {
      sheet.insertColumnBefore(1);
      sheet.getRange(1, 1, 1, RULE_HEADERS.length).setValues([RULE_HEADERS])
        .setBackground('#E11D48').setFontColor('#FFFFFF').setFontWeight('bold');
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const defaultTypes = [];
        for (let r = 2; r <= lastRow; r++) defaultTypes.push(['분리']);
        sheet.getRange(2, 1, lastRow - 1, 1).setValues(defaultTypes);
      }
      sheet.setColumnWidth(1, 90);
    }
    sheet.getRange(2, 2, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
  }
  return sheet;
}

/**
 * [내부용] "3, 7, 12" 같은 문자열에서 학생 번호만 뽑아 중복 없는 숫자 배열로 변환
 */
function parseIdList_(text) {
  const ids = [];
  String(text || '').split(/[^0-9]+/).forEach(function(t) {
    const n = Number(t);
    if (t !== '' && !isNaN(n) && ids.indexOf(n) === -1) ids.push(n);
  });
  return ids;
}

/**
 * [내부용] 시트에 적힌 규칙유형 문자열을 코드로 변환 ('separate' | 'together')
 */
function parseRuleType_(text) {
  const t = String(text || '').trim();
  if (t.indexOf('근접') !== -1 || t.indexOf('도움') !== -1 || t.indexOf('짝꿍') !== -1 || t === 'together') {
    return 'together';
  }
  return 'separate';
}

/**
 * 저장된 배치 규칙 목록 가져오기 (웹 앱 랜덤 배치 + 고급설정 화면 공용)
 * @return {Array<{type:string, ids:number[], dirs:string[]}>}
 *   type : 'separate'(분리 배치) | 'together'(근접·짝꿍 도움 배치)
 *   dirs : 방향 코드 배열 ('v'=상하, 'h'=좌우, 'd'=대각선)
 * - 구버전 4열 시트와 신버전 5열 시트를 모두 호환하여 읽음
 */
function getSeparationRules() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RULE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const lastCol = Math.max(sheet.getLastColumn(), RULE_HEADERS.length);
  const allRows = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getDisplayValues();
  const isLegacy4Col = String(allRows[0][0] || '').trim() === '학생번호목록';

  // 한글 라벨 → 방향 코드 역변환표
  const labelToCode = {};
  Object.keys(DIR_LABELS).forEach(function(code) { labelToCode[DIR_LABELS[code]] = code; });
  labelToCode['대각'] = 'd';

  const rules = [];
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i];
    const type = isLegacy4Col ? 'separate' : parseRuleType_(row[0]);
    const idCol = isLegacy4Col ? row[0] : row[1];
    const dirCol = isLegacy4Col ? row[2] : row[3];

    const ids = parseIdList_(idCol);
    const dirs = [];
    String(dirCol || '').split(/[,\/\s]+/).forEach(function(t) {
      const code = labelToCode[t.trim()];
      if (code && dirs.indexOf(code) === -1) dirs.push(code);
    });
    if (ids.length >= 2 && dirs.length) {
      rules.push({ type: type, ids: ids, dirs: dirs });
    }
  }
  return rules;
}

/**
 * 배치 규칙 전체 저장 (기존 규칙을 지우고 전달받은 목록으로 덮어씀)
 * - 규칙이 바뀌었으므로 이전 랜덤 배치 결과 기록은 초기화
 * @param {Array<{type:string, ids:number[], dirs:string[]}>} rules
 * @return {number} 실제 저장된 규칙 수
 */
function saveSeparationRules(rules) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 동시에 저장해도 데이터가 꼬이지 않도록 잠금
  try {
    const sheet = getOrCreateRuleSheet_();

    // 시트에 이름도 같이 적어 두면 사람이 보기 편하므로 번호→이름 매핑 준비
    const nameMap = {};
    getStudents().forEach(function(s) { nameMap[s.id] = s.name; });

    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const rows = [];

    (rules || []).forEach(function(r) {
      const type = (r.type === 'together') ? 'together' : 'separate';
      const ids = parseIdList_((r.ids || []).join(','));
      const dirs = ['v', 'h', 'd'].filter(function(code) { return (r.dirs || []).indexOf(code) !== -1; });
      if (ids.length < 2 || !dirs.length) return; // 잘못된 규칙은 건너뜀

      rows.push([
        TYPE_LABELS[type],
        ids.join(', '),
        ids.map(function(id) { return nameMap[id] || ('#' + id); }).join(', '),
        dirs.map(function(code) { return DIR_LABELS[code]; }).join(', '),
        now
      ]);
    });

    // 기존 규칙 행 비우기 (헤더는 유지)
    const last = sheet.getLastRow();
    if (last > 1) sheet.getRange(2, 1, last - 1, RULE_HEADERS.length).clearContent();

    if (rows.length) {
      sheet.getRange(2, 1, rows.length, RULE_HEADERS.length).setNumberFormat('@').setValues(rows);
    }

    // 규칙이 바뀌었으니 예전 결과 기록은 의미가 없어 삭제
    PropertiesService.getScriptProperties().deleteProperty(LAST_CHECK_KEY);
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

// ==========================================================
// ▼ 최근 랜덤 배치 결과 기록 (교사 전용 확인용)
// ==========================================================

/**
 * 웹 앱이 랜덤 배치를 마친 뒤 '조용히' 호출하는 함수
 * - 웹 앱 화면에는 아무것도 표시하지 않고, 결과만 서버에 기록
 * - 기록은 구글 시트 [⚙️ 고급설정] 창에서만 확인 가능
 * @param {{ruleCount:number, unmet:Array<{a:number, b:number, dir:string, type:string}>}} result
 */
function reportPlacementResult(result) {
  result = result || {};
  const nameMap = {};
  getStudents().forEach(function(s) { nameMap[s.id] = s.name; });

  const data = {
    time: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    ruleCount: Number(result.ruleCount) || 0,
    unmet: (result.unmet || []).slice(0, 30).map(function(u) {
      // dir 이 'v,h' 처럼 복수 코드일 수도 있으므로 각각 한글 라벨로 변환
      const dirText = String(u.dir || '')
        .split(',')
        .map(function(c) { return DIR_LABELS[c.trim()] || c.trim(); })
        .filter(Boolean)
        .join('·');
      return {
        type: u.type === 'together' ? 'together' : 'separate',
        a: nameMap[u.a] || ('#' + u.a),
        b: nameMap[u.b] || ('#' + u.b),
        dir: dirText
      };
    })
  };
  PropertiesService.getScriptProperties().setProperty(LAST_CHECK_KEY, JSON.stringify(data));
  return true;
}

/**
 * [내부용] 최근 랜덤 배치 결과 읽기 (기록이 없으면 null)
 */
function getLastPlacementCheck_() {
  const raw = PropertiesService.getScriptProperties().getProperty(LAST_CHECK_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}