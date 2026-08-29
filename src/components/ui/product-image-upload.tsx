import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { resizeImage, MAX_UPLOAD_BYTES } from "@/lib/image";

interface ProductImageUploadProps {
  productId: string;
  currentImageUrl?: string | null;
  onUploaded: (url: string) => void;
  compact?: boolean;
}

const BUCKET = "product-images";
const MAX_SIZE_MB = 5;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ProductImageUpload({ productId, currentImageUrl, onUploaded, compact = false }: ProductImageUploadProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload JPG, PNG, WEBP, or GIF", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ title: "File too large", description: `Max ${MAX_SIZE_MB}MB allowed`, variant: "destructive" });
      return;
    }

    // Local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);

    try {
      // R26: compress on-device so storage never holds >1MB images
      const blob = await resizeImage(file);
      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error("Image could not be compressed under 1MB — try a smaller image");
      }
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${user!.id}/${productId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: blob.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

      // Update product record
      const { error: dbError } = await supabase
        .from("products")
        .update({ image_url: publicUrl })
        .eq("id", productId);

      if (dbError) throw dbError;

      setPreview(publicUrl);
      onUploaded(publicUrl);
      toast({ title: "Image uploaded" });
    } catch (err: unknown) {
      setPreview(currentImageUrl || null);
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const removeImage = async () => {
    setUploading(true);
    await supabase.from("products").update({ image_url: null }).eq("id", productId);
    setPreview(null);
    onUploaded("");
    setUploading(false);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {preview ? (
          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border shrink-0">
            <img src={preview} alt="Product" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            {!uploading && (
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center bg-black/60 rounded-bl"
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            )}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-lg border border-dashed border-border flex items-center justify-center shrink-0" style={{ background: "rgba(113,255,232,0.03)" }}>
            <ImageIcon className="w-5 h-5" style={{ color: "#7d8d88" }} />
          </div>
        )}
        <div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-1.5 text-xs">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {uploading ? "Uploading..." : preview ? "Change" : "Upload Image"}
          </Button>
          <p className="text-[10px] mt-1" style={{ color: "#7d8d88" }}>Max {MAX_SIZE_MB}MB · auto-compressed to ≤1MB</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border" style={{ background: "#0a0e14" }}>
          <img
            src={preview}
            alt="Product"
            loading="lazy"
            decoding="async"
            className="w-full max-h-56 object-cover"
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#71ffe8" }} />
            </div>
          )}
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur hover:bg-black/80 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                type="button"
                onClick={removeImage}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur hover:bg-red-500/80 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border border-dashed cursor-pointer transition-colors hover:border-primary/40"
          style={{ borderColor: "rgba(113,255,232,0.2)", background: "rgba(113,255,232,0.02)" }}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#71ffe8" }} />
          ) : (
            <>
              <ImageIcon className="w-8 h-8" style={{ color: "rgba(113,255,232,0.4)" }} />
              <p className="text-sm" style={{ color: "#849490" }}>Click or drag to upload product image</p>
              <p className="text-xs" style={{ color: "#7d8d88" }}>JPG, PNG, WEBP · Max {MAX_SIZE_MB}MB · auto-compressed to ≤1MB</p>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
