import { Action, ActionPanel, Form, List, launchCommand, LaunchType } from "@raycast/api";
import { useEffect, useState } from "react";
import {
  addExclusionRule,
  getExclusionRules,
  removeExclusionRule,
  ruleDescription,
  type ExclusionRule,
  type ExclusionRuleType,
} from "./lib/exclusion";

const RULE_TYPE_OPTIONS: { value: ExclusionRuleType; label: string }[] = [
  { value: "regex", label: "Regex match" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
];

function AddRuleForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Rule"
            onSubmit={async (values: { ruleType: ExclusionRuleType; pattern: string }) => {
              const pattern = values.pattern?.trim();
              if (!pattern) return;
              await addExclusionRule(values.ruleType, pattern);
              onSaved();
            }}
          />
          <Action title="Cancel" onAction={onCancel} />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="ruleType" title="Exclusion type">
        {RULE_TYPE_OPTIONS.map((opt) => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.label} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="pattern"
        title="Pattern"
        placeholder={"e.g. hdb_catalog for contains, ^hdb_catalog\\..* for regex"}
      />
    </Form>
  );
}

export default function Command() {
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "add">("list");

  const loadRules = () => getExclusionRules().then(setRules);

  useEffect(() => {
    loadRules().finally(() => setLoading(false));
  }, []);

  if (mode === "add") {
    return (
      <AddRuleForm
        onCancel={() => setMode("list")}
        onSaved={() => {
          loadRules();
          setMode("list");
        }}
      />
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search rules..."
      actions={
        <ActionPanel>
          <Action title="Add Exclusion Rule" onAction={() => setMode("add")} />
          <Action
            title="Explore Tables"
            onAction={() => launchCommand({ name: "explore-tables", type: LaunchType.UserInitiated })}
          />
        </ActionPanel>
      }
    >
      <List.Section
        title="Exclusion rules"
        subtitle={rules.length === 0 ? "No rules yet" : "Tables matching any rule are hidden in Explore Tables"}
      >
        {rules.map((rule) => (
          <List.Item
            key={rule.id}
            title={ruleDescription(rule)}
            subtitle={`Exclude tables ${rule.type === "regex" ? "matching regex" : rule.type === "contains" ? "containing this text" : "not containing this text"}`}
            actions={
              <ActionPanel>
                <Action
                  title="Remove Rule"
                  onAction={async () => {
                    await removeExclusionRule(rule.id);
                    loadRules();
                  }}
                />
                <Action title="Add Rule" onAction={() => setMode("add")} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Add new rule">
        <List.Item
          title="Add exclusion rule..."
          subtitle="Regex match, contains, or does not contain"
          icon="➕"
          actions={
            <ActionPanel>
              <Action title="Add Rule" onAction={() => setMode("add")} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
