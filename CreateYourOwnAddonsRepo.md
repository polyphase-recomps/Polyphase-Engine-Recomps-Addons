# Create Your Own Addons Repo

This repository is a **Polyphase addon registry**: a list of addon repositories plus a generated `manifest.json` that the engine and tooling can read directly, without crawling GitHub.

You can run your own for a studio, a team, or just your personal addons, and point the engine at it alongside (or instead of) the official one. This guide covers setting the repo up, wiring the GitHub Actions workflow, and the settings you must enable for the automation to work.

---

## 1. What you end up with

A repo containing:

| File                                     | Role                                                                                                                        | Edit by hand? |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `package.json`                         | The list of addon repository URLs; the source of truth for what is in your registry.                                      | ✅ Yes        |
| `registry.config.json`                 | Registry metadata (id, name, homepage), categories, and per-addon overrides (summary, tags, category, display name).        | ✅ Yes        |
| `README.md`                            | Human-facing index of your addons.                                                                                          | ✅ Yes        |
| `tools/build-manifest.mjs`             | Generator. Reads the two files above, pulls each addon repo's `package.json` + GitHub metadata, writes `manifest.json`. | ⚙️ Rarely   |
| `.github/workflows/build-manifest.yml` | Rebuilds and commits `manifest.json` automatically.                                                                       | ⚙️ Rarely   |
| `manifest.json`                        | **Generated.** The machine-readable index your engine consumes.                                                       | ❌ Never      |

And a stable raw URL your engine can fetch:

```
https://raw.githubusercontent.com/<your-org>/<your-repo>/main/manifest.json
```

---

## 2. Create the repo

### Option A: fork or copy the official registry (fastest)

1. Fork `Polyphase-Labs/Polyphase-Engine---Official-Addons`, or click **Use this template** if you have templating enabled, or just download it and push it to a new repo.
2. Delete the addons you do not want from `package.json`, `README.md` and the `overrides` block in `registry.config.json`.
3. Continue at [step 3](#3-list-your-addons).

> **Forks disable workflows by default.** Open the **Actions** tab in your fork and click *"I understand my workflows, go ahead and enable them"* before anything will run. A fresh (non-fork) repo does not need this.

### Option B: start from scratch

Create a new repository and copy these four files from the official registry:

```
package.json
registry.config.json
tools/build-manifest.mjs
.github/workflows/build-manifest.yml
```

Then replace the contents of `package.json`:

```json
{
    "name": "My Studio Polyphase Addons",
    "addons": [
        "https://github.com/my-org/com.mystudio.system.inventory",
        "https://github.com/my-org/com.mystudio.formats.gaussiansplat"
    ]
}
```

---

## 3. List your addons

Every entry in `addons` is a plain GitHub repository URL. The generator reads each repo's own `package.json` (the same file the engine already uses for the addon), so you do not repeat version, description, dependencies or api version here.

Each addon repo should have a root `package.json` shaped like this:

```json
{
    "name": "com.mystudio.system.inventory",
    "displayName": "My Studio Inventory",
    "author": "My Studio",
    "description": "Grid inventory with stacking, weight and equip slots.",
    "version": "0.1.0",
    "dependencies": {
        "com.polyphase.system.items.core": "^1.0.0"
    },
    "keywords": ["inventory", "items", "ui"],
    "native": {
        "target": "engine",
        "sourceDir": "Source",
        "binaryName": "com.mystudio.system.inventory",
        "entrySymbol": "PolyphasePlugin_GetDesc",
        "apiVersion": 4,
        "resolveMode": "source",
        "binaries": []
    }
}
```

What the generator picks up automatically:

- `name` → package `id`, `displayName` → `name`, plus `description`, `version`, `author`, `keywords` → `tags`
- `dependencies` (object **or** array form) → normalized `dependencies`
- `native.*` → `engine.target`, `engine.apiVersion`, `engine.entrySymbol`, `engine.binaryName`, `engine.resolveMode`
- `native.buildTargets` → `buildTargets` (build target addons)
- `nativePerPlatform` keys → `platforms`
- `binaries` / `native.binaries` → `prebuiltBinaries`
- From GitHub: default branch, license, topics (merged into tags), last push time, latest release tag, and whether the repo has a `README.md` / `Documentation` (or `Docs`) folder

---

## 4. Configure the registry

Edit `registry.config.json`. At minimum change the `registry` block:

```json
{
    "registry": {
        "manifestVersion": 1,
        "id": "mystudio-addons",
        "name": "My Studio Polyphase Addons",
        "description": "Internal Polyphase addons for My Studio projects.",
        "vendor": "My Studio",
        "homepage": "https://github.com/my-org/my-addons"
    }
}
```

**Categories.** Keep the default five (`examples`, `systems`, `editor`, `formats`, `build-targets`) or define your own. Categories are matched by `id`, so if you add a new one, use it in the overrides too.

**Overrides.** Anything the addon's own `package.json` cannot express: a short one-line `summary`, curated `tags`, a forced `category`, a nicer display `name`:

```json
{
    "overrides": {
        "com.mystudio.system.inventory": {
            "name": "My Studio Inventory",
            "summary": "Grid inventory with stacking and equip slots.",
            "category": "systems",
            "tags": ["inventory", "items", "ui", "rpg"]
        }
    }
}
```

Overrides win over repo data, so use them sparingly. Anything you can put in the addon's own `package.json` should live there instead, where it stays correct on its own.

**Custom id prefixes.** Categories are inferred from the addon id (`*.build.target.*` → build-targets, `com.polyphase.editor.*` → editor, and so on). If your ids use a different convention (`com.mystudio.*`), either set `category` per addon in the overrides, or edit `CATEGORY_RULES` near the top of `tools/build-manifest.mjs`:

```js
const CATEGORY_RULES = [
    [/\.build\.target\./, 'build-targets'],
    [/^com\.mystudio\.editor\./, 'editor'],
    [/^com\.mystudio\.formats\./, 'formats'],
    [/^com\.mystudio\./, 'systems'],
]
```

---

## 5. Build it locally

Requires **Node 18+** (uses the built-in `fetch`). No `npm install`, no dependencies.

```bash
node tools/build-manifest.mjs           # writes manifest.json
node tools/build-manifest.mjs --check   # exits 1 if manifest.json is out of date
```

Unauthenticated GitHub API calls are limited to 60/hour, and the script makes ~4 calls per addon. Set a token to raise that to 5,000/hour:

```bash
# bash / WSL
export GH_TOKEN=$(gh auth token)

# PowerShell
$env:GH_TOKEN = (gh auth token)
```

The script warns (without failing) about empty repos, addons whose declared dependency is not in your registry, duplicate ids, and malformed `package.json` files. Read those warnings; they are usually real problems.

---

## 6. Enable GitHub Actions

This is the part people get stuck on. The workflow needs **permission to push a commit back to your repo**.

### 6.1 Allow Actions to run

**Settings → Actions → General → Actions permissions**

- Choose **Allow all actions and reusable workflows**, or
- **Allow `<org>` actions, and select non-`<org>` actions** with *"Allow actions created by GitHub"* ticked (the workflow only uses `actions/checkout` and `actions/setup-node`).

If your organization restricts Actions policy at the org level, an org owner has to allow it there first (**Organization Settings → Actions → General**).

### 6.2 Give the workflow write access

**Settings → Actions → General → Workflow permissions**

- Select **Read and write permissions**.

Without this, `GITHUB_TOKEN` is read-only and the commit step fails with `remote: Permission to <repo> denied to github-actions[bot]` or `403`.

The workflow also declares `permissions: contents: write` on the build job, but a repo-level *read-only* setting still overrides it, so you must flip this switch.

### 6.3 Fork? Enable workflows

**Actions tab → "I understand my workflows, go ahead and enable them"**. Forks never run workflows until you do this, including scheduled ones.

### 6.4 Branch protection on `main`

If `main` is protected, the bot's push will be rejected. Pick one:

- Add an exception: **Settings → Rules / Branches →** allow `github-actions[bot]` to bypass the ruleset, or
- Let the workflow open a PR instead of committing (replace the commit step with `peter-evans/create-pull-request`), and enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or
- Run the generator locally and commit `manifest.json` yourself; the PR `--check` job will keep you honest.

### 6.5 Private addon repos

`GITHUB_TOKEN` can only read the repo it runs in. If any addon repo in your list is private, create a **fine-grained personal access token** with **Contents: Read-only** (and **Metadata: Read-only**) on those repos, then add it as a secret:

**Settings → Secrets and variables → Actions → New repository secret**

- Name: `REGISTRY_TOKEN`
- Value: your token

The workflow already prefers it: `GH_TOKEN: ${{ secrets.REGISTRY_TOKEN || secrets.GITHUB_TOKEN }}`.

### 6.6 Scheduled runs go dormant

GitHub disables `schedule:` triggers in a repository after **60 days without activity**, and emails you when it does. Any push or a manual **Run workflow** re-arms it.

---

## 7. When the workflow runs

`.github/workflows/build-manifest.yml` triggers on:

| Trigger                                                                                          | Effect                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Every commit pushed to any branch                                                                | Rebuild + commit back to that branch if changed                          |
| Nightly schedule (`17 6 * * *` UTC)                                                            | Picks up version / release / description changes made in the addon repos |
| **Actions → Build manifest → Run workflow** (`workflow_dispatch`)                      | Manual rebuild                                                           |
| `repository_dispatch` type `addon-updated`                                                   | On-demand rebuild triggered by an addon repo                             |
| Pull request from a fork                                                                         | Runs `--check` only, no commit                                        |

The commit is skipped when nothing changed, and `manifest.json`'s `updated` field is derived from addon activity rather than build time, so idle runs produce no commit noise. The bot's own commit ends with `[skip ci]`, which GitHub honours by not starting another run, so there is no rebuild loop.

Because it runs on every commit, a push that only touches the README still rebuilds; the run finishes in under a minute and commits nothing when the manifest is already current. If you would rather only rebuild when the inputs change, put the path filter back:

```yaml
  push:
    branches: ['**']
    paths:
      - package.json
      - registry.config.json
      - tools/build-manifest.mjs
      - .github/workflows/build-manifest.yml
```

### Refresh instantly when an addon publishes

From anywhere with the `gh` CLI:

```bash
gh api repos/<your-org>/<your-repo>/dispatches -f event_type=addon-updated
```

Or as a step in each addon repo's own release workflow. This needs a PAT with **Contents: Read and write** (or **Metadata + Contents**) on the *registry* repo, stored in the addon repo as `REGISTRY_DISPATCH_TOKEN`:

```yaml
# .github/workflows/notify-registry.yml (in the ADDON repo)
name: Notify registry
on:
  release:
    types: [published]
  push:
    branches: [main]
    paths: [package.json]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Ping addon registry
        env:
          GH_TOKEN: ${{ secrets.REGISTRY_DISPATCH_TOKEN }}
        run: |
          gh api repos/<your-org>/<your-repo>/dispatches \
            -f event_type=addon-updated
```

Update the `<your-org>/<your-repo>` placeholders, including the comment block at the top of `build-manifest.yml` and your `README.md`, which still reference the official registry after a fork.

---

## 8. Point the engine at your registry

Consume the raw manifest URL:

```
https://raw.githubusercontent.com/<your-org>/<your-repo>/main/manifest.json
```

Notes for whatever consumes it:

- `manifestVersion` is `1`. Treat an unknown higher number as "newer than I understand" rather than an error.
- Fields are always present; unknown values are `null`, and lists are `[]`.
- `platforms: []` means *no platform restriction was declared*, not *no platforms supported*.
- `status` is `published`, `unpublished` (repo has no content yet) or `archived`; hide or badge non-published entries.
- `repository.clone` + `repository.branch` is what you install from; `urls.manifest` is the addon's live `package.json` if you want to re-verify a version before installing.
- `prebuiltBinaries[].type: "releaseAsset"` means the file is attached to the release named in `latestRelease.tag`.
- Raw GitHub URLs are cached for ~5 minutes; don't expect a push to be visible instantly.

Pinning to a tag instead of `main` (`.../<your-repo>/v1/manifest.json`) gives your users a stable snapshot you control.

---

## 9. Troubleshooting

| Symptom                                             | Cause / fix                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Permission to ... denied to github-actions[bot]` | Workflow permissions are read-only → §6.2. Or `main` is protected → §6.4.                        |
| `GitHub 403` during fetch                         | Rate limited (unauthenticated) or a private repo → set `GH_TOKEN` / `REGISTRY_TOKEN` (§6.5).     |
| `repository not found: org/name`                  | Typo in `package.json`, repo renamed, or it is private and the token cannot see it.                  |
| Workflow never runs                                 | Fork with workflows disabled (§6.3), or the schedule went dormant after 60 idle days (§6.6).         |
| An addon lands in the wrong category                | Set `category` in `registry.config.json` overrides, or extend `CATEGORY_RULES` (§4).            |
| `! <id> depends on unlisted addon: <dep>`         | The addon declares a dependency that is not in your registry. Add it, or accept that resolution fails. |
| `! <id> is unpublished`                           | That repo is empty. Push its source, or remove it from `package.json` until it is ready.             |
| `manifest.json is out of date` on a PR            | Run `node tools/build-manifest.mjs` and commit the result.                                           |
| Package id is a repo name, not `com.*`            | The addon repo has no root `package.json`, so the generator fell back to the repo name. Add one.     |

---

## 10. Checklist

- [ ] Repo created (fork or fresh) with `package.json`, `registry.config.json`, `tools/`, `.github/workflows/`
- [ ] Your addon repo URLs listed in `package.json`
- [ ] Every addon repo has a valid root `package.json`
- [ ] `registry` block in `registry.config.json` updated (id, name, vendor, homepage)
- [ ] `node tools/build-manifest.mjs` runs clean locally
- [ ] Actions allowed (§6.1) and set to **Read and write permissions** (§6.2)
- [ ] Workflows enabled if this is a fork (§6.3)
- [ ] `REGISTRY_TOKEN` secret added if any addon repo is private (§6.5)
- [ ] Placeholder org/repo names replaced in the workflow comment and `README.md`
- [ ] First run triggered via **Actions → Build manifest → Run workflow**, `manifest.json` committed
- [ ] Engine pointed at your raw `manifest.json` URL
