import { LocalStorage } from "@raycast/api";

const STORAGE_KEY = "exclusionRules";

export type ExclusionRuleType = "regex" | "contains" | "not_contains";

export type ExclusionRule = {
  id: string;
  type: ExclusionRuleType;
  pattern: string;
};

function generateId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function getExclusionRules(): Promise<ExclusionRule[]> {
  const stored = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as ExclusionRule[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addExclusionRule(type: ExclusionRuleType, pattern: string): Promise<ExclusionRule> {
  const rules = await getExclusionRules();
  const rule: ExclusionRule = { id: generateId(), type, pattern };
  rules.push(rule);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  return rule;
}

export async function removeExclusionRule(id: string): Promise<void> {
  const rules = await getExclusionRules();
  const filtered = rules.filter((r) => r.id !== id);
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function isTableExcluded(tableKey: string, rules: ExclusionRule[]): boolean {
  for (const rule of rules) {
    switch (rule.type) {
      case "regex": {
        try {
          if (new RegExp(rule.pattern).test(tableKey)) return true;
        } catch {
          // invalid regex, skip
        }
        break;
      }
      case "contains":
        if (tableKey.includes(rule.pattern)) return true;
        break;
      case "not_contains":
        if (!tableKey.includes(rule.pattern)) return true;
        break;
    }
  }
  return false;
}

export function filterTables<T extends { key: string }>(items: T[], rules: ExclusionRule[]): T[] {
  if (rules.length === 0) return items;
  return items.filter((item) => !isTableExcluded(item.key, rules));
}

export function ruleDescription(rule: ExclusionRule): string {
  switch (rule.type) {
    case "regex":
      return `Regex: ${rule.pattern}`;
    case "contains":
      return `Contains: ${rule.pattern}`;
    case "not_contains":
      return `Does not contain: ${rule.pattern}`;
  }
}
