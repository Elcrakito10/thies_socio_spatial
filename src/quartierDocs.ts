// ============================================================
// Documents consultables sur le web, rattaches a des quartiers precis.
// Chaque entree a ete ouverte et lue : la note dit ce que la source affirme
// a propos du quartier (rien de plus). Aucun document n'est copie : seul le lien est conserve.
// "centre" = le document traite du quartier ; "mention" = le quartier y est cite.
// ============================================================
export type DocType = "Presse" | "Mémoire universitaire" | "Rapport de recherche";
export type QDoc = { id: string; title: string; outlet: string; date: string; type: DocType; url: string };
export type QLink = { doc: string; level: "centre" | "mention"; note: string };

export const DOCS: Record<string, QDoc> = {
  lamyS: { id: "lamyS", title: "Compétition nationale « Sétal Sunu Gox » : la cité Lamy de Thiès, quartier le plus propre du Sénégal", outlet: "Seneweb (Cheikh Camara)", date: "1er janvier 2025", type: "Presse", url: "https://www.seneweb.com/en/news/Societe/competition-nationale-setal-sunu-gox-cite-lamy-de-thies-quartier-le-plus-propre-du-senegal_n_459667.html" },
  lamyL: { id: "lamyL", title: "Thiès : la Cité Lamy, modèle de propreté et de cadre de vie attrayant", outlet: "Le Soleil (Fatou Diéry Diagne)", date: "mars 2026", type: "Presse", url: "https://lesoleil.sn/actualites/arts-et-culture/thies-la-cite-lamy-modele-de-proprete-et-de-cadre-de-vie-attrayant/" },
  ballL: { id: "ballL", title: "À la découverte du premier quartier des cheminots européens à Thiès", outlet: "Le Soleil (Aliou Diouf)", date: "7 avril 2026", type: "Presse", url: "https://lesoleil.sn/actualites/environnement/a-la-decouverte-du-premier-quartier-des-cheminots-europeens-a-thies/" },
  ballD: { id: "ballD", title: "Thiès : Mansour Faye remet une vingtaine de titres de propriété aux habitants de l'ex-Ballabey", outlet: "Dakaractu (Mamadou Lamine Mbaye)", date: "24 août 2023", type: "Presse", url: "https://www.dakaractu.com/Thies-Mansour-Faye-remet-une-vingtaine-de-titres-de-propriete-aux-habitants-de-l-ex-Ballabey_a237315.amp.html" },
  medD: { id: "medD", title: "Thiès, Médina Fall Extension : les habitants exigent la fermeture du dépotoir d'ordures", outlet: "Dakaractu", date: "28 juillet 2025", type: "Presse", url: "https://www.dakaractu.com/Thies-Medina-Fall-Extension-les-habitants-exigent-la-fermeture-du-depotoir-d-ordures-et-indexent-le-mutisme-des_a263749.amp.html" },
  magal: { id: "magal", title: "Magal : la philosophie mouride bien implantée à Thiès", outlet: "Seneweb (Cheikh Camara)", date: "22 août 2024", type: "Presse", url: "https://www.seneweb.com/fr/news/Societe/magal-la-philosophie-mouride-bien-implantee-a-thies_n_448649.html" },
  diaL: { id: "diaL", title: "Thiès : le délégué de quartier de Diakhao Thialy plaide pour le renforcement de son statut et de son autorité", outlet: "Le Soleil (Ibrahima Ndiaye)", date: "24 janvier 2026", type: "Presse", url: "https://lesoleil.sn/actualites/societe-fait-divers/thies-le-delegue-de-quartier-de-diakhao-thialy-plaide-pour-le-renforcement-de-son-statut-et-de-son-autorite/" },
  repD: { id: "repD", title: "Reportage : coût de la vie, absence d'actions sociales — quand les Thiessois tirent le diable par la queue", outlet: "Dakaractu (Moussa Fall)", date: "26 décembre 2025", type: "Presse", url: "https://www.dakaractu.com/Reportage-Cout-de-la-vie-absence-d-actions-sociales-Quand-les-Thiessois-tirent-le-diable-par-la-queue_a267817.html" },
  ngom: { id: "ngom", title: "La vulnérabilité de la commune d'arrondissement de Thiès-Nord (ville de Thiès) aux inondations — chap. 3 (population et morphologie urbaine)", outlet: "Memoire Online — S. B. Ngathie Ngom, Master de géographie, UCAD, 2013", date: "2013", type: "Mémoire universitaire", url: "https://www.memoireonline.com/04/17/9811/m_La-vulnerabilite-de-la-commune-d-arrondissement-de-Thies-nord-ville-de-Thies-aux-inondations17.html" },
  dvf: { id: "dvf", title: "Approvisionnement en eau potable et évacuation des eaux usées domestiques dans la ville de Thiès : cas du quartier de DVF", outlet: "Memoire Online — B. Diouf, Master 2, UCAD, 2011", date: "2011", type: "Mémoire universitaire", url: "https://www.memoireonline.com/10/12/6251/m_Approvisionnement-en-eau-potable-et-evacuation-des-eaux-usees-domestiques-dans-la-ville-de-Thies8.html" },
  tepe: { id: "tepe", title: "Le lotissement à la périphérie de Thiès : problématique d'une gestion foncière entre la ville de Thiès et la communauté rurale de Fandène", outlet: "Isabel Tepe, Arbeitspapiere n° 43, Université de Mayence", date: "2004", type: "Rapport de recherche", url: "https://www.ifeas.uni-mainz.de/files/2019/07/Tepe.pdf" },
};

/** Cle = nom du quartier de la base, sans accents ni majuscules, espaces simples. */
export const QUARTIER_DOCS: Record<string, QLink[]> = {
  "cite lamy": [
    { doc: "lamyS", level: "centre", note: "La cité Lamy (Thiès-Est) remporte le premier prix de la compétition « Sétal Sunu Gox », lancée lors de la journée nationale de mobilisation citoyenne du 7 décembre 2024." },
    { doc: "lamyL", level: "centre", note: "Ancien quartier traditionnel transformé par l'urbanisation, désigné quartier le plus propre du Sénégal grâce à l'implication des habitants (la page ne reproduit que le chapeau de l'article)." },
  ],
  "cite balabey (cite i)": [
    { doc: "ballL", level: "centre", note: "Construite par l'administration coloniale à partir de 1921 pour le personnel ferroviaire européen : première cité résidentielle de la « capitale du rail ». Aujourd'hui délabrée, elle souffre de pénuries d'eau, d'insécurité et d'une situation foncière non réglée pour des familles de cheminots." },
    { doc: "ballD", level: "centre", note: "Remise d'une vingtaine d'attestations de propriété sur les 145 logements occupés de l'ex-Ballabey, devenue Cité Ibrahima Sarr." },
  ],
  "medina fall": [
    { doc: "medD", level: "centre", note: "Les habitants de Médina Fall Extension (Thiès Nord) dénoncent un dépotoir sauvage nuisible à leur santé et en réclament la fermeture." },
    { doc: "magal", level: "mention", note: "Quartier fondé par Mame Cheikh Ibrahima Fall, présenté comme un bastion des baay faal." },
    { doc: "repD", level: "mention", note: "Quartier très animé mais touché par la pauvreté selon le reportage ; un habitant évoque une hausse de la délinquance." },
    { doc: "ngom", level: "mention", note: "Quartier bas, dans le prolongement de la cuvette de Thiès, traversé par la RN2 ; cité parmi les quartiers les plus affectés par les inondations." },
  ],
  "kawsara fall": [{ doc: "magal", level: "mention", note: "Orthographié « Kaosara Fall » dans l'article : quartier créé par les descendants et disciples du cheikh, bastion baay faal." }],
  "keur cheikh": [{ doc: "magal", level: "mention", note: "Cité parmi les quartiers mourides de la zone de Santhiane (près de la mosquée Nimzatt, route de Khombole) ; l'article mentionne aussi « Keur Cheikh Ibra », bastion baay faal." }],
  "darou salam i": [{ doc: "magal", level: "mention", note: "« À Hersent se situent les quartiers mourides Darou Salam 1 et 2. »" }],
  "darou salam ii": [{ doc: "magal", level: "mention", note: "« À Hersent se situent les quartiers mourides Darou Salam 1 et 2. »" }],
  "thionakh": [{ doc: "magal", level: "mention", note: "D'importantes communautés baay faal s'y sont installées." }, { doc: "tepe", level: "mention", note: "Cité dans une note parmi les villages rattachés à la commune de Thiès." }],
  "thiapong": [{ doc: "magal", level: "mention", note: "D'importantes communautés baay faal s'y sont installées." }],
  "zac de thies": [{ doc: "magal", level: "mention", note: "L'article décrit « Darou Baïré (ZAC) », présenté comme un quartier entièrement baay faal dont la communauté pratique l'agriculture." }],
  "diakhao thialy": [{ doc: "diaL", level: "centre", note: "Les habitants (Thiès Nord) font face à l'insalubrité, à l'insécurité et à l'absence d'assainissement ; le délégué installé en mai 2025 a lancé un comité d'initiatives et une enquête communautaire en vue d'un plan de développement du quartier." }],
  "diakhao": [{ doc: "ngom", level: "mention", note: "Quartier traversé par le grand canal de drainage des eaux, très ensablé, ce qui limite l'évacuation en saison des pluies." }],
  "nguinth": [
    { doc: "ngom", level: "mention", note: "Site bas à nappe moins profonde ; selon le délégué de quartier, la route qui le coupe en deux fonctionne davantage comme une digue pour les eaux que comme une voie de dégagement." },
    { doc: "dvf", level: "mention", note: "Quartier voisin de DVF, au nord." },
  ],
  "escale nord": [
    { doc: "ngom", level: "mention", note: "Le système d'assainissement y pose de sérieux problèmes à cause de la voie ferrée, qui forme une digue au cœur de la cuvette." },
    { doc: "dvf", level: "mention", note: "DVF a été fondé vers 1912 pour accueillir des habitants déplacés du quartier Escale." },
  ],
  "escale sud": [{ doc: "dvf", level: "mention", note: "DVF a été fondé vers 1912 pour accueillir des habitants déplacés du quartier Escale." }],
  "takhikao": [{ doc: "ngom", level: "mention", note: "Population de 17 676 habitants et densité de 192 hab./ha selon le mémoire (date de ses données non précisée sur la page)." }],
  "randoulene nord": [{ doc: "repD", level: "mention", note: "Des habitants témoignent des difficultés économiques ; un père de famille cite le transport et le commerce, qui « ne marchent plus »." }],
  "silmang (keur dago)": [
    { doc: "repD", level: "mention", note: "Même constat de difficultés sociales ; les habitants demandent la réhabilitation des routes secondaires." },
    { doc: "tepe", level: "mention", note: "Silmang et Keur Dago figurent parmi les villages rattachés à la commune de Thiès." },
  ],
  "diassap": [
    { doc: "tepe", level: "centre", note: "Rattaché à la commune de Thiès par décret en 1978 et érigé en quartier en 2000, à environ 4 km au nord ; parcelles issues d'un lotissement d'initiative villageoise, sans documents officiels pour les habitants." },
    { doc: "ngom", level: "mention", note: "Cité parmi les villages rattachés à la commune d'arrondissement (sans détail)." },
  ],
  "dioung": [{ doc: "tepe", level: "mention", note: "Cité dans une note parmi les villages rattachés à la commune de Thiès." }],
  "keur  issa (bambara)": [{ doc: "tepe", level: "mention", note: "« Keur Issa Mbambara » figure parmi les villages rattachés." }, { doc: "ngom", level: "mention", note: "Keur Issa cité parmi les villages rattachés à la commune d'arrondissement (sans détail)." }],
  "keur saib ndoye": [{ doc: "ngom", level: "mention", note: "Cité parmi les villages rattachés à la commune d'arrondissement de Thiès-Nord (sans détail)." }],
  "pogniene": [{ doc: "ngom", level: "mention", note: "Orthographié « Pognène » : cité parmi les villages rattachés à la commune d'arrondissement (sans détail)." }],
  "keur mame elhadji": [{ doc: "dvf", level: "mention", note: "Orthographié « Keur Mame El hadj » : quartier voisin de DVF, au nord." }],
  "mbambara": [{ doc: "dvf", level: "mention", note: "Quartier voisin de DVF, au sud." }],
  "dvf (aiglon)": [{ doc: "dvf", level: "centre", note: "Étude consacrée à DVF (Derrière la Voie Ferrée), fondé vers 1912 ; ce volet n'en détaille pas les sous-quartiers." }, { doc: "magal", level: "mention", note: "Le quartier Aiglon est cité : le cheikh Ahmadou Bamba Seck s'y est établi." }],
  "dvf (bayal)": [{ doc: "dvf", level: "centre", note: "Étude consacrée à DVF (Derrière la Voie Ferrée), fondé vers 1912 ; ce volet n'en détaille pas les sous-quartiers." }],
  "dvf (cite niakh)": [{ doc: "dvf", level: "centre", note: "Étude consacrée à DVF (Derrière la Voie Ferrée), fondé vers 1912 ; ce volet n'en détaille pas les sous-quartiers." }],
  "dvf (pinthie ali nguer)": [{ doc: "dvf", level: "centre", note: "Étude consacrée à DVF (Derrière la Voie Ferrée), fondé vers 1912 ; ce volet n'en détaille pas les sous-quartiers." }],
};
export const keyOf = (nom: string) => nom.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
