#!/usr/bin/env bash
# Installs the SSH sidebar mod and the herdr-ssh command into Herdr.app.
# Usage: ./install.sh [install|uninstall|status] [options]   (see --help)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOD="ssh-sidebar"
MARK="herdr-ssh-sidebar"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
BIN_DIR="$HOME/.local/bin"
LAYOUT=""
EDIT_LAYOUT=1
CMD="install"

usage() {
  cat <<USAGE
Usage: ./install.sh [install|uninstall|status] [options]

  install     copy the mod and the herdr-ssh command, add the SSH list to your layouts' sidebars (default)
  uninstall   remove them again (your ssh-terminals.json is kept)
  status      show what is installed

Options:
  --app-home DIR   Herdr.app's folder (default: \$HERDR_APP_HOME, else ~/.config/herdr-app)
  --bin-dir DIR    where herdr-ssh goes (default: ~/.local/bin)
  --layout NAME    only this layout (default: every layout that has an agents list)
  --no-layout      don't touch any layout; place the mod yourself
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    install|uninstall|status) CMD="$1" ;;
    --app-home) APP_HOME="$2"; shift ;;
    --bin-dir) BIN_DIR="$2"; shift ;;
    --layout) LAYOUT="$2"; shift ;;
    --no-layout) EDIT_LAYOUT=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

ok()   { printf '✓ %s\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || die "python3 is needed (herdr-ssh is a Python script)"
[ -d "$APP_HOME" ] || die "Herdr.app's folder not found at $APP_HOME (start Herdr.app once, or pass --app-home)"

MOD_DIR="$APP_HOME/mods/$MOD"
BIN="$BIN_DIR/herdr-ssh"
CONFIG="$APP_HOME/ssh-terminals.json"

ours() { [ -f "$1" ] && grep -q "$MARK" "$1"; }

# The layouts to work on: the one named with --layout, else every layout.
layout_names() {
  if [ -n "$LAYOUT" ]; then printf '%s\n' "$LAYOUT"; return; fi
  local f
  for f in "$APP_HOME"/layouts/*.json; do [ -f "$f" ] && basename "$f" .json; done
  return 0
}

# layout.py <add|remove|has> <app home> <layout name>: edits layouts/<name>.json in place.
layout_py() {
  python3 - "$@" <<'PY'
import json, os, sys
action, home, name = sys.argv[1:4]
MOD = "ssh-sidebar"
path = os.path.join(home, "layouts", name + ".json")
try:
    with open(path, encoding="utf-8") as f:
        root = json.load(f)
except OSError:
    sys.exit(f"no such layout: {path}")
except ValueError as e:
    sys.exit(f"invalid JSON in {path}: {e}")

def is_ours(n):
    return isinstance(n, dict) and (n.get("content") or {}).get("mod") == MOD

def walk(n):
    yield n
    for c in n.get("children") or []:
        if isinstance(c, dict):
            yield from walk(c)

has = any(is_ours(n) for n in walk(root))
if action == "has":
    sys.exit(0 if has else 1)

try:
    with open(os.path.join(home, "installed.json"), encoding="utf-8") as f:
        shipped = ("layout:" + name) in json.load(f)
except (OSError, ValueError):
    shipped = False

if action == "add":
    if has:
        print("present"); sys.exit(0)
    for n in walk(root):
        kids = n.get("children") or []
        at = next((i for i, c in enumerate(kids) if isinstance(c, dict) and c.get("id") == "agents"), None)
        if at is None or n.get("type") != "column":
            continue
        if shipped:
            print("shipped"); sys.exit(0)
        ids = {m.get("id") for m in walk(root)}
        node_id = "ssh" if "ssh" not in ids else "ssh-sidebar"
        kids.insert(at, {"id": node_id, "type": "block", "content": {"mod": MOD},
                         "size": {"weight": 0.5}, "min": 70})
        break
    else:
        print("nowhere"); sys.exit(0)
elif action == "remove":
    if not has or shipped:
        print("absent"); sys.exit(0)
    for n in walk(root):
        if n.get("children"):
            n["children"] = [c for c in n["children"] if not is_ours(c)]

tmp = path + ".tmp-ssh-sidebar"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(root, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, path)
print("changed")
PY
}

manual_hint() {
  cat >&2 <<HINT
  Add this block to a column of your layout (layouts/<name>.json), e.g. above the agents list:
    { "id": "ssh", "type": "block", "content": { "mod": "$MOD" }, "size": { "weight": 0.5 }, "min": 70 }
HINT
}

do_install() {
  if [ -e "$MOD_DIR" ] && ! ours "$MOD_DIR/main.js"; then
    die "$MOD_DIR exists and was not written by this installer; move it away or remove it yourself"
  fi
  if [ -e "$BIN" ] && ! ours "$BIN"; then
    die "$BIN exists and was not written by this installer; pass --bin-dir or remove it yourself"
  fi
  mkdir -p "$MOD_DIR" "$BIN_DIR"
  cp "$HERE/mods/$MOD/"*.js "$HERE/mods/$MOD/"*.json "$HERE/mods/$MOD/"*.svg "$MOD_DIR/"
  ok "mod -> $MOD_DIR"
  cp "$HERE/bin/herdr-ssh" "$BIN" && chmod +x "$BIN"
  ok "command -> $BIN"
  case ":$PATH:" in *":$BIN_DIR:"*) ;; *) warn "$BIN_DIR is not on your PATH; agents will need the full path" ;; esac

  if [ ! -e "$CONFIG" ]; then
    printf '{\n  "commands": []\n}\n' > "$CONFIG"
    ok "config -> $CONFIG (add your own ssh wrapper commands to \"commands\")"
  else
    ok "config kept: $CONFIG"
  fi

  if command -v herdr-app >/dev/null; then
    HERDR_APP_HOME="$APP_HOME" herdr-app check "$MOD_DIR" >/dev/null && ok "herdr-app check passed" || warn "herdr-app check failed: run 'herdr-app check $MOD_DIR'"
  fi

  if [ "$EDIT_LAYOUT" = 1 ]; then
    local name result backup kept shipped=""
    for name in $(layout_names); do
      backup="$APP_HOME/layouts/$name.json.before-$MOD"; kept=0
      if [ ! -e "$backup" ]; then cp "$APP_HOME/layouts/$name.json" "$backup"; kept=1; fi
      result="$(layout_py add "$APP_HOME" "$name" || echo failed)"
      if [ "$result" != changed ] && [ "$kept" = 1 ]; then rm -f "$backup"; fi
      case "$result" in
        changed) ok "layout '$name': added the SSH list to its sidebar (backup: layouts/$name.json.before-$MOD)" ;;
        present) ok "layout '$name': already shows the SSH list" ;;
        shipped) shipped="$shipped $name" ;;
        nowhere) [ -n "$LAYOUT" ] && { warn "layout '$name' has no agents list to put the SSH list next to."; manual_hint; } ;;
        *) warn "layout '$name': could not be read, left alone" ;;
      esac
    done
    if [ -n "$shipped" ]; then
      warn "Herdr's own layouts are replaced on every start, so they were not changed:$shipped"
      warn "To get the sidebar list there, make a copy you own and run this again, e.g.:"
      printf "    herdr-app do layout.clone '{\"name\":\"main\",\"as\":\"my-main\"}'\n" >&2
    fi
  else
    warn "layouts untouched (--no-layout)."; manual_hint
  fi
}

do_uninstall() {
  local f name
  for f in "$APP_HOME"/layouts/*.json; do
    [ -f "$f" ] || continue
    name="$(basename "$f" .json)"
    [ "$(layout_py remove "$APP_HOME" "$name" 2>/dev/null || true)" = changed ] && ok "removed the SSH list from layout '$name'"
  done
  if [ -e "$MOD_DIR" ]; then
    ours "$MOD_DIR/main.js" || die "$MOD_DIR was not written by this installer; left alone"
    rm -r "$MOD_DIR" && ok "removed $MOD_DIR"
  fi
  if [ -e "$BIN" ]; then
    ours "$BIN" || die "$BIN was not written by this installer; left alone"
    rm "$BIN" && ok "removed $BIN"
  fi
  [ -e "$CONFIG" ] && ok "kept $CONFIG (delete it yourself if you no longer want it)"
  return 0
}

do_status() {
  local name
  if ours "$MOD_DIR/main.js"; then
    if cmp -s "$HERE/mods/$MOD/main.js" "$MOD_DIR/main.js" && cmp -s "$HERE/mods/$MOD/match.js" "$MOD_DIR/match.js"; then echo "mod: current"; else echo "mod: installed, differs from this checkout"; fi
  else echo "mod: not installed"; fi
  if ours "$BIN"; then
    if cmp -s "$HERE/bin/herdr-ssh" "$BIN"; then echo "command: current ($BIN)"; else echo "command: installed, differs from this checkout"; fi
  else echo "command: not installed"; fi
  if [ -e "$CONFIG" ]; then echo "config: $CONFIG"; else echo "config: none (ssh only)"; fi
  for name in $(layout_names); do
    if layout_py has "$APP_HOME" "$name" 2>/dev/null; then echo "layout '$name': SSH list in the sidebar"; else echo "layout '$name': no SSH list"; fi
  done
}

case "$CMD" in
  install) do_install ;;
  uninstall) do_uninstall ;;
  status) do_status ;;
esac
