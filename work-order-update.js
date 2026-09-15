const STATUS_INFO = {
  WAPPR: 'Work order has been created but not approved.',
  APPR: 'Work order is approved and ready for planning or execution.',
  WSCH: 'Approved but waiting for a schedule.',
  WMATL: 'Work is waiting for required materials.',
  INPRG: 'Work has started.',
  COMP: 'Physical work is finished, but administrative review may remain.',
  CLOSE: 'Work order is finalized and normally cannot be changed.',
  CAN: 'Work order has been canceled.'
};
const LOG_TYPES = { APPTNOTE: 'Appointment Note', CLIENTNOTE: 'Client Note', UPDATE: 'Update', WORK: 'Work' };
const params = new URLSearchParams(window.location.search);
const envName = (params.get('env') || '').trim();
const wonum = (params.get('wonum') || params.get('workOrderNumber') || '').trim();
const siteid = (params.get('siteid') || 'BEDFORD').trim();
const cacheKey = `maximo-work-order-draft:${envName}:${siteid}:${wonum}`;
const assetViewerLink = document.querySelector('a[href="index.html"]'); if (assetViewerLink && envName) assetViewerLink.href = `index.html?env=${encodeURIComponent(envName)}`;

const el = {
  content: document.querySelector('#content'), loadingState: document.querySelector('#loadingState'), errorState: document.querySelector('#errorState'),
  errorMessage: document.querySelector('#errorMessage'), message: document.querySelector('#message'), detailGrid: document.querySelector('#detailGrid'),
  status: document.querySelector('#status'), statusMemo: document.querySelector('#statusMemo'), statusHelp: document.querySelector('#statusHelp'),
  currentStatusBadge: document.querySelector('#currentStatusBadge'), draftBadge: document.querySelector('#draftBadge'), worklogRows: document.querySelector('#worklogRows'),
  addWorklogButton: document.querySelector('#addWorklogButton'), submitButton: document.querySelector('#submitButton'), clearDraftButton: document.querySelector('#clearDraftButton'),
  refreshButton: document.querySelector('#refreshButton'), loadingOverlay: document.querySelector('#loadingOverlay'), loadingText: document.querySelector('#loadingText'),
  changeSummary: document.querySelector('#changeSummary'), pageSubtitle: document.querySelector('#pageSubtitle')
};
let workOrder = null;
let serverWorklogs = [];
let draft = { status: '', memo: '', worklogs: {} };

function text(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
function showMessage(message, type = 'success') {
  el.message.textContent = message; el.message.className = `form-message ${type}-message`; el.message.hidden = false;
  el.message.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function hideMessage() { el.message.hidden = true; }
function apiError(body, status) {
  const maximo = body?.maximoResponse?.Error || body?.maximoResponse?.['oslc:Error'] || body?.Error || body?.['oslc:Error'] || {};
  const message = body?.message || body?.error || maximo?.message || maximo?.['oslc:message'] || `API request failed (${status}).`;
  const reasonCode = body?.reasonCode || maximo?.reasonCode || maximo?.['spi:reasonCode'];
  if (!reasonCode) return message;
  const cleanMessage = String(message).replace(new RegExp(`^${reasonCode}\\s*-?\\s*`, 'i'), '');
  return `${reasonCode} - ${cleanMessage}`;
}
function loadDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey));
    if (stored && typeof stored === 'object') {
      draft = { status: '', memo: '', worklogs: {}, ...stored };
    }
  } catch {
    /* Ignore invalid browser cache and continue loading from Maximo. */
  }
}
function saveDraft() {
  localStorage.setItem(cacheKey, JSON.stringify(draft));
  el.draftBadge.hidden = !hasDraft(); updateSummary();
}
function hasDraft() { return Boolean(draft.status || draft.memo || Object.keys(draft.worklogs || {}).length); }
function clearDraft() { draft = { status: '', memo: '', worklogs: {} }; localStorage.removeItem(cacheKey); el.draftBadge.hidden = true; }
function makeTempId() { return `new-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function worklogKey(item) { return item.worklogid ? `existing-${item.worklogid}` : item._draftId; }
function normalizeItem(item) { return { worklogid: item.worklogid || null, description: item.description || '', description_longdescription: item.description_longdescription || '', logtype: item.logtype || 'WORK' }; }

function addDetail(label, value, wide = false) {
  const node = document.createElement('article'); node.className = `detail-item${wide ? ' wide' : ''}`;
  const l = document.createElement('p'); l.className = 'detail-label'; l.textContent = label;
  const v = document.createElement('p'); v.className = 'detail-value'; v.textContent = text(value);
  node.append(l, v); el.detailGrid.append(node);
}
function renderHeader() {
  el.detailGrid.replaceChildren();
  [['Work Order Number', workOrder.wonum], ['Site', workOrder.siteid], ['Organization', workOrder.orgid], ['Asset Number', workOrder.assetnum],
   ['Location', workOrder.location], ['Priority', workOrder.wopriority], ['Work Type', workOrder.worktype], ['Failure Code', workOrder.failurecode],
   ['Reported By', workOrder.reportedby], ['Description', workOrder.description, true]].forEach(([a,b,c]) => addDetail(a,b,c));
  el.currentStatusBadge.textContent = workOrder.status_description || workOrder.status || '—';
  el.pageSubtitle.textContent = `Work Order ${workOrder.wonum} • Site ${workOrder.siteid}`;
}
function setStatusHelp() { el.statusHelp.textContent = el.status.value ? STATUS_INFO[el.status.value] : 'No status change selected.'; }

function mergedWorklogs() {
  const result = serverWorklogs.map(item => {
    const key = worklogKey(item); const cached = draft.worklogs?.[key];
    return { ...item, ...(cached || {}), _key: key, _isNew: false };
  });
  Object.entries(draft.worklogs || {}).forEach(([key, item]) => {
    if (key.startsWith('new-')) result.push({ ...item, _draftId: key, _key: key, _isNew: true });
  });
  return result;
}
function createInput(tag, value, onChange) {
  const input = document.createElement(tag); input.value = value || ''; input.addEventListener('input', onChange); input.addEventListener('change', onChange); return input;
}
function updateDraftWorklog(key, original, field, value) {
  const base = draft.worklogs[key] || normalizeItem(original); base[field] = value; draft.worklogs[key] = base; saveDraft();
}
function renderWorklogs() {
  el.worklogRows.replaceChildren(); const items = mergedWorklogs();
  if (!items.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5; td.className = 'empty-table'; td.textContent = 'No worklogs found. Click “Add Worklog” to create one.'; tr.append(td); el.worklogRows.append(tr); return; }
  items.forEach(item => {
    const tr = document.createElement('tr'); const key = item._key;
    const typeTd = document.createElement('td'); const select = document.createElement('select');
    Object.entries(LOG_TYPES).forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = `${value} — ${label}`; select.append(option); });
    select.value = item.logtype || 'WORK'; select.addEventListener('change', () => updateDraftWorklog(key, item, 'logtype', select.value)); typeTd.append(select);
    const descTd = document.createElement('td'); const desc = createInput('textarea', item.description, () => updateDraftWorklog(key, item, 'description', desc.value)); desc.placeholder = 'Short worklog summary'; descTd.append(desc);
    const longTd = document.createElement('td'); const long = createInput('textarea', item.description_longdescription, () => updateDraftWorklog(key, item, 'description_longdescription', long.value)); long.placeholder = 'Detailed work performed, observation, or update'; longTd.append(long);
    const infoTd = document.createElement('td'); infoTd.className = 'worklog-meta'; infoTd.textContent = item._isNew ? 'New worklog • Draft only' : `Worklog ID: ${item.worklogid || '—'}\nCreated by: ${item.createby || '—'}\nCreated: ${item.createdate ? new Date(item.createdate).toLocaleString() : '—'}`; infoTd.style.whiteSpace = 'pre-line';
    const actionTd = document.createElement('td'); actionTd.className = 'row-actions'; const button = document.createElement('button'); button.type = 'button'; button.className = 'icon-button danger';
    button.textContent = item._isNew ? 'Remove' : 'Revert'; button.addEventListener('click', () => { delete draft.worklogs[key]; saveDraft(); renderWorklogs(); }); actionTd.append(button);
    tr.append(typeTd, descTd, longTd, infoTd, actionTd); el.worklogRows.append(tr);
  });
}
function updateSummary() {
  const changedLogs = Object.keys(draft.worklogs || {}).length; const statusText = draft.status ? `Status → ${draft.status}` : 'No status change';
  el.changeSummary.textContent = `${statusText} • ${changedLogs} worklog row${changedLogs === 1 ? '' : 's'} staged. Changes are saved locally until submitted.`;
}
function addNewWorklog() {
  const key = makeTempId(); draft.worklogs[key] = { _draftId: key, description: '', description_longdescription: '', logtype: 'WORK' }; saveDraft(); renderWorklogs();
}
async function fetchJson(url, options) { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(body, response.status)); return body; }
async function loadAll({ keepMessage = false } = {}) {
  if (!keepMessage) hideMessage(); el.content.hidden = true; el.errorState.hidden = true; el.loadingState.hidden = false;
  if (!envName) { el.loadingState.hidden=true; el.errorState.hidden=false; el.errorMessage.textContent='Missing env parameter. Example: work-order-update.html?env=demo-coh&wonum=1234'; return; }
  if (!wonum) { el.loadingState.hidden = true; el.errorState.hidden = false; el.errorMessage.textContent = 'Missing work order number. Open this page using work-order-update.html?wonum=1234'; return; }
  try {
    const [woBody, logsBody] = await Promise.all([
      fetchJson(`/api/work-order-detail?env=${encodeURIComponent(envName)}&wonum=${encodeURIComponent(wonum)}&siteid=${encodeURIComponent(siteid)}`, { cache: 'no-store' }),
      fetchJson(`/api/worklogs?env=${encodeURIComponent(envName)}&wonum=${encodeURIComponent(wonum)}&siteid=${encodeURIComponent(siteid)}`, { cache: 'no-store' })
    ]);
    workOrder = woBody.data; serverWorklogs = logsBody.data || []; renderHeader();
    el.status.value = draft.status || ''; el.statusMemo.value = draft.memo || ''; setStatusHelp(); renderWorklogs(); updateSummary(); el.draftBadge.hidden = !hasDraft();
    el.loadingState.hidden = true; el.content.hidden = false;
  } catch (error) { el.loadingState.hidden = true; el.errorState.hidden = false; el.errorMessage.textContent = error.message; }
}
function validateChanges() {
  const changed = Object.values(draft.worklogs || {});
  for (let i = 0; i < changed.length; i += 1) {
    const item = changed[i]; if (!String(item.description || '').trim()) return `Worklog row ${i + 1}: Summary is required.`;
    if (!String(item.description_longdescription || '').trim()) return `Worklog row ${i + 1}: Worklog Detail is required.`;
    if (!LOG_TYPES[item.logtype]) return `Worklog row ${i + 1}: Select a valid Log Type.`;
  }
  if (!draft.status && changed.length === 0) return 'There are no changes to submit.';
  return '';
}
async function submitChanges() {
  hideMessage(); const validation = validateChanges(); if (validation) { showMessage(validation, 'error'); return; }
  const changedLogs = Object.values(draft.worklogs || {}).map(normalizeItem);
  const description = `${draft.status ? `change status to ${draft.status}` : 'keep the current status'} and submit ${changedLogs.length} worklog change${changedLogs.length === 1 ? '' : 's'}`;
  if (!await AppUI.confirmAction({ title: `Submit Work Order ${wonum}?`, message: `Environment ${envName}. This will ${description}.`, confirmText: 'Submit Changes' })) return;
  el.loadingText.textContent = 'Submitting work order and worklog changes to Maximo…'; el.loadingOverlay.hidden = false; el.submitButton.disabled = true;
  try {
    const response = await fetch('/api/work-order-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ env: envName, wonum, siteid, status: draft.status, memo: draft.memo, worklogs: changedLogs }) });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(apiError(body, response.status));
    clearDraft(); el.status.value = ''; el.statusMemo.value = ''; await loadAll({ keepMessage: true });
    showMessage(body.message || 'Work order changes submitted successfully.', 'success'); AppUI.toast('Work order changes were submitted successfully.');
  } catch (error) { showMessage(error.message || 'Unable to submit work order changes.', 'error'); }
  finally { el.loadingOverlay.hidden = true; el.submitButton.disabled = false; }
}

el.status.addEventListener('change', () => { draft.status = el.status.value; saveDraft(); setStatusHelp(); });
el.statusMemo.addEventListener('input', () => { draft.memo = el.statusMemo.value; saveDraft(); });
el.addWorklogButton.addEventListener('click', addNewWorklog);
el.submitButton.addEventListener('click', submitChanges);
el.refreshButton.addEventListener('click', () => loadAll());
el.clearDraftButton.addEventListener('click', async () => { if (!hasDraft() || await AppUI.confirmAction({title:'Clear local draft?',message:'Clear all locally saved changes for this work order?',confirmText:'Clear Draft',danger:true})) { clearDraft(); el.status.value = ''; el.statusMemo.value = ''; setStatusHelp(); renderWorklogs(); updateSummary(); showMessage('Local draft cleared.', 'success'); } });
loadDraft(); loadAll();
