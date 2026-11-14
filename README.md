# herdr-ssh-sidebar

Every SSH session you have open in [Herdr.app](https://herdr.dev), in one sidebar list, whatever space it lives in. It comes with a small command, `herdr-ssh`, so coding agents can find the right terminal without reading every pane.

## What you get

**A sidebar list.** One row per terminal whose foreground program is `ssh` (or a wrapper you name). Each row shows the remote host, the login user, and the space and tab the terminal is in. Sessions on other machines connected to Herdr are listed too, with the machine's name. Rows disappear when the SSH session ends; the most recently used session is on top.

- Click a row to go to that terminal.
- Right-click a row to copy its terminal address, or a ready-made note telling an agent how to read it.

**A command for agents.** `herdr-ssh` prints the same list, and can read one session's output:

```bash
herdr-ssh                       # every SSH session (JSON when piped)
herdr-ssh web01                 # only those matching "web01"
herdr-ssh --focused             # the one on screen now
herdr-ssh read web01            # print that terminal's screen and history
herdr-ssh read --focused --lines 500
```

It is read-only: it never types into a terminal.

## Install

Requires macOS or Linux, Herdr.app (started at least once) and `python3`.

```bash
git clone https://github.com/MayouiY/herdr-ssh-sidebar.git
cd herdr-ssh-sidebar
./install.sh
```

The installer copies the mod to `<Herdr home>/mods/ssh-sidebar`, puts `herdr-ssh` in `~/.local/bin`, and adds the list above the agents list in every layout of yours that has one (a backup of each changed layout file is kept beside it).

### Which layouts it works in

- **Layouts you own, in the sidebar.** A layout you made or cloned gets the list as a sidebar block, placed above its agents list.
- **Herdr's own layouts (Herdr, Terminals, Herdr 98)** are replaced on every start, so nothing can be added to them, on either side of the window. Make a copy you own and run `./install.sh` again:

  ```bash
  herdr-app do layout.clone '{"name":"main","as":"my-main"}'
  ```

- **Anywhere else by hand.** The mod is an ordinary block: put `{ "type": "block", "content": { "mod": "ssh-sidebar" } }` in any column of a layout. It uses the theme's colors, so it follows whatever look the layout has.

| Command | What it does |
|---|---|
| `./install.sh` | install or upgrade (safe to repeat) |
| `./install.sh status` | show what is installed |
| `./install.sh uninstall` | remove the mod, the command and the layout block; your config is kept |

Options: `--app-home DIR`, `--bin-dir DIR`, `--layout NAME` (only that layout), `--no-layout` (touch none).

## Your own SSH wrappers

Only `ssh` and `autossh` are recognised out of the box. If you connect through another command (a jump-host helper, a company wrapper), add its name to `<Herdr home>/ssh-terminals.json`, usually `~/.config/herdr-app/ssh-terminals.json`:

```json
{
  "commands": ["mytool"]
}
```

A terminal counts when that name is the program in the foreground, or the script an interpreter is running (`python /usr/local/bin/mytool ...`). The sidebar picks up changes within a few seconds; `herdr-ssh` reads the file on every run. The file lives outside this repository, so your tool names stay on your machine.

For wrappers, the host shown is taken from the terminal title once the remote shell sets one (`user@host: ~`); until then the wrapper's arguments are shown.

## Telling your agents

Add something like this to your agent's standing instructions (`AGENTS.md`, `CLAUDE.md`, ...):

```markdown
To look at a server I am logged in to, run `herdr-ssh` to list my open SSH
sessions, then `herdr-ssh read <host>` (or `herdr-ssh read --focused` for the
one I am looking at). Never type into those terminals.
```

## Building it yourself

[RECIPE.md](RECIPE.md) is the brief for the mod on its own: what it shows, how it behaves and what it is built from, enough for an agent to rebuild `mods/ssh-sidebar/` from an empty folder. To add only the mod, copy `mods/ssh-sidebar/` into `<Herdr home>/mods/` and place its block in a layout you own.

## How it works

- The mod (`mods/ssh-sidebar/`) reads Herdr's live terminal list, which includes each terminal's foreground command line. `match.js` decides which ones are SSH sessions and where they go.
- `bin/herdr-ssh` applies the same rules in Python to `hc get --json`, and asks `herdr-app status` which pane has the keyboard. Keep the two in step when changing the rules.

## Limits

- A session is listed only while `ssh` is the foreground program of its terminal. SSH started inside tmux or screen is not seen.
- `herdr-ssh --focused` needs the Herdr window to be running.
- The installer and `herdr-ssh` are not tested on Windows; sessions in terminals on a Windows machine connected to Herdr are listed.
