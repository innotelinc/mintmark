// Seeds one Mintmark collection with real appraisals made from public-domain
// coin photographs, so the iOS screenshots show the app doing its actual job.
// See README.md in this directory.
import fs from 'node:fs'
import path from 'node:path'

const API = (process.env.MINTMARK_API_URL ?? 'https://mint.innotel.tech').replace(/\/+$/, '')
const VISITOR = process.env.SEED_VISITOR ?? 'a1b2c3d4e5f60718'
const UA = 'MintmarkScreenshots/1.0 (support@innotel.us)'
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const FIXTURES = path.join(HERE, 'fixtures')

const COINS = [
  ['File:Washington Quarter Silver 1944S Obverse.png', 'quarter-1944-s'],
  ['File:1871 Proof Indian Head cent obverse.jpg', 'indian-head-1871'],
  ['File:1888 Indian Head cent-obverse.jpg', 'indian-head-1888'],
]

async function commonsFile(title, width) {
  const query =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
    `&iiprop=url|extmetadata&iiurlwidth=${width}&titles=${encodeURIComponent(title)}`
  const page = Object.values((await (await fetch(query, { headers: { 'User-Agent': UA } })).json()).query.pages)[0]
  if (!page.imageinfo) throw new Error(`no image at ${title}`)
  const info = page.imageinfo[0]
  return { url: info.thumburl ?? info.url, license: info.extmetadata?.LicenseShortName?.value ?? 'unknown' }
}

/** Commons renders .png as .png even when the requested name says .jpg. */
function sniff(buffer) {
  if (buffer[0] === 0x89 && buffer.subarray(1, 4).toString() === 'PNG') return ['image/png', 'png']
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return ['image/jpeg', 'jpg']
  if (buffer.subarray(8, 12).toString() === 'WEBP') return ['image/webp', 'webp']
  throw new Error('not a supported image')
}

async function fetchImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`download failed ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

fs.mkdirSync(FIXTURES, { recursive: true })

for (const [title, slug] of COINS) {
  try {
    const big = await commonsFile(title, 1280)
    const small = await commonsFile(title, 200)
    const image = await fetchImage(big.url)
    const thumb = await fetchImage(small.url)
    const [mime, ext] = sniff(image)
    fs.writeFileSync(path.join(FIXTURES, `${slug}-1280.${ext}`), image)
    fs.writeFileSync(path.join(FIXTURES, `${slug}-200.${ext}`), thumb)

    const started = Date.now()
    const res = await fetch(`${API}/api/appraisals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-mintmark-visitor': VISITOR },
      body: JSON.stringify({
        image: `data:${mime};base64,${image.toString('base64')}`,
        thumb: `data:${mime};base64,${thumb.toString('base64')}`,
        note: '',
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      console.log(`${slug}: ${res.status} ${JSON.stringify(body).slice(0, 160)}`)
      continue
    }
    const a = body.appraisal
    console.log(
      `${slug} (${Date.now() - started}ms): ${a.identified ? a.name : 'not identified'} · grade ${a.grade} ` +
        `· $${a.valueLow}-${a.valueHigh} · ${a.rarity} · licence ${big.license}`,
    )
  } catch (error) {
    console.log(`${slug}: ${error.message}`)
  }
}

const state = await fetch(`${API}/api/state`, { headers: { 'x-mintmark-visitor': VISITOR } }).then((r) => r.json())
console.log(`visitor ${VISITOR}: ${state.usage.used}/${state.usage.limit} today, deployment ${state.deployment.used}/${state.deployment.limit}`)
