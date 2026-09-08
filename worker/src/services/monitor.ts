import type { Env, Service, HealthCheckResult } from "../types";

export async function checkService(
	serviceId: number,
	env: Env
): Promise<{
	status: number;
	body: Record<string, unknown>;
}> {

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
		return {
			status: 404,
			body: {
				error: "Service not found"
			}
		};
	}

	const controller = new AbortController();

	const timeout = setTimeout(() => {
		controller.abort();
	}, 10000);

	const startTime = Date.now();

	try {
		const response = await fetch(service.url, {
			method: "GET",
			signal: controller.signal
		});

		const responseTime = Date.now() - startTime;

		clearTimeout(timeout);

		const status = response.ok ? "UP" : "DOWN";

		await env.DB
			.prepare(
				`INSERT INTO checks
         (service_id, status, status_code, response_time_ms)
         VALUES (?, ?, ?, ?)`
			)
			.bind(
				service.id,
				status,
				response.status,
				responseTime
			)
			.run();

		await env.DB
			.prepare(
				`UPDATE services
         SET status = ?
         WHERE id = ?`
			)
			.bind(status, service.id)
			.run();

		if (status === "DOWN") {

			const existingIncident = await env.DB
				.prepare(
					`SELECT id
           FROM incidents
           WHERE service_id = ?
           AND resolved_at IS NULL
           LIMIT 1`
				)
				.bind(service.id)
				.first<{ id: number }>();

			if (!existingIncident) {

				await env.DB
					.prepare(
						`INSERT INTO incidents
             (service_id, reason)
             VALUES (?, ?)`
					)
					.bind(
						service.id,
						`HTTP ${response.status}`
					)
					.run();
			}

		} else {

			await env.DB
    .prepare(
        `UPDATE incidents
         SET resolved_at = CURRENT_TIMESTAMP
         WHERE service_id = ?
         AND resolved_at IS NULL`
    )
    .bind(service.id)
    .run();
		}

		return {
			status: 200,
			body: {
				service_id: service.id,
				service_name: service.name,
				status,
				status_code: response.status,
				response_time_ms: responseTime
			}
		};

	} 	 catch (error) {

		clearTimeout(timeout);

		const responseTime = Date.now() - startTime;

		let reason = "Unable to reach service";

		if (error instanceof Error) {
			console.error(
				"Health check failed:",
				error.name,
				error.message
			);

			if (error.name === "AbortError") {
				reason = "Request timed out after 10 seconds";
			} else {
				reason = `${error.name}: ${error.message}`;
			}
		} else {
			console.error("Health check failed:", error);
		}

		console.log("Saving failed health check...");

		await env.DB
			.prepare(
				`INSERT INTO checks
         (service_id, status, status_code, response_time_ms)
         VALUES (?, ?, ?, ?)`
			)
			.bind(
				service.id,
				"DOWN",
				null,
				responseTime
			)
			.run();

		console.log("Failed health check saved.");

		await env.DB
			.prepare(
				`UPDATE services
         SET status = ?
         WHERE id = ?`
			)
			.bind(
				"DOWN",
				service.id
			)
			.run();

		console.log("Service status updated.");

		const existingIncident = await env.DB
			.prepare(
				`SELECT id
         FROM incidents
         WHERE service_id = ?
         AND resolved_at IS NULL
         LIMIT 1`
			)
			.bind(service.id)
			.first<{ id: number }>();

		console.log(
			"Existing incident:",
			existingIncident
		);

		if (!existingIncident) {

			await env.DB
				.prepare(
					`INSERT INTO incidents
           (service_id, reason)
           VALUES (?, ?)`
				)
				.bind(
					service.id,
					reason
				)
				.run();

			console.log("New incident created.");
		}

		return {
			status: 503,
			body: {
				service_id: service.id,
				service_name: service.name,
				status: "DOWN",
				status_code: null,
				response_time_ms: responseTime,
				error: reason
			}
		};
	}
}