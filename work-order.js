const form = document.querySelector('#workOrderForm');
const message = document.querySelector('#formMessage');
const loading = document.querySelector('#loadingOverlay');
const submitButton = document.querySelector('#submitButton');
const params = new URLSearchParams(window.location.search);
const initialAssetId = (params.get('assetId') || '').trim();

function pad(number) {
  return String(number).padStart(2, '0');
}

function setDefaultReportDate() {
  const now = new Date();
  form.elements.reportdate.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function toMaximoDateTime(localDateTime) {
  const match = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('Report Date has an invalid date and time.');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const selectedDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const offsetMinutes = -selectedDate.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

if (initialAssetId) {
  form.elements.assetnum.value = initialAssetId;
  document.querySelector('#backToAsset').href = `index.html?assetId=${encodeURIComponent(initialAssetId)}`;
}
setDefaultReportDate();

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type}-message`;
  message.hidden = false;
  message.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function apiErrorMessage(body, status) {
  return body?.['oslc:Error']?.['oslc:message']
    || body?.error?.['oslc:message']
    || body?.error
    || body?.message
    || `The API request failed with status ${status}.`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.hidden = true;
  if (!form.checkValidity()) {
    form.reportValidity();
    showMessage('Please complete all required fields before submitting.', 'error');
    return;
  }

  const body = Object.fromEntries(new FormData(form).entries());
  try {
    body.reportdate = toMaximoDateTime(body.reportdate);
  } catch (error) {
    showMessage(error.message, 'error');
    return;
  }
  if (!window.confirm(`Create a work order for asset ${body.assetnum}?`)) return;

  loading.hidden = false;
  submitButton.disabled = true;
  try {
    const response = await fetch('/api/work-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(responseBody, response.status));

    form.reset();
    Array.from(form.elements).forEach(field => {
      if (field.name && field.type !== 'submit') field.value = '';
    });
    showMessage(responseBody.message || 'Work order created successfully.', 'success');
    window.alert(responseBody.wonum
      ? `Work order ${responseBody.wonum} was created successfully.`
      : 'Work order was created successfully.');
  } catch (error) {
    showMessage(error.message || 'Unable to create the work order.', 'error');
  } finally {
    loading.hidden = true;
    submitButton.disabled = false;
  }
});
