import { checkService } from "../services/monitor";
import {
	getServiceAnalytics,
	getServiceChecks,
	getServiceIncidents
} from "../services/analytics";
import { validateServiceUrl } from "../utils";
import { isAuthenticated } from "../auth";
import type { Env } from "../types";

export async function handleServicesRoute(
	request: Request,
	env: Env
): Promise<Response | null> {
	const url = new URL(request.url);

	// -----------------------------------------
	// GET /api/services
	// -----------------------------------------
	if (
		url.pathname === "/api/services" &&
		request.method === "GET"
	) {
		try {
			const result = await env.DB.prepare(
				`SELECT
					id,
					name,
					url,
					status,
					created_at
				FROM services
				ORDER BY created_at DESC`
			).all();

			return Response.json({
				services: result.results
			});
		} catch (error) {
			console.error(
				"Failed to fetch services:",
				error
			);

			return Response.json(
				{ error: "Unable to fetch services" },
				{ status: 500 }
			);
		}
	}

	// -----------------------------------------
	// POST /api/services
	// Create a new service
	// -----------------------------------------
	if (
		url.pathname === "/api/services" &&
		request.method === "POST"
	) {
		if (!isAuthenticated(request, env)) {
			return Response.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		try {
			const body = await request.json<{
				name: string;
				url: string;
			}>();

			const name = body.name?.trim();
			const serviceUrl = body.url?.trim();

			if (!name || !serviceUrl) {
				return Response.json(
					{
						error: "Name and URL are required"
					},
					{ status: 400 }
				);
			}

			// -----------------------------------------
			// SSRF protection
			// -----------------------------------------
			const urlValidation =
				validateServiceUrl(serviceUrl);

			if (!urlValidation.valid) {
				return Response.json(
					{
						error: urlValidation.error
					},
					{ status: 400 }
				);
			}

			const result = await env.DB.prepare(
				`INSERT INTO services (name, url)
				 VALUES (?, ?)
				 RETURNING id, name, url, status, created_at`
			)
				.bind(name, serviceUrl)
				.first();

			return Response.json(
				{
					message: "Service created successfully",
					service: result
				},
				{ status: 201 }
			);
		} catch (error) {
	console.error("Failed to create service:", error);

	if (
		error instanceof Error &&
		error.message.includes("UNIQUE constraint failed: services.url")
	) {
		return Response.json(
			{
				error: "A service with this URL already exists"
			},
			{ status: 409 }
		);
	}

	return Response.json(
		{ error: "Unable to create service" },
		{ status: 500 }
	);
}
	}

	// -----------------------------------------
	// Routes containing service ID
	// -----------------------------------------
	const serviceMatch = url.pathname.match(
		/^\/api\/services\/(\d+)(?:\/(check|analytics|checks|incidents))?$/
	);

	if (!serviceMatch) {
		return null;
	}

	const serviceId = Number(serviceMatch[1]);
	const action = serviceMatch[2];

	// -----------------------------------------
	// POST /api/services/:id/check
	// Manual health check
	// -----------------------------------------
	if (
		action === "check" &&
		request.method === "POST"
	) {
		if (!isAuthenticated(request, env)) {
			return Response.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		try {
			const result = await checkService(
				serviceId,
				env
			);

			return Response.json({
				message: "Health check completed",
				result
			});
		} catch (error) {
			console.error(
				"Manual health check failed:",
				error
			);

			return Response.json(
				{
					error: "Unable to perform health check"
				},
				{ status: 500 }
			);
		}
	}

	// -----------------------------------------
	// GET /api/services/:id/analytics
	// -----------------------------------------
	if (
		action === "analytics" &&
		request.method === "GET"
	) {
		try {
			const result =
				await getServiceAnalytics(
					serviceId,
					env
				);

			return Response.json(result);
		} catch (error) {
			console.error(
				"Failed to fetch analytics:",
				error
			);

			return Response.json(
				{
					error: "Unable to fetch analytics"
				},
				{ status: 500 }
			);
		}
	}

	// -----------------------------------------
	// GET /api/services/:id/checks
	// -----------------------------------------
	if (
		action === "checks" &&
		request.method === "GET"
	) {
		try {
			const result =
				await getServiceChecks(
					serviceId,
					env
				);

			return Response.json(result);
		} catch (error) {
			console.error(
				"Failed to fetch checks:",
				error
			);

			return Response.json(
				{
					error: "Unable to fetch check history"
				},
				{ status: 500 }
			);
		}
	}

	// -----------------------------------------
	// GET /api/services/:id/incidents
	// -----------------------------------------
	if (
		action === "incidents" &&
		request.method === "GET"
	) {
		try {
			const result =
				await getServiceIncidents(
					serviceId,
					env
				);

			return Response.json(result);
		} catch (error) {
			console.error(
				"Failed to fetch incidents:",
				error
			);

			return Response.json(
				{
					error: "Unable to fetch incidents"
				},
				{ status: 500 }
			);
		}
	}
    // DELETE /api/services/:id
if (
	!action &&
	request.method === "DELETE"
) {
	if (!isAuthenticated(request, env)) {
		return Response.json(
			{ error: "Unauthorized" },
			{ status: 401 }
		);
	}

	try {
		const existingService = await env.DB.prepare(
			`SELECT id
			 FROM services
			 WHERE id = ?`
		)
			.bind(serviceId)
			.first();

		if (!existingService) {
			return Response.json(
				{
					error: "Service not found"
				},
				{ status: 404 }
			);
		}

		await env.DB.batch([
			env.DB.prepare(
				`DELETE FROM incidents
				 WHERE service_id = ?`
			).bind(serviceId),

			env.DB.prepare(
				`DELETE FROM checks
				 WHERE service_id = ?`
			).bind(serviceId),

			env.DB.prepare(
				`DELETE FROM services
				 WHERE id = ?`
			).bind(serviceId)
		]);

		return Response.json({
			message: "Service deleted successfully"
		});
	} catch (error) {
		console.error(
			"Failed to delete service:",
			error
		);

		return Response.json(
			{
				error: "Unable to delete service"
			},
			{ status: 500 }
		);
	}
}
	// -----------------------------------------
	// PUT /api/services/:id
	// Update service
	// -----------------------------------------
	if (
		!action &&
		request.method === "PUT"
	) {
		if (!isAuthenticated(request, env)) {
			return Response.json(
				{ error: "Unauthorized" },
				{ status: 401 }
			);
		}

		try {
			const body = await request.json<{
				name?: string;
				url?: string;
			}>();

			const existingService =
				await env.DB.prepare(
					`SELECT
						id,
						name,
						url,
						status,
						created_at
					FROM services
					WHERE id = ?`
				)
					.bind(serviceId)
					.first();

			if (!existingService) {
				return Response.json(
					{
						error: "Service not found"
					},
					{ status: 404 }
				);
			}

			const newName =
				body.name !== undefined
					? body.name.trim()
					: String(existingService.name);

			const newUrl =
				body.url !== undefined
					? body.url.trim()
					: String(existingService.url);

			if (!newName || !newUrl) {
				return Response.json(
					{
						error:
							"Name and URL cannot be empty"
					},
					{ status: 400 }
				);
			}

			// -----------------------------------------
			// SSRF protection for updated URL
			// -----------------------------------------
			const urlValidation =
				validateServiceUrl(newUrl);

			if (!urlValidation.valid) {
				return Response.json(
					{
						error: urlValidation.error
					},
					{ status: 400 }
				);
			}

			await env.DB.prepare(
				`UPDATE services
				 SET name = ?, url = ?
				 WHERE id = ?`
			)
				.bind(
					newName,
					newUrl,
					serviceId
				)
				.run();

			const updatedService =
				await env.DB.prepare(
					`SELECT
						id,
						name,
						url,
						status,
						created_at
					FROM services
					WHERE id = ?`
				)
					.bind(serviceId)
					.first();

			return Response.json({
				message:
					"Service updated successfully",
				service: updatedService
			});
		} catch (error) {
			console.error(
				"Failed to update service:",
				error
			);

			return Response.json(
				{
					error: "Unable to update service"
				},
				{ status: 500 }
			);
		}
	}

	return null;
}