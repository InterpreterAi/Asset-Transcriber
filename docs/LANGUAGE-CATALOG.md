# Language catalog (developer guide)

Single source of truth for InterpreterAI workspace language pickers, admin toggles, marketing counts, and interpreter glossary restore targets.

## Canonical module

**Path:** `artifacts/transcription-app/src/lib/workspace-languages.ts`

| Export | Use |
|--------|-----|
| `WORKSPACE_LANGUAGES` | Readonly `{ value, label }[]` — 62 languages |
| `WORKSPACE_LANGUAGE_COUNT` | Dynamic count for marketing / pricing copy |
| `workspaceLanguageCodes()` | BCP-47 code list (glossary, scripts) |
| `workspaceLanguageOptions()` | Mutable copy for React `<select>` |
| `workspaceLanguageLabel(code)` | Display label with base-lang fallback |
| `workspaceLanguageNameMap()` | `Record<code, label>` for legacy call sites |
| `workspaceLanguageCatalogJson()` | JSON export for debug-app static fetch |

**API server re-export:** `artifacts/api-server/src/lib/workspace-languages.ts` (same surface + `workspaceLanguageCodes`).

## Glossary alignment

**Path:** `artifacts/api-server/src/lib/interpreter-glossary.langs.ts`

`INTERPRETER_GLOSSARY_LANG_CODES` is derived from `workspaceLanguageCodes()` — always 62 codes, same order as the workspace catalog.

Glossary JSON files (`artifacts/api-server/data/glossary_*.json`) store per-term `translations` objects. At load, `interpreter-glossary.ts` materializes every language slot; **missing keys fall back to English** (`translations.en`). Curated medical/legal/immigration/insurance strings are preserved; Phase A additions start with English fallback until batch MT fill.

Protected terms (`protected-terms.ts`) use the same language code list.

## Do not duplicate

- Do **not** add hardcoded language arrays in UI, marketing, or routes.
- Do **not** hardcode counts like `"36+ languages"` — import `WORKSPACE_LANGUAGE_COUNT`.
- Do **not** fork Soniox STT hints or `use-transcription.ts` for catalog changes.

## Cinematic / marketing

- `cinematic-languages.ts` derives `CINEMATIC_LANGUAGE_CATALOG` from `WORKSPACE_LANGUAGES`.
- `pricing-copy.ts` uses `SUPPORTED_LANGUAGES_FEATURE` from `WORKSPACE_LANGUAGE_COUNT`.
- `cinematic-content.ts` uses `LANG_COUNT` for dynamic copy strings.

## Debug app static JSON

After editing the catalog:

```bash
node --experimental-strip-types -e "
import { writeFileSync } from 'node:fs';
import { workspaceLanguageCatalogJson } from './artifacts/transcription-app/src/lib/workspace-languages.ts';
writeFileSync('./artifacts/debug-app/public/workspace-languages.json', JSON.stringify(workspaceLanguageCatalogJson(), null, 2));
"
```

## Glossary maintenance scripts

| Script | Purpose |
|--------|---------|
| `pnpm --filter @workspace/api-server glossary:audit` | JSON gap audit vs 62 codes |
| `pnpm --filter @workspace/api-server glossary:verify` | Mask/restore smoke tests |
| `pnpm --filter @workspace/api-server glossary:fill-mt -- --langs af,ca --limit 500` | Batch LibreTranslate fill |
| `pnpm --filter @workspace/api-server exec tsx scripts/language-catalog-report.ts` | Regenerate `docs/LANGUAGE-CATALOG-REPORT.md` |

Fill script (`fill-interpreter-glossary-mt.mjs`) reads target langs from `artifacts/debug-app/public/workspace-languages.json` (excluding `en`).

## Adding a language

1. Append to `WORKSPACE_LANGUAGES` in `workspace-languages.ts` (preserve product order conventions).
2. Regenerate `debug-app/public/workspace-languages.json`.
3. Glossary codes update automatically via `workspaceLanguageCodes()`.
4. Run `glossary:audit` and optionally `glossary:fill-mt` for new code.
5. Update marketing only if copy is not already dynamic (`WORKSPACE_LANGUAGE_COUNT`).
6. Regenerate `docs/LANGUAGE-CATALOG-REPORT.md`.

## Related reports

- **Operational snapshot:** [LANGUAGE-CATALOG-REPORT.md](./LANGUAGE-CATALOG-REPORT.md)
- **Translation tier scope:** `.cursor/rules/translation-tier-scope.mdc`
