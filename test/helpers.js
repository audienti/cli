import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTempConfigHome(testFn) {
  const root = await mkdtemp(join(tmpdir(), "audienti-cli-"));
  const env = { AUDIENTI_CONFIG_HOME: root };

  try {
    await testFn({ root, env });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function captureStream() {
  return {
    output: "",
    write(chunk) {
      this.output += chunk;
    }
  };
}

export function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

export function createFetch(resolver) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: url.toString(), options });
    return resolver(url, options, calls);
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}
