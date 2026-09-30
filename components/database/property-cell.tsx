"use client";

import { useState } from "react";
import {
  OPTION_CLASS,
  optionColor,
  type PropertyDef,
  type PropertyValue,
} from "@/lib/types";

export function Chip({ property, value }: { property: PropertyDef | undefined; value: string }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-xs ${OPTION_CLASS[optionColor(property, value)]}`}>
      {value}
    </span>
  );
}

/** Affichage seul d'une valeur, utilisé par le tableau et les cartes Kanban. */
export function PropertyValueView({ property, value }: { property: PropertyDef; value: PropertyValue }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted">—</span>;
  }

  switch (property.type) {
    case "select":
      return <Chip property={property} value={String(value)} />;
    case "multi_select":
      return (
        <span className="flex flex-wrap gap-1">
          {(Array.isArray(value) ? value : [String(value)]).map((item) => (
            <Chip key={item} property={property} value={item} />
          ))}
        </span>
      );
    case "checkbox":
      return (
        <span className={value ? "text-ink" : "text-muted"}>{value ? "✓" : "–"}</span>
      );
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer noopener" className="truncate text-accent underline">
          {String(value)}
        </a>
      );
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

/** Cellule éditable : un clic ouvre le bon contrôle selon le type de propriété. */
export function PropertyCell({
  property,
  value,
  onChange,
}: {
  property: PropertyDef;
  value: PropertyValue;
  onChange: (next: PropertyValue) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (property.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[15px] cursor-pointer accent-accent"
        aria-label={property.name}
      />
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-7 w-full items-center rounded px-1.5 py-1 text-left text-sm hover:bg-hover"
      >
        <PropertyValueView property={property} value={value} />
      </button>
    );
  }

  const close = () => setEditing(false);

  if (property.type === "select") {
    return (
      <select
        autoFocus
        value={typeof value === "string" ? value : ""}
        onBlur={close}
        onChange={(event) => {
          onChange(event.target.value || null);
          close();
        }}
        className="w-full rounded border border-line bg-app px-1 py-1 text-sm text-ink outline-none"
      >
        <option value="">—</option>
        {property.options?.map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
    );
  }

  if (property.type === "multi_select") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="pop absolute z-30 w-56 p-1.5" onMouseLeave={close}>
        {property.options?.map((option) => {
          const on = selected.includes(option.name);
          return (
            <button
              key={option.name}
              type="button"
              onClick={() =>
                onChange(on ? selected.filter((item) => item !== option.name) : [...selected, option.name])
              }
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-hover ${on ? "bg-active" : ""}`}
            >
              <span className="w-3 text-xs">{on ? "✓" : ""}</span>
              <Chip property={property} value={option.name} />
            </button>
          );
        })}
        <button type="button" onClick={close} className="mt-1 w-full rounded px-1.5 py-1 text-xs text-muted hover:bg-hover">
          Fermer
        </button>
      </div>
    );
  }

  return (
    <input
      autoFocus
      type={property.type === "date" ? "date" : property.type === "number" ? "number" : "text"}
      defaultValue={value === null || value === undefined ? "" : String(value)}
      onBlur={(event) => {
        const raw = event.target.value;
        onChange(raw === "" ? null : property.type === "number" ? Number(raw) : raw);
        close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") close();
      }}
      className="w-full rounded border border-line bg-app px-1.5 py-1 text-sm text-ink outline-none"
    />
  );
}
