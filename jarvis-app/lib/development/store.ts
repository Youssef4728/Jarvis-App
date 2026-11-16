import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import type { DevelopmentItemInput, DevelopmentStatus, VisionRevisionInput } from "./types";

export class DevelopmentStoreError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "DevelopmentStoreError";
  }
}

function mapRpcError(error: { code?: string; message?: string }): DevelopmentStoreError {
  const message = error.message ?? "";
  if (message.includes("development_idempotency_conflict")) {
    return new DevelopmentStoreError("idempotency_key_conflict", 409);
  }
  if (message.includes("development_item_not_found")) {
    return new DevelopmentStoreError("development_item_not_found", 404);
  }
  if (message.includes("development_item_conflict")) {
    return new DevelopmentStoreError("development_item_conflict", 409);
  }
  if (
    message.includes("development_item_transition_invalid")
    || message.includes("development_item_dependencies_incomplete")
    || message.includes("development_block_reason_required")
  ) {
    return new DevelopmentStoreError("development_transition_rejected", 409);
  }
  if (error.code === "23503") return new DevelopmentStoreError("development_reference_invalid", 400);
  return new DevelopmentStoreError("development_store_unavailable", 503);
}

function requireRpcRow(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") return data[0] as Record<string, unknown>;
  throw new DevelopmentStoreError("development_store_unavailable", 503);
}

export function createDevelopmentStore(client: SupabaseClient = getSupabaseClient()) {
  return {
    async getSnapshot() {
      const [visionResult, itemResult, eventResult] = await Promise.all([
        client.from("master_vision_revisions").select("id,revision,title,content,created_by,created_at").order("revision", { ascending: false }).limit(1),
        client.from("development_items").select("*").order("priority", { ascending: true }).order("created_at", { ascending: true }).limit(200),
        client.from("development_item_events").select("id,item_id,vision_revision_id,event_type,actor,from_status,to_status,summary,metadata,created_at").order("created_at", { ascending: false }).limit(100),
      ]);
      if (visionResult.error || itemResult.error || eventResult.error) {
        throw new DevelopmentStoreError("development_store_unavailable", 503);
      }
      return {
        vision: visionResult.data?.[0] ?? null,
        items: itemResult.data ?? [],
        events: eventResult.data ?? [],
      };
    },

    async createVisionRevision(input: VisionRevisionInput) {
      const { data, error } = await client.rpc("create_master_vision_revision", {
        p_title: input.title,
        p_content: input.content,
        p_idempotency_key: input.idempotencyKey,
        p_actor: "user",
      });
      if (error) throw mapRpcError(error);
      return requireRpcRow(data);
    },

    async createItem(input: DevelopmentItemInput) {
      const { data, error } = await client.rpc("create_development_item", {
        p_vision_revision_id: input.visionRevisionId,
        p_parent_id: input.parentId ?? null,
        p_item_type: input.type,
        p_title: input.title,
        p_description: input.description ?? "",
        p_priority: input.priority,
        p_acceptance_criteria: input.acceptanceCriteria,
        p_test_requirements: input.testRequirements,
        p_affected_components: input.affectedComponents,
        p_estimated_effort_minutes: input.estimatedEffortMinutes ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_dependencies: input.dependencies,
        p_actor: "user",
      });
      if (error) throw mapRpcError(error);
      return requireRpcRow(data);
    },

    async transitionItem(itemId: string, expectedStatus: DevelopmentStatus, nextStatus: DevelopmentStatus, summary: string) {
      const { data, error } = await client.rpc("transition_development_item", {
        p_item_id: itemId,
        p_expected_status: expectedStatus,
        p_next_status: nextStatus,
        p_actor: "user",
        p_summary: summary,
      });
      if (error) throw mapRpcError(error);
      return requireRpcRow(data);
    },
  };
}
