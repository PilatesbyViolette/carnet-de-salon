// Outils d'interface communs : changement d'écran (avec le bouton retour du téléphone), messages, création d'éléments.

const ecrans = {};          // nom -> { afficher, quitter }
let ecranActuel = '';
let ignorerRetour = false;
let minuterieMessage = null;

// Déclare un écran et ce qu'il faut faire quand il s'affiche ou se ferme.
export function enregistrerEcran(nom, actions) {
  ecrans[nom] = actions;
}

// Nom de l'écran affiché.
export function ecranAffiche() {
  return ecranActuel;
}

// Montre un écran et masque les autres.
function montrer(nom) {
  if (ecranActuel && ecranActuel !== nom && ecrans[ecranActuel] && ecrans[ecranActuel].quitter) ecrans[ecranActuel].quitter();
  ecranActuel = nom;
  document.querySelectorAll('.ecran').forEach((e) => { e.hidden = e.id !== 'ecran-' + nom; });
  window.scrollTo(0, 0);
  if (ecrans[nom] && ecrans[nom].afficher) ecrans[nom].afficher();
}

// Affiche un écran ; accueil, connexion et activation sont les écrans « racine », les autres s'empilent dans l'historique.
export function afficher(nom, depuisHistorique) {
  montrer(nom);
  if (depuisHistorique) return;
  const etat = history.state || {};
  const racine = ['accueil', 'connexion', 'activation', 'rejoindre'].includes(nom);
  if (racine) {
    if (etat.empile) { ignorerRetour = true; history.back(); } else history.replaceState({ ecran: nom }, '');
  } else if (etat.empile) {
    history.replaceState({ ecran: nom, empile: true }, '');
  } else {
    history.pushState({ ecran: nom, empile: true }, '');
  }
}

window.addEventListener('popstate', (e) => {
  if (ignorerRetour) { ignorerRetour = false; return; }
  montrer((e.state && e.state.ecran) || 'accueil');
});

// Message bref en bas de l'écran (confirmation).
export function message(texte) {
  const zone = document.getElementById('message');
  zone.textContent = texte;
  zone.classList.add('visible');
  clearTimeout(minuterieMessage);
  minuterieMessage = setTimeout(() => zone.classList.remove('visible'), 2600);
}

// Erreur lisible en haut de l'écran (la console est invisible sur téléphone) ; se ferme d'un tap.
export function montrerErreur(texte) {
  const zone = document.getElementById('bandeau-erreur');
  zone.querySelector('span').textContent = texte;
  zone.hidden = false;
}

// Ferme le bandeau d'erreur.
export function fermerErreur() {
  document.getElementById('bandeau-erreur').hidden = true;
}

// Crée un élément : el('p', { class: 'x', onclick: f }, 'texte', autreElement).
export function el(balise, attributs, ...enfants) {
  const e = document.createElement(balise);
  Object.entries(attributs || {}).forEach(([cle, valeur]) => {
    if (cle.startsWith('on')) e.addEventListener(cle.slice(2), valeur);
    else if (valeur !== false && valeur != null) e.setAttribute(cle, valeur === true ? '' : valeur);
  });
  enfants.flat().forEach((enfant) => {
    if (enfant != null && enfant !== false) e.append(enfant instanceof Node ? enfant : String(enfant));
  });
  return e;
}

// Fenêtre de confirmation ; résout vrai sur le bouton d'action (« Supprimer » par défaut), faux sur « Annuler ».
export function confirmer(texte, libelle = 'Supprimer') {
  const fenetre = document.getElementById('confirmation');
  document.getElementById('confirmation-texte').textContent = texte;
  document.getElementById('confirmation-oui').textContent = libelle;
  fenetre.hidden = false;
  document.getElementById('confirmation-non').focus();
  return new Promise((ok) => {
    const fermer = (reponse) => {
      fenetre.hidden = true;
      document.getElementById('confirmation-oui').onclick = null;
      document.getElementById('confirmation-non').onclick = null;
      ok(reponse);
    };
    document.getElementById('confirmation-oui').onclick = () => fermer(true);
    document.getElementById('confirmation-non').onclick = () => fermer(false);
  });
}

// Copie un texte : presse-papiers, sinon repli par sélection d'une zone de texte ; vrai si la copie a marché.
export async function copierTexte(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch (e) { /* repli ci-dessous */ }
  const zone = el('textarea', { class: 'zone-copie', readonly: true }, texte);
  document.body.append(zone);
  zone.select();
  zone.setSelectionRange(0, texte.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  zone.remove();
  return ok;
}

// Lien mailto: : objet et corps encodés par encodeURIComponent, sauts de ligne du corps en %0D%0A.
export function lienMailto(email, objet, corps) {
  const objetSurUneLigne = String(objet).replace(/\s*\r?\n\s*/g, ' ');
  const corpsCrlf = String(corps).replace(/\r?\n/g, '\r\n');
  return 'mailto:' + String(email).trim() + '?subject=' + encodeURIComponent(objetSurUneLigne) +
    '&body=' + encodeURIComponent(corpsCrlf);
}

// Pluriel simple : « 1 contact », « 3 contacts ».
export function pluriel(n, mot) {
  return n + ' ' + mot + (n > 1 ? 's' : '');
}
