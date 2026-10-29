Hi Kevin,

We have prepared the minimal runnable iOS project requested by Engineering:

https://github.com/eikhunter/ApryseWatermarkRepro

The repository contains only synthetic data. It uses React Native 0.83.4,
`@pdftron/react-native-pdf` 3.0.4-29, and PDFNet iOS 12.1.0.30566. It generates
linearized 6,154-page (~20 MB) and 11,717-page (~52 MB) PDFs, serves them over a
range-enabled local HTTP server, and applies our tiled-image watermark pattern
with `PTStamper StampImage` under `DocLock:NO`. The viewer remains concealed
until native code confirms successful stamping.

The repro deliberately uses a fresh Apryse cache directory and a cache-busted
URL for each run. Without this, repeat opens are served from the SDK cache and
do not reproduce the cold-open path.

Representative Simulator results using the default local-server profile:

- 6,154 pages: ~3.75 s download + ~1.39 s stamp, ~5.1 s fail-closed; one run
  spent ~762 ms waiting for the write lock.
- 11,717 pages: ~7.7 s download + ~1.19 s stamp, ~8.9 s fail-closed.

These are intentionally best-case local-network numbers. The problem is not
that `StampImage` alone always takes tens of seconds. The problem is that the
supported native architecture cannot expose a page while guaranteeing that it
has been watermarked: the observed callback/lock ordering makes the
fail-closed delay effectively download activity plus whole-document mutation.
Real network latency and concurrent viewer/downloader pressure increase that
window.

This is consistent with our production evidence over a 90-day period:

- downloader update-page hang family: 990 events / 223 users
- PTStamper hang family: 216 events / 142 users
- CloseDoc hang family: 188 events / 149 users
- representative DocLock issue: 483 occurrences / 304 users
- representative CloseDoc issue: 188 occurrences / 147 users, including
  hangs approaching 78 seconds

Please have Engineering run the cold-cache cases and confirm:

1. Whether there is any supported native iOS architecture that permits
   first-page streaming while guaranteeing fail-closed watermark display,
   without mutating every page under a document write lock.
2. Whether a render-time watermark callback equivalent to WebViewer
   `setWatermark()` can be added to the native SDK and React Native wrapper.
3. The documented cancellation and teardown sequence for an active
   `OpenUrlAsync` download when `CloseDoc` also requires a write lock.
4. Whether newer PDFNet versions contain relevant fixes for the downloader,
   stamper, or close-document lock contention.

We will submit the large-document progressive/cancellable search problem as a
separate support ticket, as requested.

Thanks,
Eik
