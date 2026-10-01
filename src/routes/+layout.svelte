<script lang="ts">
import '../app.css';
import { onMount } from 'svelte';
import SiteHeader from '$lib/components/site-header.svelte';
import { progress } from '$lib/progress.svelte';
import { theme } from '$lib/theme.svelte';

let { children, data } = $props();

onMount(() => {
	progress.load();
	theme.sync();
});
</script>

<svelte:head>
	<meta name="description" content="A structured path from your first Nix dev shell to a declarative NixOS machine." />
</svelte:head>

<a
	href="#main"
	class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-base focus:bg-fg focus:px-3 focus:py-2 focus:text-bg"
	>Skip to content</a
>
<SiteHeader total={data.lessons.length} />
<main id="main" class="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
	{@render children()}
</main>
