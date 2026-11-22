type Row = Record<string, unknown>;

const asRow = (value: unknown): Row | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row => asRow(item) !== null)
  : [];
const string = (value: unknown, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

export function processSheets(document: unknown) {
  const doc = asRow(document);
  if (!doc) return [];
  let sheets = rows(doc.sheets);
  let activeId = doc.activeSheetId;
  if (!sheets.length && Array.isArray(doc.processedKeys)) {
    const prefix = '__processmap_workbook_v1__:';
    const entry = doc.processedKeys.findLast(value => typeof value === 'string' && value.startsWith(prefix));
    if (typeof entry === 'string') {
      try {
        const workbook = asRow(JSON.parse(entry.slice(prefix.length)));
        if (workbook?.version === 1) {
          sheets = rows(workbook.sheets);
          activeId ??= workbook.activeSheetId;
        }
      } catch { /* Older or malformed backup metadata. */ }
    }
  }
  if (!sheets.length) {
    return Array.isArray(doc.stages)
      ? [{ id: 'sheet_main', name: 'シート1', goal: {}, stages: doc.stages }]
      : [];
  }
  return sheets.filter(sheet =>
    typeof sheet.id === 'string' && sheet.id.length > 0 &&
    sheet.id !== 'sheet_mindmap_placeholder' && !sheet.mindMap && Array.isArray(sheet.stages)
  ).map(sheet => ({
    id: string(sheet.id),
    name: string(sheet.name) || '（無題のシート）',
    goal: asRow(sheet.goal) ?? {},
    // Older documents keep the active sheet's stage data at the top level.
    stages: sheet.id === activeId && Array.isArray(doc.stages) ? doc.stages : sheet.stages,
  }));
}

type Task = {
  id: string;
  parentId: string | null;
  name: string;
  done: boolean;
  doneAt: string | null;
  due: string | null;
  thisWeek: boolean;
  optional: boolean;
  leaf: boolean;
};

export function sheetProgress(sheet: ReturnType<typeof processSheets>[number], offset: number, limit: number) {
  const tasks: Task[] = [];
  function visit(item: Row, parent: Task | null, depth: number): boolean {
    const children = rows(depth === 0 ? item.tasks : depth === 1 ? item.children : []);
    const task: Task = {
      id: string(item.id),
      parentId: parent?.id ?? null,
      name: string(depth === 0 ? item.title : item.text),
      done: item.done === true,
      doneAt: date(item.doneAt),
      due: date(item.due) ?? parent?.due ?? null,
      thisWeek: item.star === true,
      optional: item.nice === true || parent?.optional === true,
      leaf: children.length === 0,
    };
    tasks.push(task);
    if (children.length) task.done = children.map(child => visit(child, task, depth + 1)).every(Boolean);
    if (!task.done || !task.leaf) task.doneAt = null;
    return task.done;
  }
  for (const entry of rows(sheet.stages)) visit(entry, null, 0);

  const leaves = tasks.filter(task => task.leaf);
  const completed = leaves.filter(task => task.done).length;
  return {
    sheet: { id: sheet.id, name: sheet.name, deadline: date(sheet.goal.deadline) },
    summary: {
      completed,
      remaining: leaves.length - completed,
      requiredRemaining: leaves.filter(task => !task.done && !task.optional).length,
    },
    tasks: tasks.slice(offset, offset + limit),
    nextOffset: offset + limit < tasks.length ? offset + limit : null,
  };
}
