<script lang="ts">
import { ArrowRight } from '@lucide/svelte';
import { STAGES } from '$lib/content/stages';
import { progress } from '$lib/progress.svelte';

let { data } = $props();

const total = $derived(data.lessons.length);
const done = $derived(progress.completed.length);
const next = $derived(data.lessons.find((l) => !progress.isDone(l.slug)) ?? data.lessons[0]);
const hasStarted = $derived(done > 0);
</script>

<svelte:head>
	<title>learnnix · Master Nix, one lesson at a time</title>
</svelte:head>

<section class="grid gap-10 border-b border-border py-16 sm:py-24 lg:grid-cols-[1.4fr_1fr]">
	<div>
		<p class="font-mono text-xs uppercase tracking-wider text-muted">
			{total} lessons · {STAGES.length} stages · every snippet verified on Nix 2.35
		</p>
		<h1 class="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
			Master Nix,<br />one lesson at a time.
		</h1>
		<p class="mt-6 max-w-xl text-lg text-muted">
			A structured path from your first dev shell to a declarative desktop and a deployed VPS. Built for
			a working TypeScript engineer on Arch, not for a research group.
		</p>
		<div class="mt-8 flex flex-wrap items-center gap-4">
			{#if next}
				<a
					href="/learn/{next.slug}"
					class="inline-flex items-center gap-2 rounded-base bg-fg px-4 py-2.5 text-sm font-medium text-bg transition-transform active:scale-[0.98]"
				>
					{hasStarted ? 'Continue' : 'Start'}: {next.title}
					<ArrowRight size={16} />
				</a>
			{/if}
			<a href="/learn" class="text-sm text-muted underline underline-offset-4 hover:text-fg">
				See the whole path
			</a>
		</div>
	</div>
	<div class="self-end border-l border-border pl-6 font-mono text-sm">
		{#if progress.isLoaded}
			<p class="text-muted">progress</p>
			<p class="mt-1 text-4xl font-medium tracking-tight">{Math.round(total ? (done / total) * 100 : 0)}<span class="text-muted">%</span></p>
			<p class="mt-1 text-muted">
				{#if hasStarted}{done} of {total} lessons done{:else}Nothing completed yet. Lesson one takes ten minutes.{/if}
			</p>
		{:else}
			<p class="text-muted">progress</p>
			<p class="mt-1 h-10 w-24 animate-pulse rounded-base bg-surface" aria-hidden="true"></p>
		{/if}
	</div>
</section>

<section class="py-12" aria-labelledby="stages">
	<h2 id="stages" class="font-mono text-xs uppercase tracking-wider text-muted">The path</h2>
	<ol class="mt-4 divide-y divide-border border-y border-border">
		{#each STAGES as stage (stage.n)}
			{@const items = data.lessons.filter((l) => l.stage === stage.n)}
			{@const stageDone = items.filter((l) => progress.isDone(l.slug)).length}
			{@const first = items[0]}
			<li>
				<a
					href={first ? `/learn/${first.slug}` : '/learn'}
					class="group grid gap-2 py-5 transition-colors hover:bg-surface sm:grid-cols-[3rem_1fr_auto] sm:items-baseline sm:gap-6 sm:px-3"
				>
					<span class="font-mono text-sm text-muted">{String(stage.n).padStart(2, '0')}</span>
					<span>
						<span class="block text-lg font-medium tracking-tight">{stage.title}</span>
						<span class="mt-0.5 block text-sm text-muted">{stage.blurb}</span>
					</span>
					<span class="font-mono text-xs text-muted">
						{#if progress.isLoaded && stageDone > 0}{stageDone}/{items.length} done{:else}{items.length} lessons{/if}
					</span>
				</a>
			</li>
		{/each}
	</ol>
</section>

<section class="py-12" aria-labelledby="reference">
	<h2 id="reference" class="font-mono text-xs uppercase tracking-wider text-muted">Reference</h2>
	<ul class="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.references as ref (ref.slug)}
			<li>
				<a href="/reference/{ref.slug}" class="group block border-t border-border py-3">
					<span class="font-medium group-hover:underline group-hover:underline-offset-4">{ref.title}</span>
					<span class="mt-0.5 block text-sm text-muted">{ref.summary}</span>
				</a>
			</li>
		{/each}
	</ul>
</section>
