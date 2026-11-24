# رفع Mooj TV على Google Play

كل رقم وكل ادّعاء بهالملف مقروء من المشروع نفسه بتاريخ 2026-11-17، مش محفوظ عن ظهر قلب.
لما يتغيّر شي بالمشروع، هالملف بيصير غلط — صلّحه، لا تشتغل عليه كما هو.

---

## ١ · ما هو جاهز فعلاً

| | القيمة | من وين |
|---|---|---|
| اسم الحزمة | `com.moojtv.player` | `brand.config.js` |
| versionCode / versionName | `3` / `1.1` | `android/app/build.gradle:95-96` |
| targetSdk / minSdk | `36` / `26` | البيان المدموج |
| المعماريات | `armeabi-v7a`, `arm64-v8a` فقط | `plugins/withAbiFilters.js` |
| مفتاح الرفع | `CN=Mooj TV, O=Mooj TV` | `D:/Projects/mooj-keys/mooj-upload.jks` |
| بصمة SHA-256 | `a6:29:a3:85:be:c9:15:e8:43:fd:22:79:db:d8:06:ea:42:a1:d0:48:07:90:01:09:ae:60:08:71:5c:c0:03:f8` | `apksigner verify` على بناء اليوم |

**المعماريات ليست سهواً.** وحدة فك ترميز MP2 (`modules/decoder-ffmpeg-mp2`) مبنيّة لهاتين المعماريتين فقط.
لو شُحنت x86 و x86_64 لنزلت بلا `libffmpegJNI.so`، فتشتغل القناة صورة بلا صوت وبلا أي رسالة خطأ —
على صناديق Google TV بمعالج x86، وعلى Chromebook، وعلى المحاكي الذي يشغّل Google تقرير ما قبل الإطلاق عليه.
إسقاطهما يجعل الفشل صادقاً: جهاز غير مدعوم يرفض التثبيت بدل أن يثبّت شيئاً نصف شغّال.

**الصلاحيات في البيان المدموج — ١١، كلها مبرّرة** (`node tools/verify-brand.js` يفحصها في كل مرة):

`INTERNET` · `ACCESS_NETWORK_STATE` · `ACCESS_WIFI_STATE` · `FOREGROUND_SERVICE` ·
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` · `WAKE_LOCK` · `MODIFY_AUDIO_SETTINGS` · `VIBRATE` ·
`USE_BIOMETRIC` · `USE_FINGERPRINT` · `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`

`SYSTEM_ALERT_WINDOW` مطروحة بـ`tools:node="remove"` ولا تُشحن — وهذه أكثر صلاحية يسأل عنها مراجع Play.
`USE_BIOMETRIC` و`USE_FINGERPRINT` تأتيان مع `expo-secure-store`؛ التطبيق لا يستدعي بصمة أبداً.

---

## ٢ · أمر بناء ملف الرفع

Play يريد **AAB**، لا APK:

```bash
cd /d D:\Projects\mooj-tv && android\gradlew.bat -p android bundleRelease
```

الناتج: `android/app/build/outputs/bundle/release/app-release.aab`

تحقّق قبل الرفع — توقيع v2 على الـAAB:

```bash
cd /d D:\Projects\mooj-tv && jarsigner -verify -verbose:summary android\app\build\outputs\bundle\release\app-release.aab
```

لو ظهر `CN=Android Debug` بدل `CN=Mooj TV`، فإن `~/.gradle/gradle.properties` لم تُقرأ وقد بُني الملف
بمفتاح التصحيح — Play سيرفضه. الشرط في `android/app/build.gradle:123` يسقط إلى مفتاح التصحيح بصمت.

**تحقّقتُ من هذا فعلياً يوم 2026-11-17** على نسخة الإصدار المبنيّة في ذلك اليوم، لا افتراضاً:

```
Signer #1 certificate DN: CN=Mooj TV, O=Mooj TV
Signer #1 certificate SHA-256 digest:
  a629a385bec915e843fd2279dbd806ea42a1d04807900109ae6008715cc003f8
```

هذه البصمة هي القيمة المرجعيّة: أي بناء لاحق يعطي بصمة مختلفة فقد وُقّع بمفتاح آخر، وProject
upload key عند Google يُربط بأول ملف تُحمّله — فلا يمكن تغييره بعدها إلا بطلب إعادة تعيين منهم.

المفتاح نفسه في `D:Projectsmooj-keysmooj-upload.jks` وكلماته في `~/.gradle/gradle.properties`،
أي **خارج المستودع** — فلا يدخل git ولا ينتقل مع نسخة من المشروع. احتفظ بنسخة منه في مكان ثانٍ:
ضياعه يعني أن أي تحديث مستقبلي للتطبيق يحتاج تدخّل Google.

للتحقّق بأداة أدقّ من jarsigner (تقرأ v2/v3 مباشرة):

```bash
cd /d D:Projectsmooj-tv && D:Sdkuild-tools.0.0apksigner.bat verify --print-certs androidappuildoutputsapkeleaseapp-release.apk
```

---

## ٣ · نصّ القائمة

**ممنوع بشكل قاطع** في أي حقل من حقول القائمة أو في أي لقطة: اسم قناة، شعار محطة، ملصق فيلم،
أي كلمة توحي بمحتوى مجاني أو بمكتبة يوفّرها التطبيق. التطبيق **مشغّل**، والمحتوى يأتي من اشتراك
يملكه المستخدم. هذا ليس تجميلاً للصياغة — هو الفرق بين تطبيق يبقى على المتجر وتطبيق يُسحب عند
أول شكوى حقوق.

### العنوان (٣٠ حرفاً كحد أقصى)

```
Mooj TV
```

### الوصف القصير (٨٠ حرفاً كحد أقصى)

بالعربية:
```
مشغّل IPTV لاشتراكك الخاص — قنوات وأفلام ومسلسلات في مكان واحد.
```

بالإنجليزية:
```
An IPTV player for your own subscription — channels, films and series.
```

### الوصف الكامل

بالعربية:
```
Mooj TV مشغّل للاشتراكات التي تملكها.

التطبيق يصل فارغاً. تُدخل عنوان خادم مزوّدك واسم المستخدم وكلمة المرور، فيعرض لك ما يرسله
ذلك الاشتراك — لا أكثر. لا يأتي التطبيق بأي محتوى معه، ولا يوفّر اشتراكات، ولا يرتبط بأي
مزوّد بعينه.

ما يقدّمه:
• تصفّح القنوات والأفلام والمسلسلات في واجهة واحدة
• متابعة من حيث توقّفت، وتشغيل الحلقة التالية تلقائياً
• مفضّلة وقائمة «شاهد لاحقاً» وسجلّ مشاهدة
• تنزيل للمشاهدة دون اتصال، حيثما سمح المزوّد بذلك
• قفل أبوي برقم سري، وإخفاء فئات كاملة
• ست لغات: العربية والإنجليزية والفرنسية والتركية والكردية (الكرمانجية والسورانية)
• سمة داكنة وفاتحة

الخصوصية: لا يملك مطوّرو التطبيق أي خادم، والتطبيق لا يتّصل بأي خادم سواه ما تُدخله أنت.
بيانات دخولك تُحفظ في مخزن المفاتيح المشفّر على جهازك، ولا تغادره إلا إلى الخادم الذي اخترته.
لا إعلانات، ولا تتبّع، ولا تحليلات.

إشعارات حقوق النشر: support@mooj-player.com
سياسة الخصوصية: https://mooj-player.com/privacy.html
```

بالإنجليزية:
```
Mooj TV is a player for a subscription you already own.

It arrives empty. You enter your provider's server address, your username and your password,
and it shows you what that subscription sends — nothing else. The app ships with no content,
sells no subscriptions, and is not affiliated with any provider.

What it does:
• Browse channels, films and series in one place
• Resume where you stopped, and play the next episode automatically
• Favourites, a watch-later list and a watch history
• Download for offline viewing, where your provider allows it
• A parental PIN, and the ability to hide whole categories
• Six languages: Arabic, English, French, Turkish, Kurdish (Kurmanji and Sorani)
• Dark and light themes

Privacy: the developers operate no server, and the app contacts none but the one you enter.
Your credentials are kept in your device's encrypted keystore and leave it only for the server
you chose. No ads, no tracking, no analytics.

Copyright notices: support@mooj-player.com
Privacy policy: https://mooj-player.com/privacy.html
```

---

## ٤ · الصور — المقاسات بالضبط

| | المقاس | العدد |
|---|---|---|
| أيقونة التطبيق | 512 × 512 PNG, 32-bit | ١ |
| الرسم المميّز (Feature graphic) | 1024 × 500 PNG أو JPG | ١ |
| لقطات الهاتف | ضلع قصير ≥ 320px، ضلع طويل ≤ 3840px، نسبة بين 16:9 و 9:16 | ٢ على الأقل، ٨ كحد أقصى |

لقطات الجهاز الحالي 1080×2400 وهي مقبولة كما هي.

**خذ كل لقطة من حساب التجربة النظيف**، لا من حسابك. أول ما يفتحه المراجع هو صفحة القائمة،
وشعار محطة واحد في لقطة واحدة هو كل ما يلزم ليقرأ التطبيق على أنه شيء آخر.

---

## ٥ · نموذج أمان البيانات (Data safety)

الوقائع، مقروءة من المشروع:

- لا تحليلات، ولا تقارير انهيار، ولا إعلانات، ولا أي SDK طرف ثالث يرسل شيئاً. (`package.json`)
- لا خادم للمطوّر. حركة الشبكة الوحيدة هي إلى الخادم الذي يكتبه المستخدم.
- بيانات الدخول في `expo-secure-store` (مخزن مفاتيح أندرويد)، لا في SQLite. (`src/core/storage/secureCredentials.ts`)
- كل ما عدا ذلك — المزوّدون، المفضّلة، السجلّ، التنزيلات، الرقم السري، الإعدادات — في قاعدة
  بيانات محلّية على الجهاز.

الإجابات الموصى بها:

| السؤال | الإجابة | السبب |
|---|---|---|
| هل تجمع أو تشارك بيانات؟ | **نعم** | اسم المستخدم وكلمة المرور ينتقلان عن الجهاز إلى خادم المزوّد |
| النوع | Personal info → **User IDs** | هذا أقرب نوع في قائمة Google لاسم مستخدم الاشتراك |
| مجموعة أم مشاركة؟ | **Collected**, not shared | لا تذهب إلى أي طرف ثالث؛ تذهب إلى الخدمة التي اختارها المستخدم |
| إلزامية أم اختيارية؟ | **Required** | بدونها لا يعمل التطبيق إطلاقاً |
| الغرض | **App functionality** فقط | |
| مشفّرة أثناء النقل؟ | **حسب المزوّد** — لا تدّعِ «نعم» | البانلات تعمل على HTTP كثيراً؛ ادّعاء TLS غير صحيح هو ادّعاء كاذب في النموذج |
| يمكن للمستخدم طلب الحذف؟ | **نعم** | حذف المزوّد من التطبيق يمحو بياناته، وهذا موثّق في سياسة الخصوصية |

الجواب البديل — «لا تُجمع أي بيانات» — له حجّة: المطوّر لا يجمع شيئاً. لكن تعريف Play للجمع هو
«تنتقل عن الجهاز»، وبيانات الدخول تنتقل. الإجابة المحافظة لا تكلّف شيئاً، والإجابة الخاطئة في هذا
النموذج سبب معروف للسحب بعد النشر.

---

## ٦ · تصنيف المحتوى

التطبيق مشغّل لا يحمل محتوى، لكن الاستبيان يسأل عن ما **يمكن** عرضه. أجب بصدق:
محتوى ينشئه المستخدم أو طرف ثالث غير خاضع لإشراف المطوّر، بلا إعلانات، بلا مشتريات داخل التطبيق،
بلا مشاركة موقع، بلا تواصل بين المستخدمين.

---

## ٧ · وصول التطبيق (App access)

Play يطلب بيانات دخول شغّالة. أعطِه:

- عنوان الخادم: `albasera-tv.net`
- اسم المستخدم وكلمة المرور: الحساب المخصّص للمراجعة
- وفي حقل التعليمات: أن التطبيق يصل فارغاً، وأن هذه البيانات تُدخل في شاشة «إضافة مزوّد».

**اجعل الاسم وكلمة المرور عشوائيين بطول ١٠–١٢ خانة.** الاشتراك يسمح بثلاثة اتصالات فقط؛ لو عثر
عليه أحد غيرك شغلها، فسيرى المراجع «الاشتراك مستعمل في مكان آخر» ويُرفض التطبيق على خطأ تقني
لا علاقة له بالمحتوى. `test`/`test315` من أول ما يجرّبه أي فاحص.

---

## ٨ · باقي النماذج

| | |
|---|---|
| إعلانات | **لا** |
| مشتريات داخل التطبيق | **لا** |
| الجمهور المستهدف | ١٨+ |
| فئة التطبيق | Entertainment |
| سياسة الخصوصية | `https://mooj-player.com/privacy.html` — تأكّد أنها تفتح فعلاً قبل الإرسال |
| البريد | `support@mooj-player.com` — لازم يكون شغّالاً ويستقبل |

---

## ٩ · ملاحظات الإصدار الأول

بالعربية:
```
الإصدار الأول من Mooj TV.
```

---

## ١٠ · ما ليس ممكناً اليوم

**ملف App Store.** المشروع أندرويد فقط: لا مجلد `ios`، ولا إعدادات iOS في `app.config.js`، ووحدة
`decoder-ffmpeg-mp2` مبنيّة لأندرويد وحدها بلا `podspec`. بناء iOS يحتاج ماك و Xcode (أو EAS Build)،
وحساب Apple Developer، وبناء FFmpeg من المصدر لمعماريات آبل. هذا مشروع قائم بذاته، لا ملف ثانٍ من
نفس البناء.
