'use client';

import { Badge, PageHeader, Panel, RowLink } from '@/components/ui';
import { useStore } from '@/lib/store';

export default function RecipesPage() {
  const store = useStore();
  return (
    <>
      <PageHeader eyebrow="Recipes" title="Recipes" subtitle="Each recipe keeps its versions. Batches record which version they used and what was actually weighed in." />
      <Panel>
        {store.recipes.map((recipe) => {
          const current = recipe.versions.find((v) => v.version === recipe.currentVersion)!;
          const used = store.batches.filter((b) => b.recipeId === recipe.id).length;
          return (
            <RowLink key={recipe.id} href={`/recipes/${recipe.id}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong>{recipe.name}</strong><Badge tone="green">v{recipe.currentVersion} current</Badge><span className="text-[12px] text-muted">{recipe.versions.length} version{recipe.versions.length > 1 ? 's' : ''} · used by {used} batch{used === 1 ? '' : 'es'}</span></span>
                <span className="block text-[12px] text-muted">{current.ingredients.map((i) => `${i.name} ${i.percent}%`).join(' · ')}</span>
              </span>
            </RowLink>
          );
        })}
      </Panel>
    </>
  );
}
