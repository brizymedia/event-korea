/**
 * 이벤트 코리아 — 이벤트인 명단 서버 (Google Apps Script)
 *
 * 하는 일 둘.
 *   1. 명함을 만들거나 앱을 받는 사람의 이름·전화·직군을 「이벤트인 명단」 시트에 남긴다.
 *      POST {action:'lead', name, tel, job, region, src, consent, note}
 *   2. 동의한 사람에게 나라장터 새 행사 입찰을 문자로 알린다 (시간 트리거).
 *      행사 고시 알림판이 매일 만드는 공개 JSON 을 읽어 「새로 뜬 것 · 마감 임박」을 한 통에 담는다.
 *
 * 문자는 알리고(aligo.in) 로 보낸다. 키는 이 파일에 적지 않고 「스크립트 속성」에만 둔다:
 *   ALIGO_KEY      알리고 API 키
 *   ALIGO_ID       알리고 아이디
 *   ALIGO_SENDER   등록된 발신번호 (예 15337295)
 *   TEST_TEL       시험 문자를 받을 내 번호 (예 01012345678)
 * 셋이 없으면 「시험 모드」— 보낼 문구만 로그에 찍고 실제로 보내지 않는다.
 *
 * 설치 방법은 같은 폴더의 README.md 를 보세요.
 */

/** ── 설정 ─────────────────────────────────────────── */
var 폴더이름     = '이벤트 코리아';        // 내 드라이브에 자동으로 생긴다
var 명단이름     = '이벤트인 명단';        // 그 폴더 안에 자동 생성
var 회사         = '이벤트 코리아';
var 포털         = 'https://www.event-korea.co.kr/';
var 알림판JSON   = 'https://brizymedia.github.io/haengsa-board/data/events.json';

var 임박_일      = 3;      // 마감이 이 안에 들어오면 「마감 임박」
var 한번에_최대  = 300;    // 한 번 돌 때 최대 발송 수 (요금 보호)
var 문자바이트   = 90;     // 단문 한도. 넘으면 두 통 요금이 든다
/** ─────────────────────────────────────────────────── */


/* ══ 진입점 ══════════════════════════════════════════ */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'count') return json_({ ok: true, count: 명단수_() });
  return json_({ ok: true, service: 'event-korea-leads', version: 1, time: new Date().toISOString() });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: '잘못된 요청 형식입니다' }); }

  var 자물쇠 = LockService.getScriptLock();
  try {
    자물쇠.waitLock(20000);
    switch (body.action) {
      case 'ping': return json_({ ok: true, version: 1 });
      case 'lead': return json_(등록_(body));
      default:     return json_({ ok: false, error: '알 수 없는 요청입니다' });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    try { 자물쇠.releaseLock(); } catch (_) {}
  }
}


/* ══ 1. 명단 등록 ════════════════════════════════════
   같은 전화번호가 이미 있으면 새 줄을 만들지 않고 그 줄을 갱신한다.
   (명함 만든 사람이 앱도 받으면 출처가 「명함 · 앱」으로 쌓인다)
   열: 등록시각 · 이름 · 전화 · 직군 · 지역 · 출처 · 문자동의 · 최근활동 · 메모 · 마지막문자
══════════════════════════════════════════════════════ */
function 등록_(b) {
  var 이름 = 다듬기_(b.name, 40);
  var 전화 = 전화정리_(b.tel);
  var 직군 = 다듬기_(b.job, 30);
  var 지역 = 다듬기_(b.region, 30);
  var 출처 = 다듬기_(b.src, 20) || '?';
  var 동의 = b.consent === true || b.consent === 'Y' || b.consent === 1 ? 'Y' : 'N';
  var 메모 = 다듬기_(b.note, 200);

  if (!전화) return { ok: false, error: '휴대폰 번호를 확인해 주세요 (010-0000-0000)' };
  if (!이름) return { ok: false, error: '이름을 넣어 주세요' };

  var sh = 명단시트_();
  var 끝 = sh.getLastRow();
  if (끝 >= 2) {
    var 값 = sh.getRange(2, 1, 끝 - 1, 10).getValues();
    for (var i = 0; i < 값.length; i++) {
      if (String(값[i][2]) === 전화) {
        var 줄 = i + 2;
        var 출처들 = String(값[i][5] || '');
        if (출처들.indexOf(출처) < 0) 출처들 = 출처들 ? 출처들 + ' · ' + 출처 : 출처;
        sh.getRange(줄, 2).setValue(이름 || 값[i][1]);
        if (직군) sh.getRange(줄, 4).setValue(직군);
        if (지역) sh.getRange(줄, 5).setValue(지역);
        sh.getRange(줄, 6).setValue(출처들);
        if (동의 === 'Y') sh.getRange(줄, 7).setValue('Y');   // 한 번 동의했으면 유지. 거부는 시트에서 손으로
        sh.getRange(줄, 8).setValue(new Date());
        if (메모) sh.getRange(줄, 9).setValue(메모);
        return { ok: true, new: false, count: 끝 - 1 };
      }
    }
  }
  sh.appendRow([new Date(), 이름, 전화, 직군, 지역, 출처, 동의, new Date(), 메모, '']);
  return { ok: true, new: true, count: 끝 };   // 머리글 빼고 이번 사람 포함한 수
}

function 명단수_() {
  var sh = 명단시트_();
  return Math.max(0, sh.getLastRow() - 1);
}


/* ══ 2. 입찰 문자 ════════════════════════════════════
   시간 트리거로 돈다 (README 의 「트리거걸기」). 흐름:
     알림판 JSON → 마지막 확인 이후 새로 뜬 입찰 · 3일 안 마감 → 동의한 번호 전부 → 단문 1통
   보낼 게 없는 날은 조용히 넘어간다.
══════════════════════════════════════════════════════ */
function 문자다이제스트() {
  var 속성 = PropertiesService.getScriptProperties();
  var 마지막 = Number(속성.getProperty('마지막확인') || 0);
  var 기준 = 마지막 || (Date.now() - 7 * 86400000);      // 처음이면 지난 7일

  var 입찰 = 새입찰_(기준);
  Logger.log('새 ' + 입찰.새.length + '건 · 임박 ' + 입찰.임박.length + '건');
  if (!입찰.새.length && !입찰.임박.length) { 속성.setProperty('마지막확인', String(Date.now())); return '보낼 것 없음'; }

  var 번호들 = 동의한번호_().slice(0, 한번에_최대);
  var 글 = 문자문구_(입찰.새.length, 입찰.임박.length);
  var 결과 = 문자보내기_(번호들, 글);

  기록_([new Date(), 입찰.새.length, 입찰.임박.length, 번호들.length, 결과.sent, 결과.dry ? '시험' : (결과.error || '보냄'), 글]);
  if (!결과.dry && 결과.sent > 0) 마지막문자표시_(번호들);
  속성.setProperty('마지막확인', String(Date.now()));
  return 글 + '  →  ' + 번호들.length + '명 (' + (결과.dry ? '시험 모드' : 결과.sent + '건 보냄') + ')';
}

function 새입찰_(기준시각) {
  var 응 = UrlFetchApp.fetch(알림판JSON, { muteHttpExceptions: true });
  if (응.getResponseCode() !== 200) throw new Error('알림판을 읽지 못했습니다 ' + 응.getResponseCode());
  var 자료 = JSON.parse(응.getContentText());
  var 지금 = Date.now(), 임박한계 = 지금 + 임박_일 * 86400000;
  var 새 = [], 임박 = [];
  (자료.items || []).forEach(function (x) {
    if (x.kind !== 'bid') return;
    var 마감 = 시각_(x.deadline), 올림 = 시각_(x.posted_at);
    if (마감 && 마감 < 지금) return;                       // 이미 지난 것
    if (올림 && 올림 > 기준시각) 새.push(x);
    else if (마감 && 마감 <= 임박한계) 임박.push(x);
  });
  return { 새: 새, 임박: 임박 };
}

/* 단문 90바이트 안에 맞춘다. 한글은 2바이트. 안 맞으면 짧은 형태로 줄인다. */
function 문자문구_(새, 임박) {
  var 앞 = 새 ? '행사 입찰 새로 ' + 새 + '건' + (임박 ? ', 마감임박 ' + 임박 + '건' : '')
            : '행사 입찰 마감임박 ' + 임박 + '건';
  var 후보 = [
    '[이벤트코리아] ' + 앞 + '\nevent-korea.co.kr/#live',
    '[이벤트코리아] ' + (새 ? '새 행사입찰 ' + 새 + '건' : '마감임박 ' + 임박 + '건') + '\nevent-korea.co.kr/#live',
    '이벤트코리아 입찰 ' + (새 || 임박) + '건 event-korea.co.kr'
  ];
  for (var i = 0; i < 후보.length; i++) if (바이트_(후보[i]) <= 문자바이트) return 후보[i];
  return 후보[후보.length - 1];
}

function 바이트_(s) { var b = 0; for (var i = 0; i < s.length; i++) b += s.charCodeAt(i) > 127 ? 2 : 1; return b; }

function 동의한번호_() {
  var sh = 명단시트_(), 끝 = sh.getLastRow(), 번호 = [];
  if (끝 < 2) return 번호;
  sh.getRange(2, 1, 끝 - 1, 10).getValues().forEach(function (r) {
    if (String(r[6]).toUpperCase() === 'Y' && /^01\d{8,9}$/.test(String(r[2]))) 번호.push(String(r[2]));
  });
  return 번호;
}

/* 알리고 문자 API. 설정이 없으면 시험 모드 — 실제로 보내지 않고 로그만. */
function 문자보내기_(번호들, 글) {
  var 속성 = PropertiesService.getScriptProperties();
  var key = 속성.getProperty('ALIGO_KEY'), id = 속성.getProperty('ALIGO_ID'), sender = 속성.getProperty('ALIGO_SENDER');
  if (!key || !id || !sender) {
    Logger.log('[시험 모드] 알리고 설정 없음. 보낼 문구(' + 바이트_(글) + '바이트):\n' + 글 + '\n대상 ' + 번호들.length + '명');
    return { sent: 0, dry: true };
  }
  if (!번호들.length) return { sent: 0, dry: false };
  var 보냄 = 0, 오류 = '';
  for (var i = 0; i < 번호들.length; i += 500) {            // 알리고는 한 번에 1,000개까지. 여유 있게 500
    var 묶음 = 번호들.slice(i, i + 500);
    var 응 = UrlFetchApp.fetch('https://apis.aligo.in/send/', {
      method: 'post', muteHttpExceptions: true,
      payload: { key: key, user_id: id, sender: sender, receiver: 묶음.join(','), msg: 글, msg_type: 'SMS' }
    });
    var 답 = {};
    try { 답 = JSON.parse(응.getContentText()); } catch (e) { 오류 = '응답 해석 실패'; continue; }
    if (String(답.result_code) === '1') 보냄 += Number(답.success_cnt || 묶음.length);
    else 오류 = String(답.message || 답.result_code);
  }
  return { sent: 보냄, dry: false, error: 오류 };
}

function 마지막문자표시_(번호들) {
  var sh = 명단시트_(), 끝 = sh.getLastRow(); if (끝 < 2) return;
  var 값 = sh.getRange(2, 3, 끝 - 1, 1).getValues(), 지금 = new Date();
  for (var i = 0; i < 값.length; i++) if (번호들.indexOf(String(값[i][0])) >= 0) sh.getRange(i + 2, 10).setValue(지금);
}

/* 시험용: 내 번호(TEST_TEL) 한 곳에만 지금 문구를 보낸다. 요금 1건. */
function 시험문자() {
  var 내번호 = 전화정리_(PropertiesService.getScriptProperties().getProperty('TEST_TEL') || '');
  if (!내번호) { Logger.log('스크립트 속성 TEST_TEL 에 내 번호를 넣어 주세요'); return; }
  var 입찰 = 새입찰_(Date.now() - 7 * 86400000);
  var 글 = 문자문구_(입찰.새.length, 입찰.임박.length);
  var r = 문자보내기_([내번호], 글);
  Logger.log(JSON.stringify(r) + '\n' + 글);
}

/* 매주 월요일 아침 9시. 매일로 바꾸려면 everyWeeks(1).onWeekDay(...) 를 everyDays(1) 로. */
function 트리거걸기() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === '문자다이제스트') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('문자다이제스트').timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  Logger.log('매주 월요일 09시에 문자다이제스트 가 돕니다');
}


/* ══ 시트 · 폴더 ═════════════════════════════════════ */
function 명단시트_() {
  return 장_(명단이름, '명단',
    ['등록시각', '이름', '전화', '직군', '지역', '출처', '문자동의', '최근활동', '메모', '마지막문자'], '#E1EAE2');
}
function 기록_(줄) {
  장_(명단이름, '문자 발송 기록', ['시각', '새 입찰', '마감 임박', '대상', '보낸 수', '결과', '문구'], '#FBF0D5').appendRow(줄);
}

function 장_(파일이름, 장이름, 머리, 색) {
  var ss = 파일_(파일이름);
  var sh = ss.getSheetByName(장이름);
  if (sh) return sh;
  sh = ss.insertSheet(장이름);
  sh.appendRow(머리);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 머리.length).setFontWeight('bold').setBackground(색);
  // 처음 만들 때 딸려온 빈 「시트1」은 치운다
  var 기본 = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (기본 && ss.getSheets().length > 1) { try { ss.deleteSheet(기본); } catch (_) {} }
  return sh;
}

function 파일_(이름) {
  var 폴더 = 폴더_();
  var it = 폴더.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext()) { var f = it.next(); if (f.getName() === 이름) return SpreadsheetApp.open(f); }
  var ss = SpreadsheetApp.create(이름);
  DriveApp.getFileById(ss.getId()).moveTo(폴더);
  return ss;
}

function 폴더_() {
  var 부모 = DriveApp.getRootFolder();
  var it = 부모.getFoldersByName(폴더이름);
  return it.hasNext() ? it.next() : 부모.createFolder(폴더이름);
}


/* ══ 잔손질 ══════════════════════════════════════════ */
function 다듬기_(v, 길이) { if (v === null || v === undefined) return ''; return String(v).replace(/[\r\n\t]/g, ' ').trim().slice(0, 길이); }

/* 010-1234-5678 · 010 1234 5678 · +82 10 1234 5678 → 01012345678. 휴대폰이 아니면 빈 값 */
function 전화정리_(v) {
  var d = String(v || '').replace(/[^0-9]/g, '');
  if (d.indexOf('8210') === 0) d = '0' + d.slice(2);
  return /^01[016789]\d{7,8}$/.test(d) ? d : '';
}

function 시각_(s) {
  if (!s) return 0;
  var m = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s));
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }


/* ══════════════════════════════════════════════════════════════
   설치가 잘 됐는지 눈으로 보는 함수. 편집기에서 「점검」을 고르고 「실행」.
   처음이면 권한 창이 뜹니다 — 승인하면 됩니다.
══════════════════════════════════════════════════════════════ */
function 점검() {
  var sh = 명단시트_();
  Logger.log('명단 시트 : ' + sh.getParent().getUrl());
  Logger.log('등록된 사람: ' + 명단수_() + '명');
  var 속성 = PropertiesService.getScriptProperties();
  ['ALIGO_KEY', 'ALIGO_ID', 'ALIGO_SENDER', 'TEST_TEL'].forEach(function (k) { Logger.log(k + ': ' + (속성.getProperty(k) ? '있음' : '── 없음 (문자는 시험 모드) ──')); });
  var 입찰 = 새입찰_(Date.now() - 7 * 86400000);
  Logger.log('지난 7일 새 입찰 ' + 입찰.새.length + '건 · 3일 안 마감 ' + 입찰.임박.length + '건');
  Logger.log('보낼 문구: ' + 문자문구_(입찰.새.length, 입찰.임박.length));
}

/* 시험 등록 한 줄. 실제 영업 전에 「시험기록지우기」로 지우세요. */
function 시험등록() {
  Logger.log(JSON.stringify(등록_({ name: '[시험] 김담당', tel: '010-0000-0000', job: '음향', region: '전남', src: '시험', consent: true })));
}
function 시험기록지우기() {
  var sh = 명단시트_(), 끝 = sh.getLastRow(), n = 0;
  if (끝 < 2) return;
  var 값 = sh.getRange(2, 1, 끝 - 1, 10).getValues();
  for (var i = 값.length - 1; i >= 0; i--) if (String(값[i][1]).indexOf('[시험]') >= 0 || String(값[i][5]) === '시험') { sh.deleteRow(i + 2); n++; }
  Logger.log('시험 기록 ' + n + '줄 지움');
}
