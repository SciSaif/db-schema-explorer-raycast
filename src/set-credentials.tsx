import { Action, ActionPanel, Form, launchCommand, LaunchType, showToast, Toast } from "@raycast/api";
import { setConnectionString } from "./lib/credentials";

export default function Command() {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Connection String"
            onSubmit={async (values: { connectionString: string }) => {
              const conn = values.connectionString?.trim();
              if (!conn) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Connection string required",
                });
                return;
              }
              await setConnectionString(conn);
              await showToast({
                style: Toast.Style.Success,
                title: "Credentials saved",
                message: "Run Sync Schema, then Explore Tables.",
              });
            }}
          />
          <Action
            title="Sync Schema"
            onAction={() => launchCommand({ name: "sync-schema", type: LaunchType.UserInitiated })}
          />
          <Action
            title="Explore Tables"
            onAction={() => launchCommand({ name: "explore-tables", type: LaunchType.UserInitiated })}
          />
        </ActionPanel>
      }
    >
      <Form.PasswordField
        id="connectionString"
        title="Connection String"
        placeholder="postgresql://user:password@host:5432/database"
        info="PostgreSQL connection URL. Stored locally in this extension."
      />
    </Form>
  );
}
