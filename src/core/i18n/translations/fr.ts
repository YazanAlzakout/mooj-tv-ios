import type { TranslationShape } from "./en";

const fr: TranslationShape = {
  common: {
    back: "Retour",
    cancel: "Annuler",
    remove: "Supprimer",
    save: "Enregistrer",
    search: "Rechercher",
    loading: "Chargement…",
    retry: "Réessayer",
    refreshFailed: "Actualisation impossible pour le moment — réessayez.",
    noInternet: "Aucune connexion Internet.",
    providerUnreachable: "Le serveur du fournisseur ne répond pas pour le moment. Réessayez dans un instant.",
    confirm: "Confirmer",
    clear: "Effacer",
    edit: "Modifier",
    add: "Ajouter",
    connect: "Connecter",
    accept: "Accepter",
    previous: "Préc.",
    next: "Suivant",
    ok: "OK",
    later: "Plus tard",
    yes: "Oui",
    no: "Non",
    justNow: "À l'instant",
    minutesAgo: "il y a {n} min",
    hoursAgo: "il y a {n} h",
    daysAgo: "il y a {n} j",
  },

  onboarding: {
    skip: "Passer",
    next: "Suivant",
    getStarted: "Commencer",
    slide1Title: "TV en direct, films et séries",
    slide1Body: "Tout ce que propose votre fournisseur IPTV, organisé et consultable en un seul endroit.",
    slide2Title: "Conçu pour un zapping rapide",
    slide2Body: "Passez d'une chaîne à l'autre instantanément, avec un lecteur conçu pour suivre le rythme.",
    slide3Title: "Votre fournisseur, vos données",
    slide3Body:
      "Mooj TV ne diffuse que le contenu du fournisseur auquel vous vous connectez — rien n'est stocké ni partagé au-delà de votre appareil.",
  },

  legal: {
    title: "Conditions générales",
    acceptButton: "Accepter et continuer",
    accepted: "Accepté",
    lastUpdatedLabel: "Dernière mise à jour",
    lastUpdatedDate: "2026-11-08",
    eulaTitle: "Contrat de licence utilisateur final (EULA)",
    tosTitle: "Conditions d'utilisation",
    dmcaTitle: "Avis Droits d'auteur / DMCA",
    sections: {
      scopeAndAcceptance: {
        heading: "Acceptation et champ d'application",
        body: [
          "Les présentes conditions (y compris l'EULA, les Conditions d'utilisation et l'Avis Droits d'auteur/DMCA) régissent votre utilisation d'Mooj TV (l'« Application »). En téléchargeant, installant, accédant à ou utilisant l'Application, vous acceptez d'être lié par ces conditions.",
          "Si vous n'acceptez pas, n'utilisez pas l'Application.",
        ],
      },
      noContentProvided: {
        heading: "Aucun contenu fourni ou hébergé",
        body: [
          "L'Application est uniquement un lecteur multimédia. L'Application n'inclut pas, ne fournit pas, ne vend pas, ne concède pas de licence, ne distribue pas et ne diffuse aucun contenu, chaîne ou liste de lecture par défaut.",
          "Les développeurs n'hébergent aucun fichier média, liste de lecture, chaîne ou flux, et n'exploitent aucun service IPTV.",
        ],
      },
      userProvidedContent: {
        heading: "Contenu fourni par l'utilisateur uniquement",
        body: [
          "Pour utiliser l'Application, vous devez fournir vos propres sources de contenu, telles que des identifiants Xtream Codes ou des URL de flux directes, provenant de serveurs que vous contrôlez ou auxquels vous êtes autorisé à accéder.",
          "Vous déclarez et garantissez disposer de tous les droits, licences et autorisations nécessaires pour accéder à tout contenu chargé dans l'Application et l'utiliser.",
        ],
      },
      userResponsibility: {
        heading: "Responsabilité de l'utilisateur (légalité et droits d'auteur)",
        body: [
          "Vous êtes seul et entièrement (100 %) responsable de la légalité du contenu auquel vous accédez, que vous diffusez ou affichez via l'Application, y compris du respect des lois sur le droit d'auteur et droits voisins applicables dans votre juridiction.",
          "Vous acceptez de ne pas utiliser l'Application pour accéder à du contenu contrefaisant, non autorisé ou illégal, ni pour en faciliter l'accès.",
        ],
      },
      noAffiliation: {
        heading: "Aucune affiliation ni approbation",
        body: [
          "Les développeurs ne vendent pas, n'approuvent pas, ne sponsorisent pas et ne sont affiliés à aucun fournisseur IPTV ni service média tiers.",
          "Toute référence à des tiers est faite à des fins de compatibilité ou de description et n'implique aucune association ni approbation.",
        ],
      },
      prohibitedUses: {
        heading: "Usages interdits",
        body: [
          "Vous ne devez pas utiliser l'Application pour enfreindre une loi ou un règlement, y compris les lois sur le droit d'auteur.",
          "Vous ne devez pas téléverser, partager, promouvoir ou faire la publicité de listes de lecture ou flux contrefaisants via l'Application.",
          "Vous ne devez pas tenter de contourner, désactiver ou interférer avec la sécurité, les contrôles d'accès, le DRM, les restrictions géographiques ou les restrictions réseau applicables à un contenu ou service.",
          "Vous ne devez pas rétro-concevoir, décompiler ou tenter d'extraire le code source de l'Application, sauf dans la mesure permise par la loi.",
        ],
      },
      thirdPartyServices: {
        heading: "Services et liens tiers",
        body: [
          "L'Application peut vous permettre de vous connecter à des serveurs ou services tiers que vous choisissez de configurer. Ces tiers ne sont pas contrôlés par les développeurs et peuvent avoir leurs propres conditions et politiques de confidentialité.",
          "Les développeurs ne sont pas responsables du contenu tiers, de sa disponibilité, de sa qualité, de sa légalité, ni des dommages résultant de votre utilisation de services tiers.",
        ],
      },
      termination: {
        heading: "Résiliation",
        body: [
          "Votre droit d'utiliser l'Application peut être suspendu ou résilié si vous violez ces conditions ou si la loi l'exige.",
          "En cas de résiliation, vous devez cesser d'utiliser l'Application. Les dispositions destinées à survivre (notamment les exclusions de garanties, limitation de responsabilité, indemnisation et droit applicable) survivront.",
        ],
      },
      disclaimers: {
        heading: "Exclusions de garanties",
        body: [
          "L'APPLICATION EST FOURNIE « EN L'ÉTAT » ET « SELON DISPONIBILITÉ », SANS GARANTIE D'AUCUNE SORTE, EXPRESSE, IMPLICITE OU LÉGALE, Y COMPRIS LES GARANTIES IMPLICITES DE QUALITÉ MARCHANDE, D'ADÉQUATION À UN USAGE PARTICULIER ET DE NON-CONTREFAÇON.",
          "Les développeurs ne garantissent pas que l'Application sera ininterrompue, exempte d'erreurs, sécurisée ou compatible avec tous les appareils ou sources de contenu.",
        ],
      },
      limitationOfLiability: {
        heading: "Limitation de responsabilité",
        body: [
          "DANS LA MESURE MAXIMALE PERMISE PAR LA LOI, LES DÉVELOPPEURS NE SERONT PAS RESPONSABLES DES DOMMAGES INDIRECTS, ACCESSOIRES, SPÉCIAUX, CONSÉCUTIFS, EXEMPLAIRES OU PUNITIFS, NI DE TOUTE PERTE DE PROFITS, REVENUS, DONNÉES OU CLIENTÈLE, DÉCOULANT DE OU LIÉE À VOTRE UTILISATION DE L'APPLICATION.",
          "Dans la mesure où la responsabilité ne peut être exclue, la responsabilité totale des développeurs sera limitée au montant que vous avez payé pour l'Application (le cas échéant) au cours des douze (12) mois précédant l'événement à l'origine de la réclamation.",
        ],
      },
      indemnification: {
        heading: "Indemnisation",
        body: [
          "Vous acceptez de défendre, d'indemniser et de dégager de toute responsabilité les développeurs contre toute réclamation, dommage, responsabilité, perte et dépense (y compris des frais d'avocat raisonnables) résultant de ou liée à vos sources de contenu, votre utilisation de l'Application, ou votre violation de ces conditions ou de toute loi.",
        ],
      },
      dmcaNotice: {
        heading: "Avis Droits d'auteur / DMCA (aucun hébergement)",
        body: [
          "Les développeurs n'hébergent, ne stockent, ne transmettent ni ne distribuent aucun contenu média. L'Application ne fait que lire le contenu fourni et contrôlé par l'utilisateur ou par des serveurs tiers configurés par l'utilisateur.",
          "Si vous estimez qu'un contenu accessible via l'Application porte atteinte à des droits d'auteur, vous devez adresser votre plainte à l'hébergeur ou à l'opérateur du serveur qui stocke ou transmet le contenu, et non aux développeurs de l'Application.",
        ],
      },
      dmcaHowToSubmit: {
        heading: "Soumettre une notification de droit d'auteur",
        body: [
          "Si vous devez malgré tout contacter les développeurs au sujet d'une préoccupation relative au droit d'auteur, envoyez une notification à l'adresse email ci-dessous en incluant : (a) l'identification de l'œuvre protégée ; (b) l'identification du contenu prétendument contrefaisant (avec suffisamment d'informations pour le localiser, y compris le serveur/URL) ; (c) vos coordonnées ; (d) une déclaration de bonne foi ; et (e) une déclaration sous peine de parjure que la notification est exacte et que vous êtes le titulaire des droits ou autorisé à agir en son nom.",
        ],
      },
      governingLaw: {
        heading: "Droit applicable et juridiction",
        body: [
          "Les présentes conditions sont régies par les lois de la République arabe d'Égypte, sans égard aux règles de conflit de lois.",
          "Vous acceptez que tout litige découlant de ou lié à l'Application ou aux présentes conditions soit porté devant les tribunaux compétents de la République arabe d'Égypte, et vous consentez à leur compétence.",
        ],
      },
      contact: {
        heading: "Contact",
        body: ["Pour les demandes légales (y compris les notifications de droit d'auteur), contactez :", "Email : support@mooj-player.com"],
      },
    },
  },

  privacy: {
    title: "Politique de confidentialité",
    lastUpdatedLabel: "Dernière mise à jour",
    lastUpdatedDate: "2026-11-08",
    intro: "La présente politique décrit la manière dont Mooj TV (l'« Application ») traite vos informations. Elle s'applique à l'application Android Mooj TV publiée sous le nom de package com.moojtv.player.",
    sections: {
      summary: {
        heading: "En résumé",
        body: [
          "Mooj TV ne collecte, ne transmet ni ne stocke aucune donnée personnelle vous concernant. Il n'y a aucun compte, aucune inscription, aucune analyse d'audience, aucune publicité et aucun suivi d'aucune sorte.",
          "Tout ce que l'Application conserve — les informations de votre fournisseur, vos favoris, votre historique, vos téléchargements — reste sur votre appareil et ne nous est jamais transmis.",
        ],
      },
      noCollection: {
        heading: "Ce que nous collectons",
        body: [
          "Rien. Les développeurs de Mooj TV n'exploitent aucun serveur recevant des données de l'Application et n'ont aucun moyen de vous identifier, ni d'identifier votre appareil.",
          "L'Application ne contient aucun SDK d'analyse d'audience, aucun SDK publicitaire, aucun service de rapport de plantage et aucun identifiant publicitaire ou de suivi tiers.",
        ],
      },
      credentials: {
        heading: "Les informations de votre fournisseur",
        body: [
          "Pour regarder quoi que ce soit, vous saisissez les informations d'un service auquel vous êtes déjà abonné : une adresse de serveur, un nom d'utilisateur et un mot de passe, ou un lien de flux direct.",
          "Ces informations sont stockées uniquement sur votre appareil, dans le stockage sécurisé adossé à l'Android Keystore que le système d'exploitation fournit pour les secrets. Elles ne sont jamais écrites dans la base de données ordinaire de l'Application, jamais consignées dans un journal, et jamais transmises aux développeurs ni à un tiers quelconque.",
          "Elles sont envoyées à une seule destination : le fournisseur pour lequel vous les avez saisies, afin de vous connecter et de lire ce que vous avez demandé. Ce fournisseur est votre propre prestataire et son traitement de vos données est régi par ses propres conditions, et non par la présente politique.",
        ],
      },
      onDevice: {
        heading: "Ce qui reste sur votre appareil",
        body: [
          "L'Application conserve localement les éléments suivants afin de pouvoir fonctionner : la liste des fournisseurs que vous avez ajoutés, les catégories que vous avez masquées, vos favoris et votre liste « à regarder plus tard », votre historique de visionnage et vos positions de lecture, vos fichiers téléchargés, votre code PIN parental si vous en avez défini un, et vos paramètres tels que la langue et le thème.",
          "Tous ces éléments se trouvent dans le stockage privé de l'Application sur votre appareil. Aucun d'entre eux n'est sauvegardé chez nous, synchronisé ou partagé.",
        ],
      },
      network: {
        heading: "Connexions réseau",
        body: [
          "L'Application effectue des requêtes réseau vers un seul type de destination : le fournisseur dont vous avez saisi les informations. Elle récupère auprès de ce fournisseur vos listes de chaînes, de films et de séries, les images vers lesquelles ces listes renvoient, et les flux que vous choisissez de lire.",
          "L'Application ne contacte aucun serveur exploité par les développeurs, car il n'en existe aucun.",
          "La recherche d'une nouvelle version de l'Application est assurée par Google Play sur votre appareil, et non par l'Application elle-même.",
        ],
      },
      permissions: {
        heading: "Autorisations, et pourquoi chacune est demandée",
        body: [
          "Internet et état du réseau : pour joindre votre fournisseur et vous signaler lorsque l'appareil est hors ligne.",
          "Service de premier plan et lecture multimédia : pour maintenir la lecture en cours lorsque l'écran est éteint ou qu'une autre application est au premier plan, si vous activez cette option dans les Paramètres.",
          "Maintien en éveil : pour empêcher l'appareil de se mettre en veille au milieu de ce que vous regardez.",
          "Modification des paramètres audio : pour gérer le volume et le focus audio pendant la lecture.",
          "Vibration : pour le bref retour haptique lors des appuis dans l'interface.",
          "Stockage, sur Android 12 et versions antérieures uniquement : pour enregistrer les téléchargements que vous demandez.",
          "L'Application ne demande pas l'accès à votre appareil photo, votre microphone, votre position, vos contacts, votre agenda, vos photos, ni à votre historique d'appels ou de messages, et ne peut pas les lire.",
        ],
      },
      children: {
        heading: "Enfants",
        body: [
          "Mooj TV ne s'adresse pas aux enfants et n'est pas conçue pour eux. L'Application ne collecte aucune donnée de qui que ce soit, y compris des enfants.",
          "Un code PIN parental est disponible dans les Paramètres afin que la personne propriétaire de l'appareil puisse restreindre les catégories visibles.",
        ],
      },
      retention: {
        heading: "Conservation et suppression de vos informations",
        body: [
          "Comme rien ne nous parvient, nous n'avons rien à conserver ni à supprimer en votre nom.",
          "Tout ce que l'Application a stocké est sous votre contrôle sur l'appareil. Vous pouvez supprimer un fournisseur et ses identifiants enregistrés depuis l'écran des fournisseurs, effacer votre historique de visionnage et vider les images en cache depuis les Paramètres, supprimer les téléchargements depuis l'écran des téléchargements, et tout supprimer d'un coup en désinstallant l'Application ou en effaçant ses données dans les paramètres Android.",
          "La désinstallation de l'Application supprime l'intégralité de son stockage local, y compris les identifiants de fournisseur enregistrés.",
        ],
      },
      security: {
        heading: "Sécurité",
        body: [
          "Les mots de passe des fournisseurs sont conservés dans le stockage sécurisé du système d'exploitation, qui est adossé à l'Android Keystore et chiffré par l'appareil.",
          "L'adresse de serveur d'un fournisseur est masquée partout où elle est affichée dans l'Application, de sorte que l'adresse complète ne puisse pas être lue sur un écran déverrouillé.",
          "De nombreux fournisseurs IPTV ne sont accessibles qu'en HTTP simple, ce que l'Application autorise donc. Le trafic vers un tel fournisseur n'est pas chiffré en transit, et il s'agit d'une caractéristique du fournisseur que vous avez choisi et non de l'Application. Si votre fournisseur propose une adresse HTTPS, privilégiez-la.",
        ],
      },
      changes: {
        heading: "Modifications de la présente politique",
        body: [
          "Si la présente politique est modifiée, la version révisée sera publiée à l'adresse ci-dessous et la date figurant en haut de cette page sera mise à jour.",
        ],
      },
      contact: {
        heading: "Contact",
        body: [
          "Pour toute question concernant la présente politique ou la confidentialité dans Mooj TV, contactez :",
          "Email : support@mooj-player.com",
          "Web : https://mooj-player.com/privacy.html",
        ],
      },
    },

    ios: {
      lastUpdatedDate: "2026-11-18",
      intro: "La présente politique décrit la manière dont Mooj TV (l'« Application ») traite vos informations. Elle s'applique à l'application Mooj TV pour iPhone et iPad, publiée sous l'identifiant de bundle com.moojtv.player.",
      sections: {
        summary: {
          heading: "En résumé",
          body: [
            "Mooj TV ne collecte, ne transmet ni ne stocke aucune donnée personnelle vous concernant. Il n'y a aucun compte, aucune inscription, aucune analyse d'audience, aucune publicité et aucun suivi d'aucune sorte.",
            "Tout ce que l'Application conserve — les informations de votre fournisseur, vos favoris, votre historique — reste sur votre appareil et ne nous est jamais transmis.",
          ],
        },
        credentials: {
          heading: "Les informations de votre fournisseur",
          body: [
            "Pour regarder quoi que ce soit, vous saisissez les informations d'un service auquel vous êtes déjà abonné : une adresse de serveur, un nom d'utilisateur et un mot de passe, ou un lien de flux direct.",
            "Ces informations sont stockées uniquement sur votre appareil, dans le trousseau iOS (le Keychain), le stockage sécurisé que le système d'exploitation fournit pour les secrets. Elles ne sont jamais écrites dans la base de données ordinaire de l'Application, jamais consignées dans un journal, et jamais transmises aux développeurs ni à un tiers quelconque.",
            "Elles sont envoyées à une seule destination : le fournisseur pour lequel vous les avez saisies, afin de vous connecter et de lire ce que vous avez demandé. Ce fournisseur est votre propre prestataire et son traitement de vos données est régi par ses propres conditions, et non par la présente politique.",
          ],
        },
        onDevice: {
          heading: "Ce qui reste sur votre appareil",
          body: [
            "L'Application conserve localement les éléments suivants afin de pouvoir fonctionner : la liste des fournisseurs que vous avez ajoutés, les catégories que vous avez masquées, vos favoris et votre liste « à regarder plus tard », votre historique de visionnage et vos positions de lecture, votre code PIN parental si vous en avez défini un, et vos paramètres tels que la langue et le thème.",
            "Le téléchargement pour un visionnage hors connexion n'est pas disponible dans la version iOS de l'Application : aucun fichier multimédia n'est donc enregistré sur votre appareil.",
            "Tous ces éléments se trouvent dans le stockage privé de l'Application sur votre appareil. Aucun d'entre eux n'est sauvegardé chez nous, synchronisé ou partagé.",
          ],
        },
        network: {
          heading: "Connexions réseau",
          body: [
            "L'Application effectue des requêtes réseau vers un seul type de destination : le fournisseur dont vous avez saisi les informations. Elle récupère auprès de ce fournisseur vos listes de chaînes, de films et de séries, les images vers lesquelles ces listes renvoient, et les flux que vous choisissez de lire.",
            "L'Application ne contacte aucun serveur exploité par les développeurs, car il n'en existe aucun.",
            "La recherche d'une nouvelle version de l'Application est assurée par l'App Store sur votre appareil, et non par l'Application elle-même.",
          ],
        },
        permissions: {
          heading: "Autorisations, et pourquoi l'Application n'en demande aucune",
          body: [
            "Sur iOS, l'Application ne vous demande aucune autorisation. Elle a besoin d'un accès réseau pour joindre votre fournisseur, et iOS l'accorde sans invite.",
            "L'Application ne demande pas l'accès à votre appareil photo, votre microphone, votre position, vos contacts, votre agenda, vos photos, ni à votre historique d'appels ou de messages, et ne peut pas les lire. Elle ne déclare aucune description d'usage pour l'un quelconque d'entre eux, ce qu'iOS exige avant qu'une application puisse même le demander.",
            "Elle n'utilise ni Face ID ni Touch ID, et n'affiche jamais l'invite de transparence du suivi des applications (App Tracking Transparency), car elle ne vous suit pas et n'a rien pour quoi demander une autorisation.",
          ],
        },
        retention: {
          heading: "Conservation et suppression de vos informations",
          body: [
            "Comme rien ne nous parvient, nous n'avons rien à conserver ni à supprimer en votre nom.",
            "Tout ce que l'Application a stocké est sous votre contrôle sur l'appareil. Vous pouvez supprimer un fournisseur et ses identifiants enregistrés depuis l'écran des fournisseurs, effacer votre historique de visionnage et vider les images en cache depuis les Paramètres, et tout supprimer d'un coup en supprimant l'Application de votre appareil.",
            "La suppression de l'Application efface l'intégralité de son stockage local, y compris les identifiants de fournisseur enregistrés.",
          ],
        },
        security: {
          heading: "Sécurité",
          body: [
            "Les mots de passe des fournisseurs sont conservés dans le stockage sécurisé du système d'exploitation — le trousseau iOS — qui est chiffré par l'appareil et n'est lisible qu'après un premier déverrouillage de l'appareil depuis son démarrage.",
            "L'adresse de serveur d'un fournisseur est masquée partout où elle est affichée dans l'Application, de sorte que l'adresse complète ne puisse pas être lue sur un écran déverrouillé.",
            "De nombreux fournisseurs IPTV ne sont accessibles qu'en HTTP simple, ce que l'Application autorise donc. Le trafic vers un tel fournisseur n'est pas chiffré en transit, et il s'agit d'une caractéristique du fournisseur que vous avez choisi et non de l'Application. Si votre fournisseur propose une adresse HTTPS, privilégiez-la.",
          ],
        },
      },
    },
  },

  providers: {
    title: "Fournisseurs",
    tagline: "Toutes vos chaînes, films et séries au même endroit.",
    addProvider: "+ Ajouter un fournisseur",
    noProvidersYet: "Aucun fournisseur pour l'instant.",
    active: "Actif",
    neverConnected: "Jamais connecté",
    removeTitle: "Supprimer le fournisseur",
    removeBody: 'Supprimer « {name} » ? Cette action est irréversible.',
    connectError: "Impossible de se connecter à ce fournisseur.",
    edit: "Modifier",
    connect: "Se connecter",
  },

  addProvider: {
    title: "Ajouter un fournisseur",
    unreachable: "Impossible de joindre ce serveur. Vérifiez l'adresse et votre connexion.",
    subtitle: "Saisissez vos identifiants Xtream Codes.",
    editTitle: "Modifier le fournisseur",
    typeXtream: "Xtream Codes",
    typeRemoteM3U: "M3U distant",
    typeLocalM3U: "Fichier M3U local",
    nameLabel: "Nom (facultatif)",
    namePlaceholder: "Mon fournisseur",
    defaultName: "Mon compte",
    serverUrlLabel: "URL du serveur",
    serverUrlPlaceholder: "http://exemple.com:8080",
    usernameLabel: "Nom d'utilisateur",
    passwordLabel: "Mot de passe",
    show: "Afficher",
    hide: "Masquer",
    connectButton: "Connecter",
    saveButton: "Enregistrer",
    m3uUrlLabel: "URL de la playlist",
    m3uUrlPlaceholder: "http://exemple.com/playlist.m3u8",
    chooseFileButton: "Choisir un fichier",
    noFileChosen: "Aucun fichier choisi",
    catalogEmpty: "Connexion établie, mais ce fournisseur n'a renvoyé aucun contenu — ni chaînes, ni films, ni séries.",
  },

  /*
   * The bottom tab bar's own two labels.
   *
   * Live, Movies and Series are not repeated here: the bar reads them from
   * `home`, so renaming a section renames it everywhere at once.
   */
  tabs: {
    home: "Accueil",
    more: "Plus",
  },

  home: {
    welcomeBack: "Bon retour",
    search: "Rechercher",
    browse: "Parcourir",
    liveTV: "TV en direct",
    movies: "Films",
    series: "Séries",
    liveTVSub: "Chaînes en direct",
    moviesSub: "Tout le catalogue de films",
    seriesSub: "Séries et épisodes",
    quickActions: "Actions rapides",
    favorites: "Favoris",
    watchLater: "À regarder plus tard",
    settings: "Paramètres",
    downloads: "Téléchargements",
    topRated: "Les mieux notés",
    newIn: "Nouveautés",
    featured: "En vedette",
    continueWatching: "Continuer à regarder",
    seeAll: "Tout voir",
    noWatchHistory: "Aucun historique de visionnage",
    clear: "Effacer",
    clearHistoryTitle: "Effacer l'historique de visionnage",
    clearHistoryBody: "Supprimer toutes les entrées « Continuer à regarder » ? Cette action est irréversible.",
  },

  history: {
    title: "Historique de visionnage",
    empty: "Aucun historique de visionnage pour l'instant.",
  },


  liveCategories: {
    title: "TV en direct",
    allCategory: "Tout",
    chooseCategory: "Choisir une catégorie",
  },

  liveChannelList: {
    channelsCountSuffix: "chaînes",
    searchPlaceholder: "Rechercher des chaînes",
    liveBadge: "DIRECT",
    noChannelsAvailable: "Aucune chaîne disponible.",
  },

  liveGuide: {
    guideButtonLabel: "Chaînes",
    title: "Chaînes",
    thisCategoryTab: "Cette catégorie",
    allChannelsTab: "Toutes les chaînes",
    noResults: "Aucune chaîne trouvée.",
    close: "Fermer",
  },

  livePlayer: {
    previousChannel: "Précédente",
    nextChannel: "Suivante",
    play: "Lecture",
    pause: "Pause",
    subtitles: "Sous-titres",
    audio: "Audio",
    mute: "Muet",
    unmute: "Son",
    aspectFit: "Ajuster",
    aspectFill: "Remplir",
    aspectStretch: "Étirer",
    streamPaused: "Cette diffusion est momentanément interrompue. Elle devrait revenir bientôt.",
    playbackBusy: "Le flux est occupé un instant. Patientez ou essayez une autre chaîne.",
    playbackOffAir: "Cette chaîne n'émet pas pour le moment. Essayez-en une autre.",
    playbackSlow: "La connexion est lente ou interrompue. Vérifiez votre réseau et réessayez.",
    playbackUnsupported: "Cette chaîne utilise un format que votre appareil ne peut pas lire.",
    playbackUnknown: "Cette chaîne ne démarre pas pour l'instant. Essayez-en une autre ou réessayez dans un moment.",
    vodBusy: "La lecture est occupée un instant. Patientez un peu et réessayez.",
    vodMissing: "Ce titre n'est pas disponible chez le fournisseur pour le moment.",
    vodSlow: "La connexion est lente ou interrompue. Vérifiez votre réseau et réessayez.",
    vodUnsupported: "Ce fichier utilise un format que votre appareil ne peut pas lire.",
    vodUnknown: "Ce titre ne démarre pas pour l'instant. Réessayez dans un moment.",
    sleepTimer: "Minuteur de veille",
    sleepOff: "Désactivé",
    channelNumber: "Aller à la chaîne",
  },

  moviesCategories: {
    title: "Films",
  },

  moviesGrid: {
    title: "Films",
    moviesCountSuffix: "films",
    noMoviesAvailable: "Aucun film disponible.",
    searchPlaceholder: "Rechercher des films",
  },

  movieDetails: {
    play: "Lecture",
    favorite: "Favori",
    favorited: "Dans les favoris",
    addWatchLater: "À regarder plus tard",
    inWatchLater: "Dans « à regarder plus tard »",
    plot: "Synopsis",
    cast: "Distribution",
    director: "Réalisateur",
    download: "Télécharger",
    downloaded: "Téléchargé",
  },

  seriesCategories: {
    title: "Séries",
  },

  seriesGrid: {
    title: "Séries",
    seriesCountSuffix: "séries",
    noSeriesAvailable: "Aucune série disponible.",
    searchPlaceholder: "Rechercher des séries",
  },

  seriesDetails: {
    play: "Lecture",
    favorite: "Favori",
    favorited: "Dans les favoris",
    addWatchLater: "À regarder plus tard",
    inWatchLater: "Dans « à regarder plus tard »",
    plot: "Synopsis",
    cast: "Distribution",
    director: "Réalisateur",
    noEpisodesAvailable: "Aucun épisode disponible.",
    seasonsSuffix: "saisons",
    episodesTitle: "Épisodes",
    episodesSuffix: "épisodes",
  },

  episodePlayer: {
    nextEpisodeIn: "Prochain épisode dans {n}s",
    dismiss: "Ignorer",
    playNow: "Lire maintenant",
    episodeNotFound: "Épisode introuvable.",
  },

  moviePlayer: {
    movieNotFound: "Film introuvable.",
  },

  trackSelector: {
    audio: "Audio",
    subtitles: "Sous-titres",
    off: "Désactivés",
    close: "Fermer",
    tracksButton: "Pistes",
    unknown: "Inconnu",
    noAudioTracks: "Aucune autre piste audio.",
    noSubtitleTracks: "Aucun sous-titre disponible.",
  },

  search: {
    title: "Rechercher",
    placeholder: "Rechercher TV en direct, films, séries",
    preparingSearch: "Préparation de la recherche…",
    typeToSearch: "Tapez pour rechercher parmi la TV en direct, les films et les séries.",
    noResultsFor: 'Aucun résultat pour « {query} ».',
    resultsCountSuffix: "résultats",
    live: "DIRECT",
    movie: "FILM",
    series: "SÉRIE",
  },

  library: {
    favoritesTitle: "Favoris",
    watchLaterTitle: "À regarder plus tard",
    nothingHereYet: "Rien ici pour l'instant.",
  },

  downloads: {
    title: "Téléchargements",
    empty: "Aucun téléchargement pour l'instant.",
    queued: "En attente",
    downloading: "Téléchargement",
    paused: "En pause",
    completed: "Terminé",
    failed: "Échoué",
    canceled: "Annulé",
    pause: "Mettre en pause",
    resume: "Reprendre",
    cancel: "Annuler",
    delete: "Supprimer",
    deleteConfirmTitle: "Supprimer le téléchargement",
    deleteConfirmBody: 'Supprimer le fichier téléchargé pour « {title} » ? Cette action est irréversible.',
    download: "Télécharger",
    notEligible: "Cet élément ne peut pas être téléchargé.",
    alreadyDownloaded: "Déjà téléchargé",
  },

  parental: {
    title: "Contrôle parental",
    enterPin: "Saisir le code",
    setPin: "Définir un code à 4 chiffres",
    changePin: "Modifier le code",
    removePin: "Supprimer le code",
    removePinConfirmBody: "Supprimer le code désactive aussi le verrouillage des catégories : chaque catégorie masquée pourra être réaffichée sans code.",
    wrongPin: "Code incorrect",
    lockCategories: "Exiger le code pour la visibilité des catégories",
    lockCategoriesNote: "Les catégories masquées ne peuvent être réaffichées qu'avec le code.",
    forgotPinNote: "Code oublié ? Il ne peut être effacé qu'en supprimant tous les fournisseurs depuis « Gérer les fournisseurs » — ce qui efface aussi leurs mots de passe enregistrés et tout ce que vous avez masqué. Rajoutez ensuite votre fournisseur et choisissez un nouveau code.",
    noPinYet: "Définissez d'abord un code",
  },

  update: {
    requiredTitle: "Mise à jour requise",
    requiredBody:
      "Une nouvelle version est disponible et celle-ci ne peut plus fonctionner. Mettez l'application à jour pour continuer.",
    updateNow: "Mettre à jour",
    availableTitle: "Une mise à jour est disponible",
    availableBody: "Une version plus récente de Mooj TV est disponible, avec des améliorations et des corrections.",
    later: "Plus tard",
  },
  settings: {
    title: "Paramètres",
    appearance: "Apparence",
    yourActivity: "Votre activité",
    language: "Langue",
    theme: "Thème",
    themeDark: "Sombre",
    themeLight: "Clair",
    themeSystem: "Suivre le système",
    content: "Contenu",
    manageCategoryVisibility: "Gérer la visibilité des catégories",
    accountProvider: "Compte / Fournisseur",
    provider: "Fournisseur",
    server: "Serveur",
    username: "Nom d'utilisateur",
    accountStatus: "Statut du compte",
    expiresOn: "Expire le",
    neverExpires: "Sans expiration",
    connections: "Connexions",
    outputFormats: "Formats de sortie",
    serverTimezone: "Fuseau horaire du serveur",
    manageProviders: "Gérer les fournisseurs",
    disconnect: "Déconnecter",
    disconnectConfirmBody: "Se déconnecter de ce fournisseur ? Vos fournisseurs enregistrés et votre bibliothèque restent sur cet appareil.",
    playback: "Lecture",
    modernChannelView: "Affichage moderne des chaînes",
    modernChannelViewNote: "Gardez l'image à l'écran pendant que vous parcourez les chaînes, au lieu d'un lecteur plein écran.",
    resumePlayback: "Reprendre la lecture",
    autoplayNextEpisode: "Lecture automatique de l'épisode suivant",
    storage: "Stockage",
    downloadedContent: "Contenu téléchargé",
    manageDownloads: "Gérer les téléchargements",
    data: "Données",
    clearWatchHistory: "Effacer l'historique de visionnage",
    clearFavorites: "Effacer les favoris",
    clearWatchLater: "Effacer « à regarder plus tard »",
    clearConfirmBody: "Cette action est irréversible.",
    legal: "Mentions légales",
    termsConditions: "Conditions générales",
    privacyPolicy: "Politique de confidentialité",
    licences: "Licences open source",
    licencesIntro: "Cette application utilise les composants open source ci-dessous. Les textes complets des licences sont disponibles auprès de leurs projets.",
    diagnostics: "Diagnostics",
    playerDiagnostics: "Diagnostics du lecteur",
    about: "À propos",
    appVersion: "Version de l'application",
    package: "Package",
    restartRequiredTitle: "Redémarrage requis",
    restartRequiredBody:
      "La mise en page de droite à gauche ne change qu'au démarrage. Fermez l'application maintenant et rouvrez-la, ou continuez : elle s'appliquera au prochain lancement.",
    restartNow: "Fermer maintenant",
    backgroundPlayback: "Continuer la lecture en arrière-plan",
    backgroundPlaybackNote: "Désactivé par défaut : un flux en cours occupe votre connexion fournisseur.",
    parentalLock: "Contrôle parental",
    clearImageCache: "Vider les images en cache",
  },

  categoryVisibility: {
    title: "Catégories",
    searchPlaceholder: "Rechercher une catégorie",
    empty: "Aucune catégorie dans cette section.",
  },
};

export default fr;
