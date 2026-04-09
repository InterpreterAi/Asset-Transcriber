import axios from "axios";

const LIBRE_URL = process.env.LIBRETRANSLATE_URL || "https://libretranslate.de";

export async function callLibreTranslate(text: string, source: string, target: string) {
  const res = await axios.post(`${LIBRE_URL}/translate`, {
    q: text,
    source: source,
    target: target,
    format: "text"
  });

  return res.data.translatedText;
}
