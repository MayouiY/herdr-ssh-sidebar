// Which terminals are SSH sessions, and where they go. No host calls here: pure functions.
// bin/herdr-ssh implements the same rules in Python; change both together.

// Always recognised. More names come from <app home>/ssh-terminals.json ("commands").
export const BUILTIN = ["ssh", "autossh"];

// ssh options that take a value (ssh(1)); autossh adds -M.
const VALUE_OPTS = "BbcDEeFIiJLlMmOoPpQRSWw";

// Programs that run a script named by their first argument.
const INTERPRETER = /^(python[\d.]*|node|ruby|perl|php|lua|deno|bun|bash|sh|zsh|dash|ksh|fish|pwsh|powershell)$/;

/** The last path part, lower-cased, without ".exe". */
export function baseName(s) {
  const last = String(s ?? "").split(/[\\/]/).pop().toLowerCase();
  return last.endsWith(".exe") ? last.slice(0, -4) : last;
}

/** Splits "user@host:port" (or ssh://user@host:port) apart. */
function splitDest(dest) {
  let d = dest.replace(/^ssh:\/\//, "").replace(/\/$/, "");
  let user = null, port = null;
  const at = d.lastIndexOf("@");
  if (at >= 0) { user = d.slice(0, at); d = d.slice(at + 1); }
  const m = /^(.*):(\d+)$/.exec(d);
  if (m && !m[1].includes(":")) { d = m[1]; port = m[2]; }
  return { user, host: d, port };
}

/** Reads an ssh command line: where it connects and as whom. */
export function parseSsh(args) {
  let user = null, port = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--") { i++; return i < args.length ? withFlags(splitDest(args[i]), user, port) : null; }
    if (a.startsWith("-") && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (!VALUE_OPTS.includes(c)) continue;
        const value = j + 1 < a.length ? a.slice(j + 1) : args[++i];
        if (c === "l") user = value ?? user;
        if (c === "p") port = value ?? port;
        break;
      }
      continue;
    }
    return withFlags(splitDest(a), user, port);
  }
  return null;
}

function withFlags(dest, user, port) {
  return { user: dest.user ?? user, host: dest.host, port: dest.port ?? port };
}

/** What a remote shell usually puts in the title: "user@host: ~". */
export function parseTitle(title) {
  const m = /^\s*([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+)/.exec(String(title ?? ""));
  return m ? { user: m[1], host: m[2] } : null;
}

const shortHost = (h) => String(h ?? "").split(".")[0].toLowerCase();

/** "vps/t2" → "vps"; "t2" → "" (this computer). */
export const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : "");

/**
 * The SSH session a terminal is showing, or null.
 * @param {any} t a terminal, as terminals() or `hc get --json` gives it
 * @param {Set<string>} names command names that count (lower-case)
 * @param {Record<string, string>} hostnames each machine's own hostname ("" for this computer)
 */
export function sshSession(t, names, hostnames = {}) {
  const fg = t?.foreground;
  if (t?.state !== "live" || !fg) return null;
  const argv = fg.argv ?? [];
  // The program itself, or the script an interpreter runs (python /usr/bin/mytool …).
  const interpreted = INTERPRETER.test(baseName(fg.name)) || INTERPRETER.test(baseName(argv[0]));
  const found = [[baseName(fg.name), 1], [baseName(argv[0]), 1], [interpreted && !argv[1]?.startsWith("-") ? baseName(argv[1]) : "", 2]]
    .find(([name]) => name && names.has(name));
  if (!found) return null;
  const [tool, skip] = found;
  const args = argv.slice(skip);
  const dest = BUILTIN.includes(tool) ? parseSsh(args) : null;
  const machine = machineOf(t.address);
  // Before the far side sets a title it still shows this machine's own prompt.
  const titled = parseTitle(t.title);
  const remote = titled && shortHost(titled.host) !== shortHost(hostnames[machine]) ? titled : null;
  const target = dest ? dest.host : args.join(" ");
  return {
    address: t.address,
    machine: machine || null,
    tool,
    host: remote?.host ?? target ?? "",
    user: remote?.user ?? dest?.user ?? null,
    target,
    port: dest?.port ?? null,
    command: [tool, ...args].join(" "),
    title: t.title ?? "",
    where: t.labels?.where ?? null,
    created_ms: t.created_ms ?? 0,
  };
}

/** Every SSH session among `list`. */
export function sshSessions(list, extra = [], hostnames = {}) {
  const names = new Set([...BUILTIN, ...extra.map((n) => baseName(n))]);
  return list.map((t) => sshSession(t, names, hostnames)).filter(Boolean);
}

/** The "tag" of ssh-terminals.json: where a row's tool tag goes, "beside" the host (default) or "below" it. */
export function tagOf(text) {
  try {
    return JSON.parse(text ?? "{}")?.tag === "below" ? "below" : "beside";
  } catch {
    return "beside";
  }
}

/** The "commands" of ssh-terminals.json; anything else in it is ignored. */
export function commandsOf(text) {
  try {
    const list = JSON.parse(text ?? "{}")?.commands;
    return Array.isArray(list) ? list.filter((n) => typeof n === "string" && n.trim()) : [];
  } catch {
    return [];
  }
}
