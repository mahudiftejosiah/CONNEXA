// Creates demo login accounts through the Supabase Auth Admin API using the
// service-role key from .env.local (server-side only, never printed).
//   node scripts/provision-demo-users.mjs --to 2       -> demo1, demo2
//   node scripts/provision-demo-users.mjs --to 1000 --names supabase/demo-names.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CURL = 'C:\\Windows\\System32\\curl.exe';
const TMP = path.join(os.tmpdir(), 'connexa-provision');

function readEnv(name) {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = text.match(new RegExp('^' + name + '=(.*)$', 'm'));
  if (!m) throw new Error('Missing ' + name + ' in .env.local');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const BASE = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

fs.mkdirSync(TMP, { recursive: true });

function post(endpoint, body, tag) {
  // Forward slashes keep curl's config parser out of its backslash escapes,
  // and the JSON travels as a file so no quoting/escaping is needed at all.
  const file = path.join(TMP, tag + '.json').replace(/\\/g, '/');
  const cfg = path.join(TMP, tag + '.curl').replace(/\\/g, '/');
  fs.writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
  fs.writeFileSync(
    cfg,
    [
      'silent',
      'show-error',
      'request = POST',
      'url = "' + BASE + endpoint + '"',
      'header = "apikey: ' + KEY + '"',
      'header = "Authorization: Bearer ' + KEY + '"',
      'header = "Content-Type: application/json"',
      'data-binary = "@' + file + '"',
      'write-out = "\\n@@HTTP:%{http_code}\\n"',
    ].join('\n'),
    { mode: 0o600 }
  );
  try {
    const out = execFileSync(CURL, ['--config', cfg], { encoding: 'utf8', maxBuffer: 8 << 20 });
    const i = out.lastIndexOf('@@HTTP:');
    return { status: Number(out.slice(i + 7).trim()), body: out.slice(0, i).trim() };
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(cfg, { force: true });
  }
}

function flag(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}

const from = Number(flag('from', 1));
const to = Number(flag('to', 2));
const password = flag('password', 'ConnexaDemo2026!');
const namesPath = flag('names', null);
const names = namesPath ? JSON.parse(fs.readFileSync(path.resolve(ROOT, namesPath), 'utf8')) : null;

let made = 0;
let existed = 0;
let failed = 0;

for (let i = from; i <= to; i++) {
  const named = names ? names[i - 1] : null;
  if (names && !named) {
    console.log('demo-names.json has no entry ' + i + '; stopping');
    break;
  }
  const email = named ? named.email : 'demo' + i + '@connexa1000.test';
  const body = {
    email,
    password,
    email_confirm: true,
    user_metadata: named ? { full_name: named.full_name } : {},
  };
  // Seeding a known uuid keeps the rest of seed_profiles_1000.sql usable.
  if (named && named.id) body.id = named.id;
  try {
    const r = post('/auth/v1/admin/users', body, 'u' + i);
    if (r.status === 200) made++;
    else if (/already|conflict/i.test(r.body)) existed++;
    else {
      failed++;
      console.log(email + ' -> HTTP ' + r.status + ' ' + r.body.slice(0, 200));
    }
  } catch (e) {
    failed++;
    console.log(email + ' -> ERROR ' + String(e.message).slice(0, 200));
  }
  if (i % 100 === 0) console.log('progress ' + i + '/' + to);
}

console.log('created ' + made + ', already existed ' + existed + ', failed ' + failed);
