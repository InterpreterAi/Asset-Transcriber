# Language catalog report

Generated: 2026-06-23 via `pnpm --filter @workspace/api-server exec tsx scripts/language-catalog-report.ts`

## Summary

| Metric | Count |
|--------|------:|
| Workspace languages (STT pickers) | 62 |
| Glossary languages (`INTERPRETER_GLOSSARY_LANG_CODES`) | 62 |
| Glossary JSON entries (all domains) | 3,601 |
| Glossary entries with any JSON gap | 3601 |
| Missing translation cells (JSON) | 219,449 |
| Equals-English cells (JSON) | 10 |

## Phase A additions (26 languages)

- `af` — Afrikaans
- `sq` — Albanian
- `az` — Azerbaijani
- `eu` — Basque
- `be` — Belarusian
- `bn` — Bengali
- `bs` — Bosnian
- `ca` — Catalan
- `et` — Estonian
- `gl` — Galician
- `gu` — Gujarati
- `kn` — Kannada
- `kk` — Kazakh
- `lv` — Latvian
- `lt` — Lithuanian
- `mk` — Macedonian
- `ml` — Malayalam
- `mr` — Marathi
- `pa` — Punjabi
- `sr` — Serbian
- `sl` — Slovenian
- `sw` — Swahili
- `tl` — Tagalog
- `ta` — Tamil
- `te` — Telugu
- `cy` — Welsh

## Glossary coverage

At **server load**, every glossary term materializes all 62 language slots; missing JSON keys fall back to the English gloss (`translations.en`). Existing curated translations for medical, legal, immigration, and insurance terms are unchanged.

### Languages with partial JSON coverage (legacy 36 stack)

- `ar`
- `bg`
- `zh-CN`
- `zh-TW`
- `hr`
- `cs`
- `da`
- `nl`
- `fa`
- `fi`
- `fr`
- `de`
- `el`
- `he`
- `hi`
- `hu`
- `id`
- `it`
- `ja`
- `ko`
- `ms`
- `nb`
- `pl`
- `pt`
- `ro`
- `ru`
- `sk`
- `es`
- `sv`
- `th`
- `tr`
- `uk`
- `ur`
- `vi`

### Languages using full English fallback in JSON (Phase A additions)

- `af` — Afrikaans (3601 missing cells)
- `sq` — Albanian (3601 missing cells)
- `az` — Azerbaijani (3601 missing cells)
- `eu` — Basque (3601 missing cells)
- `be` — Belarusian (3601 missing cells)
- `bn` — Bengali (3601 missing cells)
- `bs` — Bosnian (3601 missing cells)
- `ca` — Catalan (3601 missing cells)
- `et` — Estonian (3601 missing cells)
- `gl` — Galician (3601 missing cells)
- `gu` — Gujarati (3601 missing cells)
- `kn` — Kannada (3601 missing cells)
- `kk` — Kazakh (3601 missing cells)
- `lv` — Latvian (3601 missing cells)
- `lt` — Lithuanian (3601 missing cells)
- `mk` — Macedonian (3601 missing cells)
- `ml` — Malayalam (3601 missing cells)
- `mr` — Marathi (3601 missing cells)
- `pa` — Punjabi (3601 missing cells)
- `sr` — Serbian (3601 missing cells)
- `sl` — Slovenian (3601 missing cells)
- `sw` — Swahili (3601 missing cells)
- `tl` — Tagalog (3601 missing cells)
- `ta` — Tamil (3601 missing cells)
- `te` — Telugu (3601 missing cells)
- `cy` — Welsh (3601 missing cells)

### Missing cells by language (top gaps)

| Code | Label | Missing cells | Equals-English |
|------|-------|--------------:|---------------:|
| `so` | Somali | 3,601 | 0 |
| `af` | Afrikaans | 3,601 | 0 |
| `sq` | Albanian | 3,601 | 0 |
| `az` | Azerbaijani | 3,601 | 0 |
| `eu` | Basque | 3,601 | 0 |
| `be` | Belarusian | 3,601 | 0 |
| `bn` | Bengali | 3,601 | 0 |
| `bs` | Bosnian | 3,601 | 0 |
| `ca` | Catalan | 3,601 | 0 |
| `et` | Estonian | 3,601 | 0 |
| `gl` | Galician | 3,601 | 0 |
| `gu` | Gujarati | 3,601 | 0 |
| `kn` | Kannada | 3,601 | 0 |
| `kk` | Kazakh | 3,601 | 0 |
| `lv` | Latvian | 3,601 | 0 |
| `lt` | Lithuanian | 3,601 | 0 |
| `mk` | Macedonian | 3,601 | 0 |
| `ml` | Malayalam | 3,601 | 0 |
| `mr` | Marathi | 3,601 | 0 |
| `pa` | Punjabi | 3,601 | 0 |
| `sr` | Serbian | 3,601 | 0 |
| `sl` | Slovenian | 3,601 | 0 |
| `sw` | Swahili | 3,601 | 0 |
| `tl` | Tagalog | 3,601 | 0 |
| `ta` | Tamil | 3,601 | 0 |
| `te` | Telugu | 3,601 | 0 |
| `cy` | Welsh | 3,601 | 0 |
| `bg` | Bulgarian | 3,598 | 0 |
| `hr` | Croatian | 3,598 | 0 |
| `cs` | Czech | 3,598 | 0 |
| `da` | Danish | 3,598 | 0 |
| `fa` | Persian (Farsi) | 3,598 | 0 |
| `fi` | Finnish | 3,598 | 0 |
| `el` | Greek | 3,598 | 0 |
| `he` | Hebrew | 3,598 | 0 |
| `hu` | Hungarian | 3,598 | 0 |
| `id` | Indonesian | 3,598 | 0 |
| `ms` | Malay | 3,598 | 0 |
| `nb` | Norwegian | 3,598 | 0 |
| `ro` | Romanian | 3,598 | 0 |
| `sk` | Slovak | 3,598 | 0 |
| `sv` | Swedish | 3,598 | 0 |
| `th` | Thai | 3,598 | 0 |
| `ur` | Urdu | 3,598 | 0 |
| `nl` | Dutch | 3,597 | 0 |
| `hi` | Hindi | 3,597 | 0 |
| `it` | Italian | 3,597 | 0 |
| `ja` | Japanese | 3,597 | 0 |
| `ko` | Korean | 3,597 | 0 |
| `pl` | Polish | 3,597 | 0 |
| `tr` | Turkish | 3,597 | 0 |
| `uk` | Ukrainian | 3,597 | 0 |
| `vi` | Vietnamese | 3,597 | 0 |
| `ru` | Russian | 3,595 | 0 |
| `ar` | Arabic | 3,584 | 0 |
| `zh-CN` | Chinese (Simplified) | 3,584 | 0 |
| `zh-TW` | Chinese (Traditional) | 3,584 | 0 |
| `fr` | French | 3,584 | 3 |
| `de` | German | 3,584 | 3 |
| `pt` | Portuguese | 3,584 | 2 |
| `es` | Spanish | 3,584 | 2 |

## Machine translation verification (Phase B baseline)

These lists are **informational** — translation routing was not changed in Phase C–F.

- **Hetzner paid stack (`LT_LOAD_ONLY`)**: 13 languages — en, es, fr, de, it, pt, ru, ar, zh, hi, tr, pl, nl
- **OpenAI / Platinum**: effectively all 62 workspace codes
- **Languages requiring future MT verification on Hetzner/Libre path**: 50 of 62

## Catalog consistency checks

- Workspace ⊄ glossary: none
- Glossary ⊄ workspace: none

## Regenerate full gap detail

```bash
pnpm --filter @workspace/api-server glossary:audit
pnpm --filter @workspace/api-server glossary:audit -- --json /tmp/glossary-audit.json
```
