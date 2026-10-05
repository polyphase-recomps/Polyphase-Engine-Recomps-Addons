# Polyphase Engine Recomps Addons

Addon registry for **Polyphase Engine Recomps**: native runtimes that let games recompiled from community decompilation projects (found on GitHub and in the decomp community) build and run inside the Polyphase Engine.

No game code, ROMs, disc images or assets are hosted or distributed here. Each port builds from a public decomp source tree against your own legally obtained copy of the game.

# Addons

## Base

| Name | Description |
| --- | --- |
| [Recomp Mod Base](https://github.com/polyphase-recomps/com.recomp.mod.base) | Mod layer shared by the recomp runtimes: mod maps, mod settings, generated settings UI, resolution scaler and Recomp/Mods Lua. |

## Platforms

| Name | Description |
| --- | --- |
| [Game Boy Advance (GBA) Recomp](https://github.com/polyphase-recomps/com.recomp.gba) | Shared runtime for native GBA ports, with the GbaPlayer node that plays a decompiled game in Polyphase. |
| [Nintendo 64 (N64) Recomp](https://github.com/polyphase-recomps/com.recomp.n64) | Shared runtime for natively compiled N64 decomps: libultra shim, F3DEX2 renderer, audio and host backends. |
| [PlayStation (PS1) Recomp](https://github.com/polyphase-recomps/com.recomp.ps1) | PS1 recompilation runtime that builds fully decompiled PS1 games natively and plays them with the Ps1Player node. |


# Registry Manifest

`manifest.json` is the machine-readable index of this registry. It carries each addon's id, display name, summary, category, tags, version, author, engine/plugin info (`target`, `apiVersion`, `entrySymbol`, `binaryName`), platforms, added build targets, dependencies, clone URL and raw `package.json` / README / documentation links , so the engine and tooling can resolve addons without crawling GitHub.

```
https://raw.githubusercontent.com/polyphase-recomps/Polyphase-Engine-Recomps-Addons/main/manifest.json
```

It is generated, do not edit it by hand:

| File                                     | Role                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                         | The list of addon repositories (source of truth for what is in the registry).                                                       |
| `registry.config.json`                 | Registry metadata, categories, and hand-authored per-addon overrides (summary, tags, category, display name).                       |
| `tools/build-manifest.mjs`             | Pulls each repo's `package.json` + GitHub metadata and writes `manifest.json`.                                                  |
| `.github/workflows/build-manifest.yml` | Rebuilds and commits `manifest.json` on every commit, nightly, on `workflow_dispatch`, and on an `addon-updated` repository dispatch. |

Rebuild locally (Node 18+; `GH_TOKEN` optional, raises the API rate limit):

```bash
node tools/build-manifest.mjs           # write manifest.json
node tools/build-manifest.mjs --check   # fail if manifest.json is out of date
```

Want your own registry (studio, team or personal addons)? See [CreateYourOwnAddonsRepo.md](CreateYourOwnAddonsRepo.md) for setup, configuration and the GitHub Actions permissions the workflow needs.

An addon repo can refresh the registry as soon as it publishes:

```bash
gh api repos/polyphase-recomps/Polyphase-Engine-Recomps-Addons/dispatches -f event_type=addon-updated
```

# Contributing

To add a recomp addon, fork the repository and submit a pull request adding your repository to `package.json` and `README.md`. Game packages are named `com.recomp.<game>` and land in the **Games** category; platform runtimes are `com.recomp.<platform>`. Add any hand-written summary/tags for your addon to `registry.config.json`; `manifest.json` is rebuilt automatically.

Do not submit anything that contains or downloads copyrighted game code or assets.
