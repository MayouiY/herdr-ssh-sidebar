// herdr-ssh-sidebar
// Every SSH session open in a terminal, in one list, whatever space it is in.
// Click a row to go to its terminal; right-click to copy its address or a note for an agent.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { terminals, panes, focused, theme, run, hc, exec, readTextFile, appHome, openOverlay, closeOverlay, props, notify } from "herdr";
import { sshSessions, commandsOf } from "./match.js";

const MOD = "ssh-sidebar";
const CONFIG = "ssh-terminals.json";
const LINES = 200;
const MENU = { width: 248, height: 76 };

const readCommand = (s) => `hc read ${s.address} --lines ${LINES}`;
const agentNote = (s) =>
  `My SSH session on ${s.host} is Herdr terminal ${s.address}. Read its output with \`${readCommand(s)}\`. Read only: do not type into it.`;

export default class SshSidebar extends View {
  init(_props, cx) {
    if (props()?.menu) return;
    this.extra = [];
    this.hostnames = {};
    // When each session last had the keyboard, so the list keeps recent ones on top.
    this.used = JSON.parse(localStorage.getItem("used") ?? "{}");
    this.loadConfig(cx);
    this.loadHostnames(cx);
    cx.timer.every(10000, (cx) => this.loadConfig(cx));
    cx.timer.every(120000, (cx) => this.loadHostnames(cx));
  }

  // The person's own command names (an internal ssh wrapper, say). Absent file: ssh only.
  loadConfig(cx) {
    cx.spawn(async (cx) => {
      let text = null;
      try { text = await readTextFile(`${appHome()}/${CONFIG}`); } catch { /* unreadable: as absent */ }
      const extra = commandsOf(text);
      if (JSON.stringify(extra) === JSON.stringify(this.extra)) return;
      this.extra = extra;
      cx.notify();
    });
  }

  // Each machine's own hostname: a title still showing it means the far side set none yet.
  loadHostnames(cx) {
    cx.spawn(async (cx) => {
      const names = {};
      try { names[""] = (await exec("hostname")).stdout.trim(); } catch { /* keep going */ }
      try {
        for (const m of JSON.parse((await hc(["machine", "ls", "--json"])).stdout).machines ?? []) if (m.name && m.host) names[m.name] = m.host;
      } catch { /* no other machines */ }
      if (JSON.stringify(names) === JSON.stringify(this.hostnames)) return;
      this.hostnames = names;
      cx.notify();
    });
  }

  sessions() {
    const list = sshSessions(terminals(), this.extra, this.hostnames);
    const now = focused()?.terminal ?? null;
    if (now !== this.last) {
      this.last = now;
      if (list.some((s) => s.address === now)) this.used[now] = Date.now();
      const live = new Set(list.map((s) => s.address));
      for (const k of Object.keys(this.used)) if (!live.has(k)) delete this.used[k];
      localStorage.setItem("used", JSON.stringify(this.used));
    }
    const at = (s) => this.used[s.address] ?? s.created_ms;
    return { list: list.sort((a, b) => at(b) - at(a)), now };
  }

  go(s) {
    const ps = panes(), p = ps.find((q) => q.terminal === s.address);
    // A terminal with no pane of its own (started with `hc run`) can only be peeked at.
    if (!p) return run("terminal.peek", { terminal: s.address });
    // A tab shows its zoomed pane whichever is focused: unzoom first, or the keyboard goes somewhere unseen.
    if (!p.zoomed && ps.some((q) => q.tab === p.tab && q.zoomed)) run("pane.zoom", { pane: p.pane });
    run("pane.focus", { pane: p.pane });
  }

  menu(t) {
    const s = props().session;
    const item = (id, label, text) => h_flex()
      .id(id).h(28).px(8).rounded(4).items_center().text_color(t.foreground)
      .hover((st) => st.bg(t.selected))
      .role("button").accessibility_label(label)
      .on_click((_e, cx) => {
        cx.write_to_clipboard(text);
        closeOverlay(props().overlay);
        notify({ title: "Copied", body: text, timeout: 2500 });
      })
      .child(label);
    return v_flex().id("ssh-menu").w_full().p(4).bg(t.popover).text_size(14)
      .child(item("copy-address", "Copy terminal address", s.address))
      .child(item("copy-note", "Copy note for an agent", agentNote(s)));
  }

  row(t, s, on) {
    const where = [s.user, s.machine, s.where].filter(Boolean).join(" · ");
    return h_flex()
      .id(`ssh-${s.address}`)
      .px(10).py(5).gap(8).rounded(6).items_center()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((st) => st.bg(t.hover)))
      .role("button").accessibility_label(`SSH ${s.host}`)
      .on_click(() => this.go(s))
      .on_mouse_down("right", () => openOverlay({
        mod: MOD, kind: "popup", at: "pointer", ...MENU,
        props: { menu: true, session: { address: s.address, host: s.host } },
      }))
      .child(div().size(6).mx(3).flex_none().rounded_full().bg(t.working ?? t.accent))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_color(t.foreground).child(s.host || s.command))
        .when(Boolean(where), (el) => el.child(div().truncate().text_size(12).text_color(t.dim).child(where))))
      .child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(11).text_color(t.muted).child(s.tool));
  }

  render() {
    const t = theme();
    if (props()?.menu) return this.menu(t);
    const { list, now } = this.sessions();
    return v_flex()
      .id("ssh-sidebar-root")
      .size_full().min_h(0)
      .bg(t.chrome).border_t(1).border_color(t.border)
      .text_size(14)
      .child(h_flex()
        .id("ssh-heading").pl(18).pr(14).h(31).flex_none().items_center().justify_between()
        .child(h_flex().gap(6).items_center()
          .child(svg(`mods/${MOD}/server.svg`).size(13).flex_none().text_color(t.muted))
          .child(div().text_size(12).font_medium().text_color(t.muted).child("SSH")))
        .when(list.length > 0, (el) => el.child(div().text_size(12).text_color(t.dim).child(String(list.length)))))
      .when(list.length === 0, (el) => el.child(
        div().px(16).py(16).text_center().text_size(12).line_height("16px").text_color(t.dim)
          .child("No SSH sessions. A terminal running ssh shows up here.")))
      .child(v_flex().id("ssh-list").flex_1().min_h(0).px(8).pb(8).gap(2).overflow_y_scroll()
        .children(list.map((s) => this.row(t, s, s.address === now))));
  }
}
