const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 参考小说（referenceKnowledgeDocumentId）契约：
// 与续写源（sourceKnowledgeDocumentId）语义解耦——续写源仅 continuation 模式可设且进入写作上下文；
// 参考小说任何模式都可挂、只存储备用（漫剧设定里管理），创建与更新都必须过文档有效性校验。

const crudPath = path.join(__dirname, "../src/services/novel/novelCore/novelCoreCrudService.ts");
const crud = fs.readFileSync(crudPath, "utf8");

test("create/update 都经过参考文档有效性校验", () => {
  assert.match(crud, /referenceKnowledgeDocumentId:\s*await this\.resolveReferenceDocumentId\(input\.referenceKnowledgeDocumentId\)/);
  assert.match(crud, /input\.referenceKnowledgeDocumentId !== undefined[\s\S]{0,200}resolveReferenceDocumentId/);
});

test("参考小说不受 writingMode 门控（区别于续写源）", () => {
  // 续写源被写作模式条件清空，参考字段必须无条件透传
  const gated = /sourceKnowledgeDocumentId:\s*writingMode === "continuation"/;
  assert.ok(gated.test(crud), "续写源应保留 writingMode 门控");
  const referenceGated = /referenceKnowledgeDocumentId:\s*writingMode/;
  assert.ok(!referenceGated.test(crud), "参考小说不应被 writingMode 门控");
});

test("校验规则：文档存在、未归档、有激活版本", () => {
  assert.match(crud, /resolveReferenceDocumentId[\s\S]{0,600}status === "archived"/);
  assert.match(crud, /resolveReferenceDocumentId[\s\S]{0,600}activeVersionId/);
});

test("双库迁移成对存在", () => {
  const name = "20260819193000_comic_drama_reference_novel";
  for (const dir of ["migrations", "migrations.sqlite"]) {
    const file = path.join(__dirname, "../src/prisma", dir, name, "migration.sql");
    assert.ok(fs.existsSync(file), `${dir} 缺少迁移 ${name}`);
    assert.match(fs.readFileSync(file, "utf8"), /ADD COLUMN "referenceKnowledgeDocumentId"/);
  }
});
