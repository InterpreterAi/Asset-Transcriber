/**
 * Critical auto-accident / body-part / insurance-claim pins for Soniox chunk-v2.
 *
 * Same rules as critical-medical-terms.ts: small, high-stakes, bidirectional,
 * budget-protected. Do not dump entire anatomy or insurance dictionaries here.
 */

export type CriticalClaimTerm = {
  en: string;
  translations: Record<string, string>;
  confusedL2?: Record<string, string[]>;
};

/**
 * Injury body parts + auto/insurance claim lemmas interpreters must not freestyle.
 * Expand carefully — each row costs Soniox context budget.
 */
export const CRITICAL_CLAIM_TERMS: readonly CriticalClaimTerm[] = [
  // ── Body parts (injury / PI claims) ───────────────────────────────────────
  {
    en: "neck",
    translations: {
      ar: "الرقبة", es: "cuello", pt: "pescoço", pl: "szyja", zh: "脖子",
      fr: "cou", de: "Nacken", ru: "шея", hi: "गर्दन", it: "collo",
      tr: "boyun", nl: "nek", uk: "шия", vi: "cổ", ko: "목", ja: "首",
    },
  },
  {
    en: "spine",
    translations: {
      ar: "العمود الفقري", es: "columna vertebral", pt: "coluna vertebral", pl: "kręgosłup", zh: "脊柱",
      fr: "colonne vertébrale", de: "Wirbelsäule", ru: "позвоночник", hi: "रीढ़", it: "colonna vertebrale",
      tr: "omurga", nl: "wervelkolom", uk: "хребет", vi: "cột sống", ko: "척추", ja: "脊椎",
    },
  },
  {
    en: "lower back",
    translations: {
      ar: "أسفل الظهر", es: "espalda baja", pt: "região lombar", pl: "dolna część pleców", zh: "下背部",
      fr: "bas du dos", de: "unterer Rücken", ru: "поясница", hi: "निचली पीठ", it: "parte bassa della schiena",
      tr: "bel", nl: "onderrug", uk: "поперек", vi: "vùng lưng dưới", ko: "허리", ja: "腰",
    },
  },
  {
    en: "shoulder",
    translations: {
      ar: "الكتف", es: "hombro", pt: "ombro", pl: "ramię", zh: "肩膀",
      fr: "épaule", de: "Schulter", ru: "плечо", hi: "कंधा", it: "spalla",
      tr: "omuz", nl: "schouder", uk: "плече", vi: "vai", ko: "어깨", ja: "肩",
    },
  },
  {
    en: "knee",
    translations: {
      ar: "الركبة", es: "rodilla", pt: "joelho", pl: "kolano", zh: "膝盖",
      fr: "genou", de: "Knie", ru: "колено", hi: "घुटना", it: "ginocchio",
      tr: "diz", nl: "knie", uk: "коліно", vi: "đầu gối", ko: "무릎", ja: "膝",
    },
  },
  {
    en: "wrist",
    translations: {
      ar: "المعصم", es: "muñeca", pt: "pulso", pl: "nadgarstek", zh: "手腕",
      fr: "poignet", de: "Handgelenk", ru: "запястье", hi: "कलाई", it: "polso",
      tr: "bilek", nl: "pols", uk: "зап'ястя", vi: "cổ tay", ko: "손목", ja: "手首",
    },
  },
  {
    en: "ankle",
    translations: {
      ar: "الكاحل", es: "tobillo", pt: "tornozelo", pl: "kostka", zh: "脚踝",
      fr: "cheville", de: "Knöchel", ru: "лодыжка", hi: "टखना", it: "caviglia",
      tr: "ayak bileği", nl: "enkel", uk: "щиколотка", vi: "mắt cá chân", ko: "발목", ja: "足首",
    },
  },
  {
    en: "hip",
    translations: {
      ar: "الورك", es: "cadera", pt: "quadril", pl: "biodro", zh: "髋部",
      fr: "hanche", de: "Hüfte", ru: "бедро", hi: "कूल्हा", it: "anca",
      tr: "kalça", nl: "heup", uk: "стегно", vi: "hông", ko: "엉덩이관절", ja: "股関節",
    },
  },
  {
    en: "whiplash",
    translations: {
      ar: "إصابة الارتداد العنقي", es: "latigazo cervical", pt: "chicote cervical", pl: "uraz smagający", zh: "挥鞭伤",
      fr: "coup du lapin", de: "Schleudertrauma", ru: "хлыстовая травма", hi: "व्हिपलैश", it: "colpo di frusta",
      tr: "kamçı yaralanması", nl: "whiplash", uk: "хлистова травма", vi: "chấn thương roi da", ko: "채찍질 손상", ja: "むち打ち",
    },
  },
  {
    en: "fracture",
    translations: {
      ar: "كسر", es: "fractura", pt: "fratura", pl: "złamanie", zh: "骨折",
      fr: "fracture", de: "Fraktur", ru: "перелом", hi: "फ्रैक्चर", it: "frattura",
      tr: "kırık", nl: "fractuur", uk: "перелом", vi: "gãy xương", ko: "골절", ja: "骨折",
    },
  },

  // ── Auto / accident ───────────────────────────────────────────────────────
  {
    en: "collision",
    translations: {
      ar: "تصادم", es: "colisión", pt: "colisão", pl: "zderzenie", zh: "碰撞",
      fr: "collision", de: "Kollision", ru: "столкновение", hi: "टक्कर", it: "collisione",
      tr: "çarpışma", nl: "botsing", uk: "зіткнення", vi: "va chạm", ko: "충돌", ja: "衝突",
    },
  },
  {
    en: "rear-end collision",
    translations: {
      ar: "تصادم خلفي", es: "colisión trasera", pt: "colisão traseira", pl: "zderzenie tylne", zh: "追尾事故",
      fr: "collision par l'arrière", de: "Auffahrunfall", ru: "наезд сзади", hi: "पीछे से टक्कर", it: "tamponamento",
      tr: "arkadan çarpma", nl: "kop-staartbotsing", uk: "наїзд ззаду", vi: "va chạm phía sau", ko: "후방 추돌", ja: "追突事故",
    },
  },
  {
    en: "motor vehicle accident",
    translations: {
      ar: "حادث مروري", es: "accidente de vehículo motorizado", pt: "acidente de veículo motorizado", pl: "wypadek samochodowy", zh: "机动车事故",
      fr: "accident de véhicule motorisé", de: "Kraftfahrzeugunfall", ru: "ДТП", hi: "मोटर वाहन दुर्घटना", it: "incidente stradale",
      tr: "trafik kazası", nl: "verkeersongeval", uk: "ДТП", vi: "tai nạn giao thông", ko: "교통사고", ja: "自動車事故",
    },
  },
  {
    en: "bodily injury",
    translations: {
      ar: "إصابة جسدية", es: "lesiones corporales", pt: "lesão corporal", pl: "obrażenia ciała", zh: "人身伤害",
      fr: "préjudice corporel", de: "Körperverletzung", ru: "телесные повреждения", hi: "शारीरिक चोट", it: "lesioni personali",
      tr: "bedensel yaralanma", nl: "lichamelijk letsel", uk: "тілесні ушкодження", vi: "thương tích thân thể", ko: "신체 상해", ja: "人身傷害",
    },
  },
  {
    en: "property damage",
    translations: {
      ar: "أضرار الممتلكات", es: "daños a la propiedad", pt: "danos à propriedade", pl: "szkody majątkowe", zh: "财产损失",
      fr: "dommages matériels", de: "Sachschaden", ru: "повреждение имущества", hi: "संपत्ति क्षति", it: "danni alla proprietà",
      tr: "maddi hasar", nl: "zaakschade", uk: "майнова шкода", vi: "thiệt hại tài sản", ko: "재산 피해", ja: "物的損害",
    },
  },
  {
    en: "at fault",
    translations: {
      ar: "المخطئ", es: "culpable", pt: "culpado", pl: "winny", zh: "有过错方",
      fr: "responsable", de: "schuldhaft", ru: "виновник", hi: "दोषी", it: "in torto",
      tr: "kusurlu", nl: "aansprakelijk", uk: "винний", vi: "có lỗi", ko: "과실 있음", ja: "過失あり",
    },
  },
  {
    en: "hit and run",
    translations: {
      ar: "دهس وهروب", es: "atropello y fuga", pt: "atropelamento e fuga", pl: "ucieczka z miejsca wypadku", zh: "肇事逃逸",
      fr: "délit de fuite", de: "Fahrerflucht", ru: "скрылся с места ДТП", hi: "हिट एंड रन", it: "investimento e fuga",
      tr: "kaçma", nl: "doorrijden na ongeval", uk: "втік з місця ДТП", vi: "gây tai nạn rồi bỏ chạy", ko: "뺑소니", ja: "ひき逃げ",
    },
  },
  {
    en: "uninsured motorist",
    translations: {
      ar: "سائق غير مؤمن", es: "conductor sin seguro", pt: "motorista sem seguro", pl: "kierowca bez ubezpieczenia", zh: "未投保司机",
      fr: "conducteur non assuré", de: "unversicherter Kraftfahrer", ru: "водитель без страховки", hi: "बिना बीमा वाला चालक", it: "conducente non assicurato",
      tr: "sigortasız sürücü", nl: "onverzekerde bestuurder", uk: "водій без страховки", vi: "tài xế không có bảo hiểm", ko: "무보험 운전자", ja: "無保険運転者",
    },
  },

  // ── Insurance / claims ────────────────────────────────────────────────────
  {
    en: "insurance claim",
    translations: {
      ar: "مطالبة تأمين", es: "reclamación de seguro", pt: "sinistro de seguro", pl: "roszczenie ubezpieczeniowe", zh: "保险索赔",
      fr: "demande d'indemnisation", de: "Versicherungsanspruch", ru: "страховой случай", hi: "बीमा दावा", it: "richiesta di risarcimento",
      tr: "sigorta talebi", nl: "verzekeringsclaim", uk: "страхова вимога", vi: "yêu cầu bồi thường bảo hiểm", ko: "보험 청구", ja: "保険請求",
    },
  },
  {
    en: "insurance policy",
    translations: {
      ar: "بوليصة تأمين", es: "póliza de seguro", pt: "apólice de seguro", pl: "polisa ubezpieczeniowa", zh: "保险单",
      fr: "police d'assurance", de: "Versicherungspolice", ru: "страховой полис", hi: "बीमा पॉलिसी", it: "polizza assicurativa",
      tr: "sigorta poliçesi", nl: "verzekeringspolis", uk: "страховий поліс", vi: "hợp đồng bảo hiểm", ko: "보험 증권", ja: "保険証券",
    },
  },
  {
    en: "premium",
    translations: {
      ar: "قسط التأمين", es: "prima", pt: "prêmio", pl: "składka", zh: "保费",
      fr: "prime", de: "Prämie", ru: "страховая премия", hi: "प्रीमियम", it: "premio",
      tr: "prim", nl: "premie", uk: "премія", vi: "phí bảo hiểm", ko: "보험료", ja: "保険料",
    },
  },
  {
    en: "deductible",
    translations: {
      ar: "الخصم", es: "deducible", pt: "franquia", pl: "udział własny", zh: "免赔额",
      fr: "franchise", de: "Selbstbeteiligung", ru: "франшиза", hi: "डिडक्टिबल", it: "franchigia",
      tr: "muafiyet", nl: "eigen risico", uk: "франшиза", vi: "khấu trừ", ko: "공제액", ja: "免責金額",
    },
  },
  {
    en: "liability",
    translations: {
      ar: "المسؤولية", es: "responsabilidad", pt: "responsabilidade", pl: "odpowiedzialność", zh: "责任",
      fr: "responsabilité", de: "Haftung", ru: "ответственность", hi: "देयता", it: "responsabilità",
      tr: "sorumluluk", nl: "aansprakelijkheid", uk: "відповідальність", vi: "trách nhiệm", ko: "책임", ja: "賠償責任",
    },
  },
  {
    en: "coverage",
    translations: {
      ar: "التغطية", es: "cobertura", pt: "cobertura", pl: "ochrona ubezpieczeniowa", zh: "保障范围",
      fr: "couverture", de: "Deckung", ru: "покрытие", hi: "कवरेज", it: "copertura",
      tr: "teminat", nl: "dekking", uk: "покриття", vi: "phạm vi bảo hiểm", ko: "보장 범위", ja: "補償範囲",
    },
  },
  {
    en: "settlement",
    translations: {
      ar: "تسوية", es: "acuerdo", pt: "acordo", pl: "ugoda", zh: "和解",
      fr: "règlement", de: "Vergleich", ru: "мировое соглашение", hi: "निपटान", it: "transazione",
      tr: "uzlaşma", nl: "schikking", uk: "угода", vi: "thỏa thuận bồi thường", ko: "합의", ja: "示談",
    },
  },
  {
    en: "personal injury",
    translations: {
      ar: "إصابة شخصية", es: "lesión personal", pt: "lesão pessoal", pl: "obrażenie ciała", zh: "人身伤害",
      fr: "préjudice personnel", de: "Personenschaden", ru: "личный вред", hi: "व्यक्तिगत चोट", it: "lesione personale",
      tr: "kişisel yaralanma", nl: "persoonlijk letsel", uk: "особиста травма", vi: "thương tích cá nhân", ko: "개인 상해", ja: "人身傷害",
    },
  },
  {
    en: "workers compensation",
    translations: {
      ar: "تعويض العمال", es: "compensación laboral", pt: "compensação trabalhista", pl: "odszkodowanie pracownicze", zh: "工伤赔偿",
      fr: "indemnisation des accidents du travail", de: "Arbeitsunfallversicherung", ru: "компенсация работникам", hi: "कर्मचारी मुआवजा", it: "indennizzo ai lavoratori",
      tr: "işçi tazminatı", nl: "arbeidsongevallenverzekering", uk: "компенсація працівникам", vi: "bồi thường lao động", ko: "산재 보상", ja: "労災補償",
    },
  },
  {
    en: "pre-existing condition",
    translations: {
      ar: "حالة موجودة مسبقاً", es: "condición preexistente", pt: "condição preexistente", pl: "choroba istniejąca wcześniej", zh: "既往症",
      fr: "affection préexistante", de: "Vorherkrankung", ru: "ранее существовавшее заболевание", hi: "पूर्व-विद्यमान स्थिति", it: "condizione preesistente",
      tr: "önceden var olan durum", nl: "bestaande aandoening", uk: "вже наявний стан", vi: "bệnh có sẵn", ko: "기존 질환", ja: "既往症",
    },
  },
  {
    en: "beneficiary",
    translations: {
      ar: "المستفيد", es: "beneficiario", pt: "beneficiário", pl: "beneficjent", zh: "受益人",
      fr: "bénéficiaire", de: "Begünstigter", ru: "бенефициар", hi: "लाभार्थी", it: "beneficiario",
      tr: "lehtar", nl: "begunstigde", uk: "вигодонабувач", vi: "người thụ hưởng", ko: "수익자", ja: "受取人",
    },
  },
];

export const CRITICAL_CLAIM_EN_SET = new Set(
  CRITICAL_CLAIM_TERMS.map((t) => t.en.toLowerCase()),
);

export type SonioxBidiTerm = { source: string; target: string };

export function criticalClaimTermsForLang(lang: string): SonioxBidiTerm[] {
  const base = lang.split("-")[0]!.toLowerCase();
  const out: SonioxBidiTerm[] = [];
  for (const row of CRITICAL_CLAIM_TERMS) {
    const l2 = row.translations[base];
    if (!l2) continue;
    out.push({ source: l2, target: row.en });
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasEnLemma(text: string, lemma: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(lemma)}(?![A-Za-z0-9])`, "i");
  return re.test(text);
}

/**
 * Replace Latin EN claim/body lemmas still sitting in the translation column.
 */
export function applyCriticalClaimNativeRepair(
  translationText: string,
  originalText: string,
  targetLang: string,
): string {
  const tgt = targetLang.split("-")[0]!.toLowerCase();
  const original = originalText.trim();
  let out = translationText;
  if (!original || !out.trim()) return translationText;

  // Longer lemmas first so "rear-end collision" wins over "collision".
  const rows = [...CRITICAL_CLAIM_TERMS].sort((a, b) => b.en.length - a.en.length);

  for (const row of rows) {
    const correct = row.translations[tgt];
    if (!correct) continue;
    if (!hasEnLemma(original, row.en)) continue;
    if (!hasEnLemma(out, row.en)) continue;
    out = out.replace(
      new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(row.en)}(?![A-Za-z0-9])`, "gi"),
      correct,
    );
  }

  return out;
}
