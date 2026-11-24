import type { TranslationShape } from "./en";

const tr: TranslationShape = {
  common: {
    back: "Geri",
    cancel: "İptal",
    remove: "Kaldır",
    save: "Kaydet",
    search: "Ara",
    loading: "Yükleniyor…",
    retry: "Tekrar dene",
    refreshFailed: "Şu anda yenilenemedi — tekrar deneyin.",
    noInternet: "İnternet bağlantısı yok.",
    providerUnreachable: "Sağlayıcı sunucusu şu anda yanıt vermiyor. Birazdan tekrar deneyin.",
    confirm: "Onayla",
    clear: "Temizle",
    edit: "Düzenle",
    add: "Ekle",
    connect: "Bağlan",
    accept: "Kabul et",
    previous: "Önceki",
    next: "Sonraki",
    ok: "Tamam",
    later: "Daha sonra",
    yes: "Evet",
    no: "Hayır",
    justNow: "Az önce",
    minutesAgo: "{n} dk önce",
    hoursAgo: "{n} sa önce",
    daysAgo: "{n} gün önce",
  },

  onboarding: {
    skip: "Atla",
    next: "İleri",
    getStarted: "Başla",
    slide1Title: "Canlı TV, Filmler ve Diziler",
    slide1Body: "IPTV sağlayıcınızın sunduğu her şey, tek bir yerde düzenli ve aranabilir.",
    slide2Title: "Hızlı kanal geçişi için tasarlandı",
    slide2Body: "Buna ayak uyduracak şekilde tasarlanmış bir oynatıcıyla kanallar arasında anında geçiş yapın.",
    slide3Title: "Sağlayıcınız, verileriniz",
    slide3Body:
      "Mooj TV yalnızca bağlandığınız sağlayıcının içeriğini oynatır — cihazınızın dışında hiçbir şey saklanmaz veya paylaşılmaz.",
  },

  legal: {
    title: "Şartlar ve Koşullar",
    acceptButton: "Kabul Et ve Devam Et",
    accepted: "Kabul Edildi",
    lastUpdatedLabel: "Son güncelleme",
    lastUpdatedDate: "2026-11-08",
    eulaTitle: "Son Kullanıcı Lisans Sözleşmesi (EULA)",
    tosTitle: "Hizmet Şartları",
    dmcaTitle: "Telif Hakkı / DMCA Bildirimi",
    sections: {
      scopeAndAcceptance: {
        heading: "Kabul ve kapsam",
        body: [
          "Bu şartlar (EULA, Hizmet Şartları ve Telif Hakkı/DMCA Bildirimi dâhil) Mooj TV (\"Uygulama\") kullanımınızı düzenler. Uygulamayı indirerek, kurarak, erişerek veya kullanarak bu şartlara bağlı olmayı kabul edersiniz.",
          "Kabul etmiyorsanız Uygulamayı kullanmayın.",
        ],
      },
      noContentProvided: {
        heading: "İçerik sağlanmaz veya barındırılmaz",
        body: [
          "Uygulama yalnızca bir medya oynatıcı aracıdır. Uygulama, varsayılan olarak herhangi bir medya içeriği, kanal veya oynatma listesi içermez, sağlamaz, satmaz, lisanslamaz, dağıtmaz veya yayınlamaz.",
          "Geliştiriciler herhangi bir medya dosyası, oynatma listesi, kanal veya akış barındırmaz ve herhangi bir IPTV hizmeti işletmez.",
        ],
      },
      userProvidedContent: {
        heading: "Yalnızca kullanıcı tarafından sağlanan içerik",
        body: [
          "Uygulamayı kullanmak için, Xtream Codes bilgileri veya doğrudan yayın URL'leri gibi kendi içerik kaynaklarınızı sağlamanız gerekir. Bu kaynaklar, sizin kontrol ettiğiniz veya erişim yetkinizin olduğu sunuculardan olmalıdır.",
          "Uygulamaya yüklediğiniz veya Uygulama üzerinden kullandığınız içerik için gerekli tüm haklara, lisanslara ve izinlere sahip olduğunuzu beyan ve taahhüt edersiniz.",
        ],
      },
      userResponsibility: {
        heading: "Hukuka uygunluk ve telif konusunda kullanıcı sorumluluğu",
        body: [
          "Uygulama aracılığıyla eriştiğiniz, oynattığınız veya görüntülediğiniz içeriklerin hukuka uygunluğundan (telif hakları dâhil) yalnızca siz tamamen (%100) sorumlusunuz.",
          "Uygulamayı ihlal edici, yetkisiz veya yasa dışı içeriklere erişmek ya da erişimi kolaylaştırmak için kullanmamayı kabul edersiniz.",
        ],
      },
      noAffiliation: {
        heading: "Onay veya bağlantı yoktur",
        body: [
          "Geliştiriciler herhangi bir IPTV sağlayıcısı veya üçüncü taraf medya hizmetiyle satış, onay, sponsorluk veya iş birliği ilişkisi içinde değildir.",
          "Üçüncü taraflara yapılan atıflar yalnızca uyumluluk/açıklama amaçlıdır ve ortaklık ya da onay anlamına gelmez.",
        ],
      },
      prohibitedUses: {
        heading: "Yasaklı kullanımlar",
        body: [
          "Uygulamayı telif hakları dâhil herhangi bir yasa veya düzenlemeyi ihlal etmek için kullanamazsınız.",
          "Uygulama üzerinden ihlal edici oynatma listelerini veya yayınları yükleyemez, paylaşamaz, tanıtamaz veya reklamını yapamazsınız.",
          "Herhangi bir içerik veya hizmete uygulanan güvenlik, erişim kontrolleri, DRM, coğrafi kısıtlamalar veya ağ kısıtlamalarını aşmaya, devre dışı bırakmaya veya bunlara müdahale etmeye çalışamazsınız.",
          "Uygulamayı tersine mühendislik yapamaz, derleyemez/ayrıştıramaz veya kaynak kodunu çıkarmaya çalışamazsınız (kanunun izin verdiği ölçü hariç).",
        ],
      },
      thirdPartyServices: {
        heading: "Üçüncü taraf hizmetler ve bağlantılar",
        body: [
          "Uygulama, sizin seçip yapılandırdığınız üçüncü taraf sunucu veya hizmetlere bağlanmanıza imkân verebilir. Bu üçüncü taraflar geliştiricilerin kontrolünde değildir ve ayrı şartlara/gizlilik politikalarına sahip olabilir.",
          "Geliştiriciler üçüncü taraf içeriğin, kullanılabilirliğin, kalitenin, hukuka uygunluğun veya üçüncü taraf hizmet kullanımınızdan doğan zararların sorumluluğunu üstlenmez.",
        ],
      },
      termination: {
        heading: "Fesih",
        body: [
          "Bu şartları ihlal etmeniz veya yasal zorunluluk hâlinde Uygulamayı kullanma hakkınız askıya alınabilir veya sonlandırılabilir.",
          "Fesih hâlinde Uygulamayı kullanmayı bırakmalısınız. Fesihten sonra da yürürlükte kalması amaçlanan hükümler (feragatler, sorumluluk sınırlaması, tazminat ve uygulanacak hukuk dâhil) yürürlükte kalır.",
        ],
      },
      disclaimers: {
        heading: "Sorumluluk reddi",
        body: [
          "UYGULAMA \"OLDUĞU GİBİ\" VE \"MEVCUT OLDUĞU KADARIYLA\" SUNULUR; AÇIK, ZIMNİ VEYA KANUNİ HİÇBİR GARANTİ VERİLMEZ. TİCARETE ELVERİŞLİLİK, BELİRLİ BİR AMACA UYGUNLUK VE İHLAL ETMEME GARANTİLERİ DAHİL OLMAK ÜZERE.",
          "Geliştiriciler Uygulamanın kesintisiz, hatasız, güvenli olacağını veya tüm cihazlar/ içerik kaynaklarıyla uyumlu olacağını garanti etmez.",
        ],
      },
      limitationOfLiability: {
        heading: "Sorumluluğun sınırlandırılması",
        body: [
          "KANUNUN İZİN VERDİĞİ AZAMİ ÖLÇÜDE, GELİŞTİRİCİLER UYGULAMANIN KULLANIMINDAN DOĞAN VEYA KULLANIMLA İLİŞKİLİ DOLAYLI, ARIZİ, ÖZEL, SONUÇSAL, ÖRNEK NİTELİĞİNDE VEYA CEZAİ ZARARLARDAN; KÂR, GELİR, VERİ VEYA İTİBAR KAYBINDAN SORUMLU TUTULAMAZ.",
          "Sorumluluğun tamamen hariç tutulamadığı durumlarda, geliştiricilerin toplam sorumluluğu, talebe neden olan olaydan önceki on iki (12) ay içinde Uygulama için ödediğiniz tutarla (varsa) sınırlıdır.",
        ],
      },
      indemnification: {
        heading: "Tazminat",
        body: [
          "İçerik kaynaklarınızdan, Uygulamayı kullanımınızdan veya bu şartları ya da herhangi bir yasayı ihlalinizden kaynaklanan her türlü talep, zarar, sorumluluk, kayıp ve masrafa (makul avukatlık ücretleri dâhil) karşı geliştiricileri savunmayı, tazmin etmeyi ve zararsız tutmayı kabul edersiniz.",
        ],
      },
      dmcaNotice: {
        heading: "Telif hakkı / DMCA feragati (barındırma yoktur)",
        body: [
          "Geliştiriciler herhangi bir medya içeriğini barındırmaz, depolamaz, iletmez veya dağıtmaz. Uygulama yalnızca kullanıcının sağladığı ve kontrol ettiği veya kullanıcının yapılandırdığı üçüncü taraf sunucuların sağladığı içeriği oynatır.",
          "Uygulama üzerinden erişilen bir içeriğin telif hakkını ihlal ettiğini düşünüyorsanız şikâyetinizi içeriği barındıran/ileten gerçek hosting sağlayıcısına veya sunucu işletmecisine yönlendirmelisiniz; uygulama geliştiricilerine değil.",
        ],
      },
      dmcaHowToSubmit: {
        heading: "Telif bildirimi gönderme",
        body: [
          "Yine de uygulama geliştiricileriyle telif konusunda iletişime geçmeniz gerekiyorsa, aşağıdaki e-posta adresine şu bilgileri içeren bir bildirim gönderin: (a) telifli eserin tanımı; (b) ihlal ettiği iddia edilen materyalin tanımı (sunucu/URL dâhil yeterli konum bilgisiyle); (c) iletişim bilgileriniz; (d) iyi niyet beyanı; (e) bildirimin doğru olduğuna ve hak sahibi veya yetkili temsilci olduğunuza dair yeminli beyan.",
        ],
      },
      governingLaw: {
        heading: "Uygulanacak hukuk ve yargı yeri",
        body: [
          "Bu şartlar, kanunlar ihtilafı kuralları dikkate alınmaksızın Mısır Arap Cumhuriyeti hukukuna tabidir.",
          "Uygulama veya bu şartlardan doğan ya da bunlarla ilgili her türlü uyuşmazlığın Mısır Arap Cumhuriyeti'nin yetkili mahkemelerinde görülmesini kabul eder ve bu mahkemelerin yetkisini kabul edersiniz.",
        ],
      },
      contact: {
        heading: "İletişim",
        body: ["Yasal talepler (telif bildirimleri dâhil) için iletişim:", "E-posta: support@mooj-player.com"],
      },
    },
  },

  privacy: {
    title: "Gizlilik Politikası",
    lastUpdatedLabel: "Son güncelleme",
    lastUpdatedDate: "2026-11-08",
    intro: "Bu politika, Mooj TV'nin (\"Uygulama\") bilgilerinizi nasıl işlediğini açıklar. com.moojtv.player paket adıyla yayınlanan Mooj TV Android uygulaması için geçerlidir.",
    sections: {
      summary: {
        heading: "Kısa özet",
        body: [
          "Mooj TV, sizinle ilgili hiçbir kişisel veriyi toplamaz, iletmez veya saklamaz. Hesap yoktur, kayıt yoktur, analitik yoktur, reklam yoktur ve hiçbir şekilde takip yoktur.",
          "Uygulamanın sakladığı her şey — sağlayıcı bilgileriniz, favorileriniz, geçmişiniz, indirmeleriniz — cihazınızda kalır ve hiçbir zaman bize gönderilmez.",
        ],
      },
      noCollection: {
        heading: "Hangi bilgileri topluyoruz",
        body: [
          "Hiçbirini. Mooj TV geliştiricileri, Uygulamadan veri alan hiçbir sunucu işletmez ve sizi ya da cihazınızı tanımlamalarının hiçbir yolu yoktur.",
          "Uygulamada hiçbir analitik SDK'sı, reklam SDK'sı, çökme raporlama hizmeti ve üçüncü taraf reklam veya takip tanımlayıcısı bulunmaz.",
        ],
      },
      credentials: {
        heading: "Sağlayıcı bilgileriniz",
        body: [
          "Herhangi bir şey izleyebilmek için, hâlihazırda abone olduğunuz bir hizmetin bilgilerini girersiniz — bir sunucu adresi, bir kullanıcı adı ve bir şifre ya da doğrudan bir yayın bağlantısı.",
          "Bu bilgiler yalnızca cihazınızda, işletim sisteminin sırlar için sağladığı Android Keystore destekli güvenli depolama alanında saklanır. Hiçbir zaman Uygulamanın sıradan veritabanına yazılmaz, hiçbir zaman bir günlüğe yazılmaz ve hiçbir zaman geliştiricilere veya herhangi bir üçüncü tarafa iletilmez.",
          "Yalnızca tek bir hedefe gönderilirler: oturum açmak ve istediğiniz içeriği oynatmak üzere, bu bilgileri girdiğiniz sağlayıcıya. Söz konusu sağlayıcı sizin kendi tedarikçinizdir ve verilerinizi işleme biçimi bu politikaya değil, kendi şartlarına tabidir.",
        ],
      },
      onDevice: {
        heading: "Cihazınızda kalanlar",
        body: [
          "Uygulama, çalışabilmesi için şunları yerel olarak saklar: eklediğiniz sağlayıcıların listesi, hangi kategorileri gizlediğiniz, favorileriniz ve Sonra İzle listeniz, izleme geçmişiniz ve oynatma konumlarınız, indirdiğiniz dosyalar, belirlediyseniz ebeveyn PIN'iniz ve dil ile tema gibi ayarlarınız.",
          "Bunların tamamı cihazınızdaki Uygulamanın özel depolama alanında bulunur. Hiçbiri bize yedeklenmez, eşitlenmez veya paylaşılmaz.",
        ],
      },
      network: {
        heading: "Ağ bağlantıları",
        body: [
          "Uygulama yalnızca tek bir tür hedefe ağ isteği yapar: bilgilerini girdiğiniz sağlayıcıya. Kanal, film ve dizi listelerinizi, bu listelerin işaret ettiği görselleri ve oynatmayı seçtiğiniz yayınları o sağlayıcıdan alır.",
          "Uygulama, geliştiricilerin işlettiği hiçbir sunucuya bağlanmaz; çünkü böyle bir sunucu yoktur.",
          "Uygulamanın daha yeni bir sürümü olup olmadığının denetimi, Uygulamanın kendisi tarafından değil, cihazınızdaki Google Play tarafından yapılır.",
        ],
      },
      permissions: {
        heading: "İzinler ve her birinin neden istendiği",
        body: [
          "İnternet ve ağ durumu: sağlayıcınıza ulaşmak ve cihaz çevrimdışı olduğunda bunu size bildirmek için.",
          "Ön plan hizmeti ve medya oynatma: Ayarlar'dan açmanız hâlinde, ekran kapalıyken veya başka bir uygulama öndeyken oynatmayı sürdürmek için.",
          "Uyanık tutma (wake lock): izlediğiniz şeyin ortasında cihazın uykuya geçmesini engellemek için.",
          "Ses ayarlarını değiştirme: oynatma sırasında ses seviyesini ve ses odağını yönetmek için.",
          "Titreşim: arayüzdeki kısa dokunma geri bildirimi için.",
          "Depolama, yalnızca Android 12 ve öncesinde: istediğiniz indirmeleri kaydetmek için.",
          "Uygulama; kameranıza, mikrofonunuza, konumunuza, kişilerinize, takviminize, fotoğraflarınıza ya da çağrı veya mesaj geçmişinize erişim istemez ve bunları okuyamaz.",
        ],
      },
      children: {
        heading: "Çocuklar",
        body: [
          "Mooj TV çocuklara yönelik değildir ve onlar için tasarlanmamıştır. Çocuklar dâhil hiç kimseden veri toplamaz.",
          "Cihazın sahibi olan kişinin hangi kategorilerin görünür olacağını kısıtlayabilmesi için Ayarlar'da bir ebeveyn PIN'i mevcuttur.",
        ],
      },
      retention: {
        heading: "Bilgilerinizin saklanması ve silinmesi",
        body: [
          "Bize hiçbir şey ulaşmadığı için, sizin adınıza saklayacağımız veya sileceğimiz bir şey de yoktur.",
          "Uygulamanın sakladığı her şey cihazda sizin kontrolünüzdedir. Bir sağlayıcıyı ve kayıtlı giriş bilgilerini sağlayıcılar ekranından kaldırabilir, izleme geçmişinizi ve önbellekteki görselleri Ayarlar'dan temizleyebilir, indirmeleri indirilenler ekranından silebilir ve Uygulamayı kaldırarak ya da Android ayarlarından verilerini temizleyerek bunların tamamını tek seferde kaldırabilirsiniz.",
          "Uygulamanın kaldırılması, kayıtlı sağlayıcı giriş bilgileri dâhil tüm yerel deposunu siler.",
        ],
      },
      security: {
        heading: "Güvenlik",
        body: [
          "Sağlayıcı şifreleri, işletim sisteminin Android Keystore tarafından desteklenen ve cihaz tarafından şifrelenen güvenli depolama alanında tutulur.",
          "Bir sağlayıcının sunucu adresi, Uygulamada görüntülendiği her yerde maskelenir; böylece tam adres kilidi açık bir ekrandan okunamaz.",
          "Birçok IPTV sağlayıcısına yalnızca düz HTTP üzerinden erişilebilir; Uygulama da bu nedenle buna izin verir. Böyle bir sağlayıcıya giden trafik iletim sırasında şifrelenmez ve bu, Uygulamanın değil, seçtiğiniz sağlayıcının bir özelliğidir. Sağlayıcınız bir HTTPS adresi sunuyorsa onu tercih edin.",
        ],
      },
      changes: {
        heading: "Bu politikadaki değişiklikler",
        body: [
          "Bu politika değişirse, güncellenmiş sürüm aşağıdaki adreste yayınlanacak ve bu sayfanın üst kısmındaki tarih güncellenecektir.",
        ],
      },
      contact: {
        heading: "İletişim",
        body: [
          "Bu politika veya Mooj TV'de gizlilik hakkındaki sorularınız için iletişim:",
          "E-posta: support@mooj-player.com",
          "Web: https://mooj-player.com/privacy.html",
        ],
      },
    },

    ios: {
      lastUpdatedDate: "2026-11-18",
      intro: "Bu politika, Mooj TV'nin (\"Uygulama\") bilgilerinizi nasıl işlediğini açıklar. com.moojtv.player paket kimliğiyle yayınlanan, iPhone ve iPad için Mooj TV uygulaması için geçerlidir.",
      sections: {
        summary: {
          heading: "Kısa özet",
          body: [
            "Mooj TV, sizinle ilgili hiçbir kişisel veriyi toplamaz, iletmez veya saklamaz. Hesap yoktur, kayıt yoktur, analitik yoktur, reklam yoktur ve hiçbir şekilde takip yoktur.",
            "Uygulamanın sakladığı her şey — sağlayıcı bilgileriniz, favorileriniz, geçmişiniz — cihazınızda kalır ve hiçbir zaman bize gönderilmez.",
          ],
        },
        credentials: {
          heading: "Sağlayıcı bilgileriniz",
          body: [
            "Herhangi bir şey izleyebilmek için, hâlihazırda abone olduğunuz bir hizmetin bilgilerini girersiniz — bir sunucu adresi, bir kullanıcı adı ve bir şifre ya da doğrudan bir yayın bağlantısı.",
            "Bu bilgiler yalnızca cihazınızda, işletim sisteminin sırlar için sağladığı güvenli depolama alanı olan iOS anahtar zincirinde (Keychain) saklanır. Hiçbir zaman Uygulamanın sıradan veritabanına yazılmaz, hiçbir zaman bir günlüğe yazılmaz ve hiçbir zaman geliştiricilere veya herhangi bir üçüncü tarafa iletilmez.",
            "Yalnızca tek bir hedefe gönderilirler: oturum açmak ve istediğiniz içeriği oynatmak üzere, bu bilgileri girdiğiniz sağlayıcıya. Söz konusu sağlayıcı sizin kendi tedarikçinizdir ve verilerinizi işleme biçimi bu politikaya değil, kendi şartlarına tabidir.",
          ],
        },
        onDevice: {
          heading: "Cihazınızda kalanlar",
          body: [
            "Uygulama, çalışabilmesi için şunları yerel olarak saklar: eklediğiniz sağlayıcıların listesi, hangi kategorileri gizlediğiniz, favorileriniz ve Sonra İzle listeniz, izleme geçmişiniz ve oynatma konumlarınız, belirlediyseniz ebeveyn PIN'iniz ve dil ile tema gibi ayarlarınız.",
            "Çevrimdışı izleme için indirme, Uygulamanın iOS sürümünde mevcut değildir; bu nedenle cihazınıza hiçbir medya dosyası kaydedilmez.",
            "Bunların tamamı cihazınızdaki Uygulamanın özel depolama alanında bulunur. Hiçbiri bize yedeklenmez, eşitlenmez veya paylaşılmaz.",
          ],
        },
        network: {
          heading: "Ağ bağlantıları",
          body: [
            "Uygulama yalnızca tek bir tür hedefe ağ isteği yapar: bilgilerini girdiğiniz sağlayıcıya. Kanal, film ve dizi listelerinizi, bu listelerin işaret ettiği görselleri ve oynatmayı seçtiğiniz yayınları o sağlayıcıdan alır.",
            "Uygulama, geliştiricilerin işlettiği hiçbir sunucuya bağlanmaz; çünkü böyle bir sunucu yoktur.",
            "Uygulamanın daha yeni bir sürümü olup olmadığının denetimi, Uygulamanın kendisi tarafından değil, cihazınızdaki App Store tarafından yapılır.",
          ],
        },
        permissions: {
          heading: "İzinler ve Uygulamanın neden hiçbirini istemediği",
          body: [
            "iOS'ta Uygulama sizden hiçbir izin istemez. Sağlayıcınıza ulaşmak için ağ erişimine ihtiyacı vardır ve iOS bunu hiçbir istem göstermeden verir.",
            "Uygulama; kameranıza, mikrofonunuza, konumunuza, kişilerinize, takviminize, fotoğraflarınıza ya da çağrı veya mesaj geçmişinize erişim istemez ve bunları okuyamaz. Bunların hiçbiri için bir kullanım açıklaması bildirmez; oysa iOS, bir uygulamanın bunları isteyebilmesi için bile bu açıklamayı şart koşar.",
            "Face ID veya Touch ID kullanmaz ve App Tracking Transparency (Uygulama İzleme Şeffaflığı) istemini hiçbir zaman göstermez; çünkü sizi takip etmez ve izin isteyeceği bir şey yoktur.",
          ],
        },
        retention: {
          heading: "Bilgilerinizin saklanması ve silinmesi",
          body: [
            "Bize hiçbir şey ulaşmadığı için, sizin adınıza saklayacağımız veya sileceğimiz bir şey de yoktur.",
            "Uygulamanın sakladığı her şey cihazda sizin kontrolünüzdedir. Bir sağlayıcıyı ve kayıtlı giriş bilgilerini sağlayıcılar ekranından kaldırabilir, izleme geçmişinizi ve önbellekteki görselleri Ayarlar'dan temizleyebilir ve Uygulamayı cihazınızdan silerek bunların tamamını tek seferde kaldırabilirsiniz.",
            "Uygulamanın silinmesi, kayıtlı sağlayıcı giriş bilgileri dâhil tüm yerel deposunu siler.",
          ],
        },
        security: {
          heading: "Güvenlik",
          body: [
            "Sağlayıcı şifreleri, işletim sisteminin güvenli depolama alanında — iOS anahtar zincirinde — tutulur; bu alan cihaz tarafından şifrelenir ve yalnızca cihaz açıldıktan sonra bir kez kilidi açıldığında okunabilir.",
            "Bir sağlayıcının sunucu adresi, Uygulamada görüntülendiği her yerde maskelenir; böylece tam adres kilidi açık bir ekrandan okunamaz.",
            "Birçok IPTV sağlayıcısına yalnızca düz HTTP üzerinden erişilebilir; Uygulama da bu nedenle buna izin verir. Böyle bir sağlayıcıya giden trafik iletim sırasında şifrelenmez ve bu, Uygulamanın değil, seçtiğiniz sağlayıcının bir özelliğidir. Sağlayıcınız bir HTTPS adresi sunuyorsa onu tercih edin.",
          ],
        },
      },
    },
  },

  providers: {
    title: "Sağlayıcılar",
    tagline: "Tüm kanallarınız, filmleriniz ve dizileriniz tek yerde.",
    addProvider: "+ Sağlayıcı Ekle",
    noProvidersYet: "Henüz sağlayıcı yok.",
    active: "Etkin",
    neverConnected: "Hiç bağlanmadı",
    removeTitle: "Sağlayıcıyı kaldır",
    removeBody: '"{name}" kaldırılsın mı? Bu işlem geri alınamaz.',
    connectError: "Bu sağlayıcıya bağlanılamadı.",
    edit: "Düzenle",
    connect: "Bağlan",
  },

  addProvider: {
    title: "Sağlayıcı Ekle",
    unreachable: "Bu sunucuya ulaşılamadı. Adresi ve bağlantınızı kontrol edin.",
    subtitle: "Xtream Codes giriş bilgilerinizi girin.",
    editTitle: "Sağlayıcıyı Düzenle",
    typeXtream: "Xtream Codes",
    typeRemoteM3U: "Uzak M3U",
    typeLocalM3U: "Yerel M3U dosyası",
    nameLabel: "Ad (isteğe bağlı)",
    namePlaceholder: "Sağlayıcım",
    defaultName: "Hesabım",
    serverUrlLabel: "Sunucu URL'si",
    serverUrlPlaceholder: "http://ornek.com:8080",
    usernameLabel: "Kullanıcı adı",
    passwordLabel: "Şifre",
    show: "Göster",
    hide: "Gizle",
    connectButton: "Bağlan",
    saveButton: "Kaydet",
    m3uUrlLabel: "Liste URL'si",
    m3uUrlPlaceholder: "http://ornek.com/playlist.m3u8",
    chooseFileButton: "Dosya seç",
    noFileChosen: "Dosya seçilmedi",
    catalogEmpty: "Bağlanıldı, ancak bu sağlayıcı hiçbir içerik döndürmedi — ne kanal, ne film, ne dizi.",
  },

  /*
   * The bottom tab bar's own two labels.
   *
   * Live, Movies and Series are not repeated here: the bar reads them from
   * `home`, so renaming a section renames it everywhere at once.
   */
  tabs: {
    home: "Ana sayfa",
    more: "Daha fazla",
  },

  home: {
    welcomeBack: "Tekrar hoş geldiniz",
    search: "Ara",
    browse: "Göz At",
    liveTV: "Canlı TV",
    movies: "Filmler",
    series: "Diziler",
    liveTVSub: "Şu an yayında",
    moviesSub: "Tüm film kataloğu",
    seriesSub: "Diziler ve bölümler",
    quickActions: "Hızlı İşlemler",
    favorites: "Favoriler",
    watchLater: "Sonra İzle",
    settings: "Ayarlar",
    downloads: "İndirilenler",
    topRated: "En yüksek puanlı",
    newIn: "Yeni",
    featured: "Öne Çıkanlar",
    continueWatching: "İzlemeye Devam Et",
    seeAll: "Tümünü Gör",
    noWatchHistory: "Henüz izleme geçmişi yok",
    clear: "Temizle",
    clearHistoryTitle: "İzleme geçmişini temizle",
    clearHistoryBody: "Tüm \"İzlemeye Devam Et\" öğeleri kaldırılsın mı? Bu işlem geri alınamaz.",
  },

  history: {
    title: "İzleme Geçmişi",
    empty: "Henüz izleme geçmişi yok.",
  },


  liveCategories: {
    title: "Canlı TV",
    allCategory: "Tümü",
    chooseCategory: "Kategori seç",
  },

  liveChannelList: {
    channelsCountSuffix: "kanal",
    searchPlaceholder: "Kanal ara",
    liveBadge: "CANLI",
    noChannelsAvailable: "Kullanılabilir kanal yok.",
  },

  liveGuide: {
    guideButtonLabel: "Kanallar",
    title: "Kanallar",
    thisCategoryTab: "Bu Kategori",
    allChannelsTab: "Tüm Kanallar",
    noResults: "Kanal bulunamadı.",
    close: "Kapat",
  },

  livePlayer: {
    previousChannel: "Önceki",
    nextChannel: "Sonraki",
    play: "Oynat",
    pause: "Duraklat",
    subtitles: "Altyazı",
    audio: "Ses",
    mute: "Sessiz",
    unmute: "Sesi aç",
    aspectFit: "Sığdır",
    aspectFill: "Doldur",
    aspectStretch: "Uzat",
    streamPaused: "Bu yayın şu anda durduruldu. Kısa süre içinde geri dönmesi bekleniyor.",
    playbackBusy: "Yayın bir an meşgul. Biraz bekleyin veya başka bir kanal deneyin.",
    playbackOffAir: "Bu kanal şu anda yayında değil. Başka bir kanal deneyin.",
    playbackSlow: "Bağlantı yavaş veya kesildi. Ağınızı kontrol edip tekrar deneyin.",
    playbackUnsupported: "Bu kanal, cihazınızın oynatamadığı bir biçim kullanıyor.",
    playbackUnknown: "Bu kanal şu anda başlamıyor. Başka bir kanal deneyin veya biraz sonra tekrar deneyin.",
    vodBusy: "Oynatma bir an meşgul. Biraz bekleyip tekrar deneyin.",
    vodMissing: "Bu yapım şu anda sağlayıcıda mevcut değil.",
    vodSlow: "Bağlantı yavaş veya kesildi. Ağınızı kontrol edip tekrar deneyin.",
    vodUnsupported: "Bu dosya, cihazınızın oynatamadığı bir biçim kullanıyor.",
    vodUnknown: "Bu yapım şu anda oynatılamıyor. Biraz sonra tekrar deneyin.",
    sleepTimer: "Uyku zamanlayıcısı",
    sleepOff: "Kapalı",
    channelNumber: "Kanala git",
  },

  moviesCategories: {
    title: "Filmler",
  },

  moviesGrid: {
    title: "Filmler",
    moviesCountSuffix: "film",
    noMoviesAvailable: "Kullanılabilir film yok.",
    searchPlaceholder: "Film ara",
  },

  movieDetails: {
    play: "Oynat",
    favorite: "Favori",
    favorited: "Favorilerde",
    addWatchLater: "Sonra İzle",
    inWatchLater: "Sonra İzle'de",
    plot: "Konu",
    cast: "Oyuncular",
    director: "Yönetmen",
    download: "İndir",
    downloaded: "İndirildi",
  },

  seriesCategories: {
    title: "Diziler",
  },

  seriesGrid: {
    title: "Diziler",
    seriesCountSuffix: "dizi",
    noSeriesAvailable: "Kullanılabilir dizi yok.",
    searchPlaceholder: "Dizi ara",
  },

  seriesDetails: {
    play: "Oynat",
    favorite: "Favori",
    favorited: "Favorilerde",
    addWatchLater: "Sonra İzle",
    inWatchLater: "Sonra İzle'de",
    plot: "Konu",
    cast: "Oyuncular",
    director: "Yönetmen",
    noEpisodesAvailable: "Kullanılabilir bölüm yok.",
    seasonsSuffix: "sezon",
    episodesTitle: "Bölümler",
    episodesSuffix: "bölüm",
  },

  episodePlayer: {
    nextEpisodeIn: "Sonraki bölüm {n} sn içinde",
    dismiss: "Kapat",
    playNow: "Şimdi Oynat",
    episodeNotFound: "Bölüm bulunamadı.",
  },

  moviePlayer: {
    movieNotFound: "Film bulunamadı.",
  },

  trackSelector: {
    audio: "Ses",
    subtitles: "Altyazı",
    off: "Kapalı",
    close: "Kapat",
    tracksButton: "İzler",
    unknown: "Bilinmiyor",
    noAudioTracks: "Başka ses parçası yok.",
    noSubtitleTracks: "Altyazı bulunmuyor.",
  },

  search: {
    title: "Ara",
    placeholder: "Canlı TV, film, dizi ara",
    preparingSearch: "Arama hazırlanıyor…",
    typeToSearch: "Canlı TV, Filmler ve Dizilerde aramak için yazın.",
    noResultsFor: '"{query}" için sonuç bulunamadı.',
    resultsCountSuffix: "sonuç",
    live: "CANLI",
    movie: "FİLM",
    series: "DİZİ",
  },

  library: {
    favoritesTitle: "Favoriler",
    watchLaterTitle: "Sonra İzle",
    nothingHereYet: "Burada henüz bir şey yok.",
  },

  downloads: {
    title: "İndirilenler",
    empty: "Henüz indirme yok.",
    queued: "Sırada",
    downloading: "İndiriliyor",
    paused: "Duraklatıldı",
    completed: "Tamamlandı",
    failed: "Başarısız",
    canceled: "İptal edildi",
    pause: "Duraklat",
    resume: "Devam ettir",
    cancel: "İptal",
    delete: "Sil",
    deleteConfirmTitle: "İndirmeyi sil",
    deleteConfirmBody: '"{title}" için indirilen dosya silinsin mi? Bu işlem geri alınamaz.',
    download: "İndir",
    notEligible: "Bu öğe indirilemez.",
    alreadyDownloaded: "Zaten indirildi",
  },

  parental: {
    title: "Ebeveyn kilidi",
    enterPin: "PIN girin",
    setPin: "4 haneli bir PIN belirleyin",
    changePin: "PIN'i değiştir",
    removePin: "PIN'i kaldır",
    removePinConfirmBody: "PIN'i kaldırmak kategori kilidini de kapatır; gizlenen her kategori PIN olmadan geri açılabilir.",
    wrongPin: "Yanlış PIN",
    lockCategories: "Kategori görünürlüğü için PIN iste",
    lockCategoriesNote: "Gizlenen kategoriler yalnızca PIN ile geri açılabilir.",
    forgotPinNote: "PIN'i mi unuttunuz? Yalnızca \"Sağlayıcıları yönet\" bölümünden tüm sağlayıcıları kaldırarak silinebilir — bu, kayıtlı parolalarını ve gizlediğiniz her şeyi de siler. Sonra sağlayıcınızı yeniden ekleyip yeni bir PIN belirleyin.",
    noPinYet: "Önce bir PIN belirleyin",
  },

  update: {
    requiredTitle: "Güncelleme gerekli",
    requiredBody:
      "Yeni bir sürüm yayınlandı ve bu sürüm artık çalışamıyor. Devam etmek için uygulamayı güncelleyin.",
    updateNow: "Şimdi güncelle",
    availableTitle: "Yeni bir güncelleme var",
    availableBody: "Mooj TV'nin iyileştirmeler ve düzeltmeler içeren daha yeni bir sürümü çıktı. Şimdi güncelleyin.",
    later: "Daha sonra",
  },
  settings: {
    title: "Ayarlar",
    appearance: "Görünüm",
    yourActivity: "Etkinliğiniz",
    language: "Dil",
    theme: "Tema",
    themeDark: "Koyu",
    themeLight: "Açık",
    themeSystem: "Sistemi izle",
    content: "İçerik",
    manageCategoryVisibility: "Kategori görünürlüğünü yönet",
    accountProvider: "Hesap / Sağlayıcı",
    provider: "Sağlayıcı",
    server: "Sunucu",
    username: "Kullanıcı adı",
    accountStatus: "Hesap durumu",
    expiresOn: "Bitiş",
    neverExpires: "Süresiz",
    connections: "Bağlantılar",
    outputFormats: "Çıkış biçimleri",
    serverTimezone: "Sunucu saat dilimi",
    manageProviders: "Sağlayıcıları yönet",
    disconnect: "Bağlantıyı kes",
    disconnectConfirmBody: "Bu sağlayıcıdan çıkış yapılsın mı? Kayıtlı sağlayıcılarınız ve kitaplığınız bu cihazda kalır.",
    playback: "Oynatma",
    modernChannelView: "Modern kanal görünümü",
    modernChannelViewNote: "Kanallara göz atarken görüntü ekranda kalır; tam ekran oynatıcı yerine.",
    resumePlayback: "Oynatmayı sürdür",
    autoplayNextEpisode: "Sonraki bölümü otomatik oynat",
    storage: "Depolama",
    downloadedContent: "İndirilen içerik",
    manageDownloads: "İndirmeleri yönet",
    data: "Veri",
    clearWatchHistory: "İzleme geçmişini temizle",
    clearFavorites: "Favorileri temizle",
    clearWatchLater: "Sonra İzle'yi temizle",
    clearConfirmBody: "Bu işlem geri alınamaz.",
    legal: "Yasal",
    termsConditions: "Şartlar ve Koşullar",
    privacyPolicy: "Gizlilik Politikası",
    licences: "Açık kaynak lisansları",
    licencesIntro: "Bu uygulama aşağıdaki açık kaynak bileşenleri kullanır. Lisansların tam metinleri kendi projelerinden edinilebilir.",
    diagnostics: "Tanılama",
    playerDiagnostics: "Oynatıcı tanılaması",
    about: "Hakkında",
    appVersion: "Uygulama sürümü",
    package: "Paket",
    restartRequiredTitle: "Yeniden başlatma gerekli",
    restartRequiredBody:
      "Sağdan sola yerleşim yalnızca uygulama başlarken değişir. Şimdi kapatıp yeniden açın ya da kullanmaya devam edin; bir sonraki açılışta uygulanır.",
    restartNow: "Şimdi kapat",
    backgroundPlayback: "Arka planda oynatmaya devam et",
    backgroundPlaybackNote: "Varsayılan olarak kapalı: açık kalan yayın sağlayıcı bağlantınızı tutar.",
    parentalLock: "Ebeveyn kilidi",
    clearImageCache: "Önbellekteki görselleri temizle",
  },

  categoryVisibility: {
    title: "Kategoriler",
    searchPlaceholder: "Kategori ara",
    empty: "Bu bölümde kategori yok.",
  },
};

export default tr;
