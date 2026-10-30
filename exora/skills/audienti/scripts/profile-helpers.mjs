import { SKILL_VERSION, validateInput } from './contracts.mjs';

const broadNetworks = ['x.com', 'twitter.com', 'linkedin.com/in', 'instagram.com', 'facebook.com', 'github.com', 'medium.com', 'youtube.com', 'tiktok.com', 'threads.net', 'reddit.com'];
const attachableNetworks = ['x.com', 'twitter.com', 'linkedin.com/in', 'instagram.com', 'facebook.com', 'tiktok.com', 'reddit.com', 'youtube.com'];
const stopwords = new Set('a an and are as at be but by for if in into is it no not of on or such that the their then there these they this to was will with from via over under'.split(' '));
const trustedSources = ['rocketreach.co', 'apollo.io', 'hunter.io', 'clearbit.com', 'zoominfo.com', 'lusha.com'];
const socialSources = ['twitter.com', 'instagram.com', 'facebook.com', 'linkedin.com', 'github.com', 'medium.com', 'youtube.com', 'tiktok.com', 'threads.net', 'reddit.com'];
const term = value => (value ?? '').replaceAll('"', ' ').replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];
const quoted = value => `"${term(value)}"`;
const personName = value => {
  const name = term(value), tokens = name.split(' ');
  return /^[\p{L}\s'.-]+$/u.test(name) && tokens.length >= 2 && tokens.every(token => token.length >= 2) ? name : '';
};

// Inputs are already selected facts. Employer selection, canonical URL parsing,
// identity validation and database reads belong to the CRM and the calling agent.
function queries({ profile, kind, mode = 'broad' }) {
  const displayName = term(profile.displayName), company = term(profile.companyName), domain = term(profile.companyDomain);
  let values = [];
  if (kind === 'social') {
    const name = personName(displayName) || personName(profile.prospectName);
    const evidence = unique([company, domain, company && profile.title ? `${term(profile.title)} at ${company}` : '', term(profile.linkedinReference), term(profile.linkedinSlug)]);
    const gate = (mode === 'broad' ? broadNetworks : attachableNetworks).map(host => `site:${host}`).join(' OR ');
    if (name) values.push(`${quoted(name)}${evidence.length ? ` (${evidence.map(quoted).join(' OR ')})` : ''} (${gate})`);
    const handles = unique([...(profile.handles ?? []), profile.linkedinSlug].map(value => term(value).replace(/^@/, '')).filter(value => value.length >= 3 && !/\s|@|:\/\//.test(value) && !/^(seed-|unknown$|profile$)/i.test(value)));
    const single = [], groups = [];
    for (const handle of handles) {
      // V10 keeps LinkedIn opaque IDs case-sensitive; it does not manufacture
      // permutations of them. Other observed handles supply query variants only.
      if (/^ACo[A-Za-z0-9_-]+$/.test(handle)) { single.push(handle); continue; }
      const tokens = handle.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (tokens.length === 1) single.push(tokens[0]);
      else if (tokens.length) groups.push(tokens);
    }
    const variants = unique([...single.sort(), ...['', '-', '_'].flatMap(separator => [...groups].sort((a, b) => a.join(separator) < b.join(separator) ? -1 : a.join(separator) > b.join(separator) ? 1 : 0).map(tokens => tokens.join(separator)))]);
    const fallback = unique([company, domain, name]);
    if (variants.length >= 2 && fallback.length) values.push(`(${variants.map(quoted).join(' OR ')}) (${fallback.map(quoted).join(' OR ')}) (${gate})`);
  } else if (displayName) {
    if (kind === 'email') {
      // V10 templates requiring missing values are skipped, not filled with
      // guessed company identity or fabricated contact details.
      if (company) values.push(`${displayName} ${company} email`);
      if (domain) values.push(`${displayName} "@${domain}" email`);
    } else {
      values = [`${displayName} website`, `${displayName} about`];
      if (company) values.push(`${displayName} ${company} contact`);
    }
  }
  values = unique(values).slice(0, 5);
  return { version: SKILL_VERSION, queries: values.map(query => ({ query, kind })), missing: values.length ? [] : ['usable_profile_search_context'] };
}

const normalizeName = value => value.toLowerCase().replace(/[-_.]/g, ' ').replace(/ +/g, ' ').trim();
const tokens = value => new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(token => token.length >= 3 && !stopwords.has(token)));
function score(profile, candidate) {
  const name = normalizeName(profile.displayName ?? ''), parts = name.split(/\s+/);
  const title = (candidate.title ?? '').toLowerCase(), snippet = (candidate.snippet ?? '').toLowerCase(), domain = (candidate.domain ?? '').toLowerCase();
  const nameIn = value => name && (normalizeName(value).includes(name) || (parts.length >= 2 && normalizeName(value).includes(parts[0]) && normalizeName(value).includes(parts.at(-1))));
  let amount = 0; const signals = [];
  if (nameIn(title) || nameIn(snippet)) { amount += 0.4; signals.push('name_match'); }
  const companyDomain = (profile.companyDomain ?? '').toLowerCase().replace(/^www\./, '').split('/')[0];
  // Preserve V10's advisory substring weights, not an authorization predicate.
  if (companyDomain && domain && (domain.replace(/^www\./, '').split('/')[0] === companyDomain || domain.includes(companyDomain))) { amount += 0.3; signals.push('company_domain'); }
  if (trustedSources.some(value => domain.includes(value))) { amount += 0.2; signals.push('trusted_source'); }
  if (socialSources.some(value => domain.includes(value))) { amount += 0.1; signals.push('social_platform'); }
  const a = tokens([profile.displayName, profile.bio, profile.headline, profile.description].filter(Boolean).join(' ')), b = tokens(`${title} ${snippet}`);
  const union = new Set([...a, ...b]).size, intersection = [...a].filter(value => b.has(value)).length;
  if (union && intersection / union >= 0.2) { amount += 0.15; signals.push('text_overlap'); }
  return { score: Math.round(amount * 100) / 100, signals };
}

function candidates({ profile, candidates: rows, limit = 12 }) {
  const seen = new Set(), ranked = []; let duplicatesRemoved = 0;
  for (const row of rows) {
    const key = row.profileId ? `profile:${row.profileId}` : `raw:${row.url}`;
    if (seen.has(key)) { duplicatesRemoved++; continue; }
    seen.add(key);
    const result = score(profile, row);
    ranked.push({ ...row, ...result, identityStatus: row.profileId ? 'saved_reference' : 'unresolved', suggestedAction: result.score < 0.4 ? 'skip_low_score' : result.score > 0.7 ? 'inspect_page' : 'inspect_snippet' });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { version: SKILL_VERSION, candidates: ranked.slice(0, limit), duplicatesRemoved, omitted: Math.max(0, ranked.length - limit) };
}

function completeness({ requiredFields, fields }) {
  const available = [], absent = [], needsEvidence = [];
  for (const field of unique(requiredFields)) {
    const states = unique(fields.filter(row => row.name === field).map(row => row.state));
    const state = states.length > 1 ? 'conflicting' : states[0] ?? 'not_reported';
    if (state === 'available') available.push(field);
    else if (state === 'absent') absent.push(field);
    else needsEvidence.push({ field, state });
  }
  return { version: SKILL_VERSION, authority: 'planning_only', allFieldsKnown: needsEvidence.length === 0, available, absent, needsEvidence };
}

// V10 Utils::TextScanner and Profiles::Writer prepare observations. URL identity
// normalization and authoritative citation/identity writes remain server-owned.
const observedUrlPattern = /https?:\/\/[^\s<>"')]+/g;
const sensitiveUrlKey = value => /token$|secret|password|signature|credential|accesskey|^(auth|authorization|key|code|sig|apikey|sas)$/.test(value.replace(/[^a-z0-9]/gi, '').toLowerCase());
function evidence({ profileId, observationId, platform, bio = '', websiteUrl = '' }) {
  const links = new Map(); let rejectedLinks = 0;
  const add = (raw, field) => {
    const url = raw.trim().replace(/\.$/, '').replace(/,$/, '').replace(/!$/, '');
    try {
      const parsed = new URL(url);
      if (url.length > 2048 || /\s/.test(url) || !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || [...parsed.searchParams.keys(), ...new URLSearchParams(parsed.hash.slice(1)).keys()].some(sensitiveUrlKey)) throw new Error();
    } catch { rejectedLinks++; return; }
    const fields = links.get(url) ?? [];
    if (!fields.includes(field)) fields.push(field);
    links.set(url, fields);
  };
  if (websiteUrl.trim()) add(websiteUrl, 'websiteUrl');
  for (const match of bio.matchAll(observedUrlPattern)) add(match[0], 'bio');
  let handles = [];
  if (platform) {
    // Unlike V10's unbounded @ regex, require a token boundary so an email
    // address cannot become a proposed social identity. A mention is never a URL.
    const pattern = platform === 'reddit' ? /\bu\/([A-Za-z0-9_-]+)/g
      : ['twitter', 'x'].includes(platform) ? /(?<![\p{L}\p{N}_@./])@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/gu
      : /(?<![\p{L}\p{N}_@./])@([A-Za-z0-9_.]+[A-Za-z0-9_])/gu;
    const mentionText = bio.replace(observedUrlPattern, ' ');
    handles = unique([...mentionText.matchAll(pattern)].map(match => match[1].toLowerCase()));
  }
  const selectedHandles = handles.filter(handle => handle.length <= 200).slice(0, 50);
  return { version: SKILL_VERSION, authority: 'caller_supplied', ...(profileId ? { profileId } : {}), ...(observationId ? { observationId } : {}),
    links: [...links].slice(0, 50).map(([url, fields]) => ({ url, fields })), mentions: selectedHandles.map(handle => ({ platform, handle, field: 'bio' })),
    rejectedLinks, omittedLinks: Math.max(0, links.size - 50), omittedMentions: handles.length - selectedHandles.length };
}

export function runHelper(name, input) {
  validateInput(name, input);
  if (name === 'profile-queries') return queries(input);
  if (name === 'profile-candidates') return candidates(input);
  if (name === 'profile-completeness') return completeness(input);
  return evidence(input);
}
