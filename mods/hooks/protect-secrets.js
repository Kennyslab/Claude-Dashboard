#!/usr/bin/env node
/**
 * claude-dashboard :: protect-secrets  (PreToolUse, matcher "Read|Edit|Write|Grep|Glob")
 *
 * Keeps credential material out of the transcript. Blocks reads of well-known
 * secret files and writes that would commit them.
 */
import path from 'node:path';
import { input, block, allow, emit } from './_hooklib.js';

const SECRET = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.npmrc$/i, /(^|\/)\.pypirc$/i, /(^|\/)\.netrc$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/i,
  /(^|\/)\.ssh\//i, /(^|\/)\.gnupg\//i, /(^|\/)\.aws\/credentials$/i,
  /(^|\/)\.config\/gh\/hosts\.yml$/i,
  /(^|\/)credentials?\.(json|yml|yaml)$/i,
  /(^|\/)(secrets?|service-account)[-.\w]*\.(json|yml|yaml|pem|key|p12|pfx)$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)\.claude\/\.credentials\.json$/i,
];

const ALLOW_SUFFIX = [/\.env\.example$/i, /\.env\.sample$/i, /\.env\.template$/i];

const d = input();
const target = d.tool_input?.file_path || d.tool_input?.path || d.tool_input?.notebook_path || '';
if (!target) allow();

const p = String(target).replace(/\\/g, '/');
if (ALLOW_SUFFIX.some((r) => r.test(p))) allow();

if (SECRET.some((r) => r.test(p))) {
  emit({ kind: 'guard.secret', session: d.session_id, tool: d.tool_name, path: p });
  block(
    `[claude-dashboard protect-secrets] "${path.basename(p)}" looks like credential material and was not opened.\n` +
    `Ask the user for the specific value you need, or point at a committed example file instead.`
  );
}
allow();
