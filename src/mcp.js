import { ApiError, AudientiClient, DEFAULT_HOST } from "./api-client.js";
import { readConfig } from "./config.js";

export async function runMcpServer({
  input = process.stdin,
  output = process.stdout,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  input.setEncoding("utf8");

  let buffer = "";
  for await (const chunk of input) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const response = await handleRawMessage(line, { env, fetchImpl });
      if (response) output.write(`${JSON.stringify(response)}\n`);
    }
  }
}

export async function handleRawMessage(line, options = {}) {
  try {
    return handleMcpRequest(JSON.parse(line), options);
  } catch (error) {
    return errorResponse(null, -32700, error.message);
  }
}

export async function handleMcpRequest(message, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!message || message.jsonrpc !== "2.0") {
    return errorResponse(message?.id ?? null, -32600, "Invalid JSON-RPC request.");
  }

  if (message.id === undefined || message.id === null) return null;

  try {
    return await remoteMcpResponse(message, { env, fetchImpl });
  } catch (error) {
    return errorResponse(message.id, -32603, toolErrorMessage(error), toolErrorPayload(error));
  }
}

async function remoteMcpResponse(message, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = await readConfig({ env });
  if (!config.token) throw new Error("Not authenticated. Run `audienti auth login` or `audienti auth token <token>`.");

  const client = new AudientiClient({
    host: config.host || DEFAULT_HOST,
    token: config.token,
    fetchImpl
  });

  return client.mcp(withSelectedAccount(message, config));
}

function withSelectedAccount(message, config) {
  if (message.method !== "tools/call" || !config.accountId) return message;

  const params = message.params || {};
  const args = params.arguments || {};
  if (args.account_id) return message;

  return {
    ...message,
    params: {
      ...params,
      arguments: {
        ...args,
        account_id: config.accountId
      }
    }
  };
}

function errorResponse(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function toolErrorMessage(error) {
  if (error instanceof ApiError && error.status) return `${error.message} (HTTP ${error.status})`;
  return error.message;
}

function toolErrorPayload(error) {
  return {
    error: error.message,
    status: error instanceof ApiError ? error.status || null : null,
    body: error instanceof ApiError ? error.body || null : null
  };
}
