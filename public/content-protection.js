/**
 * ResumeCI — Content Protection Script
 * © 2026 ResumeCI / Haniel_dev — Tous droits réservés.
 * Ce script protège le contenu contre la copie, le vol et la reproduction non autorisée.
 */
(function() {
  'use strict';

  // ===== 1. DISABLE RIGHT-CLICK CONTEXT MENU =====
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    showProtectionAlert();
    return false;
  });

  // ===== 2. DISABLE TEXT SELECTION =====
  document.addEventListener('selectstart', function(e) {
    // Allow selection in search inputs only
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    return false;
  });

  // ===== 3. DISABLE COPY / CUT / PASTE on content =====
  document.addEventListener('copy', function(e) {
    e.preventDefault();
    showProtectionAlert();
    return false;
  });

  document.addEventListener('cut', function(e) {
    e.preventDefault();
    return false;
  });

  // ===== 4. DISABLE KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', function(e) {
    // Ctrl+C (copy)
    if (e.ctrlKey && e.key === 'c') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showProtectionAlert();
        return false;
      }
    }
    // Ctrl+U (view source)
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      return false;
    }
    // Ctrl+S (save page)
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I (dev tools)
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+J (console)
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+C (inspect element)
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return false;
    }
    // F12 (dev tools)
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    // Ctrl+A (select all)
    if (e.ctrlKey && e.key === 'a') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        return false;
      }
    }
    // Ctrl+P (print)
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      showProtectionAlert();
      return false;
    }
    // PrintScreen
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      navigator.clipboard.writeText('').catch(()=>{});
      showProtectionAlert();
      return false;
    }
  });

  // ===== 5. DISABLE DRAG AND DROP =====
  document.addEventListener('dragstart', function(e) {
    e.preventDefault();
    return false;
  });

  document.addEventListener('drop', function(e) {
    e.preventDefault();
    return false;
  });

  // ===== 6. CSS-BASED PROTECTION =====
  var protectionStyle = document.createElement('style');
  protectionStyle.textContent = `
    /* Disable text selection via CSS */
    body, .content, .fiche-content, .card, article, section, p, h1, h2, h3, h4, h5, h6, li, td, th, span, div {
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      user-select: none !important;
    }
    /* Allow selection in form inputs */
    input, textarea, [contenteditable="true"] {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      user-select: text !important;
    }
    /* Disable image dragging */
    img {
      -webkit-user-drag: none !important;
      -khtml-user-drag: none !important;
      -moz-user-drag: none !important;
      -o-user-drag: none !important;
      user-drag: none !important;
      pointer-events: none;
    }
    /* Disable printing */
    @media print {
      body * {
        display: none !important;
      }
      body::after {
        content: "© 2026 ResumeCI — Impression non autorisée. Tous droits réservés.";
        display: block !important;
        font-size: 24px;
        text-align: center;
        padding: 100px 20px;
        color: #dc2626;
        font-weight: bold;
      }
    }
  `;
  document.head.appendChild(protectionStyle);

  // ===== 7. PROTECTION ALERT =====
  function showProtectionAlert() {
    // Remove existing alert if any
    var existing = document.getElementById('protection-alert');
    if (existing) existing.remove();

    var alert = document.createElement('div');
    alert.id = 'protection-alert';
    alert.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><i class="fas fa-shield-halved" style="font-size:20px;color:#dc2626"></i><div><strong style="color:#dc2626">Contenu protégé</strong><br><span style="font-size:12px;color:#64748b">© 2026 ResumeCI — Toute reproduction est interdite.</span></div></div>';
    alert.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#fff;border:2px solid #dc2626;border-radius:12px;padding:14px 20px;box-shadow:0 10px 40px rgba(0,0,0,.15);z-index:999999;animation:slideUp .3s ease';
    document.body.appendChild(alert);

    setTimeout(function() {
      if (alert.parentNode) alert.remove();
    }, 3000);
  }

  // ===== 8. ANIMATION FOR ALERT =====
  var animStyle = document.createElement('style');
  animStyle.textContent = '@keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
  document.head.appendChild(animStyle);

  // ===== 9. DETECT DEVTOOLS OPEN (basic) =====
  var devtoolsOpen = false;
  var threshold = 160;
  setInterval(function() {
    if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
      if (!devtoolsOpen) {
        devtoolsOpen = true;
        document.body.style.opacity = '0.1';
        showProtectionAlert();
      }
    } else {
      if (devtoolsOpen) {
        devtoolsOpen = false;
        document.body.style.opacity = '1';
      }
    }
  }, 1000);

  // ===== 10. DISABLE PAGE VISIBILITY SCREENSHOT ATTEMPTS =====
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      // When page becomes hidden (possible screenshot on mobile)
      // We can't truly prevent this but we note it
    }
  });

  // ===== 11. WATERMARK OVERLAY (invisible but present in screenshots) =====
  var watermark = document.createElement('div');
  watermark.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;opacity:0.015;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;overflow:hidden;font-size:14px;color:#000;font-weight:bold;transform:rotate(-30deg);letter-spacing:2px';
  var wmText = '';
  for (var i = 0; i < 80; i++) {
    wmText += '© ResumeCI 2026 — Haniel_dev &nbsp;&nbsp;&nbsp;&nbsp;';
  }
  watermark.innerHTML = wmText;
  document.body.appendChild(watermark);

  // Console warning
  console.log('%c⚠️ ATTENTION', 'color:#dc2626;font-size:30px;font-weight:bold');
  console.log('%c© 2026 ResumeCI — Tous droits réservés.\nToute tentative de copie, reproduction ou redistribution du contenu de ce site est strictement interdite et passible de poursuites judiciaires.', 'color:#1e293b;font-size:14px');

})();
