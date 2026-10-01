export type Quiz = { q: string; options: string[]; answer: number; why: string };

export type LessonMeta = {
	slug: string;
	title: string;
	stage: number;
	order: number;
	summary: string;
	minutes: number;
};

export type Lesson = LessonMeta & { html: string; quiz: Quiz[] };

export type ReferenceMeta = { slug: string; title: string; order: number; summary: string };

export type Reference = ReferenceMeta & { html: string };
