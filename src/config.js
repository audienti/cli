import { chmod, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const CONFIG_FILENAME = "config.json";
const ACCOUNT_CONFIG_KEYS = ["accountId", "accountName", "accountUserId", "accountUserName", "accountUserEmail"];

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export function configDirectory(env = process.env) {
  return env.AUDIENTI_CONFIG_HOME || join(homedir(), ".config", "audienti");
}

export function configPath(env = process.env) {
  return join(configDirectory(env), CONFIG_FILENAME);
}

export function fallbackConfigDirectory(env = process.env) {
  return env.AUDIENTI_CONFIG_FALLBACK_HOME || null;
}

export function fallbackConfigPath(env = process.env) {
  const directory = fallbackConfigDirectory(env);
  return directory ? join(directory, CONFIG_FILENAME) : null;
}

export async function readConfig({ env = process.env } = {}) {
  const config = await readConfigFile(configPath(env));
  const fallbackPath = fallbackConfigPath(env);
  if (!fallbackPath || fallbackPath === configPath(env)) return applyConfigOverrides(config, env);

  const fallbackConfig = await readConfigFile(fallbackPath);
  return applyConfigOverrides(mergeFallbackConfig(config, fallbackConfig), env);
}

async function readConfigFile(filePath) {

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      throw new ConfigError(`Config file is invalid JSON: ${filePath}`);
    }

    throw error;
  }
}

function mergeFallbackConfig(config, fallbackConfig) {
  const merged = { ...config };

  if (!merged.host && !merged.token && fallbackConfig.host && fallbackConfig.token) {
    merged.host = fallbackConfig.host;
    merged.token = fallbackConfig.token;
  }

  if (!merged.accountId && fallbackConfig.accountId) {
    for (const key of ACCOUNT_CONFIG_KEYS) {
      if (fallbackConfig[key]) merged[key] = fallbackConfig[key];
    }
  } else if (merged.accountId && merged.accountId === fallbackConfig.accountId) {
    for (const key of ACCOUNT_CONFIG_KEYS) {
      if (!merged[key] && fallbackConfig[key]) merged[key] = fallbackConfig[key];
    }
  }

  return merged;
}

function applyConfigOverrides(config, env) {
  if (!env.AUDIENTI_CONFIG_HOST_OVERRIDE) return config;

  const overridden = {
    ...config,
    host: env.AUDIENTI_CONFIG_HOST_OVERRIDE
  };
  if (config.token && !sameCredentialOrigin(config.host, overridden.host)) delete overridden.token;

  return overridden;
}

function sameCredentialOrigin(left, right) {
  if (!left || !right) return false;

  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return String(left).replace(/\/+$/, "") === String(right).replace(/\/+$/, "");
  }
}

export async function writeConfig(config, { env = process.env } = {}) {
  const filePath = configPath(env);
  const dir = dirname(filePath);
  const tempPath = join(dir, `.config-${process.pid}-${Date.now()}.tmp`);

  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);

  try {
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await chmod(tempPath, 0o600);
    await rename(tempPath, filePath);
    await chmod(filePath, 0o600);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function deleteConfig({ env = process.env } = {}) {
  try {
    await unlink(configPath(env));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function maskToken(token) {
  const value = String(token || "");
  if (value.length <= 8) return "********";

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
