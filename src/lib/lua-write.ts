// Writes plain data as a Lua literal for the addon's data file. Strings are
// escaped so nothing in them can end the string or the file early.

export type LuaOut = string | number | boolean | null | undefined | LuaOut[] | { [k: string]: LuaOut };

function str(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (c < 32 || c === 127) out += `\\${c.toString().padStart(3, "0")}`;
    else out += ch; // UTF-8 passes through; WoW strings are UTF-8
  }
  return out + '"';
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set("and break do else elseif end false for function goto if in local nil not or repeat return then true until while".split(" "));

function key(k: string): string {
  if (/^-?\d+$/.test(k)) return `[${k}]`;
  if (IDENT.test(k) && !RESERVED.has(k)) return k;
  return `[${str(k)}]`;
}

function num(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

export function toLua(v: LuaOut, indent = ""): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "string") return str(v);
  if (typeof v === "number") return num(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  const inner = indent + " ";
  if (Array.isArray(v)) {
    if (!v.length) return "{}";
    const flat = v.every((x) => typeof x !== "object" || x === null);
    if (flat) return `{${v.map((x) => toLua(x)).join(",")}}`;
    return `{\n${v.map((x) => inner + toLua(x, inner)).join(",\n")},\n${indent}}`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined && x !== null);
  if (!entries.length) return "{}";
  const flat = entries.every(([, x]) => typeof x !== "object");
  if (flat) return `{${entries.map(([k, x]) => `${key(k)}=${toLua(x)}`).join(",")}}`;
  return `{\n${entries.map(([k, x]) => `${inner}${key(k)}=${toLua(x, inner)}`).join(",\n")},\n${indent}}`;
}

export function luaAssign(name: string, v: LuaOut): string {
  if (!IDENT.test(name)) throw new Error("bad global name");
  return `${name} = ${toLua(v)}\n`;
}
