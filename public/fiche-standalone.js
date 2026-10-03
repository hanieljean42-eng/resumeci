/* Fiche ouverte directement (rechargement, lien partagé, Google) :
   - élève déjà connu : on rouvre immédiatement la fiche dans l'application complète ;
   - nouveau visiteur : on affiche la fiche mise en forme avec une invitation à s'inscrire. */
(function () {
  if (window.top !== window.self) return;
  var path = window.location.pathname;
  var isKnownUser = false;
  try {
    isKnownUser = !!localStorage.getItem('resumeci_profile');
  } catch (e) {}

  if (isKnownUser && !/[?&]standalone=1/.test(window.location.search)) {
    window.location.replace('/?fiche=' + encodeURIComponent(path));
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var appUrl = '/?fiche=' + encodeURIComponent(path);
    var bar = document.createElement('div');
    bar.className = 'rci-bar';
    bar.innerHTML =
      '<a class="rci-brand" href="/">📚 Resume<span>CI</span> <small style="font-weight:500;color:#94a3b8;margin-left:6px">Fiches de révision</small></a>' +
      '<a class="rci-open" href="' + appUrl + '">Ouvrir dans l\'app →</a>';
    document.body.insertBefore(bar, document.body.firstChild);

    var cta = document.createElement('div');
    cta.className = 'rci-cta';
    cta.innerHTML =
      '<h3>🎓 Révise avec toutes les fiches ResumeCI</h3>' +
      '<p>714 fiches de cours de la 6ème à la Terminale, quiz, flashcards et packs hors-ligne. Inscription gratuite en 30 secondes.</p>' +
      '<a href="/inscription.html">🚀 Créer mon compte gratuit</a>' +
      '<a class="rci-ghost" href="' + appUrl + '">Voir cette fiche dans l\'app</a>';
    document.body.appendChild(cta);
  });
})();
