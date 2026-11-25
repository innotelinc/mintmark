/**
 * Attaches an already-uploaded build to an App Store version and writes that
 * version's "What's New". It never submits anything for review: the review
 * submission is a separate, deliberate act.
 *
 *   node scripts/asc-version.mjs
 *
 * Environment, the same four secrets the TestFlight job uses:
 *   ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY
 * plus APP_ID, VERSION_ID, BUILD_NUMBER, and DO_ATTACH / DO_WHATS_NEW.
 *
 * The build is read back before it is attached: a build Apple is still
 * processing, or one that has expired, cannot be attached and the error would
 * otherwise only show up as a 409 later.
 */

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API = 'https://api.appstoreconnect.apple.com';

// store.json at the repository root is the one record of what Apple holds. The
// workflow hands the values in through the environment; reading the same file
// here means a hand-run cannot act on a version the repository does not claim.
const STORE = JSON.parse(readFileSync(new URL('../../store.json', import.meta.url), 'utf8'));

const keyId = (process.env.ASC_KEY_ID || '').trim();
const issuer = (process.env.ASC_ISSUER_ID || '').trim();
const pem = (process.env.ASC_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
const APP = process.env.APP_ID || STORE.appId;
const VERSION = (process.env.VERSION_ID || '').trim() || STORE.versionId;
// Optional: pick the record by version string instead of the pinned id, so the job can
// be pointed at whichever version is in scope without editing this file.
const VERSION_STRING = (process.env.VERSION_STRING || '').trim() || STORE.version;
const BUILD = process.env.BUILD_NUMBER || STORE.build;
const DO_ATTACH = process.env.DO_ATTACH === 'true';
const DO_WHATS_NEW = process.env.DO_WHATS_NEW === 'true';

// The What's New copy lives in store.json, beside the version id and build, and is
// also the block mobile/STORE-LISTING.md prints. It is not kept here: a copy in
// the script would be a third place to update and a third place to be wrong.
const WHATS_NEW = STORE.whatsNew;

const key = createPrivateKey({ key: pem, format: 'pem' });
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

let token = null;
function bearer() {
  if (token) return token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64({ iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  token = `${head}.${body}.${sig}`;
  return token;
}

async function call(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${bearer()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(`::error::${init.method || 'GET'} ${path} -> ${res.status}`);
    console.error(typeof body === 'string' ? body : JSON.stringify(body?.errors ?? body, null, 2));
    process.exit(1);
  }
  return body;
}

async function resolveVersionId() {
  if (!VERSION_STRING) return VERSION;
  const found = await call(
    `/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS` +
      `&filter[versionString]=${encodeURIComponent(VERSION_STRING)}` +
      '&fields[appStoreVersions]=versionString,appStoreState&limit=5'
  );
  const hit = (found?.data || [])[0];
  if (!hit) {
    console.error(`::error::no ${VERSION_STRING} version on app ${APP}`);
    process.exit(1);
  }
  console.log(`resolved ${VERSION_STRING} to ${hit.id} (${hit.attributes.appStoreState})`);
  return hit.id;
}

const versionId = await resolveVersionId();

async function readVersion() {
  return call(
    `/v1/appStoreVersions/${versionId}?include=build` +
      '&fields[appStoreVersions]=versionString,appStoreState,platform' +
      '&fields[builds]=version,processingState'
  );
}

const before = await readVersion();
const v = before.data;
const attached = before.included?.find((i) => i.type === 'builds');
console.log(`version ${v.attributes.versionString} on ${v.attributes.platform}: ${v.attributes.appStoreState}`);
console.log(`attached build: ${attached ? attached.attributes.version : 'none'}`);

// States in which Apple holds the version. There is no create-a-version fallback in
// this script — it targets one existing record — so a run into one of these states
// fails on a refused write ("the version is not editable"), after the job has already
// printed what it intended to do. Stop before writing instead. A rejected or editable
// version still falls through to the work below.
const LOCKED_STATES = [
  'WAITING_FOR_REVIEW',
  'IN_REVIEW',
  'PENDING_DEVELOPER_RELEASE',
  'PENDING_APPLE_RELEASE',
  'PROCESSING_FOR_DISTRIBUTION',
  'READY_FOR_SALE',
  'REPLACED_WITH_NEW_VERSION',
];

if (LOCKED_STATES.includes(v.attributes.appStoreState)) {
  console.log(
    `::notice::${v.attributes.versionString} is ${v.attributes.appStoreState}; ` +
      'Apple holds this version, so there is nothing to attach or write'
  );
  console.log(
    'It has to leave review on the Version page in App Store Connect before this job can write to it.'
  );
  console.log(`https://appstoreconnect.apple.com/apps/${APP}/distribution/ios/version/inflight`);
  console.log('nothing was submitted for review');
  process.exit(0);
}

if (DO_ATTACH) {
  const builds = await call(
    `/v1/builds?filter[app]=${APP}&filter[version]=${BUILD}&limit=10` +
      '&fields[builds]=version,processingState,usesNonExemptEncryption,expired'
  );
  const build = (builds?.data || [])[0];
  if (!build) {
    console.error(`::error::no build ${BUILD} on app ${APP}`);
    process.exit(1);
  }
  console.log(
    `build ${build.attributes.version}: ${build.attributes.processingState}, ` +
      `expired=${build.attributes.expired}, compliance=${build.attributes.usesNonExemptEncryption}`
  );
  if (build.attributes.processingState !== 'VALID') {
    console.error(`::error::build ${BUILD} is ${build.attributes.processingState}, not VALID; not attaching`);
    process.exit(1);
  }
  if (attached && attached.id === build.id) {
    console.log(`build ${BUILD} is already attached; nothing to do`);
  } else {
    await call(`/v1/appStoreVersions/${versionId}/relationships/build`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'builds', id: build.id } }),
    });
    console.log(`attached build ${BUILD} (${build.id})`);
  }
}

if (DO_WHATS_NEW) {
  const locs = await call(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations` +
      '?fields[appStoreVersionLocalizations]=locale,whatsNew'
  );
  const loc = (locs?.data || []).find((l) => l.attributes.locale === 'en-US');
  if (!loc) {
    console.error('::error::no en-US localization on this version');
    process.exit(1);
  }
  const existing = loc.attributes.whatsNew || '';
  console.log(`whatsNew before (${existing.length}): ${JSON.stringify(existing)}`);
  await call(`/v1/appStoreVersionLocalizations/${loc.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        type: 'appStoreVersionLocalizations',
        id: loc.id,
        attributes: { whatsNew: WHATS_NEW },
      },
    }),
  });
  console.log(`whatsNew written: ${WHATS_NEW.length} characters`);
}

// Read it back rather than trusting the write: Apple reconciles an attach
// asynchronously, so the state printed here is what App Store Connect holds.
const after = await readVersion();
const now = after.included?.find((i) => i.type === 'builds');

const locs = await call(
  `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations` +
    '?fields[appStoreVersionLocalizations]=locale,whatsNew'
);
const enUS = (locs?.data || []).find((l) => l.attributes.locale === 'en-US');
const written = (enUS?.attributes.whatsNew || '').length;
// The notice is the public half of this job: it surfaces as a run annotation,
// which anyone can read without the App Store Connect key. It therefore carries
// the copy length too, so "What's New was written" is provable from the run
// alone, not just from logs that need a GitHub sign-in.
console.log(
  `::notice::${after.data.attributes.versionString} is ${after.data.attributes.appStoreState} ` +
    `with build ${now ? now.attributes.version : 'none'} attached, ` +
    `en-US What's New ${written} characters`
);
for (const l of locs.data) {
  console.log(`  ${l.attributes.locale} whatsNew ${(l.attributes.whatsNew || '').length} chars`);
}
console.log('nothing was submitted for review');
