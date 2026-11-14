import { callWorkspace, configuration } from './workspaces.mjs';
import { readJsonFile } from './json-file.mjs';

const help = 'Use artifact list [--record-type TYPE --record-id ID]|show ID|create|update ID|attach ID|detach ID|context|type TYPE|archive ID|write --file PATH [--workspace ID].';

export async function artifactCli(args) {
  const position = [], flags = {};
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) { position.push(args[index]); continue; }
    const key = args[index].slice(2);
    if (key === 'json' && !Object.hasOwn(flags, key)) { flags.json = true; continue; }
    if (!['profile', 'workspace', 'file', 'record-type', 'record-id', 'include-archived', 'limit', 'after', 'type'].includes(key)
      || !args[index + 1] || args[index + 1].startsWith('--') || Object.hasOwn(flags, key)) throw new Error(`Unknown or incomplete artifact option. ${help}`);
    flags[key] = args[++index];
  }
  const command = position[1];
  const allowedByCommand = {
    list: ['record-type', 'record-id', 'include-archived', 'limit', 'after', 'type'],
    show: [],
    create: ['file'],
    update: ['file'],
    attach: ['record-type', 'record-id'],
    detach: ['record-type', 'record-id'],
    context: ['record-type', 'record-id', 'limit', 'after'],
    type: ['include-archived', 'limit', 'after'],
    archive: [],
    write: ['file'],
  };
  const commandFlags = allowedByCommand[command] ?? [];
  for (const key of Object.keys(flags)) if (!['profile', 'workspace', 'json'].includes(key) && !commandFlags.includes(key)) throw new Error(`Option --${key} is not valid for artifact ${command ?? 'command'}. ${help}`);
  let name = { list: 'artifact_list', show: 'artifact_get', create: 'artifact_create', update: 'artifact_update', attach: 'artifact_attach', detach: 'artifact_detach', context: 'artifact_context', type: 'artifact_list_by_type', archive: 'artifact_archive', write: 'artifact_write' }[command];
  if (!name) throw new Error(help);
  const input = { workspaceId: flags.workspace };
  const expectedPositionCount = command === 'type' ? 3 : ['list', 'create', 'context', 'write'].includes(command) ? 2 : 3;
  if (position.length !== expectedPositionCount) throw new Error(help);
  if (['show', 'update', 'attach', 'detach', 'archive'].includes(command)) {
    input.artifactId = position[2];
  }
  if (command === 'list') {
    if (flags['include-archived'] !== undefined && !['true', 'false'].includes(flags['include-archived'])) throw new Error('--include-archived must be true or false.');
    if (flags['include-archived'] !== undefined) input.includeArchived = flags['include-archived'] === 'true';
    if (flags.limit !== undefined) input.limit = Number(flags.limit);
    if (flags.after) input.after = flags.after;
    if (flags.type !== undefined) input.type = flags.type;
    if (flags['record-type'] !== undefined || flags['record-id'] !== undefined) {
      if (!flags['record-type'] || !flags['record-id']) throw new Error('Supply both --record-type and --record-id.');
      if (flags.type !== undefined) throw new Error('--type cannot be combined with --record-type/--record-id. Use artifact type TYPE for a type listing.');
      name = 'artifact_list_by_record';
      input.recordType = flags['record-type'];
      input.recordId = flags['record-id'];
      delete input.type;
    }
  }
  if (command === 'type') {
    input.type = position[2];
    if (flags['include-archived'] !== undefined && !['true', 'false'].includes(flags['include-archived'])) throw new Error('--include-archived must be true or false.');
    if (flags['include-archived'] !== undefined) input.includeArchived = flags['include-archived'] === 'true';
    if (flags.limit !== undefined) input.limit = Number(flags.limit);
    if (flags.after) input.after = flags.after;
  }
  if (['attach', 'detach', 'context'].includes(command)) {
    input.recordType = flags['record-type'];
    input.recordId = flags['record-id'];
    if (command === 'context') {
      if (flags.limit !== undefined) input.limit = Number(flags.limit);
      if (flags.after) input.after = flags.after;
    }
  }
  if (command === 'context' && (!input.recordType || !input.recordId)) throw new Error('Supply --record-type and --record-id.');
  if (['attach', 'detach'].includes(command) && (!input.recordType || !input.recordId)) throw new Error('Supply --record-type and --record-id.');
  if (['create', 'update', 'write'].includes(command)) {
    if (!flags.file) throw new Error('Supply --file PATH containing artifact JSON.');
    Object.assign(input, readJsonFile(flags.file, 2 * 1024 * 1024, 'Artifact file'));
    input.workspaceId = flags.workspace ?? input.workspaceId;
    if (command === 'update') input.artifactId = position[2];
  }
  console.log(JSON.stringify(await callWorkspace(name, input, configuration(flags.profile))));
}
