<script lang="ts">
import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · learnnix</title></svelte:head>

<section class="py-24">
	<p class="font-mono text-sm text-muted">{page.status}</p>
	<h1 class="mt-2 text-3xl font-semibold tracking-tight">
		{page.status === 404 ? 'That page is not in the store.' : 'Something broke.'}
	</h1>
	<p class="mt-3 text-muted">{page.error?.message}</p>
	<a href="/learn" class="mt-8 inline-block underline underline-offset-4">Back to the curriculum</a>
</section>
