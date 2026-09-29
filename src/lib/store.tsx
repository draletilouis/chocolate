'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Command } from './commands';
import type { State } from './seed';
import { applyItems, emptyState, type SyncPayload } from './sync';
import type {
  Access, BusinessDetails, Container, ContainerUse, Destination, Ingredient, LotCategory, OutputKind, PackSize, Product,
  RecipeIngredient, Route, StationId, Supplier, User,
} from './types';

/** One weighed output and where it goes, saved together in a single step */
export interface OutputEntry { name: string; kind: OutputKind; weight: number; destination: Destination; container?: ContainerUse }

/** Optional controls used when a process is recorded from the batch view. */
export interface RecordOptions {
  /** Keep the batch's normal next station unchanged for an out-of-order entry. */
  advanceWorkflow?: boolean;
  /** Explicit material label for an independently entered process. */
  inputMaterial?: string;
}

export interface NewBatchInput {
  productId: string;
  name?: string;
  /** Calendar date on which the batch was started; defaults to today. */
  batchDate?: string;
  startWeight: number;
  /** Supplier of the delivered beans, for traceability on labels */
  supplierId?: string;
  lotUses: { lotId: string; quantity: number }[];
  recipeVersion?: number;
  ingredients?: Ingredient[];
  note?: string;
}

export interface NewLotInput { material: string; category: LotCategory; quantity: number; unit: 'kg' | 'units'; supplierId: string; reference?: string }

/** Staff fields edited in Setup; password and PIN travel to the server once and are stored there as hashes */
export interface UserInput { name: string; role: string; email: string; access: Access; stations: StationId[] }

/** A name on the quick sign-in screen of a set-up device */
export interface Person { id: string; name: string; initials: string; role: string }
/** What the sign-in screen may show on this device */
export interface AuthInfo { firstRun: boolean; trustedDevice: boolean; demo: boolean; people: Person[] }
export interface DeviceInfo { id: string; name: string; trustedBy: string; createdAt: string; lastSeen: string; current: boolean }
interface SessionInfo { user: User; recordingAsId: string | null; demo: boolean }
export type SignInResult = { ok: true; notice?: string } | { ok: false; error: string };

interface Actions {
  createBatch: (input: NewBatchInput) => Promise<string | undefined>;
  /** Bean deliveries: the batch and its receiving record in one save */
  receiveDelivery: (batch: NewBatchInput, input: { weight: number; container?: ContainerUse }, outputs: OutputEntry[], note?: string) => Promise<string | undefined>;
  /** Saves a station's input, weights and destinations at once. expectRecord is recordStamp() of the record the form started from. */
  saveRecord: (batchId: string, station: StationId, input: { weight: number; container?: ContainerUse }, outputs: OutputEntry[], note: string | undefined, options: RecordOptions | undefined, expectRecord: string | null) => Promise<boolean>;
  savePackaging: (batchId: string, inputWeight: number, packSizeId: string, totalUnits: number, rejectedUnits: number, note: string | undefined, options: RecordOptions | undefined, expectRecord: string | null) => Promise<boolean>;
  completeBatch: (batchId: string, note?: string) => Promise<boolean>;
  updateBatchDetails: (batchId: string, patch: { name?: string; note?: string }) => Promise<boolean>;
  deleteBatch: (batchId: string) => Promise<boolean>;
  placeHold: (batchId: string, reason: string) => Promise<boolean>;
  releaseHold: (batchId: string, note: string) => Promise<boolean>;
  addCorrection: (batchId: string, recordId: string, output: string, corrected: number, reason: string) => Promise<boolean>;
  receiveLot: (input: NewLotInput) => Promise<string | undefined>;
  updateLot: (lotId: string, patch: { material: string; category: LotCategory; supplierId?: string; reference?: string }) => Promise<boolean>;
  deleteLot: (lotId: string) => Promise<boolean>;
  addRecipeVersion: (recipeId: string, ingredients: RecipeIngredient[], note: string) => Promise<boolean>;
  /** A new chocolate type with the first version of its recipe; answers the recipe ID */
  addChocolateType: (type: { name: string; ingredients: RecipeIngredient[]; note?: string }) => Promise<string | undefined>;
  updateRecipe: (recipeId: string, patch: { name: string }) => Promise<boolean>;
  deleteRecipe: (recipeId: string) => Promise<boolean>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<boolean>;
  updateProduct: (productId: string, patch: Omit<Product, 'id'>) => Promise<boolean>;
  deleteProduct: (productId: string) => Promise<boolean>;
  addPackSize: (pack: Omit<PackSize, 'id'>) => Promise<boolean>;
  updatePackSize: (packSizeId: string, patch: Omit<PackSize, 'id'>) => Promise<boolean>;
  deletePackSize: (packSizeId: string) => Promise<boolean>;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<boolean>;
  updateSupplier: (supplierId: string, patch: Omit<Supplier, 'id'>) => Promise<boolean>;
  deleteSupplier: (supplierId: string) => Promise<boolean>;
  addUser: (user: UserInput & { password: string; pin: string }) => Promise<boolean>;
  updateUser: (userId: string, patch: UserInput & { password?: string; pin?: string }) => Promise<boolean>;
  deleteUser: (userId: string) => Promise<boolean>;
  updateRoute: (routeId: string, patch: Pick<Route, 'name' | 'startMaterial' | 'note'>) => Promise<boolean>;
  deleteRoute: (routeId: string) => Promise<boolean>;
  setBusinessDetails: (business: BusinessDetails) => Promise<boolean>;
  setThresholds: (patch: { wastePct?: number; lowStockKg?: number }) => Promise<boolean>;
  setStationVariance: (station: StationId, value: number) => Promise<boolean>;
  addOutputCategory: (station: StationId, name: string, kind: OutputKind) => Promise<boolean>;
  updateOutputCategory: (categoryId: string, patch: { station: StationId; name: string; kind: OutputKind }) => Promise<boolean>;
  deleteOutputCategory: (categoryId: string) => Promise<boolean>;
  addContainer: (container: Omit<Container, 'id'>) => Promise<boolean>;
  updateContainer: (containerId: string, patch: Omit<Container, 'id'>) => Promise<boolean>;
  deleteContainer: (containerId: string) => Promise<boolean>;
  setIdleMinutes: (minutes: number) => Promise<boolean>;
  /** Uploads records an older version kept in this browser; answers how many people were added and how many need a new password or PIN */
  importBrowserData: (data: Record<string, unknown>) => Promise<{ people: number; needSecrets: number } | undefined>;
  /** A manager records on someone else's behalf (their own ID to stop) */
  setCurrentUser: (userId: string) => Promise<boolean>;
  signIn: (email: string, password: string, device?: { trustDevice: boolean; deviceName?: string }) => Promise<SignInResult>;
  signInWithPin: (userId: string, pin: string) => Promise<SignInResult>;
  /** First start of a real factory: create the first manager */
  setupFactory: (input: { name: string; role?: string; email: string; password: string; pin: string; deviceName?: string }) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  listDevices: () => Promise<DeviceInfo[] | undefined>;
  trustThisDevice: (name: string) => Promise<boolean>;
  removeDevice: (deviceId: string) => Promise<boolean>;
  resetDemo: () => Promise<boolean>;
  dismissNotice: () => void;
  retry: () => void;
}

interface Status {
  /** The first answer from the server has arrived */
  hydrated: boolean;
  /** Who signed in on this device */
  sessionUserId: string | null;
  signedInUser: User | null;
  /** Who new records are signed with (a manager may record on someone's behalf) */
  currentUserId: string;
  auth: AuthInfo | null;
  demo: boolean;
  /** Last save or connection problem, shown as a banner */
  notice: string | null;
  online: boolean;
  /** The server could not be reached when the app opened */
  loadError: boolean;
  /** The session ended while the app was open (idle, or removed by a manager) */
  endedWhileOpen: boolean;
}

const StoreContext = createContext<(State & Actions & Status) | null>(null);
const POLL_MS = 5000;
const JSON_HEADERS = { 'content-type': 'application/json' };
const offline = 'The server cannot be reached. Check the connection and try again.';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined);
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [endedWhileOpen, setEndedWhileOpen] = useState(false);
  const version = useRef(0);
  const active = useRef(false);

  const apply = useCallback((payload: SyncPayload) => {
    if (payload.full) {
      setState(payload.full);
      version.current = payload.version;
      return;
    }
    // A slow answer can arrive after a newer one (a check sent just before a save); its items would put older data back.
    if (payload.version < version.current) return;
    if (payload.items?.length) setState((current) => (current ? applyItems(current, payload.items!) : current));
    version.current = payload.version;
  }, []);

  const loadAuth = useCallback(async () => {
    const res = await fetch('/api/session', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && !data.signedIn) setAuth(data);
  }, []);

  const endSession = useCallback(async (whileOpen: boolean) => {
    setSession(null);
    setState(null);
    setNotice(null);
    version.current = 0;
    if (whileOpen) setEndedWhileOpen(true);
    await loadAuth().catch(() => setOnline(false));
  }, [loadAuth]);

  /** Fetches what changed since this device's version; tells the server whether the person was active */
  const pull = useCallback(async () => {
    const wasActive = active.current;
    active.current = false;
    try {
      const res = await fetch(`/api/sync?since=${version.current}${wasActive ? '&active=1' : ''}`, { cache: 'no-store' });
      if (res.status === 401) return endSession(true);
      if (!res.ok) throw new Error(String(res.status));
      apply(await res.json());
      setOnline(true);
    } catch {
      if (wasActive) active.current = true;
      setOnline(false);
    }
  }, [apply, endSession]);

  const start = useCallback(async (info: SessionInfo) => {
    version.current = 0;
    setEndedWhileOpen(false);
    setNotice(null);
    setSession(info);
    await pull();
  }, [pull]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch('/api/session', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? offline);
        setLoadError(true);
        return;
      }
      if (data.signedIn) return start(data);
      setAuth(data);
      setSession(null);
    } catch {
      setLoadError(true);
    }
  }, [start]);

  useEffect(() => { void load(); }, [load]);

  // Stay in step with other devices: check every few seconds while the app is visible, and on return to it.
  useEffect(() => {
    if (!session) return;
    const tick = () => { if (document.visibilityState === 'visible') void pull(); };
    const timer = window.setInterval(tick, POLL_MS);
    const mark = () => { active.current = true; };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, mark));
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [session, pull]);

  /** Sends one change and waits for the server; problems are shown in the banner and nothing changes locally */
  const send = useCallback(async <T = unknown,>(command: Command): Promise<{ ok: true; result: T } | { ok: false }> => {
    active.current = false;
    try {
      const res = await fetch('/api/commands', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ command, since: version.current }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await endSession(true);
        setNotice(data.error ?? 'Your session has ended. Sign in again; nothing was saved.');
        return { ok: false };
      }
      if (!res.ok) {
        setNotice(data.error ?? 'Could not save. Try again.');
        void pull(); // a refusal often means someone else just saved: fetch it so the screen shows their data
        return { ok: false };
      }
      apply(data);
      setOnline(true);
      setNotice(null);
      return { ok: true, result: data.result as T };
    } catch {
      setOnline(false);
      setNotice(`Not saved. ${offline}`);
      return { ok: false };
    }
  }, [apply, endSession, pull]);

  const signInRequest = useCallback(async (url: string, body: unknown): Promise<SignInResult> => {
    try {
      const res = await fetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? 'Could not sign in.' };
      await start(data);
      return { ok: true, notice: data.notice };
    } catch {
      return { ok: false, error: offline };
    }
  }, [start]);

  const actions: Actions = useMemo(() => {
    const done = (command: Command) => send(command).then((r) => r.ok);
    const value = <T,>(command: Command) => send<T>(command).then((r) => (r.ok ? r.result : undefined));
    return {
      createBatch: (input) => value<string>({ type: 'createBatch', input }),
      receiveDelivery: (batch, input, outputs, note) => value<string>({ type: 'receiveDelivery', batch, input, outputs, note }),
      saveRecord: (batchId, station, input, outputs, note, options, expectRecord) => done({ type: 'saveRecord', batchId, station, input, outputs, note, options, expectRecord }),
      savePackaging: (batchId, inputWeight, packSizeId, totalUnits, rejectedUnits, note, options, expectRecord) => done({ type: 'savePackaging', batchId, inputWeight, packSizeId, totalUnits, rejectedUnits, note, options, expectRecord }),
      completeBatch: (batchId, note) => done({ type: 'completeBatch', batchId, note }),
      updateBatchDetails: (batchId, patch) => done({ type: 'updateBatchDetails', batchId, ...patch }),
      deleteBatch: (batchId) => done({ type: 'deleteBatch', batchId }),
      placeHold: (batchId, reason) => done({ type: 'placeHold', batchId, reason }),
      releaseHold: (batchId, note) => done({ type: 'releaseHold', batchId, note }),
      addCorrection: (batchId, recordId, output, corrected, reason) => done({ type: 'addCorrection', batchId, recordId, output, corrected, reason }),
      receiveLot: (input) => value<string>({ type: 'receiveLot', input }),
      updateLot: (lotId, patch) => done({ type: 'updateLot', lotId, ...patch }),
      deleteLot: (lotId) => done({ type: 'deleteLot', lotId }),
      addRecipeVersion: (recipeId, ingredients, note) => done({ type: 'addRecipeVersion', recipeId, ingredients, note }),
      addChocolateType: (type) => value<string>({ type: 'addChocolateType', ...type }),
      updateRecipe: (recipeId, patch) => done({ type: 'updateRecipe', recipeId, name: patch.name }),
      deleteRecipe: (recipeId) => done({ type: 'deleteRecipe', recipeId }),
      addProduct: (product) => done({ type: 'addProduct', product }),
      updateProduct: (productId, product) => done({ type: 'updateProduct', productId, product }),
      deleteProduct: (productId) => done({ type: 'deleteProduct', productId }),
      addPackSize: (pack) => done({ type: 'addPackSize', pack }),
      updatePackSize: (packSizeId, pack) => done({ type: 'updatePackSize', packSizeId, pack }),
      deletePackSize: (packSizeId) => done({ type: 'deletePackSize', packSizeId }),
      addSupplier: (supplier) => done({ type: 'addSupplier', supplier }),
      updateSupplier: (supplierId, supplier) => done({ type: 'updateSupplier', supplierId, supplier }),
      deleteSupplier: (supplierId) => done({ type: 'deleteSupplier', supplierId }),
      addUser: (user) => done({ type: 'addUser', user }),
      updateUser: (userId, user) => done({ type: 'updateUser', userId, user }),
      deleteUser: (userId) => done({ type: 'deleteUser', userId }),
      updateRoute: (routeId, route) => done({ type: 'updateRoute', routeId, route }),
      deleteRoute: (routeId) => done({ type: 'deleteRoute', routeId }),
      setBusinessDetails: (business) => done({ type: 'setBusinessDetails', business }),
      setThresholds: (patch) => done({ type: 'setThresholds', ...patch }),
      setStationVariance: (station, valueToSet) => done({ type: 'setStationVariance', station, value: valueToSet }),
      addOutputCategory: (station, name, kind) => done({ type: 'addOutputCategory', station, name, kind }),
      updateOutputCategory: (categoryId, patch) => done({ type: 'updateOutputCategory', categoryId, ...patch }),
      deleteOutputCategory: (categoryId) => done({ type: 'deleteOutputCategory', categoryId }),
      addContainer: (container) => done({ type: 'addContainer', container }),
      updateContainer: (containerId, container) => done({ type: 'updateContainer', containerId, container }),
      deleteContainer: (containerId) => done({ type: 'deleteContainer', containerId }),
      setIdleMinutes: (minutes) => done({ type: 'setIdleMinutes', minutes }),
      importBrowserData: (data) => value<{ people: number; needSecrets: number }>({ type: 'importBrowserData', data }),
      async setCurrentUser(userId) {
        try {
          const res = await fetch('/api/session', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ recordingAs: userId }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setNotice(data.error ?? 'Could not change who is recording.'); return false; }
          setSession(data);
          return true;
        } catch {
          setNotice(offline);
          return false;
        }
      },
      signIn: (email, password, device) => signInRequest('/api/session', { method: 'password', email, password, trustDevice: device?.trustDevice, deviceName: device?.deviceName }),
      signInWithPin: (userId, pin) => signInRequest('/api/session', { method: 'pin', userId, pin }),
      setupFactory: (input) => signInRequest('/api/setup', input),
      async signOut() {
        await fetch('/api/session', { method: 'DELETE' }).catch(() => undefined);
        await endSession(false);
      },
      async listDevices() {
        try {
          const res = await fetch('/api/devices', { cache: 'no-store' });
          if (!res.ok) return undefined;
          return (await res.json()).devices as DeviceInfo[];
        } catch {
          return undefined;
        }
      },
      async trustThisDevice(name) {
        const res = await fetch('/api/devices', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) }).catch(() => undefined);
        if (!res?.ok) { setNotice((await res?.json().catch(() => ({})))?.error ?? offline); return false; }
        return true;
      },
      async removeDevice(deviceId) {
        const res = await fetch(`/api/devices?id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' }).catch(() => undefined);
        if (!res?.ok) { setNotice((await res?.json().catch(() => ({})))?.error ?? offline); return false; }
        return true;
      },
      async resetDemo() {
        const res = await fetch('/api/demo/reset', { method: 'POST' }).catch(() => undefined);
        if (!res?.ok) { setNotice('Could not reset the demo.'); return false; }
        await endSession(false);
        return true;
      },
      dismissNotice: () => setNotice(null),
      retry: () => { void load(); },
    };
  }, [send, signInRequest, endSession, load]);

  const hydrated = session !== undefined && (session === null ? auth !== null || loadError : state !== null) || loadError;
  const status: Status = {
    hydrated,
    sessionUserId: session?.user.id ?? null,
    signedInUser: session?.user ?? null,
    currentUserId: session ? session.recordingAsId ?? session.user.id : '',
    auth,
    demo: session?.demo ?? auth?.demo ?? false,
    notice,
    online,
    loadError,
    endedWhileOpen,
  };
  const data = state ?? emptyState();
  const value = useMemo(() => ({ ...data, ...actions, ...status }), [data, actions, status.hydrated, status.sessionUserId, status.signedInUser, status.currentUserId, auth, status.demo, notice, online, loadError, endedWhileOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
