#!/usr/bin/env node
/**
 * claude-dashboard :: notify  (Stop / Notification)
 *
 * Sends a native desktop notification when Claude finishes or needs input, so
 * a long run does not need babysitting. Falls back to a terminal bell.
 */
import { execFile } from 'node:child_process';
import { input, allow, emit } from './_hooklib.js';

const d = input();
const isStop = (d.hook_event_name || '') === 'Stop';
const title = isStop ? 'Claude Code finished' : 'Claude Code needs you';
const body = (d.message || d.last_assistant_message || d.cwd || '').toString().replace(/\s+/g, ' ').slice(0, 180) || 'Session idle';

const q = (s) => String(s).replace(/"/g, '\\"');

if (process.platform === 'darwin') {
  execFile('osascript', ['-e', `display notification "${q(body)}" with title "${q(title)}" sound name "Ping"`], () => {});
} else if (process.platform === 'linux') {
  execFile('notify-send', ['-a', 'Claude Code', title, body], () => { process.stdout.write('\x07'); });
} else if (process.platform === 'win32') {
  const ps = `[reflection.assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null;` +
    `$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;` +
    `$n.BalloonTipTitle="${q(title)}";$n.BalloonTipText="${q(body)}";$n.Visible=$true;$n.ShowBalloonTip(5000)`;
  execFile('powershell', ['-NoProfile', '-Command', ps], () => {});
} else {
  process.stdout.write('\x07');
}

emit({ kind: 'notify', session: d.session_id, event: d.hook_event_name, body });
allow();
