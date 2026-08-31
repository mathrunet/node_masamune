export function decodeRow(
  row: unknown,
  columns: readonly string[] = [],
  columnTypes: readonly string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (columns.length > 0 && isArrayLikeRow(row)) {
    for (const [index, column] of columns.entries()) {
      result[column] = decodeSqlValue(row[index], columnTypes[index], column);
    }
    return result;
  }
  if (!row || typeof row !== "object") {
    return result;
  }
  const typeByColumn = new Map(
    columns.map((column, index) => [column, columnTypes[index]]),
  );
  for (const [key, value] of Object.entries(row)) {
    if (/^\d+$/.test(key)) {
      continue;
    }
    result[key] = decodeSqlValue(value, typeByColumn.get(key), key);
  }
  return result;
}

function isArrayLikeRow(row: unknown): row is { [index: number]: unknown } {
  if (Array.isArray(row)) {
    return true;
  }
  if (!row || typeof row !== "object") {
    return false;
  }
  const record = row as Record<string, unknown>;
  return "0" in record || typeof record.length === "number";
}

function decodeSqlValue(
  value: unknown,
  columnType?: string,
  column?: string,
): unknown {
  if (typeof value === "bigint") {
    return toSafeNumberOrString(value.toString());
  }
  if (isBooleanColumnType(columnType) || isBooleanColumn(column)) {
    const bool = toBoolean(value);
    if (bool !== undefined) {
      return bool;
    }
  }
  if (typeof value === "string" && isNumericColumnType(columnType)) {
    return toSafeNumberOrString(value);
  }
  return value;
}

function isBooleanColumnType(columnType?: string): boolean {
  return columnType !== undefined && /^TINYINT(?:\b|\()/i.test(columnType);
}

function isBooleanColumn(column?: string): boolean {
  return column !== undefined &&
    /^(?:is[A-Z_]|has[A-Z_]|can[A-Z_]|should[A-Z_]|active$)/.test(column);
}

function isNumericColumnType(columnType?: string): boolean {
  return columnType !== undefined &&
    /^(?:SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|FLOAT|DOUBLE|DECIMAL|NUMERIC)(?:\b|\()/i.test(columnType);
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 0 || value === 1 ? value === 1 : undefined;
  }
  if (typeof value === "bigint") {
    return value === 0n || value === 1n ? value === 1n : undefined;
  }
  if (typeof value === "string") {
    if (value === "0" || value.toLowerCase() === "false") {
      return false;
    }
    if (value === "1" || value.toLowerCase() === "true") {
      return true;
    }
  }
  return undefined;
}

function toSafeNumberOrString(value: string): number | string {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ||
      Number.isFinite(parsed) && value.includes(".")
    ? parsed
    : value;
}
