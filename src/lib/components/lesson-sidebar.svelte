<script lang="ts">
import { Check } from '@lucide/svelte';
import { STAGES } from '$lib/content/stages';
import type { LessonMeta } from '$lib/content/types';
import { progress } from '$lib/progress.svelte';

let { lessons, current }: { lessons: LessonMeta[]; current?: string } = $props();
</script>

<nav aria-label="Lessons" class="text-sm">
	{#each STAGES as stage (stage.n)}
		{@const items = lessons.filter((l) => l.stage === stage.n)}
		<section class="mb-5">
			<h2 class="mb-1.5 flex items-baseline gap-2 px-2 font-mono text-[0.6875rem] uppercase tracking-wider text-muted">
				<span>{String(stage.n).padStart(2, '0')}</span>
				<span>{stage.title}</span>
			</h2>
			<ol>
				{#each items as lesson (lesson.slug)}
					{@const isCurrent = lesson.slug === current}
					{@const isDone = progress.isDone(lesson.slug)}
					<li>
						<a
							href="/learn/{lesson.slug}"
							aria-current={isCurrent ? 'page' : undefined}
							class="group flex items-start gap-2 rounded-base px-2 py-1.5 text-muted transition-colors hover:bg-surface hover:text-fg aria-[current]:bg-surface aria-[current]:text-fg"
						>
							<span
								class="mt-[0.3rem] flex size-3.5 flex-none items-center justify-center rounded-full border transition-colors {isDone
									? 'border-fg bg-fg text-bg'
									: 'border-border group-hover:border-muted'}"
								aria-hidden="true"
							>
								{#if isDone}<Check size={9} strokeWidth={3} />{/if}
							</span>
							<span class="leading-snug">{lesson.title}</span>
							{#if isDone}<span class="sr-only">(done)</span>{/if}
						</a>
					</li>
				{/each}
			</ol>
		</section>
	{/each}
</nav>
