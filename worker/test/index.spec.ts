import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";

import {
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import worker from "../src/index";
import { checkService } from "../src/services/monitor";

const IncomingRequest =
	Request<unknown, IncomingRequestCfProperties>;


/* =========================
   Test Helpers
   ========================= */

async function executeWorker(
	request: Request
) {
	const ctx =
		createExecutionContext();

	const response =
		await worker.fetch(
			request,
			env,
			ctx
		);

	await waitOnExecutionContext(ctx);

	return response;
}

async function createTestService(
	name: string,
	url: string
) {
	const result =
		await env.DB
			.prepare(
				`INSERT INTO services
				 (name, url, status)
				 VALUES (?, ?, 'UNKNOWN')`
			)
			.bind(
				name,
				url
			)
			.run();

	return Number(
		result.meta.last_row_id
	);
}

async function getService(
	serviceId: number
) {
	return await env.DB
		.prepare(
			`SELECT
				id,
				name,
				url,
				status
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
}


/* =========================
   Tests
   ========================= */

describe("CloudPulse API", () => {

	beforeEach(async () => {
		await env.DB
			.prepare(
				`DELETE FROM incidents`
			)
			.run();

		await env.DB
			.prepare(
				`DELETE FROM checks`
			)
			.run();

		await env.DB
			.prepare(
				`DELETE FROM services`
			)
			.run();

		vi.restoreAllMocks();
	});


	it("returns the API status from the root endpoint", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/"
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(200);

		const data =
			await response.json();

		expect(data).toEqual({
			message:
				"CloudPulse API is online",
			version: "1.0.0",
		});
	});


	it("returns a healthy database status", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/health"
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(200);

		const data =
			await response.json();

		expect(
			data.status
		).toBe("healthy");

		expect(
			data.database
		).toBe("connected");
	});


	it("allows reading the service list without authentication", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/services"
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(200);

		const data =
			await response.json();

		expect(
			Array.isArray(
				data.services
			)
		).toBe(true);
	});


	it("rejects service creation without an API key", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/services",
				{
					method: "POST",

					headers: {
						"Content-Type":
							"application/json",
					},

					body: JSON.stringify({
						name:
							"Test Service",

						url:
							"https://example.com",
					}),
				}
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(401);

		const data =
			await response.json();

		expect(
			data.error
		).toBe("Unauthorized");
	});


	it("rejects service deletion without an API key", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/services/1",
				{
					method: "DELETE",
				}
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(401);

		const data =
			await response.json();

		expect(
			data.error
		).toBe("Unauthorized");
	});


	it("rejects an invalid API key", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/services",
				{
					method: "POST",

					headers: {
						"Content-Type":
							"application/json",

						"X-API-Key":
							"definitely-wrong-key",
					},

					body: JSON.stringify({
						name:
							"Test Service",

						url:
							"https://example.com",
					}),
				}
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(401);
	});


	it("returns 404 for an unknown route", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/does-not-exist"
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(404);

		const data =
			await response.json();

		expect(
			data.error
		).toBe("Route not found");
	});


	it("handles CORS preflight requests", async () => {
		const request =
			new IncomingRequest(
				"http://example.com/api/services",
				{
					method: "OPTIONS",
				}
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(204);

		expect(
			response.headers.get(
				"Access-Control-Allow-Origin"
			)
		).toBe("*");

		expect(
			response.headers.get(
				"Access-Control-Allow-Methods"
			)
		).toContain("POST");

		expect(
			response.headers.get(
				"Access-Control-Allow-Headers"
			)
		).toContain("X-API-Key");
	});


	it("records a successful health check as UP", async () => {
		const serviceId =
			await createTestService(
				"Healthy Test Service",
				"https://healthy.test"
			);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					"OK",
					{
						status: 200,
					}
				)
			)
		);

		const result =
			await checkService(
				serviceId,
				env
			);

		expect(
			result.status
		).toBe(200);

		expect(
			result.body.status
		).toBe("UP");

		const service =
			await getService(
				serviceId
			);

		expect(
			service?.status
		).toBe("UP");

		const check =
			await env.DB
				.prepare(
					`SELECT
						status,
						status_code
					 FROM checks
					 WHERE service_id = ?
					 ORDER BY id DESC
					 LIMIT 1`
				)
				.bind(serviceId)
				.first<{
					status: string;
					status_code: number;
				}>();

		expect(
			check?.status
		).toBe("UP");

		expect(
			check?.status_code
		).toBe(200);
	});


	it("records a non-2xx response as DOWN and creates an incident", async () => {
		const serviceId =
			await createTestService(
				"Failing Test Service",
				"https://failing.test"
			);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					"Forbidden",
					{
						status: 403,
					}
				)
			)
		);

		const result =
			await checkService(
				serviceId,
				env
			);

		expect(
			result.status
		).toBe(200);

		expect(
			result.body.status
		).toBe("DOWN");

		expect(
			result.body.status_code
		).toBe(403);

		const service =
			await getService(
				serviceId
			);

		expect(
			service?.status
		).toBe("DOWN");

		const incident =
			await env.DB
				.prepare(
					`SELECT
						reason,
						resolved_at
					 FROM incidents
					 WHERE service_id = ?
					 ORDER BY id DESC
					 LIMIT 1`
				)
				.bind(serviceId)
				.first<{
					reason: string;
					resolved_at: string | null;
				}>();

		expect(
			incident?.reason
		).toBe("HTTP 403");

		expect(
			incident?.resolved_at
		).toBeNull();
	});


	it("does not create duplicate open incidents for repeated failures", async () => {
		const serviceId =
			await createTestService(
				"Repeated Failure Service",
				"https://repeated-failure.test"
			);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					"Server Error",
					{
						status: 500,
					}
				)
			)
		);

		await checkService(
			serviceId,
			env
		);

		await checkService(
			serviceId,
			env
		);

		const result =
			await env.DB
				.prepare(
					`SELECT COUNT(*) AS count
					 FROM incidents
					 WHERE service_id = ?
					 AND resolved_at IS NULL`
				)
				.bind(serviceId)
				.first<{
					count: number;
				}>();

		expect(
			result?.count
		).toBe(1);
	});


	it("resolves an open incident when the service recovers", async () => {
		const serviceId =
			await createTestService(
				"Recovery Test Service",
				"https://recovery.test"
			);

		vi.stubGlobal(
			"fetch",
			vi.fn()
				.mockResolvedValueOnce(
					new Response(
						"Unavailable",
						{
							status: 503,
						}
					)
				)
				.mockResolvedValueOnce(
					new Response(
						"OK",
						{
							status: 200,
						}
					)
				)
		);

		const firstResult =
			await checkService(
				serviceId,
				env
			);

		expect(
			firstResult.body.status
		).toBe("DOWN");

		const openIncident =
			await env.DB
				.prepare(
					`SELECT
						id,
						resolved_at
					 FROM incidents
					 WHERE service_id = ?
					 LIMIT 1`
				)
				.bind(serviceId)
				.first<{
					id: number;
					resolved_at: string | null;
				}>();

		expect(
			openIncident
		).not.toBeNull();

		expect(
			openIncident?.resolved_at
		).toBeNull();

		const secondResult =
			await checkService(
				serviceId,
				env
			);

		expect(
			secondResult.body.status
		).toBe("UP");

		const resolvedIncident =
			await env.DB
				.prepare(
					`SELECT
						resolved_at
					 FROM incidents
					 WHERE service_id = ?
					 LIMIT 1`
				)
				.bind(serviceId)
				.first<{
					resolved_at: string | null;
				}>();

		expect(
			resolvedIncident?.resolved_at
		).not.toBeNull();

		const service =
			await getService(
				serviceId
			);

		expect(
			service?.status
		).toBe("UP");
	});


	it("records network failures as DOWN and creates an incident", async () => {
		const serviceId =
			await createTestService(
				"Network Failure Service",
				"https://network-failure.test"
			);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(
				new Error(
					"Network connection lost."
				)
			)
		);

		const result =
			await checkService(
				serviceId,
				env
			);

		expect(
			result.status
		).toBe(503);

		expect(
			result.body.status
		).toBe("DOWN");

		expect(
			result.body.status_code
		).toBeNull();

		expect(
			result.body.error
		).toContain(
			"Network connection lost."
		);

		const incident =
			await env.DB
				.prepare(
					`SELECT
						reason,
						resolved_at
					 FROM incidents
					 WHERE service_id = ?
					 LIMIT 1`
				)
				.bind(serviceId)
				.first<{
					reason: string;
					resolved_at: string | null;
				}>();

		expect(
			incident?.reason
		).toContain(
			"Network connection lost."
		);

		expect(
			incident?.resolved_at
		).toBeNull();
	});


	it("calculates service analytics correctly", async () => {
		const serviceId =
			await createTestService(
				"Analytics Test Service",
				"https://analytics.test"
			);

		await env.DB
			.prepare(
				`INSERT INTO checks
				 (service_id, status, status_code, response_time_ms)
				 VALUES
				 (?, 'UP', 200, 100),
				 (?, 'UP', 200, 200),
				 (?, 'DOWN', 500, 400)`
			)
			.bind(
				serviceId,
				serviceId,
				serviceId
			)
			.run();

		const request =
			new IncomingRequest(
				`http://example.com/api/services/${serviceId}/analytics`
			);

		const response =
			await executeWorker(
				request
			);

		expect(
			response.status
		).toBe(200);

		const data =
			await response.json();

		expect(
			data.total_checks
		).toBe(3);

		expect(
			data.successful_checks
		).toBe(2);

		expect(
			data.failed_checks
		).toBe(1);

		expect(
			data.uptime_percentage
		).toBe(66.67);

		expect(
			data.average_response_time_ms
		).toBe(233);

		expect(
			data.fastest_response_time_ms
		).toBe(100);

		expect(
			data.slowest_response_time_ms
		).toBe(400);
	});

});