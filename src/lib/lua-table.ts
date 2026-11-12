// A reader for WoW SavedVariables files: `Name = value` statements whose values
// are Lua literals (strings, numbers, booleans, nil, nested tables). It never
// executes anything; input outside that subset is an error.

export type LuaValue = string | number | boolean | null | LuaTable;
export type LuaTable = { [key: string]: LuaValue };

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v", "\\": "\\", '"': '"', "'": "'", "\n": "\n" };

export class LuaParseError extends Error {}

export function parseSavedVariables(text: string): Record<string, LuaValue> {
  let i = 0;
  const n = text.length;
  const fail = (msg: string): never => {
    const line = text.slice(0, i).split("\n").length;
    throw new LuaParseError(`${msg} at line ${line}`);
  };

  const skip = () => {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text.startsWith("--", i)) {
        if (text.startsWith("--[[", i)) {
          const end = text.indexOf("]]", i + 4);
          i = end < 0 ? n : end + 2;
        } else {
          while (i < n && text[i] !== "\n") i++;
        }
        continue;
      }
      return;
    }
  };

  const ident = (): string => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i, i + 256));
    if (!m) fail("expected a name");
    i += m![0].length;
    return m![0];
  };

  const str = (): string => {
    const q = text[i++];
    let out = "";
    let start = i;
    while (i < n) {
      const c = text[i];
      if (c === q) {
        out += text.slice(start, i);
        i++;
        return out;
      }
      if (c === "\\") {
        out += text.slice(start, i);
        const e = text[i + 1];
        if (e !== undefined && ESCAPES[e] !== undefined) {
          out += ESCAPES[e];
          i += 2;
        } else if (e === "\r" && text[i + 2] === "\n") {
          out += "\n";
          i += 3;
        } else if (/[0-9]/.test(e ?? "")) {
          const m = /^[0-9]{1,3}/.exec(text.slice(i + 1, i + 4))!;
          out += String.fromCharCode(Number(m[0]));
          i += 1 + m[0].length;
        } else {
          fail("unknown escape in string");
        }
        start = i;
        continue;
      }
      if (c === "\n") fail("line break inside a string");
      i++;
    }
    return fail("unterminated string");
  };

  const num = (): number => {
    const m = /^-?(0x[0-9a-fA-F]+|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|inf|nan)/.exec(text.slice(i, i + 64));
    if (!m) fail("expected a number");
    i += m![0].length;
    const v = m![0].includes("0x") ? parseInt(m![0], 16) : Number(m![0]);
    return v;
  };

  const value = (depth: number): LuaValue => {
    if (depth > 64) fail("tables nested too deeply");
    skip();
    const c = text[i];
    if (c === "{") return table(depth + 1);
    if (c === '"' || c === "'") return str();
    if (text.startsWith("true", i) && !/\w/.test(text[i + 4] ?? "")) return (i += 4), true;
    if (text.startsWith("false", i) && !/\w/.test(text[i + 5] ?? "")) return (i += 5), false;
    if (text.startsWith("nil", i) && !/\w/.test(text[i + 3] ?? "")) return (i += 3), null;
    if (c === "-" || c === "." || /[0-9]/.test(c ?? "")) return num();
    return fail(`unexpected ${JSON.stringify(c ?? "end of file")}`);
  };

  const table = (depth: number): LuaTable => {
    i++; // {
    const t: LuaTable = {};
    let index = 1;
    for (;;) {
      skip();
      if (text[i] === "}") {
        i++;
        return t;
      }
      if (text[i] === "[") {
        i++;
        skip();
        const k = value(depth);
        skip();
        if (text[i] !== "]") fail("expected ]");
        i++;
        skip();
        if (text[i] !== "=") fail("expected =");
        i++;
        if (k === null || typeof k === "object") fail("unsupported table key");
        t[String(k)] = value(depth);
      } else if (/[A-Za-z_]/.test(text[i] ?? "") && /^[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/.test(text.slice(i, i + 256))) {
        const k = ident();
        skip();
        i++; // =
        t[k] = value(depth);
      } else {
        t[String(index++)] = value(depth);
      }
      skip();
      if (text[i] === "," || text[i] === ";") i++;
      else if (text[i] !== "}") fail("expected , or }");
    }
  };

  const out: Record<string, LuaValue> = {};
  skip();
  while (i < n) {
    const name = ident();
    skip();
    if (text[i] !== "=") fail("expected =");
    i++;
    out[name] = value(0);
    skip();
  }
  return out;
}

export const isTable = (v: LuaValue | undefined): v is LuaTable => typeof v === "object" && v !== null;
