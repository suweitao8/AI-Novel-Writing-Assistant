/**
 * 按模型库策展分类稳定排列目录条目。
 *
 * 静态模型按分类顺序排列，同分类保留输入顺序；非静态资源保持输入顺序并置于静态模型之后。
 * 这样角色等兼容资源可以继续存在于底层目录，而不会打断模型库前景资产的展示分组。
 */
export function orderModelEntries(entries, { categoryOrder, staticUrlPrefix }) {
  const rankByCategory = new Map(categoryOrder.map((category, index) => [category, index]));
  const decoratedEntries = entries.map((entry, originalIndex) => ({
    entry,
    originalIndex,
    isStatic: entry.fileUrl.startsWith(staticUrlPrefix),
  }));

  for (const { entry, isStatic } of decoratedEntries) {
    if (isStatic && !rankByCategory.has(entry.category)) {
      throw new Error(`unknown model category for ${entry.id}: ${entry.category}`);
    }
  }

  return decoratedEntries
    .sort((left, right) => {
      if (left.isStatic !== right.isStatic) return left.isStatic ? -1 : 1;
      if (!left.isStatic) return left.originalIndex - right.originalIndex;
      return rankByCategory.get(left.entry.category) - rankByCategory.get(right.entry.category)
        || left.originalIndex - right.originalIndex;
    })
    .map(({ entry }) => entry);
}
