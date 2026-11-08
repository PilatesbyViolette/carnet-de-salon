// Prénoms courants (minuscules, sans accents), classés par civilité, pour le tri des cartes et l'adresse des relances.
// Prénoms mixtes (Camille, Dominique, Claude...) volontairement absents : la relance commence alors par « Bonjour, ».

const liste = (texte) => new Set(texte.trim().split(/\s+/));

export const PRENOMS_M = liste(`
  adrien alain alban alexandre alexis ali andre antoine arnaud arthur aurelien axel baptiste bastien benjamin benoit
  bernard bertrand bruno cedric charles christian christophe clement corentin cyril damien daniel david denis didier
  dylan edouard emmanuel enzo eric etienne fabien fabrice florent florian franck francis francois frederic gabriel
  gaetan geoffrey gerard gilbert gilles gregoire gregory guillaume guy henri herve hubert hugo hugues jacques jean
  jeremie jeremy jerome joel jonathan jordan joris joseph jules julien karim kevin laurent leo leon lionel loic louis
  luc lucas lucien ludovic marc marcel martin mathias mathieu matteo matthieu maxime mehdi michael michel mickael
  mohamed nathan nicolas noah noel olivier pascal patrick paul philippe pierre quentin rachid raphael raymond regis
  remi remy renaud rene richard robert roger romain samuel sebastien serge simon stephane sylvain theo thibault thibaut
  thierry thomas timothee tony tristan valentin victor vincent vivien william xavier yann yannick yohan yves yvan
`);

export const PRENOMS_F = liste(`
  agathe agnes alexandra alice aline amandine amelie anais anne annabelle annie ariane audrey aurelie axelle beatrice
  benedicte bernadette brigitte carole caroline catherine cecile celine chantal charlotte chloe christelle christine
  claire clara claudine clemence colette coralie corinne danielle delphine denise dorothee eliane elisabeth elise elodie
  eloise elsa emeline emilie emma emmanuelle estelle eva evelyne fabienne fanny florence francine francoise gaelle
  genevieve ghislaine gisele helene ines ingrid isabelle jacqueline jeanne jessica jocelyne josephine josiane julia
  julie juliette justine karine laetitia laura laure laurence lea leila liliane lina lisa lise lola louise lucie lucile
  ludivine maeva magali manon margaux marianne marie marine marion martine maryse mathilde maud melanie michele mireille
  monique morgane mylene myriam nadege nadia nadine nathalie nicole nina noemie oceane odile ophelie pascale patricia
  pauline perrine rachel regine rose roselyne sabine sabrina salome sandra sandrine sarah severine simone solene sophie
  stephanie suzanne sylvie tiphaine valentine valerie vanessa veronique victoire virginie yasmine yvonne zoe
`);

// Prénoms mixtes : reconnus comme prénoms pour le tri, sans civilité pour les relances.
export const PRENOMS_MIXTES = liste('alix camille charlie claude dominique mael morgan sacha');

// Minuscules sans accents, première partie d'un prénom composé (« Jean-Marc » -> « jean »).
function cle(mot) {
  return String(mot).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split('-')[0];
}

// 'M', 'F' ou '' (prénom inconnu ou mixte).
export function genre(mot) {
  const c = cle(mot);
  if (PRENOMS_M.has(c)) return 'M';
  if (PRENOMS_F.has(c)) return 'F';
  return '';
}

// Vrai si le mot est un prénom connu (mixte compris).
export function estPrenom(mot) {
  return genre(mot) !== '' || PRENOMS_MIXTES.has(cle(mot));
}

// « M. Durand » ou « Mme Durand » à partir du nom complet (« Jérôme Durand » comme « Durand Jérôme ») ;
// '' si le prénom est inconnu, mixte, ou s'il n'y a pas de nom de famille.
export function civiliteEtNom(nomComplet) {
  const mots = String(nomComplet || '').trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return '';
  // Le premier mot l'emporte s'il est un prénom, même mixte (« Camille Martin » : pas de civilité)
  const i = estPrenom(mots[0]) ? 0 : (estPrenom(mots[mots.length - 1]) ? mots.length - 1 : -1);
  if (i < 0 || !genre(mots[i])) return '';
  const famille = mots.filter((m, j) => j !== i).join(' ');
  return (genre(mots[i]) === 'M' ? 'M. ' : 'Mme ') + famille;
}
