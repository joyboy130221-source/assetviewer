const elements = {
  loading: document.querySelector('#loadingState'), error: document.querySelector('#errorState'),
  empty: document.querySelector('#emptyState'), content: document.querySelector('#assetContent'),
  errorMessage: document.querySelector('#errorMessage'), requestSummary: document.querySelector('#requestSummary'),
  assetNumber: document.querySelector('#assetNumber'), assetDescription: document.querySelector('#assetDescription'),
  assetStatus: document.querySelector('#assetStatus'), summaryGrid: document.querySelector('#summaryGrid'),
  attributeRows: document.querySelector('#attributeRows'), attributeCount: document.querySelector('#attributeCount'),
  attributeSearch: document.querySelector('#attributeSearch'), noAttributes: document.querySelector('#noAttributes'),
  refreshButton: document.querySelector('#refreshButton')
};

let currentAsset = null;
const query = new URLSearchParams(window.location.search);
const assetId = (query.get('assetId') || '').trim();

function displayName(key) {
  return key.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toLocaleString();
  }
  return String(value);
}

function addMetric(label, value) {
  const card = document.createElement('article');
  card.className = 'metric';
  const labelNode = document.createElement('p');
  labelNode.className = 'label';
  labelNode.textContent = label;
  const valueNode = document.createElement('p');
  valueNode.className = 'value';
  valueNode.textContent = displayValue(value);
  card.append(labelNode, valueNode);
  elements.summaryGrid.append(card);
}

function renderAttributes(filter = '') {
  elements.attributeRows.replaceChildren();
  const normalized = filter.toLowerCase();
  const entries = Object.entries(currentAsset || {}).sort(([a], [b]) => a.localeCompare(b))
    .filter(([key, value]) => `${key} ${displayValue(value)}`.toLowerCase().includes(normalized));
  entries.forEach(([key, value]) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const valueCell = document.createElement('td');
    nameCell.textContent = displayName(key);
    const shownValue = displayValue(value);
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      const link = document.createElement('a');
      link.href = value;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = shownValue;
      valueCell.append(link);
    } else valueCell.textContent = shownValue;
    row.append(nameCell, valueCell);
    elements.attributeRows.append(row);
  });
  elements.noAttributes.hidden = entries.length > 0;
  elements.attributeCount.textContent = `${Object.keys(currentAsset || {}).length} attributes returned by Maximo`;
}

function renderAsset(asset) {
  currentAsset = asset;
  elements.assetNumber.textContent = displayValue(asset.assetnum);
  elements.assetDescription.textContent = displayValue(asset.description);
  elements.assetStatus.textContent = displayValue(asset.status_description || asset.status);
  elements.summaryGrid.replaceChildren();
  [['Site', asset.siteid], ['Organization', asset.orgid], ['Health', asset.assethealth == null ? null : `${asset.assethealth}%`], ['Running', asset.isrunning],
   ['Asset ID', asset.assetid], ['Changed by', asset.changeby], ['Changed date', asset.changedate], ['Total cost', asset.totalcost]]
    .forEach(([label, value]) => addMetric(label, value));
  renderAttributes();
  elements.loading.hidden = true;
  elements.content.hidden = false;
}

async function loadAsset() {
  elements.loading.hidden = false;
  elements.error.hidden = true;
  elements.empty.hidden = true;
  elements.content.hidden = true;
  elements.attributeSearch.value = '';
  if (!assetId) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent = 'Missing query parameter. Open this page using ?assetId=V6-0404';
    elements.requestSummary.textContent = 'No asset ID was supplied.';
    return;
  }
  elements.requestSummary.textContent = `Current Asset ID is ${assetId}`;
  try {
    const response = await fetch(`/api/asset?assetId=${encodeURIComponent(assetId)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    const asset = Array.isArray(body.member) ? body.member[0] : null;
    elements.loading.hidden = true;
    if (!asset) { elements.empty.hidden = false; return; }
    renderAsset(asset);
  } catch (error) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.errorMessage.textContent = error.message;
  }
}

elements.refreshButton.addEventListener('click', loadAsset);
elements.attributeSearch.addEventListener('input', event => renderAttributes(event.target.value));
loadAsset();
