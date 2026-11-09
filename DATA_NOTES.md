# Données intégrées — Thiès

## Périmètres
- 3 communes urbaines : THIES EST, THIES OUEST, THIES NORD.
- 68 polygones de quartiers issus de `quartier_TH.shp`.
- Répartition des polygones : 22 THIES EST, 23 THIES OUEST, 23 THIES NORD.
- Le champ utilisé pour la commune urbaine est `CCRCA`, et non `CAV` (qui contenait notamment la valeur THIES SUD dans la couche source).

## Recensement 2023
Le fichier `data-recensement thies (2)(2).xlsx` contient 70 localités recensées :
- Population : 391 253
- Ménages : 47 581
- Hommes : 195 085
- Femmes : 196 168

Répartition population :
- THIES EST : 166 256
- THIES NORD : 136 138
- THIES OUEST : 88 859

## Enquête ménages
Le fichier `resultats (4).xlsx` contient 8 feuilles de synchronisation. Chaque feuille est comptée comme une synchronisation de collecte conformément à la règle demandée pour l'application.

Nombre de lignes par feuille : 7 + 12 + 4 + 8 + 11 + 33 + 51 + 98 = **224 ménages/enregistrements enquêtés**.

Le total est présenté comme un volume de collecte et non comme une estimation exhaustive de la population de Thiès.

## Confidentialité
Les noms, numéros de téléphone et autres informations personnelles du fichier d'enquête ne sont pas exposés dans l'interface publique.

## Résultats de l'analyse de ségrégation (octobre 2026)
Source : dossier RESULTATS_SEGREGATION_SOCIO_SPATIALE_THIES (validé par l'encadreur M. Alphousseyni Ndonky).
- `public/data/resultats_quartiers.json` : valeurs par quartier (clé `quartier_id`), fusionnées dans chaque quartier par `src/api.ts` (`dataFetch`), que les données viennent de l'API ou des fichiers.
  Les anciens `ind_niveau_vie_0_1` (indice inversé) et `ind_instruction_0_1` sont remplacés par les valeurs validées.
- `public/data/resultats_indices.json` : tableau des indices (Gini, Theil, D, IS, H, Moran, LISA), corrélations, corrections, classification (KMO, ACP, choix de k, profils).
- `public/data/resultats_base_68.json` : base finale (catalogue Données).
- `public/resultats/` : rapports PDF, base CSV/XLSX, synthèse XLSX, GeoPackage, 19 cartes (`cartes/*.webp`).
Points ouverts signalés par le groupe : règle de découpage du réseau routier, méthode de collecte de la mobilité, superficie de Cité Senghor II (0,026 km²).

## Ratios, normes et équipements (éducation primaire, santé)
- Fichier : `public/data/equipements_normes.json`, produit par `data/build_equipements.py` (nécessite `pip install shapely`). Il contient les comptages d'équipements par quartier et par type (jointure spatiale), le poste de santé de rattachement de chaque quartier, les 28 postes publics (population de leur aire, médecins, infirmiers, techniciens supérieurs) et les hôpitaux.
- Les ratios sont calculés dans le navigateur (`src/equip.ts`) avec des hypothèses modifiables (onglet « Hypothèses » du panneau de droite, thème « Ratios & normes »).
- Éducation : écoles primaires = écoles élémentaires publiques et privées + écoles franco-arabes (option). Une école = 6 classes × 48 élèves = 288 places (standard de 48 élèves par classe, rapport JICA). Enfants de 6-11 ans = 14 % de la population : **hypothèse**, le recensement fourni ne donne pas l'âge (les 0-14 ans représentent 39,1 % au niveau national, RGPH-5).
- Santé : norme de 7 714 habitants par poste de santé urbain (carte sanitaire du Sénégal, mise à jour 2011 ; 3 871 en rural, 116 519 pour un centre de santé). Les structures sont additionnées en « équivalents-poste » selon la hiérarchie des fonctions (poste 1, centre de santé 9 = 27 agents ÷ 3, clinique 3, cabinet 0,5, laboratoire 0,25 : poids **hypothétiques** sauf poste et centre de santé). Les hôpitaux et les pharmacies ne sont pas comptés ; aucun ratio d'hôpital par quartier.
- Personnel : effectifs des 28 postes publics (classeur `Ratios_postes_sante_ecarts_OMS.xlsx`, dossier `data/source/postes_sante/`) rapportés à la population de l'aire de chaque poste ; normes OMS : 1 médecin pour 10 000 habitants, 1 infirmier pour 5 000, techniciens supérieurs alignés sur les infirmiers (hypothèse). Chaque quartier prend le ratio de son poste de rattachement (noms des quartiers de l'aire administrative, puis recouvrement spatial pour Hlm Dixième et Som Cité Ousmane Ngom). L'aire de Médina Fall 2 n'a pas de quartier correspondant dans les 65 quartiers.
- Niveaux d'insuffisance (seuils du classeur, à valider avec l'encadreur) : couverture ≥ 100 % respectée ; 75-100 % légère ; 50-75 % modérée ; 25-50 % sévère ; < 25 % critique.
