"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import {
  findProperty,
  UNTITLED,
  type PageMeta,
  type PropertyDef,
  type PropertyValue,
  type ViewDef,
  type ViewFilter,
} from "@/lib/types";
import { useWorkspace } from "../workspace-context";
import { Chip, PropertyCell, PropertyValueView } from "./property-cell";

type Props = { database: PageMeta; initialRows: PageMeta[] };

function matches(row: PageMeta, filter: ViewFilter): boolean {
  const value = row.props[filter.property];
  switch (filter.operator) {
    case "is":
      return String(value ?? "") === filter.value;
    case "is_not":
      return String(value ?? "") !== filter.value;
    case "contains":
      return Array.isArray(value) ? value.includes(filter.value ?? "") : String(value ?? "").includes(filter.value ?? "");
    case "is_checked":
      return !!value;
    case "is_not_checked":
      return !value;
    case "is_not_empty":
      return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
    default:
      return true;
  }
}

export default function DatabaseView({ database, initialRows }: Props) {
  const router = useRouter();
  const { patchLocal } = useWorkspace();
  const [rows, setRows] = useState<PageMeta[]>(initialRows);
  const [viewId, setViewId] = useState(database.views[0]?.id ?? "");
  const [title, setTitle] = useState(database.title);

  const view = useMemo<ViewDef>(
    () =>
      database.views.find((candidate) => candidate.id === viewId) ??
      database.views[0] ?? { id: "default", name: "Tableau", type: "table" },
    [database.views, viewId],
  );

  const columns = useMemo(() => {
    const visible = view.visible?.length
      ? view.visible.map((name) => findProperty(database.schema, name)).filter(Boolean)
      : database.schema;
    return visible as PropertyDef[];
  }, [database.schema, view.visible]);

  const visibleRows = useMemo(() => {
    let list = rows.filter((row) => (view.filters ?? []).every((filter) => matches(row, filter)));
    if (view.sortBy) {
      const property = findProperty(database.schema, view.sortBy.property);
      const order = property?.options?.map((option) => option.name) ?? [];
      const rank = (row: PageMeta) => {
        const value = String(row.props[view.sortBy!.property] ?? "");
        const index = order.indexOf(value);
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      list = [...list].sort((a, b) =>
        view.sortBy!.direction === "desc" ? rank(b) - rank(a) : rank(a) - rank(b),
      );
    }
    return list;
  }, [rows, view, database.schema]);

  const setRowProp = async (rowId: string, name: string, value: PropertyValue) => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, props: { ...row.props, [name]: value } } : row)),
    );
    await api.updatePage(rowId, { props: { [name]: value } });
  };

  const addRow = async (preset: Record<string, PropertyValue> = {}) => {
    const row = await api.createRow(database.id, { title: "", props: preset });
    setRows((current) => [...current, row]);
    router.push(`/p/${row.id}`);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 flex h-11 items-center gap-2 bg-app/85 px-3 backdrop-blur-sm">
        <span className="flex min-w-0 items-center gap-1.5 px-1.5 text-sm text-ink-soft">
          {database.icon && <span>{database.icon}</span>}
          <span className="truncate">{title || UNTITLED}</span>
        </span>
        <span className="ml-auto text-xs text-muted">{visibleRows.length} éléments</span>
      </header>

      <div className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-32 sm:px-12">
        <div className="flex items-center gap-2 pt-10">
          {database.icon && <span className="text-[40px] leading-none">{database.icon}</span>}
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              patchLocal(database.id, { title: event.target.value });
              void api.updatePage(database.id, { title: event.target.value });
            }}
            className="min-w-0 flex-1 bg-transparent text-[36px] font-bold leading-tight tracking-[-0.02em] text-ink outline-none"
            aria-label="Titre de la base"
          />
        </div>

        <div className="mt-6 flex items-center gap-1 border-b border-line">
          {database.views.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setViewId(candidate.id)}
              className={`-mb-px border-b-2 px-2.5 py-1.5 text-sm ${
                candidate.id === view.id
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink-soft"
              }`}
            >
              {candidate.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void addRow()}
            className="ml-auto rounded-md px-2.5 py-1 text-sm text-ink-soft hover:bg-hover"
          >
            + Nouveau
          </button>
        </div>

        {view.type === "board" ? (
          <BoardView
            schema={database.schema}
            rows={visibleRows}
            groupBy={view.groupBy ?? database.schema.find((property) => property.type === "select")?.name ?? ""}
            onMove={setRowProp}
            onAdd={addRow}
          />
        ) : (
          <TableView schema={database.schema} columns={columns} rows={visibleRows} onEdit={setRowProp} />
        )}
      </div>
    </div>
  );
}

function TableView({
  schema,
  columns,
  rows,
  onEdit,
}: {
  schema: PropertyDef[];
  columns: PropertyDef[];
  rows: PageMeta[];
  onEdit: (rowId: string, name: string, value: PropertyValue) => void;
}) {
  const titleProperty = schema.find((property) => property.type === "text" && property.name === "Tâche");

  return (
    <div className="thin-scroll mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="w-[38%] px-2 py-2 font-medium text-muted">{titleProperty?.name ?? "Nom"}</th>
            {columns
              .filter((property) => property.name !== titleProperty?.name)
              .map((property) => (
                <th key={property.id} className="px-2 py-2 font-medium text-muted">
                  {property.name}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-2 py-6 text-center text-muted">
                Aucun élément dans cette vue.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="group border-b border-line align-top hover:bg-hover/60">
              <td className="px-2 py-2">
                <Link href={`/p/${row.id}`} className="flex items-start gap-1.5 text-ink hover:underline">
                  <span className="shrink-0">{row.icon || "\u{1F4C4}"}</span>
                  <span>{row.title || UNTITLED}</span>
                </Link>
              </td>
              {columns
                .filter((property) => property.name !== titleProperty?.name)
                .map((property) => (
                  <td key={property.id} className="relative px-1 py-1">
                    <PropertyCell
                      property={property}
                      value={row.props[property.name] ?? null}
                      onChange={(next) => onEdit(row.id, property.name, next)}
                    />
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardView({
  schema,
  rows,
  groupBy,
  onMove,
  onAdd,
}: {
  schema: PropertyDef[];
  rows: PageMeta[];
  groupBy: string;
  onMove: (rowId: string, name: string, value: PropertyValue) => void;
  onAdd: (preset: Record<string, PropertyValue>) => void;
}) {
  const property = findProperty(schema, groupBy);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);

  const columns = property?.options?.map((option) => option.name) ?? [];
  const badgeProperties = schema.filter(
    (candidate) => candidate.name !== groupBy && (candidate.type === "select" || candidate.type === "multi_select"),
  );

  const startDrag = (rowId: string) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragId(rowId);

    const onMoveEvent = (moveEvent: PointerEvent) => {
      const column = (document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null)?.closest(
        "[data-column]",
      ) as HTMLElement | null;
      // La colonne survolée est suivie dans une ref : la lire au relâchement
      // évite de déclencher l'enregistrement depuis un updater de setState.
      overRef.current = column?.dataset.column ?? null;
      setOverColumn(overRef.current);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMoveEvent);
      window.removeEventListener("pointerup", onUp);
      const target = overRef.current;
      overRef.current = null;
      setDragId(null);
      setOverColumn(null);
      if (target) onMove(rowId, groupBy, target);
    };
    window.addEventListener("pointermove", onMoveEvent);
    window.addEventListener("pointerup", onUp);
  };

  if (!property) {
    return <p className="py-8 text-sm text-muted">Cette vue n&apos;a pas de propriété de regroupement.</p>;
  }

  return (
    <div className="thin-scroll mt-4 flex gap-3 overflow-x-auto pb-4">
      {columns.map((column) => {
        const cards = rows.filter((row) => String(row.props[groupBy] ?? "") === column);
        return (
          <div
            key={column}
            data-column={column}
            className={`w-[268px] shrink-0 rounded-lg p-2 transition-colors ${
              overColumn === column && dragId ? "bg-active" : "bg-hover/50"
            }`}
          >
            <div className="flex items-center gap-2 px-1 pb-2">
              <Chip property={property} value={column} />
              <span className="text-xs text-muted">{cards.length}</span>
            </div>

            {cards.map((row) => (
              <div
                key={row.id}
                onPointerDown={startDrag(row.id)}
                className={`mb-2 cursor-grab rounded-md border border-line bg-app p-2.5 active:cursor-grabbing ${
                  dragId === row.id ? "opacity-40" : ""
                }`}
              >
                <Link href={`/p/${row.id}`} className="block text-sm text-ink hover:underline">
                  {row.title || UNTITLED}
                </Link>
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {badgeProperties.map((badge) => {
                    const value = row.props[badge.name];
                    if (!value || (Array.isArray(value) && value.length === 0)) return null;
                    return <PropertyValueView key={badge.id} property={badge} value={value} />;
                  })}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => onAdd({ [groupBy]: column })}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-hover"
            >
              + Nouveau
            </button>
          </div>
        );
      })}
    </div>
  );
}
