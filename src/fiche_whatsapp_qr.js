/**
 * Bloc QR code — chaîne WhatsApp ResumeCI (injecté en bas de chaque fiche)
 */
const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8u2u0KrWQxKOhaDZ1F';
const QR_MARKER = 'resume-ci-whatsapp-qr';

const QR_IMAGE_URL =
  'https://api.qrserver.com/v1/create-qr-code/?size=120x120&margin=8&data=' +
  encodeURIComponent(WHATSAPP_CHANNEL_URL);

function getWhatsappQrHtml() {
  return `<div class="${QR_MARKER}" style="margin-top:28px;padding:16px 18px;border:2px solid #25d366;border-radius:14px;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);text-align:center;page-break-inside:avoid">
  <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">📺 Chaîne WhatsApp ResumeCI</p>
  <img src="${QR_IMAGE_URL}" width="100" height="100" alt="QR Code chaîne WhatsApp ResumeCI" loading="lazy" style="display:block;margin:0 auto 8px;border-radius:8px;background:#fff;padding:6px;box-shadow:0 2px 8px rgba(0,0,0,.06)"/>
  <a href="${WHATSAPP_CHANNEL_URL}" target="_blank" rel="noopener" style="font-size:11px;color:#15803d;font-weight:600;text-decoration:none">Scanne le QR ou clique pour nous suivre — fiches, quiz &amp; actus</a>
</div>`;
}

function injectWhatsappQr(html) {
  if (!html || html.includes(QR_MARKER)) return html;
  const block = getWhatsappQrHtml();
  const creditMarker = 'Créé par <strong style="color:#64748b">Haniel_dev</strong>';
  if (html.includes(creditMarker)) {
    const creditDiv = '<div style="text-align:center;color:#94a3b8;font-size:10px;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb">';
    const idx = html.indexOf(creditDiv);
    if (idx !== -1) return html.slice(0, idx) + block + html.slice(idx);
    return html.replace(creditMarker, block + creditDiv.replace('margin-top:24px', 'margin-top:16px') + creditMarker);
  }
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`);
  return `${html}${block}`;
}

module.exports = {
  WHATSAPP_CHANNEL_URL,
  QR_MARKER,
  getWhatsappQrHtml,
  injectWhatsappQr,
};
