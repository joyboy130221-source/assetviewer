const form = document.querySelector('#workOrderForm');
const message = document.querySelector('#formMessage');
const loading = document.querySelector('#loadingOverlay');
const submitButton = document.querySelector('#submitButton');
const params = new URLSearchParams(window.location.search);
const initialAssetId = (params.get('assetId') || '').trim();

if (initialAssetId) {
  form.elements.assetnum.value = initialAssetId;
  document.querySelector('#backToAsset').href = `index.html?assetId=${encodeURIComponent(initialAssetId)}`;
}

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
