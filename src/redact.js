// URLs (RPC endpoints can carry API keys) are cut to scheme://host before anything is printed.
export const redact = (s) => String(s).replace(/https?:\/\/[^\s"')]+/g, (u) => { try { return new URL(u).origin; } catch { return "[url]"; } });
