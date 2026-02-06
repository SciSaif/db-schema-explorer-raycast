import { Action, ActionPanel, List, launchCommand, LaunchType } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { getConnectionString } from "./lib/credentials";
import { readSchemaCache, type SchemaCache, type TableCacheEntry } from "./lib/cache";
import { filterTables, getExclusionRules, type ExclusionRule } from "./lib/exclusion";

function tableEntries(cache: SchemaCache): { key: string; entry: TableCacheEntry }[] {
  return Object.entries(cache.tables).map(([key, entry]) => ({ key, entry }));
}

function groupBySchema(
  items: { key: string; entry: TableCacheEntry }[],
): Map<string, { key: string; entry: TableCacheEntry }[]> {
  const map = new Map<string, { key: string; entry: TableCacheEntry }[]>();
  for (const item of items) {
    const schema = item.key.includes(".") ? item.key.split(".")[0]! : "public";
    const list = map.get(schema) ?? [];
    list.push(item);
    map.set(schema, list);
  }
  return map;
}

type CredentialsState = "checking" | "missing" | "ok";

export default function Command() {
  const [credentialsState, setCredentialsState] = useState<CredentialsState>("checking");
  const [cache, setCache] = useState<SchemaCache | null>(() => readSchemaCache());
  const [exclusionRules, setExclusionRules] = useState<ExclusionRule[]>([]);
  const allItems = useMemo(() => (cache ? tableEntries(cache) : []), [cache]);
  const items = useMemo(() => filterTables(allItems, exclusionRules), [allItems, exclusionRules]);
  const bySchema = useMemo(() => groupBySchema(items), [items]);
  const sortedSchemas = useMemo(() => Array.from(bySchema.keys()).sort(), [bySchema]);

  useEffect(() => {
    getConnectionString().then((conn) => {
      setCredentialsState(conn ? "ok" : "missing");
      if (!conn) {
        launchCommand({ name: "set-credentials", type: LaunchType.UserInitiated });
      }
    });
  }, []);

  useEffect(() => {
    getExclusionRules().then(setExclusionRules);
  }, []);

  if (credentialsState === "checking" || credentialsState === "missing") {
    return (
      <List>
        <List.EmptyView
          title="Credentials required"
          description="Run “Set Credentials” to enter your PostgreSQL connection string first."
          icon="🔌"
          actions={
            <ActionPanel>
              <Action
                title="Set Credentials"
                onAction={() => launchCommand({ name: "set-credentials", type: LaunchType.UserInitiated })}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (!cache || allItems.length === 0) {
    return (
      <List>
        <List.EmptyView
          title={cache ? "No tables" : "No schema cached"}
          description={
            cache
              ? "Database has no tables or views, or all are excluded."
              : "Run “Sync Schema” to fetch your Postgres schema."
          }
          icon="📋"
          actions={
            <ActionPanel>
              <Action
                title="Exclude Tables"
                onAction={() => launchCommand({ name: "exclude-tables", type: LaunchType.UserInitiated })}
              />
              <Action
                title="Sync Schema"
                onAction={() => launchCommand({ name: "sync-schema", type: LaunchType.UserInitiated })}
              />
              <Action
                title="Set Credentials"
                onAction={() => launchCommand({ name: "set-credentials", type: LaunchType.UserInitiated })}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const refresh = () => {
    setCache(readSchemaCache());
    getExclusionRules().then(setExclusionRules);
  };

  if (items.length === 0 && allItems.length > 0) {
    return (
      <List>
        <List.EmptyView
          title="All tables excluded"
          description="Adjust exclusion rules to see tables."
          icon="🔍"
          actions={
            <ActionPanel>
              <Action
                title="Exclude Tables"
                onAction={() => launchCommand({ name: "exclude-tables", type: LaunchType.UserInitiated })}
              />
              <Action title="Refresh" onAction={refresh} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isShowingDetail
      searchBarPlaceholder="Search tables..."
      filtering={true}
      actions={
        <ActionPanel>
          <Action title="Refresh" onAction={refresh} />
          <Action
            title="Exclude Tables"
            onAction={() => {
              launchCommand({ name: "exclude-tables", type: LaunchType.UserInitiated });
            }}
          />
          <Action
            title="Sync Schema"
            onAction={() => launchCommand({ name: "sync-schema", type: LaunchType.UserInitiated })}
          />
        </ActionPanel>
      }
    >
      {sortedSchemas.map((schema) => (
        <List.Section key={schema} title={schema}>
          {(bySchema.get(schema) ?? []).map(({ key, entry }) => {
            const subtitle = entry.type === "view" ? "View" : "Table";
            const markdown = `\`\`\`sql\n${entry.ddl}\n\`\`\``;
            return (
              <List.Item
                key={key}
                title={key}
                subtitle={subtitle}
                detail={<List.Item.Detail markdown={markdown} />}
                actions={
                  <ActionPanel>
                    <Action.CopyToClipboard title="Copy DDL" content={entry.ddl} />
                    <Action title="Refresh" onAction={refresh} />
                    <Action
                      title="Exclude Tables"
                      onAction={() => launchCommand({ name: "exclude-tables", type: LaunchType.UserInitiated })}
                    />
                    <Action
                      title="Sync Schema"
                      onAction={() => launchCommand({ name: "sync-schema", type: LaunchType.UserInitiated })}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
