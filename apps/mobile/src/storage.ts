import * as SecureStore from "expo-secure-store";

export async function getSecureString(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setSecureString(key: string, value: string | null) {
  try {
    if (value === null) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Ignore storage failures; the app can still operate in-memory.
  }
}

export async function getSecureJson<T>(key: string) {
  const value = await getSecureString(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setSecureJson(key: string, value: unknown) {
  await setSecureString(key, JSON.stringify(value));
}

export async function removeSecureItem(key: string) {
  await setSecureString(key, null);
}
