export type SafetyFlag = "politics" | "discrimination" | "uncertain_claim" | "strong_agitation";

type SafetyRule = {
  flag: SafetyFlag;
  patterns: RegExp[];
};

const SAFETY_RULES: SafetyRule[] = [
  {
    flag: "politics",
    patterns: [/政治|政党|選挙|大統領|首相|内閣|国会|戦争|紛争|外交|デモ/i, /election|president|prime minister|war|conflict|politic/i]
  },
  {
    flag: "discrimination",
    patterns: [/差別|人種|民族|障害者|性別で|国籍で|移民|宗教/i, /racist|race|ethnic|immigrant|religion|gender/i]
  },
  {
    flag: "uncertain_claim",
    patterns: [/必ず.{0,12}(話せる|伸びる|成功|増える|バズる)/i, /絶対.{0,12}(話せる|伸びる|成功|増える|バズる)/i, /科学的に証明|研究で証明/i, /guaranteed|scientifically proven/i]
  },
  {
    flag: "strong_agitation",
    patterns: [/情弱|バカ|終わってる|人生損してる|まだ.*してないの|今すぐやめろ/i, /idiot|stupid|loser|you are doomed/i]
  }
];

export function detectDangerousContent(content: string): SafetyFlag[] {
  const flags = new Set<SafetyFlag>();
  for (const rule of SAFETY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(content))) {
      flags.add(rule.flag);
    }
  }
  return [...flags];
}

export function shouldAutoStop(content: string): boolean {
  return detectDangerousContent(content).length > 0;
}

export function describeSafetyFlags(flags: string[]): string {
  if (flags.length === 0) return "問題なし";

  const labels: Record<string, string> = {
    politics: "政治",
    discrimination: "差別",
    uncertain_claim: "不確実情報",
    strong_agitation: "強い煽り"
  };

  return flags.map((flag) => labels[flag] || flag).join(", ");
}
