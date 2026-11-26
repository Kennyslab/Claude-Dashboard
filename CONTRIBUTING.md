# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

```bash
git clone https://github.com/Kennyslab/Claude-Dashboard.git
cd Claude-Dashboard
npm test                       # 17 tests, no network, no install step
node bin/claude-dashboard.js demo --home /tmp/claude-demo
node bin/claude-dashboard.js --home /tmp/claude-demo --port 7878
```

Always develop against a demo home. Never point a work-in-progress mod installer at your real
`~/.claude`.

## House rules

**No runtime dependencies.** This is the one hard rule. The server is Node's standard library and
the frontend is ES modules served from disk. A pull request that adds a package to `dependencies`
will be asked to remove it, however convenient the package is. Dev tooling is negotiable; shipped
dependencies are not.

**No build step.** What is in the repository is what runs.

**Comments explain why.** The code mostly says what it does. A comment earns its place by recording a
decision — why polling instead of `fs.watch`, why requests are de-duplicated by id.

**Honest numbers.** Anything that could be read as a dollar figure has to be derived from real data
and labelled as an estimate. No invented defaults standing in for missing data.

## Style

- ES modules, `const` by default, two-space indent, semicolons.
- Prefer a plain function to a class.
- Fail soft on anything read from disk; a malformed file should never take a page down.
- In the interface, build DOM with the `el()` helper rather than `innerHTML`.
- Colour means something: blue is volume, sand is money, teal is cache, coral is an error. Keep it
  consistent, and never make colour the only carrier of information.

## Tests

Add one for anything with arithmetic in it, anything that parses a file, and anything that writes to
disk. The suite runs against a temporary Claude home built by `src/lib/demo.js`.

```bash
npm test
node --test test/dashboard.test.js --test-name-pattern="mod installs"
```

## Adding a mod

See [docs/MODS.md](docs/MODS.md#writing-your-own-mod). Requirements:

- Declarative manifest in `mods/registry.json` — no imperative install scripts.
- Fully reversible: uninstall must leave `settings.json` as it was.
- Fails open: if the hook cannot do its job, the tool call still goes through.
- Fast: a `PreToolUse` hook runs before every matching call.
- An honest `risk` level. `medium` or above for anything that writes to the user's files.

## Pull requests

1. Branch from `main`.
2. Keep the change focused — one concern per PR.
3. `npm test` passes.
4. If you changed behaviour, update the matching page in `docs/`.
5. If you changed the interface, include a before-and-after screenshot.

Describe what problem the change solves, not just what it does.

## Reporting a bug

Include `claude-dashboard --version`, the output of `claude-dashboard doctor`, your OS and Node
version, and for rendering problems the browser console. Redact anything sensitive from transcript
excerpts.

## Security

Please do not open a public issue for a security problem. Use GitHub's private vulnerability
reporting on this repository instead.
