import type { Command } from '@/lib/commands';
import { configState, demoCredentials, seedState, type State } from '@/lib/seed';
import { applyItems, collections, diffState, settings, stateFromItems, type Item, type SyncPayload } from '@/lib/sync';
import type { Access } from '@/lib/types';
import { hashSecret, shortId } from './crypto';
import { factoryNow, getDb, type Db, type Query } from './db';
import { DEMO_VERSION, demoState } from './demo';
import { applyCommand, upgradeConfiguration } from './reduce';

interface Cache { version: number; state: State }
const g = globalThis as typeof globalThis & { __cocoaCache?: Cache; __cocoaInit?: Promise<void> };

/**
 * Every installation runs as the demo for now, whatever DEMO_MODE says (the owner's decision, 2026-10-07):
 * the sample factory, rebuilt when a newer demo is deployed. When real factories go live, bring back
 * `process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : !process.env.DATABASE_URL`.
 */
export const isDemo = () => true;

export interface Actor { userId: string; access: Access; recordingAs?: string | null }

const toItem = (row: Record<string, unknown>): Item => ({ kind: row.kind as Item['kind'], id: row.id as string, data: row.deleted ? null : row.data });

/** Every item of a state, settings included */
function allItems(state: State): Item[] {
  return [
    ...collections.flatMap((kind) => (state[kind] as { id: string }[]).map((data) => ({ kind, id: data.id, data }))),
    ...settings.map((id) => ({ kind: 'settings' as const, id, data: state[id] })),
  ];
}

async function ready(): Promise<Db> {
  const db = await getDb();
  g.__cocoaInit ??= initialize(db).catch((error) => {
    g.__cocoaInit = undefined;
    throw error;
  });
  await g.__cocoaInit;
  return db;
}

/** The demo factory's weeks of production up to today. Should a rule change stop them being made, the demo starts without records rather than not at all. */
function demoFactory(): State {
  try {
    return demoState(factoryNow().slice(0, 10));
  } catch (error) {
    console.error('The demo records could not be made, so the demo starts without them:', error);
    return seedState();
  }
}

/** Stores the demo factory, or the line configuration only for a real factory */
async function seedInto(q: Query) {
  const demo = isDemo();
  const state = demo ? demoFactory() : configState();
  for (const item of allItems(state)) {
    await q('insert into app_items (kind, id, version, deleted, data) values ($1, $2, 1, false, $3)', [item.kind, item.id, JSON.stringify(item.data)]);
  }
  await q('insert into app_meta (id, version, demo_version) values (1, 1, $1)', [demo ? DEMO_VERSION : null]);
  if (demo) {
    for (const user of state.users) {
      await q('insert into app_credentials (user_id, password_hash, pin_hash) values ($1, $2, $3)', [user.id, await hashSecret(demoCredentials.password), await hashSecret(demoCredentials.pin)]);
    }
  }
}

/** Stores changed items under a new data version */
async function writeItems(q: Query, items: Item[], version: number) {
  for (const item of items) {
    await q(
      `insert into app_items (kind, id, version, deleted, data) values ($1, $2, $3, $4, $5)
       on conflict (kind, id) do update set version = excluded.version, deleted = excluded.deleted, data = excluded.data`,
      [item.kind, item.id, version, item.data === null, item.data === null ? null : JSON.stringify(item.data)],
    );
  }
}

/** A database started by an older version: brings its line configuration and chocolate types up to date */
async function upgradeInto(q: Query) {
  const { version, state } = await loadAll(q);
  const upgraded = upgradeConfiguration(state, factoryNow());
  const items = diffState(state, upgraded);
  if (items.length === 0) return;
  await writeItems(q, items, version + 1);
  // Lists show in stored order: the current configuration first, in its own order.
  for (const kind of ['routes', 'products', 'outputCategories', 'recipes'] as const) {
    for (const item of upgraded[kind]) await q("update app_items set pos = nextval(pg_get_serial_sequence('app_items', 'pos')) where kind = $1 and id = $2", [kind, item.id]);
  }
  await q('update app_meta set version = $1 where id = 1', [version + 1]);
  await q('insert into app_commands (version, type, payload) values ($1, $2, $3)', [version + 1, 'upgradeConfiguration', JSON.stringify({ from: state.workflowVersion, to: upgraded.workflowVersion })]);
}

/** Empties the database and stores the demo factory again; everyone is signed out */
async function rebuildDemo(q: Query) {
  for (const table of ['app_items', 'app_credentials', 'app_sessions', 'app_commands', 'app_meta']) await q(`delete from ${table}`);
  await q("select setval(pg_get_serial_sequence('app_items', 'pos'), 1, false)");
  await seedInto(q);
}

/**
 * First start of a new database, or of a new version on an existing one. A demo database made by an older
 * demo is rebuilt with the current one, so deploying a new demo needs no reset by hand; a real factory's
 * records are never touched.
 */
async function initialize(db: Db) {
  await db.transaction(async (q) => {
    await q('select pg_advisory_xact_lock(4242)');
    const { rows } = await q<{ demo_version: number | null }>('select demo_version from app_meta where id = 1');
    if (!rows.length) await seedInto(q);
    else if (isDemo() && (rows[0].demo_version ?? 1) < DEMO_VERSION) {
      const from = rows[0].demo_version ?? 1;
      await rebuildDemo(q);
      await q('insert into app_commands (version, type, payload) values (1, $1, $2)', ['rebuildDemo', JSON.stringify({ from, to: DEMO_VERSION })]);
      console.log(`The demo was made by demo version ${from}; rebuilt it with version ${DEMO_VERSION}.`);
    } else await upgradeInto(q);
  });
}

async function loadAll(q: Query): Promise<Cache> {
  const meta = await q<{ version: number }>('select version from app_meta where id = 1');
  const { rows } = await q('select kind, id, data, deleted from app_items where not deleted order by pos');
  return { version: meta.rows[0].version, state: stateFromItems(rows.map(toItem)) };
}

/** Brings the in-memory copy up to date with the database (another server instance may have saved) */
async function refresh(q: Query): Promise<Cache> {
  const cache = g.__cocoaCache;
  if (!cache) return (g.__cocoaCache = await loadAll(q));
  const meta = await q<{ version: number }>('select version from app_meta where id = 1');
  const version = meta.rows[0].version;
  if (version === cache.version) return cache;
  if (version < cache.version) return (g.__cocoaCache = await loadAll(q)); // the data was reset
  const { rows } = await q('select kind, id, data, deleted from app_items where version > $1 order by pos', [cache.version]);
  return (g.__cocoaCache = { version, state: applyItems(cache.state, rows.map(toItem)) });
}

export async function readState(): Promise<Cache> {
  const db = await ready();
  return refresh(db.query);
}

/** The whole state, or only what changed since the version a browser already has */
export async function changesSince(since: number): Promise<SyncPayload> {
  const db = await ready();
  const cache = await refresh(db.query);
  if (!(since > 0) || since > cache.version) return { version: cache.version, full: cache.state };
  if (since === cache.version) return { version: cache.version, items: [] };
  const { rows } = await db.query('select kind, id, data, deleted from app_items where version > $1 order by pos', [since]);
  return { version: cache.version, items: rows.map(toItem) };
}

type Secret = { userId: string; password?: string; pin?: string };

/** Passwords and PINs carried by a command; they are hashed into app_credentials, never stored in the state */
function secretsOf(command: Command, result: unknown): Secret[] {
  if (command.type === 'addUser') return [{ userId: result as string, password: command.user.password, pin: command.user.pin }];
  if (command.type === 'updateUser' && (command.user.password || command.user.pin)) return [{ userId: command.userId, password: command.user.password, pin: command.user.pin }];
  if (command.type === 'importBrowserData') return (result as { id: string; password?: string; pin?: string }[]).map((u) => ({ userId: u.id, password: u.password, pin: u.pin }));
  return [];
}

/** What goes into the audit log: no passwords, PINs or whole uploaded data sets */
function forLog(command: Command): unknown {
  if (command.type === 'addUser' || command.type === 'updateUser') {
    const { password, pin, ...user } = command.user;
    return { ...command, user: { ...user, passwordChanged: Boolean(password), pinChanged: Boolean(pin) } };
  }
  if (command.type === 'importBrowserData') return { type: command.type, batches: Array.isArray(command.data.batches) ? command.data.batches.length : 0, lots: Array.isArray(command.data.lots) ? command.data.lots.length : 0 };
  return command;
}

/** What an upload of browser data tells the manager: people added, and those who need a new password or PIN */
function importSummary(result: unknown) {
  const people = result as { password?: string; pin?: string }[];
  return { people: people.length, needSecrets: people.filter((p) => !p.password || !p.pin).length };
}

export async function setCredentials(q: Query, secret: Secret) {
  const password = secret.password ? await hashSecret(secret.password) : null;
  const pin = secret.pin ? await hashSecret(secret.pin) : null;
  await q(
    `insert into app_credentials (user_id, password_hash, pin_hash) values ($1, $2, $3)
     on conflict (user_id) do update set password_hash = coalesce(excluded.password_hash, app_credentials.password_hash), pin_hash = coalesce(excluded.pin_hash, app_credentials.pin_hash),
       failed_pins = 0, pin_locked_until = null, failed_passwords = 0, password_locked_until = null`,
    [secret.userId, password, pin],
  );
}

/**
 * Applies one command in a transaction: the state is locked, the command runs on the latest data,
 * changed items are written with a new version, and the change is logged with who made it.
 */
export async function execute(command: Command, actor: Actor, precondition?: (state: State) => void): Promise<{ version: number; result: unknown }> {
  const db = await ready();
  let committed: Cache | undefined;
  const outcome = await db.transaction(async (q) => {
    await q('select version from app_meta where id = 1 for update');
    const cache = await refresh(q);
    precondition?.(cache.state);
    const ctx = { userId: actor.recordingAs || actor.userId, actorId: actor.userId, now: factoryNow(), newId: shortId };
    const { state, result } = applyCommand(cache.state, command, ctx);
    const items = diffState(cache.state, state);
    const secrets = secretsOf(command, result);
    if (items.length === 0 && secrets.length === 0) return { version: cache.version, result };
    const version = cache.version + 1;
    await writeItems(q, items, version);
    for (const secret of secrets) await setCredentials(q, secret);
    if (command.type === 'deleteUser') {
      await q('delete from app_credentials where user_id = $1', [command.userId]);
      await q('delete from app_sessions where user_id = $1 or recording_as = $1', [command.userId]);
    }
    await q('update app_meta set version = $1 where id = 1', [version]);
    await q('insert into app_commands (version, user_id, recorded_as, type, payload) values ($1, $2, $3, $4, $5)', [version, actor.userId, actor.recordingAs || null, command.type, JSON.stringify(forLog(command))]);
    committed = { version, state };
    return { version, result: command.type === 'importBrowserData' ? importSummary(result) : result };
  });
  if (committed) g.__cocoaCache = committed;
  return outcome;
}

/** Demo instances only: put the sample factory back (everyone is signed out) */
export async function resetDemo() {
  const db = await ready();
  await db.transaction(async (q) => {
    await q('select version from app_meta where id = 1 for update');
    await rebuildDemo(q);
  });
  g.__cocoaCache = undefined;
}
