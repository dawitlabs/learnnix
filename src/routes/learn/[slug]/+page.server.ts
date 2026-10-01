import { error } from '@sveltejs/kit';
import { getLesson, lessons } from '$lib/content/load.server';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => lessons.map(({ slug }) => ({ slug }));

export const load: PageServerLoad = ({ params }) => {
	const lesson = getLesson(params.slug);
	if (!lesson) error(404, 'No lesson with that slug.');
	const index = lessons.findIndex((l) => l.slug === lesson.slug);
	return { lesson, prev: lessons[index - 1], next: lessons[index + 1] };
};
