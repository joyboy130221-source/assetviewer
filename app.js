const elements = {
  loading: document.querySelector('#loadingState'), error: document.querySelector('#errorState'),
  empty: document.querySelector('#emptyState'), content: document.querySelector('#assetContent'),
  errorMessage: document.querySelector('#errorMessage'), requestSummary: document.querySelector('#requestSummary'),
  assetNumber: document.querySelector('#assetNumber'), assetDescription: document.querySelector('#assetDescription'),
  assetStatus: document.querySelector('#assetStatus'), summaryGrid: document.querySelector('#summaryGrid'),
  attributeRows: document.querySelector('#attributeRows'), attributeCount: document.querySelector('#attributeCount'),
  attributeSearch: document.querySelector('#attributeSearch'), noAttributes: document.querySelector('#noAttributes'),
  refreshButton: document.querySelector('#refreshButton'), editButton: document.querySelector('#editButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'), submitButton: document.querySelector('#submitButton'),
  editActions: document.querySelector('#editActions'), formMessage: document.querySelector('#assetFormMessage'),
  loadingOverlay: document.querySelector('#saveLoadingOverlay')
};

let currentAsset = null;
let editMode = false;
let draftValues = {};
const query = new URLSearchParams(window.location.search);
const assetId = (query.get('assetId') || '').trim();
if (assetId) document.querySelector('#createWorkOrderLink').href = `work-order.html?assetId=${encodeURIComponent(assetId)}`;

const FRIENDLY_NAMES = {
  assetnum: 'Asset Number', assetid: 'Asset ID', description: 'Description', siteid: 'Site', orgid: 'Organization',
  location: 'Location', status: 'Status', status_description: 'Status Description', assethealth: 'Asset Health',
  isrunning: 'Running', changeby: 'Changed By', changedate: 'Changed Date', totalcost: 'Total Cost',
  ytdcost: 'Year-to-Date Cost', unchargedcost: 'Uncharged Cost', totunchargedcost: 'Total Uncharged Cost',
  installDate: 'Installation Date', installdate: 'Installation Date', purchaseprice: 'Purchase Price',
  serialnum: 'Serial Number', manufacturer: 'Manufacturer', modelnum: 'Model Number', priority: 'Priority'
};
const READ_ONLY_KEYS = new Set(['href', '_rowstamp', 'assetid', 'assetnum', 'siteid', 'orgid', 'status_description']);

function displayName(key) {
  if (FRIENDLY_NAMES[key]) return FRIENDLY_NAMES[key];
  return key.replace(/^_+/, '').replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b(id|url|api|ytd)\b/gi, word => word.toUpperCase()).replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value); if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
  }
  return String(value);
}

function isDateField(key, value) {
  return /(date|time)$/i.test(key) || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value));
}
function isEditable(key, value) { return !READ_ONLY_KEYS.has(key) && value !== null && typeof value !== 'object'; }
function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value); if (Number.isNaN(date.valueOf())) return String(value).slice(0, 10);
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function toMaximoDate(value, original) {
  if (!value) return '';
  if (typeof original === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(original)) {
    const old = new Date(original); const d = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(old.valueOf())) d.setHours(old.getHours(), old.getMinutes(), old.getSeconds(), old.getMilliseconds());
    return d.toISOString();
  }
  return value;
}

function addMetric(label, value) {
  const card = document.createElement('article'); card.className = 'metric';
  const labelNode = document.createElement('p'); labelNode.className = 'label'; labelNode.textContent = label;
  const valueNode = document.createElement('p'); valueNode.className = 'value'; valueNode.textContent = displayValue(value);
  card.append(labelNode, valueNode); elements.summaryGrid.append(card);
}

function makeEditor(key, value) {
  if (!isEditable(key, value)) { const span = document.createElement('span'); span.textContent = displayValue(value); return span; }
  let input;
  if (typeof value === 'boolean') {
    input = document.createElement('select');
    [['true','Yes'],['false','No']].forEach(([v,l]) => { const o=document.createElement('option'); o.value=v; o.textContent=l; input.append(o); });
    input.value = String(value);
  } else {
    input = document.createElement('input');
    input.type = isDateField(key, value) ? 'date' : (typeof value === 'number' ? 'number' : 'text');
    if (input.type === 'number') input.step = 'any';
    input.value = input.type === 'date' ? dateInputValue(value) : (value ?? '');
  }
  input.className = 'attribute-input'; input.dataset.attribute = key; input.setAttribute('aria-label', displayName(key));
  input.addEventListener('input', () => { draftValues[key] = input.value; });
  input.addEventListener('change', () => { draftValues[key] = input.value; });
  return input;
}

function renderAttributes(filter = '') {
  elements.attributeRows.replaceChildren();
  const normalized = filter.toLowerCase();
  const entries = Object.entries(currentAsset || {}).sort(([a], [b]) => displayName(a).localeCompare(displayName(b)))
    .filter(([key, value]) => `${displayName(key)} ${key} ${displayValue(value)}`.toLowerCase().includes(normalized));
  entries.forEach(([key, value]) => {
    const row = document.createElement('tr'); const nameCell = document.createElement('td'); const valueCell = document.createElement('td');
    nameCell.innerHTML = `<span class="friendly-name"></span><span class="technical-name"></span>`;
    nameCell.querySelector('.friendly-name').textContent = displayName(key);
    nameCell.querySelector('.technical-name').textContent = key;
    if (editMode) valueCell.append(makeEditor(key, value));
    else if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      const link = document.createElement('a'); link.href=value; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent=displayValue(value); valueCell.append(link);
    } else valueCell.textContent = displayValue(value);
    row.append(nameCell, valueCell); elements.attributeRows.append(row);
  });
  elements.noAttributes.hidden = entries.length > 0;
  const editableCount = Object.entries(currentAsset || {}).filter(([k,v]) => isEditable(k,v)).length;
  elements.attributeCount.textContent = editMode ? `${editableCount} editable attributes · only changed values will be submitted` : `${Object.keys(currentAsset || {}).length} attributes returned by Maximo`;
}

function renderAsset(asset) {
  currentAsset = asset; draftValues = {}; editMode = false;
  elements.assetNumber.textContent = displayValue(asset.assetnum); elements.assetDescription.textContent = displayValue(asset.description);
  elements.assetStatus.textContent = displayValue(asset.status_description || asset.status); elements.summaryGrid.replaceChildren();
  [['Site', asset.siteid], ['Organization', asset.orgid], ['Health', asset.assethealth == null ? null : `${asset.assethealth}%`], ['Running', asset.isrunning],
   ['Asset ID', asset.assetid], ['Changed by', asset.changeby], ['Changed date', asset.changedate], ['Total cost', asset.totalcost]].forEach(([l,v]) => addMetric(l,v));
  setEditUi(false); renderAttributes(); elements.loading.hidden = true; elements.content.hidden = false;
}

function setEditUi(enabled) {
  editMode = enabled; elements.editButton.hidden = enabled; elements.editActions.hidden = !enabled;
  elements.attributeSearch.disabled = enabled; elements.formMessage.hidden = true;
}
function startEdit() { draftValues = {}; setEditUi(true); renderAttributes(); }
function cancelEdit() { draftValues = {}; setEditUi(false); renderAttributes(); }

function buildChanges() {
  const changes = {};
  Object.entries(draftValues).forEach(([key, raw]) => {
    const original = currentAsset[key]; let value = raw;
    if (typeof original === 'boolean') value = raw === 'true';
    else if (typeof original === 'number') value = raw === '' ? null : Number(raw);
    else if (isDateField(key, original)) value = toMaximoDate(raw, original);
    if (String(value ?? '') !== String(original ?? '')) changes[key] = value;
  });
  return changes;
}

async function submitChanges() {
  const changes = buildChanges();
  if (!Object.keys(changes).length) { showMessage('No attributes have been changed.', 'error-message'); return; }
  if (!window.confirm(`Submit ${Object.keys(changes).length} changed attribute(s) for asset ${assetId}?`)) return;
  elements.loadingOverlay.hidden = false; elements.submitButton.disabled = true; elements.cancelEditButton.disabled = true;
  try {
    const response = await fetch('/api/asset', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ assetId, attributes: changes }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.detail || `Request failed (${response.status})`);
    // Clear the edit form immediately, then reload authoritative values from Maximo.
    draftValues = {}; setEditUi(false); renderAttributes();
    await loadAsset({ preserveMessage: true });
    showMessage(body.message || 'Asset attributes saved successfully.', 'success-message');
    window.alert(body.message || 'Asset attributes saved successfully.');
  } catch (error) {
    showMessage(error.message, 'error-message'); window.alert(`Save failed: ${error.message}`);
  } finally {
    elements.loadingOverlay.hidden = true; elements.submitButton.disabled = false; elements.cancelEditButton.disabled = false;
  }
}
function showMessage(text, className) { elements.formMessage.className = `form-message ${className}`; elements.formMessage.textContent = text; elements.formMessage.hidden = false; }

async function loadAsset(options = {}) {
  elements.loading.hidden = false; elements.error.hidden = true; elements.empty.hidden = true; elements.content.hidden = true;
  elements.attributeSearch.value = ''; if (!options.preserveMessage) elements.formMessage.hidden = true;
  if (!assetId) { elements.loading.hidden=true; elements.error.hidden=false; elements.errorMessage.textContent='Missing query parameter. Open this page using ?assetId=V6-0404'; elements.requestSummary.textContent='No asset ID was supplied.'; return; }
  elements.requestSummary.textContent = `Current Asset ID is ${assetId}`;
  try {
    const response = await fetch(`/api/asset?assetId=${encodeURIComponent(assetId)}`, { cache:'no-store' }); const body=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`); const asset=Array.isArray(body.member)?body.member[0]:null;
    elements.loading.hidden=true; if (!asset) { elements.empty.hidden=false; return; } renderAsset(asset);
  } catch (error) { elements.loading.hidden=true; elements.error.hidden=false; elements.errorMessage.textContent=error.message; }
}

elements.refreshButton.addEventListener('click', () => loadAsset()); elements.attributeSearch.addEventListener('input', e => renderAttributes(e.target.value));
elements.editButton.addEventListener('click', startEdit); elements.cancelEditButton.addEventListener('click', cancelEdit); elements.submitButton.addEventListener('click', submitChanges);
loadAsset();
