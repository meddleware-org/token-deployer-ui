// Regenerates public/og-image.png (1200x630 social card) via headless Chrome.
// Run from the app dir: `node scripts/gen-og-image.mjs`. Re-run if branding changes.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../public/og-image.png', import.meta.url))
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
body{width:1200px;height:630px;background:linear-gradient(135deg,#0b1120 0%,#111c33 60%,#0e2a3f 100%);color:#f4f7fb;display:flex;flex-direction:column;justify-content:center;padding:80px}
.badge{display:inline-block;font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:#6ea8fe;border:2px solid #2b3a55;border-radius:999px;padding:10px 26px;width:max-content;margin-bottom:36px}
h1{font-size:82px;line-height:1.04;font-weight:800;letter-spacing:-.02em;margin-bottom:28px}
h1 .accent{color:#6ea8fe}
p{font-size:34px;line-height:1.35;color:#aebfd6;max-width:960px}
.row{display:flex;gap:18px;margin-top:52px}
.chip{font-size:24px;color:#cfe0f7;background:#16233d;border:1px solid #26365a;border-radius:10px;padding:12px 20px}
.url{position:absolute;bottom:56px;right:80px;font-size:26px;color:#6ea8fe;font-weight:600}
</style></head><body>
<div class="badge">Sui &middot; client-side</div>
<h1>Create your own <span class="accent">Sui coin</span><br>in the browser</h1>
<p>Your wallet signs and pays gas &mdash; nothing is compiled or signed on a server. Keep the full, verifiable source package.</p>
<div class="row"><div class="chip">No server</div><div class="chip">No custody</div><div class="chip">Full source included</div></div>
<div class="url">tokens.meddleware.co.uk</div>
</body></html>`

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'networkidle' })
writeFileSync(OUT, await page.screenshot({ type: 'png' }))
await browser.close()
console.log('wrote', OUT)
