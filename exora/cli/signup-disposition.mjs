import { callWorkspace, configuration } from './workspaces.mjs';
import { signupDispositionError } from './signup-disposition-operations.mjs';

export async function signupDispositionCli(args) {
  const [group, command, ...rest] = args;
  const names = { show: 'signup_disposition_get', recompute: 'signup_disposition_recompute', set: 'signup_disposition_override_set', clear: 'signup_disposition_override_clear' };
  if (group !== 'signup-disposition' || !Object.hasOwn(names, command)) throw Error('Use signup-disposition show|recompute|set|clear --user ID.');
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') continue;
    const key = rest[i];
    if (!['--user', '--value', '--reason', '--expected-revision', '--evidence-refs', '--profile'].includes(key) || Object.hasOwn(flags, key) || i + 1 >= rest.length) throw Error(`Invalid flag ${key}.`);
    flags[key] = rest[++i];
  }
  const input = { userId: flags['--user'] };
  if (flags['--value'] !== undefined) input.value = flags['--value'];
  if (flags['--reason'] !== undefined) input.reason = flags['--reason'];
  if (flags['--expected-revision'] !== undefined) {
    if (!/^\d+$/.test(flags['--expected-revision'])) throw Error('--expected-revision needs a nonnegative whole number.');
    input.expectedRevision = Number(flags['--expected-revision']);
  }
  if (flags['--evidence-refs'] !== undefined) {
    try { input.evidenceRefs = JSON.parse(flags['--evidence-refs']); }
    catch { throw Error('--evidence-refs must be valid JSON, for example \'["support:751"]\' (an array of nonempty strings).'); }
  }
  try { console.log(JSON.stringify(await callWorkspace(names[command], input, configuration(flags['--profile'])))); }
  catch (error) { throw signupDispositionError(names[command], error); }
}
