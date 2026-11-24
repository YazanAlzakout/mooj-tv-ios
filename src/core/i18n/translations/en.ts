/**
 * Canonical English source. Every other locale file is typed against
 * `TranslationShape` (see locales.ts consumers), so a missing key in any
 * other language is a compile error, not a silent English fallback.
 */
const en = {
  common: {
    back: "Back",
    cancel: "Cancel",
    remove: "Remove",
    save: "Save",
    search: "Search",
    loading: "Loading…",
    retry: "Retry",
    refreshFailed: "Couldn't refresh just now — try again.",
    noInternet: "No internet connection.",
    providerUnreachable: "The provider server isn't answering right now. Try again in a moment.",
    confirm: "Confirm",
    clear: "Clear",
    edit: "Edit",
    add: "Add",
    connect: "Connect",
    accept: "Accept",
    previous: "Prev",
    next: "Next",
    ok: "OK",
    later: "Later",
    yes: "Yes",
    no: "No",
    justNow: "Just now",
    minutesAgo: "{n}m ago",
    hoursAgo: "{n}h ago",
    daysAgo: "{n}d ago",
  },

  onboarding: {
    skip: "Skip",
    next: "Next",
    getStarted: "Get Started",
    slide1Title: "Live TV, Movies & Series",
    slide1Body: "Everything your IPTV provider offers, organized and searchable in one place.",
    slide2Title: "Built for fast channel switching",
    slide2Body: "Zap between channels instantly, with a player designed to keep up.",
    slide3Title: "Your provider, your data",
    slide3Body:
      "Mooj TV only plays content from the provider you connect — nothing is stored or shared beyond your device.",
  },

  legal: {
    title: "Terms & Conditions",
    acceptButton: "Accept & Continue",
    accepted: "Accepted",
    lastUpdatedLabel: "Last updated",
    lastUpdatedDate: "2026-11-08",
    eulaTitle: "End User License Agreement (EULA)",
    tosTitle: "Terms of Service",
    dmcaTitle: "Copyright / DMCA Notice",
    sections: {
      scopeAndAcceptance: {
        heading: "Acceptance and scope",
        body: [
          "These terms (including the EULA, Terms of Service, and the Copyright/DMCA Notice) govern your use of Mooj TV (the “App”). By downloading, installing, accessing, or using the App, you agree to be bound by these terms.",
          "If you do not agree, do not use the App.",
        ],
      },
      noContentProvided: {
        heading: "No content provided or hosted",
        body: [
          "The App is a media player tool only. The App does not include, provide, sell, license, distribute, or stream any media content, channels, or playlists out of the box.",
          "The developers do not host any media files, playlists, channels, or streams, and do not operate any IPTV service.",
        ],
      },
      userProvidedContent: {
        heading: "User-provided content only",
        body: [
          "To use the App, you must supply your own content sources, such as Xtream Codes credentials or direct stream URLs, from servers you control or are authorized to access.",
          "You represent and warrant that you have all necessary rights, licenses, and permissions to access and use any content you load into the App.",
        ],
      },
      userResponsibility: {
        heading: "User responsibility for legality and copyrights",
        body: [
          "You are solely and fully (100%) responsible for the legality of the content you access, stream, or display through the App, including compliance with copyright and related-rights laws in your jurisdiction.",
          "You agree not to use the App to access, distribute, or facilitate access to infringing, unauthorized, or unlawful content.",
        ],
      },
      noAffiliation: {
        heading: "No endorsement or affiliation",
        body: [
          "The developers do not sell, endorse, sponsor, or affiliate with any IPTV providers or third-party media services.",
          "Any references to third parties are for compatibility or descriptive purposes only and do not imply any partnership or approval.",
        ],
      },
      prohibitedUses: {
        heading: "Prohibited uses",
        body: [
          "You must not use the App to violate any law or regulation, including copyright laws.",
          "You must not upload, share, advertise, or promote infringing playlists or streams through the App.",
          "You must not attempt to bypass, disable, or interfere with security, access controls, DRM, geo-restrictions, or network restrictions applicable to any content or service.",
          "You must not reverse engineer, decompile, or attempt to extract source code from the App, except to the extent permitted by applicable law.",
        ],
      },
      thirdPartyServices: {
        heading: "Third-party services and links",
        body: [
          "The App may enable you to connect to third-party servers or services you choose to configure. Those third parties are not controlled by the developers and may have separate terms and privacy policies.",
          "The developers are not responsible for third-party content, availability, quality, legality, or any damages arising from your use of third-party services.",
        ],
      },
      termination: {
        heading: "Termination",
        body: [
          "Your right to use the App may be suspended or terminated if you violate these terms or if required by law.",
          "Upon termination, you must stop using the App. Sections intended to survive termination (including disclaimers, limitation of liability, indemnification, and governing law) will survive.",
        ],
      },
      disclaimers: {
        heading: "Disclaimers",
        body: [
          "THE APP IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.",
          "The developers do not warrant that the App will be uninterrupted, error-free, secure, or compatible with all devices or content sources.",
        ],
      },
      limitationOfLiability: {
        heading: "Limitation of liability",
        body: [
          "TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE DEVELOPERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE APP.",
          "To the extent liability cannot be excluded, the developers’ total liability will be limited to the amount you paid for the App (if any) during the twelve (12) months preceding the event giving rise to the claim.",
        ],
      },
      indemnification: {
        heading: "Indemnification",
        body: [
          "You agree to defend, indemnify, and hold harmless the developers from and against any claims, damages, liabilities, losses, and expenses (including reasonable attorneys’ fees) arising from or related to your content sources, your use of the App, or your violation of these terms or any law.",
        ],
      },
      dmcaNotice: {
        heading: "Copyright / DMCA disclaimer (no hosting)",
        body: [
          "The developers do not host, store, transmit, or distribute any media content. The App only plays content provided and controlled by the user or by third-party servers configured by the user.",
          "If you believe content accessed through the App infringes copyrights, you should direct your complaint to the actual hosting provider or server operator that stores or transmits the content, not to the App developers.",
        ],
      },
      dmcaHowToSubmit: {
        heading: "Submitting a copyright notice",
        body: [
          "If you still need to contact the App developers regarding a copyright concern, send a notice to the email below and include: (a) identification of the copyrighted work; (b) identification of the allegedly infringing material (with sufficient information to locate it, including the server/URL); (c) your contact information; (d) a statement of good-faith belief; and (e) a statement made under penalty of perjury that your notice is accurate and that you are the rights holder or authorized to act on their behalf.",
        ],
      },
      governingLaw: {
        heading: "Governing law and venue",
        body: [
          "These terms are governed by the laws of the Arab Republic of Egypt, without regard to conflict-of-laws principles.",
          "You agree that any dispute arising from or relating to the App or these terms will be brought before the competent courts of the Arab Republic of Egypt, and you consent to their jurisdiction.",
        ],
      },
      contact: {
        heading: "Contact",
        body: ["For legal inquiries (including copyright notices), contact:", "Email: support@mooj-player.com"],
      },
    },
  },

  privacy: {
    title: "Privacy Policy",
    lastUpdatedLabel: "Last updated",
    lastUpdatedDate: "2026-11-08",
    intro: "This policy describes how Mooj TV (the “App”) handles your information. It applies to the Mooj TV Android application published under the package name com.moojtv.player.",
    sections: {
      summary: {
        heading: "The short version",
        body: [
          "Mooj TV does not collect, transmit, or store any personal data about you. There are no accounts, no sign-up, no analytics, no advertising, and no tracking of any kind.",
          "Everything the App keeps — your provider details, your favourites, your history, your downloads — stays on your device and is never sent to us.",
        ],
      },
      noCollection: {
        heading: "What we collect",
        body: [
          "Nothing. The developers of Mooj TV operate no servers that receive data from the App, and have no way to identify you or your device.",
          "The App contains no analytics SDK, no advertising SDK, no crash-reporting service, and no third-party advertising or tracking identifiers.",
        ],
      },
      credentials: {
        heading: "Your provider details",
        body: [
          "To watch anything, you enter the details of a service you already subscribe to — a server address, a username and a password, or a direct stream link.",
          "Those details are stored only on your device, in the Android Keystore-backed secure storage the operating system provides for secrets. They are never written to the App’s ordinary database, never written to a log, and never transmitted to the developers or to any third party.",
          "They are sent to one destination only: the provider you entered them for, in order to sign in and play what you asked for. That provider is your own supplier and its handling of your data is governed by its own terms, not by this policy.",
        ],
      },
      onDevice: {
        heading: "What stays on your device",
        body: [
          "The App keeps the following locally so that it can work: the list of providers you have added, which categories you have hidden, your favourites and watch-later list, your watch history and playback positions, your downloaded files, your parental PIN if you set one, and your settings such as language and theme.",
          "All of it lives in the App’s private storage on your device. None of it is backed up to us, synchronised, or shared.",
        ],
      },
      network: {
        heading: "Network connections",
        body: [
          "The App makes network requests to exactly one kind of destination: the provider whose details you entered. It fetches your channel, film and series lists from that provider, the artwork those lists point to, and the streams you choose to play.",
          "The App does not contact any server operated by the developers, because none exists.",
          "Checking for a newer version of the App is handled by Google Play on your device, not by the App itself.",
        ],
      },
      permissions: {
        heading: "Permissions, and why each one is asked for",
        body: [
          "Internet and network state: to reach your provider and to tell you when the device is offline.",
          "Foreground service and media playback: to keep playback running while the screen is off or another app is in front, if you turn that on in Settings.",
          "Wake lock: to stop the device sleeping in the middle of what you are watching.",
          "Modify audio settings: to manage volume and audio focus during playback.",
          "Vibrate: for the short tap feedback in the interface.",
          "Storage, on Android 12 and older only: to save downloads you ask for.",
          "The App does not request access to your camera, your microphone, your location, your contacts, your calendar, your photos, or your call or message history, and cannot read them.",
        ],
      },
      children: {
        heading: "Children",
        body: [
          "Mooj TV is not directed at children and is not designed for them. It collects no data from anyone, including children.",
          "A parental PIN is available in Settings so that the person who owns the device can restrict which categories are visible.",
        ],
      },
      retention: {
        heading: "Keeping and deleting your information",
        body: [
          "Because nothing reaches us, there is nothing for us to keep or to delete on your behalf.",
          "Everything the App has stored is under your control on the device. You can remove a provider and its saved credentials from the providers screen, clear your watch history and cached artwork from Settings, delete downloads from the downloads screen, and remove all of it at once by uninstalling the App or clearing its data in the Android settings.",
          "Uninstalling the App deletes its entire local store, including the saved provider credentials.",
        ],
      },
      security: {
        heading: "Security",
        body: [
          "Provider passwords are held in the operating system’s secure storage, which is backed by the Android Keystore and encrypted by the device.",
          "The server address of a provider is masked wherever it is displayed in the App, so the full address cannot be read off an unlocked screen.",
          "Many IPTV providers are reachable only over plain HTTP, which the App therefore allows. Traffic to such a provider is not encrypted in transit, and that is a property of the provider you chose rather than of the App. If your provider offers an HTTPS address, prefer it.",
        ],
      },
      changes: {
        heading: "Changes to this policy",
        body: [
          "If this policy changes, the revised version will be published at the address below and the date at the top of this page will be updated.",
        ],
      },
      contact: {
        heading: "Contact",
        body: [
          "For questions about this policy or about privacy in Mooj TV, contact:",
          "Email: support@mooj-player.com",
          "Web: https://mooj-player.com/privacy.html",
        ],
      },
    },

    /*
     * The same policy, on iOS.
     *
     * Everything above describes the Android app and was reviewed by Google
     * in that form, so none of it moves: the keys in `sections` are the
     * Android text, byte for byte. This object holds only the paragraphs
     * that are not true on iOS, and src/app/privacy.tsx substitutes them
     * section by section when `Platform.OS === "ios"`.
     *
     * What was wrong, and is the whole reason this exists:
     *   - the intro called this "the Mooj TV Android application published
     *     under the package name" — a reviewer reading that on an iPhone is
     *     guideline 2.3.10, irrelevant platform references, which is a
     *     routine metadata rejection;
     *   - the credentials and security sections named the Android Keystore,
     *     where iOS keeps the same secrets in the keychain;
     *   - the update sentence named Google Play;
     *   - the permission list is Android's, and iOS has no counterpart: this
     *     build declares no usage description for anything, which is what
     *     iOS requires before an app may even ask;
     *   - and the downloads sentences contradicted the App Review notes
     *     outright. Downloads are off on iOS (see
     *     src/domain/downloads/eligibility.ts), so there is no downloads
     *     screen to delete anything from and no media file is saved at all.
     *     A policy promising a reviewer a feature the build does not have is
     *     worse than one that is merely vague.
     *
     * Sections absent from here — noCollection, children, changes, contact —
     * read the same on both platforms and are rendered from `sections` on
     * both. Copying them in would be two texts to keep in step, in six
     * languages, for no difference in what anybody reads.
     *
     * `lastUpdatedDate` is here because it is genuinely a different date:
     * the Android words have not changed since 2026-11-08 and these were
     * written on 2026-11-18.
     *
     * One thing this file cannot fix. The copy published at
     * mooj-player.com/privacy.html is still the Android wording only, and
     * App Store Connect requires a privacy policy URL — so whoever submits
     * the iOS build has to publish this variant there as well. Two policies
     * that disagree is worse than one of them not existing, which is the
     * same argument that put the text in the app in the first place.
     */
    ios: {
      lastUpdatedDate: "2026-11-18",
      intro: "This policy describes how Mooj TV (the “App”) handles your information. It applies to the Mooj TV application for iPhone and iPad, published under the bundle identifier com.moojtv.player.",
      sections: {
        summary: {
          heading: "The short version",
          body: [
            "Mooj TV does not collect, transmit, or store any personal data about you. There are no accounts, no sign-up, no analytics, no advertising, and no tracking of any kind.",
            "Everything the App keeps — your provider details, your favourites, your history — stays on your device and is never sent to us.",
          ],
        },
        credentials: {
          heading: "Your provider details",
          body: [
            "To watch anything, you enter the details of a service you already subscribe to — a server address, a username and a password, or a direct stream link.",
            "Those details are stored only on your device, in the iOS keychain, the secure storage the operating system provides for secrets. They are never written to the App’s ordinary database, never written to a log, and never transmitted to the developers or to any third party.",
            "They are sent to one destination only: the provider you entered them for, in order to sign in and play what you asked for. That provider is your own supplier and its handling of your data is governed by its own terms, not by this policy.",
          ],
        },
        onDevice: {
          heading: "What stays on your device",
          body: [
            "The App keeps the following locally so that it can work: the list of providers you have added, which categories you have hidden, your favourites and watch-later list, your watch history and playback positions, your parental PIN if you set one, and your settings such as language and theme.",
            "Downloading for offline viewing is not available in the iOS version of the App, so no media file is saved to your device.",
            "All of it lives in the App’s private storage on your device. None of it is backed up to us, synchronised, or shared.",
          ],
        },
        network: {
          heading: "Network connections",
          body: [
            "The App makes network requests to exactly one kind of destination: the provider whose details you entered. It fetches your channel, film and series lists from that provider, the artwork those lists point to, and the streams you choose to play.",
            "The App does not contact any server operated by the developers, because none exists.",
            "Checking for a newer version of the App is handled by the App Store on your device, not by the App itself.",
          ],
        },
        permissions: {
          heading: "Permissions, and why the App asks for none",
          body: [
            "On iOS the App asks you for no permissions. It needs network access to reach your provider, and iOS grants that without a prompt.",
            "The App does not request access to your camera, your microphone, your location, your contacts, your calendar, your photos, or your call or message history, and cannot read them. It declares no usage description for any of them, which is what iOS requires before an app may even ask.",
            "It does not use Face ID or Touch ID, and it never shows the App Tracking Transparency prompt, because it does not track you and has nothing to ask permission for.",
          ],
        },
        retention: {
          heading: "Keeping and deleting your information",
          body: [
            "Because nothing reaches us, there is nothing for us to keep or to delete on your behalf.",
            "Everything the App has stored is under your control on the device. You can remove a provider and its saved credentials from the providers screen, clear your watch history and cached artwork from Settings, and remove all of it at once by deleting the App from your device.",
            "Deleting the App removes its entire local store, including the saved provider credentials.",
          ],
        },
        security: {
          heading: "Security",
          body: [
            "Provider passwords are held in the operating system’s secure storage — the iOS keychain — which is encrypted by the device and readable only after the device has been unlocked once since it was started.",
            "The server address of a provider is masked wherever it is displayed in the App, so the full address cannot be read off an unlocked screen.",
            "Many IPTV providers are reachable only over plain HTTP, which the App therefore allows. Traffic to such a provider is not encrypted in transit, and that is a property of the provider you chose rather than of the App. If your provider offers an HTTPS address, prefer it.",
          ],
        },
      },
    },
  },

  providers: {
    title: "Providers",
    tagline: "All your channels, movies and series in one place.",
    addProvider: "+ Add Provider",
    noProvidersYet: "No providers yet.",
    active: "Active",
    neverConnected: "Never connected",
    removeTitle: 'Remove provider',
    removeBody: 'Remove "{name}"? This cannot be undone.',
    connectError: "Could not connect to this provider.",
    edit: "Edit",
    connect: "Connect",
  },

  addProvider: {
    title: "Add Provider",
    unreachable: "Couldn't reach this server. Check the address and your connection.",
    subtitle: "Enter your Xtream Codes login details.",
    editTitle: "Edit Provider",
    typeXtream: "Xtream Codes",
    typeRemoteM3U: "Remote M3U",
    typeLocalM3U: "Local M3U file",
    nameLabel: "Name (optional)",
    namePlaceholder: "My Provider",
    defaultName: "My account",
    serverUrlLabel: "Server URL",
    serverUrlPlaceholder: "http://example.com:8080",
    usernameLabel: "Username",
    passwordLabel: "Password",
    show: "Show",
    hide: "Hide",
    connectButton: "Connect",
    saveButton: "Save",
    m3uUrlLabel: "Playlist URL",
    m3uUrlPlaceholder: "http://example.com/playlist.m3u8",
    chooseFileButton: "Choose file",
    noFileChosen: "No file chosen",
    catalogEmpty: "Connected, but this provider returned nothing at all — no channels, no films, no series.",
  },

  /*
   * The bottom tab bar's own two labels.
   *
   * Live, Movies and Series are not repeated here: the bar reads them from
   * `home`, so renaming a section renames it everywhere at once.
   */
  tabs: {
    home: "Home",
    more: "More",
  },

  home: {
    welcomeBack: "Welcome back",
    search: "Search",
    browse: "Browse",
    liveTV: "Live TV",
    movies: "Movies",
    series: "Series",
    liveTVSub: "Channels playing now",
    moviesSub: "The whole film catalogue",
    seriesSub: "Shows and episodes",
    quickActions: "Quick Actions",
    favorites: "Favorites",
    watchLater: "Watch Later",
    settings: "Settings",
    downloads: "Downloads",
    topRated: "Top rated",
    newIn: "New in",
    featured: "Featured",
    continueWatching: "Continue Watching",
    seeAll: "See All",
    noWatchHistory: "No watch history yet",
    clear: "Clear",
    clearHistoryTitle: "Clear watch history",
    clearHistoryBody: "Remove all Continue Watching entries? This cannot be undone.",
  },

  history: {
    title: "Watch History",
    empty: "No watch history yet.",
  },


  liveCategories: {
    title: "Live TV",
    allCategory: "All",
    chooseCategory: "Choose category",
  },

  liveChannelList: {
    channelsCountSuffix: "channels",
    searchPlaceholder: "Search channels",
    liveBadge: "LIVE",
    noChannelsAvailable: "No channels available.",
  },

  liveGuide: {
    guideButtonLabel: "Channels",
    title: "Channels",
    thisCategoryTab: "This Category",
    allChannelsTab: "All Channels",
    noResults: "No channels found.",
    close: "Close",
  },

  livePlayer: {
    previousChannel: "Previous",
    nextChannel: "Next",
    play: "Play",
    pause: "Pause",
    subtitles: "Subtitles",
    audio: "Audio",
    mute: "Mute",
    unmute: "Unmute",
    aspectFit: "Fit",
    aspectFill: "Fill",
    aspectStretch: "Stretch",
    streamPaused: "This broadcast is paused for now. It should be back shortly.",
    playbackBusy: "The stream is busy for a moment. Wait a second or try another channel.",
    playbackOffAir: "This channel is off the air right now. Try another one.",
    playbackSlow: "The connection is slow or has dropped. Check your network and try again.",
    playbackUnsupported: "This channel uses a format your device cannot play.",
    playbackUnknown: "This channel will not start right now. Try another one, or again in a moment.",
    vodBusy: "Playback is busy for a moment. Wait a little and try again.",
    vodMissing: "This title is not available from the provider right now.",
    vodSlow: "The connection is slow or has dropped. Check your network and try again.",
    vodUnsupported: "This file uses a format your device cannot play.",
    vodUnknown: "This title will not play right now. Try again in a moment.",
    sleepTimer: "Sleep timer",
    sleepOff: "Off",
    channelNumber: "Go to channel",
  },

  moviesCategories: {
    title: "Movies",
  },

  moviesGrid: {
    title: "Movies",
    moviesCountSuffix: "movies",
    noMoviesAvailable: "No movies available.",
    searchPlaceholder: "Search movies",
  },

  movieDetails: {
    play: "Play",
    favorite: "Favorite",
    favorited: "Favorited",
    addWatchLater: "Watch Later",
    inWatchLater: "In Watch Later",
    plot: "Plot",
    cast: "Cast",
    director: "Director",
    download: "Download",
    downloaded: "Downloaded",
  },

  seriesCategories: {
    title: "Series",
  },

  seriesGrid: {
    title: "Series",
    seriesCountSuffix: "series",
    noSeriesAvailable: "No series available.",
    searchPlaceholder: "Search series",
  },

  seriesDetails: {
    play: "Play",
    favorite: "Favorite",
    favorited: "Favorited",
    addWatchLater: "Watch Later",
    inWatchLater: "In Watch Later",
    plot: "Plot",
    cast: "Cast",
    director: "Director",
    noEpisodesAvailable: "No episodes available.",
    seasonsSuffix: "seasons",
    episodesTitle: "Episodes",
    episodesSuffix: "episodes",
  },

  episodePlayer: {
    nextEpisodeIn: "Next episode in {n}s",
    dismiss: "Dismiss",
    playNow: "Play Now",
    episodeNotFound: "Episode not found.",
  },

  moviePlayer: {
    movieNotFound: "Movie not found.",
  },

  trackSelector: {
    audio: "Audio",
    subtitles: "Subtitles",
    off: "Off",
    close: "Close",
    tracksButton: "Tracks",
    unknown: "Unknown",
    noAudioTracks: "No alternate audio tracks.",
    noSubtitleTracks: "No subtitle tracks available.",
  },

  search: {
    title: "Search",
    placeholder: "Search live TV, movies, series",
    preparingSearch: "Preparing search…",
    typeToSearch: "Type to search across Live TV, Movies, and Series.",
    noResultsFor: 'No results for "{query}".',
    resultsCountSuffix: "results",
    live: "LIVE",
    movie: "MOVIE",
    series: "SERIES",
  },

  library: {
    favoritesTitle: "Favorites",
    watchLaterTitle: "Watch Later",
    nothingHereYet: "Nothing here yet.",
  },

  downloads: {
    title: "Downloads",
    empty: "No downloads yet.",
    queued: "Queued",
    downloading: "Downloading",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    canceled: "Canceled",
    pause: "Pause",
    resume: "Resume",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirmTitle: "Delete download",
    deleteConfirmBody: 'Delete the downloaded file for "{title}"? This cannot be undone.',
    download: "Download",
    notEligible: "This item can't be downloaded.",
    alreadyDownloaded: "Already downloaded",
  },

  parental: {
    title: "Parental lock",
    enterPin: "Enter PIN",
    setPin: "Set a 4-digit PIN",
    changePin: "Change PIN",
    removePin: "Remove PIN",
    removePinConfirmBody: "Removing the PIN also turns off the category lock, and every hidden category can be turned back on without it.",
    wrongPin: "Wrong PIN",
    lockCategories: "Require PIN for category visibility",
    lockCategoriesNote: "Hidden categories can only be turned back on with the PIN.",
    forgotPinNote: "Forgotten the PIN? It can only be cleared by removing every provider under Manage providers — which also deletes their saved passwords and everything you have hidden. Add your provider again afterwards and set a new PIN.",
    noPinYet: "Set a PIN first",
  },

  update: {
    requiredTitle: "Update required",
    requiredBody:
      "A newer version has been released and this one can no longer run. Update the app to continue.",
    updateNow: "Update now",
    availableTitle: "A new update is available",
    availableBody: "A newer version of Mooj TV is out, with improvements and fixes. Update now to get it.",
    later: "Later",
  },
  settings: {
    title: "Settings",
    appearance: "Appearance",
    yourActivity: "Your Activity",
    language: "Language",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "Follow system",
    content: "Content",
    manageCategoryVisibility: "Manage category visibility",
    accountProvider: "Account / Provider",
    provider: "Provider",
    server: "Server",
    username: "Username",
    accountStatus: "Account status",
    expiresOn: "Expires",
    neverExpires: "No expiry",
    connections: "Connections",
    outputFormats: "Output formats",
    serverTimezone: "Server timezone",
    manageProviders: "Manage providers",
    disconnect: "Disconnect",
    disconnectConfirmBody: "Sign out of this provider? Your saved providers and library stay on this device.",
    playback: "Playback",
    modernChannelView: "Modern channel view",
    modernChannelViewNote: "Keep the picture on screen while you browse channels, instead of a fullscreen player.",
    resumePlayback: "Resume playback",
    autoplayNextEpisode: "Autoplay next episode",
    storage: "Storage",
    downloadedContent: "Downloaded content",
    manageDownloads: "Manage downloads",
    data: "Data",
    clearWatchHistory: "Clear watch history",
    clearFavorites: "Clear favorites",
    clearWatchLater: "Clear watch later",
    clearConfirmBody: "This cannot be undone.",
    legal: "Legal",
    termsConditions: "Terms & Conditions",
    privacyPolicy: "Privacy Policy",
    licences: "Open source licences",
    licencesIntro: "This app uses the open source components below. Full licence texts are available from their projects.",
    diagnostics: "Diagnostics",
    playerDiagnostics: "Player diagnostics",
    about: "About",
    appVersion: "App version",
    package: "Package",
    restartRequiredTitle: "Restart required",
    restartRequiredBody:
      "Right-to-left layout only changes when the app starts. Close it now and open it again, or keep using it and it will apply next time.",
    restartNow: "Close Now",
    backgroundPlayback: "Keep playing in the background",
    backgroundPlaybackNote: "Off by default: a stream left running holds your provider connection.",
    parentalLock: "Parental lock",
    clearImageCache: "Clear cached artwork",
  },

  categoryVisibility: {
    title: "Categories",
    searchPlaceholder: "Search categories",
    empty: "No categories in this section.",
  },
};

export default en;
export type TranslationShape = typeof en;
