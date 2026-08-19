import type { getActiveAutoDirectorTask } from "@/api/novel/novelWorkflow";
import type { getDirectorBookAutomationProjection } from "@/api/novel/novelDirector";
import NovelExistingProjectTakeoverDialog from "../components/takeover/NovelExistingProjectTakeoverDialog";
import { resolveTakeoverDialogContextTaskId } from "./novelEditAutomationStatus";

type TakeoverDialogProps = Parameters<typeof NovelExistingProjectTakeoverDialog>[0];

interface NovelEditStepTakeoverEntryProps {
  id: string;
  basicForm: TakeoverDialogProps["basicForm"];
  genreOptions: TakeoverDialogProps["genreOptions"];
  storyModeOptions: TakeoverDialogProps["storyModeOptions"];
  worldOptions: TakeoverDialogProps["worldOptions"];
  directorTaskId: string;
  activeAutoDirectorTask: Awaited<ReturnType<typeof getActiveAutoDirectorTask>>["data"];
  bookAutomationProjection: NonNullable<Awaited<ReturnType<typeof getDirectorBookAutomationProjection>>["data"]>["projection"] | null | undefined;
  step: TakeoverDialogProps["defaultEntryStep"];
  variant?: TakeoverDialogProps["triggerVariant"];
}

export default function NovelEditStepTakeoverEntry({
  id,
  basicForm,
  genreOptions,
  storyModeOptions,
  worldOptions,
  directorTaskId,
  activeAutoDirectorTask,
  bookAutomationProjection,
  step,
  variant = "default",
}: NovelEditStepTakeoverEntryProps) {
  const takeoverContextTaskId = resolveTakeoverDialogContextTaskId({
    directorTaskId,
    activeAutoDirectorTask,
    projection: bookAutomationProjection,
  });

  return (
    <NovelExistingProjectTakeoverDialog
      novelId={id}
      basicForm={basicForm}
      genreOptions={genreOptions}
      storyModeOptions={storyModeOptions}
      worldOptions={worldOptions}
      triggerVariant={variant}
      defaultEntryStep={step}
      workflowTaskId={takeoverContextTaskId}
    />
  );
}
