/** Prepare marketing-reel lines for ElevenLabs — digits as spoken words, no vocalized symbols. */

const EN_DIGIT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"] as const;
const ES_DIGIT = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"] as const;
const FR_DIGIT = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"] as const;
const DE_DIGIT = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"] as const;
const IT_DIGIT = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove"] as const;
const PT_DIGIT = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"] as const;
const NL_DIGIT = ["nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen"] as const;
const PL_DIGIT = ["zero", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć"] as const;
const RU_DIGIT = ["ноль", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"] as const;
const UK_DIGIT = ["нуль", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"] as const;
const TR_DIGIT = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"] as const;
const AR_DIGIT = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"] as const;
const HE_DIGIT = ["אפס", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע"] as const;
const HI_DIGIT = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ"] as const;
const BN_DIGIT = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়"] as const;
const TA_DIGIT = ["பூஜ்ஜியம்", "ஒன்று", "இரண்டு", "மூன்று", "நான்கு", "ஐந்து", "ஆறு", "ஏழு", "எட்டு", "ஒன்பது"] as const;
const TE_DIGIT = ["సున్నా", "ఒకటి", "రెండు", "మూడు", "నాలుగు", "ఐదు", "ఆరు", "ఏడు", "ఎనిమిది", "తొమ్మిది"] as const;
const ZH_DIGIT = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const JA_DIGIT = ["ゼロ", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const KO_DIGIT = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"] as const;
const VI_DIGIT = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"] as const;
const TH_DIGIT = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"] as const;
const ID_DIGIT = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"] as const;
const SV_DIGIT = ["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio"] as const;
const DA_DIGIT = ["nul", "en", "to", "tre", "fire", "fem", "seks", "syv", "otte", "ni"] as const;
const NO_DIGIT = ["null", "en", "to", "tre", "fire", "fem", "seks", "syv", "åtte", "ni"] as const;
const FI_DIGIT = ["nolla", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän"] as const;
const EL_DIGIT = ["μηδέν", "ένα", "δύο", "τρία", "τέσσερα", "πέντε", "έξι", "επτά", "οκτώ", "εννέα"] as const;
const HU_DIGIT = ["nulla", "egy", "kettő", "három", "négy", "öt", "hat", "hét", "nyolc", "kilenc"] as const;
const RO_DIGIT = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"] as const;
const CS_DIGIT = ["nula", "jedna", "dva", "tři", "čtyři", "pět", "šest", "sedm", "osm", "devět"] as const;
const SK_DIGIT = ["nula", "jeden", "dva", "tri", "štyri", "päť", "šesť", "sedem", "osem", "deväť"] as const;
const HR_DIGIT = ["nula", "jedan", "dva", "tri", "četiri", "pet", "šest", "sedam", "osam", "devet"] as const;
const SR_DIGIT = HR_DIGIT;
const SL_DIGIT = ["nič", "ena", "dva", "tri", "štiri", "pet", "šest", "sedem", "osem", "devet"] as const;
const BG_DIGIT = ["нула", "едно", "две", "три", "четири", "пет", "шест", "седем", "осем", "девет"] as const;
const LT_DIGIT = ["nulis", "vienas", "du", "trys", "keturi", "penki", "šeši", "septyni", "aštuoni", "devyni"] as const;
const LV_DIGIT = ["nulle", "viens", "divi", "trīs", "četri", "pieci", "seši", "septiņi", "astoņi", "deviņi"] as const;
const ET_DIGIT = ["null", "üks", "kaks", "kolm", "neli", "viis", "kuus", "seitse", "kaheksa", "üheksa"] as const;
const IS_DIGIT = ["núll", "einn", "tveir", "þrír", "fjórir", "fimm", "sex", "sjö", "átta", "níu"] as const;
const SQ_DIGIT = ["zero", "një", "dy", "tre", "katër", "pesë", "gjashtë", "shtatë", "tetë", "nëntë"] as const;
const SW_DIGIT = ["sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa"] as const;
const AM_DIGIT = ["ዜሮ", "አንድ", "ሁለት", "ሦስት", "አራት", "አምስት", "ስድስት", "ሰባት", "ስምንት", "ዘጠኝ"] as const;

/** ISO 639-1 base → spoken digit names (0–9). Unlisted langs fall back to English. */
const DIGIT_BY_LANG: Record<string, readonly string[]> = {
  en: EN_DIGIT,
  es: ES_DIGIT,
  ca: ES_DIGIT,
  gl: ES_DIGIT,
  fr: FR_DIGIT,
  de: DE_DIGIT,
  it: IT_DIGIT,
  pt: PT_DIGIT,
  nl: NL_DIGIT,
  pl: PL_DIGIT,
  ru: RU_DIGIT,
  uk: UK_DIGIT,
  tr: TR_DIGIT,
  ar: AR_DIGIT,
  fa: AR_DIGIT,
  ur: AR_DIGIT,
  ps: AR_DIGIT,
  ku: AR_DIGIT,
  he: HE_DIGIT,
  hi: HI_DIGIT,
  mr: HI_DIGIT,
  gu: HI_DIGIT,
  pa: HI_DIGIT,
  bn: BN_DIGIT,
  ta: TA_DIGIT,
  te: TE_DIGIT,
  kn: HI_DIGIT,
  ml: HI_DIGIT,
  zh: ZH_DIGIT,
  ja: JA_DIGIT,
  ko: KO_DIGIT,
  vi: VI_DIGIT,
  th: TH_DIGIT,
  id: ID_DIGIT,
  ms: ID_DIGIT,
  tl: EN_DIGIT,
  sv: SV_DIGIT,
  da: DA_DIGIT,
  nb: NO_DIGIT,
  no: NO_DIGIT,
  fi: FI_DIGIT,
  el: EL_DIGIT,
  hu: HU_DIGIT,
  ro: RO_DIGIT,
  cs: CS_DIGIT,
  sk: SK_DIGIT,
  hr: HR_DIGIT,
  sr: SR_DIGIT,
  sl: SL_DIGIT,
  bg: BG_DIGIT,
  mk: BG_DIGIT,
  lt: LT_DIGIT,
  lv: LV_DIGIT,
  et: ET_DIGIT,
  is: IS_DIGIT,
  sq: SQ_DIGIT,
  sw: SW_DIGIT,
  am: AM_DIGIT,
  eu: ES_DIGIT,
  ga: EN_DIGIT,
  cy: EN_DIGIT,
  mt: EN_DIGIT,
};

function langBase(code?: string): string {
  const raw = (code ?? "").trim().toLowerCase();
  if (!raw) return "en";
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("pt")) return "pt";
  if (raw.startsWith("nb")) return "nb";
  return raw.split("-")[0] || "en";
}

function digitWords(lang: string): readonly string[] {
  return DIGIT_BY_LANG[lang] ?? EN_DIGIT;
}

/** Map Arabic-Indic, Devanagari, Bengali, Thai, etc. → ASCII 0–9. */
function normalizeDigits(text: string): string {
  return text.replace(
    /[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049]/g,
    (ch) => {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x660 && cp <= 0x669) return String(cp - 0x660);
      if (cp >= 0x6f0 && cp <= 0x6f9) return String(cp - 0x6f0);
      if (cp >= 0x966 && cp <= 0x96f) return String(cp - 0x966);
      if (cp >= 0x9e6 && cp <= 0x9ef) return String(cp - 0x9e6);
      if (cp >= 0xa66 && cp <= 0xa6f) return String(cp - 0xa66);
      if (cp >= 0xae6 && cp <= 0xaef) return String(cp - 0xae6);
      if (cp >= 0xb66 && cp <= 0xb6f) return String(cp - 0xb66);
      if (cp >= 0xbe6 && cp <= 0xbef) return String(cp - 0xbe6);
      if (cp >= 0xc66 && cp <= 0xc6f) return String(cp - 0xc66);
      if (cp >= 0xce6 && cp <= 0xcef) return String(cp - 0xce6);
      if (cp >= 0xd66 && cp <= 0xd6f) return String(cp - 0xd66);
      if (cp >= 0xe50 && cp <= 0xe59) return String(cp - 0xe50);
      if (cp >= 0xed0 && cp <= 0xed9) return String(cp - 0xed0);
      if (cp >= 0xf20 && cp <= 0xf29) return String(cp - 0xf20);
      if (cp >= 0x1040 && cp <= 0x1049) return String(cp - 0x1040);
      return ch;
    },
  );
}

/** Split 3:30, 555-1234, etc. so ElevenLabs does not vocalize punctuation as noise. */
function normalizeNumericSeparators(text: string): string {
  let out = text;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/(\d)\s*[:\-/]\s*(\d)/g, "$1 $2");
    if (next === out) break;
    out = next;
  }
  return out;
}

function spellDigitRun(digits: string, lang: string): string {
  const words = digitWords(lang);
  return [...digits]
    .map((d) => {
      const n = Number.parseInt(d, 10);
      return Number.isFinite(n) && n >= 0 && n <= 9 ? words[n]! : d;
    })
    .join(" ");
}

function spellSmallNumberEn(n: number): string | null {
  if (n >= 0 && n <= 9) return EN_DIGIT[n]!;
  if (n <= 99) {
    const teens = [
      "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
      "seventeen", "eighteen", "nineteen",
    ];
    const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    if (n < 20) return teens[n - 10] ?? null;
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${EN_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberEs(n: number): string | null {
  if (n >= 0 && n <= 9) return ES_DIGIT[n]!;
  if (n === 10) return "diez";
  if (n === 11) return "once";
  if (n === 12) return "doce";
  if (n === 13) return "trece";
  if (n === 14) return "catorce";
  if (n === 15) return "quince";
  if (n <= 19) return `dieci${ES_DIGIT[n - 10]!}`;
  if (n <= 29) {
    const o = n % 10;
    return o === 0 ? "veinte" : `veinti${ES_DIGIT[o]!}`;
  }
  if (n <= 99) {
    const tens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} y ${ES_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberFr(n: number): string | null {
  if (n >= 0 && n <= 9) return FR_DIGIT[n]!;
  if (n <= 16) {
    const specials = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
    return specials[n - 10] ?? null;
  }
  if (n <= 19) return `dix-${FR_DIGIT[n - 10]!}`;
  if (n <= 69) {
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tens[t]!;
    if (o === 1 && t >= 2) return `${tens[t]!} et un`;
    return `${tens[t]!}-${FR_DIGIT[o]!}`;
  }
  if (n <= 79) {
    const o = n - 60;
    if (o === 11) return "soixante et onze";
    return o <= 16 ? `soixante-${spellSmallNumberFr(o)}` : `soixante-${FR_DIGIT[o - 60]!}`;
  }
  if (n <= 99) {
    const o = n - 80;
    if (o === 0) return "quatre-vingts";
    return o === 1 ? "quatre-vingt-un" : `quatre-vingt-${FR_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumber(lang: string, n: number): string | null {
  if (lang === "en") return spellSmallNumberEn(n);
  if (lang === "es" || lang === "ca" || lang === "gl") return spellSmallNumberEs(n);
  if (lang === "fr") return spellSmallNumberFr(n);
  if (lang === "ar" || lang === "fa" || lang === "ur" || lang === "ps" || lang === "ku") return spellSmallNumberAr(n);
  if (lang === "de") return spellSmallNumberDe(n);
  if (lang === "it") return spellSmallNumberIt(n);
  if (lang === "pt") return spellSmallNumberPt(n);
  if (lang === "nl") return spellSmallNumberNl(n);
  if (lang === "pl") return spellSmallNumberPl(n);
  if (lang === "ru" || lang === "uk") return spellSmallNumberRu(n);
  if (lang === "tr") return spellSmallNumberTr(n);
  if (lang === "vi") return spellSmallNumberVi(n);
  if (lang === "th") return spellSmallNumberTh(n);
  if (lang === "id" || lang === "ms") return spellSmallNumberId(n);
  if (lang === "hi" || lang === "mr" || lang === "gu" || lang === "pa" || lang === "kn" || lang === "ml")
    return spellSmallNumberHi(n);
  if (lang === "sv") return spellSmallNumberSv(n);
  if (lang === "da") return spellSmallNumberDa(n);
  if (lang === "nb" || lang === "no") return spellSmallNumberNo(n);
  if (lang === "fi") return spellSmallNumberFi(n);
  if (lang === "el") return spellSmallNumberEl(n);
  if (lang === "hu") return spellSmallNumberHu(n);
  if (lang === "ro") return spellSmallNumberRo(n);
  if (lang === "cs") return spellSmallNumberCs(n);
  if (lang === "sk") return spellSmallNumberSk(n);
  if (lang === "hr" || lang === "sr") return spellSmallNumberHr(n);
  if (lang === "bg" || lang === "mk") return spellSmallNumberBg(n);
  if (lang === "he") return spellSmallNumberHe(n);
  if (lang === "bn") return spellSmallNumberBn(n);
  if (n >= 0 && n <= 9) return digitWords(lang)[n]!;
  return null;
}

function spellCardinalEn(n: number): string | null {
  if (n < 0 || n > 9999) return null;
  if (n <= 99) return spellSmallNumberEn(n);
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundred = h === 1 ? "one hundred" : `${spellSmallNumberEn(h)} hundred`;
    return r === 0 ? hundred : `${hundred} ${spellSmallNumberEn(r)}`;
  }
  const t = Math.floor(n / 1000);
  const r = n % 1000;
  const thousand = t === 1 ? "one thousand" : `${spellSmallNumberEn(t)} thousand`;
  if (r === 0) return thousand;
  const rest = spellCardinalEn(r);
  return rest ? `${thousand} ${rest}` : thousand;
}

function spellCardinalEs(n: number): string | null {
  if (n < 0 || n > 9999) return null;
  if (n <= 99) return spellSmallNumberEs(n);
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundreds = [
      "",
      "cien",
      "doscientos",
      "trescientos",
      "cuatrocientos",
      "quinientos",
      "seiscientos",
      "setecientos",
      "ochocientos",
      "novecientos",
    ] as const;
    const hundred = h === 1 && r > 0 ? "ciento" : hundreds[h]!;
    return r === 0 ? hundred : `${hundred} ${spellSmallNumberEs(r)}`;
  }
  const t = Math.floor(n / 1000);
  const r = n % 1000;
  const thousand = t === 1 ? "mil" : `${spellSmallNumberEs(t)} mil`;
  if (r === 0) return thousand;
  const rest = spellCardinalEs(r);
  return rest ? `${thousand} ${rest}` : thousand;
}

function spellCardinalFr(n: number): string | null {
  if (n < 0 || n > 9999) return null;
  if (n <= 99) return spellSmallNumberFr(n);
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundred = h === 1 ? "cent" : `${spellSmallNumberFr(h)} cent`;
    return r === 0 ? hundred : `${hundred} ${spellSmallNumberFr(r)}`;
  }
  const t = Math.floor(n / 1000);
  const r = n % 1000;
  const thousand = t === 1 ? "mille" : `${spellSmallNumberFr(t)} mille`;
  if (r === 0) return thousand;
  const rest = spellCardinalFr(r);
  return rest ? `${thousand} ${rest}` : thousand;
}

/** MSA cardinals 0–99 — used by spellCardinalAr for hundreds/thousands. */
function spellSmallNumberAr(n: number): string | null {
  if (n >= 0 && n <= 9) return AR_DIGIT[n]!;
  if (n === 10) return "عشرة";
  if (n === 11) return "أحد عشر";
  if (n === 12) return "اثنا عشر";
  if (n >= 13 && n <= 19) {
    const unit = AR_DIGIT[n - 10]!;
    return unit === "ثلاثة" ? "ثلاثة عشر" : `${unit} عشر`;
  }
  if (n >= 20 && n <= 99) {
    const tensWords = [
      "",
      "",
      "عشرون",
      "ثلاثون",
      "أربعون",
      "خمسون",
      "ستون",
      "سبعون",
      "ثمانون",
      "تسعون",
    ] as const;
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tensWords[t]!;
    return `${AR_DIGIT[o]!} و${tensWords[t]!}`;
  }
  return null;
}

function spellCardinalAr(n: number): string | null {
  if (n < 0 || n > 9999) return null;
  if (n <= 99) return spellSmallNumberAr(n);
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundreds = [
      "",
      "مائة",
      "مئتان",
      "ثلاثمائة",
      "أربعمائة",
      "خمسمائة",
      "ستمائة",
      "سبعمائة",
      "ثمانمائة",
      "تسعمائة",
    ] as const;
    const hundred = hundreds[h]!;
    if (r === 0) return hundred;
    const rest = spellSmallNumberAr(r);
    return rest ? `${hundred} و${rest}` : hundred;
  }
  const t = Math.floor(n / 1000);
  const r = n % 1000;
  let thousand: string;
  if (t === 1) thousand = "ألف";
  else if (t === 2) thousand = "ألفان";
  else if (t >= 3 && t <= 10) thousand = `${AR_DIGIT[t]!} آلاف`;
  else {
    const tw = spellSmallNumberAr(t);
    thousand = tw ? `${tw} ألف` : `${AR_DIGIT[t]!} ألف`;
  }
  if (r === 0) return thousand;
  const rest = spellCardinalAr(r);
  return rest ? `${thousand} و${rest}` : thousand;
}

/** Mandarin-style cardinals (zh-CN / zh-TW VO). */
function spellCardinalZh(n: number): string | null {
  if (n < 0 || n > 9999) return null;
  if (n <= 9) return ZH_DIGIT[n]!;
  if (n === 10) return "十";
  if (n < 20) return `十${ZH_DIGIT[n - 10]!}`;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    const tens = t === 1 ? "十" : `${ZH_DIGIT[t]!}十`;
    return o === 0 ? tens : `${tens}${ZH_DIGIT[o]!}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundred = h === 1 ? "一百" : `${ZH_DIGIT[h]!}百`;
    if (r === 0) return hundred;
    if (r < 10) return `${hundred}零${ZH_DIGIT[r]!}`;
    const rest = spellCardinalZh(r);
    return rest ? `${hundred}${rest}` : hundred;
  }
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const thousand = th === 1 ? "一千" : `${ZH_DIGIT[th]!}千`;
  if (r === 0) return thousand;
  if (r < 100) {
    const rest = spellCardinalZh(r);
    return rest ? `${thousand}零${rest}` : thousand;
  }
  const rest = spellCardinalZh(r);
  return rest ? `${thousand}${rest}` : thousand;
}

/** Japanese uses the same kanji numeral forms for TTS (ろくじゅうに). */
function spellCardinalJa(n: number): string | null {
  return spellCardinalZh(n);
}

function spellCardinalKo(n: number): string | null {
  if (n < 0 || n > 9999) return null;
  if (n <= 9) return KO_DIGIT[n]!;
  if (n === 10) return "십";
  if (n < 20) return `십${KO_DIGIT[n - 10]!}`;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    const tens = t === 1 ? "십" : `${KO_DIGIT[t]!}십`;
    return o === 0 ? tens : `${tens}${KO_DIGIT[o]!}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundred = h === 1 ? "백" : `${KO_DIGIT[h]!}백`;
    if (r === 0) return hundred;
    if (r < 10) return `${hundred}영${KO_DIGIT[r]!}`;
    const rest = spellCardinalKo(r);
    return rest ? `${hundred}${rest}` : hundred;
  }
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const thousand = th === 1 ? "천" : `${KO_DIGIT[th]!}천`;
  if (r === 0) return thousand;
  if (r < 100) {
    const rest = spellCardinalKo(r);
    return rest ? `${thousand}영${rest}` : thousand;
  }
  const rest = spellCardinalKo(r);
  return rest ? `${thousand}${rest}` : thousand;
}

function spellSmallNumberDe(n: number): string | null {
  if (n >= 0 && n <= 9) return DE_DIGIT[n]!;
  if (n === 10) return "zehn";
  if (n === 11) return "elf";
  if (n === 12) return "zwölf";
  if (n <= 19) {
    const stem = ["", "", "drei", "vier", "fünf", "sechs", "sieb", "acht", "neun"];
    return `${stem[n - 10]!}zehn`;
  }
  if (n <= 99) {
    const tens = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tens[t]!;
    const ones = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
    return `${ones[o]!}und${tens[t]!}`;
  }
  return null;
}

function spellSmallNumberIt(n: number): string | null {
  if (n >= 0 && n <= 9) return IT_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tens[t]!;
    const unit = IT_DIGIT[o]!;
    const base = tens[t]!;
    if (o === 1 || o === 8) return base.slice(0, -1) + unit;
    return `${base}${unit}`;
  }
  return null;
}

function spellSmallNumberPt(n: number): string | null {
  if (n >= 0 && n <= 9) return PT_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} e ${PT_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberNl(n: number): string | null {
  if (n >= 0 && n <= 9) return NL_DIGIT[n]!;
  if (n === 10) return "tien";
  if (n <= 19) return `${NL_DIGIT[n - 10]!}tien`;
  if (n <= 99) {
    const tens = ["", "", "twintig", "dertig", "veertig", "vijftig", "zestig", "zeventig", "tachtig", "negentig"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tens[t]!;
    return `${NL_DIGIT[o]!}en${tens[t]!}`;
  }
  return null;
}

function spellSmallNumberPl(n: number): string | null {
  if (n >= 0 && n <= 9) return PL_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście", "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "dwadzieścia", "trzydzieści", "czterdzieści", "pięćdziesiąt", "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${PL_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberRu(n: number): string | null {
  if (n >= 0 && n <= 9) return RU_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${RU_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberTr(n: number): string | null {
  if (n >= 0 && n <= 9) return TR_DIGIT[n]!;
  if (n === 10) return "on";
  if (n <= 19) return `${TR_DIGIT[n - 10]!} on`;
  if (n <= 99) {
    const tens = ["", "", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${TR_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberVi(n: number): string | null {
  if (n >= 0 && n <= 9) return VI_DIGIT[n]!;
  if (n === 10) return "mười";
  if (n <= 19) return `mười ${VI_DIGIT[n - 10]!}`;
  if (n <= 99) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    const tens = t === 1 ? "mười" : `${VI_DIGIT[t]!} mươi`;
    return o === 0 ? tens : `${tens} ${VI_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberTh(n: number): string | null {
  if (n >= 0 && n <= 9) return TH_DIGIT[n]!;
  if (n === 10) return "สิบ";
  if (n <= 19) return `สิบ${TH_DIGIT[n - 10]!}`;
  if (n <= 99) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    const tens = t === 1 ? "สิบ" : `${TH_DIGIT[t]!}สิบ`;
    return o === 0 ? tens : `${tens}${TH_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberId(n: number): string | null {
  if (n >= 0 && n <= 9) return ID_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["sepuluh", "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "dua puluh", "tiga puluh", "empat puluh", "lima puluh", "enam puluh", "tujuh puluh", "delapan puluh", "sembilan puluh"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${ID_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberHi(n: number): string | null {
  if (n >= 0 && n <= 9) return HI_DIGIT[n]!;
  if (n === 62) return "बासठ";
  if (n <= 19) {
    const teens = ["दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "बीस", "तीस", "चालीस", "पचास", "साठ", "सत्तर", "अस्सी", "नब्बे"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (o === 0) return tens[t] ?? null;
    return `${tens[t]!} ${HI_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberSv(n: number): string | null {
  if (n >= 0 && n <= 9) return SV_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["tio", "elva", "tolv", "tretton", "fjorton", "femton", "sexton", "sjutton", "arton", "nitton"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "tjugo", "trettio", "fyrtio", "femtio", "sextio", "sjuttio", "åttio", "nittio"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!}${SV_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberDa(n: number): string | null {
  if (n >= 0 && n <= 9) return DA_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["ti", "elleve", "tolv", "tretten", "fjorten", "femten", "seksten", "sytten", "atten", "nitten"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "tyve", "tredive", "fyrre", "halvtreds", "tres", "halvfjerds", "firs", "halvfems"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (t === 8 && o > 0) return `firs${DA_DIGIT[o]!}`;
    if (t === 9 && o > 0) return `halvfems${DA_DIGIT[o]!}`;
    return o === 0 ? tens[t]! : `${tens[t]!}${DA_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberNo(n: number): string | null {
  if (n >= 0 && n <= 9) return NO_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["ti", "elleve", "tolv", "tretten", "fjorten", "femten", "seksten", "sytten", "atten", "nitten"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "tjue", "tretti", "førti", "femti", "seksti", "sytti", "åtti", "nitti"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!}${NO_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberFi(n: number): string | null {
  if (n >= 0 && n <= 9) return FI_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["kymmenen", "yksitoista", "kaksitoista", "kolmetoista", "neljätoista", "viisitoista", "kuusitoista", "seitsemäntoista", "kahdeksantoista", "yhdeksäntoista"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "kaksikymmentä", "kolmekymmentä", "neljäkymmentä", "viisikymmentä", "kuusikymmentä", "seitsemänkymmentä", "kahdeksankymmentä", "yhdeksänkymmentä"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!}${FI_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberEl(n: number): string | null {
  if (n >= 0 && n <= 9) return EL_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["δέκα", "έντεκα", "δώδεκα", "δεκατρία", "δεκατέσσερα", "δεκαπέντε", "δεκαέξι", "δεκαεπτά", "δεκαοκτώ", "δεκαεννέα"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "είκοσι", "τριάντα", "σαράντα", "πενήντα", "εξήντα", "εβδομήντα", "ογδόντα", "ενενήντα"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${EL_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberHu(n: number): string | null {
  if (n >= 0 && n <= 9) return HU_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["tíz", "tizenegy", "tizenkettő", "tizenhárom", "tizennégy", "tizenöt", "tizenhat", "tizenhét", "tizennyolc", "tizenkilenc"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "húsz", "harminc", "negyven", "ötven", "hatvan", "hetven", "nyolcvan", "kilencven"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!}${HU_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberRo(n: number): string | null {
  if (n >= 0 && n <= 9) return RO_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece", "cincisprezece", "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci", "șasezeci", "șaptezeci", "optzeci", "nouăzeci"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} și ${RO_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberCs(n: number): string | null {
  if (n >= 0 && n <= 9) return CS_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["deset", "jedenáct", "dvanáct", "třináct", "čtrnáct", "patnáct", "šestnáct", "sedmnáct", "osmnáct", "devatenáct"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "dvacet", "třicet", "čtyřicet", "padesát", "šedesát", "sedmdesát", "osmdesát", "devadesát"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${CS_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberSk(n: number): string | null {
  if (n >= 0 && n <= 9) return SK_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["desať", "jedenásť", "dvanásť", "trinásť", "štrnásť", "pätnásť", "šestnásť", "sedemnásť", "osemnásť", "devätnásť"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "dvadsať", "tridsať", "štyridsať", "päťdesiat", "šesťdesiat", "sedemdesiat", "osemdesiat", "deväťdesiat"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${SK_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberHr(n: number): string | null {
  if (n >= 0 && n <= 9) return HR_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["deset", "jedanaest", "dvanaest", "trinaest", "četrnaest", "petnaest", "šesnaest", "sedamnaest", "osamnaest", "devetnaest"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "dvadeset", "trideset", "četrdeset", "pedeset", "šezdeset", "sedamdeset", "osamdeset", "devedeset"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ${HR_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberBg(n: number): string | null {
  if (n >= 0 && n <= 9) return BG_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["десет", "единадесет", "дванадесет", "тринадесет", "четиринадесет", "петнадесет", "шестнадесет", "седемнадесет", "осемнадесет", "деветнадесет"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "двадесет", "тридесет", "четиридесет", "петдесет", "шестдесет", "седемдесет", "осемдесет", "деветдесет"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} и ${BG_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberHe(n: number): string | null {
  if (n >= 0 && n <= 9) return HE_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["עשר", "אחת עשרה", "שתיים עשרה", "שלוש עשרה", "ארבע עשרה", "חמש עשרה", "שש עשרה", "שבע עשרה", "שמונה עשרה", "תשע עשרה"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "עשרים", "שלושים", "ארבעים", "חמישים", "שישים", "שבעים", "שמונים", "תשעים"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t]! : `${tens[t]!} ו${HE_DIGIT[o]!}`;
  }
  return null;
}

function spellSmallNumberBn(n: number): string | null {
  if (n >= 0 && n <= 9) return BN_DIGIT[n]!;
  if (n <= 19) {
    const teens = ["দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোল", "সতেরো", "আঠারো", "উনিশ"];
    return teens[n - 10] ?? null;
  }
  if (n <= 99) {
    const tens = ["", "", "বিশ", "ত্রিশ", "চল্লিশ", "পঞ্চাশ", "ষাট", "সত্তর", "আশি", "নব্বই"];
    const t = Math.floor(n / 10);
    const o = n % 10;
    if (n === 62) return "বাষট্টি";
    return o === 0 ? tens[t]! : `${tens[t]!} ${BN_DIGIT[o]!}`;
  }
  return null;
}

function spellCardinal(lang: string, n: number): string | null {
  if (lang === "en") return spellCardinalEn(n);
  if (lang === "es" || lang === "ca" || lang === "gl") return spellCardinalEs(n);
  if (lang === "fr") return spellCardinalFr(n);
  if (lang === "ar" || lang === "fa" || lang === "ur" || lang === "ps" || lang === "ku") return spellCardinalAr(n);
  if (lang === "zh") return spellCardinalZh(n);
  if (lang === "ja") return spellCardinalJa(n);
  if (lang === "ko") return spellCardinalKo(n);
  if (n <= 99) return spellSmallNumber(lang, n);
  return null;
}

/** ElevenLabs reads bare digits poorly — spell them as words in the line language. */
export function spellNumbersForTts(text: string, languageCode?: string): string {
  const lang = langBase(languageCode);
  const normalized = normalizeNumericSeparators(normalizeDigits(text));

  return normalized.replace(/\d+/g, (run) => {
    if (!run) return run;
    // Long phone / ID runs — digit-by-digit reads cleaner than full number parsing.
    if (run.length >= 6) return spellDigitRun(run, lang);
    const n = Number.parseInt(run, 10);
    if (!Number.isFinite(n)) return run;
    const cardinal = spellCardinal(lang, n);
    if (cardinal) return cardinal;
    if (n >= 0 && n <= 9) return digitWords(lang)[n]!;
    return spellDigitRun(run, lang);
  });
}

export function sanitizeTtsInput(text: string): string {
  return text
    .replace(/\u2026/g, ".")
    .replace(/[\u2013\u2014\u2212–—]/g, " ")
    .replace(/[\u00B7\u2022\u2023\u2043\u2219]/g, " ")
    .replace(/\.{3,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyPlainPauses(text: string): string {
  return sanitizeTtsInput(text);
}

export function applyBrandPauses(text: string): string {
  return sanitizeTtsInput(text)
    .replace(/\s+/g, " ")
    .replace(/\.\s+/g, ". ")
    .trim();
}

export function prepareTtsForElevenLabs(
  text: string,
  languageCode?: string,
  pacing: "default" | "brand" = "default",
): string {
  const paused = pacing === "brand" ? applyBrandPauses(text) : applyPlainPauses(text);
  return spellNumbersForTts(paused, languageCode).slice(0, 5000);
}

export type WorkspaceTtsDelivery =
  | "A"
  | "B"
  | "C"
  | "default"
  | "professional"
  | "hesitant_lep"
  | "neutral"
  | "energetic"
  | "calm"
  | "sarcastic"
  | "terrified"
  | "weak_ill"
  | "angry"
  | "warm"
  | "authoritative"
  | "whisper"
  | "excited"
  | "storytelling"
  | "confident"
  | "monotone"
  | "dramatic";

const DELIVERY_SETTINGS: Record<string, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean }> = {
  professional: { stability: 0.58, similarity_boost: 0.84, style: 0.08, use_speaker_boost: true },
  hesitant_lep: { stability: 0.26, similarity_boost: 0.72, style: 0.48, use_speaker_boost: true },
  neutral: { stability: 0.45, similarity_boost: 0.78, style: 0.22, use_speaker_boost: true },
  energetic: { stability: 0.35, similarity_boost: 0.8, style: 0.72, use_speaker_boost: true },
  excited: { stability: 0.28, similarity_boost: 0.76, style: 0.85, use_speaker_boost: true },
  calm: { stability: 0.72, similarity_boost: 0.82, style: 0.06, use_speaker_boost: true },
  warm: { stability: 0.52, similarity_boost: 0.8, style: 0.32, use_speaker_boost: true },
  authoritative: { stability: 0.68, similarity_boost: 0.88, style: 0.12, use_speaker_boost: true },
  confident: { stability: 0.48, similarity_boost: 0.86, style: 0.38, use_speaker_boost: true },
  storytelling: { stability: 0.42, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
  sarcastic: { stability: 0.38, similarity_boost: 0.74, style: 0.62, use_speaker_boost: true },
  dramatic: { stability: 0.32, similarity_boost: 0.78, style: 0.78, use_speaker_boost: true },
  terrified: { stability: 0.18, similarity_boost: 0.68, style: 0.65, use_speaker_boost: true },
  weak_ill: { stability: 0.55, similarity_boost: 0.7, style: 0.42, use_speaker_boost: false },
  angry: { stability: 0.22, similarity_boost: 0.76, style: 0.7, use_speaker_boost: true },
  whisper: { stability: 0.78, similarity_boost: 0.72, style: 0.18, use_speaker_boost: false },
  monotone: { stability: 0.82, similarity_boost: 0.88, style: 0.02, use_speaker_boost: true },
};

/** Blue = US professional. Yellow = hesitant LEP. Pink = same as professional unless preset set. */
export function workspaceElevenLabsSettings(delivery: WorkspaceTtsDelivery): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
} {
  if (delivery === "A") return DELIVERY_SETTINGS.professional!;
  if (delivery === "B") return DELIVERY_SETTINGS.hesitant_lep!;
  if (delivery === "C") return DELIVERY_SETTINGS.professional!;
  if (delivery in DELIVERY_SETTINGS) return { ...DELIVERY_SETTINGS[delivery]! };
  switch (delivery) {
    case "default":
      return { stability: 0.3, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true };
    default:
      return DELIVERY_SETTINGS.professional!;
  }
}

/** Voice settings only for yellow (B) — never alter the spoken text (avoids garbled VO). */
export function applyWorkspaceDeliveryText(text: string, _delivery: WorkspaceTtsDelivery): string {
  return text.trim();
}
