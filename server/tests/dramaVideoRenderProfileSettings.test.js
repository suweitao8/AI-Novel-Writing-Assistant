const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");
const {
  getDramaVideoRenderProfileSettings,
  saveDramaVideoRenderProfile,
} = require("../dist/services/settings/DramaVideoRenderProfileSettingsService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("drama video render settings default to 720p and expose both landscape options", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalProfile = process.env.DRAMA_VIDEO_PROFILE;
  delete process.env.DRAMA_VIDEO_PROFILE;
  prisma.appSetting.findUnique = async () => null;

  try {
    const settings = await getDramaVideoRenderProfileSettings();
    assert.deepEqual(settings.profile, { id: "720p", width: 1280, height: 720, fps: 24 });
    assert.deepEqual(settings.options.map((option) => option.id), ["720p", "1080p"]);
    assert.deepEqual(settings.options[1], { id: "1080p", width: 1920, height: 1080, fps: 24 });
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    if (originalProfile === undefined) delete process.env.DRAMA_VIDEO_PROFILE;
    else process.env.DRAMA_VIDEO_PROFILE = originalProfile;
  }
});

test("saved drama video render settings take precedence over the environment", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalProfile = process.env.DRAMA_VIDEO_PROFILE;
  process.env.DRAMA_VIDEO_PROFILE = "720p";
  prisma.appSetting.findUnique = async () => ({ key: "drama.videoRenderProfile", value: "1080p" });

  try {
    const settings = await getDramaVideoRenderProfileSettings();
    assert.equal(settings.profile.id, "1080p");
    assert.equal(settings.profile.width, 1920);
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    if (originalProfile === undefined) delete process.env.DRAMA_VIDEO_PROFILE;
    else process.env.DRAMA_VIDEO_PROFILE = originalProfile;
  }
});

test("saving a drama video render profile validates and persists the selected id", async () => {
  const originalUpsert = prisma.appSetting.upsert;
  let savedArgs;
  prisma.appSetting.upsert = async (args) => {
    savedArgs = args;
    return { key: args.create.key, value: args.create.value };
  };

  try {
    const settings = await saveDramaVideoRenderProfile("1080p");
    assert.equal(settings.profile.id, "1080p");
    assert.deepEqual(savedArgs, {
      where: { key: "drama.videoRenderProfile" },
      create: { key: "drama.videoRenderProfile", value: "1080p" },
      update: { value: "1080p" },
    });
    await assert.rejects(() => saveDramaVideoRenderProfile("1440p"), /720p|1080p/);
  } finally {
    prisma.appSetting.upsert = originalUpsert;
  }
});

test("settings API exposes and updates the global drama video render profile", async () => {
  const originalFindUnique = prisma.appSetting.findUnique;
  const originalUpsert = prisma.appSetting.upsert;
  const originalFetch = global.fetch;
  prisma.appSetting.findUnique = async () => null;
  prisma.appSetting.upsert = async ({ create }) => ({ key: create.key, value: create.value });

  const server = http.createServer(createApp());
  const port = await listen(server);
  try {
    const getResponse = await originalFetch(`http://127.0.0.1:${port}/api/settings/drama-video-render-profile`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.data.profile.id, "720p");
    assert.deepEqual(getPayload.data.options.map((option) => option.id), ["720p", "1080p"]);

    const putResponse = await originalFetch(`http://127.0.0.1:${port}/api/settings/drama-video-render-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: "1080p" }),
    });
    assert.equal(putResponse.status, 200);
    const putPayload = await putResponse.json();
    assert.equal(putPayload.data.profile.width, 1920);
    assert.equal(putPayload.data.profile.height, 1080);
  } finally {
    prisma.appSetting.findUnique = originalFindUnique;
    prisma.appSetting.upsert = originalUpsert;
    global.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
