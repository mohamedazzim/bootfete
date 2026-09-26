// CertificateTemplateManager — event-admin UI for uploading a base
// certificate template (PDF/PNG/JPEG) and configuring text placeholder
// coordinates that verified participant data is overlaid onto.
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Trash2, Upload, Save, Crosshair } from "lucide-react";

interface Placeholder {
  x: number;
  y: number;
  fontSize: number;
  fontColor: string;
  alignment?: "left" | "center" | "right";
}

interface TemplateRow {
  id: string;
  eventId: string;
  templateUrl: string;
  fileType: "pdf" | "image";
  placeholders: Record<string, Placeholder>;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Participant Name",
  event: "Event Name",
  position: "Position / Winner Status",
  college: "College / Institution",
  date: "Date",
  location: "Location",
};

const ALL_FIELDS = Object.keys(FIELD_LABELS);

export function CertificateTemplateManager({ eventId }: { eventId: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [placeholders, setPlaceholders] = useState<Record<string, Placeholder>>({});
  const [editing, setEditing] = useState<{
    field: string;
    x: string;
    y: string;
    fontSize: string;
    fontColor: string;
    alignment: "left" | "center" | "right";
  } | null>(null);
  const [clickToPlace, setClickToPlace] = useState<string | null>(null);

  const queryKey = [`/api/event-admin/events/${eventId}/certificate-template`];
  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const { data: template, isLoading } = useQuery<TemplateRow>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(queryKey[0], { credentials: "include", headers: authHeaders() });
      if (res.status === 404) return null as unknown as TemplateRow;
      if (!res.ok) throw new Error("Failed to load template");
      return res.json();
    },
  });

  useEffect(() => {
    if (template?.placeholders) setPlaceholders(template.placeholders);
  }, [template]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("template", file);
      const res = await fetch(queryKey[0], { method: "POST", body: fd, credentials: "include", headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Template uploaded", description: "Configure placeholder positions below." });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const savePlaceholdersMutation = useMutation({
    mutationFn: async (ph: Record<string, Placeholder>) => {
      const fd = new FormData();
      fd.append("placeholders", JSON.stringify(ph));
      const res = await fetch(queryKey[0], { method: "POST", body: fd, credentials: "include", headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Placeholders saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(queryKey[0], { method: "DELETE", credentials: "include", headers: authHeaders() });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      setPlaceholders({});
      setEditing(null);
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Template deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const startEdit = (field: string) => {
    const existing = placeholders[field];
    setEditing({
      field,
      x: String(existing?.x ?? 100),
      y: String(existing?.y ?? 100),
      fontSize: String(existing?.fontSize ?? (template?.fileType === "pdf" ? 24 : 48)),
      fontColor: existing?.fontColor ?? "#1e293b",
      alignment: existing?.alignment ?? "center",
    });
  };

  const applyEdit = () => {
    if (!editing) return;
    const x = Number(editing.x);
    const y = Number(editing.y);
    const fontSize = Number(editing.fontSize);
    if (!Number.isFinite(x) || x < 0 || !Number.isFinite(y) || y < 0 || !Number.isFinite(fontSize) || fontSize <= 0) {
      toast({ title: "Invalid coordinates", description: "x, y and font size must be positive numbers.", variant: "destructive" });
      return;
    }
    setPlaceholders((prev) => ({
      ...prev,
      [editing.field]: { x, y, fontSize, fontColor: editing.fontColor, alignment: editing.alignment },
    }));
    setEditing(null);
    setClickToPlace(null);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!clickToPlace || !editing || editing.field !== clickToPlace) return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    // Coordinates are in template pixel space (natural size).
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    setEditing((prev) => (prev ? { ...prev, x: String(x), y: String(y) } : prev));
    setClickToPlace(null);
  };

  if (isLoading) return <p className="text-sm text-gray-500">Loading certificate template…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Certificate Template</CardTitle>
          <CardDescription>
            Upload a base certificate design (PDF, PNG or JPEG). Participant data is overlaid at the
            placeholder coordinates you configure below. Coordinates use the template's top-left as origin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {template ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                Current template: <span className="font-medium">{template.templateUrl.split("/").pop()}</span>{" "}
                <span className="text-gray-500">({template.fileType.toUpperCase()})</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this certificate template? Participants will fall back to the standard certificate.")) {
                    deleteMutation.mutate();
                  }
                }}
                data-testid="button-delete-template"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="button-replace-template">
                Replace template…
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No template uploaded yet. Participants will receive the standard certificate.</p>
          )}
          <Input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            data-testid="input-template-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMutation.mutate(f);
            }}
          />
          {!template && (
            <Button onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending} data-testid="button-upload-template">
              <Upload className="mr-2 h-4 w-4" />
              {uploadMutation.isPending ? "Uploading…" : "Upload template"}
            </Button>
          )}
        </CardContent>
      </Card>

      {template?.fileType === "image" && (
        <Card>
          <CardHeader>
            <CardTitle>Template Preview</CardTitle>
            <CardDescription>
              Markers show configured placeholders. Select a field below, then click on the preview to place it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto border rounded-md" role="region" aria-label="Certificate template preview" tabIndex={0}>
              <div className="relative inline-block">
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
                <img
                  src={template.templateUrl}
                  alt="Certificate template preview"
                  className={clickToPlace ? "cursor-crosshair" : undefined}
                  onClick={handlePreviewClick}
                  data-testid="template-preview"
                />
                {Object.entries(placeholders).map(([field, ph]) => (
                  <div
                    key={field}
                    className="absolute flex items-center gap-1 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: ph.x, top: ph.y }}
                    title={`${FIELD_LABELS[field]} (${ph.x}, ${ph.y})`}
                  >
                    <span className="h-3 w-3 rounded-full bg-indigo-600 ring-2 ring-white" />
                    <span className="text-[10px] font-semibold bg-indigo-600 text-white px-1.5 py-0.5 rounded whitespace-nowrap">
                      {FIELD_LABELS[field]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {template && (
        <Card>
          <CardHeader>
            <CardTitle>Placeholder Positions</CardTitle>
            <CardDescription>
              Map each certificate field to a position on the template. For PDFs, coordinates are in
              points measured from the top-left of the first page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ALL_FIELDS.map((field) => (
                <Button
                  key={field}
                  variant={placeholders[field] ? "default" : "outline"}
                  size="sm"
                  onClick={() => startEdit(field)}
                  data-testid={`button-placeholder-${field}`}
                >
                  {placeholders[field] && <span className="mr-1">✓</span>}
                  {FIELD_LABELS[field]}
                </Button>
              ))}
            </div>

            {editing && (
              <div className="border rounded-md p-4 space-y-3 bg-slate-50" data-testid="placeholder-editor">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{FIELD_LABELS[editing.field]}</p>
                  {template.fileType === "image" && (
                    <Button
                      variant={clickToPlace === editing.field ? "default" : "outline"}
                      size="sm"
                      onClick={() => setClickToPlace(clickToPlace === editing.field ? null : editing.field)}
                      data-testid="button-click-to-place"
                    >
                      <Crosshair className="mr-2 h-4 w-4" />
                      {clickToPlace === editing.field ? "Click on preview…" : "Click-to-place"}
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label htmlFor="ph-x">X</Label>
                    <Input id="ph-x" type="number" min={0} value={editing.x} onChange={(e) => setEditing({ ...editing, x: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ph-y">Y</Label>
                    <Input id="ph-y" type="number" min={0} value={editing.y} onChange={(e) => setEditing({ ...editing, y: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ph-size">Font size</Label>
                    <Input id="ph-size" type="number" min={1} value={editing.fontSize} onChange={(e) => setEditing({ ...editing, fontSize: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="ph-color">Color</Label>
                    <Input id="ph-color" type="color" value={editing.fontColor} onChange={(e) => setEditing({ ...editing, fontColor: e.target.value })} className="h-10" />
                  </div>
                </div>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((a) => (
                    <Button
                      key={a}
                      variant={editing.alignment === a ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditing({ ...editing, alignment: a })}
                    >
                      {a[0].toUpperCase() + a.slice(1)}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyEdit}>Apply</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPlaceholders((prev) => {
                        const next = { ...prev };
                        delete next[editing.field];
                        return next;
                      });
                      setEditing(null);
                    }}
                  >
                    Remove field
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setClickToPlace(null); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => savePlaceholdersMutation.mutate(placeholders)}
                disabled={savePlaceholdersMutation.isPending}
                data-testid="button-save-placeholders"
              >
                <Save className="mr-2 h-4 w-4" />
                {savePlaceholdersMutation.isPending ? "Saving…" : "Save placeholder configuration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
