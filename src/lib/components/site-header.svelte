<script lang="ts">
import { Moon, Sun } from '@lucide/svelte';
import { page } from '$app/state';
import { progress } from '$lib/progress.svelte';
import { theme } from '$lib/theme.svelte';

let { total }: { total: number } = $props();

const done = $derived(progress.completed.length);
const isActive = (path: string) => page.url.pathname.startsWith(path);
</script>

<header class="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
		<a href="/" class="font-semibold tracking-tight">
			learn<span class="text-muted">nix</span>
		</a>
		<nav aria-label="Primary" class="flex items-center gap-1 text-sm">
			<a
				href="/learn"
				aria-current={isActive('/learn') ? 'page' : undefined}
				class="rounded-base px-2.5 py-1.5 text-muted transition-colors hover:text-fg aria-[current]:text-fg"
				>Learn</a
			>
			<a
				href="/reference"
				aria-current={isActive('/reference') ? 'page' : undefined}
				class="rounded-base px-2.5 py-1.5 text-muted transition-colors hover:text-fg aria-[current]:text-fg"
				>Reference</a
			>
		</nav>
		<div class="ml-auto flex items-center gap-3">
			{#if progress.isLoaded}
				<a
					href="/learn"
					class="hidden items-center gap-2 font-mono text-xs text-muted sm:flex"
					aria-label="{done} of {total} lessons complete"
				>
					<span
						class="block h-1.5 w-20 overflow-hidden rounded-full bg-surface"
						role="progressbar"
						aria-valuenow={done}
						aria-valuemin="0"
						aria-valuemax={total}
					>
						<span
							class="block h-full rounded-full bg-fg transition-[width] duration-300"
							style:width="{total ? (done / total) * 100 : 0}%"
						></span>
					</span>
					{done}/{total}
				</a>
			{/if}
			<button
				type="button"
				onclick={() => theme.toggle()}
				class="rounded-base border border-border p-1.5 text-muted transition-colors hover:text-fg active:scale-95"
				aria-label={theme.isDark ? 'Switch to light theme' : 'Switch to dark theme'}
			>
				{#if theme.isDark}
					<Sun size={16} />
				{:else}
					<Moon size={16} />
				{/if}
			</button>
		</div>
	</div>
</header>
