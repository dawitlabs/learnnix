import { error } from '@sveltejs/kit';
import { getReference, references } from '$lib/content/load.server';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => references.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
	const reference = getReference(params.slug);
	if (!reference) error(404, 'No reference page with that slug.');
	return { reference };
};
