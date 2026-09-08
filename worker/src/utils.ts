export function validateServiceUrl(
	serviceUrl: string
): {
	valid: boolean;
	error?: string;
} {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(serviceUrl);
	} catch {
		return {
			valid: false,
			error: "Invalid URL"
		};
	}

	if (
		parsedUrl.protocol !== "http:" &&
		parsedUrl.protocol !== "https:"
	) {
		return {
			valid: false,
			error: "Only HTTP and HTTPS URLs are allowed"
		};
	}

	const hostname = parsedUrl.hostname.toLowerCase();

	if (
		hostname === "localhost" ||
		hostname === "localhost.localdomain"
	) {
		return {
			valid: false,
			error: "Localhost URLs are not allowed"
		};
	}

	if (isPrivateIPv4(hostname)) {
		return {
			valid: false,
			error: "Private or internal IP addresses are not allowed"
		};
	}

	if (
		hostname === "::1" ||
		hostname.startsWith("fc") ||
		hostname.startsWith("fd") ||
		hostname.startsWith("fe80")
	) {
		return {
			valid: false,
			error: "Private or internal IPv6 addresses are not allowed"
		};
	}

	return {
		valid: true
	};
}

function isPrivateIPv4(hostname: string): boolean {
	const parts = hostname.split(".");

	if (
		parts.length !== 4 ||
		parts.some((part) => !/^\d+$/.test(part))
	) {
		return false;
	}

	const numbers = parts.map(Number);

	if (
		numbers.some(
			(number) => number < 0 || number > 255
		)
	) {
		return false;
	}

	const [a, b] = numbers;

	// 10.0.0.0/8
	if (a === 10) {
		return true;
	}

	// 172.16.0.0/12
	if (a === 172 && b >= 16 && b <= 31) {
		return true;
	}

	// 192.168.0.0/16
	if (a === 192 && b === 168) {
		return true;
	}

	// 127.0.0.0/8
	if (a === 127) {
		return true;
	}

	// 169.254.0.0/16
	if (a === 169 && b === 254) {
		return true;
	}

	// 0.0.0.0/8
	if (a === 0) {
		return true;
	}

	return false;
}