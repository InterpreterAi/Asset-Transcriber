# GitHub Actions workflow files (copy into `.github/workflows/`)

GitHub rejects `git push` for files under `.github/workflows/` when your Personal Access Token does not include the **`workflow`** scope.

## Fix the push (pick one)

1. **Regenerate your PAT** at https://github.com/settings/tokens with scope **`workflow`** (and `repo`), then `git push` again; or  
2. **Copy these YAML files** into the repo on GitHub: **Add file → Create new file** or upload under `.github/workflows/`:
   - `hetzner-translate-cores-verify.yml`
   - `hetzner-translate-cores-deploy.yml`

After they exist on `main`, **Actions → Verify Hetzner translate cores → Run workflow** will appear.

## Green verify without GitHub

On any machine that can reach the worker IP:

```bash
git clone https://github.com/InterpreterAi/Asset-Transcriber.git && cd Asset-Transcriber
pnpm install   # optional if you only need node
node scripts/verify-hetzner-translate-cores.mjs
```

Exit code `0` means both lane `/languages` checks returned HTTP 200.
