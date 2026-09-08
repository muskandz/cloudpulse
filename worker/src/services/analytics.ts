import type { Env } from "../types";

export async function getServiceAnalytics(
	serviceId: number,
	env: Env
) {
	const service = await env.DB
		.prepare(
			`SELECT id, name, url, status
			 FROM services
			 WHERE id = ?`
		)
		.bind(serviceId)
		.first<{
			id: number;
			name: string;
			url: string;
			status: string;
		}>();

	if (!service) {
		return null;
	}

	const stats = await env.DB
		.prepare(
			`SELECT
				COUNT(*) AS total_checks,

				SUM(
					CASE
						WHEN status = 'UP' THEN 1
						ELSE 0
					END
				) AS successful_checks,

				SUM(
					CASE
						WHEN status = 'DOWN' THEN 1
						ELSE 0
					END
				) AS failed_checks,

				AVG(response_time_ms) AS average_response_time_ms,

				MIN(response_time_ms) AS fastest_response_time_ms,

				MAX(response_time_ms) AS slowest_response_time_ms

			FROM checks
			WHERE service_id = ?
			AND checked_at >= datetime('now', '-24 hours')`
		)
		.bind(serviceId)
		.first<{
			total_checks: number;
			successful_checks: number;
			failed_checks: number;
			average_response_time_ms: number | null;
			fastest_response_time_ms: number | null;
			slowest_response_time_ms: number | null;
		}>();

	const totalChecks = stats?.total_checks ?? 0;
	const successfulChecks = stats?.successful_checks ?? 0;

	const uptimePercentage =
		totalChecks > 0
			? (successfulChecks / totalChecks) * 100
			: 0;

	return {
		service: {
			id: service.id,
			name: service.name,
			url: service.url,
			status: service.status
		},

		period: "24h",

		total_checks: totalChecks,

		successful_checks: successfulChecks,

		failed_checks: stats?.failed_checks ?? 0,

		uptime_percentage: Number(
			uptimePercentage.toFixed(2)
		),

		downtime_percentage: Number(
			(100 - uptimePercentage).toFixed(2)
		),

		average_response_time_ms:
			stats?.average_response_time_ms !== null &&
			stats?.average_response_time_ms !== undefined
				? Math.round(stats.average_response_time_ms)
				: null,

		fastest_response_time_ms:
			stats?.fastest_response_time_ms ?? null,

		slowest_response_time_ms:
			stats?.slowest_response_time_ms ?? null
	};
}

export async function getServiceChecks(
	serviceId: number,
	env: Env
) {
	const service = await env.DB
		.prepare(
			`SELECT id, name, url, status
			 FROM services
			 WHERE id = ?`
		)
		.bind(serviceId)
		.first<{
			id: number;
			name: string;
			url: string;
			status: string;
		}>();

	if (!service) {
		return null;
	}

	const { results } = await env.DB
		.prepare(
			`SELECT
				id,
				status,
				status_code,
				response_time_ms,
				checked_at
			 FROM checks
			 WHERE service_id = ?
			 AND checked_at >= datetime('now', '-24 hours')
			 ORDER BY checked_at ASC`
		)
		.bind(serviceId)
		.all<{
			id: number;
			status: "UP" | "DOWN";
			status_code: number | null;
			response_time_ms: number | null;
			checked_at: string;
		}>();

	return {
		service: {
			id: service.id,
			name: service.name,
			url: service.url,
			status: service.status
		},
		period: "24h",
		checks: results
	};
}

export async function getServiceIncidents(
	serviceId: number,
	env: Env
) {
	const service = await env.DB
		.prepare(
			`SELECT id, name, url, status
			 FROM services
			 WHERE id = ?`
		)
		.bind(serviceId)
		.first<{
			id: number;
			name: string;
			url: string;
			status: string;
		}>();

	if (!service) {
		return null;
	}

	const { results } = await env.DB
		.prepare(
			`SELECT
				id,
				started_at,
				resolved_at,
				reason
			 FROM incidents
			 WHERE service_id = ?
			 ORDER BY started_at DESC`
		)
		.bind(serviceId)
		.all<{
			id: number;
			started_at: string;
			resolved_at: string | null;
			reason: string;
		}>();

	return {
		service: {
			id: service.id,
			name: service.name,
			url: service.url,
			status: service.status
		},
		incidents: results
	};
}