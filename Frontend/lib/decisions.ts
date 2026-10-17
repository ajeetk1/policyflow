import { apiRequest } from "./api";

export type DecisionResponse = {
  intent: string;
  risk: "low" | "medium" | "high";
  decision: "approve" | "reject" | "review";
  request_approval: boolean;
};

export async function evaluateDecision(
  request: Record<string, unknown>
): Promise<DecisionResponse> {
  return apiRequest<DecisionResponse>("/v1/gmail/decide", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
