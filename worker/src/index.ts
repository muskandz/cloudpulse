import { handleServicesRoute } from "./routes/services";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, X-API-Key"
};
import { checkService } from "./services/monitor";
import type { Env } from "./types";

function withCors(response: Response): Response {
	const headers = new Headers(response.headers);

	for (const [key, value] of Object.entries(corsHeaders)) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders
			});
		}
		// GET /
		if (url.pathname === "/" && request.method === "GET") {
			return withCors(
				Response.json({
					message: "CloudPulse API is online",
					version: "1.0.0"
				})
			);
		}

		// GET /api/health
		if (url.pathname === "/api/health" && request.method === "GET") {
			try {
				await env.DB.prepare("SELECT 1").first();

				return withCors(
					Response.json({
						status: "healthy",
						database: "connected"
					})
				);
			} catch (error) {
				console.error("Health check failed:", error);

				return withCors(
					Response.json(
						{
							status: "unhealthy",
							database: "disconnected"
						},
						{ status: 500 }
					)
				);
			}
		}

		// Service API routes
		const serviceResponse = await handleServicesRoute(
			request,
			env
		);

		if (serviceResponse) {
			return withCors(serviceResponse);
		}

		return withCors(
			Response.json(
				{
					error: "Route not found"
				},
				{ status: 404 }
			)
		);
	},

	async scheduled(
		event: ScheduledEvent,
		env: Env,
		ctx: ExecutionContext
	): Promise<void> {
		console.log(
			"CloudPulse scheduled health check started"
		);

		try {
			const result = await env.DB.prepare(
				`SELECT id
				 FROM services
				 ORDER BY id`
			).all<{ id: number }>();

			const services = result.results;

			console.log(
				`Found ${services.length} services to check`
			);

			await Promise.all(
				services.map((service) =>
					checkService(service.id, env)
				)
			);

			console.log(
				"CloudPulse scheduled health check completed"
			);
		} catch (error) {
			console.error(
				"Scheduled health check failed:",
				error
			);
		}
	}
};