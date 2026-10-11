export interface HealthStatus {
  status: "ok";
  service: "sutbozor-backend";
}

export function getHealth(): HealthStatus {
  return { status: "ok", service: "sutbozor-backend" };
}
