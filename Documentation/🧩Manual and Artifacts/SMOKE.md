# Smoke test — EDITORS.ElevationBuilder

Is `EDITORS.ElevationBuilder` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**✅ PASS** — 3/3 checks, since 2026-11-12 00:27 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.EDITORS.ElevationBuilder](https://github.com/LikeDotAudio/APK.softapp.EDITORS.ElevationBuilder.git) | ✅ | HEAD is on origin |
| web | [index.html](https://apk.audio/APK%3ASoftapps/EDITORS/EDITORS.ElevationBuilder/index.html) | ✅ | HTTP 200 |
| app | `OS/Elevation Builder` → `PODS/POD.THIN/Softapps/EDITORS/EDITORS.ElevationBuilder/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/EDITORS/EDITORS.ElevationBuilder`

<!-- smoke:sig 1fa95862ef84 since 2026-11-12 00:27 EST -->
