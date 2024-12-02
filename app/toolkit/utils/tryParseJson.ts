export const tryParseJson = <T = any>(json: string) => {
  if (!json) return null;

  try {
    return JSON.parse(json) as T;
  } catch (err) {
    return null;
  }
};
