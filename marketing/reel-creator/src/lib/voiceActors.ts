/**
 * ElevenLabs premade voice catalog — real voice_id values for multilingual turbo v2.5.
 * previewUrl: public MP3 when available; empty string → live TTS preview via api-server.
 */

export type VoiceActorGender = "male" | "female" | "neutral";

export type VoiceActorEntry = {
  id: string;
  label: string;
  shortLabel: string;
  gender: VoiceActorGender;
  elevenLabsId: string;
  previewUrl: string;
};

export const VOICE_ACTOR_ENTRIES: readonly VoiceActorEntry[] = [
  { id: "rachel", shortLabel: "Rachel", label: "Rachel — Energetic tech narrator (F)", gender: "female", elevenLabsId: "21m00Tcm4TlvDq8ikWAM", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/eLDc7xhWxG2FElT3kUTj/aTInQG648LTH0oRjg54j.mp3" },
  { id: "adam", shortLabel: "Adam", label: "Adam — Deep professional (M)", gender: "male", elevenLabsId: "pNInz6obpgDQGcFmaJgB", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3" },
  { id: "aria", shortLabel: "Aria", label: "Aria — Expressive young American (F)", gender: "female", elevenLabsId: "9BWtsMINqrJLrRacOk9x", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/M6ic45wruJGWAxLFEMNK/741a43cf-6965-4d85-bba2-d6f5db554c35.mp3" },
  { id: "jessica", shortLabel: "Jessica", label: "Jessica — Young conversational American (F)", gender: "female", elevenLabsId: "cgSgspJ2msm6clMCkdW9", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3" },
  { id: "laura", shortLabel: "Laura", label: "Laura — Upbeat young narrator (F)", gender: "female", elevenLabsId: "FGY2WhTYpPnrIDTdsKH5", previewUrl: "" },
  { id: "freya", shortLabel: "Freya", label: "Freya — Bright young (F)", gender: "female", elevenLabsId: "jsCqWAovK2LkecY7zXl4", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/QtY3JBOUKEB5xzrRfOKc/sxNrxFKYQqJM2twaupIl.mp3" },
  { id: "mimi", shortLabel: "Mimi", label: "Mimi — Cute animated young (F)", gender: "female", elevenLabsId: "zrHiDhphv9ZnVXBqCLjz", previewUrl: "" },
  { id: "nicole", shortLabel: "Nicole", label: "Nicole — Soft whisper ASMR (F)", gender: "female", elevenLabsId: "piTKgcLEGmPE4e6mEKli", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/QtY3JBOUKEB5xzrRfOKc/sxNrxFKYQqJM2twaupIl.mp3" },
  { id: "lily", shortLabel: "Lily", label: "Lily — Crisp British presenter (F)", gender: "female", elevenLabsId: "pFZP5JQG7iQjIQuC4Bku", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/89b68b35-b3dd-4348-a84a-a3c13a3c2b30.mp3" },
  { id: "bella", shortLabel: "Bella", label: "Bella — Smooth conversational (F)", gender: "female", elevenLabsId: "EXAVITQu4vr4xnSDxMaL", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3" },
  { id: "elli", shortLabel: "Elli", label: "Elli — Friendly natural (F)", gender: "female", elevenLabsId: "MF3mGyEYCl7XYWbV9V6O", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/bTrXJpbeuC5KgriLhQeC/VM0T1wrxlg7KPFYZVaUz.mp3" },
  { id: "emily", shortLabel: "Emily", label: "Emily — Calm young American (F)", gender: "female", elevenLabsId: "LcfcDJNUP1GQjkzn1xUU", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/QtY3JBOUKEB5xzrRfOKc/sxNrxFKYQqJM2twaupIl.mp3" },
  { id: "dorothy", shortLabel: "Dorothy", label: "Dorothy — Pleasant British (F)", gender: "female", elevenLabsId: "ThT5KcBeYPX3keUQqHPh", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/KKqCgJEpQqvlGXepFfmn/zkczBXyErI34VfwcU8Tu.mp3" },
  { id: "grace", shortLabel: "Grace", label: "Grace — Warm Southern US (F)", gender: "female", elevenLabsId: "oWAxZDx7w5VEj9dCyT07", previewUrl: "" },
  { id: "gigi", shortLabel: "Gigi", label: "Gigi — Animated energetic (F)", gender: "female", elevenLabsId: "jBpfuIE2acCO8z3wKNLl", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/QtY3JBOUKEB5xzrRfOKc/sxNrxFKYQqJM2twaupIl.mp3" },
  { id: "charlotte", shortLabel: "Charlotte", label: "Charlotte — Warm premium narrator (F)", gender: "female", elevenLabsId: "XB0fDUnXU5powFXDhCwa", previewUrl: "" },
  { id: "matilda", shortLabel: "Matilda", label: "Matilda — Soft professional (F)", gender: "female", elevenLabsId: "XrExE9yKIg1WjnnlVkGX", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3" },
  { id: "liam", shortLabel: "Liam", label: "Liam — Young confident American (M)", gender: "male", elevenLabsId: "TX3LPaxmHKxFdv7VOQHJ", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3" },
  { id: "will", shortLabel: "Will", label: "Will — Conversational friendly (M)", gender: "male", elevenLabsId: "bIHbv24MWmeRgasZH58o", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/8caf8f3d-ad29-4980-af41-53f20c72d7a4.mp3" },
  { id: "josh", shortLabel: "Josh", label: "Josh — Deep hype commercial (M)", gender: "male", elevenLabsId: "TxGEqnHWrfWFTfGW9XjX", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/J6QyEgpWnUhfFeU38ghG/4r7snxxYLnM0XUlLeabI.mp3" },
  { id: "brian", shortLabel: "Brian", label: "Brian — Deep narrator (M)", gender: "male", elevenLabsId: "nPczCjzI2devNBz1zQrb", previewUrl: "" },
  { id: "eric", shortLabel: "Eric", label: "Eric — Middle-aged American (M)", gender: "male", elevenLabsId: "cjVigY5qzO86Huf0OWal", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3" },
  { id: "sam", shortLabel: "Sam", label: "Sam — Young raspy (M)", gender: "male", elevenLabsId: "yoZ06aMxZJJ28mfd3POQ", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/JGzTGubAVbbgG0SsLIlg/28821fa8-d512-47d0-93b0-54885bad2b42.mp3" },
  { id: "jessie", shortLabel: "Jessie", label: "Jessie — Young casual (M)", gender: "male", elevenLabsId: "t0jbNlBVZ17f02VDIeMI", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/5PEXwsADjqmz7GO58o3B/56972ab3-2f5b-4946-aac9-ea8c76ea3c6e.mp3" },
  { id: "antoni", shortLabel: "Antoni", label: "Antoni — Natural presenter (M)", gender: "male", elevenLabsId: "ErXwobaYiN019PkySvjV", previewUrl: "/audio/voice-samples/antoni.mp3" },
  { id: "charlie", shortLabel: "Charlie", label: "Charlie — Casual Australian (M)", gender: "male", elevenLabsId: "IKne3meq5aSn9XLyUdCD", previewUrl: "" },
  { id: "dave", shortLabel: "Dave", label: "Dave — Conversational British (M)", gender: "male", elevenLabsId: "CYw3kZ02Hs0563khs1Fj", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/kF8twSM38uBXVCgMToG0/GEGPWIkqZtSmDaN6Qt7L.mp3" },
  { id: "daniel", shortLabel: "Daniel", label: "Daniel — Calm British authority (M)", gender: "male", elevenLabsId: "onwK4e9ZLuTAKqWW03F9", previewUrl: "" },
  { id: "drew", shortLabel: "Drew", label: "Drew — News anchor (M)", gender: "male", elevenLabsId: "29vD33N1CtxCmqQRPOHJ", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/FrS6cKLB1wg4WYgPa9GW/401782f2-fb6e-46fb-b69b-e9c9530608ab.mp3" },
  { id: "paul", shortLabel: "Paul", label: "Paul — Ground reporter (M)", gender: "male", elevenLabsId: "5Q0t7uMcjvnDisy1TS7k", previewUrl: "" },
  { id: "bill", shortLabel: "Bill", label: "Bill — Documentary (M)", gender: "male", elevenLabsId: "pqHfZKP75CvOlQylNhV4", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pqHfZKP75CvOlQylNhV4/d782b3ff-84ba-4029-848c-acf01285524d.mp3" },
  { id: "roger", shortLabel: "Roger", label: "Roger — Confident classic (M)", gender: "male", elevenLabsId: "CwhRBWXzGAHq8TQ4Fs17", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/58ee3ff5-f6f2-4628-93b8-e38eb31806b0.mp3" },
  { id: "callum", shortLabel: "Callum", label: "Callum — Hoarse character (M)", gender: "male", elevenLabsId: "N2lVS1w4EtoT3dr4eOWO", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3" },
  { id: "clyde", shortLabel: "Clyde", label: "Clyde — Gruff veteran (M)", gender: "male", elevenLabsId: "2EiwWnXFnvU5JabPnv8n", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/10NkTYmU7tSz3Kkl3Lex/Izw3uUEUt4DKcvYtVF5B.mp3" },
  { id: "fin", shortLabel: "Fin", label: "Fin — Irish storyteller (M)", gender: "male", elevenLabsId: "D38z5RcWu1voky8WS1ja", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/bTrXJpbeuC5KgriLhQeC/VM0T1wrxlg7KPFYZVaUz.mp3" },
  { id: "jeremy", shortLabel: "Jeremy", label: "Jeremy — Excited Irish (M)", gender: "male", elevenLabsId: "bVMeCyTHy58xNoL7hTEd", previewUrl: "" },
  { id: "harry", shortLabel: "Harry", label: "Harry — Anxious / worried (M)", gender: "male", elevenLabsId: "SOYHLrjzK2X1ezoPC6cr", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/SOYHLrjzK2X1ezoPC6cr/86d178f6-f4b6-4e0e-85be-3de19f490794.mp3" },
  { id: "ethan", shortLabel: "Ethan", label: "Ethan — Soft ASMR (M)", gender: "male", elevenLabsId: "g5qiaLWHcIcBkqLuX640", previewUrl: "" },
  { id: "patrick", shortLabel: "Patrick", label: "Patrick — Intense shouty (M)", gender: "male", elevenLabsId: "ODq5zmih8GrVes37Dizd", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/ktkP7Nsj67dw2zcplQYt/HLqkY4HmHjsgYkZUS8Fj.mp3" },
  { id: "james", shortLabel: "James", label: "James — Confident Australian (M)", gender: "male", elevenLabsId: "EkK5I93UQWFDigLMpZcX", previewUrl: "/audio/voice-samples/james.mp3" },
  { id: "george", shortLabel: "George", label: "George — Mature British storyteller (M)", gender: "male", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb", previewUrl: "" },
  { id: "michael", shortLabel: "Michael", label: "Michael — Older American (M)", gender: "male", elevenLabsId: "flq6f7yk4E4fJM5XTYuZ", previewUrl: "https://storage.googleapis.com/eleven-public-prod/database/workspace/1da06ea679a54975ad96a2221fe6530d/voices/A41HRDgOrF1mgUtjuSGM/eizk5tRN8MtQJWgzTNpE.mp3" },
  { id: "giovanni", shortLabel: "Giovanni", label: "Giovanni — Italian accent (M)", gender: "male", elevenLabsId: "zcAOhNBS3c14rBihAFp1", previewUrl: "" },
  { id: "river", shortLabel: "River", label: "River — Calm neutral (N)", gender: "neutral", elevenLabsId: "SAWy7570XJyXuSyN6Zq0", previewUrl: "" },
] as const;

export type VoiceActorId = (typeof VOICE_ACTOR_ENTRIES)[number]["id"];

/** All speaker display names for UI / docs. */
export function listVoiceActorNames(): { id: VoiceActorId; name: string; gender: VoiceActorGender }[] {
  return VOICE_ACTOR_ENTRIES.map((v) => ({
    id: v.id as VoiceActorId,
    name: v.shortLabel,
    gender: v.gender,
  }));
}
