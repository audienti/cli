export const DEFAULT_HOST = "https://app.audienti.com";

export class ApiError extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.cause = cause;
  }
}

export function normalizeHost(host = DEFAULT_HOST) {
  const trimmed = String(host || DEFAULT_HOST).trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export class AudientiClient {
  constructor({ host = DEFAULT_HOST, token, fetchImpl = globalThis.fetch } = {}) {
    if (!fetchImpl) {
      throw new Error("This Node runtime does not provide fetch.");
    }

    this.host = normalizeHost(host);
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  me() {
    return this.requestJson("/api/v1/me.json");
  }

  accounts() {
    return this.requestJson("/api/v1/accounts.json");
  }

  mcp(message) {
    return this.requestJson("/mcp", {
      method: "POST",
      body: message
    });
  }

  users(accountId) {
    return this.requestJson(accountPath(accountId, ["users"]));
  }

  userAutomation(accountId, userId, query = {}) {
    return this.requestJson(accountPath(accountId, ["users", userId, "automation"], query));
  }

  updateUserAutomation(accountId, userId, body, query = {}) {
    return this.requestJson(accountPath(accountId, ["users", userId, "automation"], query), {
      method: "PATCH",
      body
    });
  }

  socialCookies(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["social_cookies"], query));
  }

  userActivity(accountId, userId, query = {}) {
    return this.requestJson(accountPath(accountId, ["operations", "users", userId, "activity"], query));
  }

  offers(accountId) {
    return this.requestJson(accountPath(accountId, ["offers"]));
  }

  offer(accountId, offerId) {
    return this.requestJson(accountPath(accountId, ["offers", offerId]));
  }

  createOffer(accountId, body) {
    return this.requestJson(accountPath(accountId, ["offers"]), {
      method: "POST",
      body
    });
  }

  updateOffer(accountId, offerId, body) {
    return this.requestJson(accountPath(accountId, ["offers", offerId]), {
      method: "PATCH",
      body
    });
  }

  deleteOffer(accountId, offerId) {
    return this.requestJson(accountPath(accountId, ["offers", offerId]), {
      method: "DELETE"
    });
  }

  icps(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["icps"], query));
  }

  icp(accountId, icpId) {
    return this.requestJson(accountPath(accountId, ["icps", icpId]));
  }

  createIcp(accountId, body) {
    return this.requestJson(accountPath(accountId, ["icps"]), {
      method: "POST",
      body
    });
  }

  updateIcp(accountId, icpId, body) {
    return this.requestJson(accountPath(accountId, ["icps", icpId]), {
      method: "PATCH",
      body
    });
  }

  archiveIcp(accountId, icpId) {
    return this.requestJson(accountPath(accountId, ["icps", icpId, "archive"]), {
      method: "POST",
      body: {}
    });
  }

  restoreIcp(accountId, icpId) {
    return this.requestJson(accountPath(accountId, ["icps", icpId, "restore"]), {
      method: "POST",
      body: {}
    });
  }

  addIcpTag(accountId, icpId, body) {
    return this.requestJson(accountPath(accountId, ["icps", icpId, "add_tag"]), {
      method: "POST",
      body
    });
  }

  removeIcpTag(accountId, icpId, body) {
    return this.requestJson(accountPath(accountId, ["icps", icpId, "remove_tag"]), {
      method: "DELETE",
      body
    });
  }

  companies(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["companies"], query));
  }

  dncEntries(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["dnc"], query));
  }

  createDncEntry(accountId, body) {
    return this.requestJson(accountPath(accountId, ["dnc"]), {
      method: "POST",
      body
    });
  }

  importDncEntries(accountId, body) {
    return this.requestJson(accountPath(accountId, ["dnc", "import"]), {
      method: "POST",
      body
    });
  }

  deleteDncEntry(accountId, entryId) {
    return this.requestJson(accountPath(accountId, ["dnc", entryId]), {
      method: "DELETE"
    });
  }

  companyRules(accountId) {
    return this.requestJson(accountPath(accountId, ["company_rules"]));
  }

  createCompanyRule(accountId, body) {
    return this.requestJson(accountPath(accountId, ["company_rules"]), {
      method: "POST",
      body
    });
  }

  updateCompanyRule(accountId, ruleId, body) {
    return this.requestJson(accountPath(accountId, ["company_rules", ruleId]), {
      method: "PATCH",
      body
    });
  }

  deleteCompanyRule(accountId, ruleId) {
    return this.requestJson(accountPath(accountId, ["company_rules", ruleId]), {
      method: "DELETE"
    });
  }

  applyCompanyRule(accountId, ruleId) {
    return this.requestJson(accountPath(accountId, ["company_rules", ruleId, "apply"]), {
      method: "POST"
    });
  }

  applyAllCompanyRules(accountId) {
    return this.requestJson(accountPath(accountId, ["company_rules", "apply_all"]), {
      method: "POST"
    });
  }

  tags(accountId) {
    return this.requestJson(accountPath(accountId, ["tags"]));
  }

  tasks(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["tasks"], query));
  }

  createTask(accountId, body) {
    return this.requestJson(accountPath(accountId, ["tasks"]), {
      method: "POST",
      body
    });
  }

  completeTask(accountId, taskId) {
    return this.requestJson(accountPath(accountId, ["tasks", taskId, "complete"]), {
      method: "PATCH"
    });
  }

  lists(accountId) {
    return this.requestJson(accountPath(accountId, ["lists"]));
  }

  createList(accountId, body) {
    return this.requestJson(accountPath(accountId, ["lists"]), {
      method: "POST",
      body
    });
  }

  list(accountId, listId) {
    return this.requestJson(accountPath(accountId, ["lists", listId]));
  }

  updateList(accountId, listId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId]), {
      method: "PATCH",
      body
    });
  }

  addListTag(accountId, listId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "add_tag"]), {
      method: "POST",
      body
    });
  }

  removeListTag(accountId, listId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "remove_tag"]), {
      method: "DELETE",
      body
    });
  }

  deleteList(accountId, listId) {
    return this.requestJson(accountPath(accountId, ["lists", listId]), {
      method: "DELETE"
    });
  }

  listProspects(accountId, listId, query = {}) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "prospects"], query));
  }

  addListProspects(accountId, listId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "prospects"]), {
      method: "POST",
      body
    });
  }

  removeListProspects(accountId, listId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "prospects"]), {
      method: "DELETE",
      body
    });
  }

  listRoutingRules(accountId, listId) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "routing_rules"]));
  }

  createListRoutingRule(accountId, listId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "routing_rules"]), {
      method: "POST",
      body
    });
  }

  updateListRoutingRule(accountId, listId, ruleId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "routing_rules", ruleId]), {
      method: "PATCH",
      body
    });
  }

  removeListRoutingRule(accountId, listId, ruleId) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "routing_rules", ruleId]), {
      method: "DELETE"
    });
  }

  moveListRoutingRule(accountId, listId, ruleId, body) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "routing_rules", ruleId, "move"]), {
      method: "PATCH",
      body
    });
  }

  applyListRoutingRules(accountId, listId) {
    return this.requestJson(accountPath(accountId, ["lists", listId, "routing_rules", "apply"]), {
      method: "POST",
      body: {}
    });
  }

  motions(accountId) {
    return this.requestJson(accountPath(accountId, ["motions"]));
  }

  motion(accountId, motionId) {
    return this.requestJson(accountPath(accountId, ["motions", motionId]));
  }

  createMotion(accountId, body) {
    return this.requestJson(accountPath(accountId, ["motions"]), {
      method: "POST",
      body
    });
  }

  updateMotion(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId]), {
      method: "PATCH",
      body
    });
  }

  motionAbmCompanies(accountId, motionId) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "abm_companies"]));
  }

  addMotionAbmCompanies(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "abm_companies"]), {
      method: "POST",
      body
    });
  }

  removeMotionAbmCompany(accountId, motionId, rowId) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "abm_companies", rowId]), {
      method: "DELETE"
    });
  }

  contentPrograms(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["content_ops", "programs"], query));
  }

  contentPlan(accountId, programId, query = {}) {
    return this.requestJson(accountPath(accountId, ["content_ops", "programs", programId, "plan"], query));
  }

  contentWorkItem(accountId, workItemId) {
    return this.requestJson(accountPath(accountId, ["content_ops", "work_items", workItemId]));
  }

  contentFeedback(accountId, workItemId, body) {
    return this.requestJson(accountPath(accountId, ["content_ops", "work_items", workItemId, "feedback"]), { method: "POST", body });
  }

  contentApprove(accountId, workItemId) {
    return this.requestJson(accountPath(accountId, ["content_ops", "work_items", workItemId, "approve"]), { method: "POST" });
  }

  contentSchedule(accountId, workItemId, body) {
    return this.requestJson(accountPath(accountId, ["content_ops", "work_items", workItemId, "schedule"]), { method: "POST", body });
  }

  contentPublish(accountId, workItemId, body) {
    return this.requestJson(accountPath(accountId, ["content_ops", "work_items", workItemId, "publish"]), { method: "POST", body });
  }

  contentComments(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["content_ops", "comment_tasks"], query));
  }

  contentReply(accountId, commentTaskId, body) {
    return this.requestJson(accountPath(accountId, ["content_ops", "comment_tasks", commentTaskId, "send_reply"]), { method: "POST", body });
  }

  contentDismiss(accountId, commentTaskId) {
    return this.requestJson(accountPath(accountId, ["content_ops", "comment_tasks", commentTaskId, "dismiss"]), { method: "POST" });
  }

  addMotionTag(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "add_tag"]), {
      method: "POST",
      body
    });
  }

  removeMotionTag(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "remove_tag"]), {
      method: "DELETE",
      body
    });
  }

  deleteMotion(accountId, motionId) {
    return this.requestJson(accountPath(accountId, ["motions", motionId]), {
      method: "DELETE"
    });
  }

  cloneMotion(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "clone"]), {
      method: "POST",
      body
    });
  }

  moveMotionProspects(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "move_prospects"]), {
      method: "POST",
      body
    });
  }

  motionStatus(accountId, motionId) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "status"]));
  }

  runMotionDiscovery(accountId, motionId, body = {}) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "run_discovery"]), {
      method: "POST",
      body
    });
  }

  createQuickStart(accountId, body) {
    return this.requestJson(accountPath(accountId, ["quick_start"]), {
      method: "POST",
      body
    });
  }

  quickStart(accountId, draftId) {
    return this.requestJson(accountPath(accountId, ["quick_start", draftId]));
  }

  confirmQuickStart(accountId, draftId, body = {}) {
    return this.requestJson(accountPath(accountId, ["quick_start", draftId, "confirm"]), {
      method: "POST",
      body
    });
  }

  motionProspects(accountId, motionId, query = {}) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "prospects"], query));
  }

  addMotionProspects(accountId, motionId, body) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "prospects"]), {
      method: "POST",
      body
    });
  }

  prospects(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["prospects"], query));
  }

  prospect(accountId, prospectId) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId]));
  }

  moveProspectAccount(accountId, prospectId, body) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "move_account"]), {
      method: "POST",
      body
    });
  }

  replanProspect(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "replan"]), {
      method: "POST",
      body
    });
  }

  reenrichProspect(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "reenrich"]), {
      method: "POST",
      body
    });
  }

  refreshProspectQueue(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "refresh_queue"]), {
      method: "POST",
      body
    });
  }

  assignProspects(accountId, body) {
    return this.requestJson(accountPath(accountId, ["prospects", "assign"]), {
      method: "POST",
      body
    });
  }

  prospectTimeline(accountId, prospectId, query = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "timeline"], query));
  }

  prospectMessageTypes(accountId, prospectId) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "message_types"]));
  }

  writeProspectMessage(accountId, prospectId, body) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "write_message"]), {
      method: "POST",
      body
    });
  }

  rejectProspect(accountId, prospectId) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "reject"]), {
      method: "POST"
    });
  }

  nurtureProspect(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "nurture"]), {
      method: "POST",
      body
    });
  }

  restoreProspect(accountId, prospectId) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "restore"]), {
      method: "POST"
    });
  }

  lockProspect(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "lock"]), {
      method: "POST",
      body
    });
  }

  unlockProspect(accountId, prospectId) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "unlock"]), {
      method: "POST"
    });
  }

  prospectSequencePreview(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "sequence_preview"]), {
      method: "POST",
      body
    });
  }

  prospectSequenceExport(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "sequence_export"]), {
      method: "POST",
      body
    });
  }

  createProspectSequenceExportJob(accountId, prospectId, body = {}) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "sequence_export_jobs"]), {
      method: "POST",
      body
    });
  }

  prospectSequenceExportJob(accountId, prospectId, jobId) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "sequence_export_jobs", jobId]));
  }

  addProspectNote(accountId, prospectId, body) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "add_note"]), {
      method: "POST",
      body
    });
  }

  addProspectProfile(accountId, prospectId, body) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "profiles"]), {
      method: "POST",
      body
    });
  }

  reportBadProspectProfile(accountId, prospectId, body) {
    return this.requestJson(accountPath(accountId, ["prospects", prospectId, "report_bad_profile"]), {
      method: "POST",
      body
    });
  }

  prospectImport(accountId, body) {
    return this.requestJson(accountPath(accountId, ["prospect_imports"]), {
      method: "POST",
      body
    });
  }

  prospectImportStatus(accountId, importId) {
    return this.requestJson(accountPath(accountId, ["prospect_imports", importId]));
  }

  linkedinReviewReports(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["tools", "linkedin-review", "reports"], query));
  }

  linkedinReview(accountId, body) {
    return this.requestJson(accountPath(accountId, ["tools", "linkedin-review", "reports"]), {
      method: "POST",
      body
    });
  }

  linkedinReviewStatus(accountId, reportId) {
    return this.requestJson(accountPath(accountId, ["tools", "linkedin-review", "reports", reportId]));
  }

  humanizeText(accountId, body) {
    return this.requestJson(accountPath(accountId, ["tools", "humanize"]), {
      method: "POST",
      body: { humanization: body }
    });
  }

  operatorQueue(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["operator"], query));
  }

  inboxOpsFilters(accountId) {
    return this.requestJson(accountPath(accountId, ["inbox_ops", "filters"]));
  }

  updateInboxOpsRule(accountId, rowId, body) {
    return this.requestJson(accountPath(accountId, ["inbox_ops", rowId, "rule"]), {
      method: "PATCH",
      body
    });
  }

  setInboxOpsRule(accountId, body) {
    return this.requestJson(accountPath(accountId, ["inbox_ops", "rules"]), {
      method: "PATCH",
      body
    });
  }

  removeInboxOpsRule(accountId, body) {
    return this.requestJson(accountPath(accountId, ["inbox_ops", "rules"]), {
      method: "DELETE",
      body
    });
  }

  operatorNext(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["operator", "next"], query));
  }

  requeueOperatorFailedDrafts(accountId, body = {}) {
    return this.requestJson(accountPath(accountId, ["operator", "failed_drafts", "requeue"]), {
      method: "POST",
      body
    });
  }

  operatorOutcome(accountId, body) {
    return this.requestJson(accountPath(accountId, ["operator", "outcome"]), {
      method: "POST",
      body
    });
  }

  analyticsProspects(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "prospects"], query));
  }

  analyticsUsers(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "users"], query));
  }

  analyticsVisibility(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "visibility"], query));
  }

  analyticsContent(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "content"], query));
  }

  analyticsDashboard(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "dashboard"], query));
  }

  analyticsMotions(accountId) {
    return this.requestJson(accountPath(accountId, ["analytics", "motions"]));
  }

  analyticsIcps(accountId) {
    return this.requestJson(accountPath(accountId, ["analytics", "icps"]));
  }

  analyticsMetrics(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "metrics"], query));
  }

  analyticsStages(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "stages"], query));
  }

  createAnalyticsCohortList(accountId, body = {}) {
    return this.requestJson(accountPath(accountId, ["analytics", "cohort_lists"]), {
      method: "POST",
      body
    });
  }

  async requestJson(path, { method = "GET", body } = {}) {
    const url = new URL(path, `${this.host}/`);
    let response;

    try {
      response = await this.fetchImpl(url, {
        method,
        headers: this.headers(body),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      throw new ApiError(networkErrorMessage(url, error), { cause: error });
    }

    const responseBody = await parseBody(response);

    if (!response.ok) {
      throw new ApiError(errorMessage(response.status, responseBody), {
        status: response.status,
        body: responseBody
      });
    }

    return responseBody;
  }

  headers(body) {
    const headers = {
      Accept: "application/json"
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }
}

function accountPath(accountId, segments, query = {}) {
  const encodedSegments = [
    "api",
    "v1",
    "accounts",
    accountId,
    ...segments
  ].map((segment) => encodeURIComponent(segment));
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      searchParams.set(key, String(value));
    }
  }

  const path = `/${encodedSegments.join("/")}.json`;
  const search = searchParams.toString();
  return search ? `${path}?${search}` : path;
}

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(status, body) {
  if (status === 401) {
    return "Authentication failed. Run `audienti auth token <token>` with a valid API token.";
  }

  if (status === 403) {
    return "The API token is not allowed to access that Audienti resource.";
  }

  if (status === 404) {
    return "The requested Audienti resource was not found.";
  }

  if (status === 409) {
    return body?.error || "Audienti rejected the request because the resource changed. Re-fetch and try again.";
  }

  if (status === 422) {
    const reasons = [body?.errors, body?.details].find(Array.isArray);
    const details = reasons?.length > 0 ? reasons.join(", ") : body?.message || body?.error;
    return details ? `Audienti rejected the request: ${details}` : "Audienti rejected the request.";
  }

  return `Audienti API request failed with HTTP ${status}.`;
}

function networkErrorMessage(url, error) {
  const detail = error?.message ? ` (${error.message})` : "";
  return [
    `Unable to reach Audienti API at ${url.origin}.`,
    "Check that the app is running and the configured host is correct.",
    "For workspace-local CLI auth, start the workspace app server first or pass `--host <url>` to `auth token`.",
    detail
  ].join(" ").trim();
}
