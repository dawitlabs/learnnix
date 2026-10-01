const KEY = 'learnnix:theme';

class Theme {
	isDark = $state(false);

	sync(): void {
		this.isDark = document.documentElement.classList.contains('dark');
	}

	toggle(): void {
		this.isDark = !this.isDark;
		document.documentElement.classList.toggle('dark', this.isDark);
		try {
			localStorage.setItem(KEY, this.isDark ? 'dark' : 'light');
		} catch {
			// storage unavailable: theme still applies for this page
		}
	}
}

export const theme = new Theme();
