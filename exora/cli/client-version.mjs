import { readFileSync } from 'node:fs';
// Published packages supply their actual version. The source checkout has no package version.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const CLI_VERSION = manifest.version ?? '0.2.0-exora.55';
export function clientHeaders(config = {}, profilePath) {
  const profile = config.profilePath ?? profilePath;
  return { 'X-Audienti-Version': CLI_VERSION, 'X-Audienti-Interface': config.interface === 'mcp' || process.env.AUDIENTI_INTERFACE === 'mcp' ? 'mcp' : 'cli',
    ...(profile ? { 'X-Audienti-Profile': encodeURIComponent(profile) } : {}) };
}
export function versionRefusal(result) {
  return result?.error?.code === 'client_update_required' ? 'This Audienti CLI is no longer supported. Run npm i -g @audienti/cli@exora, then retry this command.' : '';
}
export function clientUpdateGuidance(result) {
  return ['update_available', 'version_unknown', 'unsupported'].includes(result?.client?.status)
    ? 'Update your Audienti CLI. Run npm i -g @audienti/cli@exora, then retry this command.' : '';
}
/** Human-readable renderers may omit the API envelope; keep upgrade instructions visible on stderr. */
export function reportClientUpdate(result, config = {}) {
  const message = clientUpdateGuidance(result);
  if (message && config.interface !== 'mcp' && process.env.AUDIENTI_INTERFACE !== 'mcp') console.error(message);
}
/** Retain the original API failure and its upgrade instruction in either CLI or MCP error output. */
export function clientError(error, result) {
  const update = clientUpdateGuidance(result);
  if (update && !error.message.includes('npm i -g @audienti/cli@exora')) error.message += ` ${update}`;
  if (result?.client) error.client = result.client;
  return error;
}
