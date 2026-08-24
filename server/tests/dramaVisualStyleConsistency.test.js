const assert = require("node:assert/strict");
const { test } = require("node:test");
const { prisma } = require("../dist/db/prisma.js");
const {
  resolveDramaArtStyleContext,
} = require("../dist/services/drama/visual/dramaArtStyleResolver.js");

function mockStyleStore() {
  const originalAppSettingFindUnique = prisma.appSetting.findUnique;
  const originalWorldFindUnique = prisma.novelSettingsWorld.findUnique;
  const originalChapterFindMany = prisma.chapter.findMany;
  prisma.appSetting.findUnique = async () => null;
  prisma.novelSettingsWorld.findUnique = async () => null;
  prisma.chapter.findMany = async () => [];
  return () => {
    prisma.appSetting.findUnique = originalAppSettingFindUnique;
    prisma.novelSettingsWorld.findUnique = originalWorldFindUnique;
    prisma.chapter.findMany = originalChapterFindMany;
  };
}

test("分镜逐镜判定不能把写实项目切换成动画媒介", async () => {
  const restore = mockStyleStore();
  try {
    const context = await resolveDramaArtStyleContext({
      visualStyle: "post_apocalyptic",
      scriptJudge: {
        target: "第9镜",
        scriptExcerpt: "人物站在废弃宿舍中，镜头缓慢推进。",
      },
      judgeFn: async ({ availableStyles }) => {
        assert.doesNotMatch(JSON.stringify(availableStyles), /guoman_fantasy|东方玄幻/);
        return { styleKey: "guoman_fantasy", reason: "测试跨媒介返回" };
      },
    });
    assert.equal(context.renderFamily, "live_action");
    assert.equal(context.specific?.id, "post_apocalyptic");
  } finally {
    restore();
  }
});
