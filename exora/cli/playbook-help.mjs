// One text for every playbook command, shared by `audienti --help`, `audienti playbook --help`,
// `audienti playbook SUBCOMMAND --help` and the usage error (#449). The runnable field reference is the
// playbook-design skill: audienti skills read playbook-design references/fields.md.
export const playbookCommands = {
  list: {
    usage: 'playbook list [--archived] [--limit 1..100] [--cursor ID] [--workspace ID] [--profile PATH]',
    about: 'One page of summaries, 50 by default: id, name, currentRevision, system, systemKey, archivedAt, stages, steps, recommended, updatedAt. Archived playbooks are hidden; --archived lists them instead. Starters have system true and cannot be changed; clone one by saving its fields without an id. Use nextCursor as --cursor for the next page. Full fields come from playbook show.'
  },
  actions: {
    usage: 'playbook actions [--workspace ID] [--profile PATH]',
    about: 'What a playbook step may name: the step actions (id, channel, label), the step channels (LinkedIn, Email, Custom: a task a person does by hand) and the event-rule names, each with the words the screen shows (eventRules.whenLabels, eventRules.doLabels) and the actions that do not run yet (eventRules.notBuilt). Rule actions: stop_wait (End their wait), snooze (Wait before the next step), redirect_to_named_person (Add the person they name), ask_who_is_right (Ask who the right person is), tell_me (Tell me), hand_to_user (Put it in my queue), withdraw_pending_request (Withdraw the pending request). Run it before playbook save. A step\'s actionId must be one of these ids and match the step channel. A save that names something else is refused with the wrong value, the allowed values (allowed) and this command (next).'
  },
  show: {
    usage: 'playbook show PLAYBOOK_ID [--revision N] [--workspace ID] [--profile PATH]',
    about: 'The whole playbook (fields) and the campaigns that use it. Without --revision it returns the current one. PLAYBOOK_ID comes from playbook list. warnings is the Playbook check: what is wrong with the playbook (level error or warning, a message, the stage and step, the rule, and the default fix). An empty list means nothing to look at. actionLabels maps each rule action id the playbook uses to the words the screen shows, for example snooze to Wait before the next step.'
  },
  save: {
    usage: 'playbook save --file REQUEST.json [--workspace ID] [--profile PATH]',
    about: 'Create a playbook or save a new revision. Step action ids and channels: audienti playbook actions. The file is {"requestId": UUID, "expectedRevision": N, "id": PLAYBOOK_ID, "fields": {...}}. requestId: a fresh UUID; reuse it only to retry the same save. id: leave it out for a new playbook. expectedRevision: 0 for a new playbook, otherwise currentRevision from playbook show. A save from a stale revision is refused with revision_conflict and the response gives currentRevision. A playbook that cannot work (no way out, a stage nobody can reach, or a rule with an action that does not run yet) is refused with playbook_cannot_work and the list in errors. A saved playbook comes back with warnings, the Playbook check, for things that are legal but probably wrong. fields: name, stages (2 or more, each with a UUID key), goalKey (a stage key after the first stage), offRamps, and optionally eventRules (the example shows one). The actionId of a step is one of the ids from playbook actions. Field rules: audienti skills read playbook-design references/fields.md Your own reply labels: add customLabels [{"name":"asked_pricing","meaning":"They ask what it costs."}] and a rule with when custom.asked_pricing; a label with no rule opens a decision. Read them with audienti intent list --playbook ID.',
    example: {
      requestId: 'UUID',
      expectedRevision: 0,
      fields: {
        name: 'Email only',
        stages: [
          { key: 'STAGE_A_UUID', name: 'Ready', owner: 'Agent', goalDays: 3, steps: [{ key: 'UUID', channel: 'Email', actionId: 'email.send', action: 'Email 1', condition: 'Always', instructions: 'Three sentences.', due: { minutes: 5 }, wait: { until: 'timeout', days: 4 } }], completion: { kind: 'next' } },
          { key: 'STAGE_B_UUID', name: 'Meeting booked', outcomes: [], owner: 'Assignee', goalDays: 0, steps: [], completion: { kind: 'stay' } }
        ],
        goalKey: 'STAGE_B_UUID',
        offRamps: [{ key: 'UUID', name: 'Unresponsive', reason: 'unresponsive' }],
        eventRules: [{ key: 'UUID', when: 'reply.later', do: ['snooze'], snoozeDays: 30, goto: { kind: 'stay' } }]
      }
    }
  },
  archive: {
    usage: 'playbook archive PLAYBOOK_ID [--workspace ID] [--profile PATH]',
    about: 'Hide a playbook from the list and the campaign picker. It cannot be edited or newly chosen for a campaign until you restore it. Campaigns that already use it keep running on their version. Safe to repeat. Starters can be archived.'
  },
  restore: {
    usage: 'playbook restore PLAYBOOK_ID [--workspace ID] [--profile PATH]',
    about: 'Bring an archived playbook back. Find archived playbooks with playbook list --archived. Safe to repeat.'
  },
  draft_show: {
    usage: 'playbook draft show PLAYBOOK_ID [--workspace ID] [--profile PATH]',
    about: 'Your draft of a playbook: {draft: {baseRevision, fields, actionLabels, updatedAt, savedBy}} (savedBy is person or agent; actionLabels maps each rule action id to the words the screen shows), or {draft: null} when there is none. The draft is the unsaved work in the playbook editor. It belongs to one person; an agent reads and changes the draft of the person who owns the agent. A campaign cannot use a draft, and playbook show and playbook save never touch it.'
  },
  draft_save: {
    usage: 'playbook draft save PLAYBOOK_ID --file REQUEST.json [--workspace ID] [--profile PATH]',
    about: 'Keep your edits as the draft. The file is {"baseRevision": N, "expectedUpdatedAt": T, "fields": {...}}. expectedUpdatedAt is the updatedAt that playbook draft show returned, or null when it returned {draft: null}. If the draft changed since (another tab, your agent or the person), nothing is replaced: you get draft_conflict with currentUpdatedAt. Run playbook draft show, combine the changes, and save again. baseRevision is the version the edits start from: currentRevision from playbook show, or baseRevision from playbook draft show. A lower baseRevision than the current version is kept; publish checks it and refuses a draft that started from an older version (revision_conflict). The draft is replaced as a whole, so send every field (take them from playbook draft show, or playbook show when there is no draft). It never makes a version. The person sees the change in the editor within a few seconds. Fields follow the same rules as playbook save. The answer carries check: the problems and warnings a publish would see. They never stop a draft save. The draft is not fully checked until publish. Starter and archived playbooks are refused.'
  },
  rules_show: {
    usage: 'playbook rules show PLAYBOOK_ID [--workspace ID] [--profile PATH]',
    about: 'Read or replace the playbook-wide list. For a save, send place {kind: playbook}, rules and expectedUpdatedAt. Stages use outcomes. Steps only run their action and wait. Publish the draft to make a version.',
  },
  rules_save: {
    usage: 'playbook rules save PLAYBOOK_ID --file REQUEST.json [--workspace ID] [--profile PATH]',
    about: 'Read or replace the playbook-wide list. For a save, send place {kind: playbook}, rules and expectedUpdatedAt. Stages use outcomes. Steps only run their action and wait. Publish the draft to make a version.',
    example: {
      place: { kind: 'playbook' },
      rules: [{ key: 'UUID', when: 'reply.wrong_person', do: ['stop_wait', 'redirect_to_named_person'], goto: { kind: 'stay' } }],
      expectedUpdatedAt: 'UPDATED_AT_FROM_RULES_SHOW'
    }
  },
  draft_discard: {
    usage: 'playbook draft discard PLAYBOOK_ID [--expected-updated-at T] [--workspace ID] [--profile PATH]',
    about: 'Throw your draft away. The saved versions stay. Safe to repeat: discarded says whether a draft existed. With --expected-updated-at T (the updatedAt from playbook draft show), a draft saved since is kept and you get draft_conflict with currentUpdatedAt.'
  },
  draft_publish: {
    usage: 'playbook draft publish PLAYBOOK_ID [--request-id UUID] [--workspace ID] [--profile PATH]',
    about: 'Save your draft as the next version and remove the draft. It returns the new version, as playbook save does. If a newer version was saved after the draft started, nothing is saved: you get revision_conflict with currentRevision. Run playbook draft show, then playbook draft save with baseRevision set to currentRevision and your changes applied to the newer version, then publish again. No draft gives no_draft. Without --request-id a fresh one is made and printed to stderr. To retry a call that may have worked, pass the same --request-id: a repeat of a finished publish returns the same version. If a draft was saved while this ran you get draft_conflict: read it with playbook draft show and publish again.'
  },
  delete: {
    usage: 'playbook delete PLAYBOOK_ID [--workspace ID] [--profile PATH]',
    about: 'Delete a playbook and all its versions. This cannot be undone. A playbook that any campaign uses, in any state, is refused with playbook_in_use and the campaigns are named; archive it instead. Starters cannot be deleted.'
  },
  progress: {
    usage: 'playbook progress PARTICIPATION_ID [--workspace ID] [--profile PATH]',
    about: 'The stage and outcome history of one person in one campaign. It takes a participation ID, not a playbook ID. A participation exists once a person is admitted to a campaign. Each person in the output of pipeline show has a participationId.'
  },
  record: {
    usage: 'playbook record --file REQUEST.json [--workspace ID] [--profile PATH]',
    about: 'Report that a person moved to a stage or way out, or finished the current stage play. The file has participationId, expectedVersion (the version from playbook progress), requestId (a fresh UUID), exactly one of stageKey, offRampKey or finishStage true, reason, and evidence (a list of {kind: observation|conversation, id}).'
  },
  event: {
    usage: 'playbook event PARTICIPATION_ID --kind KIND --reason TEXT [--evidence conversation:ID|observation:ID ...] [--at ISO] [--name TEXT] [--step-key UUID] [--value N] [--request-id UUID] [--file REQUEST.json] [--workspace ID] [--profile PATH]',
    about: 'Record one event for a person, then let the playbook settle. KIND is meeting_requested (A meeting is asked for), meeting_accepted (They say yes to a meeting), meeting_declined (They say no to a meeting), meeting_booked (A meeting is booked), not_a_fit (You or your agent mark them not a fit), steps_done (the steps of the current stage are done), outside_event (a named fact such as Gift delivered), or scheduled_time (record or revise this person’s named future time). scheduled_time requires --name TEXT and --at ISO. Use a signed days/minutes offset with due.afterEvent, for example days:-2 before Sprint starts. For engagement, use --kind outside_event --name "Email opened" or "Email clicked" --step-key EMAIL_STEP_UUID, or --name "Lead score" --value 85. Only a recorded sent email counts. Scores are 0–100 and latest observation time wins. Guards in step.guard select work at its due time: {kind:email_opened|email_clicked,stepKey,observed:boolean} or {kind:lead_score,min?,max?}. Missing scores hold. outside_event requires --name TEXT, matching due.afterEvent or wait.afterEvent; facts carry across stages in the same participation; it starts that clock and does not mark a Custom task done. meeting_booked meets the stage outcome of that kind. not_a_fit uses the playbook-wide list for a recorded decision, separate from a No reply. steps_done applies the current stage completion (next stage, stay or exit). REASON is 1 to 300 characters and shows in the history. --evidence names stored evidence about this person: conversation:ID is a message id (the conversation ids in the person timeline, audienti prospects timeline), observation:ID a profile observation id. Repeat it for each piece, up to 20. --at is an ISO time with a timezone offset, for example 2026-11-06T14:30:00Z. Left out, the time is now; a future time counts as now, and a time before the person entered the stage counts as just after it. --request-id is made for you when left out; pass the same UUID to retry safely. Only the person\'s assignee or a workspace Admin may record. A repeat writes nothing and answers recorded false. A person who has left the campaign is refused with participation_ended, with two exceptions: meeting_booked is still recorded, and a repeat of meeting_booked or not_a_fit answers recorded false with the eventId already recorded.'
  }
};
const lines = Object.values(playbookCommands).map(command => command.usage);
export const playbookUsageError = `Unknown or missing playbook subcommand. Usage:\n${lines.map(line => `  audienti ${line}`).join('\n')}\nRun audienti playbook SUBCOMMAND --help for the request shape.`;
/** Help for `audienti playbook [SUBCOMMAND] --help`. */
export function playbookHelp(subcommand) {
  const names = playbookCommands[subcommand] ? [subcommand] : subcommand === 'draft' || subcommand === 'rules' ? Object.keys(playbookCommands).filter(name => name.startsWith(`${subcommand}_`)) : Object.keys(playbookCommands);
  const text = names.map(name => {
    const command = playbookCommands[name];
    return `audienti ${command.usage}\n  ${command.about}${command.example ? `\n\nExample REQUEST.json (replace each UUID with a fresh one; reuse the same UUID where a key repeats):\n${JSON.stringify(command.example, null, 2)}` : ''}`;
  }).join('\n\n');
  const conflict = names.includes('save') ? ' A revision_conflict from save also gives currentRevision.' : '';
  return `${text}\n\nErrors are JSON on stderr: {"error": {"code", "message"}}, and the exit code is 1.${conflict} Errors from the server also give status, and when there is a next step they give next (what to do, or what to tell your user), field (the path of the wrong value) and allowed (the values that would work).`;
}
