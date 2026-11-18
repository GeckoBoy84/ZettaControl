const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

export function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${UNITS[unit]}`;
}

/** A limit of 0 means unlimited on every supported panel. */
export function formatLimit(usedBytes: number, limitMib: number): string {
	const used = formatBytes(usedBytes);
	return limitMib > 0 ? `${used} / ${formatBytes(limitMib * 1024 * 1024)}` : `${used} / Unlimited`;
}

export function formatCpu(percent: number, limitPercent: number): string {
	return limitPercent > 0 ? `${percent.toFixed(1)}% / ${limitPercent}%` : `${percent.toFixed(1)}%`;
}

export function formatUptime(ms: number): string {
	if (ms <= 0) return '-';
	const seconds = Math.floor(ms / 1000);
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m ${seconds % 60}s`;
}

export function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
