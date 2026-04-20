import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Sparkles } from "lucide-react";
import { getCategoryTemplate, hasSpecTemplate, templateKeysFor, type SpecFieldTemplate } from "@/constants/categorySpecTemplates";

export type SpecsValue = Record<string, string | number | boolean | null>;

interface SpecsEditorProps {
  category: string;
  value: SpecsValue;
  onChange: (next: SpecsValue) => void;
}

/**
 * Phase 4 dynamic Specs editor.
 *
 *  - Renders typed fields from the category's template (12 spec-stable categories).
 *  - Renders any saved custom keys (keys present in `value` but not in the template).
 *  - Renders a "Suggested Fields" pill row from `GET /api/custom-field-suggestions?category=...`
 *    (server returns custom keys with usage_count >= 3 for that category).
 *  - "+ Add Custom Field" appends a new editable key/value row.
 *  - Each custom row has a Remove button.
 */
export function SpecsEditor({ category, value, onChange }: SpecsEditorProps) {
  const template = useMemo<SpecFieldTemplate[]>(() => getCategoryTemplate(category), [category]);
  const tplKeys = useMemo(() => templateKeysFor(category), [category]);

  // Custom keys = anything in `value` that isn't a template key. Stable order: insertion order.
  const customKeys = useMemo(() => Object.keys(value).filter((k) => !tplKeys.has(k)), [value, tplKeys]);

  const { data: suggestions } = useQuery<string[]>({
    queryKey: [`/api/custom-field-suggestions?category=${encodeURIComponent(category)}`],
    enabled: !!category,
  });

  const setField = (key: string, v: SpecsValue[string]) => {
    const next = { ...value };
    if (v === "" || v == null) {
      delete next[key];
    } else {
      next[key] = v;
    }
    onChange(next);
  };

  const addCustomField = (presetKey?: string) => {
    // Find a unique placeholder key. If presetKey provided (suggestion), use it.
    let baseKey = presetKey || "custom_field";
    let n = 1;
    let key = baseKey;
    while (key in value) {
      n += 1;
      key = `${baseKey}_${n}`;
    }
    onChange({ ...value, [key]: "" });
  };

  const renameCustomKey = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    if (newKey in value) return; // collision — silently ignore (UI will keep old key)
    const next: SpecsValue = {};
    for (const [k, v] of Object.entries(value)) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  };

  const removeKey = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  // Filter suggestions to ones not already used (template OR custom).
  const filteredSuggestions = (suggestions ?? []).filter(
    (s) => !tplKeys.has(s) && !(s in value),
  );

  return (
    <div className="space-y-3 rounded-md border p-3 bg-muted/20" data-testid="specs-editor">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Specifications
          {hasSpecTemplate(category) ? (
            <span className="ml-2 text-xs text-muted-foreground font-normal">({template.length} template fields for {category})</span>
          ) : (
            <span className="ml-2 text-xs text-muted-foreground font-normal">(custom fields only — no template for this category)</span>
          )}
        </Label>
      </div>

      {/* Template fields */}
      {template.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {template.map((f) => {
            const v = value[f.key];
            const id = `spec-tpl-${f.key}`;
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={id} className="text-xs">{f.label}{f.suffix ? ` (${f.suffix})` : ""}</Label>
                {f.type === "select" ? (
                  <Select
                    value={v != null ? String(v) : ""}
                    onValueChange={(val) => setField(f.key, val === "__clear__" ? "" : val)}
                  >
                    <SelectTrigger id={id} className="h-9" data-testid={`select-spec-${f.key}`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__clear__" data-testid={`option-spec-${f.key}-clear`}>—</SelectItem>
                      {(f.options ?? []).map((opt) => (
                        <SelectItem key={opt} value={opt} data-testid={`option-spec-${f.key}-${opt}`}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={f.type === "number" ? "number" : "text"}
                    step={f.type === "number" ? "any" : undefined}
                    placeholder={f.placeholder}
                    className="h-9"
                    data-testid={`input-spec-${f.key}`}
                    value={v != null ? String(v) : ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return setField(f.key, "");
                      if (f.type === "number") {
                        const num = parseFloat(raw);
                        setField(f.key, isFinite(num) ? num : raw);
                      } else {
                        setField(f.key, raw);
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Custom fields */}
      {customKeys.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Custom Fields</Label>
          <div className="space-y-2">
            {customKeys.map((key) => (
              <div key={key} className="flex items-center gap-2" data-testid={`row-custom-spec-${key}`}>
                <Input
                  className="h-9 w-1/3"
                  placeholder="field name"
                  defaultValue={key}
                  onBlur={(e) => renameCustomKey(key, e.target.value.trim())}
                  data-testid={`input-custom-spec-key-${key}`}
                />
                <Input
                  className="h-9 flex-1"
                  placeholder="value"
                  value={value[key] != null ? String(value[key]) : ""}
                  onChange={(e) => setField(key, e.target.value)}
                  data-testid={`input-custom-spec-value-${key}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeKey(key)}
                  data-testid={`button-remove-custom-spec-${key}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested fields (count >= 3 in this category) */}
      {filteredSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Suggested Fields
          </Label>
          <div className="flex flex-wrap gap-2">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addCustomField(s)}
                className="px-2.5 py-1 rounded-full text-xs border border-dashed border-blue-400 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                data-testid={`chip-suggested-spec-${s}`}
              >
                + {s}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">These custom fields have been used 3+ times in this category.</p>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => addCustomField()}
        data-testid="button-add-custom-spec"
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Add Custom Field
      </Button>
    </div>
  );
}
