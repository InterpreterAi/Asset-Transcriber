/** Quick sanity check — numbers in VO lines spell correctly per language. */
import { spellNumbersForTts } from "../src/lib/reel-tts-text.ts";

const cases: Array<{ lang: string; input: string; expect: string }> = [
  { lang: "en", input: "Supports 62 languages.", expect: "Supports sixty two languages." },
  { lang: "zh-CN", input: "支持 62 种语言。", expect: "支持 六十二 种语言。" },
  { lang: "ja", input: "62言語に対応。", expect: "六十二言語に対応。" },
  { lang: "ko", input: "62개 언어를 지원합니다.", expect: "육십이개 언어를 지원합니다." },
  { lang: "de", input: "Unterstützt 62 Sprachen.", expect: "Unterstützt zweiundsechzig Sprachen." },
  { lang: "fr", input: "Prend en charge 62 langues.", expect: "Prend en charge soixante-deux langues." },
  { lang: "ar", input: "يدعم 62 لغة.", expect: "يدعم اثنان وستون لغة." },
  { lang: "hi", input: "62 भाषाओं का समर्थन।", expect: "बासठ भाषाओं का समर्थन।" },
  { lang: "vi", input: "Hỗ trợ 62 ngôn ngữ.", expect: "Hỗ trợ sáu mươi hai ngôn ngữ." },
  { lang: "en", input: "7 days free", expect: "seven days free" },
  { lang: "zh-CN", input: "7 天免费", expect: "七 天免费" },
];

let failed = 0;
for (const c of cases) {
  const got = spellNumbersForTts(c.input, c.lang);
  if (got !== c.expect) {
    failed++;
    console.error(`FAIL [${c.lang}]`);
    console.error(`  in:  ${c.input}`);
    console.error(`  want: ${c.expect}`);
    console.error(`  got:  ${got}`);
  } else {
    console.log(`ok [${c.lang}] ${c.input}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} cases passed.`);
