// Signal discret vers Optimisons.ai au lancement d'un essai (et à un achat). Aucune donnée de contact ne part :
// seulement l'e-mail du compte, l'entreprise et le nom du salon (Réglages), la date de début et un jeton Google
// (vérifié côté serveur). Rien n'est affiché à l'utilisateur. Local d'abord : si l'envoi échoue, le signal reste
// en file dans localStorage (clé « signalEssai ») et repart à chaque ouverture et à chaque synchronisation.

import { lireLocal, ecrireLocal, retirerLocal } from './stockage.js';

const CLE_FILE = 'signalEssai';   // file des signaux en attente (JSON)
const CLE_FAIT = 'essaiSignale';  // '1' une fois le signal d'essai parti : il ne repart jamais

let deps = null; // { url, email(), jeton(), reglage(cle), version, envoyer(url, options) }

// Branche les dépendances (adresse, compte, jeton, réglages, version, fetch) ; sans elles, rien n'est envoyé.
export function initSignal(dependances) {
  deps = dependances;
}

function lireFile() {
  try { return JSON.parse(lireLocal(CLE_FILE)) || []; } catch (e) { return []; }
}

function ecrireFile(file) {
  if (file.length) ecrireLocal(CLE_FILE, JSON.stringify(file));
  else retirerLocal(CLE_FILE);
}

// Met un signal d'essai en file (une seule fois : jamais si déjà signalé ni si déjà en attente).
export function signalerEssai(debut) {
  if (lireLocal(CLE_FAIT)) return;
  const file = lireFile();
  if (file.some((s) => s.type === 'essai')) return;
  file.push({ type: 'essai', debut });
  ecrireFile(file);
}

// Met un signal d'achat en file (un seul en attente à la fois).
export function signalerAchat() {
  const file = lireFile();
  if (file.some((s) => s.type === 'achat')) return;
  file.push({ type: 'achat' });
  ecrireFile(file);
}

// Corps du signal, construit au moment de l'envoi (jamais de jeton stocké dans la file).
async function corpsSignal(signal, email, jeton) {
  if (signal.type === 'achat') return { type: 'achat', email, jeton };
  return {
    type: 'essai', email, debut: signal.debut,
    entreprise: await deps.reglage('Votre entreprise'),
    salon: await deps.reglage('Nom du salon'),
    relance: true, jeton, version: deps.version
  };
}

// Envoie un signal ; une promesse fetch résolue vaut envoi réussi (mode no-cors : réponse opaque).
async function envoyerSignal(signal, email, jeton) {
  const corps = await corpsSignal(signal, email, jeton);
  try {
    await deps.envoyer(deps.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corps) });
    return true;
  } catch (e) {
    return false; // hors réseau ou envoi refusé : on réessaiera plus tard, sans bruit
  }
}

// Essaie d'envoyer les signaux en attente. Jeton frais pris maintenant (jamais de fenêtre Google ici) : s'il
// manque le compte ou le jeton, on garde la file pour un prochain essai. Jamais d'erreur affichée.
export async function viderFileSignaux() {
  if (!deps) return;
  const file = lireFile();
  if (!file.length) return;
  const email = deps.email();
  const jeton = deps.jeton();
  if (!email || !jeton) return;
  const restants = [];
  for (const signal of file) {
    const envoye = await envoyerSignal(signal, email, jeton);
    if (envoye) { if (signal.type === 'essai') ecrireLocal(CLE_FAIT, '1'); }
    else restants.push(signal);
  }
  ecrireFile(restants);
}
