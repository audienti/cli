import { callWorkspace, configuration } from "./workspaces.mjs";
import { readJsonFile } from "./json-file.mjs";
export function isAssignmentCommand(args) {
  return (
    args[0] === "workspace" &&
    (["assignments", "prospect", "routing-rules", "routing", "leave"].includes(
      args[1],
    ) ||
      (args[1] === "member" && args[2] === "remove"))
  );
}
export async function assignmentCli(args) {
  const flags = {},
    position = [];
  const children = [
    "history",
    "participations",
    "participation-events",
    "routing-reports",
    "overrides",
  ];
  const allowed = [
    "profile",
    "workspace",
    "file",
    "request-id",
    "prospect-id",
    "experiment-id",
    "assigned-to-user-id",
    "unassigned",
    "search",
    "cursor",
    "limit",
    ...children.flatMap((k) => [k + "-cursor", k + "-limit"]),
  ];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") continue;
    if (!args[i].startsWith("--")) {
      position.push(args[i]);
      continue;
    }
    const key = args[i].slice(2);
    if (
      !allowed.includes(key) ||
      args[i + 1] === undefined ||
      args[i + 1].startsWith("--") ||
      Object.hasOwn(flags, key)
    )
      throw new Error("Unknown, repeated, or incomplete assignment option.");
    flags[key] = args[++i];
  }
  const command = position.join(" ");
  const names = {
    "workspace assignments list": "workspace_prospect_assignments",
    "workspace prospect assignment get": "workspace_prospect_assignment",
    "workspace prospect assignment set": "workspace_prospect_assignment_set",
    "workspace prospect experiment-fit get":
      "workspace_prospect_experiment_fit",
    "workspace routing-rules get": "workspace_routing_rules_get",
    "workspace routing-rules replace": "workspace_routing_rules_replace",
    "workspace routing apply": "workspace_routing_apply",
    "workspace prospect fit-override set": "workspace_fit_override_set",
    "workspace prospect fit-override clear": "workspace_fit_override_set",
    "workspace prospect move": "workspace_prospect_move",
    "workspace member remove": "workspace_member_remove",
    "workspace leave": "workspace_leave",
  };
  const name = names[command];
  if (!name)
    throw new Error(
      "Unknown assignment command. Use workspace assignments list, prospect assignment get/set, routing-rules get/replace, routing apply, prospect experiment-fit get, prospect fit-override set/clear, prospect move, member remove, or leave. Mutations require --file INPUT.json.",
    );
  const read = [
    "workspace_prospect_assignments",
    "workspace_prospect_assignment",
    "workspace_prospect_experiment_fit",
    "workspace_routing_rules_get",
  ].includes(name);
  let input = read ? {} : readJsonFile(flags.file, 65536, "Assignment file");
  for (const [flag, key] of [
    ["workspace", "workspaceId"],
    ["request-id", "requestId"],
    ["prospect-id", "prospectId"],
    ["experiment-id", "experimentId"],
    ["assigned-to-user-id", "assignedToUserId"],
    ["search", "search"],
    ["cursor", "cursor"],
  ])
    if (flags[flag] !== undefined) input[key] = flags[flag];
  if (flags.limit !== undefined) input.limit = Number(flags.limit);
  if (flags.unassigned !== undefined) {
    if (!["true", "false"].includes(flags.unassigned))
      throw new Error("--unassigned must be true or false.");
    input.unassigned = flags.unassigned === "true";
  }
  for (const child of children) {
    const cursor = flags[child + "-cursor"],
      limit = flags[child + "-limit"];
    if (cursor !== undefined || limit !== undefined)
      input[child.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = {
        ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined ? {} : { limit: Number(limit) }),
      };
  }
  if (name === "workspace_fit_override_set") {
    const action = position.at(-1);
    if (input.action !== undefined && input.action !== action)
      throw new Error("File action must match the command.");
    input.action = action;
  }
  console.log(
    JSON.stringify(
      await callWorkspace(name, input, configuration(flags.profile)),
    ),
  );
}
