import { readFileSync } from "node:fs";

const MARKETPLACE_URL = "https://github.com/audienti/plugins";
const MARKETPLACE_COMMIT = "271515e227b4ce25965992b6c7975d642a14dc7b";
const SOCIAL_ENVIRONMENT_CHECK = "Before researching this social network, inspect the tools actually available in the local agent environment: browser/search tools, connected MCP tools or apps, relevant installed skills and CLIs, and existing secure credential configuration. Do not print secrets. Check each available tool's documentation and permissions, then choose a supported read-only way to access the network. Do not assume Apify, a browser session, a search API or network credentials exist. Do not install tools, grant access, send messages or post comments to test access. If no suitable access is available, report the missing capability and ask the owner how to proceed; do not invent findings or silently substitute another network.";

const LOCAL_SKILLS = [
  { name: "audienti", description: "Operate Audienti through the CLI, with outbound methodology.", path: "../skills/audienti/SKILL.md" },
  { name: "audienti-gift-research", description: "Research a website for useful gifts, independently of the app.", path: "../skills/audienti-gift-research/SKILL.md" }
];

// Discovery metadata only. Upstream repositories own the skills and dependencies.
// Selected outbound research and sales assets. Names are plugin IDs from
// .agents/plugins/marketplace.json, not repository slugs
// or skill folder names. Claude availability comes from .claude-plugin/marketplace.json.
// Snapshot of audienti/plugins at MARKETPLACE_COMMIT; no runtime app or catalog call.
const MARKETPLACE_PLUGINS = [
  { name: "signal-prospect-research", repo: "signal-research", description: "Research target companies and people from an outbound premise.", category: "Sales" },
  { name: "reddit-pain-finder", repo: "reddit-pain-finder", description: "Find relevant Reddit discussions and potential engagement.", category: "Sales", network: "reddit" },
  { name: "linkedin-pain-finder", repo: "linkedin-pain-finder", description: "Find relevant LinkedIn posts and potential engagement.", category: "Sales", network: "linkedin" },
  { name: "twitter-signal-finder", repo: "twitter-signal-finder", description: "Find relevant posts on X.", category: "Sales", network: "x" },
  { name: "instagram-comment-finder", repo: "instagram-comment-finder", description: "Find relevant Instagram posts and comments.", category: "Sales", network: "instagram" },
  { name: "facebook-comment-finder", repo: "facebook-comment-finder", description: "Find relevant Facebook posts and comments.", category: "Sales", network: "facebook" },
  { name: "tiktok-comment-finder", repo: "tiktok-comment-finder", description: "Find relevant TikTok videos and comments.", category: "Sales", network: "tiktok" },
  { name: "sales-sheet-builder", repo: "sales-sheet-builder", description: "Build a sales sheet and separate research workbook.", category: "Sales" }
];

export function methodologyHelp() {
  return readFileSync(new URL("../skills/audienti/references/methodology.md", import.meta.url), "utf8").trimEnd();
}

export function skillCatalog() {
  return {
    marketplace: { url: MARKETPLACE_URL, commit: MARKETPLACE_COMMIT, scope: "Outbound research and sales assets" },
    skills: [
      ...LOCAL_SKILLS.map(({ name, description }) => ({ name, description, source: "bundled" })),
      ...MARKETPLACE_PLUGINS.map(({ name, repo, description, category, network }) => ({
        name, description, category, source: "marketplace",
        ...(network ? { network, environment_check: SOCIAL_ENVIRONMENT_CHECK } : {}),
        repository_url: `https://github.com/audienti/${repo}`,
        readme_url: `https://github.com/audienti/${repo}#readme`,
        install: {
          codex: ["codex plugin marketplace add audienti/plugins", `codex plugin add ${name}@audienti`],
          claude: ["claude plugin marketplace add audienti/plugins", `claude plugin install ${name}@audienti`]
        }
      }))
    ]
  };
}

export function skillDetails(name) {
  const skill = skillCatalog().skills.find((entry) => entry.name === name);
  if (!skill) return undefined;
  const local = LOCAL_SKILLS.find((entry) => entry.name === name);
  if (local) return { ...skill, instructions: readFileSync(new URL(local.path, import.meta.url), "utf8").trimEnd() };
  return {
    ...skill,
    instructions: [skill.environment_check, "Read the upstream README and applicable SKILL.md before using this plugin. Check its tools, credentials, dependencies and authorization requirements. These instructions are not bundled or executed by the CLI; installation is a separate action. A research signal is evidence to investigate, not proof of pain or intent."].filter(Boolean).join("\n\n")
  };
}
