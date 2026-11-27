/**
 * One-click local test (Windows / macOS / Linux).
 *
 * Creates a throwaway PostgreSQL cluster inside .localdb on a spare port, writes .env,
 * installs dependencies, runs the migrations, creates a test sign-in and starts the dev server.
 * Nothing outside this folder is touched: stop the server, delete .localdb and you are back
 * where you started. The documented alternative is `docker compose up -d` (see README).
 *
 *   node scripts/local-test.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, appendFileSync as appendConf, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const LOG = join(root, "local-test.log");
const PORT = Number(process.env.PORT ?? 3001);
const PGPORT = Number(process.env.PGPORT ?? 5545);
const DBNAME = "gjs";
const DBUSER = "gjs";
const DATA = join(root, ".localdb", "data");
const ENVFILE = join(root, ".env");
const win = process.platform === "win32";
const exe = (n) => (win ? `${n}.exe` : n);

writeFileSync(LOG, "");
const say = (m) => { const l = `${new Date().toISOString().slice(11, 19)}  ${m}`; console.log(l); try { appendFileSync(LOG, l + "\n"); } catch {} };
const fail = (m) => { say("FAILED: " + m); process.exit(1); };

function run(cmd, args, opts = {}) {
  say(`> ${cmd.split(/[\\/]/).pop()} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd: root, ...opts });
  for (const s of [r.stdout, r.stderr]) if (s && s.trim()) say("   " + s.trim().split("\n").slice(-12).join("\n   ").slice(0, 3000));
  if (r.error) throw new Error(r.error.message);
  if (r.status !== 0) throw new Error(`${cmd.split(/[\\/]/).pop()} exited with ${r.status}`);
  return r.stdout ?? "";
}
// npm is a .cmd on Windows, which needs a shell.
const npm = (args, env) => run(win ? "npm.cmd" : "npm", args, { shell: win, env: { ...process.env, ...env } });
const readEnv = (key) => {
  try { return (new RegExp(`^${key}=(.+)$`, "m").exec(readFileSync(ENVFILE, "utf8")) ?? [])[1]?.trim(); } catch { return undefined; }
};

/** Locate the PostgreSQL bin directory of a normal install. */
function findPgBin() {
  if (process.env.PGBIN) return process.env.PGBIN;
  const roots = win
    ? ["C:\\Program Files\\PostgreSQL", "C:\\Program Files (x86)\\PostgreSQL"]
    : ["/usr/lib/postgresql", "/usr/local/opt", "/opt/homebrew/opt"];
  const found = [];
  for (const base of roots) {
    let entries = [];
    try { entries = readdirSync(base); } catch { continue; }
    for (const e of entries) {
      for (const bin of [join(base, e, "bin"), join(base, e, "libexec", "bin")]) {
        if (existsSync(join(bin, exe("initdb")))) found.push([e, bin]);
      }
    }
  }
  found.sort((a, b) => (parseInt(a[0], 10) || 0) - (parseInt(b[0], 10) || 0));
  return found.pop()?.[1] ?? null;
}

say("Local test setup for the GEMS & JEWELRY School admin dashboard");
say(`node ${process.version} on ${process.platform}`);

const pgbin = findPgBin();
if (!pgbin) fail("PostgreSQL tools were not found. Set PGBIN to its bin folder, or use `docker compose up -d` instead.");
say(`postgres tools: ${pgbin}`);

const pgctl = join(pgbin, exe("pg_ctl"));
const running = () => spawnSync(pgctl, ["-D", DATA, "status"], { encoding: "utf8" }).status === 0;

// 1. clear away a cluster left behind by an interrupted run (its password is not recoverable)
if (existsSync(DATA) && !readEnv("DATABASE_URL")) {
  say("found an unfinished .localdb from an earlier run, clearing it");
  spawnSync(pgctl, ["-D", DATA, "-m", "fast", "-w", "stop"], { encoding: "utf8", stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1500));
  try { rmSync(join(root, ".localdb"), { recursive: true, force: true }); }
  catch { fail("Could not delete .localdb. Close anything using it and run this again."); }
}

// 2. the throwaway cluster (a second run reuses it, and its password, from .env)
const fresh = !existsSync(DATA);
let dbUrl;
if (fresh) {
  const pw = randomBytes(12).toString("base64url");
  dbUrl = `postgres://${DBUSER}:${pw}@127.0.0.1:${PGPORT}/${DBNAME}`;
  mkdirSync(join(root, ".localdb"), { recursive: true });
  const pwfile = join(root, ".localdb", "pw.txt");
  writeFileSync(pwfile, pw);
  try {
    run(join(pgbin, exe("initdb")), ["-D", DATA, "-U", DBUSER, `--pwfile=${pwfile}`, "-A", "scram-sha-256", "-E", "UTF8", "--locale=C"]);
  } finally {
    writeFileSync(pwfile, "");
  }
  appendConf(join(DATA, "postgresql.conf"),
    `\nport = ${PGPORT}\nlisten_addresses = '127.0.0.1'\n`
    // Keep the unix socket inside the project: the packaged default is a root-owned folder.
    // The socket must live outside the project: the bundler tries to read it as a source file.
    + (win ? "" : `unix_socket_directories = '${tmpdir()}'\n`));
} else {
  dbUrl = readEnv("DATABASE_URL");
  say(".localdb already exists, reusing it");
}

// 3. .env, written before the server starts so the password is never lost
const sessionSecret = readEnv("SESSION_SECRET") ?? randomBytes(32).toString("base64");
writeFileSync(ENVFILE, [
  "# Written by scripts/local-test.mjs for local testing only. Not for production.",
  `DATABASE_URL=${dbUrl}`,
  `SESSION_SECRET=${sessionSecret}`,
  "",
].join("\n"));
say("wrote .env");

// 4. start the server.
// stdio must be ignored: on Windows the server inherits the pipes and pg_ctl would never return.
if (running()) say("database server already running");
else {
  say("> pg_ctl start");
  const r = spawnSync(pgctl, ["-D", DATA, "-l", join(root, ".localdb", "server.log"), "-w", "start"], { stdio: "ignore" });
  if (r.status !== 0 || !running()) fail("the database server did not start, see .localdb/server.log");
  say("database server started on port " + PGPORT);
}

// 5. the application database (initdb only creates the built-in ones)
const pgpass = /:\/\/[^:]+:([^@]+)@/.exec(dbUrl)?.[1];
const createdb = spawnSync(join(pgbin, exe("createdb")), ["-h", "127.0.0.1", "-p", String(PGPORT), "-U", DBUSER, DBNAME],
  { encoding: "utf8", env: { ...process.env, PGPASSWORD: pgpass } });
if (createdb.status === 0) say(`created database ${DBNAME}`);
else if (/already exists/i.test(createdb.stderr ?? "")) say(`database ${DBNAME} already exists`);
else fail(`createdb: ${(createdb.stderr || createdb.error?.message || "unknown error").trim()}`);

// 6. dependencies
// node_modules being present is not enough: a security patch in package.json has to reach disk,
// so reinstall whenever package.json or the lockfile is newer than the last install.
const installStamp = join(root, "node_modules", ".package-lock.json");
const mtime = (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } };
const installed = mtime(installStamp);
const wanted = Math.max(mtime(join(root, "package.json")), mtime(join(root, "package-lock.json")));
if (!existsSync(join(root, "node_modules", "next"))) npm(["install"]);
else if (installed === 0 || wanted > installed) { say("package.json changed since the last install, reinstalling"); npm(["install"]); }
else say("dependencies up to date, skipping npm install");

// 7. schema
npm(["run", "db:migrate"], { DATABASE_URL: dbUrl });

// 8. test sign-ins, written to a file rather than the screen
const pwA = `local-test-${randomBytes(9).toString("base64url")}`;
const pwS = `local-test-${randomBytes(9).toString("base64url")}`;
npm(["run", "create-admin"], { DATABASE_URL: dbUrl, ADMIN_EMAIL: "admin@local.test", ADMIN_PASSWORD: pwA, ADMIN_ROLE: "admin" });
npm(["run", "create-admin"], { DATABASE_URL: dbUrl, ADMIN_EMAIL: "accountant@local.test", ADMIN_PASSWORD: pwS, ADMIN_ROLE: "accountant" });
writeFileSync(join(root, "local-test-login.txt"), [
  "Local test sign-in. This file is git-ignored; delete it when you are done.",
  "",
  `Admin (everything):              admin@local.test        ${pwA}`,
  `Accountant (no voiding):         accountant@local.test   ${pwS}`,
  "",
  "Add or change users with: npm run create-admin",
  "",
].join("\n"));
say("test sign-ins written to local-test-login.txt");

// 9. dev server
say(`starting the dev server on http://localhost:${PORT} ...`);
const dev = spawn(win ? "npm.cmd" : "npm", ["run", "dev", "--", "-p", String(PORT)], {
  cwd: root, shell: win, stdio: "inherit",
  env: { ...process.env, DATABASE_URL: dbUrl, SESSION_SECRET: sessionSecret },
});
dev.on("exit", (c) => process.exit(c ?? 0));

// 10. open a browser once it answers
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const res = await fetch(`http://localhost:${PORT}/login`, { redirect: "manual" });
    if (res.status < 500) {
      say(`READY  ->  http://localhost:${PORT}/login   (students, invoices, payments, reports)`);
      if (win) spawn("cmd", ["/c", "start", "", `http://localhost:${PORT}/login`], { detached: true, stdio: "ignore" }).unref();
      break;
    }
  } catch { /* not up yet */ }
}
