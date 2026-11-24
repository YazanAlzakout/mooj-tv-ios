# ملاحظات الإصدار — 2.1 (versionCode 20 / TV 21)

انسخ الكتلة أدناه كما هي إلى حقل «ملاحظات الإصدار» في Play Console. الوسوم
جزء من صيغة بلاي وهو يقرأها ويُوزّع كل نصّ على لغته.

اعرض فقط اللغات التي تدعمها صفحة تطبيقك في المتجر — بلاي يرفض وسماً لِلغة غير
مُضافة إلى الصفحة.

---

## للصقها في Play Console

```
<ar>
• إصلاح تقطيش الصوت أثناء تشغيل القنوات وتغييرها
• التحكّم بالصوت والإضاءة عبر السحب: تصميم جديد على جانب الشاشة، وسحبة واحدة تكفي من الصفر إلى المئة
• إزالة التدرّجات السوداء من فوق الصورة وصور الأعمال
• رسائل واضحة تشرح سبب توقّف البثّ، بدل أرقام الأخطاء
• عند إعادة الهاتف إلى الوضع العمودي تعود قائمة القنوات
• قوائم أسرع وبلا تعليق
• قائمة المسارات الصوتية والترجمات بالعربية كاملةً
• تنبيه داخل التطبيق عند توفّر تحديث جديد
</ar>
<en-US>
• Fixed the audio crackling while watching and changing channels
• Volume and brightness by swipe: a new design at the side of the screen, and one swipe covers the full range
• Removed the black gradients over the picture and the artwork
• Clear messages explaining why a stream stopped, instead of error codes
• Turning the phone upright brings the channel list back
• Faster lists, with no freezing
• Audio and subtitle picker fully translated
• A notice when a new version is available
</en-US>
<fr-FR>
• Correction des craquements audio pendant la lecture et le changement de chaîne
• Volume et luminosité par glissement : nouveau design sur le côté de l'écran, un seul geste suffit
• Suppression des dégradés noirs sur l'image et les affiches
• Messages clairs expliquant l'arrêt d'un flux, au lieu de codes d'erreur
• Le téléphone à la verticale ramène la liste des chaînes
• Listes plus rapides, sans blocage
• Sélecteur de pistes entièrement traduit
• Notification lors d'une nouvelle version
</fr-FR>
<tr-TR>
• Kanal izlerken ve değiştirirken oluşan ses çıtırtısı giderildi
• Kaydırmayla ses ve parlaklık: ekranın kenarında yeni bir tasarım ve artık tek kaydırma tüm aralığı kapsıyor
• Görüntünün ve afişlerin üzerindeki siyah geçişler kaldırıldı
• Yayının neden durduğunu açıklayan net mesajlar, hata numaraları yerine
• Telefonu dikey konuma getirmek kanal listesini geri getirir
• Daha hızlı listeler, donma yok
• Ses ve altyazı seçici tamamen çevrildi
• Yeni sürüm çıktığında uygulama içi bildirim
</tr-TR>
```

---

## الكرديتان

بلاي **لا يدعم** الكردية كلغة لصفحة المتجر، فلا موضع لهما هناك. أُدرجهما هنا إن
أردتهما لرسالة إلى زبائنك أو لسجلّ تغييرات داخل التطبيق لاحقاً.

**كرمانجي (ku)**

```
• Çirçira dengê di dema temaşekirin û guhertina kanalan de hate serrast kirin
• Deng û ronahî bi paldanê: sêwirandineke nû li kêleka ekranê, û niha paldaneke tenê tevahiya rêzê digire
• Tarîbûnên reş ên li ser wêne û posteran hatin rakirin
• Peyamên zelal ên ku diyar dikin çima weşan rawestiye, li şûna hejmarên xeletiyê
• Vegerandina telefonê bo pozîsyona rast lîsteya kanalan vedigerîne
• Lîsteyên bilez, bêyî qutbûn
• Hilbijêrê rêça deng û binnivîsan bi tevahî hate wergerandin
• Agahdariyek di nav sepanê de gava guhertoyeke nû heye
```

**سوراني (ckb)**

```
• چاککردنی تەقەتەقی دەنگ لە کاتی سەیرکردن و گۆڕینی کەناڵەکان
• کۆنتڕۆڵی دەنگ و ڕووناکی بە ڕاکێشان: دیزاینێکی نوێ لە لای شاشە، و ئێستا یەک ڕاکێشان تەواوی مەودا دەگرێت
• لابردنی ئەو ڕەشییە زیادەکان لەسەر وێنە و پۆستەرەکان
• پەیامی ڕوون کە هۆکاری وەستانی پەخش ڕوون دەکاتەوە، لە جیاتی ژمارەی هەڵە
• گەڕانەوەی مۆبایل بۆ دۆخی ستوونی لیستی کەناڵەکان دەگەڕێنێتەوە
• لیستی خێراتر، بێ ڕاوەستان
• هەڵبژێری ڕێڕەوی دەنگ و ژێرنووس بە تەواوی وەرگێردراوە
• ئاگادارکردنەوە لە ناو ئەپەکە کاتێک وەشانێکی نوێ بەردەستە
```

---

## ما تُرك خارج الملاحظات، بقصد

عمل هذين اليومَين أكبر من هذا بكثير، لكن حقل بلاي محدود بـ ٥٠٠ حرف للغة، والقائمة
الطويلة لا تُقرأ. فاستُبعد ما لا يلمسه المستخدم أو ما لا يفهمه:

- إصلاحات داخلية في مكتبة التشغيل (التركيز الصوتي، تسرّب الاتصالات)
- إصلاح طريقَين لتجميد التطبيق عند الإقلاع — لا يُذكر لأن من أصابه لم يعرف السبب
- إظهار اسم المستخدم في الإعدادات وتحديث عدّاد الاتصالات
- تحسينات نسخة التلفاز (حواشي الشاشة، القوائم) — لها إصدارها الخاص
- أزرار مشغّل الأفلام التي كانت تُلغى عند دوران الإصبع — مذكورة ضمناً في «قوائم أسرع»

إن أردت ذكر أيٍّ منها صراحةً فأضفه، لكن الأربعة الأولى في القائمة هي ما سيلاحظه
زبونك فعلاً.
