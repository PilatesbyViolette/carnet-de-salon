// Tests des changements de code (js/activation.js) : essai → Solo, essai → Équipe, Solo → Équipe, commercial refusé,
// responsable sans « Saisir un autre code ». Navigateur seulement (IndexedDB) : tests/activation.test.html.
// Isolés de l'appli : base IndexedDB et préfixe de stockage propres aux tests, effacés au début et à la fin.
// Codes de test ajoutés en mémoire à la liste CODES pendant le test seulement : ils n'existent pas dans js/codes.js.

const NOM_BASE = 'carnet-tests-activation';
const PREFIXE = 'testsActivation_';
const SOLO = 'CDS-TEST-SOLO';
const EQUIPE = 'CDE-TEST-EQPE';

// Efface la base et les clés de test (avant et après).
async function nettoyer() {
  Object.keys(localStorage).filter((k) => k.startsWith(PREFIXE)).forEach((k) => localStorage.removeItem(k));
  await new Promise((ok) => { const r = indexedDB.deleteDatabase(NOM_BASE); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
}

export async function lancerTests() {
  const resultats = [];
  const verifier = (nom, attendu, obtenu) => resultats.push({ nom, attendu: JSON.stringify(attendu), obtenu: JSON.stringify(obtenu) });

  const { ENV } = await import('../js/environnement.js');
  Object.assign(ENV, { nomBase: NOM_BASE, prefixe: PREFIXE, serviceWorker: false });
  await nettoyer();
  const { CODES } = await import('../js/codes.js');
  const A = await import('../js/activation.js');
  const base = await import('../js/base.js');
  const { chargerContexteEquipe } = await import('../js/equipe.js');
  const R = await import('../js/equipe-regles.js');
  const { ecrireLocal } = await import('../js/stockage.js');
  const empreinteSolo = await A.empreinte(A.normaliserCode(SOLO));
  const empreinteEquipe = await A.empreinte(A.normaliserCode(EQUIPE));
  CODES.push({ empreinte: empreinteSolo, type: 'achat', dureeHeures: null, libelle: 'achat' },
    { empreinte: empreinteEquipe, type: 'equipe', dureeHeures: null, libelle: 'équipe' });
  ecrireLocal('compte', 'nicolas@exemple.com');
  const erreurDe = (promesse) => promesse.then(() => '', (e) => e.message);
  const contacts = async () => (await base.tousLesContacts()).map((c) => c.id).sort().join();

  try {
    // 1. Essai en cours, avec deux contacts sur le téléphone
    await A.commencerEssai();
    await base.ajouterContact({ id: 'c1', nom: 'Marie Dupont', statut: 'Vérifié', etat: 'ecrit' });
    await base.ajouterContact({ id: 'c2', nom: 'Paul Martin', statut: 'À vérifier', etat: 'photo' });
    verifier('Essai en cours : capture permise, fin prévue', [true, false, true], [A.captureAutorisee(), A.essaiTermine(), A.finEssai() > Date.now()]);
    verifier('Essai en cours : « Saisir un autre code » proposé', true, R.peutSaisirAutreCode(A.roleEquipe()));

    // 2. Essai en cours → code Solo
    await A.activer(' cds test solo ');
    verifier('Essai → Solo : code acheté, plus de fin d\'essai', [SOLO + ' · acheté', null, true], [A.descriptionActivation(), A.finEssai(), A.captureAutorisee()]);
    verifier('Essai → Solo : code recopié dans Réglages, à envoyer au tableau', [SOLO, true], [await base.lireReglage(A.CLE_CODE, ''), await base.lireReglage('_activationAEnvoyer', false)]);
    verifier('Essai → Solo : contacts conservés', 'c1,c2', await contacts());
    verifier('Essai → Solo : message de confirmation', 'Code activé. Vos contacts sont conservés.', A.messageCodeActive());
    verifier('Solo : « Saisir un autre code » proposé', true, R.peutSaisirAutreCode(A.roleEquipe()));

    // 3. Solo → Équipe : responsable, sans réinstaller
    await A.activer(EQUIPE);
    const ctx = await chargerContexteEquipe();
    verifier('Solo → Équipe : rôle responsable', 'responsable', A.roleEquipe());
    verifier('Solo → Équipe : contexte équipe rechargé (responsable = ce compte)', ['responsable', 'nicolas@exemple.com'], [ctx.role, ctx.responsable]);
    verifier('Solo → Équipe : empreinte prête pour la clé « Code équipe »', empreinteEquipe, A.empreinteCodeEquipe());
    verifier('Solo → Équipe : code masqué dans Réglages', 'CDE-••••-EQPE', await base.lireReglage(A.CLE_CODE, ''));
    verifier('Solo → Équipe : description des Réglages', 'CDE-••••-EQPE · Équipe, vous êtes responsable', A.descriptionActivation());
    verifier('Solo → Équipe : contacts conservés', 'c1,c2', await contacts());
    verifier('Solo → Équipe : message de confirmation', true, A.messageCodeActive().startsWith('Code Équipe activé : vous êtes responsable'));
    verifier('Responsable : « Saisir un autre code » caché', false, R.peutSaisirAutreCode(A.roleEquipe()));
    verifier('Responsable : un code Solo ne remplace pas le code Équipe', [true, 'responsable'],
      [(await erreurDe(A.activer(SOLO))).startsWith('Vous êtes responsable d\'une équipe'), A.roleEquipe()]);

    // 4. Essai terminé → Équipe directement
    await base.ecrireReglage(A.CLE_ESSAI, new Date(Date.now() - 48 * 3600 * 1000).toISOString());
    await A.commencerEssai();
    verifier('Essai terminé : capture bloquée', [true, false], [A.essaiTermine(), A.captureAutorisee()]);
    verifier('Essai terminé : « Saisir un autre code » proposé', true, R.peutSaisirAutreCode(A.roleEquipe()));
    await A.activer(EQUIPE);
    verifier('Essai terminé → Équipe : responsable, capture permise', ['responsable', false, true], [A.roleEquipe(), A.essaiTermine(), A.captureAutorisee()]);

    // 5. Code inconnu : rien ne change
    verifier('Code inconnu : refusé, rôle inchangé', [true, 'responsable'], [(await erreurDe(A.activer('CDS-ZZZZ-ZZZZ'))).startsWith('Code inconnu'), A.roleEquipe()]);

    // 6. Commercial invité : refusé avec le message existant, toujours commercial
    await A.devenirCommercial('idTableauEquipe', empreinteEquipe, 'Ateliers Dupont');
    verifier('Commercial : « Saisir un autre code » caché', false, R.peutSaisirAutreCode(A.roleEquipe()));
    verifier('Commercial : code refusé (quitter d\'abord l\'équipe)',
      'Vous êtes membre d\'une équipe. Pour utiliser votre propre code, quittez d\'abord l\'équipe (Réglages, Se déconnecter).', await erreurDe(A.activer(SOLO)));
    verifier('Commercial : toujours rattaché à son équipe', ['commercial', 'idTableauEquipe'], [A.roleEquipe(), A.tableauCommercial()]);
    verifier('Textes : jamais de tiret cadratin', false, /\u2014/.test(A.messageCodeActive()));
  } finally {
    CODES.splice(CODES.length - 2, 2);
    await A.quitterEquipe().catch(() => {});
    await base.viderBase().catch(() => {});
    await nettoyer();
  }
  return resultats;
}
