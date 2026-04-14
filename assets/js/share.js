console.log("[WQP] share.js loaded");

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
  
  // BUG FIX 2: To prevent blank PDF output, we MUST attach the element to the DOM
  // and ensure it has a defined width and white background. 
  // html2canvas often fails to capture elements that are not part of the active document.
  
  const containerId = 'pdf-export-container';
  let pdfElement = document.getElementById(containerId);
  if (!pdfElement) {
    pdfElement = document.createElement('div');
    pdfElement.id = containerId;
    // Position off-screen but still part of the layout
    pdfElement.style.position = 'absolute';
    pdfElement.style.left = '-9999px';
    pdfElement.style.top = '0';
    pdfElement.style.width = '210mm'; // A4 width
    pdfElement.style.background = 'white';
    document.body.appendChild(pdfElement);
  }
  
  pdfElement.innerHTML = buildPdfHtml(data);

  const rawName = (el('q-name') ? el('q-name').value : '') || 'customer';
  const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'customer';

  const opt = {
    margin: 10, // Added margin for safety
    filename: `quote-${safeName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true,
      letterRendering: true,
      backgroundColor: '#ffffff',
      logging: false
    },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  };

  try {
    // We use the element that is now attached to the DOM
    await html2pdf().set(opt).from(pdfElement).save();
    showToast('PDF exported!', 'success');
  } catch (e) {
    console.error('PDF export error', e);
    showToast('PDF export failed', 'error');
  } finally {
    // Clean up or keep it hidden
    pdfElement.innerHTML = '';
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
