import type { NovelWorkflowCheckpoint } from "./novelWorkflow";
import type { TaskStatus } from "./task";

export type FirstNovelMilestoneKey =
  | "environment"
  | "idea_direction"
  | "preparation"
  | "production_choice"
  | "first_chapter";

export interface FirstNovelMilestone {
  key: FirstNovelMilestoneKey;
  title: string;
  description: string;
  status: "pending" | "current" | "completed" | "attention";
  resultSummary?: string | null;
}

export interface FirstNovelOnboardingProjection {
  graduated: boolean;
  currentMilestone: FirstNovelMilestoneKey;
  completedCount: number;
  totalCount: number;
  headline: string;
  description: string;
  reason: string;
  primaryAction: {
    label: string;
    route: string;
    kind: "navigate" | "resume";
  };
  novel: {
    id: string;
    title: string;
    creationExperience: "simple" | "professional";
  } | null;
  directorTask: {
    id: string;
    status: TaskStatus;
    checkpointType: NovelWorkflowCheckpoint | null;
    currentStage: string | null;
    currentItemLabel: string | null;
    lastError: string | null;
  } | null;
  firstReadableChapter: {
    id: string;
    title: string;
    order: number;
    novelId: string;
  } | null;
  milestones: FirstNovelMilestone[];
  optionalEnhancements: Array<{
    key: "knowledge" | "style" | "image";
    title: string;
    description: string;
    route: string;
  }>;
}
