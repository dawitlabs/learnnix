const KEY = 'learnnix:progress';

type Stored = { completed: string[]; quiz: Record<string, number> };

function isStored(value: unknown): value is Stored {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>; // narrowed to object above; checking fields next
	return Array.isArray(v.completed) && typeof v.quiz === 'object' && v.quiz !== null;
}

class Progress {
	completed = $state<string[]>([]);
	quiz = $state<Record<string, number>>({});
	isLoaded = $state(false);

	load(): void {
		// localStorage can throw in private windows or when blocked; the site must still render.
		try {
			const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
			if (isStored(parsed)) {
				this.completed = parsed.completed;
				this.quiz = parsed.quiz;
			}
		} catch {
			this.completed = [];
			this.quiz = {};
		}
		this.isLoaded = true;
	}

	private save(): void {
		try {
			localStorage.setItem(KEY, JSON.stringify({ completed: this.completed, quiz: this.quiz }));
		} catch {
			// nothing to do: storage unavailable, state stays in memory for this page
		}
	}

	isDone(slug: string): boolean {
		return this.completed.includes(slug);
	}

	setDone(slug: string, done: boolean): void {
		this.completed = done
			? [...new Set([...this.completed, slug])]
			: this.completed.filter((s) => s !== slug);
		this.save();
	}

	setQuiz(slug: string, score: number): void {
		this.quiz = { ...this.quiz, [slug]: score };
		this.save();
	}

	reset(): void {
		this.completed = [];
		this.quiz = {};
		this.save();
	}
}

export const progress = new Progress();
