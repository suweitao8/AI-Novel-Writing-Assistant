import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import { Navigate, useParams, useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";

const ComicDramaListPage = lazy(() => import("@/pages/drama/comicDrama/ComicDramaListPage"));
const ComicDramaStudioPage = lazy(() => import("@/pages/drama/comicDrama/ComicDramaStudioPage"));
const DramaBlocking3DPage = lazy(() => import("@/pages/drama/comicDrama/DramaBlocking3DPage"));
const DramaScene3DPage = lazy(() => import("@/pages/drama/comicDrama/DramaScene3DPage"));
const DramaProjectPage = lazy(() => import("@/pages/drama/DramaProjectPage"));
const ModelLibraryPage = lazy(() => import("@/pages/models/ModelLibraryPage"));
const ModelEditorPage = lazy(() => import("@/pages/models/ModelEditorPage"));
const AnimationLibraryPage = lazy(() => import("@/pages/animations/AnimationLibraryPage"));
const AnimationPreviewPage = lazy(() => import("@/pages/animations/AnimationPreviewPage"));
const TaskCenterPage = lazy(() => import("@/pages/tasks/TaskCenterPage"));
const ArtStyleSettingsPage = lazy(() => import("@/pages/settings/views/ArtStyleSettingsPage"));
const RecordsSettingsPage = lazy(() => import("@/pages/settings/views/RecordsSettingsPage"));
const KnowledgePage = lazy(() => import("@/pages/knowledge/KnowledgePage"));
const SettingsOverviewPage = lazy(() => import("@/pages/settings/views/SettingsOverviewPage"));
const ModelsSettingsPage = lazy(() => import("@/pages/settings/views/ModelsSettingsPage"));
const KnowledgeSettingsPage = lazy(() => import("@/pages/settings/views/KnowledgeSettingsPage"));
const NarratorVoiceSettingsPage = lazy(() => import("@/pages/settings/views/NarratorVoiceSettingsPage"));
const StudioEnvironmentPreviewPage = lazy(() => import("@/pages/settings/views/StudioEnvironmentPreviewPage"));

function RedirectToDrama() {
  return <Navigate to="/drama" replace />;
}

function RedirectLegacyNovelRoute() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/drama/studio/${encodeURIComponent(id)}` : "/drama"} replace />;
}

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <RedirectToDrama /> },
      { path: "novels", element: <RedirectToDrama /> },
      { path: "create", element: <RedirectToDrama /> },
      { path: "novels/create", element: <RedirectToDrama /> },
      { path: "novels/auto-director", element: <RedirectToDrama /> },
      { path: "novels/:id/*", element: <RedirectLegacyNovelRoute /> },
      { path: "drama", element: <ComicDramaListPage /> },
      { path: "drama/studio/:novelId", element: <ComicDramaStudioPage /> },
      { path: "drama/studio/:novelId/scenes/:sceneId/states/:stateId/3d", element: <DramaScene3DPage /> },
      { path: "drama/studio/:novelId/scenes/:sceneId/3d", element: <DramaScene3DPage /> },
      { path: "drama/projects/:id/shots/:shotId/blocking-3d", element: <DramaBlocking3DPage /> },
      { path: "drama/projects/:id", element: <DramaProjectPage /> },
      { path: "models", element: <ModelLibraryPage /> },
      { path: "models/:modelId", element: <ModelEditorPage /> },
      { path: "animations", element: <AnimationLibraryPage /> },
      { path: "animations/:animationId", element: <AnimationPreviewPage /> },
      { path: "comic/*", element: <RedirectToDrama /> },
      { path: "creative-hub", element: <RedirectToDrama /> },
      { path: "chat", element: <RedirectToDrama /> },
      { path: "book-analysis", element: <RedirectToDrama /> },
      { path: "tasks", element: <TaskCenterPage /> },
      { path: "auto-director/*", element: <RedirectToDrama /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "genres", element: <RedirectToDrama /> },
      { path: "story-modes", element: <RedirectToDrama /> },
      { path: "titles", element: <RedirectToDrama /> },
      { path: "prompt-workbench", element: <RedirectToDrama /> },
      { path: "anti-ai-rules", element: <RedirectToDrama /> },
      { path: "settings/model-routes", element: <Navigate to="/settings/models" replace /> },
      { path: "settings/models", element: <ModelsSettingsPage /> },
      { path: "settings/director", element: <Navigate to="/settings" replace /> },
      { path: "settings/knowledge", element: <KnowledgeSettingsPage /> },
      { path: "settings/narrator-voice/hdri/:environmentId", element: <StudioEnvironmentPreviewPage /> },
      { path: "settings/narrator-voice", element: <NarratorVoiceSettingsPage /> },
      { path: "settings/appearance", element: <Navigate to="/settings" replace /> },
      { path: "settings/art-style", element: <ArtStyleSettingsPage /> },
      { path: "art-style", element: <Navigate to="/settings/art-style" replace /> },
      { path: "settings/records", element: <RecordsSettingsPage /> },
      { path: "settings", element: <SettingsOverviewPage /> },
      { path: "worlds/*", element: <RedirectToDrama /> },
      { path: "style-engine", element: <RedirectToDrama /> },
      { path: "writing-formula", element: <RedirectToDrama /> },
      { path: "base-characters", element: <RedirectToDrama /> },
      { path: "*", element: <RedirectToDrama /> },
    ],
  },
];

export default function AppRouter() {
  return useRoutes(routes);
}
