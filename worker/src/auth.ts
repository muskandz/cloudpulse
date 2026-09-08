import type { Env } from "./types";

export function isAuthenticated(
	request: Request,
	env: Env
): boolean {
	const apiKey = request.headers.get("X-API-Key");

	if (!apiKey) {
		return false;
	}

	return apiKey === env.CLOUDPULSE_API_KEY;
}