// Google Picker : le commercial choisit le tableau partagé par son responsable. Ce choix donne à l'appli l'accès
// drive.file à ce seul tableau (aucune autre portée demandée). Script Google chargé seulement à ce moment-là.

// Clé de navigateur Google Picker (publique par nature, restreinte au domaine app.optimisons.ai dans Google Cloud).
export const CLE_PICKER = 'AIzaSyBPAmtofK5ZsUHwMqJc2KTmJ2DWsJeQRv4';
// Numéro du projet Google Cloud (début de l'identifiant client OAuth).
const ID_APPLI = '1000669439525';
const SCRIPT_API = 'https://apis.google.com/js/api.js';

let chargement = null;

// Charge le script Google et la bibliothèque Picker (une seule fois).
export function chargerPicker() {
  if (window.google && google.picker) return Promise.resolve();
  if (!chargement) {
    chargement = new Promise((ok, ko) => {
      const fin = () => window.gapi.load('picker', { callback: ok, onerror: () => ko(new Error('Google Picker ne se charge pas')) });
      if (window.gapi) { fin(); return; }
      const script = document.createElement('script');
      script.src = SCRIPT_API;
      script.async = true;
      script.onload = fin;
      script.onerror = () => ko(new Error(navigator.onLine ? 'Le service Google ne répond pas' : 'Pas de réseau'));
      document.head.append(script);
    }).catch((e) => { chargement = null; throw e; });
  }
  return chargement;
}

// Ouvre le Picker sur les tableaux Google (filtré sur le fichier attendu si possible) ; résout l'id choisi, ou null.
export async function choisirTableau(jeton, idAttendu) {
  if (!CLE_PICKER || CLE_PICKER === 'A_RENSEIGNER') throw new Error('Clé Google Picker pas encore renseignée dans js/picker.js.');
  await chargerPicker();
  const p = google.picker;
  const vue = new p.DocsView(p.ViewId.SPREADSHEETS).setMode(p.DocsViewMode.LIST);
  if (idAttendu && typeof vue.setFileIds === 'function') vue.setFileIds(idAttendu);
  return new Promise((ok) => {
    const fenetre = new p.PickerBuilder()
      .setAppId(ID_APPLI)
      .setOAuthToken(jeton)
      .setDeveloperKey(CLE_PICKER)
      .setLocale('fr')
      .setTitle('Choisissez « Carnet de salon · Mes contacts »')
      .addView(vue)
      .setCallback((donnees) => {
        const action = donnees[p.Response.ACTION];
        if (action === p.Action.PICKED) ok(donnees[p.Response.DOCUMENTS][0][p.Document.ID]);
        else if (action === p.Action.CANCEL) ok(null);
      })
      .build();
    fenetre.setVisible(true);
  });
}
