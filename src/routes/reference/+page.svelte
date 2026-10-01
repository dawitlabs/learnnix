<script lang="ts">
let { data } = $props();
</script>

<svelte:head><title>Reference · learnnix</title></svelte:head>

<header class="py-10 sm:py-14">
	<p class="font-mono text-xs uppercase tracking-wider text-muted">Reference</p>
	<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Look it up</h1>
	<p class="mt-3 max-w-xl text-muted">Cheatsheets and tables to keep open while you work. Read the lessons to understand them.</p>
</header>

<ul class="divide-y divide-border border-y border-border">
	{#each data.references as ref (ref.slug)}
		<li>
			<a href="/reference/{ref.slug}" class="group grid gap-1 py-5 transition-colors hover:bg-surface sm:grid-cols-[14rem_1fr] sm:gap-6 sm:px-3">
				<span class="text-lg font-medium tracking-tight group-hover:underline group-hover:underline-offset-4">{ref.title}</span>
				<span class="text-sm text-muted sm:pt-1">{ref.summary}</span>
			</a>
		</li>
	{/each}
</ul>
