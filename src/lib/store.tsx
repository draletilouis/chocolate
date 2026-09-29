'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/components/AuthProvider';
import { seedState, type State } from './seed';
import type { Destination, Ingredient, LotCategory, OutputKind, PackSize, Product, RecipeIngredient, StationId, Supplier, Thresholds } from './types';

export interface MeasuredOutput { name: string; kind: OutputKind; weight: number }
export interface NewBatchInput { productId: string; supplierId: string; startWeight: number; lotUses: { lotId: string; quantity: number }[]; recipeVersion?: number; ingredients?: Ingredient[]; note?: string }
export interface NewLotInput { material: string; category: LotCategory; quantity: number; unit: 'kg' | 'units'; supplierId: string; reference?: string }
export interface AuthUserLike { id: number; name: string; roleLabel: string; email: string; initials: string }

interface Actions {
  createBatch: (input: NewBatchInput) => Promise<string>;
  saveMeasurements: (batchId: string, station: StationId, inputWeight: number, outputs: MeasuredOutput[], note?: string) => Promise<string>;
  savePackaging: (batchId: string, inputWeight: number, packSizeId: string, totalUnits: number, rejectedUnits: number, note?: string) => Promise<string>;
  saveDestinations: (batchId: string, recordId: string, destinations: Record<string, Destination>) => Promise<void>;
  completeBatch: (batchId: string, note?: string) => Promise<void>;
  placeHold: (batchId: string, reason: string) => Promise<void>;
  releaseHold: (batchId: string, note: string) => Promise<void>;
  addCorrection: (batchId: string, recordId: string, output: string, corrected: number, reason: string) => Promise<void>;
  receiveLot: (input: NewLotInput) => Promise<string>;
  addRecipeVersion: (recipeId: string, ingredients: RecipeIngredient[], note: string) => Promise<void>;
  addRecipe: (name: string, ingredients: RecipeIngredient[], note: string) => Promise<string>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  addPackSize: (pack: Omit<PackSize, 'id'>) => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, 'id'>) => Promise<void>;
  setThresholds: (patch: Partial<Thresholds>) => Promise<void>;
  setStationVariance: (station: StationId, value: number) => Promise<void>;
  addOutputCategory: (station: StationId, name: string, kind: OutputKind) => Promise<void>;
  /** Edit and delete, the same shape for every list */
  updateProduct: (id: string, product: Omit<Product, 'id'>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updatePackSize: (id: string, pack: Omit<PackSize, 'id'>) => Promise<void>;
  deletePackSize: (id: string) => Promise<void>;
  updateSupplier: (id: string, supplier: Omit<Supplier, 'id'>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  updateOutputCategory: (id: number, name: string, kind: OutputKind) => Promise<void>;
  deleteOutputCategory: (id: number) => Promise<void>;
  updateRecipe: (id: string, name: string, ingredients: RecipeIngredient[], note: string) => Promise<{ version: number; versioned: boolean }>;
  deleteRecipe: (id: string) => Promise<void>;
  updateLot: (id: string, patch: { material: string; quantity: number; supplierId: string; reference?: string }) => Promise<void>;
  deleteLot: (id: string) => Promise<void>;
  resetData: () => Promise<void>;
}

type StoreValue = State & Actions & { hydrated: boolean; loadError: string | null };
const StoreContext = createContext<StoreValue | null>(null);
const localUser = (auth: AuthUserLike) => ({ id: `db-${auth.id}`, name: auth.name, role: auth.roleLabel, initials: auth.initials, email: auth.email });

export function StoreProvider({ children, authUser }: { children: ReactNode; authUser: AuthUserLike }) {
  const [state, setState] = useState<State>(() => { const seed = seedState(); const user = localUser(authUser); return { ...seed, users: [...seed.users, user], currentUserId: user.id }; });
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyResponse = useCallback((data: { state?: State }) => { if (data.state) setState(data.state); setLoadError(null); }, []);
  const callApi = useCallback(async <T extends { state?: State; id?: string; recordId?: string }>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> => {
    const result = await api<T>(path, method === 'DELETE' ? { method } : { method, body: JSON.stringify(body ?? {}) });
    if (result.status === 401) { window.location.assign('/login'); throw new Error('Your session has expired.'); }
    if (!result.ok) throw new Error(result.data.message || 'The server could not save this change.');
    applyResponse(result.data);
    return result.data;
  }, [applyResponse]);

  useEffect(() => {
    let cancelled = false;
    api<{ state: State }>('/api/state').then((result) => {
      if (cancelled) return;
      if (result.status === 401) { window.location.assign('/login'); return; }
      if (!result.ok || !result.data.state) throw new Error(result.data.message || 'Could not load production records.');
      setState(result.data.state); setHydrated(true);
    }).catch((error: unknown) => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : 'Could not load production records.'); setHydrated(true); } });
    return () => { cancelled = true; };
  }, []);

  const actions: Actions = useMemo(() => ({
    async createBatch(input) { return (await callApi<{ id?: string; state?: State }>('/api/batches', 'POST', input)).id!; },
    async saveMeasurements(batchId, station, inputWeight, outputs, note) { return (await callApi<{ recordId?: string; state?: State }>(`/api/batches/${encodeURIComponent(batchId)}/records`, 'POST', { station, inputWeight, outputs, note })).recordId!; },
    async savePackaging(batchId, inputWeight, packSizeId, totalUnits, rejectedUnits, note) { return (await callApi<{ recordId?: string; state?: State }>(`/api/batches/${encodeURIComponent(batchId)}/packaging`, 'POST', { inputWeight, packSizeId, totalUnits, rejectedUnits, note })).recordId!; },
    async saveDestinations(batchId, recordId, destinations) { await callApi(`/api/batches/${encodeURIComponent(batchId)}/records/${encodeURIComponent(recordId)}/destinations`, 'PATCH', { destinations }); },
    async completeBatch(batchId, note) { await callApi(`/api/batches/${encodeURIComponent(batchId)}/completion`, 'POST', { note }); },
    async placeHold(batchId, reason) { await callApi(`/api/batches/${encodeURIComponent(batchId)}/holds`, 'POST', { reason }); },
    async releaseHold(batchId, note) { await callApi(`/api/batches/${encodeURIComponent(batchId)}/holds/release`, 'POST', { note }); },
    async addCorrection(batchId, recordId, output, corrected, reason) { await callApi(`/api/batches/${encodeURIComponent(batchId)}/corrections`, 'POST', { recordId, output, corrected, reason }); },
    async receiveLot(input) { return (await callApi<{ id?: string; state?: State }>('/api/lots', 'POST', input)).id!; },
    async addRecipeVersion(recipeId, ingredients, note) { await callApi(`/api/recipes/${encodeURIComponent(recipeId)}/versions`, 'POST', { ingredients, note }); },
    async addRecipe(name, ingredients, note) { return (await callApi<{ id?: string; state?: State }>('/api/config/recipes', 'POST', { name, ingredients, note })).id!; },
    async addProduct(product) { await callApi('/api/config/products', 'POST', product); },
    async addPackSize(pack) { await callApi('/api/config/pack-sizes', 'POST', pack); },
    async addSupplier(supplier) { await callApi('/api/config/suppliers', 'POST', supplier); },
    async setThresholds(patch) { await callApi('/api/config/thresholds', 'POST', patch); },
    async setStationVariance(station, value) { await callApi('/api/config/thresholds', 'POST', { variancePct: { [station]: value } }); },
    async addOutputCategory(station, name, kind) { await callApi('/api/config/output-categories', 'POST', { station, name, kind }); },
    async updateProduct(id, product) { await callApi(`/api/config/products/${encodeURIComponent(id)}`, 'PATCH', product); },
    async deleteProduct(id) { await callApi(`/api/config/products/${encodeURIComponent(id)}`, 'DELETE'); },
    async updatePackSize(id, pack) { await callApi(`/api/config/pack-sizes/${encodeURIComponent(id)}`, 'PATCH', pack); },
    async deletePackSize(id) { await callApi(`/api/config/pack-sizes/${encodeURIComponent(id)}`, 'DELETE'); },
    async updateSupplier(id, supplier) { await callApi(`/api/config/suppliers/${encodeURIComponent(id)}`, 'PATCH', supplier); },
    async deleteSupplier(id) { await callApi(`/api/config/suppliers/${encodeURIComponent(id)}`, 'DELETE'); },
    async updateOutputCategory(id, name, kind) { await callApi(`/api/config/output-categories/${id}`, 'PATCH', { name, kind }); },
    async deleteOutputCategory(id) { await callApi(`/api/config/output-categories/${id}`, 'DELETE'); },
    async updateRecipe(id, name, ingredients, note) { const r = await callApi<{ version?: number; versioned?: boolean; state?: State }>(`/api/config/recipes/${encodeURIComponent(id)}`, 'PATCH', { name, ingredients, note }); return { version: r.version ?? 0, versioned: r.versioned ?? false }; },
    async deleteRecipe(id) { await callApi(`/api/config/recipes/${encodeURIComponent(id)}`, 'DELETE'); },
    async updateLot(id, patch) { await callApi(`/api/lots/${encodeURIComponent(id)}`, 'PATCH', patch); },
    async deleteLot(id) { await callApi(`/api/lots/${encodeURIComponent(id)}`, 'DELETE'); },
    async resetData() { await callApi('/api/admin/reset-demo', 'POST'); },
  }), [callApi]);

  const value = useMemo(() => ({ ...state, ...actions, hydrated, loadError }), [state, actions, hydrated, loadError]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() { const context = useContext(StoreContext); if (!context) throw new Error('useStore must be used inside StoreProvider'); return context; }
