<script lang="ts">
import { ArrowLeft, ArrowRight, Check } from '@lucide/svelte';
import { goto } from '$app/navigation';
import LessonSidebar from '$lib/components/lesson-sidebar.svelte';
import Quiz from '$lib/components/quiz.svelte';
import { stageOf } from '$lib/content/stages';
import { copyCode } from '$lib/copy-code';
import { progress } from '$lib/progress.svelte';

let { data } = $props();

const lesson = $derived(data.lesson);
const stage = $derived(stageOf(lesson.stage));
const isDone = $derived(progress.isDone(lesson.slug));

function onKeydown(event: KeyboardEvent) {
	const target = event.target;
	if (target instanceof HTMLElement && target.closest('input, textarea, button, [contenteditable]'))
		return;
	if (event.key === 'ArrowLeft' && data.prev) goto(`/learn/${data.prev.slug}`);
	if (event.key === 'ArrowRight' && data.next) goto(`/learn/${data.next.slug}`);
}
</script>

<svelte:head>
	<title>{lesson.title} · learnnix</title>
	<meta name="description" content={lesson.summary} />
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-12">
	<aside class="lg:sticky lg:top-14 lg:max-h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:py-8 lg:pr-2">
		<details class="group border-b border-border py-3 lg:hidden">
			<summary class="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
				<span>All lessons</span>
				<span class="font-mono text-xs text-muted">{lesson.order}/{data.lessons.length}</span>
			</summary>
			<div class="pt-4">
				<LessonSidebar lessons={data.lessons} current={lesson.slug} />
			</div>
		</details>
		<div class="hidden lg:block">
			<LessonSidebar lessons={data.lessons} current={lesson.slug} />
		</div>
	</aside>

	<div class="min-w-0 py-8 lg:py-10">
		<header class="mb-10">
			<p class="flex flex-wrap items-center gap-x-3 font-mono text-xs uppercase tracking-wider text-muted">
				<span>{String(stage.n).padStart(2, '0')} {stage.title}</span>
				<span aria-hidden="true">·</span>
				<span>Lesson {lesson.order}</span>
				<span aria-hidden="true">·</span>
				<span>{lesson.minutes} min</span>
			</p>
			<h1 class="mt-3 text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">{lesson.title}</h1>
			<p class="mt-3 max-w-2xl text-lg text-muted">{lesson.summary}</p>
		</header>

		{#key lesson.slug}
			<article class="prose" {@attach copyCode}>
				<!-- Trusted: rendered at build time from this repo's own markdown. -->
				{@html lesson.html}
				{#if lesson.quiz.length > 0}
					<Quiz questions={lesson.quiz} slug={lesson.slug} />
				{/if}
			</article>
		{/key}

		<footer class="mt-14 border-t border-border pt-6">
			<button
				type="button"
				onclick={() => progress.setDone(lesson.slug, !isDone)}
				aria-pressed={isDone}
				class="inline-flex items-center gap-2 rounded-base border px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] {isDone
					? 'border-fg bg-fg text-bg'
					: 'border-border hover:border-muted'}"
			>
				<Check size={16} />
				{isDone ? 'Completed' : 'Mark as complete'}
			</button>

			<nav aria-label="Lesson navigation" class="mt-8 grid gap-3 sm:grid-cols-2">
				{#if data.prev}
					<a href="/learn/{data.prev.slug}" class="group rounded-base border border-border p-4 transition-colors hover:bg-surface">
						<span class="flex items-center gap-1 font-mono text-xs text-muted"><ArrowLeft size={12} /> Previous</span>
						<span class="mt-1 block font-medium group-hover:underline group-hover:underline-offset-4">{data.prev.title}</span>
					</a>
				{:else}
					<span></span>
				{/if}
				{#if data.next}
					<a href="/learn/{data.next.slug}" class="group rounded-base border border-border p-4 text-right transition-colors hover:bg-surface">
						<span class="flex items-center justify-end gap-1 font-mono text-xs text-muted">Next <ArrowRight size={12} /></span>
						<span class="mt-1 block font-medium group-hover:underline group-hover:underline-offset-4">{data.next.title}</span>
					</a>
				{:else}
					<a href="/learn" class="group rounded-base border border-border p-4 text-right transition-colors hover:bg-surface">
						<span class="font-mono text-xs text-muted">End of the path</span>
						<span class="mt-1 block font-medium">Review the curriculum</span>
					</a>
				{/if}
			</nav>
			<p class="mt-4 hidden font-mono text-xs text-muted sm:block">Tip: ← and → move between lessons.</p>
		</footer>
	</div>
</div>
