# vendor

## xlsx-0.20.3.tgz

SheetJS Community Edition 0.20.3, licence Apache-2.0 (see `xlsx-LICENSE.txt`), no dependencies.

SheetJS stopped publishing to npm after 0.18.5, which has two high advisories with no fix on npm
(GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). The vendor distributes later versions only from its own CDN, so the
tarball is committed here and `package.json` depends on it with `file:vendor/xlsx-0.20.3.tgz`. Installs and builds
then never reach the CDN.

- Source: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
- sha256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`

To upgrade, download the new tarball from https://cdn.sheetjs.com, replace the file, update the `file:` path in
`package.json`, run `npm install`, and run the tests under several `TZ` values (the library reads dates as UTC
since 0.20).
