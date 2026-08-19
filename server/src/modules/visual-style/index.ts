/**
 * 画面风格模块对外门面。
 *
 * 业务实现：services/visualStyle/VisualStyleService.ts（与 comic 等模块一致：
 * modules/<x>/http 只放路由入口，业务在 services/<x>）。
 */
export { VisualStyleService, visualStyleService } from "../../services/visualStyle/VisualStyleService";
export type { VisualStyleUpsertInput } from "../../services/visualStyle/VisualStyleService";
export { default as visualStyleRouter } from "./http/visualStyleRoutes";
