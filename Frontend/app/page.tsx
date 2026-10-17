"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Braces,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Clock3,
  Code2,
  Copy,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MoreVertical,
  Network,
  Plus,
  Plug,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePolicyAuth } from "../components/AuthProvider";

type DecisionStatus = "APPROVED" | "MGR APPROVAL" | "FIN APPROVAL" | "FRAUD REVIEW" | "NEED APPROVAL" | "REVIEW" | "REPLY" | "ARCHIVE";
type DecisionRow = {
  time: string;
  request: string;
  decision: DecisionStatus;
  policy: string;
  rule: string;
  latency?: number;
  intent?: string;
  risk?: string;
  requestApproval?: boolean;
  input?: Record<string, unknown>;
  requestId?: string;
  policyGroupId?: string;
  policyVersionId?: number;
  reason?: string;
  timestamp?: string;
  evaluatedRules?: unknown[];
};
type EngineRule = { id: string; condition: string; decision: string; priority?: number; source?: string };
type Policy = {
  name: string;
  rules: number;
  updated: string;
  decisions: number;
  draft?: boolean;
  status?: string;
  policyGroupId?: string;
  policyVersionId?: number;
  versionNumber?: number;
  ruleDetails?: EngineRule[];
};
type PolicyGroup = { policy_group_id: string; name: string; versions: number; active_version: number | null };
type PolicyUploadJob = {
  job_id: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "failed";
  policy_id?: number;
  policy_group_id?: string;
  version_number?: number;
  policy_status?: string;
  error?: string;
  pollError?: string;
  rule_count?: number;
  rules?: unknown;
};
type PageName = "Dashboard" | "Policies" | "Decision Playground" | "History" | "API Playground" | "Settings" | "API Keys";
type SettingsTab = "General" | "Environments & Routing" | "Webhooks & Alerts" | "Audit Ledger" | "Account";

const screenNames: PageName[] = ["Dashboard", "Policies", "Decision Playground", "History", "API Playground", "Settings", "API Keys"];
const sampleRules: EngineRule[] = [
  { id: "refund_001", condition: "amount < 10000 && days <= 30", decision: "APPROVE", priority: 10 },
  { id: "refund_002", condition: "amount >= 10000 && amount <= 50000", decision: "MANAGER APPROVAL", priority: 50 },
  { id: "refund_003", condition: "amount > 50000", decision: "FINANCE APPROVAL", priority: 50 },
  { id: "fraud_001", condition: "fraud_indicator == true || risk_score >= 0.85", decision: "FRAUD REVIEW", priority: 100 },
  { id: "return_001", condition: "days_since_purchase <= 7 && evidence_present", decision: "APPROVE", priority: 10 },
  { id: "return_002", condition: "days_since_purchase > 7 && days_since_purchase <= 45", decision: "MANAGER APPROVAL", priority: 30 },
];
const initialApiRequest = JSON.stringify({
  subject: "Refund request",
  body: "Customer requests a refund for a damaged product.",
  amount: 3000,
  days_since_purchase: 10,
  evidence_present: true,
  fraud_indicator: false,
}, null, 2);

const initialDecisions: DecisionRow[] = [
  { time: "10:32", request: "Refund $3,000", decision: "APPROVED", policy: "Company Refund …", rule: "refund_001", latency: 11 },
  { time: "10:28", request: "Return 45 days", decision: "MGR APPROVAL", policy: "Customer Returns…", rule: "return_002", latency: 14 },
  { time: "10:15", request: "Refund $75,000", decision: "FIN APPROVAL", policy: "Company Refund …", rule: "refund_003", latency: 12 },
  { time: "09:51", request: "Fraud detected", decision: "FRAUD REVIEW", policy: "Company Refund …", rule: "fraud_001", latency: 9 },
  { time: "09:20", request: "Expense $420", decision: "APPROVED", policy: "Employee Expenses…", rule: "exp_004", latency: 13 },
];

const starterPolicies: Policy[] = [
  { name: "Company Refund Policy", rules: 12, updated: "Updated 2h ago", decisions: 38, ruleDetails: sampleRules },
  { name: "Customer Returns Policy", rules: 7, updated: "Updated Oct 6, 2026", decisions: 6, ruleDetails: sampleRules.filter((rule) => rule.id.startsWith("return_")) },
  { name: "Employee Expense Policy", rules: 8, updated: "Updated Oct 5, 2026", decisions: 3, draft: true, ruleDetails: sampleRules.filter((rule) => rule.id.startsWith("refund_")) },
];

const menuGroups: { heading: string; items: { name: PageName; icon: typeof LayoutDashboard }[] }[] = [
  {
    heading: "CORE ENGINE",
    items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Policies", icon: FileText },
      { name: "Decision Playground", icon: Zap },
      { name: "History", icon: Clock3 },
      { name: "API Playground", icon: Plug },
    ],
  },
  {
    heading: "CONFIGURATION",
    items: [
      { name: "Settings", icon: Settings },
      { name: "API Keys", icon: KeyRound },
    ],
  },
];

function getInitialApiUrl() {
  if (typeof window !== "undefined") {
    return localStorage.getItem("policyflow-api-url") || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

function formatDate() {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
}

function statusClass(status: DecisionStatus) {
  return status === "APPROVED" ? "approved" : status === "FRAUD REVIEW" ? "fraud" : "approval";
}

function normalizeDecision(value: string): DecisionStatus {
  const normalized = value.toUpperCase().replaceAll("_", " ");
  if (normalized.includes("FRAUD")) return "FRAUD REVIEW";
  if (normalized.includes("FINANCE")) return "FIN APPROVAL";
  if (normalized.includes("MANAGER")) return "MGR APPROVAL";
  if (normalized === "APPROVE" || normalized === "APPROVED") return "APPROVED";
  if (normalized === "NEED APPROVAL") return "NEED APPROVAL";
  if (normalized === "REPLY") return "REPLY";
  if (normalized === "ARCHIVE") return "ARCHIVE";
  return "REVIEW";
}

function toEngineRules(value: unknown): EngineRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rule: unknown, index: number) => {
    if (!rule || typeof rule !== "object") return [];
    const parsed = rule as Record<string, unknown>;
    if (typeof parsed.rule_id !== "string") return [];

    const conditions = Array.isArray(parsed.conditions) ? parsed.conditions : [];
    const conditionText = conditions
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return "";
        const condition = item as Record<string, unknown>;
        if (typeof condition.field !== "string" || typeof condition.operator !== "string") return "";
        const conditionValue = typeof condition.value === "string"
          ? condition.value
          : JSON.stringify(condition.value);
        return `${condition.field} ${condition.operator} ${conditionValue}`;
      })
      .filter(Boolean)
      .join(" AND ");

    const decision = typeof parsed.decision === "string"
      ? parsed.decision
      : typeof parsed.action === "string"
        ? parsed.action
        : "";
    if (!decision) return [];

    return [{
      id: parsed.rule_id,
      condition: conditionText || "No explicit condition",
      decision: decision.toUpperCase().replaceAll("_", " "),
      priority: typeof parsed.priority === "number" && parsed.priority > 0
        ? parsed.priority
        : index + 1,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
    }];
  });
}

function parsePolicyUploadJob(value: unknown): PolicyUploadJob {
  if (!value || typeof value !== "object") {
    throw new Error("The policy status endpoint returned an invalid response.");
  }
  const job = value as Record<string, unknown>;
  if (
    typeof job.job_id !== "string" ||
    typeof job.filename !== "string" ||
    (job.status !== "queued" &&
      job.status !== "processing" &&
      job.status !== "completed" &&
      job.status !== "failed")
  ) {
    throw new Error("The policy status endpoint returned an invalid response.");
  }
  return {
    job_id: job.job_id,
    filename: job.filename,
    status: job.status,
    policy_id: typeof job.policy_id === "number" ? job.policy_id : undefined,
    policy_group_id: typeof job.policy_group_id === "string" ? job.policy_group_id : undefined,
    version_number: typeof job.version_number === "number" ? job.version_number : undefined,
    policy_status: typeof job.policy_status === "string" ? job.policy_status : undefined,
    error: typeof job.error === "string" ? job.error : undefined,
    rule_count: typeof job.rule_count === "number" ? job.rule_count : undefined,
    rules: job.rules,
  };
}

export default function Home() {
  const auth = usePolicyAuth();
  const [activePage, setActivePage] = useState<PageName>("Dashboard");
  const [decisions, setDecisions] = useState(initialDecisions);
  const [policies, setPolicies] = useState(starterPolicies);
  const [selectedPolicy, setSelectedPolicy] = useState(starterPolicies[0].name);
  const [selectedPolicyVersionId, setSelectedPolicyVersionId] = useState<number | null>(null);
  const [activeApiPolicyName, setActiveApiPolicyName] = useState<string | null>(null);
  const [engineRules, setEngineRules] = useState(starterPolicies[0].ruleDetails ?? sampleRules);
  const [hasApiPolicy, setHasApiPolicy] = useState(false);
  const [selectedRule, setSelectedRule] = useState(sampleRules[0].id);
  const [selectedDecision, setSelectedDecision] = useState(1);
  const [policySearch, setPolicySearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("General");
  const [apiRequestJson, setApiRequestJson] = useState(initialApiRequest);
  const [apiResponseJson, setApiResponseJson] = useState("");
  const [apiRequestBusy, setApiRequestBusy] = useState(false);
  const [keySearch, setKeySearch] = useState("");
  const [apiKeys, setApiKeys] = useState([
    { name: "Production Server Key", prefix: "pf_demo_99f2••••••••••3a7b", scope: "Read + Evaluate", lastUsed: "2 minutes ago", active: true },
    { name: "Staging / CI Decision Runner", prefix: "pf_demo_41c8••••••••••8819", scope: "Evaluate", lastUsed: "14 hours ago", active: true },
    { name: "Retool Dashboard Integration", prefix: "pf_demo_12a0••••••••••99df", scope: "Read-only", lastUsed: "1 day ago", active: true },
    { name: "Legacy Gmail Ingestion Worker", prefix: "pf_demo_04ce••••••••••77fa", scope: "Evaluate (restricted)", lastUsed: "3 days ago", active: false },
  ]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("All statuses");
  const [search, setSearch] = useState("");
  const [apiUrl, setApiUrl] = useState("http://localhost:8000");
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [apiUrlDraft, setApiUrlDraft] = useState("");
  const [environment, setEnvironment] = useState<"PROD" | "DEV">("PROD");
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadJobs, setUploadJobs] = useState<PolicyUploadJob[]>([]);
  const [uploadStatus, setUploadStatus] = useState<
  "idle" | "uploading" | "uploaded" | "error"
>("idle");
  const [request, setRequest] = useState({ subject: "Refund request", body: "Customer requests a refund for a damaged product.", amount: "3000", days: "10", evidence: true, fraud: false });
  const [decisionResult, setDecisionResult] = useState<{
    decision: string;
    risk: string;
    intent: string;
    requestApproval: boolean;
    rulesUsed: string[];
    requestId?: string;
    reason: string;
  } | null>(null);
  const [date, setDate] = useState("");
  const policyUserRef = useRef<string | null>(null);

  const getApiAuthHeaders = useCallback(async () => {
    if (!auth.signedIn || !auth.userId) {
      throw new Error("Sign in to access your policies.");
    }
    const token = await auth.getToken();
    if (!token) {
      throw new Error("Your session token is unavailable. Please sign in again.");
    }
    return { Authorization: `Bearer ${token}` };
  }, [auth.getToken, auth.signedIn, auth.userId]);

  useEffect(() => {
    setDate(formatDate());
    const requestedPage = new URLSearchParams(window.location.search).get("page") as PageName | null;
    if (requestedPage && screenNames.includes(requestedPage)) setActivePage(requestedPage);
    const savedUrl = getInitialApiUrl();
    setApiUrl(savedUrl);
    setApiUrlDraft(savedUrl);
  }, []);

  useEffect(() => {
    const syncPage = () => {
      const requestedPage = new URLSearchParams(window.location.search).get("page") as PageName | null;
      setActivePage(requestedPage && screenNames.includes(requestedPage) ? requestedPage : "Dashboard");
    };
    window.addEventListener("popstate", syncPage);
    return () => window.removeEventListener("popstate", syncPage);
  }, []);

  const checkApi = useCallback(async (url: string) => {
    const baseUrl = url.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      setApiStatus("offline");
      setApiLatency(null);
      return;
    }
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Health check returned ${response.status}`);
      setApiLatency(Math.max(1, Math.round(performance.now() - started)));
      setApiStatus("online");
    } catch {
      setApiLatency(null);
      setApiStatus("offline");
    }
  }, []);

  useEffect(() => {
    if (!apiUrl) return;
    void checkApi(apiUrl);
    const interval = window.setInterval(() => void checkApi(apiUrl), 30000);
    return () => window.clearInterval(interval);
  }, [apiUrl, checkApi]);

  const refreshPolicyGroups = useCallback(async () => {
    const headers = await getApiAuthHeaders();
    const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/v1/policies/groups`, {
      headers,
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const detail = body && typeof body === "object"
        ? (body as Record<string, unknown>).detail
        : undefined;
      throw new Error(typeof detail === "string" ? detail : `Could not load policy groups (${response.status}).`);
    }
    if (!Array.isArray(body)) {
      throw new Error("The policy groups endpoint returned an invalid response.");
    }
    const groups = body.filter((item): item is PolicyGroup =>
      Boolean(item && typeof item === "object" &&
        typeof (item as Record<string, unknown>).policy_group_id === "string" &&
        typeof (item as Record<string, unknown>).name === "string")
    ).map((item) => ({
      policy_group_id: item.policy_group_id,
      name: item.name,
      versions: Number.isInteger(item.versions) ? item.versions : 0,
      active_version: Number.isInteger(item.active_version) ? item.active_version : null,
    }));
    const versionResponses = await Promise.all(groups.map(async (group) => {
      const versionsResponse = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/v1/policies/groups/${encodeURIComponent(group.policy_group_id)}/versions`,
        { headers, cache: "no-store" }
      );
      const versionsBody: unknown = await versionsResponse.json();
      if (!versionsResponse.ok || !Array.isArray(versionsBody)) {
        const detail = versionsBody && typeof versionsBody === "object"
          ? (versionsBody as Record<string, unknown>).detail
          : undefined;
        throw new Error(typeof detail === "string" ? detail : `Could not load versions for ${group.name}.`);
      }
      return versionsBody;
    }));
    const backendPolicies = versionResponses.flat().flatMap((value): Policy[] => {
      if (!value || typeof value !== "object") return [];
      const version = value as Record<string, unknown>;
      if (
        typeof version.policy_id !== "number" ||
        typeof version.policy_group_id !== "string" ||
        typeof version.filename !== "string"
      ) return [];
      const status = typeof version.status === "string" ? version.status : "draft";
      const ruleDetails = toEngineRules(version.rules);
      return [{
        name: version.filename,
        rules: ruleDetails.length,
        updated: typeof version.activated_at === "string" ? "Activated" : "Saved",
        decisions: 0,
        draft: status !== "active",
        status,
        policyGroupId: version.policy_group_id,
        policyVersionId: version.policy_id,
        versionNumber: typeof version.version_number === "number" ? version.version_number : undefined,
        ruleDetails,
      }];
    });
    setPolicies((current) => [
      ...backendPolicies,
      ...current.filter((policy) => policy.policyVersionId === undefined),
    ]);
    const activePolicies = backendPolicies.filter((policy) => policy.status === "active");
    if (policyUserRef.current !== auth.userId) {
      policyUserRef.current = auth.userId;
      if (activePolicies.length > 0) {
        setHasApiPolicy(true);
        setActiveApiPolicyName(activePolicies.length === 1
          ? activePolicies[0].name
          : `${activePolicies.length} active policy groups`);
        setEngineRules(activePolicies.flatMap((policy) => policy.ruleDetails ?? []));
        setSelectedPolicy(activePolicies[0].name);
        setSelectedPolicyVersionId(activePolicies[0].policyVersionId ?? null);
      } else {
        setHasApiPolicy(false);
        setActiveApiPolicyName(null);
        setSelectedPolicyVersionId(null);
      }
    }
  }, [apiUrl, auth.userId, getApiAuthHeaders]);

  useEffect(() => {
    if (!auth.loaded || !auth.signedIn || !auth.userId) {
      setPolicies(starterPolicies);
      setSelectedPolicy(starterPolicies[0].name);
      setSelectedPolicyVersionId(null);
      setHasApiPolicy(false);
      setActiveApiPolicyName(null);
      setEngineRules(starterPolicies[0].ruleDetails ?? sampleRules);
      setUploadJobs([]);
      setDecisions(initialDecisions);
      policyUserRef.current = null;
      return;
    }
    if (
      policyUserRef.current &&
      policyUserRef.current !== auth.userId
    ) {
      setPolicies(starterPolicies);
      setSelectedPolicy(starterPolicies[0].name);
      setSelectedPolicyVersionId(null);
      setHasApiPolicy(false);
      setActiveApiPolicyName(null);
      setEngineRules(starterPolicies[0].ruleDetails ?? sampleRules);
      setUploadJobs([]);
      setDecisions([]);
    }
    let cancelled = false;
    void refreshPolicyGroups().catch((error: unknown) => {
      if (!cancelled) {
        setToast(error instanceof Error ? error.message : "Could not load policy groups.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [auth.loaded, auth.signedIn, auth.userId, refreshPolicyGroups]);

  useEffect(() => {
    if (!auth.loaded || !auth.signedIn || !auth.userId || !apiUrl) return;
    let cancelled = false;
    const loadAuditHistory = async () => {
      const headers = await getApiAuthHeaders();
      const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/v1/decisions?limit=100`, {
        headers,
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = body && typeof body === "object"
          ? (body as Record<string, unknown>).detail
          : undefined;
        throw new Error(typeof detail === "string" ? detail : `Could not load decision history (${response.status}).`);
      }
      if (!body || typeof body !== "object" || !Array.isArray((body as Record<string, unknown>).items)) {
        throw new Error("The decision history endpoint returned an invalid response.");
      }
      const items = ((body as Record<string, unknown>).items as unknown[]).flatMap((item): DecisionRow[] => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const snapshot = record.input_snapshot && typeof record.input_snapshot === "object"
          ? record.input_snapshot as Record<string, unknown>
          : {};
        const matchedRules = Array.isArray(record.matched_rule_ids)
          ? record.matched_rule_ids.filter((ruleId): ruleId is string => typeof ruleId === "string")
          : [];
        const createdAt = typeof record.created_at === "string" ? new Date(record.created_at) : new Date();
        return [{
          time: createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
          timestamp: createdAt.toISOString(),
          request: typeof snapshot.subject === "string" ? snapshot.subject : "Decision request",
          decision: normalizeDecision(typeof record.decision_outcome === "string" ? record.decision_outcome : "REVIEW"),
          policy: typeof record.policy_version_id === "number" ? `Policy version ${record.policy_version_id}` : "No matching active policy",
          rule: matchedRules.length ? matchedRules.join(", ") : "No rule matched",
          requestId: typeof record.request_id === "string" ? record.request_id : undefined,
          policyGroupId: typeof record.policy_group_id === "string" ? record.policy_group_id : undefined,
          policyVersionId: typeof record.policy_version_id === "number" ? record.policy_version_id : undefined,
          reason: typeof record.decision_reason === "string" ? record.decision_reason : undefined,
          evaluatedRules: Array.isArray(record.rules_evaluated) ? record.rules_evaluated : [],
          input: snapshot,
        }];
      });
      if (!cancelled) {
        setDecisions(items);
        setSelectedDecision(0);
      }
    };
    void loadAuditHistory().catch((error: unknown) => {
      if (!cancelled) setToast(error instanceof Error ? error.message : "Could not load decision history.");
    });
    return () => {
      cancelled = true;
    };
  }, [apiUrl, auth.loaded, auth.signedIn, auth.userId, getApiAuthHeaders]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeUploadJobIds = uploadJobs
    .filter((job) => job.status === "queued" || job.status === "processing")
    .map((job) => job.job_id)
    .join(",");
  const selectedPolicyRecord = policies.find((policy) => policy.policyVersionId === selectedPolicyVersionId)
    ?? policies.find((policy) => policy.name === selectedPolicy);
  const selectedPolicyRules = selectedPolicyRecord?.ruleDetails ?? engineRules;
  const selectedPolicyStatus = selectedPolicyRecord?.status
    ?? (selectedPolicy === activeApiPolicyName ? "active" : "sample");
  const selectedPolicyIsActive = selectedPolicyStatus === "active";

  useEffect(() => {
    if (!apiUrl || !activeUploadJobIds || !auth.loaded || !auth.signedIn || !auth.userId) return;

    let cancelled = false;
    let timer: number | undefined;
    const jobIds = activeUploadJobIds.split(",");

    const pollJobs = async () => {
      const updates = await Promise.all(jobIds.map(async (jobId) => {
        try {
          const headers = await getApiAuthHeaders();
          const response = await fetch(
            `${apiUrl.replace(/\/+$/, "")}/v1/policies/uploads/${encodeURIComponent(jobId)}`,
            { headers, cache: "no-store" }
          );
          if (!response.ok) {
            throw new Error(`Status check failed (${response.status}).`);
          }
          return { job: parsePolicyUploadJob(await response.json()) };
        } catch (error) {
          return {
            jobId,
            pollError: error instanceof Error ? error.message : "Could not refresh policy status.",
          };
        }
      }));

      if (cancelled) return;

      for (const update of updates) {
        if ("pollError" in update) {
          setUploadJobs((current) => current.map((job) =>
            job.job_id === update.jobId ? { ...job, pollError: update.pollError } : job
          ));
          continue;
        }

        const job = update.job;
        setUploadJobs((current) => current.map((existing) =>
          existing.job_id === job.job_id ? { ...job, pollError: undefined } : existing
        ));

        if (job.status === "completed") {
          const extractedRules = toEngineRules(job.rules);
          setPolicies((current) => [
            {
              name: job.filename,
              rules: job.rule_count ?? extractedRules.length,
              updated: "Draft ready",
              decisions: 0,
              draft: true,
              status: job.policy_status ?? "draft",
              policyGroupId: job.policy_group_id,
              policyVersionId: job.policy_id,
              versionNumber: job.version_number,
              ruleDetails: extractedRules,
            },
            ...current.filter((policy) =>
              policy.policyVersionId !== job.policy_id &&
              !(policy.name === job.filename && !policy.policyVersionId)
            ),
          ]);
          setSelectedPolicy(job.filename);
          setSelectedPolicyVersionId(job.policy_id ?? null);
          setSelectedRule(extractedRules[0]?.id ?? "");
          setToast(`${job.filename} is ready for review as a draft. Activate it to use its rules.`);
          void refreshPolicyGroups().catch((error: unknown) => {
            setToast(error instanceof Error ? error.message : "Policy processed, but policy groups could not be refreshed.");
          });
        } else if (job.status === "failed") {
          setPolicies((current) => current.map((policy) =>
            policy.policyVersionId === job.policy_id
              ? { ...policy, updated: "Processing failed", status: "failed", draft: true }
              : policy
          ));
        }
      }

      if (!cancelled) {
        timer = window.setTimeout(pollJobs, 1500);
      }
    };

    void pollJobs();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeUploadJobIds, apiUrl, auth.loaded, auth.signedIn, auth.userId, getApiAuthHeaders, refreshPolicyGroups]);

  const decisionRecords = decisions.length > 0 ? decisions : apiStatus === "offline" ? initialDecisions : [];
  const filteredDecisions = useMemo(() => decisionRecords.filter((item) => {
    const matchesStatus = filter === "All statuses" || item.decision === filter;
    const haystack = `${item.request} ${item.policy} ${item.rule} ${item.decision}`.toLowerCase();
    return matchesStatus && haystack.includes(search.toLowerCase());
  }), [decisionRecords, filter, search]);

  const choosePage = (page: PageName) => {
    setActivePage(page);
    setMobileNavOpen(false);
    setSearch("");
    const url = new URL(window.location.href);
    if (page === "Dashboard") url.searchParams.delete("page");
    else url.searchParams.set("page", page);
    window.history.pushState({ page }, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const saveApiUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanUrl = apiUrlDraft.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/i.test(cleanUrl)) {
      setToast("Enter a valid API URL starting with http:// or https://");
      return;
    }
    localStorage.setItem("policyflow-api-url", cleanUrl);
    setApiUrl(cleanUrl);
    setApiUrlDraft(cleanUrl);
    setToast("API URL saved. Checking connection…");
  };

  const exportDecisions = () => {
    const rows = [["Time", "Request", "Decision", "Policy", "Rule", "Latency (ms)"], ...filteredDecisions.map((row) =>
      [row.time, row.request, row.decision, row.policy, row.rule, String(row.latency ?? "")])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" })
    );
    link.download = "policy-flow-decisions.csv";
    link.click();
    URL.revokeObjectURL(link.href);

    setToast(
      `Exported ${filteredDecisions.length} decision${
        filteredDecisions.length === 1 ? "" : "s"
      }`
    );
  };

const uploadPolicy = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;


  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setToast("Please select a PDF policy document.");
    event.target.value = "";
    return;
  }

  const formData = new FormData();
  formData.append("file", file);


  setUploading(true);
  setUploadProgress(0);
  setUploadStatus("uploading");

  try {
    const authHeaders = await getApiAuthHeaders();
    const job = await new Promise<PolicyUploadJob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${apiUrl.replace(/\/+$/, "")}/v1/policies/upload`);
      xhr.setRequestHeader("Authorization", authHeaders.Authorization);
      xhr.upload.addEventListener("progress", (progressEvent) => {
        if (progressEvent.lengthComputable) {
          setUploadProgress(
            Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100))
          );
        }
      });
      xhr.addEventListener("load", () => {
        let responseBody: unknown;
        try {
          responseBody = JSON.parse(xhr.responseText);
        } catch {
          reject(new Error("Policy upload returned an invalid response."));
          return;
        }

        const responseRecord = responseBody && typeof responseBody === "object"
          ? responseBody as Record<string, unknown>
          : {};
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(
            new Error(
              typeof responseRecord.detail === "string"
                ? responseRecord.detail
                : "Policy upload failed."
            )
          );
          return;
        }
        try {
          resolve(parsePolicyUploadJob(responseBody));
        } catch (error) {
          reject(error);
        }
      });
      xhr.addEventListener("error", () => {
        reject(new Error("Could not upload policy. Check your API connection."));
      });
      xhr.send(formData);
    });

    const uploadedName = job.filename || file.name;
    setUploadJobs((current) => [job, ...current.filter((item) => item.job_id !== job.job_id)]);
    setPolicies((current) => [
      {
        name: uploadedName,
        rules: 0,
        updated: "Processing…",
        decisions: 0,
        draft: true,
        status: "processing",
        policyGroupId: job.policy_group_id,
        policyVersionId: job.policy_id,
        versionNumber: job.version_number,
      },
      ...current.filter((policy) => policy.policyVersionId !== job.policy_id),
    ]);
    setSelectedPolicy(uploadedName);
    setSelectedPolicyVersionId(job.policy_id ?? null);
    setToast(`${uploadedName} safely uploaded. Rule processing started.`);
    setUploadStatus("uploaded");

  } catch (error) {
    setUploadStatus("error");

    setToast(
      error instanceof Error
        ? error.message
        : "Could not upload policy. Check your API connection."
    );
  } finally {
    setUploading(false);
    event.target.value = "";
  }
};

const retryPolicyUpload = async (jobId: string) => {
  try {
    const authHeaders = await getApiAuthHeaders();
    const response = await fetch(
      `${apiUrl.replace(/\/+$/, "")}/v1/policies/uploads/${encodeURIComponent(jobId)}/retry`,
      { method: "POST", headers: authHeaders }
    );
    const body: unknown = await response.json();
    if (!response.ok) {
      const detail = body && typeof body === "object"
        ? (body as Record<string, unknown>).detail
        : undefined;
      throw new Error(typeof detail === "string" ? detail : `Retry failed (${response.status}).`);
    }
    const job = parsePolicyUploadJob(body);
    setUploadJobs((current) => current.map((existing) =>
      existing.job_id === job.job_id ? job : existing
    ));
    setPolicies((current) => current.map((policy) =>
      policy.policyVersionId === job.policy_id
        ? { ...policy, updated: "Processing…", status: "processing", draft: true }
        : policy
    ));
    setToast(`Retrying processing for ${job.filename}.`);
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Could not retry policy processing.");
  }
};

const updatePolicyVersion = async (policy: Policy, action: "activate" | "rollback") => {
  if (!policy.policyGroupId || !policy.policyVersionId) {
    setToast("This policy version cannot be activated because its version details are unavailable.");
    return;
  }
  try {
    const authHeaders = await getApiAuthHeaders();
    const response = await fetch(
      `${apiUrl.replace(/\/+$/, "")}/v1/policies/groups/${encodeURIComponent(policy.policyGroupId)}/versions/${policy.policyVersionId}/${action}`,
      { method: "POST", headers: authHeaders }
    );
    const body: unknown = await response.json();
    if (!response.ok) {
      const detail = body && typeof body === "object"
        ? (body as Record<string, unknown>).detail
        : undefined;
      throw new Error(typeof detail === "string" ? detail : `Policy ${action} failed (${response.status}).`);
    }
    const updatedPolicies = policies.map((item) => {
      if (item.policyGroupId !== policy.policyGroupId) return item;
      if (item.policyVersionId === policy.policyVersionId) return { ...item, status: "active", draft: false };
      if (item.status === "active") return { ...item, status: "superseded", draft: true };
      return item;
    });
    const activePolicies = updatedPolicies.filter((item) => item.status === "active");
    setPolicies(updatedPolicies);
    setHasApiPolicy(activePolicies.length > 0);
    setActiveApiPolicyName(activePolicies.length === 1
      ? activePolicies[0].name
      : `${activePolicies.length} active policy groups`);
    setSelectedPolicy(policy.name);
    setSelectedPolicyVersionId(policy.policyVersionId);
    const activeRules = activePolicies.flatMap((item) => item.ruleDetails ?? []);
    setEngineRules(activeRules);
    setSelectedRule(policy.ruleDetails?.[0]?.id ?? activeRules[0]?.id ?? "");
    setToast(action === "rollback"
      ? `${policy.name} was restored as the active policy version.`
      : `${policy.name} is now active for your account.`);
    await refreshPolicyGroups();
  } catch (error) {
    setToast(error instanceof Error ? error.message : "Could not activate policy version.");
  }
};


  const runDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDecisionResult(null);
    try {
      const started = performance.now();
      const authHeaders = await getApiAuthHeaders();
      const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/v1/gmail/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          subject: request.subject,
          body: request.body,
          amount: Number(request.amount) || 0,
          days_since_purchase: Number(request.days) || 0,
          evidence_present: request.evidence,
          fraud_indicator: request.fraud,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Decision request failed.");
      const requestLatency = Math.max(1, Math.round(performance.now() - started));
      setApiLatency(requestLatency);
      const now = new Date();
      const rawDecision = String(result.decision || "REVIEW").toUpperCase();
      const status = normalizeDecision(rawDecision);
      const rulesUsed = Array.isArray(result.rules_used)
        ? result.rules_used.filter((ruleId: unknown): ruleId is string => typeof ruleId === "string")
        : [];
      setDecisionResult({
        decision: rawDecision,
        risk: result.risk || "normal",
        intent: result.intent || "request",
        requestApproval: Boolean(result.request_approval),
        rulesUsed,
        requestId: typeof result.request_id === "string" ? result.request_id : undefined,
        reason: typeof result.reason === "string" ? result.reason : "No explanation was returned.",
      });
      setDecisions((current) => [{
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
        timestamp: now.toISOString(),
        request: request.subject || "Decision request",
        decision: status,
        policy: typeof result.policy_version_id === "number"
          ? `Policy version ${result.policy_version_id}`
          : "No matching active policy",
        rule: rulesUsed.length ? rulesUsed.join(", ") : "No rule matched",
        latency: requestLatency,
        intent: String(result.intent || "unknown"),
        risk: String(result.risk || "unknown"),
        requestApproval: Boolean(result.request_approval),
        requestId: typeof result.request_id === "string" ? result.request_id : undefined,
        policyVersionId: typeof result.policy_version_id === "number" ? result.policy_version_id : undefined,
        reason: typeof result.reason === "string" ? result.reason : undefined,
        input: { amount: Number(request.amount) || 0, days_since_purchase: Number(request.days) || 0, evidence_present: request.evidence, fraud_indicator: request.fraud },
      }, ...current]);
      setToast("Decision evaluated successfully.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not evaluate decision. Check your API connection.");
    }
  };

  const runApiRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiRequestBusy(true);
    try {
      const payload: unknown = JSON.parse(apiRequestJson);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Request body must be a JSON object.");
      }
      const requestBody = payload as Record<string, unknown>;
      if (typeof requestBody.subject !== "string" || typeof requestBody.body !== "string") {
        throw new Error("Request JSON must include string fields named subject and body.");
      }
      const started = performance.now();
      const authHeaders = await getApiAuthHeaders();
      const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/v1/gmail/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      setApiResponseJson(JSON.stringify(result, null, 2));
      if (!response.ok) {
        const detail = result && typeof result === "object" && "detail" in result ? result.detail : null;
        throw new Error(typeof detail === "string" ? detail : `Request failed with HTTP ${response.status}.`);
      }
      const requestLatency = Math.max(1, Math.round(performance.now() - started));
      setApiLatency(requestLatency);
      const resultRecord = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const rawDecision = String(resultRecord.decision || "APPROVED").toUpperCase();
      const numericAmount = Number(requestBody.amount) || 0;
      const status = normalizeDecision(rawDecision);
      const now = new Date();
      const rulesUsed = Array.isArray(resultRecord.rules_used)
        ? resultRecord.rules_used.filter((ruleId): ruleId is string => typeof ruleId === "string")
        : [];
      setDecisionResult({
        decision: rawDecision,
        risk: String(resultRecord.risk || "normal"),
        intent: String(resultRecord.intent || "request"),
        requestApproval: Boolean(resultRecord.request_approval),
        rulesUsed,
        requestId: typeof resultRecord.request_id === "string" ? resultRecord.request_id : undefined,
        reason: typeof resultRecord.reason === "string" ? resultRecord.reason : "No explanation was returned.",
      });
      setDecisions((current) => [{
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
        timestamp: now.toISOString(),
        request: requestBody.subject as string,
        decision: status,
        policy: typeof resultRecord.policy_version_id === "number"
          ? `Policy version ${resultRecord.policy_version_id}`
          : "No matching active policy",
        rule: rulesUsed.length ? rulesUsed.join(", ") : "No rule matched",
        latency: requestLatency,
        intent: String(resultRecord.intent || "unknown"),
        risk: String(resultRecord.risk || "unknown"),
        requestApproval: Boolean(resultRecord.request_approval),
        requestId: typeof resultRecord.request_id === "string" ? resultRecord.request_id : undefined,
        policyVersionId: typeof resultRecord.policy_version_id === "number" ? resultRecord.policy_version_id : undefined,
        reason: typeof resultRecord.reason === "string" ? resultRecord.reason : undefined,
        input: requestBody,
      }, ...current]);
      setToast(`Request evaluated${numericAmount ? ` for $${numericAmount.toLocaleString()}` : ""}.`);
    } catch (error) {
      setApiResponseJson(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed." }, null, 2));
      setToast(error instanceof Error ? error.message : "Could not send API request.");
    } finally {
      setApiRequestBusy(false);
    }
  };

  const createDemoKey = () => {
    const suffix = Date.now().toString().slice(-4);
    setApiKeys((current) => [
      { name: "New demo integration", prefix: `pf_demo_${suffix}••••••••••••`, scope: "Read-only", lastUsed: "Never", active: true },
      ...current,
    ]);
    setToast("Added a local demo key record. Connect an API key service to create real credentials.");
  };

  const applyPreset = (name: string, amount: string, description: string) => {
    setRequest({
      subject: name,
      body: description,
      amount,
      days: "10",
      evidence: !name.includes("Fraud"),
      fraud: name.includes("Fraud"),
    });
    setDecisionResult(null);
  };

  const pageHeading: Record<PageName, { title: string; subtitle: string }> = {
    Dashboard: { title: "Dashboard", subtitle: "Monitor policies, decisions, and rule activity across your enterprise workflows." },
    Policies: { title: "Policies", subtitle: "Upload, review, and monitor the policies governing your workflows." },
    "Decision Playground": { title: "Decision Playground", subtitle: "Evaluate a request against your live policy engine." },
    History: { title: "Decision History", subtitle: "Search and audit every decision made by your policy engine." },
    "API Playground": { title: "API Playground", subtitle: "Try a live request against the Policy Flow decision API." },
    Settings: { title: "Settings", subtitle: "Configure your environment and API connection." },
    "API Keys": { title: "API Keys", subtitle: "Manage credentials used by your integrations." },
  };

  return (
    <div className="app-shell">
      <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
        {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
      </button>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Network size={19} strokeWidth={2.5} /></div>
          <div><strong>Policy Flow</strong><span>DETERMINISTIC POLICY ENGINE</span></div>
        </div>
        <div className="engine-tag"><span className="live-dot" />LIVE ENGINE: v1.4.2</div>
        <nav className="side-nav" aria-label="Main navigation">
          {menuGroups.map((group) => (
            <section className="nav-group" key={group.heading}>
              <p className="nav-heading">{group.heading}</p>
              {group.items.map(({ name, icon: Icon }) => (
                <button key={name} onClick={() => choosePage(name)} className={`nav-link ${activePage === name ? "nav-active" : ""}`}>
                  <Icon size={16} strokeWidth={1.9} /><span>{name}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>

<div className="sidebar-bottom">
  <div className="auth-box">
    <p className="auth-caption">YOUR WORKSPACE</p>

    
    <div className="auth-actions">
      {!auth.signedIn ? (
        <>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/login?next=%2F%3Fpage%3DPolicies";
            }}
          >
            <LockKeyhole size={13} />
            Sign in
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/signup?next=%2F%3Fpage%3DPolicies";
            }}
          >
            <Plus size={14} />
            Sign up
          </button>
        </>
      ) : (
        <>
          <p className="auth-not-configured">
            Signed in as {auth.userName}
          </p>
          <button
            type="button"
            onClick={async () => {
              await auth.logout();
              window.location.href = "/";
            }}
          >
            Sign out
          </button>
        </>
      )}
    </div>
  </div>
</div>

      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><LayoutDashboard size={14} /><span>policy-flow</span><b>/</b><strong>{environment.toLowerCase()}</strong></div>
          <div className="top-actions">
            <div className={`api-health ${apiStatus}`}><span className="live-dot" />{apiStatus === "online" ? `FastAPI: Operational · ${apiLatency}ms latency` : apiStatus === "checking" ? "FastAPI: Checking connection…" : "FastAPI: Offline · Demo data"}</div>
            <button className="top-action" onClick={() => setToast("API docs: open your backend at /docs")}><BookOpen size={14} />API Docs</button>
            <button className="help-button" aria-label="Help" onClick={() => setToast("Select a section from the sidebar to get started.")}><CircleHelp size={16} /></button>
          </div>
        </header>
        <div className="page-content">
          <section className="welcome-panel">
            <div>
              <div className="heading-line"><h1>{pageHeading[activePage].title}</h1>{activePage === "Dashboard" && <span className="stream-badge"><span className="live-dot" />STREAMING TELEMETRY</span>}</div>
              <p>{pageHeading[activePage].subtitle}</p>
            </div>
            <div className="welcome-meta">
              <span className="meta-pill"><LayoutDashboard size={13} />{environment === "PROD" ? "Production" : "Development"} <code>({apiUrl.replace(/^https?:\/\//, "")})</code></span>
              <span className="meta-pill"><Clock3 size={13} />Today: {date || formatDate()}</span>
              <span className="meta-pill health-pill"><ShieldCheck size={13} />System Health: {apiStatus === "online" ? "API Connected" : apiStatus === "checking" ? "Checking…" : "API Unavailable"}</span>
            </div>
          </section>

          {activePage === "Dashboard" && (
            <>
              <section className="metric-grid">
                <MetricCard title="POLICY RECORDS" value={String(policies.length)} note={hasApiPolicy ? "includes API upload" : "sample workspace"} detail={hasApiPolicy ? "Backend holds the latest uploaded policy" : "Sample policy records · upload to connect"} icon={<FolderOpen size={15} />} accent="purple" />
                <MetricCard title="RULE DEFINITIONS" value={String(hasApiPolicy ? engineRules.length : policies.reduce((sum, policy) => sum + policy.rules, 0))} note={hasApiPolicy ? "latest upload" : "sample rules"} detail={hasApiPolicy ? "Definitions returned by policy upload" : "Illustrative AST rule definitions"} icon={<Network size={15} />} accent="green" />
                <MetricCard title="DECISIONS IN SESSION" value={String(filteredDecisions.length)} note={apiLatency ? `avg ${apiLatency}ms` : "local records"} detail={apiStatus === "offline" && decisions.length === 0 ? "Sample records · API offline" : "Requests evaluated in this browser session"} icon={<Zap size={15} />} accent="amber" />
                <MetricCard title="APPROVAL RATE" value={filteredDecisions.length ? `${Math.round((filteredDecisions.filter((row) => row.decision === "APPROVED").length / filteredDecisions.length) * 100)}%` : "—"} note={filteredDecisions.length ? `${filteredDecisions.filter((row) => row.decision === "APPROVED").length} approved` : "No decisions yet"} detail="Calculated from visible session records" icon={<CheckCircle2 size={15} />} accent="green" />
              </section>
              <section className="dashboard-grid">
                <div className="left-column">
                  <DecisionTable decisions={filteredDecisions} filter={filter} filterOpen={filterOpen} search={search} onFilterClick={() => setFilterOpen(!filterOpen)} onFilterChange={(value) => { setFilter(value); setFilterOpen(false); }} onSearch={setSearch} onExport={exportDecisions} />
                  <div className="feature-grid">
                    <FeatureCard icon={<Network size={15} />} title="ENGINE ARCHITECTURE" heading="Deterministic AST" note="Zero side-effects · 0.04ms compile" variant="teal" />
                    <FeatureCard icon={<ShieldCheck size={15} />} title="AUDIT COMPLIANCE" heading="Immutable Logs" note="SHA-256 state hashing" variant="blue" />
                  </div>
                </div>
                <div className="right-column">
                  <section className="panel policies-panel">
                    <div className="panel-heading"><h2><Shield size={15} />Active Policies</h2><button onClick={() => choosePage("Policies")} className="text-link">View all policies <ArrowRight size={13} /></button></div>
                    <PolicyList policies={policies.slice(0, 3)} onSelect={() => choosePage("Policies")} />
                  </section>
                  <section className="panel diagnostics-panel">
                    <div className="panel-heading"><h2><Code2 size={15} />Architecture &amp; Diagnostics</h2><span className={`live-label ${apiStatus}`}>{apiStatus === "online" ? "FASTAPI LIVE" : apiStatus === "checking" ? "CONNECTING" : "DEMO MODE"}</span></div>
                    <div className="endpoint-row"><span>NEXT_PUBLIC_API_URL:</span><strong>{apiUrl.replace(/^https?:\/\//, "")}</strong></div>
                    <DiagnosticRow label="GET /health" value={apiStatus === "online" ? `${apiLatency}ms OK` : apiStatus === "checking" ? "Checking…" : "Unavailable"} good={apiStatus === "online"} />
                    <DiagnosticRow label="POST /v1/gmail/decide" value={apiStatus === "online" ? `Ready (avg ${apiLatency}ms)` : "Ready"} good={apiStatus !== "offline"} />
                    <DiagnosticRow label="POST /v1/policies/upload" value={apiStatus === "online" ? "Ready" : "Ready"} good={apiStatus !== "offline"} />
                  </section>
                </div>
              </section>
            </>
          )}

          {activePage === "Policies" && (
            <div className="screen-stack">
              <section className="policies-toolbar">
                <div className="policies-toolbar-copy">
                  <h2>Policies &amp; Rules Engine</h2>
                  <p>Upload policies, review extracted rules, and activate approved versions.</p>
                </div>
                <div className="policies-toolbar-actions">
                  <button
                    className="top-action"
                    onClick={() => {
                      const ast = {
                        policy: selectedPolicy,
                        version: selectedPolicyRecord?.versionNumber ?? null,
                        engine: "deterministic_v2",
                        rules: selectedPolicyRules.map((rule) => ({
                          rule_id: rule.id,
                          condition: rule.condition,
                          decision: rule.decision,
                          priority: rule.priority ?? 0,
                          source: rule.source ?? "",
                        })),
                      };
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(ast, null, 2)], { type: "application/json" })
                      );
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `${selectedPolicy.replace(/[^a-z0-9-_]+/gi, "-")}.ast.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={selectedPolicyRules.length === 0}
                  >
                    <Braces size={14} />Export Policy AST
                  </button>
                  <button
                    className="top-action"
                    disabled
                    title="Git synchronization is not configured yet."
                  >
                    <GitBranch size={14} />Sync with Git
                  </button>
                  
                  <div className="upload-control policies-upload-control">
                    {!auth.signedIn ? (
                      <button
                        type="button"
                        className="primary-button upload-button policies-upload-button"
                        onClick={() => {
                          window.location.href = "/login?next=%2F%3Fpage%3DPolicies";
                        }}
                      >
                        <LockKeyhole size={15} />
                        Sign in to upload
                      </button>
                    ) : (
                      <label
                        className={`primary-button upload-button policies-upload-button ${
                          uploading ? "disabled" : ""
                        } ${uploadStatus === "uploaded" ? "upload-success" : ""}`}
                      >
                        <Upload size={15} />
                        {uploading
                          ? "Uploading PDF…"
                          : uploadStatus === "uploaded"
                            ? "Uploaded ✓"
                            : uploadStatus === "error"
                              ? "Retry upload"
                              : "Upload Policy"}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          disabled={uploading}
                          onChange={uploadPolicy}
                        />
                      </label>
                    )}

                    {uploading && (
                      <div
                        className="upload-progress"
                        aria-label={`Sending PDF: ${uploadProgress}%`}
                      >
                        <div
                          className="upload-progress-track"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={uploadProgress}
                        >
                          <span
                            className={uploadProgress === 0 ? "indeterminate" : ""}
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <span className="upload-progress-percent">
                          {uploadProgress === 0 ? "Sending" : `${uploadProgress}%`}
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              </section>
              <section className="parse-banner" aria-live="polite">
                <div className="parse-check"><CheckCircle2 size={17} /></div>
                <div className="parse-copy">
                  <strong>
                    {uploadJobs[0]?.status === "completed"
                      ? `Policy parsed successfully: ${uploadJobs[0].filename}`
                      : uploadJobs[0]?.status === "failed"
                        ? `Policy processing failed: ${uploadJobs[0].filename}`
                        : uploadJobs[0]?.status === "queued" || uploadJobs[0]?.status === "processing"
                          ? `PDF safely stored. Extracting rules from ${uploadJobs[0].filename}…`
                          : hasApiPolicy
                            ? "Active policy loaded"
                            : "Upload a PDF to save it and process its rules in the background"}
                  </strong>
                  <span>
                    {uploadJobs[0]?.status === "completed"
                      ? `${uploadJobs[0].rule_count ?? 0} rules extracted · draft ready for review and activation`
                      : uploadJobs[0]?.status === "failed"
                        ? uploadJobs[0].error ?? "Retry processing or upload another PDF."
                        : uploadJobs[0]?.status === "queued" || uploadJobs[0]?.status === "processing"
                          ? "Rule extraction is running in the background."
                          : hasApiPolicy
                            ? `${engineRules.length} extracted rules are currently active in the policy engine.`
                            : "After upload, review the extracted rules and activate the policy to use them."}
                  </span>
                </div>
                <div className="parse-actions">
                  <button
                    className="top-action"
                    onClick={() => document.querySelector(".rule-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    disabled={selectedPolicyRules.length === 0}
                  >
                    <Eye size={14} />Review Extracted Rules
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => selectedPolicyRecord && void updatePolicyVersion(selectedPolicyRecord, "activate")}
                    disabled={
                      !selectedPolicyRecord ||
                      selectedPolicyRecord.status !== "draft" ||
                      selectedPolicyRecord.policyVersionId === undefined
                    }
                  >
                    <ShieldCheck size={14} />Activate Policy
                    {selectedPolicyRecord?.versionNumber ? ` (v${selectedPolicyRecord.versionNumber})` : ""}
                  </button>
                </div>
              </section>
              {uploadJobs.length > 0 && (
                <section className="upload-job-list" aria-live="polite" aria-label="Policy upload processing status">
                  {uploadJobs.map((job) => (
                    <div className={`upload-job ${job.status}`} key={job.job_id}>
                      <div className="upload-job-copy">
                        <strong>{job.filename}</strong>
                        <span>
                          {job.status === "queued" || job.status === "processing"
                            ? "Processing policy…"
                            : job.status === "completed"
                              ? `Processing complete · ${job.rule_count ?? 0} rules extracted`
                              : `Processing failed · ${job.error ?? "Unknown error"}`}
                        </span>
                      </div>
                      {job.status === "failed" && (
                        <button className="small-button" onClick={() => void retryPolicyUpload(job.job_id)}>
                          <RefreshCw size={12} />Retry processing
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )}

              <section className="policy-summary panel">
                <div className="policy-emblem"><ShieldCheck size={20} /></div>
                <div className="policy-summary-copy"><div><h2>{selectedPolicy}</h2><span className={`live-label ${selectedPolicyIsActive ? "" : "checking"}`}>{selectedPolicyStatus.toUpperCase()}</span><span className="subtle-badge">{selectedPolicyRecord?.versionNumber ? `v${selectedPolicyRecord.versionNumber}` : "v1.0"}</span></div><p>{selectedPolicyIsActive ? "Active for account decisions" : selectedPolicyStatus === "draft" ? "Draft version · review its rules before activation" : "Illustrative workspace policy"} <b>·</b> {selectedPolicyRules.length} rules shown <b>·</b> {selectedPolicyRecord?.updated ?? "Updated recently"}</p></div>
                <div className="policy-stats"><div><span>EXECUTIONS (24H)</span><strong>148,290</strong></div><div><span>PASS RATE</span><strong className="green-text">94.2%</strong></div><div><span>AVG LATENCY</span><strong>1.2ms</strong></div></div>
              </section>
              <div className="policy-workspace">
                <section className="panel rule-panel">
                  <div className="rule-toolbar">
                    <label className="screen-search"><Search size={14} /><input value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} placeholder="Filter by rule ID, AST token, or predicate…" /></label>
                    <select aria-label="Filter rules by decision" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All statuses</option><option>APPROVED</option><option>MGR APPROVAL</option><option>FIN APPROVAL</option><option>FRAUD REVIEW</option></select>
                    <button className="icon-button square-button" title="Clear filters" onClick={() => { setRuleSearch(""); setFilter("All statuses"); }}><SlidersHorizontal size={15} /></button>
                  </div>
                  <div className="table-scroll"><table className="rules-table"><thead><tr><th>RULE ID</th><th>CONDITION EXPRESSION</th><th>DECISION</th><th>PRIORITY</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
                    {selectedPolicyRules.filter((rule) => rule.id.toLowerCase().includes(ruleSearch.toLowerCase()) || rule.condition.toLowerCase().includes(ruleSearch.toLowerCase())).filter((rule) => filter === "All statuses" || (filter === "APPROVED" ? rule.decision === "APPROVE" : rule.decision === filter.replace("MGR", "MANAGER").replace("FIN", "FINANCE"))).map((rule, index) => (
                      <tr key={rule.id} className={selectedRule === rule.id ? "selected-row" : ""} onClick={() => setSelectedRule(rule.id)}><td className="rule-cell">{rule.id}</td><td className="condition-cell">{rule.condition}</td><td><span className={`decision-chip ${statusClass(rule.decision === "APPROVE" ? "APPROVED" : rule.decision === "FRAUD REVIEW" ? "FRAUD REVIEW" : rule.decision === "FINANCE APPROVAL" ? "FIN APPROVAL" : "MGR APPROVAL")}`}>{rule.decision}</span></td><td>{rule.priority ?? index + 1}</td><td><span className={`policy-status ${selectedPolicyIsActive ? "" : "policy-status-draft"}`}><i />{selectedPolicyStatus}</span></td><td><button className="small-button" onClick={(event) => { event.stopPropagation(); setSelectedRule(rule.id); }}>{selectedRule === rule.id ? "Selected" : "Inspect"}</button></td></tr>
                    ))}
                  </tbody></table></div>
                  <div className="table-foot"><span><i />Showing {selectedPolicyRules.length} rules</span><span className="mono green-text">{selectedPolicyIsActive ? "Active policy rules" : "Draft rules · not used for decisions"}</span></div>
                </section>
                <aside className="panel inspector-panel">
                  <div className="panel-heading"><h2><SlidersHorizontal size={15} />Rule inspector</h2><span className="live-label">ACTIVE</span></div>
                  <p className="inspector-target">Target: <code>{selectedRule}</code></p>
                  <div className="inspector-facts"><div><span>RULE ORDER</span><strong>{(selectedPolicyRules.findIndex((rule) => rule.id === selectedRule) + 1) || "—"} (evaluation order)</strong></div><div><span>EVALUATED ACTION</span><strong className="green-text">{selectedPolicyRules.find((rule) => rule.id === selectedRule)?.decision ?? "—"}</strong></div></div>
                  <p className="eyebrow">SOURCE REFERENCE</p><div className="source-reference"><FileText size={13} />{selectedPolicy}<span>· extracted policy rule</span></div>
                  <p className="eyebrow">EXTRACTED TEXT CORPUS</p><blockquote>“{selectedPolicyRules.find((rule) => rule.id === selectedRule)?.source
    ?? "No extracted source text is available for this rule."}”</blockquote>
                  <div className="inspector-subhead"><span>AST RULE DEFINITION</span><button className="icon-button" onClick={() => setToast("Rule AST copied to clipboard.")} aria-label="Copy AST"><Copy size={13} /> Copy AST</button></div>
                  <pre className="code-block">{JSON.stringify({ rule_id: selectedRule, evaluation_order: selectedPolicyRules.findIndex((rule) => rule.id === selectedRule) + 1, condition: selectedPolicyRules.find((rule) => rule.id === selectedRule)?.condition, action: selectedPolicyRules.find((rule) => rule.id === selectedRule)?.decision, source: selectedPolicyRules.find((rule) => rule.id === selectedRule)?.source }, null, 2)}</pre>
                </aside>
              </div>
              <section className="panel execution-panel"><div className="panel-heading"><h2><GitBranch size={15} />Policy rule sequence</h2><span className="mono muted-text">{selectedPolicyRules.length} parsed rules · {selectedPolicyIsActive ? "active" : "draft"}</span></div><div className="execution-path"><span>PAYLOAD_IN</span><b />{selectedPolicyRules.slice(0, 5).map((rule) => <span key={rule.id}>{rule.id}</span>)}<CheckCircle2 size={18} className="green-text" /></div></section>
              <section className="panel section-panel policy-library">
                <div className="panel-heading section-heading"><div><h2><FolderOpen size={16} />Workspace policies</h2><p>Browse policies configured for this workspace.</p></div><label className="screen-search"><Search size={14} /><input value={policySearch} onChange={(event) => setPolicySearch(event.target.value)} placeholder="Search policies" /></label></div>
                <PolicyList
                  policies={policies.filter((policy) => policy.name.toLowerCase().includes(policySearch.toLowerCase()))}
                  onSelect={(policy) => {
                    setSelectedPolicy(policy.name);
                    setSelectedPolicyVersionId(policy.policyVersionId ?? null);
                    if (policy.ruleDetails?.length) setSelectedRule(policy.ruleDetails[0].id);
                    setToast(policy.status === "draft"
                      ? `${policy.name} is a draft; its rules are not used for decisions.`
                      : policy.status === "active"
                        ? `${policy.name} is active for backend decisions.`
                        : `${policy.name} is sample data; upload a policy to activate it in the backend.`);
                  }}
                  onActivate={(policy) => void updatePolicyVersion(policy, "activate")}
                  onRollback={(policy) => void updatePolicyVersion(policy, "rollback")}
                />
              </section>
            </div>
          )}

          {activePage === "Decision Playground" && (
            <div className="screen-stack">
              <div className="playground-intro"><span className="meta-pill"><Zap size={14} />EVALUATION ENGINE: <strong className="green-text">FastAPI connected contract</strong></span><span className="meta-pill mono">{hasApiPolicy ? "API-EXTRACTED RULES" : "SAMPLE RULES"} · {environment.toLowerCase()}</span></div>
              <div className="decision-playground-layout">
                <div className="screen-stack">
                  <section className="panel preset-panel"><div className="panel-heading"><h2>Quick telemetry presets</h2><span className="mono muted-text">Deterministic fixtures</span></div><div className="preset-grid">
                    <button onClick={() => applyPreset("Small Refund ($3k)", "3000", "Refund request for a damaged item. Customer supplied evidence.")}><strong>Small Refund ($3k)</strong><span>Expect: APPROVE</span><CheckCircle2 size={15} /></button>
                    <button onClick={() => applyPreset("Large Refund ($25k)", "25000", "High value refund request requiring manager approval.")}><strong>Large Refund ($25k)</strong><span>Expect: MGR APPROVAL</span><Clock3 size={15} /></button>
                    <button onClick={() => applyPreset("High Value ($75k)", "75000", "High value refund request requiring finance review.")}><strong>High Value ($75k)</strong><span>Expect: FINANCE REVIEW</span><Shield size={15} /></button>
                    <button onClick={() => applyPreset("Fraud Case (Flag)", "3000", "Refund request flagged for potential fraud review.")}><strong>Fraud Case (Flag)</strong><span>Expect: FRAUD REVIEW</span><AlertTriangle size={15} /></button>
                  </div></section>
                  <section className="panel section-panel playground-form-panel">
                    <div className="panel-heading section-heading"><div><h2><SlidersHorizontal size={16} />Request parameters</h2><p>Evaluate a request using the connected decision endpoint.</p></div><span className="mono green-text">{policies.reduce((sum, item) => sum + item.rules, 0)} rules active</span></div>
                    <form onSubmit={runDecision} className="decision-form">
                      <div className="active-policy-state"><span>BACKEND POLICY STATE</span><strong>{activeApiPolicyName ?? "No active policy"}</strong><small>The API evaluates only active versions in your personal workspace. Draft versions are excluded until explicitly activated.</small></div>
                      <label>Request subject<input value={request.subject} onChange={(event) => setRequest({ ...request, subject: event.target.value })} required /></label>
                      <label>Request details<textarea rows={4} value={request.body} onChange={(event) => setRequest({ ...request, body: event.target.value })} required /></label>
                      <div className="request-facts"><label>Amount (USD)<input type="number" min="0" step="0.01" value={request.amount} onChange={(event) => setRequest({ ...request, amount: event.target.value })} /></label><label>Purchase age (days)<input type="number" min="0" step="1" value={request.days} onChange={(event) => setRequest({ ...request, days: event.target.value })} /></label></div>
                      <div className="fixture-toggle"><span><strong>Evidence present</strong><small>Receipts, order ID, and supporting documentation verified.</small></span><button type="button" role="switch" aria-checked={request.evidence} aria-label="Toggle evidence present" className={`switch-toggle ${request.evidence ? "on" : ""}`} onClick={() => setRequest({ ...request, evidence: !request.evidence })}><span /></button></div>
                      <div className="fixture-toggle"><span><strong>Fraud indicator</strong><small>Flag the request for fraud rule evaluation.</small></span><button type="button" role="switch" aria-checked={request.fraud} aria-label="Toggle fraud indicator" className={`switch-toggle ${request.fraud ? "on" : ""}`} onClick={() => setRequest({ ...request, fraud: !request.fraud })}><span /></button></div>
                      <div className="form-actions"><button type="button" className="small-button" onClick={() => { setRequest({ subject: "Refund request", body: "Customer requests a refund for a damaged product.", amount: "3000", days: "10", evidence: true, fraud: false }); setDecisionResult(null); }}><RotateCw size={13} />Reset</button><button type="submit" className="primary-button"><Zap size={15} />Evaluate decision</button></div>
                    </form>
                  </section>
                  <div className="panel determinism-note"><ShieldCheck size={17} /><div><strong>Guaranteed determinism</strong><span>Rules execute in strict order without temperature variance, token stochasticity, or LLM ambiguity.</span></div></div>
                </div>
                <div className="screen-stack">
                  <section className={`panel verdict-panel ${decisionResult ? "verdict-ready" : ""}`}><div className="panel-heading"><h2><span className="live-dot" />Engine verdict</h2><span className="mono muted-text">Request ID: {decisionResult?.requestId ?? "—"}</span></div>
                    {decisionResult ? <><div className="verdict-main"><CheckCircle2 size={31} /><div><strong>{decisionResult.decision}</strong><span>Decision returned by the configured FastAPI engine.</span></div><small>REQUEST TIME<br /><b>{apiLatency ?? "—"}ms</b></small></div><div className="verdict-rationale"><h3>API evaluation result</h3><p>Intent: {decisionResult.intent} · Risk: {decisionResult.risk}. {decisionResult.requestApproval ? "The API requested approval." : "The API did not request approval."} {decisionResult.reason}</p></div><div className="verdict-facts"><div><span>ENGINE DECISION</span><strong>{decisionResult.decision}</strong></div><div><span>APPROVAL REQUIRED</span><strong>{decisionResult.requestApproval ? "Yes" : "No"}</strong></div><div><span>MATCHED RULES</span><strong>{decisionResult.rulesUsed.length ? decisionResult.rulesUsed.join(", ") : "No rule matched"}</strong></div></div></>
                      : <div className="empty-state"><Zap size={24} /><p>Run a request to see the engine verdict.</p><span>Choose a preset or edit the request parameters.</span></div>}
                  </section>
                  <section className="panel trace-panel"><div className="panel-heading"><h2><GitBranch size={15} />Active policy rules</h2><span className="mono muted-text">{engineRules.length} {hasApiPolicy ? "API extracted" : "demo"} rules</span></div><p className="trace-disclaimer">{decisionResult ? `Matched rule IDs returned by this request: ${decisionResult.rulesUsed.join(", ") || "none"}.` : "Rule definitions are shown for context; draft policies are never evaluated."}</p>{engineRules.slice(0, 6).map((rule, index) => <div className="trace-rule" key={rule.id}><div><span className="trace-number">{index + 1}</span><strong>{rule.id}</strong><code>Order: {index + 1}</code><span className="trace-state">{decisionResult?.rulesUsed.includes(rule.id) ? "MATCHED" : "DEFINITION"}</span></div><p>{rule.condition} → {rule.decision}</p></div>)}</section>
                </div>
              </div>
            </div>
          )}

          {activePage === "History" && (
            <div className="screen-stack">
              <section className="history-summary panel"><div><span>DECISION HISTORY · ORGANIZATION AUDIT</span><strong>Recent policy evaluations</strong></div><div><span>AUDIT RECORDS</span><strong>{filteredDecisions.length} <i className="live-dot" /></strong></div><div><span>AVERAGE LATENCY</span><strong className="green-text">{filteredDecisions.some((row) => row.latency !== undefined) ? `${(filteredDecisions.reduce((total, row) => total + (row.latency ?? 0), 0) / filteredDecisions.filter((row) => row.latency !== undefined).length).toFixed(1)}ms` : "Not recorded"}</strong></div><div><span>BACKEND STATUS</span><strong className={apiStatus === "online" ? "green-text" : "muted-text"}>{apiStatus === "online" ? "Connected" : apiStatus === "checking" ? "Checking" : "Offline"}</strong></div><button className="small-button" onClick={exportDecisions}><ArrowDownToLine size={14} />Export audit log</button></section>
              <div className="history-toolbar panel"><label className="screen-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter by request, rule, or policy…" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All statuses</option><option>APPROVED</option><option>MGR APPROVAL</option><option>FIN APPROVAL</option><option>FRAUD REVIEW</option></select><button className="small-button" onClick={() => { setSearch(""); setFilter("All statuses"); }}><Filter size={13} />Clear filters</button><span className="meta-pill"><Clock3 size={13} />Last 24 hours</span></div>
              <div className="history-layout">
                <section className="panel history-table-panel"><div className="table-scroll"><table><thead><tr><th>TIME (UTC)</th><th>REQUEST SUMMARY</th><th>POLICY VERSION</th><th>DECISION</th><th>MATCHED RULES</th></tr></thead><tbody>{filteredDecisions.map((row, index) => <tr key={row.requestId ?? `${row.rule}-${index}`} className={selectedDecision === index ? "selected-row" : ""} onClick={() => setSelectedDecision(index)}><td className="time-cell">{row.timestamp ? new Date(row.timestamp).toISOString().replace("T", " ").slice(0, 19) : `${date} ${row.time}`}</td><td>{row.request}</td><td className="policy-cell">{row.policy}</td><td><span className={`decision-chip ${statusClass(row.decision)}`}><i />{row.decision}</span></td><td className="rule-cell">{row.rule}</td></tr>)}{filteredDecisions.length === 0 && <tr><td colSpan={5} className="no-results">No audit records match these filters.</td></tr>}</tbody></table></div><div className="table-foot"><span>Showing <strong>{filteredDecisions.length}</strong> decisions from your account audit ledger</span><span className="table-foot-actions"><button onClick={exportDecisions}><ArrowDownToLine size={12} />Export CSV</button></span></div></section>
                <aside className="panel audit-panel"><div className="panel-heading"><h2><Network size={16} />Evaluation details</h2><span className="subtle-badge">{filteredDecisions[selectedDecision]?.requestId ? "AUDITED" : "SAMPLE"}</span></div><div className="trace-id">REQUEST: <code>{filteredDecisions[selectedDecision]?.requestId ?? "No audit request selected"}</code></div><div className="audit-facts"><div><span>OUTCOME</span><strong className="decision-chip approval">{filteredDecisions[selectedDecision]?.decision ?? "—"}</strong></div><div><span>POLICY GROUP / VERSION</span><strong>{filteredDecisions[selectedDecision]?.policyGroupId ?? "—"} / {filteredDecisions[selectedDecision]?.policyVersionId ?? "—"}</strong></div><div><span>TIMESTAMP (UTC)</span><strong>{filteredDecisions[selectedDecision]?.timestamp ?? "—"}</strong></div><div><span>REASON</span><strong>{filteredDecisions[selectedDecision]?.reason ?? "Unavailable"}</strong></div><div><span>MATCHED RULES</span><strong>{filteredDecisions[selectedDecision]?.rule ?? "—"}</strong></div></div><div className="inspector-subhead"><span>RECORDED INPUT FACTS</span><code>application/json</code></div><pre className="code-block">{JSON.stringify(filteredDecisions[selectedDecision]?.input ?? { note: "Sample record; request payload is unavailable." }, null, 2)}</pre><p className="trace-disclaimer">Decision outcomes, policy-version provenance, evaluated rules, and recorded input facts are loaded from your account audit API. Browser-measured latency is not part of the server audit record.</p></aside>
              </div>
            </div>
          )}

          {activePage === "API Playground" && (
            <div className="screen-stack">
              <div className="api-playground-heading"><div><span className="meta-pill"><Code2 size={13} />REST &amp; SDK</span><p>Send a request to your configured FastAPI decision endpoint and inspect its response.</p></div><div className="endpoint-select"><span>POST</span><code>{apiUrl.replace(/\/+$/, "")}/v1/gmail/decide</code><span className={`live-label ${apiStatus}`}>{apiStatus === "online" ? "CONNECTED" : "OFFLINE"}</span></div></div>
              <div className="api-playground-layout">
                <div className="screen-stack">
                  <section className="panel api-editor-panel">
                    <div className="editor-tabs"><button className="editor-tab active"><Braces size={14} />Body (JSON)</button><span>Headers <i>1</i></span><span>Auth (Bearer JWT)</span><code>application/json</code></div>
                    <form onSubmit={runApiRequest}><label className="sr-only" htmlFor="api-request-body">Request JSON</label><textarea id="api-request-body" spellCheck={false} value={apiRequestJson} onChange={(event) => setApiRequestJson(event.target.value)} /><div className="editor-footer"><span className="green-text">● JSON editor</span><span>{new Blob([apiRequestJson]).size} bytes</span><button type="button" className="small-button" onClick={() => setApiRequestJson(initialApiRequest)}>Revert to default</button><button type="submit" className="primary-button" disabled={apiRequestBusy}><ArrowRight size={14} />{apiRequestBusy ? "Sending…" : "Send request"}</button></div></form>
                  </section>
                  <section className="panel contract-panel"><div className="panel-heading"><h2><ShieldCheck size={15} />Runtime contract state</h2><span className="green-text mono">Connected configuration</span></div><div><span>Engine version</span><strong>v1.4.2</strong><span>API base URL</span><strong>{apiUrl.replace(/^https?:\/\//, "")}</strong></div></section>
                </div>
                <div className="screen-stack">
                  <section className="panel response-panel"><div className="response-status"><span className={`status-text ${apiStatus}`}>{apiStatus === "online" ? "API ONLINE" : "READY TO SEND"}</span><span>{apiLatency ? `${apiLatency} ms` : "— ms"}</span><span>application/json</span></div><div className="editor-tabs"><button className="editor-tab active">Response body</button><span>Audit trace</span><span>SDK code</span><button className="icon-button" onClick={() => setToast("Copy the response JSON from the panel.")}><Copy size={13} />Copy</button></div><pre className="response-json">{apiResponseJson || '{\n  "status": "ready",\n  "message": "Send a request to see the API response here."\n}'}</pre><div className="response-actions"><button onClick={() => setToast("API documentation: open your backend at /docs")}><BookOpen size={13} />API docs</button><button onClick={() => choosePage("Decision Playground")}>Open in Decision Playground <ArrowUpRight size={13} /></button></div></section>
                  <section className="panel latency-panel"><div className="panel-heading"><h2>Engine latency breakdown</h2><span className="mono">{apiLatency ? `${apiLatency}ms total RTT` : "Awaiting request"}</span></div><div className="latency-track"><i /><i /><i /></div><div className="latency-legend"><span>Rule engine</span><span>FastAPI</span><span>Network</span></div></section>
                </div>
              </div>
            </div>
          )}

          {activePage === "Settings" && (
            <div className="screen-stack">
              <div className="settings-title-row"><div><span className="eyebrow">PERSONAL WORKSPACE CONFIGURATION · CLUSTER: <code>local-dev</code></span><h2>Settings <small>rev_hash: 7f89b2c</small></h2><p>Configure your workspace, runtime environments, policy compiler preferences, and webhook destinations.</p></div><button className="primary-button" onClick={() => setToast("Settings saved for this browser session.")}><Check size={15} />Save changes</button></div>
              <p className="trace-disclaimer">API URL, environment selection, and health checks use the connected frontend settings. Your signed-in account owns its private policy workspace; policy activation and decision audit data are persisted by the backend.</p>
              <nav className="settings-tabs" aria-label="Settings sections">{(["General", "Environments & Routing", "Webhooks & Alerts", "Audit Ledger", "Account"] as SettingsTab[]).map((tab) => <button key={tab} className={settingsTab === tab ? "active" : ""} onClick={() => setSettingsTab(tab)}>{tab}</button>)}<span>DRAFT CHANGES: <b>0 pending</b></span></nav>
              <div className="settings-layout">
                <div className="screen-stack">
                  <section className="panel settings-card"><div className="panel-heading"><h2><Building2 size={16} />{settingsTab === "General" ? "Workspace & Engine Identity" : settingsTab}</h2><span className="subtle-badge">AST DETERMINISM</span></div>
                    {settingsTab === "General" && <><div className="settings-input-grid"><label>Workspace name<input defaultValue="My Policy Workspace" /></label><label>Signed-in account<input value={auth.userName ?? "Sign in required"} readOnly /></label></div><div className="setting-label-row"><span>ENGINE RUNTIME VERSION PINNING</span><span className="green-text mono">Verified Build (Deterministic AST)</span></div><div className="runtime-cards">{["v1.4.2 (Latest Stable)", "v1.4.1 (LTS)", "v1.5.0-rc2 (Beta)"].map((version, index) => <button key={version} onClick={() => setToast(`${version} selected.`)} className={index === 0 ? "active" : ""}><strong>{version}</strong><span>{["Production canonical AST. Deterministic guarantees active.", "Previous frozen compiler. Maintained until Q3.", "Next-generation policy engine preview."][index]}</span></button>)}</div><div className="setting-label-row">EXECUTION STRICTNESS</div><div className="strictness-options"><button className="active"><ShieldCheck size={16} /><span><strong>Zero-Hallucination Enforced</strong><small>Strict determinism. Ambiguous branches abort with safe fail-close code.</small></span></button><button onClick={() => setToast("Permissive fallback is unavailable in this demo.")}><CircleHelp size={16} /><span><strong>Permissive Fallback</strong><small>Keep deterministic execution enabled for production workflows.</small></span></button></div></>}
                    {settingsTab === "Environments & Routing" && <><form className="settings-form" onSubmit={saveApiUrl}><label>NEXT_PUBLIC_API_URL<input value={apiUrlDraft} onChange={(event) => setApiUrlDraft(event.target.value)} placeholder="http://localhost:8000" /></label><button className="primary-button" type="submit"><Check size={15} />Save connection</button></form><div className="setting-row"><div><strong>Active environment</strong><span>Switch the workspace environment label.</span></div><button className="meta-pill setting-toggle" onClick={() => setEnvironment(environment === "PROD" ? "DEV" : "PROD")}>{environment === "PROD" ? "Production" : "Development"} <ChevronDown size={14} /></button></div><div className="setting-row"><div><strong>API health check</strong><span>Automatically checks the backend every 30 seconds.</span></div><span className={`status-text ${apiStatus}`}>{apiStatus === "online" ? "Connected" : apiStatus === "checking" ? "Checking" : "Offline"}</span></div><button className="small-button" onClick={() => void checkApi(apiUrl)}><RefreshCw size={13} />Test connection</button></>}
                    {settingsTab === "Webhooks & Alerts" && <div className="settings-input-grid"><label>Manager approval webhook<input placeholder="https://hooks.example.com/manager" /></label><label>Fraud alert webhook<input placeholder="https://hooks.example.com/fraud" /></label><div className="setting-row"><div><strong>Delivery signing</strong><span>Sign webhook events with an HMAC secret.</span></div><span className="status-text">Enabled</span></div></div>}
                    {settingsTab === "Audit Ledger" && <div className="settings-ledger"><div><ShieldCheck size={18} /><span><strong>Immutable audit ledger</strong><small>Decision events are recorded with timestamps and evaluation metadata.</small></span><span className="status-text">Enabled</span></div><div><span>Retention period</span><strong>90 days</strong></div><div><span>Signature verification</span><strong className="green-text">Available</strong></div></div>}
                    {settingsTab === "Account" && <div className="settings-ledger"><div><span><strong>Signed-in account</strong><small>{auth.userName ?? "Sign in to access your private policy workspace."}</small></span><span className="status-text">{auth.signedIn ? "Backend Session" : "Sign in required"}</span></div><p className="trace-disclaimer">Policies, versions, activation history, and decision records are scoped to your signed-in account.</p></div>}
                  </section>
                  <section className="panel settings-card"><div className="panel-heading"><h2><Plug size={16} />Backend integration &amp; service layer</h2><span className={`live-label ${apiStatus}`}>{apiStatus === "online" ? "PROD CONNECTED" : "DEMO / OFFLINE"}</span></div><div className="integration-line"><code>NEXT_PUBLIC_API_URL</code><span>{apiUrl}</span><button className="small-button" onClick={() => void checkApi(apiUrl)}><RefreshCw size={13} />Test ping</button></div><div className="diagnostic-row"><span><i className={apiStatus === "online" ? "" : "muted"} />GET /health</span><strong className={apiStatus === "online" ? "good" : "muted-text"}>{apiStatus === "online" ? `HTTP 200 OK · ${apiLatency}ms` : "Waiting for connection"}</strong></div></section>
                </div>
                <div className="screen-stack">
                  <section className="panel settings-card webhook-card"><div className="panel-heading"><h2><Webhook size={16} />Webhook dispatch &amp; escalations</h2><span className="mono muted-text">OUTBOUND HTTP</span></div><label>MANAGER APPROVAL WEBHOOK<input placeholder="https://hooks.example.com/manager" /></label><p>Dispatches an approval event when an evaluated request needs escalation.</p><label>FRAUD ALERT DISPATCH<input placeholder="https://hooks.example.com/fraud" /></label><p>Sends alerts when a fraud review decision is produced.</p><button className="small-button" onClick={() => setToast("Webhook settings saved for this browser session.")}><Check size={13} />Save webhook settings</button></section>
                  <section className="panel settings-card"><div className="panel-heading"><h2>Evaluation latency profile</h2><span className="green-text mono">p99: {apiLatency ?? 14}ms</span></div><p className="muted-text">Recent connectivity checks and request timings.</p><div className="latency-bars">{[29, 39, 24, 49, 34, 65, 44, 31, 53, 36, 62, 47, 41, 59].map((height, index) => <i style={{ height: `${height}px` }} className={index === 8 || index === 11 || index === 13 ? "highlight" : ""} key={index} />)}</div><div className="latency-legend"><span>60 min ago</span><span>Now (Deterministic AST Engine)</span></div></section>
                </div>
              </div>
            </div>
          )}

          {activePage === "API Keys" && (
            <div className="screen-stack">
              <div className="api-keys-heading"><div><span className="eyebrow">ENGINE SECURITY · RBAC ENFORCED</span><h2>API Keys</h2><p>Manage credentials used by integrations. Real key provisioning requires a connected key-management service.</p></div><div className="key-toolbar"><label className="screen-search"><Search size={14} /><input value={keySearch} onChange={(event) => setKeySearch(event.target.value)} placeholder="Filter keys or scopes…" /></label><button className="primary-button" onClick={createDemoKey}><Plus size={15} />Create demo record</button></div></div>
              <div className="key-metrics"><MetricCard title="ACTIVE API KEYS" value={String(apiKeys.filter((key) => key.active).length)} note="/ 10 provisioned" detail="Demo registry records only" icon={<KeyRound size={15} />} accent="purple" /><MetricCard title="TOTAL REQUESTS (30D)" value="1.48M" note="↗ 12.4%" detail="FastAPI Gateway · sample metric" icon={<Zap size={15} />} accent="green" /><MetricCard title="P99 AUTH LATENCY" value="1.6ms" note="−0.3ms" detail="Sample metric" icon={<Clock3 size={15} />} accent="amber" /><MetricCard title="SECURITY STATUS" value="Demo" note="not provisioned" detail="No real credentials are stored" icon={<ShieldCheck size={15} />} accent="green" /></div>
              <section className="security-directive"><div><LockKeyhole size={17} /></div><p><strong>Critical security directive</strong><span>Never expose API secret keys in client-side code. Store credentials on your server and send authenticated requests through a trusted backend.</span></p><code>Authorization: Bearer &lt;API_KEY&gt;</code></section>
              <section className="panel key-registry"><div className="registry-heading"><strong>DEMO CREDENTIALS REGISTRY</strong><span>{apiKeys.length} records · illustrative data only</span></div><div className="table-scroll"><table><thead><tr><th>NAME &amp; KEY PREFIX</th><th>SCOPE / PERMISSIONS</th><th>CREATED</th><th>LAST USED</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{apiKeys.filter((key) => `${key.name} ${key.scope}`.toLowerCase().includes(keySearch.toLowerCase())).map((key, index) => <tr key={`${key.prefix}-${index}`}><td><strong className="key-name"><KeyRound size={13} />{key.name}</strong><code className="key-prefix">{key.prefix}</code></td><td><span className="scope-badge">{key.scope}</span><small>Scope: Workspace policies</small></td><td>Oct {7 - index}, 2026<br /><small>Elena Vance</small></td><td><span className="green-text">●</span> {key.lastUsed}<br /><small>Demo record</small></td><td><span className={`status-text ${key.active ? "" : "offline"}`}>{key.active ? "Active" : "Revoked"}</span></td><td><button className="icon-button" title="Demo credentials do not contain secrets" onClick={() => setToast("Demo records do not contain real secret values.")}><Eye size={14} /></button><button className="icon-button danger-action" title={key.active ? "Revoke demo record" : "Reactivate demo record"} onClick={() => setApiKeys((current) => current.map((item) => item.prefix === key.prefix ? { ...item, active: !item.active } : item))}>{key.active ? <Trash2 size={14} /> : <RotateCw size={14} />}</button></td></tr>)}</tbody></table></div><p className="key-hint"><CircleHelp size={15} />These rows are sample UI records only; no secret values are generated or stored in your browser.</p></section>
            </div>
          )}
        </div>
        <footer className="app-footer"><span>Policy Flow</span><span>Deterministic decisions, made explainable.</span><button onClick={() => setToast("API docs: open your backend at /docs")}><BookOpen size={13} />API documentation</button></footer>
      </main>

      {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}
    </div>
  );
}

  function MetricCard({ title, value, note, detail, icon, accent }: { title: string; value: string; note: string; detail: string; icon: React.ReactNode; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><p className="metric-title">{title}</p><div className="metric-value-row"><strong>{value}</strong><span className={`metric-note ${accent}`}>{note}</span></div><p className="metric-detail">{detail}</p></article>;
}

function DecisionTable({ decisions, filter, filterOpen, search, onFilterClick, onFilterChange, onSearch, onExport, expanded = false }: {
  decisions: DecisionRow[]; filter: string; filterOpen: boolean; search: string; onFilterClick: () => void;
  onFilterChange: (value: string) => void; onSearch: (value: string) => void; onExport: () => void; expanded?: boolean;
}) {
  const choices = ["All statuses", "APPROVED", "MGR APPROVAL", "FIN APPROVAL", "FRAUD REVIEW"];
  return <section className={`panel decisions-panel ${expanded ? "expanded" : ""}`}>
    <div className="panel-heading"><h2><FileText size={15} />{expanded ? "All Decisions" : "Recent Decisions"}<span className="subtle-badge">{expanded ? "Audit log" : "Live Audit"}</span></h2>
      <div className="table-actions"><label className="search-field"><Search size={13} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search" aria-label="Search decisions" /></label>
        <div className="filter-wrap"><button className="small-button" onClick={onFilterClick}><Filter size={12} />Filter</button>{filterOpen && <div className="filter-menu">{choices.map((choice) => <button key={choice} className={filter === choice ? "selected" : ""} onClick={() => onFilterChange(choice)}>{choice}{filter === choice && <Check size={12} />}</button>)}</div>}</div>
        <button className="small-button" onClick={onExport}><ArrowDownToLine size={12} />Export</button></div>
    </div>
    <div className="table-scroll"><table><thead><tr><th>TIME</th><th>REQUEST</th><th>DECISION</th><th>POLICY</th><th>RULE</th><th>LATENCY</th></tr></thead><tbody>
      {decisions.map((row, index) => <tr key={row.requestId ?? `${row.rule}-${index}`}><td className="time-cell">{row.time}</td><td className={row.decision === "FRAUD REVIEW" ? "fraud-request" : ""}>{row.decision === "FRAUD REVIEW" && <AlertTriangle size={12} />}{row.request}</td><td><span className={`decision-chip ${statusClass(row.decision)}`}><i />{row.decision}</span></td><td className="policy-cell">{row.policy}</td><td className="rule-cell">{row.rule}</td><td className={`latency-cell ${row.latency !== undefined && row.latency <= 12 ? "fast" : ""}`}>{row.latency === undefined ? "—" : `${row.latency}ms`}</td></tr>)}
      {decisions.length === 0 && <tr><td colSpan={6} className="no-results">No decisions match your search or status filter.</td></tr>}
    </tbody></table></div>
    <div className="table-foot"><span><i />Showing {decisions.length} {expanded ? "session" : "visible"} record{decisions.length === 1 ? "" : "s"}</span><span className="table-foot-actions"><button onClick={onFilterClick}><Filter size={11} />Filter by status</button><button onClick={onExport}><ArrowDownToLine size={11} />Export CSV</button></span></div>
  </section>;
}

function PolicyList({
  policies,
  onSelect,
  onActivate,
  onRollback,
}: {
  policies: Policy[];
  onSelect: (policy: Policy) => void;
  onActivate?: (policy: Policy) => void;
  onRollback?: (policy: Policy) => void;
}) {
  return <div className="policy-list">{policies.map((policy) => {
    const status = policy.status ?? (policy.draft ? "draft" : "active");
    const isActive = status === "active";
    const versionLabel = policy.versionNumber ? `v${policy.versionNumber}` : `#${policy.policyVersionId}`;
    return <div className="policy-entry" key={policy.policyVersionId ?? policy.name}>
      <button className="policy-item" onClick={() => onSelect(policy)}><div className="policy-top"><strong>{policy.name}{policy.versionNumber ? ` · v${policy.versionNumber}` : ""}</strong><span className={`policy-status ${isActive ? "" : "draft"}`}><i />{status}</span></div><div className="policy-bottom"><span>{policy.rules} rules · {policy.updated}</span><strong>{isActive ? `${policy.decisions} decisions today` : `${policy.decisions} test runs`}</strong></div></button>
      {status === "draft" && policy.policyVersionId && policy.policyGroupId && onActivate && (
        <button className="policy-rollback policy-activate" onClick={() => onActivate(policy)}>Activate {versionLabel}</button>
      )}
      {status === "superseded" && policy.policyVersionId && policy.policyGroupId && onRollback && (
        <button className="policy-rollback" onClick={() => onRollback(policy)}>Rollback to {versionLabel}</button>
      )}
    </div>;
  })}
    {policies.length === 0 && <div className="no-results">No policies uploaded yet.</div>}</div>;
}

function FeatureCard({ icon, title, heading, note, variant }: { icon: React.ReactNode; title: string; heading: string; note: string; variant: string }) {
  return <article className="feature-card"><div className={`feature-art ${variant}`}><div className="art-grid">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div></div><div className="feature-copy"><span>{title}</span><strong>{heading}</strong><small>{note}</small></div></article>;
}

function DiagnosticRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="diagnostic-row"><span><i className={good ? "" : "muted"} />{label}</span><strong className={good ? "good" : "muted-text"}>{value}</strong></div>;
}
