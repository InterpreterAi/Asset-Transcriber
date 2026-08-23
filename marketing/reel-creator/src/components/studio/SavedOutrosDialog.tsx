/**
 * Pick a saved brand outro preset to apply in Studio.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COLORS } from "@/lib/brandSystem";
import {
  deleteSavedOutroPreset,
  listSavedOutroPresets,
  presetSummaryLine,
  type SavedOutroPreset,
} from "@/lib/savedOutroPresets";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (preset: SavedOutroPreset) => void;
};

export function SavedOutrosDialog({ open, onOpenChange, onApply }: Props) {
  const [presets, setPresets] = useState<SavedOutroPreset[]>([]);

  useEffect(() => {
    if (!open) return;
    setPresets(listSavedOutroPresets());
  }, [open]);

  function refresh() {
    setPresets(listSavedOutroPresets());
  }

  function onDelete(id: string, name: string) {
    if (!window.confirm(`Delete saved outro “${name}”?`)) return;
    deleteSavedOutroPreset(id);
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          maxWidth: 520,
          background: COLORS.bgElevated,
          borderColor: COLORS.glassBorder,
          color: COLORS.ink,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: COLORS.ink }}>Saved brand outros</DialogTitle>
          <DialogDescription style={{ color: COLORS.inkMuted }}>
            Load copy, layer layout, and voiceover settings from a saved preset.
          </DialogDescription>
        </DialogHeader>

        {presets.length === 0 ? (
          <div
            style={{
              padding: "20px 16px",
              borderRadius: 12,
              border: `1px dashed ${COLORS.glassBorder}`,
              textAlign: "center",
              fontSize: 13,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
            }}
          >
            <Bookmark size={22} style={{ margin: "0 auto 10px", opacity: 0.45 }} />
            No saved outros yet. Use <strong style={{ color: COLORS.ink }}>Save outro</strong> in Studio,
            or open <strong style={{ color: COLORS.ink }}>Brand Outro</strong> in the nav.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {presets.map((preset) => (
              <li
                key={preset.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: `1px solid ${COLORS.glassBorder}`,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.ink }}>
                    {preset.name}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.inkFaint }}>
                    {presetSummaryLine(preset)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: COLORS.inkFaint }}>
                    Updated {new Date(preset.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onApply(preset);
                    onOpenChange(false);
                  }}
                  style={primaryBtn}
                >
                  Use
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(preset.id, preset.name)}
                  style={ghostBtn}
                  title="Delete preset"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

const primaryBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 999,
  border: "none",
  background: COLORS.accent,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const ghostBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: "transparent",
  color: COLORS.inkMuted,
  cursor: "pointer",
  flexShrink: 0,
};
