import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, unlink, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Only these public marketplace entries are supported. The marketplace must still
// affirm each mapping; neither its URLs nor a skill's instructions grant authority.
const supported = Object.freeze({
  'signal-prospect-research': 'signal-research',
  'prospect-planning': 'prospect-planning',
  'prospect-writing': 'prospect-writing',
  'prospect-cadence': 'prospect-cadence',
});
const host = 'https://api.github.com';
const maxBytes = 2 * 1024 * 1024;

const inflight = new Map();
const cacheDir = () => process.env.AUDIENTI_SKILLS_CACHE_DIR === 'off' ? null : (process.env.AUDIENTI_SKILLS_CACHE_DIR || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'audienti', 'skills-v1'));
const mutableLifetime = 5 * 60 * 1000;
const immutableLifetime = 24 * 60 * 60 * 1000;

// A cache entry is a bounded response from the fixed origin, never an instruction to execute.
// HEAD and catalog observations expire quickly; expired entries are never used offline.
async function github(path, fetcher = fetch) {
  if (!inflight.has(path)) inflight.set(path, githubOnce(path, fetcher));
  try { return await inflight.get(path); } finally { inflight.delete(path); }
}
async function githubOnce(path, fetcher) {
  const dir = cacheDir();
  const key = createHash('sha256').update(path).digest('hex');
  const file = dir && join(dir, key + '.json');
  const lifetime = path.includes('/git/trees/') || path.includes('/git/blobs/') ? immutableLifetime : mutableLifetime;
  if (file) {
    try {
      if ((await stat(file)).size > maxBytes * 2) throw new Error('oversized cache entry');
      const raw = await readFile(file, 'utf8');
      if (Buffer.byteLength(raw) <= maxBytes * 2) {
        const cached = JSON.parse(raw);
        if (cached.path === path && Number.isSafeInteger(cached.time) && cached.time <= Date.now() && Date.now() - cached.time < lifetime && cached.data && typeof cached.data === 'object') {
          Object.defineProperty(cached.data, '_observation', { value: { fetchedAt: new Date(cached.time).toISOString(), cached: true } });
          return cached.data;
        }
      }
    } catch { /* Cache misses and corrupt entries are fetched again. */ }
  }
  const data = await fetchGithub(path, fetcher);
  const time = Date.now();
  Object.defineProperty(data, '_observation', { value: { fetchedAt: new Date(time).toISOString(), cached: false } });
  if (file) {
    let temporary;
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      temporary = join(dir, key + '.' + randomUUID());
      await writeFile(temporary, JSON.stringify({ path, time, data }), { mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } catch { if (temporary) await unlink(temporary).catch(() => {}); }
  }
  return data;
}
async function fetchGithub(path, fetcher) {
  let response;
  try {
    response = await fetcher(`${host}${path}`, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'audienti-cli' } });
  } catch { throw new Error('Marketplace unavailable or offline. Retry when GitHub is reachable.'); }
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'Marketplace unavailable or rate-limited by GitHub. Retry later.' : `Marketplace unavailable (GitHub HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) throw new Error('Marketplace response exceeds size limit.');
  if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Invalid marketplace response body.');
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > maxBytes) { await reader.cancel(); throw new Error('Marketplace response exceeds size limit.'); }
      chunks.push(value);
    }
  } catch (error) { if (error.message === 'Marketplace response exceeds size limit.') throw error; throw new Error('Marketplace response body unavailable.'); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new Error('Invalid marketplace response.'); }
}

function decodeBlob(blob, expected) {
  if (!blob || typeof blob !== 'object' || blob.encoding !== 'base64' || typeof blob.content !== 'string' || !Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > maxBytes) throw new Error('Invalid marketplace resource.');
  const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (hash !== expected || blob.sha !== expected || bytes.length !== blob.size) throw new Error('Marketplace resource integrity mismatch.');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('Marketplace resource is not UTF-8 text.'); }
}

function parseMetadata(text, label) {
  try { const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new Error(`Invalid marketplace ${label}.`); }
}

async function repository(id, fetcher, catalogPromise) {
  const repo = supported[id];
  if (!repo) throw new Error('Unknown marketplace skill. Use skills list.');
  const catalog = await (catalogPromise ?? github('/repos/audienti/plugins/contents/.claude-plugin/marketplace.json', fetcher));
  const manifest = parseMetadata(decodeBlob(catalog, catalog?.sha), 'catalog');
  if (!Array.isArray(manifest.plugins)) throw new Error('Invalid marketplace catalog.');
  if (manifest.plugins.some(entry => !entry || typeof entry !== 'object' || typeof entry.name !== 'string')) throw new Error('Invalid marketplace catalog.');
  const matches = manifest.plugins.filter(entry => entry.name === id);
  if (matches.length > 1) throw new Error(`Duplicate marketplace skill ${id} in catalog.`);
  if (matches.length !== 1) throw new Error(`Marketplace skill ${id} is missing or deprecated in the current catalog.`);
  const entry = matches[0];
  if (entry.deprecated) throw new Error(`Marketplace skill ${id} is deprecated.`);
  if (entry.source?.source !== 'github' || entry.source.repo !== `audienti/${repo}` || typeof entry.description !== 'string') throw new Error('Marketplace source does not match the supported origin.');
  const commit = await github(`/repos/audienti/${repo}/commits/HEAD`, fetcher);
  if (!commit || typeof commit.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid marketplace revision.');
  const tree = await github(`/repos/audienti/${repo}/git/trees/${commit.sha}?recursive=1`, fetcher);
  if (!tree || tree.truncated || !Array.isArray(tree.tree) || tree.tree.some(item => !item || typeof item !== 'object' || typeof item.path !== 'string')) throw new Error('Marketplace resource listing unavailable or incomplete.');
  const prefix = `skills/${id}/`;
  const files = tree.tree.filter(item => item.type === 'blob' && ['100644', '100755'].includes(item.mode) && item.path.startsWith(prefix) && /^[a-f0-9]{40}$/.test(item.sha) && Number.isSafeInteger(item.size) && item.size <= maxBytes).map(item => ({ path: item.path.slice(prefix.length), sha: item.sha }));
  const manifestPath = '.claude-plugin/plugin.json';
  const plugin = tree.tree.find(item => item.path === manifestPath && item.type === 'blob' && item.mode === '100644' && /^[a-f0-9]{40}$/.test(item.sha));
  if (!plugin || !files.some(file => file.path === 'SKILL.md')) throw new Error('Marketplace skill is missing required resources.');
  const metadata = parseMetadata(decodeBlob(await github(`/repos/audienti/${repo}/git/blobs/${plugin.sha}`, fetcher), plugin.sha), 'skill metadata');
  if (metadata.name !== id || typeof metadata.version !== 'string' || !metadata.version) throw new Error('Invalid marketplace skill metadata.');
  return { id: `marketplace:${id}`, description: entry.description, origin: `https://github.com/audienti/${repo}`, version: metadata.version, revision: commit.sha, catalog: { origin: 'https://github.com/audienti/plugins', blob: catalog.sha, ...catalog._observation }, revisionObservation: commit._observation, resources: files.map(file => file.path), files, repo };
}

export async function marketplaceCatalog(fetcher) {
  const catalog = github('/repos/audienti/plugins/contents/.claude-plugin/marketplace.json', fetcher);
  return Promise.all(Object.keys(supported).map(id => repository(id, fetcher, catalog).then(({ files, repo, ...entry }) => entry)));
}
export async function marketplaceResource(qualifiedId, path, fetcher) {
  const match = /^marketplace:([a-z0-9-]+)(?:@([a-f0-9]{40}))?$/.exec(qualifiedId);
  if (!match) throw new Error('Invalid marketplace skill ID. Use skills list.');
  const skill = await repository(match[1], fetcher);
  if (match[2] && match[2] !== skill.revision) throw new Error('Marketplace revision is stale. Run skills list again.');
  const file = skill.files.find(item => item.path === path);
  if (!file || !path || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..') || path.includes('\\')) throw new Error('Marketplace resource missing. Use skills list --compact for exact paths.');
  const content = decodeBlob(await github(`/repos/audienti/${skill.repo}/git/blobs/${file.sha}`, fetcher), file.sha);
  const { files, repo, resources, ...details } = skill;
  return { ...details, path, content };
}
