// Dates : format ISO 8601 avec fuseau (tableau) et formats courts pour l'écran.

// Complète un nombre à deux chiffres.
function deux(n) {
  return String(Math.abs(n)).padStart(2, '0');
}

// Date ISO 8601 avec fuseau, par exemple 2026-11-13T10:42:00+01:00.
export function dateIso(d) {
  const decalage = -d.getTimezoneOffset();
  return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()) + 'T' +
    deux(d.getHours()) + ':' + deux(d.getMinutes()) + ':' + deux(d.getSeconds()) +
    (decalage >= 0 ? '+' : '-') + deux(Math.floor(Math.abs(decalage) / 60)) + ':' + deux(Math.abs(decalage) % 60);
}

// Jour local du moment au format AAAA-MM-JJ (début des dates ISO du tableau).
export function jourDuJour() {
  return dateIso(new Date()).slice(0, 10);
}

// Affichage court « JJ/MM HH:MM » à partir d'une date ISO (vide si illisible).
export function dateCourte(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return deux(d.getDate()) + '/' + deux(d.getMonth() + 1) + ' ' + deux(d.getHours()) + ':' + deux(d.getMinutes());
}

// Jour et mois « JJ/MM » (texte « Envoyée le JJ/MM » des relances).
export function jourMois(d) {
  return deux(d.getDate()) + '/' + deux(d.getMonth() + 1);
}

// La plus ancienne de deux dates ISO (une date vide ou illisible est ignorée) ; '' si aucune.
export function plusAncienne(a, b) {
  const ta = Date.parse(a), tb = Date.parse(b);
  if (isNaN(ta)) return isNaN(tb) ? '' : b;
  if (isNaN(tb)) return a;
  return ta <= tb ? a : b;
}
