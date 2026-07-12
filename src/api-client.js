export const DEFAULT_HOST = "https://app.audienti.com";

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
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

  users(accountId) {
    return this.requestJson(accountPath(accountId, ["users"]));
  }

  offers(accountId) {
    return this.requestJson(accountPath(accountId, ["offers"]));
  }

  createOffer(accountId, body) {
    return this.requestJson(accountPath(accountId, ["offers"]), {
      method: "POST",
      body
    });
  }

  icps(accountId) {
    return this.requestJson(accountPath(accountId, ["icps"]));
  }

  createIcp(accountId, body) {
    return this.requestJson(accountPath(accountId, ["icps"]), {
      method: "POST",
      body
    });
  }

  companies(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["companies"], query));
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

  motionStatus(accountId, motionId) {
    return this.requestJson(accountPath(accountId, ["motions", motionId, "status"]));
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

  operatorQueue(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["operator"], query));
  }

  operatorNext(accountId, query = {}) {
    return this.requestJson(accountPath(accountId, ["operator", "next"], query));
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

  async requestJson(path, { method = "GET", body } = {}) {
    const response = await this.fetchImpl(new URL(path, `${this.host}/`), {
      method,
      headers: this.headers(body),
      body: body === undefined ? undefined : JSON.stringify(body)
    });

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
    const details = reasons?.length > 0 ? reasons.join(", ") : body?.error;
    return details ? `Audienti rejected the request: ${details}` : "Audienti rejected the request.";
  }

  return `Audienti API request failed with HTTP ${status}.`;
}
