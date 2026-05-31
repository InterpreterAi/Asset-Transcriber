/** English month / weekday tokens → target-language forms (OpenAI Legacy 2 clean post-repair). */

const EN_MONTHS_FULL = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const EN_MONTHS_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

const EN_WEEKDAYS_FULL = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const EN_WEEKDAYS_ABBR = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type CalendarMaps = {
  monthsFull: readonly string[];
  monthsAbbr: readonly string[];
  weekdaysFull: readonly string[];
  weekdaysAbbr: readonly string[];
};

const CALENDAR_BY_TGT: Record<string, CalendarMaps> = {
  ar: {
    monthsFull: [
      "يناير",
      "فبراير",
      "مارس",
      "أبريل",
      "مايو",
      "يونيو",
      "يوليو",
      "أغسطس",
      "سبتمبر",
      "أكتوبر",
      "نوفمبر",
      "ديسمبر",
    ],
    monthsAbbr: ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"],
    weekdaysFull: ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
    weekdaysAbbr: ["اثن", "ثلا", "أرب", "خمي", "جمع", "سبت", "أحد"],
  },
  es: {
    monthsFull: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
    monthsAbbr: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    weekdaysFull: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    weekdaysAbbr: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"],
  },
  fr: {
    monthsFull: [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ],
    monthsAbbr: ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"],
    weekdaysFull: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    weekdaysAbbr: ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"],
  },
  de: {
    monthsFull: [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ],
    monthsAbbr: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    weekdaysFull: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    weekdaysAbbr: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
  },
  ru: {
    monthsFull: [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ],
    monthsAbbr: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
    weekdaysFull: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"],
    weekdaysAbbr: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  },
  pt: {
    monthsFull: [
      "janeiro",
      "fevereiro",
      "março",
      "abril",
      "maio",
      "junho",
      "julho",
      "agosto",
      "setembro",
      "outubro",
      "novembro",
      "dezembro",
    ],
    monthsAbbr: ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    weekdaysFull: ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"],
    weekdaysAbbr: ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"],
  },
  he: {
    monthsFull: [
      "ינואר",
      "פברואר",
      "מרץ",
      "אפריל",
      "מאי",
      "יוני",
      "יולי",
      "אוגוסט",
      "ספטמבר",
      "אוקטובר",
      "נובמבר",
      "דצמבר",
    ],
    monthsAbbr: ["ינו", "פבר", "מרץ", "אפר", "מאי", "יונ", "יול", "אוג", "ספט", "אוק", "נוב", "דצמ"],
    weekdaysFull: ["יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "יום שבת", "יום ראשון"],
    weekdaysAbbr: ["ב'", "ג'", "ד'", "ה'", "ו'", "ש'", "א'"],
  },
  hi: {
    monthsFull: [
      "जनवरी",
      "फ़रवरी",
      "मार्च",
      "अप्रैल",
      "मई",
      "जून",
      "जुलाई",
      "अगस्त",
      "सितंबर",
      "अक्टूबर",
      "नवंबर",
      "दिसंबर",
    ],
    monthsAbbr: ["जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुल", "अग", "सित", "अक्टू", "नव", "दिस"],
    weekdaysFull: ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"],
    weekdaysAbbr: ["सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि", "रवि"],
  },
  zh: {
    monthsFull: [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月",
    ],
    monthsAbbr: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    weekdaysFull: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
    weekdaysAbbr: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  },
};

function tgtBaseCode(tgtLangBcp47: string): string {
  const base = (tgtLangBcp47 ?? "").split("-")[0]!.toLowerCase();
  if (base === "zh") return "zh";
  return base;
}

function replaceEnglishCalendarToken(text: string, en: string, localized: string): string {
  if (!localized || en.toLowerCase() === localized.toLowerCase()) return text;
  const re = new RegExp(`(?<![A-Za-zÀ-ÿ])${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-zÀ-ÿ])`, "gi");
  return text.replace(re, localized);
}

function applyCalendarMaps(text: string, maps: CalendarMaps): string {
  let out = text;
  for (let i = 0; i < EN_MONTHS_FULL.length; i++) {
    out = replaceEnglishCalendarToken(out, EN_MONTHS_FULL[i]!, maps.monthsFull[i]!);
    out = replaceEnglishCalendarToken(out, EN_MONTHS_ABBR[i]!, maps.monthsAbbr[i]!);
  }
  for (let i = 0; i < EN_WEEKDAYS_FULL.length; i++) {
    out = replaceEnglishCalendarToken(out, EN_WEEKDAYS_FULL[i]!, maps.weekdaysFull[i]!);
    out = replaceEnglishCalendarToken(out, EN_WEEKDAYS_ABBR[i]!, maps.weekdaysAbbr[i]!);
  }
  return out;
}

/** Replace leftover English month/weekday names when target is not English (OpenAI Legacy 2 clean path). */
export function repairEnglishCalendarWordsInCleanTranslation(
  translated: string,
  tgtLangBcp47: string,
): string {
  const tgtCode = tgtBaseCode(tgtLangBcp47);
  if (!translated?.trim() || tgtCode === "en") return translated;
  if (!/[A-Za-z]/.test(translated)) return translated;

  const maps = CALENDAR_BY_TGT[tgtCode];
  if (!maps) return translated;

  return applyCalendarMaps(translated, maps);
}

export function englishCalendarWordsPromptBlock(tgtName: string, tgtLangBcp47: string): string {
  const tgtCode = tgtBaseCode(tgtLangBcp47);
  if (tgtCode === "en") return "";

  return (
    `MONTHS AND WEEKDAYS:\n` +
    `- Always write month names and weekday names in standard ${tgtName} — never leave English calendar words ` +
    `(e.g. Monday, Tuesday, January, Feb, Mar) in the ${tgtName} output.\n` +
    `- Translate calendar words even inside dates: "January 15, 2024" → month name in ${tgtName} with the same day/year numbers.\n` +
    `- NUM_* tokens are digits only — copy them exactly; translate any separate English month/weekday words around them.\n\n`
  );
}
