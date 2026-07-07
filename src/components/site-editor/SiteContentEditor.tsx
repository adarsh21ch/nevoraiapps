import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSiteContent, qk } from "@/lib/dashboard-queries";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { uploadTenantFile, signedUrl } from "@/lib/storage";

/**
 * Website content editor (hero / about / owner / star players / gallery).
 * Platform-admin-only surface: owners run their academy, the platform team
 * runs their website. RLS allows is_platform_admin to manage any tenant's
 * site_content rows.
 */
export function SiteContentEditor({ tenantId }: { tenantId: string }) {
  const content = useQuery({
    queryKey: qk.site(tenantId),
    queryFn: () => fetchSiteContent(tenantId),
  });
  const rows = content.data ?? [];

  return (
    <Tabs defaultValue="hero">
      <TabsList className="w-full flex-wrap h-auto">
        <TabsTrigger value="hero">Hero</TabsTrigger>
        <TabsTrigger value="about">About</TabsTrigger>
        <TabsTrigger value="owner">Owner/Coach</TabsTrigger>
        <TabsTrigger value="stars">Star players</TabsTrigger>
        <TabsTrigger value="gallery">Gallery</TabsTrigger>
      </TabsList>

      <TabsContent value="hero" className="pt-4">
        <HeroEditor tenantId={tenantId} rows={rows} />
      </TabsContent>
      <TabsContent value="about" className="pt-4">
        <SingleSectionEditor
          tenantId={tenantId}
          rows={rows}
          section="about"
          fields={[
            { key: "heading", label: "Heading" },
            { key: "body", label: "Body", multiline: true, rows: 6 },
          ]}
        />
      </TabsContent>
      <TabsContent value="owner" className="pt-4">
        <OwnerEditor tenantId={tenantId} rows={rows} />
      </TabsContent>
      <TabsContent value="stars" className="pt-4">
        <MultiSectionEditor
          tenantId={tenantId}
          rows={rows}
          section="star_players"
          fields={[
            { key: "name", label: "Name" },
            { key: "achievement", label: "Achievement" },
          ]}
          imageField="photo_url"
        />
      </TabsContent>
      <TabsContent value="gallery" className="pt-4">
        <MultiSectionEditor
          tenantId={tenantId}
          rows={rows}
          section="gallery"
          fields={[{ key: "caption", label: "Caption" }]}
          imageField="url"
        />
      </TabsContent>
    </Tabs>
  );
}

type Field = { key: string; label: string; multiline?: boolean; rows?: number };

function SingleSectionEditor({
  tenantId,
  rows,
  section,
  fields,
}: {
  tenantId: string;
  rows: any[];
  section: string;
  fields: Field[];
}) {
  const qc = useQueryClient();
  const existing = rows.find((r) => r.section === section);
  const [values, setValues] = useState<Record<string, string>>(
    () => (existing?.content as any) ?? {},
  );
  useEffect(() => {
    setValues((existing?.content as any) ?? {});
  }, [existing?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        const { error } = await supabase
          .from("site_content")
          .update({ content: values })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("site_content").insert({
          tenant_id: tenantId,
          section,
          content: values,
          sort_order: 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: qk.site(tenantId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5 space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          {f.multiline ? (
            <Textarea
              rows={f.rows ?? 3}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          ) : (
            <Input
              value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
      <div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ backgroundColor: "var(--brand, #1d4ed8)", color: "white" }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function HeroEditor({ tenantId, rows }: { tenantId: string; rows: any[] }) {
  const qc = useQueryClient();
  const existing = rows.find((r) => r.section === "hero");
  const [values, setValues] = useState<Record<string, string>>(
    () => (existing?.content as any) ?? {},
  );
  const [uploading, setUploading] = useState(false);
  const [imgPreview, setImgPreview] = useState("");
  useEffect(() => {
    setValues((existing?.content as any) ?? {});
  }, [existing?.id]);
  useEffect(() => {
    if (values.image_url) signedUrl(values.image_url).then(setImgPreview);
    else setImgPreview("");
  }, [values.image_url]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        const { error } = await supabase
          .from("site_content")
          .update({ content: values })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("site_content").insert({
          tenant_id: tenantId,
          section: "hero",
          content: values,
          sort_order: 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: qk.site(tenantId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = await uploadTenantFile(tenantId, "hero", f);
      setValues((v) => ({ ...v, image_url: path }));
      toast.success("Uploaded — remember to Save");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="space-y-1.5">
        <Label>Background photo (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Shown full-bleed behind the homepage hero, with a dark overlay for text contrast. Leave
          empty to use the plain brand-colour gradient instead.
        </p>
        <div className="aspect-[21/9] w-full overflow-hidden rounded-lg bg-muted grid place-items-center">
          {imgPreview ? (
            <img src={imgPreview} className="h-full w-full object-cover" alt="" />
          ) : (
            <Upload className="size-6 text-muted-foreground" />
          )}
        </div>
        <label className="inline-block">
          <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1">
            <Upload className="size-3" /> {uploading ? "Uploading…" : "Upload photo"}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
        {values.image_url ? (
          <button
            type="button"
            className="ml-3 text-xs text-rose-600 hover:underline"
            onClick={() => setValues((v) => ({ ...v, image_url: "" }))}
          >
            Remove photo
          </button>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label>Headline</Label>
        <Input
          value={values.headline ?? ""}
          onChange={(e) => setValues({ ...values, headline: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Subheadline</Label>
        <Textarea
          rows={3}
          value={values.subheadline ?? ""}
          onChange={(e) => setValues({ ...values, subheadline: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Call-to-action label</Label>
        <Input
          value={values.cta_label ?? ""}
          onChange={(e) => setValues({ ...values, cta_label: e.target.value })}
        />
      </div>
      <div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ backgroundColor: "var(--brand, #1d4ed8)", color: "white" }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function OwnerEditor({ tenantId, rows }: { tenantId: string; rows: any[] }) {
  const qc = useQueryClient();
  const existing = rows.find((r) => r.section === "owner");
  const [values, setValues] = useState<Record<string, string>>(
    () => (existing?.content as any) ?? {},
  );
  const [uploading, setUploading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  useEffect(() => {
    setValues((existing?.content as any) ?? {});
  }, [existing?.id]);
  useEffect(() => {
    if (values.photo_url) signedUrl(values.photo_url).then(setPhotoPreview);
    else setPhotoPreview("");
  }, [values.photo_url]);

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        const { error } = await supabase
          .from("site_content")
          .update({ content: values })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("site_content").insert({
          tenant_id: tenantId,
          section: "owner",
          content: values,
          sort_order: 0,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: qk.site(tenantId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = await uploadTenantFile(tenantId, "owner", f);
      setValues((v) => ({ ...v, photo_url: path }));
      toast.success("Uploaded — remember to Save");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Shown on the public homepage so visitors know who runs the academy.
      </p>
      <div className="flex gap-4">
        <div className="w-28 shrink-0">
          <div className="aspect-square rounded-full bg-muted overflow-hidden grid place-items-center">
            {photoPreview ? (
              <img src={photoPreview} className="w-full h-full object-cover" alt="" />
            ) : (
              <Upload className="size-6 text-muted-foreground" />
            )}
          </div>
          <label className="mt-2 block text-center">
            <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1">
              <Upload className="size-3" /> {uploading ? "Uploading…" : "Upload photo"}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        </div>
        <div className="flex-1 space-y-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={values.name ?? ""}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role / title</Label>
            <Input
              placeholder="Founder & Head Coach"
              value={values.role ?? ""}
              onChange={(e) => setValues({ ...values, role: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ backgroundColor: "var(--brand, #1d4ed8)", color: "white" }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function MultiSectionEditor({
  tenantId,
  rows,
  section,
  fields,
  imageField,
}: {
  tenantId: string;
  rows: any[];
  section: string;
  fields: Field[];
  imageField?: string;
}) {
  const qc = useQueryClient();
  const items = rows.filter((r) => r.section === section);
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.site(tenantId) });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_content").insert({
        tenant_id: tenantId,
        section,
        content: {},
        sort_order: items.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <ItemCard
          key={it.id}
          row={it}
          fields={fields}
          imageField={imageField}
          tenantId={tenantId}
          onChange={invalidate}
        />
      ))}
      <Button variant="outline" onClick={() => add.mutate()}>
        <Plus className="size-4 mr-1" /> Add {section.replace("_", " ")}
      </Button>
    </div>
  );
}

function ItemCard({
  row,
  fields,
  imageField,
  tenantId,
  onChange,
}: {
  row: any;
  fields: Field[];
  imageField?: string;
  tenantId: string;
  onChange: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(row.content ?? {});
  const [uploading, setUploading] = useState(false);
  const [imgUrl, setImgUrl] = useState<string>("");

  useEffect(() => {
    const p = imageField ? values[imageField] : "";
    if (p) signedUrl(p).then(setImgUrl);
    else setImgUrl("");
  }, [values, imageField]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("site_content")
        .update({ content: values })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_content").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !imageField) return;
    setUploading(true);
    try {
      const path = await uploadTenantFile(tenantId, row.section, f);
      setValues({ ...values, [imageField]: path });
      toast.success("Uploaded — remember to Save");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex gap-4">
        {imageField && (
          <div className="w-24 shrink-0">
            <div className="aspect-square rounded-md bg-muted overflow-hidden grid place-items-center">
              {imgUrl ? (
                <img src={imgUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <Upload className="size-6 text-muted-foreground" />
              )}
            </div>
            <label className="mt-2 block">
              <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1">
                <Upload className="size-3" /> {uploading ? "Uploading…" : "Upload"}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={onFile} />
            </label>
          </div>
        )}
        <div className="flex-1 space-y-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              {f.multiline ? (
                <Textarea
                  rows={f.rows ?? 2}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              ) : (
                <Input
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-rose-600"
          onClick={() => confirm("Delete this item?") && del.mutate()}
        >
          <Trash2 className="size-4 mr-1" /> Delete
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          style={{ backgroundColor: "var(--brand, #1d4ed8)", color: "white" }}
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
