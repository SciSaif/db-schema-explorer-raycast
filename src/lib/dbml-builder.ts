import type {
  SchemaData,
  ColumnRow,
  TableRow,
  EnumTypeRow,
  PrimaryKeyRow,
  UniqueRow,
  ForeignKeyRow,
} from "./pg-schema";

function quoteIdentifier(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}

function formatDbmlType(col: ColumnRow, enumTypeByUdt: Map<string, { schema: string; typname: string }>): string {
  const udtKey = `${col.udt_schema}.${col.udt_name}`;
  const customEnum = enumTypeByUdt.get(udtKey);
  if (customEnum) {
    return `${quoteIdentifier(customEnum.schema)}.${quoteIdentifier(customEnum.typname)}`;
  }

  switch (col.data_type) {
    case "character varying":
    case "varchar":
      return col.character_maximum_length != null ? `varchar(${col.character_maximum_length})` : "varchar";
    case "character":
    case "char":
      return col.character_maximum_length != null ? `char(${col.character_maximum_length})` : "char(1)";
    case "numeric":
    case "decimal": {
      const p = col.numeric_precision != null ? col.numeric_precision : 0;
      const s = col.numeric_scale != null ? col.numeric_scale : 0;
      return s > 0 ? `numeric(${p}, ${s})` : `numeric(${p})`;
    }
    case "timestamp with time zone":
      return "timestamptz";
    case "timestamp without time zone":
      return "timestamp";
    case "time with time zone":
      return "timetz";
    case "time without time zone":
      return "time";
    default:
      return col.data_type;
  }
}

function buildEnumsDbmlForTypes(enumTypeRows: EnumTypeRow[], typeKeys: Set<string>): string {
  const byType = new Map<string, { schema: string; labels: string[] }>();
  for (const row of enumTypeRows) {
    const key = `${row.nspname}.${row.typname}`;
    if (!typeKeys.has(key)) continue;
    if (!byType.has(key)) {
      byType.set(key, { schema: row.nspname, labels: [] });
    }
    byType.get(key)!.labels.push(row.enumlabel);
  }

  const blocks: string[] = [];
  for (const [key, value] of byType) {
    const typname = key.split(".")[1] ?? "";
    const lines = value.labels.map((label) => `  ${quoteIdentifier(label)}`);
    blocks.push(`Enum ${quoteIdentifier(value.schema)}.${quoteIdentifier(typname)} {\n${lines.join("\n")}\n}`);
  }

  return blocks.join("\n\n");
}

function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function columnsExpr(columns: string[]): string {
  if (columns.length === 1) return quoteIdentifier(columns[0] ?? "");
  return `(${columns.map((col) => quoteIdentifier(col)).join(", ")})`;
}

function buildTableDbml(
  table: TableRow,
  columns: ColumnRow[],
  primaryKeys: PrimaryKeyRow[],
  uniques: UniqueRow[],
  foreignKeys: ForeignKeyRow[],
  enumTypeByUdt: Map<string, { schema: string; typname: string }>,
): { tableDbml: string; usedEnumKeys: Set<string> } {
  const tableColumns = columns
    .filter((col) => col.table_schema === table.table_schema && col.table_name === table.table_name)
    .sort((a, b) => a.ordinal_position - b.ordinal_position);

  const pkColumns = primaryKeys
    .filter((pk) => pk.table_schema === table.table_schema && pk.table_name === table.table_name)
    .sort((a, b) => a.ordinal_position - b.ordinal_position)
    .map((pk) => pk.column_name);
  const pkColumnSet = new Set(pkColumns);

  const uniqueGroups = new Map<string, { column_name: string; ordinal_position: number }[]>();
  for (const unique of uniques.filter(
    (u) => u.table_schema === table.table_schema && u.table_name === table.table_name,
  )) {
    const list = uniqueGroups.get(unique.constraint_name) ?? [];
    list.push({ column_name: unique.column_name, ordinal_position: unique.ordinal_position });
    uniqueGroups.set(unique.constraint_name, list);
  }
  for (const group of uniqueGroups.values()) {
    group.sort((a, b) => a.ordinal_position - b.ordinal_position);
  }

  const singleUniqueColumns = new Set<string>();
  const multiUniqueGroups: string[][] = [];
  for (const group of uniqueGroups.values()) {
    if (group.length === 1) {
      singleUniqueColumns.add(group[0]?.column_name ?? "");
      continue;
    }
    multiUniqueGroups.push(group.map((item) => item.column_name));
  }

  const fkByConstraint = new Map<string, ForeignKeyRow[]>();
  for (const fk of foreignKeys.filter(
    (f) => f.table_schema === table.table_schema && f.table_name === table.table_name,
  )) {
    const list = fkByConstraint.get(fk.constraint_name) ?? [];
    list.push(fk);
    fkByConstraint.set(fk.constraint_name, list);
  }
  for (const list of fkByConstraint.values()) {
    list.sort((a, b) => a.ordinal_position - b.ordinal_position);
  }

  const usedEnumKeys = new Set<string>();
  const columnLines: string[] = [];
  for (const col of tableColumns) {
    const udtKey = `${col.udt_schema}.${col.udt_name}`;
    if (enumTypeByUdt.has(udtKey)) usedEnumKeys.add(udtKey);

    const settings: string[] = [];
    if (pkColumns.length === 1 && pkColumnSet.has(col.column_name)) settings.push("pk");
    if (singleUniqueColumns.has(col.column_name)) settings.push("unique");
    if (col.is_nullable !== "YES") settings.push("not null");
    if (col.column_default != null && col.column_default.trim() !== "") {
      settings.push(`default: \`${col.column_default.replace(/`/g, "\\`")}\``);
    }

    const settingsStr = settings.length > 0 ? ` [${settings.join(", ")}]` : "";
    columnLines.push(`  ${quoteIdentifier(col.column_name)} ${formatDbmlType(col, enumTypeByUdt)}${settingsStr}`);
  }

  const indexLines: string[] = [];
  if (pkColumns.length > 1) {
    indexLines.push(`    ${columnsExpr(pkColumns)} [pk]`);
  }
  for (const uniqueCols of multiUniqueGroups) {
    indexLines.push(`    ${columnsExpr(uniqueCols)} [unique]`);
  }

  if (indexLines.length > 0) {
    columnLines.push("  Indexes {");
    columnLines.push(...indexLines);
    columnLines.push("  }");
  }

  if (table.table_type === "VIEW") {
    columnLines.unshift("  // Source object is a view");
  }

  const tableBlock = `Table ${qualifiedTable(table.table_schema, table.table_name)} {\n${columnLines.join("\n")}\n}`;

  const refs = Array.from(fkByConstraint.values()).map((rows) => {
    const first = rows[0]!;
    const sourceCols = rows.map((row) => row.column_name);
    const targetCols = rows.map((row) => row.ref_column_name);
    return `Ref: ${qualifiedTable(first.table_schema, first.table_name)}.${columnsExpr(sourceCols)} > ${qualifiedTable(first.ref_table_schema, first.ref_table_name)}.${columnsExpr(targetCols)}`;
  });

  const tableDbml = refs.length > 0 ? `${tableBlock}\n\n${refs.join("\n")}` : tableBlock;
  return { tableDbml, usedEnumKeys };
}

export function buildSchemaDbml(data: SchemaData): Map<string, string> {
  const enumTypeByUdt = new Map<string, { schema: string; typname: string }>();
  for (const row of data.enums) {
    enumTypeByUdt.set(`${row.nspname}.${row.typname}`, { schema: row.nspname, typname: row.typname });
  }

  const tableDbmls = new Map<string, string>();
  for (const table of data.tables) {
    const key = `${table.table_schema}.${table.table_name}`;
    const { tableDbml, usedEnumKeys } = buildTableDbml(
      table,
      data.columns,
      data.primaryKeys,
      data.uniques,
      data.foreignKeys,
      enumTypeByUdt,
    );
    const enumsDbml = usedEnumKeys.size > 0 ? buildEnumsDbmlForTypes(data.enums, usedEnumKeys) : "";
    tableDbmls.set(key, enumsDbml ? `${enumsDbml}\n\n${tableDbml}` : tableDbml);
  }

  return tableDbmls;
}
