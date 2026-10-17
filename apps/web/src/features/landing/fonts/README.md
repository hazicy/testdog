Landing typography uses Inter for Latin text and MiSans for Chinese, with variable weights from 400 to 600. Product previews retain the workspace font stack.

- Inter: https://github.com/google/fonts/tree/main/ofl/inter — license in `Inter-OFL.txt`.
- MiSans: https://hyperos.mi.com/font/zh/ — license in `MiSans-License.pdf`.

`misans-landing.woff2` is a local subset of the official MiSans variable font, covering the Chinese and English `landing` message namespaces plus printable ASCII. Regenerate the subset from the official font when adding characters to those messages. Do not send project copy to external font services.

Only Hero headlines use the local ChillBitmap 16px subset (`hero-pixel.woff2`), covering the Chinese and English `heroFirst` and `heroSecond` messages. Other landing text uses Inter/MiSans, and embedded product previews retain workspace typography. Source: https://github.com/Warren2060/ChillBitmap/releases/tag/v2.502. License and font embedding exception: `ChillBitmap-License.md`. Regenerate the subset when changing either headline.
