// Tests du signal d'essai/achat vers Optimisons.ai (js/signal.js) : mise en file, envoi, garde unique, réessai,
// corps des messages. Fetch simulé (aucun réseau) et stockage isolé (préfixe de test). Navigateur et ligne de commande.

const PREFIXE = 'testsSignal_';

// Efface les clés de test (avant et après).
function nettoyer() {
  Object.keys(localStorage).filter((k) => k.startsWith(PREFIXE)).forEach((k) => localStorage.removeItem(k));
}

export async function lancerTests() {
  const resultats = [];
  const verifier = (nom, attendu, obtenu) => resultats.push({ nom, attendu: JSON.stringify(attendu), obtenu: JSON.stringify(obtenu) });

  const { ENV } = await import('../js/environnement.js');
  Object.assign(ENV, { prefixe: PREFIXE });
  nettoyer();
  const S = await import('../js/signal.js');
  const { lireLocal } = await import('../js/stockage.js');

  const URL = 'https://script.google.com/macros/s/EXEMPLE/exec';
  const VERSION = 'carnet-test';
  // Fetch simulé : enregistre chaque appel ; échoue tant que « reseau » est faux.
  let reseau = true;
  const appels = [];
  const faireDeps = (email, jeton) => ({
    url: URL, version: VERSION,
    email: () => email, jeton: () => jeton,
    reglage: async (cle) => ({ 'Votre entreprise': 'Ateliers Dupont', 'Nom du salon': 'MIF Expo' }[cle] || ''),
    envoyer: async (adresse, options) => { if (!reseau) throw new Error('hors réseau'); appels.push({ adresse, options, corps: JSON.parse(options.body) }); return { ok: true }; }
  });
  const fileBrute = () => { try { return JSON.parse(lireLocal('signalEssai')); } catch (e) { return null; } };

  try {
    // 1. Pas de dépendances : rien ne part, le signal reste en file
    S.initSignal(null);
    S.signalerEssai('2026-11-13T09:00:00+01:00');
    await S.viderFileSignaux();
    verifier('Sans dépendances : signal gardé en file', [{ type: 'essai', debut: '2026-11-13T09:00:00+01:00' }], fileBrute());
    verifier('Sans dépendances : rien envoyé', 0, appels.length);

    // 2. Jeton absent : on garde la file (pas de fenêtre Google, on réessaiera)
    S.initSignal(faireDeps('nicolas@exemple.com', null));
    await S.viderFileSignaux();
    verifier('Jeton absent : file gardée', 1, (fileBrute() || []).length);
    verifier('Jeton absent : rien envoyé, pas de drapeau', [0, null], [appels.length, lireLocal('essaiSignale')]);

    // 3. Compte absent : idem
    S.initSignal(faireDeps('', 'jeton-1'));
    await S.viderFileSignaux();
    verifier('Compte absent : rien envoyé', 0, appels.length);

    // 4. Réseau coupé : fetch rejeté, file conservée
    reseau = false;
    S.initSignal(faireDeps('nicolas@exemple.com', 'jeton-1'));
    await S.viderFileSignaux();
    verifier('Réseau coupé : file conservée, pas de drapeau', [1, null], [(fileBrute() || []).length, lireLocal('essaiSignale')]);

    // 5. Réseau revenu : envoi réussi, file vidée, drapeau posé
    reseau = true;
    await S.viderFileSignaux();
    verifier('Envoi réussi : file vidée et drapeau posé', [null, '1'], [fileBrute(), lireLocal('essaiSignale')]);
    verifier('Envoi essai : adresse et options attendues', [URL, 'POST', 'no-cors', 'text/plain'],
      [appels[0].adresse, appels[0].options.method, appels[0].options.mode, appels[0].options.headers['Content-Type']]);
    verifier('Corps essai : champs attendus (aucune donnée de contact)',
      { type: 'essai', email: 'nicolas@exemple.com', debut: '2026-11-13T09:00:00+01:00', entreprise: 'Ateliers Dupont', salon: 'MIF Expo', relance: true, jeton: 'jeton-1', version: VERSION },
      appels[0].corps);

    // 6. Garde unique : un essai déjà signalé ne repart pas
    S.signalerEssai('2026-11-13T09:00:00+01:00');
    await S.viderFileSignaux();
    verifier('Essai déjà signalé : pas de nouvel envoi', 1, appels.filter((a) => a.corps.type === 'essai').length);

    // 7. Achat : corps { type, email, jeton } seulement
    S.signalerAchat();
    S.signalerAchat(); // un seul en attente
    verifier('Achat : un seul signal en file', 1, (fileBrute() || []).length);
    await S.viderFileSignaux();
    const achat = appels.find((a) => a.corps.type === 'achat');
    verifier('Corps achat : e-mail et jeton seulement', { type: 'achat', email: 'nicolas@exemple.com', jeton: 'jeton-1' }, achat.corps);
    verifier('Achat envoyé : file vidée', null, fileBrute());

    // 8. Jeton frais pris à l'envoi (pas celui d'il y a longtemps) : nouveau jeton utilisé au réessai
    reseau = false;
    S.initSignal(faireDeps('nicolas@exemple.com', 'jeton-perime'));
    S.signalerAchat();
    await S.viderFileSignaux(); // échoue, rien stocké du jeton
    verifier('Réessai : jeton jamais stocké dans la file', [{ type: 'achat' }], fileBrute());
    reseau = true;
    S.initSignal(faireDeps('nicolas@exemple.com', 'jeton-frais'));
    await S.viderFileSignaux();
    verifier('Réessai : jeton frais utilisé', 'jeton-frais', appels[appels.length - 1].corps.jeton);

    // 9. Jamais de tiret cadratin dans les valeurs envoyées
    verifier('Aucun tiret cadratin dans les corps', false, appels.some((a) => /\u2014/.test(a.options.body)));
  } finally {
    nettoyer();
  }
  return resultats;
}
