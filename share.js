async function exportQuotePDF() {
  if (!hasProAccess()) {
    showToast('PDF export requires a Pro subscription', 'error');
    return;
  }

  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded. Check your connection.', 'error');
    return;
  }

  const data = getQuoteData();
  const pdfElement = document.createElement('div');
  pdfElement.innerHTML = buildPdfHtml(data);

  const rawName = (el('q-name') ? el('q-name').value : '') || 'customer';
  const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'customer';

  const opt = {
    margin: 0,
    filename: `quote-${safeName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  };

  try {
    await html2pdf().set(opt).from(pdfElement).save();
    showToast('PDF exported!', 'success');
  } catch (e) {
    console.error('PDF export error', e);
    showToast('PDF export failed', 'error');
  }

  closeShareModal();
}

function openShareModal() {
  const modal = el('share-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeShareModal() {
  const modal = el('share-modal');
  if (modal) modal.classList.add('hidden');
}

async function copyQuoteToClipboard() {
  try {
    const t = (el('quote-preview-text') || {}).textContent || '';
    await navigator.clipboard.writeText(t);
    showToast('Quote copied!', 'success');
    closeShareModal();
  } catch (e) {
    showToast('Copy failed', 'error');
  }
}

function emailQuote() {
  const t = (el('quote-preview-text') || {}).textContent || '';
  const email = (el('q-email') || {}).value || '';
  window.location.href = `mailto:${email}?subject=${encodeURIComponent('Quote from ' + settings.businessName)}&body=${encodeURIComponent(t)}`;
  closeShareModal();
}

function smsQuote() {
  const t = (el('quote-preview-text') || {}).textContent || '';
  const phone = (el('q-phone') || {}).value || '';
  window.location.href = `sms:${phone}?body=${encodeURIComponent(t)}`;
  closeShareModal();
}

function whatsappQuote() {
  const t = (el('quote-preview-text') || {}).textContent || '';
  let phone = ((el('q-phone') || {}).value || '').replace(/\s+/g, '');
  if (phone.startsWith('0')) phone = '61' + phone.slice(1);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(t)}`, '_blank');
  closeShareModal();
}