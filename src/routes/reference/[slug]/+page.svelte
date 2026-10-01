<script lang="ts">
import { copyCode } from '$lib/copy-code';

let { data } = $props();
</script>

<svelte:head>
	<title>{data.reference.title} · learnnix</title>
	<meta name="description" content={data.reference.summary} />
</svelte:head>

<div class="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-12">
	<aside class="py-8 lg:sticky lg:top-14 lg:self-start">
		<nav aria-label="Reference pages" class="flex gap-1 overflow-x-auto text-sm lg:flex-col">
			{#each data.references as ref (ref.slug)}
				<a
					href="/reference/{ref.slug}"
					aria-current={ref.slug === data.reference.slug ? 'page' : undefined}
					class="whitespace-nowrap rounded-base px-2 py-1.5 text-muted transition-colors hover:bg-surface hover:text-fg aria-[current]:bg-surface aria-[current]:text-fg"
					>{ref.title}</a
				>
			{/each}
		</nav>
	</aside>
	<div class="min-w-0 py-8 lg:py-10">
		<header class="mb-10">
			<p class="font-mono text-xs uppercase tracking-wider text-muted">Reference</p>
			<h1 class="mt-3 text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl">{data.reference.title}</h1>
			<p class="mt-3 max-w-2xl text-lg text-muted">{data.reference.summary}</p>
		</header>
		{#key data.reference.slug}
			<article class="prose max-w-none" {@attach copyCode}>
				<!-- Trusted: rendered at build time from this repo's own markdown. -->
				{@html data.reference.html}
			</article>
		{/key}
	</div>
</div>
