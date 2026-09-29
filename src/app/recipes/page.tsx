'use client';

import { Plus } from 'lucide-react';
import { Badge, LinkButton, PageHeader, Panel, RowLink } from '@/components/ui';
import { allRuns } from '@/lib/mixing';
import { useStore } from '@/lib/store';

export default function RecipesPage() {
  const store = useStore();
  const runs = allRuns(store);
  return (
    <>
      <PageHeader eyebrow="Recipes" title="Chocolate types" subtitle="Each type keeps its recipe versions. Every mixing run records which version it used and what was actually weighed in."
        action={<LinkButton href="/recipes/new"><Plus size={15} /> New chocolate type</LinkButton>} />
      <Panel>
        {store.recipes.map((recipe) => {
          const current = recipe.versions.find((v) => v.version === recipe.currentVersion)!;
          const used = runs.filter(({ run }) => run.recipeId === recipe.id).length;
          return (
            <RowLink key={recipe.id} href={`/recipes/${recipe.id}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong>{recipe.name}</strong><Badge tone="green">v{recipe.currentVersion} current</Badge><span className="text-[12px] text-muted">{recipe.versions.length} version{recipe.versions.length > 1 ? 's' : ''} · made in {used} run{used === 1 ? '' : 's'}</span></span>
                <span className="block text-[12px] text-muted">{current.ingredients.map((i) => `${i.name} ${i.percent}%`).join(' · ')}</span>
              </span>
            </RowLink>
          );
        })}
      </Panel>
    </>
  );
}
