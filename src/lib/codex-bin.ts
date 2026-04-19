import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getOptionalEnv } from "@/lib/env";

export function resolveCodexBin(): string {
  const configured = getOptionalEnv("CODEX_BIN");
  if (configured && existsSync(configured)) return configured;

  const fromPath = findCodexInPath();
  if (fromPath) return fromPath;

  const fromVsCode = findVsCodeBundledCodex();
  if (fromVsCode) return fromVsCode;

  return configured || "codex";
}

function findCodexInPath(): string {
  try {
    return execFileSync("which", ["codex"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function findVsCodeBundledCodex(): string {
  const extensionsDir = join(homedir(), ".vscode", "extensions");
  if (!existsSync(extensionsDir)) return "";

  const candidates = readdirSync(extensionsDir)
    .filter((name) => name.startsWith("openai.chatgpt-"))
    .sort()
    .reverse()
    .map((name) => join(extensionsDir, name, "bin", "macos-x86_64", "codex"));

  return candidates.find((path) => existsSync(path)) || "";
}
