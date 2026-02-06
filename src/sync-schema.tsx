import {
  Action,
  ActionPanel,
  List,
  showToast,
  Toast,
  launchCommand,
  LaunchType,
  openExtensionPreferences,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { Client } from "pg";
import { getConnectionString } from "./lib/credentials";
import { parseConnectionConfig } from "./lib/pg-config";
import { fetchSchemaData } from "./lib/pg-schema";
import { buildSchemaDdl } from "./lib/ddl-builder";
import { writeSchemaCache, type SchemaCache, type TableCacheEntry } from "./lib/cache";

type SyncState = "checking" | "no-credentials" | "loading" | "success" | "error";

export default function Command() {
  const [state, setState] = useState<SyncState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tableCount, setTableCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const conn = await getConnectionString();
      if (cancelled) return;
      if (!conn) {
        setState("no-credentials");
        launchCommand({ name: "set-credentials", type: LaunchType.UserInitiated });
        return;
      }

      setState("loading");

      (async () => {
        const client = new Client(parseConnectionConfig(conn));
        try {
          await client.connect();
          if (cancelled) return;
          const data = await fetchSchemaData(client);
          if (cancelled) return;
          const { tableDdls, tableTypes } = buildSchemaDdl(data);
          const tables: Record<string, TableCacheEntry> = {};
          for (const [key, ddl] of tableDdls) {
            const [schema] = key.split(".");
            tables[key] = {
              ddl,
              schema: schema ?? undefined,
              type: tableTypes.get(key) ?? "table",
            };
          }
          const cache: SchemaCache = { tables };
          writeSchemaCache(cache);
          if (cancelled) return;
          setTableCount(Object.keys(tables).length);
          setState("success");
          await showToast({
            style: Toast.Style.Success,
            title: "Schema synced",
            message: `${Object.keys(tables).length} tables cached`,
          });
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(msg);
          setState("error");
          await showToast({
            style: Toast.Style.Failure,
            title: "Sync failed",
            message: msg,
          });
        } finally {
          try {
            await client.end();
          } catch {
            // ignore
          }
        }
      })();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking" || state === "no-credentials") {
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

  if (state === "loading") {
    return (
      <List isLoading={true}>
        <List.EmptyView title="Syncing schema…" description="Fetching tables and views from Postgres" />
      </List>
    );
  }

  if (state === "error") {
    return (
      <List>
        <List.EmptyView
          title="Sync failed"
          description={errorMessage ?? "Unknown error"}
          icon="⚠️"
          actions={
            <ActionPanel>
              <Action
                title="Set Credentials"
                onAction={() => launchCommand({ name: "set-credentials", type: LaunchType.UserInitiated })}
              />
              <Action title="Open Extension Preferences" onAction={() => openExtensionPreferences()} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List>
      <List.Item
        title="Schema synced"
        subtitle={`${tableCount} tables cached`}
        icon="✅"
        actions={
          <ActionPanel>
            <Action
              title="Explore Tables"
              onAction={() => launchCommand({ name: "explore-tables", type: LaunchType.UserInitiated })}
            />
            <Action
              title="Exclude Tables"
              onAction={() => launchCommand({ name: "exclude-tables", type: LaunchType.UserInitiated })}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}
