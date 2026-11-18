/**
 * Checks that the build this run uploaded reached TestFlight with the export-compliance
 * question already answered. TestFlight reports an unanswered build as "Missing
 * Compliance", and no tester can install it.
 *
 * It only checks. mobile/app.json declares ITSAppUsesNonExemptEncryption: false, so
 * Apple answers every build itself while processing it, and there is nothing here to
 * write. If a build ever comes back unanswered, that declaration has stopped reaching
 * the binary — the usual way is its infoPlist section disappearing from the prebuild —
 * and the run should say so rather than paper over the symptom with an API call.
 *
 * The run's own version and build number come in as IOS_MARKETING_VERSION and
 * IOS_BUILD_NUMBER, because the newest build at upload time is still the previous one.
 *
 * altool reports success while the package is still queued with Apple, and ingestion has
 * ranged from about three minutes to over half an hour for the same binary, so the wait
 * window is generously wide: a healthy upload must not fail a run just for being slow.
 */
import { createPrivateKey, sign } from 'node:crypto';

const API = 'https://api.appstoreconnect.apple.com';
const issuer = (process.env.ASC_ISSUER_ID || '').trim();
const keyId = (process.env.ASC_KEY_ID || '').trim();
const pem = (process.env.ASC_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
const BUNDLE = (process.env.APPLE_BUNDLE_ID || 'us.inotel.mintmark').trim();
const VERSION = (process.env.IOS_MARKETING_VERSION || '').trim();
const BUILD = (process.env.IOS_BUILD_NUMBER || '').trim();
const WAIT_MINUTES = Number(process.env.COMPLIANCE_WAIT_MINUTES || 45);
const POLL_SECONDS = 20;

for (const [name, value] of [['ASC_ISSUER_ID', issuer], ['ASC_KEY_ID', keyId], ['ASC_PRIVATE_KEY', pem], ['IOS_BUILD_NUMBER', BUILD]]) {
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
}

const key = createPrivateKey({ key: pem, format: 'pem' });
let token = '';
let minted = 0;

function bearer() {
  const now = Math.floor(Date.now() / 1000);
  if (token && now - minted < 600) return token;
  const head = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })).toString('base64url');
  // JOSE wants the raw r||s pair; node's default DER encoding is rejected by Apple.
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  token = `${head}.${body}.${sig}`;
  minted = now;
  return token;
}

async function call(path) {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${bearer()}`, accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status} · ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const apps = await call(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE)}&fields[apps]=name,bundleId`);
const app = apps?.data?.[0];
if (!app) {
  console.error(`no App Store Connect app for ${BUNDLE}`);
  process.exit(1);
}
console.log(`${app.attributes?.name} (${BUNDLE}): build ${BUILD} under ${VERSION}`);

const deadline = Date.now() + WAIT_MINUTES * 60 * 1000;
let answer = null;
let listed = false;
while (Date.now() < deadline && answer === null) {
  const res = await call(
    `/v1/builds?filter[app]=${app.id}&limit=50&include=preReleaseVersion&sort=-uploadedDate&fields[builds]=version,processingState,usesNonExemptEncryption,preReleaseVersion`
  );
  const pre = new Map((res?.included || []).map((row) => [row.id, row.attributes?.version]));
  const build = (res?.data || []).find(
    (row) => String(row.attributes?.version) === BUILD && pre.get(row.relationships?.preReleaseVersion?.data?.id) === VERSION
  );
  if (!build) {
    console.log(`  no build ${BUILD} under ${VERSION} yet; Apple has not listed it, waiting ${POLL_SECONDS}s`);
    await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
    continue;
  }
  listed = true;
  console.log(`  build ${BUILD} (${VERSION}) is ${build.attributes?.processingState}, compliance=${build.attributes?.usesNonExemptEncryption}`);
  answer = build.attributes?.usesNonExemptEncryption ?? null;
  if (answer === null) {
    // Processing may not have reached the declaration yet; give it the same window.
    await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
  }
}

if (answer === false) {
  console.log('  answered · ITSAppUsesNonExemptEncryption reached the binary');
  process.exit(0);
}
if (!listed) {
  // Nothing to conclude about the declaration: altool reported success, and Apple
  // still had the package in PROCESSING past the window, so it never appeared here.
  console.error(`::error::Apple never listed build ${BUILD} under ${VERSION} within ${WAIT_MINUTES} minutes; the upload did not finish processing, so compliance was not checked`);
  process.exit(1);
}
console.error(
  answer === true
    ? '::error::this build declares non-exempt encryption; TestFlight will hold it until that is answered deliberately'
    : `::error::build ${BUILD} under ${VERSION} is unanswered — app.json's ITSAppUsesNonExemptEncryption: false is not reaching the binary`
);
process.exit(1);
