export interface Env {
	DB: D1Database;
	CLOUDPULSE_API_KEY: string;
}

export interface Service {
  id: number;
  name: string;
  url: string;
  status: string;
}

export interface HealthCheckResult {
  service_id: number;
  service_name: string;
  status: "UP" | "DOWN";
  status_code: number | null;
  response_time_ms: number;
  error?: string;
}