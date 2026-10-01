<script lang="ts">
import { Check } from '@lucide/svelte';
import { STAGES } from '$lib/content/stages';
import { progress } from '$lib/progress.svelte';

let { data } = $props();

let isConfirmingReset = $state(false);

function reset() {
	progress.reset();
	isConfirmingReset = false;
}
</script>

<svelte:head><title>The path · learnnix</title></svelte:head>

<header class="flex flex-wrap items-end justify-between gap-4 py-10 sm:py-14">
	<div>
		<p class="font-mono text-xs uppercase tracking-wider text-muted">Curriculum</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">The whole path</h1>
	</div>
	{#if progress.isLoaded && progress.completed.length > 0}
		<div class="font-mono text-xs text-muted">
			{#if isConfirmingReset}
				<span>Clear all progress?</span>
				<button type="button" onclick={reset} class="ml-2 text-bad underline underline-offset-4">Yes, clear</button>
				<button type="button" onclick={() => (isConfirmingReset = false)} class="ml-2 underline underline-offset-4">Keep</button>
			{:else}
				<button type="button" onclick={() => (isConfirmingReset = true)} class="underline underline-offset-4 hover:text-fg">
					Reset progress
				</button>
			{/if}
		</div>
	{/if}
</header>

{#each STAGES as stage (stage.n)}
	{@const items = data.lessons.filter((l) => l.stage === stage.n)}
	<section class="grid gap-4 border-t border-border py-8 lg:grid-cols-[16rem_1fr] lg:gap-12" aria-labelledby="stage-{stage.n}">
		<div>
			<p class="font-mono text-sm text-muted">{String(stage.n).padStart(2, '0')}</p>
			<h2 id="stage-{stage.n}" class="mt-1 text-xl font-medium tracking-tight">{stage.title}</h2>
			<p class="mt-1 text-sm text-muted">{stage.blurb}</p>
		</div>
		<ol class="divide-y divide-border">
			{#each items as lesson (lesson.slug)}
				{@const isDone = progress.isDone(lesson.slug)}
				{@const quizScore = progress.quiz[lesson.slug]}
				<li>
					<a
						href="/learn/{lesson.slug}"
						class="group flex items-start gap-4 py-3 transition-colors hover:bg-surface sm:px-2"
					>
						<span
							class="mt-1 flex size-4 flex-none items-center justify-center rounded-full border {isDone
								? 'border-fg bg-fg text-bg'
								: 'border-border'}"
							aria-hidden="true">{#if isDone}<Check size={10} strokeWidth={3} />{/if}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block font-medium leading-snug group-hover:underline group-hover:underline-offset-4">
								{lesson.title}
							</span>
							<span class="mt-0.5 block text-sm text-muted">{lesson.summary}</span>
						</span>
						<span class="flex-none font-mono text-xs text-muted">
							{#if quizScore !== undefined}<span class="mr-3">quiz {quizScore}/3</span>{/if}{lesson.minutes} min
						</span>
						{#if isDone}<span class="sr-only">(done)</span>{/if}
					</a>
				</li>
			{/each}
		</ol>
	</section>
{/each}
