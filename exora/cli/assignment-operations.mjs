import { z } from "zod";
const uuid = z.string().uuid();
const workspace = { workspaceId: uuid.optional() };
const request = { ...workspace, requestId: uuid };
const version = z.number().int().nonnegative();
const page = z
  .object({
    cursor: uuid.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
const location = z
  .object({
    key: z.string().nullable().optional(),
    providerId: z.string().nullable().optional(),
    name: z.string(),
  })
  .strict();
const criteria = z
  .object({
    experimentIds: z.array(uuid).max(50).optional(),
    companyLocations: z.array(location).max(50).optional(),
    personLocations: z.array(location).max(50).optional(),
    personTitles: z.array(z.string()).max(50).optional(),
  })
  .strict();
const rule = z
  .object({
    id: uuid,
    name: z.string(),
    enabled: z.boolean(),
    assigneeUserId: uuid,
    criteria,
  })
  .strict();
const root = (a) => `/workspaces/${a.workspaceId}`;
const person = (a) => `${root(a)}/prospects/${a.prospectId}`;
const omit = (a, keys) =>
  Object.fromEntries(Object.entries(a).filter(([k]) => !keys.includes(k)));
const body = (a) => omit(a, ["workspaceId", "prospectId"]);
function qs(a, keys = ["workspaceId", "prospectId", "experimentId"]) {
  const values = {};
  for (const [k, v] of Object.entries(omit(a, keys))) {
    if (v === undefined) continue;
    if (typeof v === "object" && v !== null)
      for (const [child, value] of Object.entries(v))
        values[k + child[0].toUpperCase() + child.slice(1)] = String(value);
    else values[k] = String(v);
  }
  return new URLSearchParams(values).toString();
}
export const assignmentOperations = {
  workspace_prospect_assignments: {
    schema: z
      .object({
        ...workspace,
        assignedToUserId: uuid.optional(),
        unassigned: z.boolean().optional(),
        experimentId: uuid.optional(),
        search: z.string().optional(),
        cursor: uuid.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    method: "GET",
    path: (a) => root(a) + "/assignments?" + qs(a, ["workspaceId"]),
    scoped: true,
  },
  workspace_prospect_assignment: {
    schema: z
      .object({
        ...workspace,
        prospectId: uuid,
        history: page.optional(),
        participations: page.optional(),
        participationEvents: page.optional(),
        routingReports: page.optional(),
      })
      .strict(),
    method: "GET",
    path: (a) => person(a) + "/assignment?" + qs(a),
    scoped: true,
  },
  workspace_prospect_experiment_fit: {
    schema: z
      .object({
        ...workspace,
        prospectId: uuid,
        experimentId: uuid,
        overrides: page.optional(),
      })
      .strict(),
    method: "GET",
    path: (a) => person(a) + `/experiments/${a.experimentId}/fit?` + qs(a),
    scoped: true,
  },
  workspace_prospect_assignment_set: {
    schema: z
      .object({
        ...request,
        prospectId: uuid,
        assigneeUserId: uuid.nullable(),
        expectedAssignmentVersion: version,
        reason: z.string(),
      })
      .strict(),
    method: "POST",
    path: (a) => person(a) + "/assignment",
    body,
    scoped: true,
  },
  workspace_routing_rules_get: {
    schema: z.object(workspace).strict(),
    method: "GET",
    path: (a) => root(a) + "/routing-rules",
    scoped: true,
  },
  workspace_routing_rules_replace: {
    schema: z
      .object({
        ...request,
        expectedRulesVersion: version,
        rules: z.array(rule).max(100),
      })
      .strict(),
    method: "PUT",
    path: (a) => root(a) + "/routing-rules",
    body: (a) => omit(a, ["workspaceId"]),
    scoped: true,
  },
  workspace_routing_apply: {
    schema: z
      .object({
        ...request,
        prospectId: uuid,
        experimentId: uuid.optional(),
        expectedAssignmentVersion: version,
        rulesVersion: version,
        outcomes: z
          .array(
            z
              .object({
                ruleId: uuid,
                result: z.enum(["match", "no_match", "unknown"]),
                reason: z.string().optional(),
              })
              .strict(),
          )
          .max(100),
        skill: z.object({ id: z.string(), version: z.string() }).strict(),
      })
      .strict(),
    method: "POST",
    path: (a) => person(a) + "/routing",
    body,
    scoped: true,
  },
  workspace_fit_override_set: {
    schema: z
      .object({
        ...request,
        prospectId: uuid,
        experimentId: uuid,
        experimentRevision: z.number().int().positive(),
        expectedOverrideVersion: version,
        action: z.enum(["set", "clear"]),
        value: z.enum(["high", "moderate", "low", "no_fit"]).optional(),
        reason: z.string(),
      })
      .strict(),
    method: "POST",
    path: (a) => person(a) + "/fit-override",
    body,
    scoped: true,
  },
  workspace_prospect_move: {
    schema: z
      .object({
        ...request,
        prospectId: uuid,
        expectedSourceParticipationId: uuid,
        sourceExperimentId: uuid,
        destinationExperimentId: uuid,
        destinationExperimentRevision: z.number().int().positive(),
        destinationQualificationReceiptId: uuid,
        expectedAssignmentVersion: version,
        reason: z.string(),
      })
      .strict(),
    method: "POST",
    path: (a) => person(a) + "/move",
    body,
    scoped: true,
  },
  workspace_member_remove: {
    schema: z
      .object({
        ...request,
        expectedMembershipId: uuid,
        memberUserId: uuid,
        reason: z.string(),
      })
      .strict(),
    method: "POST",
    path: (a) => root(a) + "/members/remove",
    body: (a) => omit(a, ["workspaceId"]),
    scoped: true,
  },
  workspace_leave: {
    schema: z
      .object({ ...request, expectedMembershipId: uuid, reason: z.string() })
      .strict(),
    method: "POST",
    path: (a) => root(a) + "/members/leave",
    body: (a) => omit(a, ["workspaceId"]),
    scoped: true,
  },
};
