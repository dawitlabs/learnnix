<script lang="ts">
import { Check, X } from '@lucide/svelte';
import type { Quiz } from '$lib/content/types';
import { progress } from '$lib/progress.svelte';

let { questions, slug }: { questions: Quiz[]; slug: string } = $props();

let picks = $state<Record<number, number>>({});

const answered = $derived(Object.keys(picks).length);
const score = $derived(questions.filter((q, i) => picks[i] === q.answer).length);
const isFinished = $derived(answered === questions.length && questions.length > 0);

$effect(() => {
	if (isFinished) progress.setQuiz(slug, score);
});

function pick(qi: number, oi: number) {
	if (picks[qi] !== undefined) return;
	picks = { ...picks, [qi]: oi };
}

function retry() {
	picks = {};
}
</script>

<div class="not-prose mt-6 space-y-6">
	{#each questions as question, qi (question.q)}
		{@const picked = picks[qi]}
		<fieldset class="border-0 p-0">
			<legend class="mb-3 font-medium leading-snug">
				<span class="mr-2 font-mono text-xs text-muted">{qi + 1}/{questions.length}</span>{question.q}
			</legend>
			<div class="grid gap-2">
				{#each question.options as option, oi (option)}
					{@const isPicked = picked === oi}
					{@const isCorrect = question.answer === oi}
					{@const isRevealed = picked !== undefined}
					<button
						type="button"
						disabled={isRevealed}
						onclick={() => pick(qi, oi)}
						aria-pressed={isPicked}
						class="flex items-start gap-3 rounded-base border px-3 py-2.5 text-left text-sm leading-snug transition-colors
							{isRevealed && isCorrect ? 'border-ok' : ''}
							{isRevealed && isPicked && !isCorrect ? 'border-bad' : ''}
							{!isRevealed ? 'border-border hover:border-muted hover:bg-surface active:scale-[0.995]' : 'border-border'}
							disabled:cursor-default"
					>
						<span class="mt-px flex size-4 flex-none items-center justify-center font-mono text-[0.6875rem] text-muted">
							{#if isRevealed && isCorrect}
								<Check size={14} class="text-ok" aria-label="Correct" />
							{:else if isRevealed && isPicked}
								<X size={14} class="text-bad" aria-label="Wrong" />
							{:else}
								{String.fromCharCode(65 + oi)}
							{/if}
						</span>
						<span>{option}</span>
					</button>
				{/each}
			</div>
			{#if picked !== undefined}
				<p class="mt-2 text-sm text-muted" role="status">
					<span class="font-medium {picked === question.answer ? 'text-ok' : 'text-bad'}"
						>{picked === question.answer ? 'Right.' : 'Not quite.'}</span
					>
					{question.why}
				</p>
			{/if}
		</fieldset>
	{/each}

	{#if isFinished}
		<div class="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm">
			<span class="font-mono">{score}/{questions.length} correct</span>
			<button type="button" onclick={retry} class="text-muted underline underline-offset-4 hover:text-fg">
				Retry
			</button>
		</div>
	{/if}
</div>
