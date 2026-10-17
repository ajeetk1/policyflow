import { apiRequest } from "./api";

export type HealthResponse = {
  status: string;
};

export function checkBackend() {
  return apiRequest<HealthResponse>("/health");
}
