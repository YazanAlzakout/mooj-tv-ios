import type { TranslationShape } from "./en";

/**
 * Kurmanji Kurdish (Latin script). Machine/best-effort translation —
 * flagged for native-speaker review before release, see docs/DECISIONS.md.
 */
const ku: TranslationShape = {
  common: {
    back: "Vegere",
    cancel: "Betal bike",
    remove: "Rake",
    save: "Tomar bike",
    search: "Lêgerîn",
    loading: "Bar dibe…",
    retry: "Dîsa biceribîne",
    refreshFailed: "Nuha nûvekirin bi ser neket — dîsa biceribîne.",
    noInternet: "Girêdana internetê tune ye.",
    providerUnreachable: "Servera pêşkêşkar niha bersiv nade. Piştî kêliyekê dîsa biceribîne.",
    confirm: "Piştrast bike",
    clear: "Paqij bike",
    edit: "Biguherîne",
    add: "Zêde bike",
    connect: "Girê bide",
    accept: "Qebûl bike",
    previous: "Bere",
    next: "Pêş",
    ok: "Baş e",
    later: "Paşê",
    yes: "Erê",
    no: "Na",
    justNow: "Niha",
    minutesAgo: "{n} deqe berê",
    hoursAgo: "{n} saet berê",
    daysAgo: "{n} roj berê",
  },

  onboarding: {
    skip: "Derbas bike",
    next: "Pêş",
    getStarted: "Dest pê bike",
    slide1Title: "TV ya Zindî, Fîlim û Rêzefîlim",
    slide1Body: "Her tişta ku dabînkerê te yê IPTV pêşkêş dike, li cihekî hatî rêkxistin û lêgerîn.",
    slide2Title: "Ji bo guherandina kanalan a bilez hatiye çêkirin",
    slide2Body: "Di navbera kanalan de yekser derbas bibe, bi lîstikvanek ku ji bo vê yekê hatiye çêkirin.",
    slide3Title: "Dabînkerê te, daneyên te",
    slide3Body:
      "Mooj TV tenê naveroka dabînkerê ku tu pê ve girêdayî yî lêdide — tiştek ji derveyî amûra te nayê tomarkirin an parvekirin.",
  },

  legal: {
    title: "Mercên Bikaranînê",
    acceptButton: "Qebûl bike û Berdewam bike",
    accepted: "Hate qebûlkirin",
    lastUpdatedLabel: "Rojanekirina dawî",
    lastUpdatedDate: "2026-11-08",
    eulaTitle: "Peymana Lîsansê ya Bikarhênerê Dawî (EULA)",
    tosTitle: "Şertên Xizmetê",
    dmcaTitle: "Agahdariya Mafê Nivîskar / DMCA",
    sections: {
      scopeAndAcceptance: {
        heading: "Qebûlkirin û qada şertan",
        body: [
          "Ev şert (bi nav de EULA, Şertên Xizmetê û Agahdariya Mafê Nivîskar/DMCA) bikaranîna te ya Mooj TV (\"Sepan\") rêk dide. Bi daxistin, sazkirin, gihîştin an bikaranînê, tu van şertan qebûl dikî.",
          "Heke tu qebûl nakî, Sepanê bikar neynî.",
        ],
      },
      noContentProvided: {
        heading: "Naverok nayê peydakirin an barandin",
        body: [
          "Sepan tenê amûrek lîstina medyayê ye. Sepan bi awayek standard tu naverokê, kanal an playlistê nakeve nav, napeşkêş dike, nafiroşe, lîsans nade, nadabeş dike an jî naşîne.",
          "Pêşdebir naverokê/barandinê (media, playlist, kanal an stream) nakin û tu karûbarê IPTV naşopînin.",
        ],
      },
      userProvidedContent: {
        heading: "Tenê naveroka ku bikarhêner têxe",
        body: [
          "Ji bo bikaranîna Sepanê, divê tu çavkaniyên xwe yên naverokê pêşkêş bikî, mîna agahiyên Xtream Codes an URL-ên streamê yên rasterast, ji serverên ku tu kontrol dikî an mafê gihîştinê ya wan heye.",
          "Tu îkrar û garantî dikî ku ji bo gihîştin û bikaranîna her naverokê ku tu têxî Sepanê, hemî maf, lîsans û destûrên pêwîst hene.",
        ],
      },
      userResponsibility: {
        heading: "Berpirsyariya bikarhêner (qanûnî û mafên nivîskar)",
        body: [
          "Tu bi tenê û bi temamî (%100) berpirsyar î ji bo qanûnîbûna naveroka ku tu bi Sepanê digihîjî, dişînî an nîşan didî, di nav de peywira rêzgirtina qanûnên mafê nivîskar li herêmê te.",
          "Tu qebûl dikî ku Sepanê ji bo gihîştina naveroka neqanûnî, bêdestûr an têkçûyî ya mafên nivîskar bikar neynî û gihîştinê jî hêsan neke.",
        ],
      },
      noAffiliation: {
        heading: "Têkiliyê/anîna piştgirî tune ye",
        body: [
          "Pêşdebir ne difroşin, ne piştgirî dikin, ne sponsor dikin û ne jî bi tu pêşkêşkerên IPTV an karûbarên medyayî yên derve re têkiliyê heye.",
          "Her têkilî/şîrove li ser aliyên sêyem ji bo hevgirtin an danasînê ye û wateya hevkarî an pejirandinê nake.",
        ],
      },
      prohibitedUses: {
        heading: "Bikaranînên qedexe",
        body: [
          "Tu divê Sepanê ji bo têkçûna tu qanûn an rêzikê (di nav de mafê nivîskar) bikar neynî.",
          "Tu divê playlist/streamên ku maf têk dikin bi Sepanê bar nekî, parve nekî, reklam nekî an bilind nekî.",
          "Tu divê hewl nedî ku ewlehî, kontrolên gihîştinê, DRM, sînorkirinên cîhî an sînorkirinên torê derbas bikî an têk bibî.",
          "Tu divê reverse engineering, decompile an hewlên derxistina source codeê ji Sepanê nekî, ji bilî ku qanûn destûr bide.",
        ],
      },
      thirdPartyServices: {
        heading: "Karûbarên aliyên sêyem û lînkan",
        body: [
          "Sepan dikare destûr bide ku tu bi server/karûbarên aliyên sêyem re girê bidî ku tu xwe saz dikî. Ew aliyên sêyem di kontrola pêşdebiran de nîne û şert û siyaseta taybetiyê ya xwe hene.",
          "Pêşdebir berpirsyar nabin ji bo naveroka aliyên sêyem, amadebûna wan, kalîte, qanûnîbûn an zirarên ku ji bikaranîna te ya wan tê.",
        ],
      },
      termination: {
        heading: "Dawîkirin",
        body: [
          "Mafê te yê bikaranîna Sepanê dikare were rawestandin an dawîkirin heke tu van şertan têk bibî an heke qanûn pêwîst bike.",
          "Piştî dawîkirinê, divê tu Sepanê bikar neynî. Beşên ku divê piştî dawîkirinê jî bimînin (wate feragî, sînorkirina berpirsyariyê, tazmîn û qanûna serdest) dê bimînin.",
        ],
      },
      disclaimers: {
        heading: "Feragî (disclaimer)",
        body: [
          "SEPAN \"WEKÎ YE\" Û \"WEKÎ HEYE\" TÊ PÊŞKÊŞKIRIN, BÊ GARANTÎYA HER CUREYÊ (AŞKIR, NEXWEŞAN, AN QANÛNÎ), DI NAV DE GARANTÎYA FROŞBARÎBÛNÊ, GUNCAVBÛNA ARMANCEKÊ, Û NE-TÊKÇÛNA MAFAN.",
          "Pêşdebir garantî nakin ku Sepan bêqutî, bêxelet, ewle an bi hemû cîhaz û çavkaniyên naverokê re guncav be.",
        ],
      },
      limitationOfLiability: {
        heading: "Sînorkirina berpirsyariyê",
        body: [
          "Di çarçoveya ku qanûn destûr dide, pêşdebir ji zirarên ne-rasterast, tesadufî, taybet, peywendîdar, nimûneyî an cezayî, an ji windabûna qazanc, dahat, daneyên an navdariyê, ku ji bikaranîna Sepanê tê an bi wê re têkildar e, berpirsyar nabin.",
          "Heke berpirsyarî nayê nehiştin, berpirsyariya giştî ya pêşdebir dê bi wateya pereya ku te ji bo Sepanê daye (heger hebe) di 12 mehan berê de, sînorkirin bibe.",
        ],
      },
      indemnification: {
        heading: "Tazmîn (indemnification)",
        body: [
          "Tu qebûl dikî ku pêşdebiran biparêzî, tazmîn bikî û ji her daxwaz, zirar, berpirsyarî, windahî û lêçûn (di nav de mûçeya parêzeran a maqûl) ku ji çavkaniyên naveroka te, bikaranîna te ya Sepanê an têkçûna şertan/qanûn tê, azad bikî.",
        ],
      },
      dmcaNotice: {
        heading: "Têbînîya mafê nivîskar / DMCA (barandin tune ye)",
        body: [
          "Pêşdebir naverokê nayên barandin, nayên tomar kirin, nayên şandin an nayên belav kirin. Sepan tenê naveroka ku bikarhêner têxî an ku serverên aliyên sêyem (ku bikarhêner saz kiriye) pêşkêş dikin lîstin dike.",
          "Heke tu bawerî ku naveroka ku bi Sepanê tê gihîştin mafê nivîskar têk dike, divê tu şikayetê xwe bi rastî bi hosting provider an operatorê serverê ku naverokê tomar dike/dişîne re bikî, ne bi pêşdebirên Sepanê re.",
        ],
      },
      dmcaHowToSubmit: {
        heading: "Şandina agahdariya mafê nivîskar",
        body: [
          "Heke dîsa pêwîst be ku tu bi pêşdebiran re li ser mafê nivîskar têkilî daynî, ji kerema xwe agahdariyek bi emailê li jêr bişîne û tê de: (a) nasandina karê parastî; (b) nasandina materyala têgihiştina têkçûnê (bi agahiyên têra ku were dîtin, di nav de server/URL); (c) agahiyên têkiliyê; (d) daxuyaniya baweriyê ya bi dilpakî; (e) daxuyaniya bi tawanbarî ku agahdarî rast e û tu xwediyê mafê an agentê destûrdayî yî.",
        ],
      },
      governingLaw: {
        heading: "Qanûna serdest û dadgeh",
        body: [
          "Ev şert bi qanûnên Komara Erebî ya Misirê tê rêvebirin, bê ku prensîbên tevlihevîya qanûnan were binirxandin.",
          "Tu qebûl dikî ku her nakokî ku ji Sepanê an van şertan tê an bi wan re têkildar e, li dadgehên desthilatdar ên Komara Erebî ya Misirê were anîn, û tu qebûlîya desthilatdariya wan dide.",
        ],
      },
      contact: {
        heading: "Têkilî",
        body: ["Ji bo pirsên yasayî (di nav de agahdariyên mafê nivîskar), têkilî bike:", "Email: support@mooj-player.com"],
      },
    },
  },

  privacy: {
    title: "Siyaseta Taybetiyê",
    lastUpdatedLabel: "Rojanekirina dawî",
    lastUpdatedDate: "2026-11-08",
    intro: "Ev siyaset rave dike ka Mooj TV (\"Sepan\") çawa bi agahiyên te re tevdigere. Ew li sepana Android a Mooj TV ya ku di bin navê pakêtê com.moojtv.player de hatiye weşandin tê sepandin.",
    sections: {
      summary: {
        heading: "Bi kurtî",
        body: [
          "Mooj TV tu daneyên kesane yên derbarê te de kom nake, naşîne û tomar nake. Tu hesab tune, tu qeydkirin tune, tu analîtîk tune, tu reklam tune û tu şopandina tu cureyî tune.",
          "Her tişta ku Sepan hiltîne — agahiyên dabînkerê te, bijarteyên te, dîroka te, daxistinên te — li ser amûra te dimîne û tu carî ji me re nayê şandin.",
        ],
      },
      noCollection: {
        heading: "Em çi kom dikin",
        body: [
          "Tu tişt. Pêşdebirên Mooj TV tu serveran naxebitînin ku ji Sepanê daneyan bistînin, û tu rêyek wan tune ku te an amûra te nas bikin.",
          "Di Sepanê de tu SDK-ya analîtîkê, tu SDK-ya reklamê, tu karûbarê raporkirina têkçûnê û tu nasnameyên reklam an şopandinê yên aliyên sêyem tune ne.",
        ],
      },
      credentials: {
        heading: "Agahiyên dabînkerê te",
        body: [
          "Ji bo ku tu tiştek temaşe bikî, tu agahiyên karûbarekî ku berê abonetiya te ya wê heye dinivîsî — navnîşana serverekê, navê bikarhêner û şîfreyek, an lînkek streamê ya rasterast.",
          "Ew agahî tenê li ser amûra te tên tomar kirin, di hilanîna ewle ya ku pergala xebitandinê ji bo nepeniyan pêşkêş dike û bi Android Keystore tê piştgirî kirin. Ew tu carî di danegeha asayî ya Sepanê de nayên nivîsandin, tu carî di logekê de nayên nivîsandin, û tu carî ji pêşdebiran re an ji tu aliyê sêyem re nayên şandin.",
          "Ew tenê ji bo cihekî tên şandin: ji bo dabînkerê ku te ew jê re nivîsandine, ji bo ku tu têkevî hesabê û tişta ku te xwestiye were lêdan. Ew dabînker dabînkerê te yê xwe ye û tevgera wî bi daneyên te re bi şert û mercên wî bi xwe tê rêvebirin, ne bi vê siyasetê.",
        ],
      },
      onDevice: {
        heading: "Çi li ser amûra te dimîne",
        body: [
          "Sepan ji bo ku bikaribe bixebite van tiştan bi awayek herêmî hiltîne: lîsteya dabînkerên ku te zêde kirine, te kîjan kategorî veşartine, bijarteyên te û lîsteya Paşê Temaşe Bike, dîroka temaşekirinê û cihên lêdanê, pelên te yên daxistî, PIN'a te ya dêûbav heke te yek diyar kiribe, û mîhengên te wekî ziman û dirb.",
          "Hemî ew di hilanîna taybet a Sepanê de li ser amûra te dimîne. Tu tişt ji wan ji me re nayê kopîkirin, nayê hevdemkirin an nayê parvekirin.",
        ],
      },
      network: {
        heading: "Girêdanên torê",
        body: [
          "Sepan daxwazên torê tenê ji bo cureyekî cihî dişîne: ji bo dabînkerê ku te agahiyên wî nivîsandine. Ew lîsteyên kanal, fîlim û rêzefîlimên te ji wî dabînkerî, wêneyên ku navnîşanên wan di wan lîsteyan de hene, û streamên ku tu hildibijêrî ku lêbidî distîne.",
          "Sepan bi tu serverê ku ji aliyê pêşdebiran ve tê xebitandin re têkilî nagire, ji ber ku tu serverek wisa tune.",
          "Kontrolkirina guhertoyek nûtir a Sepanê ji aliyê Google Play ve li ser amûra te tê kirin, ne ji aliyê Sepanê bi xwe ve.",
        ],
      },
      permissions: {
        heading: "Destûr, û çima her yek jê tê xwestin",
        body: [
          "Înternet û rewşa torê: ji bo gihîştina dabînkerê te û ji bo ku ji te re bê gotin kengî amûr ji torê qut e.",
          "Karûbarê pêşperdeyê û lêdana medyayê: ji bo ku lêdan berdewam bike dema ekran girtî ye an sepanek din li pêş e, heke tu wê di Mîhengan de vekî.",
          "Wake lock: ji bo ku amûr di nîvê tişta ku tu temaşe dikî de ranekeve.",
          "Guherandina mîhengên deng: ji bo rêvebirina dengî û fokusa deng di dema lêdanê de.",
          "Vibrasyon: ji bo bersiva kurt a pêlêkirinê di navrûyê de.",
          "Depo, tenê li ser Android 12 û kevntir: ji bo tomarkirina daxistinên ku tu dixwazî.",
          "Sepan gihîştina kameraya te, mîkrofona te, cihê te, têkiliyên te, salnameya te, wêneyên te an dîroka te ya bangan û peyaman naxwaze, û nikare wan bixwîne.",
        ],
      },
      children: {
        heading: "Zarok",
        body: [
          "Mooj TV ne ji bo zarokan e û ji bo wan nehatiye çêkirin. Ew ji tu kesî, di nav de zarok jî, tu daneyan kom nake.",
          "Di Mîhengan de PIN'eke dêûbav heye, ji bo ku kesê xwediyê amûrê bikaribe sînor bike kîjan kategorî xuya dibin.",
        ],
      },
      retention: {
        heading: "Hilanîn û jêbirina agahiyên te",
        body: [
          "Ji ber ku tu tişt nagihîje me, tu tişt jî tune ku em ji bo te hilînin an jê bibin.",
          "Her tişta ku Sepan tomar kiriye di bin kontrola te de li ser amûrê ye. Tu dikarî dabînkerek û agahiyên wî yên têketinê yên tomarkirî ji ekrana dabînkeran rakî, dîroka temaşekirinê û wêneyên hilanîn ji Mîhengan paqij bikî, daxistinan ji ekrana daxistinan jê bibî, û hemî wan bi carekê jê bibî bi rakirina Sepanê an bi paqijkirina daneyên wê di mîhengên Android de.",
          "Rakirina Sepanê hemî hilanîna wê ya herêmî jê dibe, di nav de agahiyên dabînkerê yên tomarkirî.",
        ],
      },
      security: {
        heading: "Ewlehî",
        body: [
          "Şîfreyên dabînkeran di hilanîna ewle ya pergala xebitandinê de tên hilanîn, ya ku bi Android Keystore tê piştgirî kirin û ji aliyê amûrê ve tê şîfrekirin.",
          "Navnîşana serverê ya dabînkerekê li her cihê ku di Sepanê de tê nîşandan tê veşartin, ji ber vê yekê navnîşana tevahî ji ekranek vekirî nayê xwendin.",
          "Gelek dabînkerên IPTV tenê bi HTTP ya sade tên gihîştin, û Sepan loma destûrê wê dide. Trafîka ber bi dabînkerek wisa ve di veguhastinê de nayê şîfrekirin, û ev taybetmendiya dabînkerê ku te hilbijartiye ye, ne ya Sepanê. Heke dabînkerê te navnîşanek HTTPS pêşkêş bike, wê tercîh bike.",
        ],
      },
      changes: {
        heading: "Guherandinên vê siyasetê",
        body: [
          "Heke ev siyaset biguhere, guhertoya nûkirî dê li navnîşana jêrîn were weşandin û dîroka li serê vê rûpelê dê were rojanekirin.",
        ],
      },
      contact: {
        heading: "Têkilî",
        body: [
          "Ji bo pirsên li ser vê siyasetê an li ser taybetiyê di Mooj TV de, têkilî bike:",
          "Email: support@mooj-player.com",
          "Web: https://mooj-player.com/privacy.html",
        ],
      },
    },

    ios: {
      lastUpdatedDate: "2026-11-18",
      intro: "Ev siyaset rave dike ka Mooj TV (\"Sepan\") çawa bi agahiyên te re tevdigere. Ew li sepana Mooj TV ya ji bo iPhone û iPadê, ya ku di bin nasnavê pakêtê com.moojtv.player de hatiye weşandin, tê sepandin.",
      sections: {
        summary: {
          heading: "Bi kurtî",
          body: [
            "Mooj TV tu daneyên kesane yên derbarê te de kom nake, naşîne û tomar nake. Tu hesab tune, tu qeydkirin tune, tu analîtîk tune, tu reklam tune û tu şopandina tu cureyî tune.",
            "Her tişta ku Sepan hiltîne — agahiyên dabînkerê te, bijarteyên te, dîroka te — li ser amûra te dimîne û tu carî ji me re nayê şandin.",
          ],
        },
        credentials: {
          heading: "Agahiyên dabînkerê te",
          body: [
            "Ji bo ku tu tiştek temaşe bikî, tu agahiyên karûbarekî ku berê abonetiya te ya wê heye dinivîsî — navnîşana serverekê, navê bikarhêner û şîfreyek, an lînkek streamê ya rasterast.",
            "Ew agahî tenê li ser amûra te tên tomar kirin, di Keychain'a iOS de, hilanîna ewle ya ku pergala xebitandinê ji bo nepeniyan pêşkêş dike. Ew tu carî di danegeha asayî ya Sepanê de nayên nivîsandin, tu carî di logekê de nayên nivîsandin, û tu carî ji pêşdebiran re an ji tu aliyê sêyem re nayên şandin.",
            "Ew tenê ji bo cihekî tên şandin: ji bo dabînkerê ku te ew jê re nivîsandine, ji bo ku tu têkevî hesabê û tişta ku te xwestiye were lêdan. Ew dabînker dabînkerê te yê xwe ye û tevgera wî bi daneyên te re bi şert û mercên wî bi xwe tê rêvebirin, ne bi vê siyasetê.",
          ],
        },
        onDevice: {
          heading: "Çi li ser amûra te dimîne",
          body: [
            "Sepan ji bo ku bikaribe bixebite van tiştan bi awayek herêmî hiltîne: lîsteya dabînkerên ku te zêde kirine, te kîjan kategorî veşartine, bijarteyên te û lîsteya Paşê Temaşe Bike, dîroka temaşekirinê û cihên lêdanê, PIN'a te ya dêûbav heke te yek diyar kiribe, û mîhengên te wekî ziman û dirb.",
            "Daxistin ji bo temaşekirina bê înternet di guhertoya iOS a Sepanê de tune ye, loma tu pelê medyayê li ser amûra te nayê tomar kirin.",
            "Hemî ew di hilanîna taybet a Sepanê de li ser amûra te dimîne. Tu tişt ji wan ji me re nayê kopîkirin, nayê hevdemkirin an nayê parvekirin.",
          ],
        },
        network: {
          heading: "Girêdanên torê",
          body: [
            "Sepan daxwazên torê tenê ji bo cureyekî cihî dişîne: ji bo dabînkerê ku te agahiyên wî nivîsandine. Ew lîsteyên kanal, fîlim û rêzefîlimên te ji wî dabînkerî, wêneyên ku navnîşanên wan di wan lîsteyan de hene, û streamên ku tu hildibijêrî ku lêbidî distîne.",
            "Sepan bi tu serverê ku ji aliyê pêşdebiran ve tê xebitandin re têkilî nagire, ji ber ku tu serverek wisa tune.",
            "Kontrolkirina guhertoyek nûtir a Sepanê ji aliyê App Store ve li ser amûra te tê kirin, ne ji aliyê Sepanê bi xwe ve.",
          ],
        },
        permissions: {
          heading: "Destûr, û çima Sepan tu destûrê naxwaze",
          body: [
            "Li iOS Sepan ji te tu destûrê naxwaze. Ji bo gihîştina dabînkerê te pêdiviya wê bi gihîştina torê heye, û iOS wê bêyî tu pirsê dide.",
            "Sepan gihîştina kameraya te, mîkrofona te, cihê te, têkiliyên te, salnameya te, wêneyên te an dîroka te ya bangan û peyaman naxwaze, û nikare wan bixwîne. Ew ji bo tu yekê ji wan ravekirina bikaranînê nade, û iOS wê ravekirinê hewce dike berî ku sepanek karibe tenê bixwaze jî.",
            "Ew ne Face ID ne jî Touch ID bi kar tîne, û tu carî daxwaza App Tracking Transparency nîşan nade, ji ber ku te naşopîne û tiştek wê tune ku jê re destûr bixwaze.",
          ],
        },
        retention: {
          heading: "Hilanîn û jêbirina agahiyên te",
          body: [
            "Ji ber ku tu tişt nagihîje me, tu tişt jî tune ku em ji bo te hilînin an jê bibin.",
            "Her tişta ku Sepan tomar kiriye di bin kontrola te de li ser amûrê ye. Tu dikarî dabînkerek û agahiyên wî yên têketinê yên tomarkirî ji ekrana dabînkeran rakî, dîroka temaşekirinê û wêneyên hilanîn ji Mîhengan paqij bikî, û hemî wan bi carekê jê bibî bi jêbirina Sepanê ji amûra te.",
            "Jêbirina Sepanê hemî hilanîna wê ya herêmî jê dibe, di nav de agahiyên dabînkerê yên tomarkirî.",
          ],
        },
        security: {
          heading: "Ewlehî",
          body: [
            "Şîfreyên dabînkeran di hilanîna ewle ya pergala xebitandinê de tên hilanîn — Keychain'a iOS — ya ku ji aliyê amûrê ve tê şîfrekirin û tenê piştî ku amûr carekê ji dema vekirina xwe ve hatiye vekirin tê xwendin.",
            "Navnîşana serverê ya dabînkerekê li her cihê ku di Sepanê de tê nîşandan tê veşartin, ji ber vê yekê navnîşana tevahî ji ekranek vekirî nayê xwendin.",
            "Gelek dabînkerên IPTV tenê bi HTTP ya sade tên gihîştin, û Sepan loma destûrê wê dide. Trafîka ber bi dabînkerek wisa ve di veguhastinê de nayê şîfrekirin, û ev taybetmendiya dabînkerê ku te hilbijartiye ye, ne ya Sepanê. Heke dabînkerê te navnîşanek HTTPS pêşkêş bike, wê tercîh bike.",
          ],
        },
      },
    },
  },

  providers: {
    title: "Dabînker",
    tagline: "Hemû kanal, fîlm û rêzefîlmên te li yek cihî.",
    addProvider: "+ Dabînkerekê Zêde Bike",
    noProvidersYet: "Hê tu dabînker tune.",
    active: "Çalak",
    neverConnected: "Çu carî ne girêdayî bû",
    removeTitle: "Dabînkerê rake",
    removeBody: '"{name}" bê rakirin? Ev kiryar nayê vegerandin.',
    connectError: "Nekarî bi vî dabînkerî ve were girêdan.",
    edit: "Biguherîne",
    connect: "Têkeve",
  },

  addProvider: {
    title: "Dabînkerekê Zêde Bike",
    unreachable: "Nekarî bigihîje vê serverê. Navnîşan û girêdana xwe kontrol bike.",
    subtitle: "Agahiyên têketina xwe yên Xtream Codes binivîse.",
    editTitle: "Dabînkerê Biguherîne",
    typeXtream: "Xtream Codes",
    typeRemoteM3U: "M3U ya Dûr",
    typeLocalM3U: "Pelê M3U yê Herêmî",
    nameLabel: "Nav (vebijarkî)",
    namePlaceholder: "Dabînkerê Min",
    defaultName: "Hesabê min",
    serverUrlLabel: "URL a Rajekar",
    serverUrlPlaceholder: "http://mînak.com:8080",
    usernameLabel: "Navê bikarhêner",
    passwordLabel: "Şîfre",
    show: "Nîşan bide",
    hide: "Veşêre",
    connectButton: "Girê bide",
    saveButton: "Tomar bike",
    m3uUrlLabel: "URL a Lîsteyê",
    m3uUrlPlaceholder: "http://mînak.com/playlist.m3u8",
    chooseFileButton: "Pelê hilbijêre",
    noFileChosen: "Tu pel nehatiye hilbijartin",
    catalogEmpty: "Girêdan pêk hat, lê vî pêşkêşkarî tu naverok venegerand — ne kanal, ne fîlm, ne rêzefîlm.",
  },

  /*
   * The bottom tab bar's own two labels.
   *
   * Live, Movies and Series are not repeated here: the bar reads them from
   * `home`, so renaming a section renames it everywhere at once.
   */
  tabs: {
    home: "Serrûpel",
    more: "Zêdetir",
  },

  home: {
    welcomeBack: "Tu bi xêr hatî",
    search: "Lêgerîn",
    browse: "Bigere",
    liveTV: "TV ya Zindî",
    movies: "Fîlim",
    series: "Rêzefîlim",
    liveTVSub: "Kanalên niha",
    moviesSub: "Hemû katalogê fîlman",
    seriesSub: "Rêzefîlm û beş",
    quickActions: "Kiryarên Bilez",
    favorites: "Bijarte",
    watchLater: "Paşê Temaşe Bike",
    settings: "Mîhengên",
    downloads: "Daxistin",
    topRated: "Herî bilind",
    newIn: "Nû di",
    featured: "Hilbijartî",
    continueWatching: "Temaşekirinê Berdewam Bike",
    seeAll: "Hemûyan Bibîne",
    noWatchHistory: "Hê dîroka temaşekirinê tune",
    clear: "Paqij bike",
    clearHistoryTitle: "Dîroka temaşekirinê paqij bike",
    clearHistoryBody: "Hemû tomarên \"Temaşekirinê Berdewam Bike\" bên rakirin? Ev kiryar nayê vegerandin.",
  },

  history: {
    title: "Dîroka Temaşekirinê",
    empty: "Hê dîroka temaşekirinê tune.",
  },


  liveCategories: {
    title: "TV ya Zindî",
    allCategory: "Hemû",
    chooseCategory: "Kategoriyekê hilbijêre",
  },

  liveChannelList: {
    channelsCountSuffix: "kanal",
    searchPlaceholder: "Li kanalan bigere",
    liveBadge: "ZINDÎ",
    noChannelsAvailable: "Tu kanal berdest nîne.",
  },

  liveGuide: {
    guideButtonLabel: "Kanal",
    title: "Kanal",
    thisCategoryTab: "Vê Kategoriyê",
    allChannelsTab: "Hemû Kanalan",
    noResults: "Kanal nehat dîtin.",
    close: "Bigire",
  },

  livePlayer: {
    previousChannel: "Berê",
    nextChannel: "Pêş",
    play: "Lêxe",
    pause: "Rawestîne",
    subtitles: "Jêrnivîs",
    audio: "Deng",
    mute: "Bêdeng",
    unmute: "Deng veke",
    aspectFit: "Bicihîne",
    aspectFill: "Tije bike",
    aspectStretch: "Dirêj bike",
    streamPaused: "Ev weşan ji bo niha rawestiyaye. Divê di demek kurt de vegere.",
    playbackBusy: "Weşan kêliyekê mijûl e. Hinekî bisekine an kanaleke din biceribîne.",
    playbackOffAir: "Ev kanal niha weşan nake. Kanaleke din biceribîne.",
    playbackSlow: "Girêdan hêdî ye an jî qut bûye. Tora xwe kontrol bike û dîsa biceribîne.",
    playbackUnsupported: "Ev kanal formatek bi kar tîne ku amûra te nikare lê bide.",
    playbackUnknown: "Ev kanal niha dest pê nake. Kanaleke din biceribîne, an piştî demek kurt dîsa.",
    vodBusy: "Lêdan ji bo kêliyekê mijûl e. Hinekî bisekine û dîsa biceribîne.",
    vodMissing: "Ev berhem niha li cem pêşkêşkar tune ye.",
    vodSlow: "Girêdan hêdî ye an jî qut bûye. Tora xwe kontrol bike û dîsa biceribîne.",
    vodUnsupported: "Ev pel formatek bi kar tîne ku amûra te nikare lê bide.",
    vodUnknown: "Ev berhem niha nayê lîstin. Piştî demek kurt dîsa biceribîne.",
    sleepTimer: "Demjimêra xewê",
    sleepOff: "Girtî",
    channelNumber: "Here kanalê",
  },

  moviesCategories: {
    title: "Fîlim",
  },

  moviesGrid: {
    title: "Fîlim",
    moviesCountSuffix: "fîlim",
    noMoviesAvailable: "Tu fîlim berdest nîne.",
    searchPlaceholder: "Li fîliman bigere",
  },

  movieDetails: {
    play: "Lêbide",
    favorite: "Bijarte",
    favorited: "Di Bijarteyan de",
    addWatchLater: "Paşê Temaşe Bike",
    inWatchLater: "Di Paşê Temaşe Bike de",
    plot: "Naverok",
    cast: "Lîstikvan",
    director: "Derhêner",
    download: "Dakêşe",
    downloaded: "Hatiye Dakêşin",
  },

  seriesCategories: {
    title: "Rêzefîlim",
  },

  seriesGrid: {
    title: "Rêzefîlim",
    seriesCountSuffix: "rêzefîlim",
    noSeriesAvailable: "Tu rêzefîlim berdest nîne.",
    searchPlaceholder: "Li rêzefîlman bigere",
  },

  seriesDetails: {
    play: "Lêbide",
    favorite: "Bijarte",
    favorited: "Di Bijarteyan de",
    addWatchLater: "Paşê Temaşe Bike",
    inWatchLater: "Di Paşê Temaşe Bike de",
    plot: "Naverok",
    cast: "Lîstikvan",
    director: "Derhêner",
    noEpisodesAvailable: "Tu beş berdest nîne.",
    seasonsSuffix: "sezon",
    episodesTitle: "Beş",
    episodesSuffix: "beş",
  },

  episodePlayer: {
    nextEpisodeIn: "Beşa pêş de {n} çirkeyan de",
    dismiss: "Deyne aliyekî",
    playNow: "Niha Lêbide",
    episodeNotFound: "Beş nehat dîtin.",
  },

  moviePlayer: {
    movieNotFound: "Fîlim nehat dîtin.",
  },

  trackSelector: {
    audio: "Deng",
    subtitles: "Bînavîs",
    off: "Girtî",
    close: "Bigire",
    tracksButton: "Track",
    unknown: "Nenas",
    noAudioTracks: "Tu rêça dengî ya din tune.",
    noSubtitleTracks: "Tu binnivîs tune.",
  },

  search: {
    title: "Lêgerîn",
    placeholder: "Li TV ya zindî, fîlim, rêzefîlman bigere",
    preparingSearch: "Lêgerîn tê amadekirin…",
    typeToSearch: "Ji bo lêgerîna di TV ya Zindî, Fîlim û Rêzefîlman de binivîse.",
    noResultsFor: 'Ji bo "{query}" tu encam nehat dîtin.',
    resultsCountSuffix: "encam",
    live: "ZINDÎ",
    movie: "FÎLIM",
    series: "RÊZEFÎLIM",
  },

  library: {
    favoritesTitle: "Bijarte",
    watchLaterTitle: "Paşê Temaşe Bike",
    nothingHereYet: "Hê tiştek li vir tune.",
  },

  downloads: {
    title: "Daxistin",
    empty: "Hê tu daxistin tune.",
    queued: "Di rêzê de",
    downloading: "Tê dakêşin",
    paused: "Hatiye rawestandin",
    completed: "Qediya",
    failed: "Serneket",
    canceled: "Hate betalkirin",
    pause: "Rawestîne",
    resume: "Berdewam bike",
    cancel: "Betal bike",
    delete: "Jê bibe",
    deleteConfirmTitle: "Daxistinê jê bibe",
    deleteConfirmBody: 'Pelê hatiye dakêşin ê "{title}" bê jêbirin? Ev kiryar nayê vegerandin.',
    download: "Dakêşe",
    notEligible: "Ev tişt nikare bê dakêşin.",
    alreadyDownloaded: "Berê hatiye dakêşin",
  },

  parental: {
    title: "Kilîta dêûbav",
    enterPin: "PIN'ê binivîse",
    setPin: "PIN'eke 4 hejmarî diyar bike",
    changePin: "PIN'ê biguherîne",
    removePin: "PIN'ê rake",
    removePinConfirmBody: "Rakirina PIN'ê kilîta kategoriyan jî betal dike, û her kategoriya veşartî bêyî PIN'ê tê vekirin.",
    wrongPin: "PIN çewt e",
    lockCategories: "Ji bo xuyabûna kategoriyan PIN bixwaze",
    lockCategoriesNote: "Kategoriyên veşartî tenê bi PIN vedibin.",
    forgotPinNote: "PIN ji bîr kir? Tenê bi rakirina hemû pêşkêşkaran ji \"Rêveberiya pêşkêşkaran\" tê paqijkirin — ev şîfreyên wan ên tomarkirî û her tiştê te veşartiye jî jê dibe. Paşê pêşkêşkarê xwe dîsa zêde bike û PINeke nû hilbijêre.",
    noPinYet: "Pêşî PIN'ekê diyar bike",
  },

  update: {
    requiredTitle: "Nûkirin pêwîst e",
    requiredBody:
      "Guhertoyeke nû hat weşandin û ev guherto êdî nikare bixebite. Ji bo berdewamkirinê sepanê nû bike.",
    updateNow: "Niha nû bike",
    availableTitle: "Nûkirineke nû heye",
    availableBody: "Guhertoyeke nûtir a Mooj TV derket, bi baştirkirin û serrastkirinan. Niha nû bike.",
    later: "Paşê",
  },
  settings: {
    title: "Mîhengên",
    appearance: "Xuyabûn",
    yourActivity: "Çalakiya te",
    language: "Ziman",
    theme: "Dirb",
    themeDark: "Tarî",
    themeLight: "Ronî",
    themeSystem: "Li gorî pergalê",
    content: "Naverok",
    manageCategoryVisibility: "Xuyabûna kategoriyan birêve bibe",
    accountProvider: "Ajimêr / Dabînker",
    provider: "Dabînker",
    server: "Rajekar",
    username: "Navê bikarhêner",
    accountStatus: "Rewşa ajimêr",
    expiresOn: "Dawî",
    neverExpires: "Bêdawî",
    connections: "Girêdan",
    outputFormats: "Formatên derketinê",
    serverTimezone: "Herêma demê ya rajekar",
    manageProviders: "Dabînkeran birêve bibe",
    disconnect: "Girêdanê veqetîne",
    disconnectConfirmBody: "Ji vî pêşkêşkarî derkevî? Pêşkêşkarên te yên tomarkirî û pirtûkxaneya te li vê amûrê dimînin.",
    playback: "Lêdan",
    modernChannelView: "Dîmena nûjen a kanalan",
    modernChannelViewNote: "Dema tu li kanalan digerî wêne li ser ekranê dimîne, li şûna lêdereke tije ekran.",
    resumePlayback: "Lêdanê berdewam bike",
    autoplayNextEpisode: "Beşa pêş de bixweber lêbide",
    storage: "Depo",
    downloadedContent: "Naveroka hatiye dakêşin",
    manageDownloads: "Daxistinan birêve bibe",
    data: "Daneyan",
    clearWatchHistory: "Dîroka temaşekirinê paqij bike",
    clearFavorites: "Bijarteyan paqij bike",
    clearWatchLater: "Paşê Temaşe Bike paqij bike",
    clearConfirmBody: "Ev kiryar nayê vegerandin.",
    legal: "Yasayî",
    termsConditions: "Mercên Bikaranînê",
    privacyPolicy: "Politîkaya Nehêniyê",
    licences: "Lîsansên çavkaniya vekirî",
    licencesIntro: "Ev sepan pêkhateyên çavkaniya vekirî yên jêrîn bikar tîne. Nivîsarên tam ên lîsansan ji projeyên wan peyda dibin.",
    diagnostics: "Teşxîs",
    playerDiagnostics: "Teşxîsa lîstikvan",
    about: "Derbarê",
    appVersion: "Guhertoya sepanê",
    package: "Pakêt",
    restartRequiredTitle: "Ji nû ve destpêkirin pêwîst e",
    restartRequiredBody:
      "Rêzkirina rast-ber-çep tenê dema sepan dest pê dike diguhere. Niha bigire û ji nû ve veke, an jî bidomîne û cara pêş de wê were sepandin.",
    restartNow: "Niha bigire",
    backgroundPlayback: "Di paşperdeyê de lêxistinê bidomîne",
    backgroundPlaybackNote: "Bi bingehîn girtî ye: weşana vekirî girêdana pêşkêşkar digire.",
    parentalLock: "Kilîta dêûbav",
    clearImageCache: "Wêneyên hilanîn paqij bike",
  },

  categoryVisibility: {
    title: "Kategorî",
    searchPlaceholder: "Li kategoriyekê bigere",
    empty: "Di vê beşê de tu kategorî tune.",
  },
};

export default ku;
