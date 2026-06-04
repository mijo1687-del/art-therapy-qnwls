const ROOT_FOLDER_NAME = '미술치료 일지 DB';
const JOURNAL_SHEET = 'Journals';
const OPTION_SHEET = 'Options';
const JOURNAL_HEADERS = ['id','title','journalDate','place','programName','therapist','photoDate','media','attendeesJson','sessionRowsJson','photoIdsJson','diaryPdfId','ledgerPdfId','submissionPdfId','createdAt','updatedAt'];
const OPTION_HEADERS = ['type','value','createdAt'];
const OPTION_TYPES = ['title','place','programName','therapist','media','attendeeName'];

function doGet(e) {
  const action = (e.parameter.action || 'bootstrap');
  const callback = e.parameter.callback || 'callback';
  let data;
  try {
    if (action === 'bootstrap') data = bootstrap_();
    else if (action === 'getJournal') data = getJournal_(e.parameter.id);
    else if (action === 'addOption') {
      rememberOption_(e.parameter.type, e.parameter.value);
      data = bootstrap_();
    }
    else if (action === 'deleteOption') {
      deleteOption_(e.parameter.type, e.parameter.value);
      data = bootstrap_();
    }
    else data = { error: 'unknown action' };
  } catch (err) {
    data = { error: err.message };
  }
  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(data)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  const action = e.parameter.action;
  const payload = JSON.parse(e.parameter.payload || '{}');
  try {
    if (action === 'saveJournal') saveJournal_(payload);
    else if (action === 'addOption') rememberOption_(payload.type, payload.value);
    else if (action === 'deleteOption') deleteOption_(payload.type, payload.value);
    else if (action === 'createSubmissionPdf') createSubmissionPdf_(payload.id, payload.includeDiary, payload.includeLedger);
    else if (action === 'deleteJournalParts') deleteJournalParts_(payload.id, payload.options || {});
    else throw new Error('unknown action');
    return ContentService.createTextOutput('OK');
  } catch (err) {
    return ContentService.createTextOutput(`ERROR: ${err.message}`);
  }
}

function bootstrap_() {
  const store = ensureStore_();
  return {
    options: getOptions_(),
    journals: listJournals_(),
    rootFolderUrl: store.root.getUrl(),
    photoFolderUrl: getPhotoFolder_().getUrl(),
    pdfFolderUrl: getPdfFolder_().getUrl()
  };
}

function listJournals_() {
  return readObjects_(getSheet_(JOURNAL_SHEET))
    .map(row => ({
      id: row.id,
      title: row.title,
      journalDate: row.journalDate,
      photoDate: row.photoDate,
      place: row.place,
      programName: row.programName,
      updatedAt: row.updatedAt,
      diaryPdfUrl: fileUrl_(row.diaryPdfId),
      ledgerPdfUrl: fileUrl_(row.ledgerPdfId),
      submissionPdfUrl: fileUrl_(row.submissionPdfId)
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getJournal_(id) {
  const row = findJournal_(id);
  if (!row) throw new Error('일지를 찾을 수 없습니다.');
  const photoIds = parseJson_(row.photoIdsJson, []);
  return Object.assign({}, row, {
    attendees: parseJson_(row.attendeesJson, []),
    sessionRows: parseJson_(row.sessionRowsJson, []),
    photos: photoIds.map(id => ({ id, name: fileName_(id), url: fileUrl_(id), previewUrl: thumbnailUrl_(id) })),
    diaryPdfUrl: fileUrl_(row.diaryPdfId),
    ledgerPdfUrl: fileUrl_(row.ledgerPdfId),
    submissionPdfUrl: fileUrl_(row.submissionPdfId)
  });
}

function saveJournal_(payload) {
  const now = new Date().toISOString();
  const id = payload.id || Utilities.getUuid();
  const old = payload.id ? findJournal_(payload.id) : null;
  const photoIds = savePhotos_(id, payload.photos || [], old ? parseJson_(old.photoIdsJson, []) : []);
  const row = {
    id,
    title: text_(payload.title) || '미술치료 일지',
    journalDate: text_(payload.journalDate),
    place: text_(payload.place),
    programName: text_(payload.programName),
    therapist: text_(payload.therapist),
    photoDate: text_(payload.photoDate),
    media: text_(payload.media),
    attendeesJson: JSON.stringify(payload.attendees || []),
    sessionRowsJson: JSON.stringify(payload.sessionRows || []),
    photoIdsJson: JSON.stringify(photoIds),
    diaryPdfId: old ? old.diaryPdfId : '',
    ledgerPdfId: old ? old.ledgerPdfId : '',
    submissionPdfId: old ? old.submissionPdfId : '',
    createdAt: old ? old.createdAt : now,
    updatedAt: now
  };
  deleteFile_(row.diaryPdfId);
  deleteFile_(row.ledgerPdfId);
  row.diaryPdfId = savePdf_(wrapPdfHtml_(diaryBody_(row)), `${fileBase_(row)}_일지.pdf`);
  row.ledgerPdfId = savePdf_(wrapPdfHtml_(ledgerBody_(row)), `${fileBase_(row)}_사진대장.pdf`);
  upsertJournal_(row);
  rememberOptions_(row, payload.attendees || [], payload.sessionRows || []);
}

function createSubmissionPdf_(id, includeDiary, includeLedger) {
  if (!includeDiary && !includeLedger) throw new Error('포함할 PDF를 선택하세요.');
  const row = findJournal_(id);
  if (!row) throw new Error('일지를 찾을 수 없습니다.');
  deleteFile_(row.submissionPdfId);
  row.submissionPdfId = savePdf_(wrapPdfHtml_(`${includeDiary ? diaryBody_(row) : ''}${includeDiary && includeLedger ? '<div class="page-break"></div>' : ''}${includeLedger ? ledgerBody_(row) : ''}`), `${fileBase_(row)}_제출용.pdf`);
  row.updatedAt = new Date().toISOString();
  upsertJournal_(row);
}

function deleteJournalParts_(id, options) {
  const row = findJournal_(id);
  if (!row) throw new Error('일지를 찾을 수 없습니다.');
  if (options.diaryPdf) { deleteFile_(row.diaryPdfId); row.diaryPdfId = ''; }
  if (options.ledgerPdf) { deleteFile_(row.ledgerPdfId); row.ledgerPdfId = ''; }
  if (options.submissionPdf) { deleteFile_(row.submissionPdfId); row.submissionPdfId = ''; }
  if (options.originalPhotos) { parseJson_(row.photoIdsJson, []).forEach(deleteFile_); row.photoIdsJson = '[]'; }
  if (options.data) deleteJournalRow_(id);
  else { row.updatedAt = new Date().toISOString(); upsertJournal_(row); }
}

function ensureStore_() {
  const props = PropertiesService.getScriptProperties();
  let root = safeFolder_(props.getProperty('ROOT_FOLDER_ID'));
  if (!root) { root = DriveApp.createFolder(ROOT_FOLDER_NAME); props.setProperty('ROOT_FOLDER_ID', root.getId()); }
  let spreadsheet = safeSpreadsheet_(props.getProperty('SPREADSHEET_ID'));
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create(`${ROOT_FOLDER_NAME} 데이터`);
    DriveApp.getFileById(spreadsheet.getId()).moveTo(root);
    props.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  }
  ensureChildFolder_(root, '원본사진');
  ensureChildFolder_(root, 'PDF');
  ensureSheet_(spreadsheet, JOURNAL_SHEET, JOURNAL_HEADERS);
  ensureSheet_(spreadsheet, OPTION_SHEET, OPTION_HEADERS);
  return { root, spreadsheet };
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function getSheet_(name) { return ensureStore_().spreadsheet.getSheetByName(name); }
function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row.some(Boolean)).map(row => {
    const obj = {};
    headers.forEach((key, index) => obj[key] = row[index]);
    return obj;
  });
}
function findJournal_(id) { return readObjects_(getSheet_(JOURNAL_SHEET)).find(row => row.id === id); }
function upsertJournal_(row) {
  const sheet = getSheet_(JOURNAL_SHEET);
  const values = sheet.getDataRange().getValues();
  const line = JOURNAL_HEADERS.map(key => row[key] || '');
  const index = values.findIndex((value, rowIndex) => rowIndex > 0 && value[0] === row.id);
  if (index > 0) sheet.getRange(index + 1, 1, 1, line.length).setValues([line]);
  else sheet.appendRow(line);
}
function deleteJournalRow_(id) {
  const sheet = getSheet_(JOURNAL_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) if (values[i][0] === id) sheet.deleteRow(i + 1);
}

function savePhotos_(journalId, photos, existingIds) {
  const kept = [], added = [], folder = getPhotoFolder_();
  photos.forEach((photo, index) => {
    if (photo.id) { kept.push(photo.id); return; }
    if (!photo.dataUrl) return;
    const file = folder.createFile(dataUrlBlob_(photo.dataUrl, photo.name || `photo_${index + 1}.jpg`));
    file.setName(`${journalId}_${String(index + 1).padStart(3, '0')}_${file.getName()}`);
    added.push(file.getId());
  });
  existingIds.filter(id => !kept.includes(id)).forEach(deleteFile_);
  return kept.concat(added);
}

function diaryBody_(row) {
  const attendees = parseJson_(row.attendeesJson, []);
  const sessionRows = parseJson_(row.sessionRowsJson, []);
  return `<section class="diary-page"><h1>${esc_(row.title || '미술치료 일지')}</h1><table class="diary-table">
    <tr><th>일 시</th><td>${esc_(row.journalDate)}</td><th>프로그램명</th><td>${esc_(row.programName)}</td></tr>
    <tr><th>장 소</th><td>${esc_(row.place)}</td><th>미술치료사</th><td>${esc_(row.therapist)}</td></tr>
    <tr><th>매 체</th><td colspan="3">${esc_(row.media)}</td></tr>
    <tr><th>참 석 자</th><td colspan="3">${attendees.map(item => `${esc_(item.time)} - ${esc_(item.name)}`.replace(/^ - | - $/g, '')).join('<br>')}</td></tr>
    <tr><th>회기 내용</th><td colspan="3" class="session-cell">${sessionRows.map(item => `<div class="session-block"><strong>${esc_(item.name)}</strong><div>${line_(item.content)}</div></div>`).join('')}</td></tr>
  </table></section>`;
}

function ledgerBody_(row) {
  const photoIds = parseJson_(row.photoIdsJson, []);
  const totalPages = Math.max(1, Math.ceil(photoIds.length / 4));
  const pages = [];
  for (let page = 0; page < totalPages; page++) {
    const cells = [];
    for (let i = 0; i < 4; i++) {
      const id = photoIds[page * 4 + i];
      cells.push(`<td>${id ? `<img src="${imageDataUrl_(id)}">` : ''}</td>`);
    }
    pages.push(`<section class="ledger-page"><table class="ledger-table"><tr>${cells[0]}${cells[1]}</tr><tr>${cells[2]}${cells[3]}</tr></table><footer>미술치료 사진대장 / 활동일자 ${esc_(row.photoDate)} / ${page + 1}-${totalPages}</footer></section>`);
  }
  return pages.join('');
}

function wrapPdfHtml_(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:"Malgun Gothic",Arial,sans-serif;color:#111}h1{text-align:center;font-size:22px;margin:0 0 12px}table{border-collapse:collapse;width:100%}.diary-table th,.diary-table td{border:1px solid #111;padding:6px 8px;font-size:12px;line-height:1.55;vertical-align:top}.diary-table th{width:17%;background:#fff5c6;text-align:center}.session-cell{min-height:130mm}.session-block+.session-block{border-top:1px solid #999;margin-top:8px;padding-top:8px}.session-block strong{display:block;margin-bottom:3px}.page-break{page-break-before:always}.ledger-page{page-break-after:always}.ledger-page:last-child{page-break-after:auto}.ledger-table{width:100%;height:232mm;border:2px solid #111;table-layout:fixed}.ledger-table td{width:50%;height:116mm;border:1px solid #111;text-align:center;vertical-align:middle}.ledger-table img{max-width:96%;max-height:112mm;object-fit:contain}footer{text-align:center;font-size:11px;margin-top:6mm}</style></head><body>${body}</body></html>`;
}

function savePdf_(html, fileName) {
  const blob = Utilities.newBlob(html, MimeType.HTML, fileName.replace(/\.pdf$/i, '.html')).getAs(MimeType.PDF).setName(fileName);
  return getPdfFolder_().createFile(blob).getId();
}
function rememberOptions_(row, attendees, sessionRows) {
  rememberOption_('title', row.title); rememberOption_('place', row.place); rememberOption_('programName', row.programName); rememberOption_('therapist', row.therapist);
  splitMedia_(row.media).forEach(item => rememberOption_('media', item));
  attendees.forEach(item => rememberOption_('attendeeName', item.name));
  sessionRows.forEach(item => rememberOption_('attendeeName', item.name));
}
function rememberOption_(type, value) {
  value = text_(value);
  if (!OPTION_TYPES.includes(type) || !value) return;
  const sheet = getSheet_(OPTION_SHEET);
  if (!readObjects_(sheet).some(row => row.type === type && text_(row.value) === value)) sheet.appendRow([type, value, new Date().toISOString()]);
}
function deleteOption_(type, value) {
  value = text_(value);
  const sheet = getSheet_(OPTION_SHEET), values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) if (values[i][0] === type && text_(values[i][1]) === value) sheet.deleteRow(i + 1);
}
function getOptions_() {
  const options = {};
  OPTION_TYPES.forEach(type => options[type] = []);
  readObjects_(getSheet_(OPTION_SHEET)).forEach(row => {
    const value = text_(row.value);
    if (options[row.type] && value && !options[row.type].includes(value)) options[row.type].push(value);
  });
  Object.keys(options).forEach(key => options[key].sort());
  return options;
}
function getPhotoFolder_() { return ensureChildFolder_(ensureStore_().root, '원본사진'); }
function getPdfFolder_() { return ensureChildFolder_(ensureStore_().root, 'PDF'); }
function ensureChildFolder_(parent, name) { const folders = parent.getFoldersByName(name); return folders.hasNext() ? folders.next() : parent.createFolder(name); }
function safeFolder_(id) { try { return id ? DriveApp.getFolderById(id) : null; } catch (e) { return null; } }
function safeSpreadsheet_(id) { try { return id ? SpreadsheetApp.openById(id) : null; } catch (e) { return null; } }
function dataUrlBlob_(dataUrl, fileName) { const parts = dataUrl.split(','), type = (parts[0].match(/data:(.*?);base64/) || [])[1] || 'application/octet-stream'; return Utilities.newBlob(Utilities.base64Decode(parts[1]), type, fileName); }
function imageDataUrl_(id) { const blob = DriveApp.getFileById(id).getBlob(); return `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`; }
function fileUrl_(id) { return id ? `https://drive.google.com/file/d/${id}/view` : ''; }
function thumbnailUrl_(id) { return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w600` : ''; }
function fileName_(id) { try { return DriveApp.getFileById(id).getName(); } catch (e) { return ''; } }
function deleteFile_(id) { if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
function fileBase_(row) { return `${row.journalDate || row.photoDate || ''}_${row.title || '미술치료 일지'}`.replace(/[\\/:*?"<>|]/g, '_').replace(/^_+/, ''); }
function parseJson_(value, fallback) { try { return JSON.parse(value || ''); } catch (e) { return fallback; } }
function text_(value) { return String(value || '').trim(); }
function splitMedia_(value) { return String(value || '').split(/\s*\/\s*|,\s*|，\s*/).map(item => item.trim()).filter(Boolean); }
function esc_(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function line_(value) { return esc_(value).replace(/\n/g, '<br>'); }
