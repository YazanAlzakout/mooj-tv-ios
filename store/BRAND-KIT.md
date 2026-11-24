# Mooj TV — raw materials

كل الملفات تحت `store/`. الألوان والخطوط مقروءة من كود التطبيق نفسه، مو مختارة لهالملف.

---

## الصور الخام — `store/raw/`

| الملف | المقاس | الوصف |
|---|---|---|
| `logo-512-transparent.png` | 512×512 | الكرة، خلفية شفّافة. هذا هو الأساس لأي بنر |
| `mark-2048-transparent.png` | 2048×2048 | نفس الكرة بدقّة أعلى — استعمله لو بدك تكبّر |
| `icon-512-opaque.png` | 512×512 | أيقونة التطبيق، بدون شفافية (هذا يلي بينرفع على Play) |
| `splash-mark-1024.png` | 1024×1024 | نسخة شاشة البداية |

## الخطوط — `store/raw/fonts/`

> هذه نسخة من `assets/fonts/` داخل المشروع، موضوعة هنا ليُسلَّم المجلّد كاملاً.
> المستودع لا يحفظها مرتين، فإن وجدتها ناقصة بعد استنساخ نظيف فانسخها من `assets/fonts/`.

**Noto Kufi Arabic**، تسع أوزان. هذا الخط الوحيد يلي بيستعمله التطبيق، وفحصت جدول المحارف
تبعه: بيغطّي اللاتيني والأرقام والنقطة الوسطى `·` والشرطة الطويلة `—` كلها. يعني الإنكليزي
والعربي بينكتبوا بنفس الخط، وهيك البنر بيطلع من نفس عائلة التطبيق مو شبيه فيها.

للبنرات استعملت: **Black** للاسم، **Regular** للسطور تحته.

## الألوان

| | القيمة | من وين |
|---|---|---|
| الخلفية | `#0A0A0F` | `darkColors.background` — خلفية نافذة التطبيق وشاشة البداية |
| الأزرق الأساسي | `#1989C6` | `Brand.primary` |
| أزرق فاتح | `#3EB9EB` | `Brand.primaryLight` |
| أزرق غامق | `#021753` | `Brand.primaryDark` |
| نص أبيض | `#FFFFFF` | |
| نص ثانوي | `#9CA3AF` | `C.textSecondary` |

الوهج بالبنرات: `#1989C6` بشفافية ٢٠٪ كحد أقصى بالنص، بيخفت لصفر قبل الحواف.

## الاسم

يُكتب **`Mooj TV`** هيك بالضبط — لا `MOOJ TV` ولا `mooj tv`. السبب مكتوب بـ`brand.config.js`:
العلامة جنبه مكتوبة بهالشكل، وعنوان بحروف كبيرة جنبها بيعمل علامتين تجاريتين من وحدة.

---

## النصوص — إنكليزي، ميزات فقط

**ولا مرة تُذكر عبارة IPTV player.**

سطر واحد:
```
Channels, films and series in one place.
```

شريط ميزات:
```
6 languages  ·  Offline downloads  ·  Parental lock  ·  Phone & Android TV
```

الميزات كاملة — كلها موجودة فعلاً بالتطبيق، ما في ولا وحدة مكتوبة للزينة:

```
Channels, films and series in one interface
Continue watching, with the next episode queued automatically
Favourites, Watch later, and a full watch history
Offline downloads
Parental lock with a PIN, and whole categories hidden from view
Six languages: Arabic, English, French, Turkish, Kurmanji, Sorani
Dark and light themes
One codebase, two builds: phone and Android TV
Credentials kept in the device keystore. No ads, no tracking, no analytics
```

للبورتفوليو (التقنيات):
```
React Native · Expo 57 · expo-router · Reanimated 4 · SQLite · expo-video
Android phone + Android TV from a single codebase
Six locales, right-to-left first
```

---

## البنرات الجاهزة — `store/banners/`

| الملف | المقاس | لوين |
|---|---|---|
| `ad-square-1080x1080.png` | 1080×1080 | إنستغرام وفيسبوك |
| `ad-story-1080x1920.png` | 1080×1920 | ستوري وحالة واتساب |
| `ad-wide-1200x628.png` | 1200×628 | معاينة الروابط |
| `feature-graphic-1024x500.png` | 1024×500 | غلاف Google Play — مقاس إلزامي، بدون شفافية |

السكربت يلي ولّدها: `scratchpad/tools/banners.ps1` (GDI+، مو متصفّح — عشان المقاس يطلع
بالبكسل بالضبط والخط يكون خط التطبيق).

---

## ناقص

**لقطات الشاشة.** ما قدرت آخدها، لسببين:

1. البناء واقف. غرادل بيطلع `Unable to establish loopback connection` — الدايمون بيشتغل
   والعميل ما بيقدر يفتح سوكيت عليه. جرّبت إيقاف الدايمون، وبناء بلا دايمون، وإجبار IPv4،
   وكلهن فشلوا. فحصت الجهاز: المنافذ مو مستهلكة (٢٤٢ اتصال)، ولا عندك مدى محجوز، وnode
   بيفتح loopback على IPv4 وIPv6 بلا مشكلة — يعني المشكلة بجافا تحديداً. غالباً مضادّ فيروسات
   صار يحجب java.exe. إعادة تشغيل الجهاز بتحلّها بالعادة.
2. التلفون مو موصول (`no devices/emulators found`).

والنسخة المنصّبة عندك هلق من قبل الـ٣٧ إصلاح، فلقطاتها بتكون لنسخة قديمة.
