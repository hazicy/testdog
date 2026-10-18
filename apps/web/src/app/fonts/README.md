# Workspace typography

`misans-ui.woff2` is the official MiSans variable font, locally compressed to WOFF2 with the weight axis restricted to 400–600. It retains the full character coverage so user-created case names use the same typeface as interface copy. The landing page uses a separate, smaller subset of this font.

Source: https://hyperos.mi.com/font/zh/
License: [MiSans license](../../features/landing/fonts/MiSans-License.pdf).

To reproduce with FontTools and Brotli installed, load the official `MiSansVF.ttf`, instantiate its `wght` axis to `(400, 600)` with `fontTools.varLib.instancer.instantiateVariableFont`, set `font.flavor = 'woff2'`, and save. Missing empty entries in the source's `gvar.variations` must first be initialized to `[]` for every glyph in `font.getGlyphOrder()`.
