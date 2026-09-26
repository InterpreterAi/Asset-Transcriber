/**
 * Trial · Soniox X — sexual / vulgar interpreter pins.
 *
 * Rules:
 * - English ↔ Arabic translation targets are always Modern Standard Arabic (فصحى).
 * - Spoken dialect vulgar Arabic stays in the Original; pins map it to accurate English
 *   (never food/"eat") and never rewrite the original into فصحى.
 * - Bidirectional EN↔فصحى pins so either side of the pair forces the saved wording.
 * - Same English headwords are pinned for other priority languages with accurate targets.
 */

export type LangCode = "ar" | "es" | "pt" | "fr" | "de" | "pl" | "it" | "ja";

/** English → فصحى (translation column when English is spoken). */
export const EN_TO_MSA: { en: string; ar: string }[] = [
  // — clinical / sexual health (neutral فصحى) —
  { en: "penis", ar: "قضيب" },
  { en: "vagina", ar: "مهبل" },
  { en: "anus", ar: "شرج" },
  { en: "rectum", ar: "مستقيم" },
  { en: "breast", ar: "ثدي" },
  { en: "breasts", ar: "ثديان" },
  { en: "nipple", ar: "حلمة" },
  { en: "testicle", ar: "خصية" },
  { en: "testicles", ar: "خصيتان" },
  { en: "scrotum", ar: "صفن" },
  { en: "clitoris", ar: "بظر" },
  { en: "uterus", ar: "رحم" },
  { en: "ovary", ar: "مبيض" },
  { en: "sperm", ar: "نطاف" },
  { en: "semen", ar: "مني" },
  { en: "sexual intercourse", ar: "جماع" },
  { en: "intercourse", ar: "جماع" },
  { en: "sex", ar: "جنس" },
  { en: "oral sex", ar: "جنس فموي" },
  { en: "anal sex", ar: "جنس شرجي" },
  { en: "masturbation", ar: "استمناء" },
  { en: "erection", ar: "انتصاب" },
  { en: "ejaculation", ar: "قذف" },
  { en: "orgasm", ar: "نشوة جنسية" },
  { en: "lubricant", ar: "مزلق" },
  { en: "condom", ar: "واقي ذكري" },
  { en: "birth control", ar: "منع الحمل" },
  { en: "sexually transmitted disease", ar: "مرض منقول جنسياً" },
  { en: "sexually transmitted infection", ar: "عدوى منقولة جنسياً" },
  { en: "STD", ar: "مرض منقول جنسياً" },
  { en: "STI", ar: "عدوى منقولة جنسياً" },
  { en: "HIV", ar: "فيروس نقص المناعة البشرية" },
  { en: "AIDS", ar: "متلازمة نقص المناعة المكتسب" },
  { en: "rape", ar: "اغتصاب" },
  { en: "sexual assault", ar: "اعتداء جنسي" },
  { en: "sexual abuse", ar: "اعتداء جنسي" },
  { en: "molestation", ar: "تحرش جنسي" },
  { en: "harassment", ar: "تحرش" },
  { en: "sexual harassment", ar: "تحرش جنسي" },
  { en: "consent", ar: "موافقة" },
  { en: "incest", ar: "زنا المحارم" },
  { en: "prostitution", ar: "بغاء" },
  { en: "pornography", ar: "مواد إباحية" },
  { en: "pregnant", ar: "حامل" },
  { en: "pregnancy", ar: "حمل" },
  { en: "abortion", ar: "إجهاض" },
  { en: "miscarriage", ar: "إسقاط" },

  // — vulgar / curse (فصحى keeps the force; never euphemize) —
  { en: "fuck", ar: "نيك" },
  { en: "Fuck", ar: "نيك" },
  { en: "fucking", ar: "اللعين" },
  { en: "fucked", ar: "منكوح" },
  { en: "to fuck", ar: "أن ينيك" },
  { en: "get fucked", ar: "أن يُناك" },
  { en: "getting fucked", ar: "يُناك" },
  { en: "fuck you", ar: "اللعنة عليك" },
  { en: "fuck off", ar: "اذهب إلى الجحيم" },
  { en: "go fuck yourself", ar: "نيك نفسك" },
  { en: "motherfucker", ar: "ناكح أمه" },
  { en: "Motherfucker", ar: "ناكح أمه" },
  { en: "shit", ar: "خراء" },
  { en: "bullshit", ar: "هراء" },
  { en: "asshole", ar: "حقير" },
  { en: "ass", ar: "مؤخرة" },
  { en: "bitch", ar: "كلبة" },
  { en: "whore", ar: "عاهرة" },
  { en: "slut", ar: "عاهرة" },
  { en: "prostitute", ar: "مومس" },
  { en: "cunt", ar: "فرج" },
  { en: "dick", ar: "زبّ" },
  { en: "cock", ar: "زبّ" },
  { en: "pussy", ar: "كسّ" },
  { en: "balls", ar: "خصيتان" },
  { en: "bastard", ar: "ابن حرام" },
  { en: "son of a bitch", ar: "ابن الكلبة" },
  { en: "damn", ar: "اللعنة" },
  { en: "damn it", ar: "تباً" },
  { en: "goddamn", ar: "اللعين" },
  { en: "suck my dick", ar: "امتص زبي" },
  { en: "blow job", ar: "مصّ القضيب" },
  { en: "blowjob", ar: "مصّ القضيب" },
  { en: "hand job", ar: "استمناء يدوي" },
  { en: "handjob", ar: "استمناء يدوي" },
  { en: "cum", ar: "مني" },
  { en: "horny", ar: "مثير جنسياً" },
  { en: "naked", ar: "عاري" },
  { en: "nude", ar: "عاري" },
  { en: "What the fuck", ar: "ماذا بحق الجحيم" },
  { en: "what the fuck", ar: "ماذا بحق الجحيم" },
  { en: "What the fuck do you mean", ar: "ماذا تقصد بحق الجحيم" },
  { en: "What the fuck do you mean, bro", ar: "ماذا تقصد بحق الجحيم يا رجل" },
  { en: "What the fuck do you mean bro", ar: "ماذا تقصد بحق الجحيم يا رجل" },
];

/**
 * Dialect / vulgar Arabic originals → accurate English.
 * These are spoken forms that must stay in the Original column;
 * translation must NOT become "eat" or a soft euphemism.
 */
export const DIALECT_AR_TO_EN: { ar: string; en: string }[] = [
  // Egyptian — sexual verb (never "eat")
  { ar: "تتناك", en: "get fucked" },
  { ar: "يتناك", en: "get fucked" },
  { ar: "اتناك", en: "get fucked" },
  { ar: "تنتاك", en: "get fucked" },
  { ar: "تنيك", en: "fuck" },
  { ar: "ينيك", en: "fucks" },
  { ar: "أنيك", en: "I fuck" },
  { ar: "هنيك", en: "I'll fuck" },
  { ar: "هينيك", en: "he'll fuck" },
  { ar: "نتناك", en: "we get fucked" },
  { ar: "عايزة تتناك", en: "wanted to get fucked" },
  { ar: "عايز تتناك", en: "wanted to get fucked" },
  { ar: "عايزة تتناك.", en: "wanted to get fucked" },
  { ar: "بتتناك", en: "getting fucked" },
  { ar: "بيتناك", en: "getting fucked" },
  { ar: "متناك", en: "fucked" },
  { ar: "متناكة", en: "fucked" },
  { ar: "منيوك", en: "fucked" },
  { ar: "منيوكة", en: "fucked" },
  { ar: "منيكة", en: "fuck" },
  { ar: "نيك", en: "fuck" },
  { ar: "نايك", en: "fucking" },
  { ar: "زب", en: "dick" },
  { ar: "زبي", en: "my dick" },
  { ar: "زبّ", en: "dick" },
  { ar: "زبك", en: "your dick" },
  { ar: "كس", en: "pussy" },
  { ar: "كسّ", en: "pussy" },
  { ar: "كسمك", en: "your mother's pussy" },
  { ar: "كس امك", en: "your mother's pussy" },
  { ar: "كس أمك", en: "your mother's pussy" },
  { ar: "كس اختك", en: "your sister's pussy" },
  { ar: "عرص", en: "pimp" },
  { ar: "يا عرص", en: "you pimp" },
  { ar: "شرموطة", en: "whore" },
  { ar: "شرموط", en: "whore" },
  { ar: "قحبة", en: "whore" },
  { ar: "قحبه", en: "whore" },
  { ar: "ابن الوسخة", en: "son of a bitch" },
  { ar: "ابن الوسخه", en: "son of a bitch" },
  { ar: "ابن الكلب", en: "son of a bitch" },
  { ar: "ابن الحرام", en: "bastard" },
  { ar: "ابن الشرموطة", en: "son of a whore" },
  { ar: "يا ابن الكلب", en: "you son of a bitch" },
  { ar: "انعل أبوك", en: "damn your father" },
  { ar: "انعل امك", en: "damn your mother" },
  { ar: "انعل أمك", en: "damn your mother" },
  { ar: "انعل والديك", en: "damn your parents" },
  { ar: "يلعن دينك", en: "damn your religion" },
  { ar: "يلعن أبوك", en: "damn your father" },
  { ar: "يلعن روحك", en: "damn your soul" },
  { ar: "يخرب بيتك", en: "damn your house" },
  { ar: "خراء", en: "shit" },
  { ar: "خرا", en: "shit" },
  { ar: "طيز", en: "ass" },
  { ar: "طيزك", en: "your ass" },
  // Levantine (Syrian / Lebanese / Palestinian / Jordanian)
  { ar: "ينيكك", en: "fuck you" },
  { ar: "نيكك", en: "fuck you" },
  { ar: "تنيكك", en: "fuck you" },
  { ar: "تفو عليك", en: "spit on you" },
  { ar: "يا شرموطة", en: "you whore" },
  { ar: "يا قحبة", en: "you whore" },
  { ar: "يا كلب", en: "you dog" },
  // Gulf + Iraqi
  { ar: "كواد", en: "pimp" },
  { ar: "قواد", en: "pimp" },
  { ar: "شلك", en: "fuck off" },
  { ar: "انيكك", en: "I'll fuck you" },
  { ar: "يا حمار", en: "you donkey" },
  // Maghrebi (Moroccan / Algerian / Tunisian)
  { ar: "زامل", en: "faggot" },
  { ar: "زملة", en: "faggot" },
  { ar: "ولد القحبة", en: "son of a whore" },
  { ar: "ولد القحبه", en: "son of a whore" },
  { ar: "حتى فيك", en: "fuck you" },
  { ar: "نوض برّا", en: "get the fuck out" },
];

/** فصحى forms → English (so AR→EN pins vice versa). */
export const MSA_TO_EN: { ar: string; en: string }[] = EN_TO_MSA.map(({ en, ar }) => ({ ar, en }));

/** Same English headwords for other priority languages (accurate, not softened). */
export const EN_TO_OTHER: Record<Exclude<LangCode, "ar">, { en: string; tgt: string }[]> = {
  es: [
    { en: "fuck", tgt: "follar" },
    { en: "fucking", tgt: "maldito" },
    { en: "fucked", tgt: "jodido" },
    { en: "get fucked", tgt: "que te follen" },
    { en: "fuck you", tgt: "que te jodan" },
    { en: "motherfucker", tgt: "hijo de puta" },
    { en: "shit", tgt: "mierda" },
    { en: "bullshit", tgt: "mentira / mierda" },
    { en: "asshole", tgt: "hijo de puta" },
    { en: "bitch", tgt: "perra" },
    { en: "whore", tgt: "puta" },
    { en: "slut", tgt: "zorra" },
    { en: "cunt", tgt: "coño" },
    { en: "dick", tgt: "polla" },
    { en: "cock", tgt: "polla" },
    { en: "pussy", tgt: "coño" },
    { en: "bastard", tgt: "bastardo" },
    { en: "rape", tgt: "violación" },
    { en: "sexual assault", tgt: "agresión sexual" },
    { en: "condom", tgt: "condón" },
    { en: "penis", tgt: "pene" },
    { en: "vagina", tgt: "vagina" },
    { en: "intercourse", tgt: "coito" },
    { en: "oral sex", tgt: "sexo oral" },
    { en: "anal sex", tgt: "sexo anal" },
    { en: "masturbation", tgt: "masturbación" },
  ],
  pt: [
    { en: "fuck", tgt: "foder" },
    { en: "fucking", tgt: "maldito" },
    { en: "fucked", tgt: "fodido" },
    { en: "get fucked", tgt: "ser fodido" },
    { en: "fuck you", tgt: "vai se foder" },
    { en: "motherfucker", tgt: "filho da puta" },
    { en: "shit", tgt: "merda" },
    { en: "bullshit", tgt: "besteira" },
    { en: "asshole", tgt: "babaca" },
    { en: "bitch", tgt: "vadia" },
    { en: "whore", tgt: "puta" },
    { en: "slut", tgt: "piranha" },
    { en: "cunt", tgt: "buceta" },
    { en: "dick", tgt: "pau" },
    { en: "cock", tgt: "pau" },
    { en: "pussy", tgt: "buceta" },
    { en: "bastard", tgt: "filho da puta" },
    { en: "rape", tgt: "estupro" },
    { en: "sexual assault", tgt: "agressão sexual" },
    { en: "condom", tgt: "camisinha" },
    { en: "penis", tgt: "pênis" },
    { en: "vagina", tgt: "vagina" },
    { en: "intercourse", tgt: "relação sexual" },
    { en: "oral sex", tgt: "sexo oral" },
    { en: "anal sex", tgt: "sexo anal" },
    { en: "masturbation", tgt: "masturbação" },
  ],
  fr: [
    { en: "fuck", tgt: "baiser" },
    { en: "fucking", tgt: "foutu" },
    { en: "fucked", tgt: "baisé" },
    { en: "get fucked", tgt: "se faire baiser" },
    { en: "fuck you", tgt: "va te faire foutre" },
    { en: "motherfucker", tgt: "fils de pute" },
    { en: "shit", tgt: "merde" },
    { en: "bullshit", tgt: "conneries" },
    { en: "asshole", tgt: "connard" },
    { en: "bitch", tgt: "salope" },
    { en: "whore", tgt: "pute" },
    { en: "slut", tgt: "salope" },
    { en: "cunt", tgt: "chatte" },
    { en: "dick", tgt: "bite" },
    { en: "cock", tgt: "bite" },
    { en: "pussy", tgt: "chatte" },
    { en: "bastard", tgt: "bâtard" },
    { en: "rape", tgt: "viol" },
    { en: "sexual assault", tgt: "agression sexuelle" },
    { en: "condom", tgt: "préservatif" },
    { en: "penis", tgt: "pénis" },
    { en: "vagina", tgt: "vagin" },
    { en: "intercourse", tgt: "rapport sexuel" },
    { en: "oral sex", tgt: "sexe oral" },
    { en: "anal sex", tgt: "sexe anal" },
    { en: "masturbation", tgt: "masturbation" },
  ],
  de: [
    { en: "fuck", tgt: "ficken" },
    { en: "fucking", tgt: "verflucht" },
    { en: "fucked", tgt: "gefickt" },
    { en: "get fucked", tgt: "gefickt werden" },
    { en: "fuck you", tgt: "leck mich" },
    { en: "motherfucker", tgt: "Hurensohn" },
    { en: "shit", tgt: "Scheiße" },
    { en: "bullshit", tgt: "Bullshit" },
    { en: "asshole", tgt: "Arschloch" },
    { en: "bitch", tgt: "Schlampe" },
    { en: "whore", tgt: "Hure" },
    { en: "slut", tgt: "Schlampe" },
    { en: "cunt", tgt: "Fotze" },
    { en: "dick", tgt: "Schwanz" },
    { en: "cock", tgt: "Schwanz" },
    { en: "pussy", tgt: "Fotze" },
    { en: "bastard", tgt: "Bastard" },
    { en: "rape", tgt: "Vergewaltigung" },
    { en: "sexual assault", tgt: "sexueller Übergriff" },
    { en: "condom", tgt: "Kondom" },
    { en: "penis", tgt: "Penis" },
    { en: "vagina", tgt: "Vagina" },
    { en: "intercourse", tgt: "Geschlechtsverkehr" },
    { en: "oral sex", tgt: "Oralverkehr" },
    { en: "anal sex", tgt: "Analverkehr" },
    { en: "masturbation", tgt: "Masturbation" },
  ],
  pl: [
    { en: "fuck", tgt: "pierdolić" },
    { en: "fucking", tgt: "cholerny" },
    { en: "fucked", tgt: "wyruchany" },
    { en: "get fucked", tgt: "dostać wpierdol" },
    { en: "fuck you", tgt: "spierdalaj" },
    { en: "motherfucker", tgt: "skurwysyn" },
    { en: "shit", tgt: "gówno" },
    { en: "bullshit", tgt: "bzdury" },
    { en: "asshole", tgt: "dupek" },
    { en: "bitch", tgt: "suka" },
    { en: "whore", tgt: "kurwa" },
    { en: "slut", tgt: "dziwka" },
    { en: "cunt", tgt: "cipa" },
    { en: "dick", tgt: "kutas" },
    { en: "cock", tgt: "kutas" },
    { en: "pussy", tgt: "cipa" },
    { en: "bastard", tgt: "sukinsyn" },
    { en: "rape", tgt: "gwałt" },
    { en: "sexual assault", tgt: "napaść seksualna" },
    { en: "condom", tgt: "prezerwatywa" },
    { en: "penis", tgt: "penis" },
    { en: "vagina", tgt: "pochwa" },
    { en: "intercourse", tgt: "stosunek seksualny" },
    { en: "oral sex", tgt: "seks oralny" },
    { en: "anal sex", tgt: "seks analny" },
    { en: "masturbation", tgt: "masturbacja" },
  ],
  it: [
    { en: "fuck", tgt: "fottere" },
    { en: "fucking", tgt: "fottuto" },
    { en: "fucked", tgt: "fottuto" },
    { en: "get fucked", tgt: "farsi fottere" },
    { en: "fuck you", tgt: "vaffanculo" },
    { en: "motherfucker", tgt: "figlio di puttana" },
    { en: "shit", tgt: "merda" },
    { en: "bullshit", tgt: "stronzate" },
    { en: "asshole", tgt: "stronzo" },
    { en: "bitch", tgt: "troia" },
    { en: "whore", tgt: "puttana" },
    { en: "slut", tgt: "sgualdrina" },
    { en: "cunt", tgt: "figa" },
    { en: "dick", tgt: "cazzo" },
    { en: "cock", tgt: "cazzo" },
    { en: "pussy", tgt: "figa" },
    { en: "bastard", tgt: "bastardo" },
    { en: "rape", tgt: "stupro" },
    { en: "sexual assault", tgt: "aggressione sessuale" },
    { en: "condom", tgt: "preservativo" },
    { en: "penis", tgt: "pene" },
    { en: "vagina", tgt: "vagina" },
    { en: "intercourse", tgt: "rapporto sessuale" },
    { en: "oral sex", tgt: "sesso orale" },
    { en: "anal sex", tgt: "sesso anale" },
    { en: "masturbation", tgt: "masturbazione" },
  ],
  ja: [
    { en: "fuck", tgt: "ファック" },
    { en: "fucking", tgt: "ふざけた" },
    { en: "fucked", tgt: "やられた" },
    { en: "get fucked", tgt: "犯される" },
    { en: "fuck you", tgt: "くそくらえ" },
    { en: "motherfucker", tgt: "くそったれ" },
    { en: "shit", tgt: "くそ" },
    { en: "bullshit", tgt: "うそっぱち" },
    { en: "asshole", tgt: "くそ野郎" },
    { en: "bitch", tgt: "ビッチ" },
    { en: "whore", tgt: "売春婦" },
    { en: "slut", tgt: "やりまん" },
    { en: "cunt", tgt: "まんこ" },
    { en: "dick", tgt: "ちんこ" },
    { en: "cock", tgt: "ちんこ" },
    { en: "pussy", tgt: "まんこ" },
    { en: "bastard", tgt: "野郎" },
    { en: "rape", tgt: "強姦" },
    { en: "sexual assault", tgt: "性的暴行" },
    { en: "condom", tgt: "コンドーム" },
    { en: "penis", tgt: "陰茎" },
    { en: "vagina", tgt: "膣" },
    { en: "intercourse", tgt: "性交" },
    { en: "oral sex", tgt: "オーラルセックス" },
    { en: "anal sex", tgt: "アナルセックス" },
    { en: "masturbation", tgt: "自慰" },
  ],
};

/** Regex of dialect sexual Arabic that Soniox often mis-hears as "eat". */
export const SEXUAL_AR_RE = new RegExp(
  [
    "تتناك",
    "يتناك",
    "اتناك",
    "تنتاك",
    "تنيك",
    "ينيك",
    "أنيك",
    "هنيك",
    "هينيك",
    "نتناك",
    "بتتناك",
    "بيتناك",
    "متناك",
    "متناكة",
    "منيوك",
    "منيوكة",
    "ينيكك",
    "نيكك",
    "تنيكك",
    "انيكك",
  ].join("|"),
);

export function sexualVulgarPinPairs(langA: string, langB: string): { source: string; target: string }[] {
  const a = (langA || "").split("-")[0]?.toLowerCase() ?? "";
  const b = (langB || "").split("-")[0]?.toLowerCase() ?? "";
  const out: { source: string; target: string }[] = [];
  const seen = new Set<string>();
  const add = (source: string, target: string) => {
    const s = source.trim();
    const t = target.trim();
    if (!s || !t) return;
    const k = `${s.toLowerCase()}->${t}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ source: s, target: t });
  };

  const hasAr = a === "ar" || b === "ar";
  if (hasAr) {
    for (const { en, ar } of EN_TO_MSA) {
      add(en, ar);
      add(ar, en);
    }
    for (const { ar, en } of DIALECT_AR_TO_EN) {
      // Dialect → English only (never English → dialect).
      add(ar, en);
    }
  }

  for (const lang of Object.keys(EN_TO_OTHER) as Exclude<LangCode, "ar">[]) {
    if (a !== lang && b !== lang) continue;
    for (const { en, tgt } of EN_TO_OTHER[lang]) {
      add(en, tgt);
      add(tgt, en);
    }
  }

  return out;
}

/** Rows to merge into interpreter-glossary.json `en-<lang>` packs. */
export function sexualVulgarGlossaryRowsForLang(lang: LangCode): { en: string; [k: string]: string }[] {
  if (lang === "ar") {
    return EN_TO_MSA.map(({ en, ar }) => ({ en, ar }));
  }
  return EN_TO_OTHER[lang].map(({ en, tgt }) => ({ en, [lang]: tgt }));
}
