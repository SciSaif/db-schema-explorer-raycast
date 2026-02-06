import { LocalStorage } from "@raycast/api";
import { getPreferenceValues } from "@raycast/api";

const STORAGE_KEY = "connectionString";

type Preferences = {
  connectionString?: string;
};

/**
 * Returns the PostgreSQL connection string from LocalStorage (set via Set Credentials command)
 * or from extension preferences. Returns null/empty if not set.
 */
export async function getConnectionString(): Promise<string> {
  const fromStorage = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (fromStorage && String(fromStorage).trim()) {
    return String(fromStorage).trim();
  }
  const prefs = getPreferenceValues<Preferences>();
  const fromPrefs = prefs.connectionString?.trim();
  return fromPrefs ?? "";
}

export async function setConnectionString(value: string): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, value.trim());
}

export async function clearConnectionString(): Promise<void> {
  await LocalStorage.removeItem(STORAGE_KEY);
}
