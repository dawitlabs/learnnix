import { lessons, references } from '$lib/content/load.server';

export function load() {
	return { lessons, references };
}
