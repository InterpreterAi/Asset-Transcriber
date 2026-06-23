/**
 * Real translated conversation fragments from the Maria medical demo.
 * Used for language-stream bubbles — never bare language codes.
 */
export type TranslationFragment = {
  id: string;
  text: string;
  rtl?: boolean;
};

/** Key line: "When did the symptoms first start?" and related phrases across workspace languages. */
export const CINEMATIC_TRANSLATION_FRAGMENTS: readonly TranslationFragment[] = [
  { id: "es", text: "¿Puede decirme cuándo comenzaron los síntomas?" },
  { id: "ar", text: "متى بدأت الأعراض؟", rtl: true },
  { id: "fr", text: "Quand les symptômes ont-ils commencé ?" },
  { id: "de", text: "Wann haben die Symptome begonnen?" },
  { id: "ja", text: "症状はいつ始まりましたか？" },
  { id: "it", text: "Quando sono iniziati i sintomi?" },
  { id: "pt", text: "Quando os sintomas começaram?" },
  { id: "zh", text: "症状是什么时候开始的？" },
  { id: "ko", text: "증상은 언제 시작됐나요?" },
  { id: "ru", text: "Когда впервые появились симптомы?" },
  { id: "hi", text: "लक्षण कब शुरू हुए?" },
  { id: "tr", text: "Belirtiler ne zaman başladı?" },
  { id: "vi", text: "Triệu chứng bắt đầu khi nào?" },
  { id: "th", text: "อาการเริ่มเมื่อไหร่?" },
  { id: "pl", text: "Kiedy zaczęły się objawy?" },
  { id: "nl", text: "Wanneer begonnen de symptomen?" },
  { id: "sv", text: "När började symtomen?" },
  { id: "da", text: "Hvornår begyndte symptomerne?" },
  { id: "fi", text: "Milloin oireet alkoivat?" },
  { id: "nb", text: "Når begynte symptomene?" },
  { id: "cs", text: "Kdy začaly příznaky?" },
  { id: "sk", text: "Kedy začali príznaky?" },
  { id: "hu", text: "Mikor kezdődtek a tünetek?" },
  { id: "ro", text: "Când au început simptomele?" },
  { id: "bg", text: "Кога започнаха симптомите?" },
  { id: "hr", text: "Kada su simptomi počeli?" },
  { id: "el", text: "Πότε άρχισαν τα συμπτώματα;" },
  { id: "he", text: "מתי התחילו התסמינים?", rtl: true },
  { id: "fa", text: "علائم چه زمانی شروع شد؟", rtl: true },
  { id: "ur", text: "علامات کب شروع ہوئیں؟", rtl: true },
  { id: "id", text: "Kapan gejala pertama kali muncul?" },
  { id: "ms", text: "Bila simptom mula bermula?" },
  { id: "uk", text: "Коли вперше з'явилися симптоми?" },
  { id: "bn", text: "লক্ষণ কখন শুরু হয়েছিল?" },
  { id: "so", text: "Goorma ayay calaamaduhu bilaabmeen?" },
  { id: "en", text: "Can you tell me when the symptoms first started?" },
  { id: "es-pain", text: "¿Qué tan severo es el dolor?" },
  { id: "fr-pain", text: "À quel point la douleur est-elle sévère ?" },
  { id: "de-pain", text: "Wie stark sind die Schmerzen?" },
  { id: "ja-pain", text: "痛みはどのくらいひどいですか？" },
  { id: "pt-response", text: "Eu diria que cerca de sete." },
  { id: "ar-response", text: "أود أن أقول حوالي سبعة.", rtl: true },
  { id: "zh-response", text: "我会说大约七分。" },
] as const;
