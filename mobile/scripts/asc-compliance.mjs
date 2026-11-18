/**
 * Answers the TestFlight export-compliance question for the build a run just uploaded.
 *
 * altool exits as soon as Apple has the bytes, and the build itself shows up in App
 * Store Connect minutes later. Until its encryption question is answered, TestFlight
 * lists the build as "Missing Compliance" and no tester can install it. The answer is
 * the same for every Mintmark build — the app ships no cipher of its own and uses only
 * Apple's — but App Store Connect asks per build, and only the API can answer it.
 *
 * The run's own version and build number come in as IOS_MARKETING_VERSION and
 * IOS_BUILD_NUMBER, because the newest build at upload time is still the previous one:
 * matching on the version alone would answer a build that was already answered and
 * leave the new one blocked. It refuses to write `true` or to overwrite an existing
 * `true`, since that is a declaration about the app's cryptography rather than a
 * housekeeping step.
 */
import { createPrivateKey, sign } from 'node:crypto';

const API = 'https://api.appstoreconnect.apple.com';
const issuer = (process.env.ASC_ISSUER_ID || '').trim();
const keyId = (process.env.ASC_KEY_ID || '').trim();
const pem = (process.env.ASC_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
const BUNDLE = (process.env.APPLE_BUNDLE_ID || 'us.inotel.mintmark').trim();
const VERSION = (process.env.IOS_MARKETING_VERSION || '').trim();
const BUILD = (process.env.IOS_BUILD_NUMBER || '').trim();
const WAIT_MINUTES = Number(process.env.COMPLIANCE_WAIT_MINUTES || 20);

if (!issuer || !keyId || !pem) {
  console.error('ASC_ISSUER_ID / ASC_KEY_ID / ASC_PRIVATE_KEY are not all set.');
  process.exit(1);
}
if (!BUILD) {
  console.error('IOS_BUILD_NUMBER is not set; it must be the CFBundleVersion this run stamped.');
  process.exit(1);
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

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${bearer()}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const detail = (data?.errors || [])
      .map((e) => `${e.status} ${e.code}: ${e.title}${e.detail ? ` — ${e.detail}` : ''}`)
      .join('; ');
    throw new Error(`${method} ${path} → HTTP ${res.status}${detail ? ` · ${detail}` : ` · ${text.slice(0, 300)}`}`);
  }
  return data;
}

async function appId() {
  const res = await call('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE)}&fields[apps]=name,bundleId`);
  const row = res?.data?.[0];
  if (!row) throw new Error(`no App Store Connect app for ${BUNDLE}`);
  return { id: row.id, name: row.attributes?.name };
}

/** Waits for this run's build, then answers it. Returns false only on a real failure. */
async function answer(app) {
  const deadline = Date.now() + WAIT_MINUTES * 60 * 1000;
  while (Date.now() < deadline) {
    const res = await call(
      'GET',
      `/v1/builds?filter[app]=${app}&limit=50&include=preReleaseVersion&sort=-uploadedDate&fields[builds]=version,processingState,usesNonExemptEncryption,preReleaseVersion`
    );
    const pre = new Map((res?.included || []).map((row) => [row.id, row.attributes?.version]));
    const target = (res?.data || []).find(
      (row) =>
        String(row.attributes?.version) === BUILD &&
        pre.get(row.relationships?.preReleaseVersion?.data?.id) === VERSION
    );
    if (!target) {
      console.log(`  no build ${BUILD} under ${VERSION} yet; Apple has not listed it, waiting 20s`);
      await new Promise((resolve) => setTimeout(resolve, 20000));
      continue;
    }
    const state = target.attributes?.processingState;
    const answered = target.attributes?.usesNonExemptEncryption;
    console.log(`  build ${BUILD} (${VERSION}) is ${state}, compliance=${answered}`);
    if (answered === true) {
      console.error('  this build declares non-exempt encryption; not answering that here');
      return false;
    }
    if (answered === false) {
      console.log('  already answered · nothing to change');
      return true;
    }
    await call('PATCH', `/v1/builds/${target.id}`, {
      data: { type: 'builds', id: target.id, attributes: { usesNonExemptEncryption: false } },
    });
    const after = await call('GET', `/v1/builds/${target.id}?fields[builds]=version,usesNonExemptEncryption`);
    const now = after?.data?.attributes?.usesNonExemptEncryption;
    console.log(`  answered · encryption=${now}`);
    return now === false;
  }
  console.error(`  build ${BUILD} under ${VERSION} did not appear within ${WAIT_MINUTES} minutes`);
  return false;
}

const { id, name } = await appId();
console.log(`${name} (${BUNDLE}): build ${BUILD} under ${VERSION}`);
process.exit((await answer(id)) ? 0 : 1);
