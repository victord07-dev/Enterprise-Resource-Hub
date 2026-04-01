import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Upload, Download, FileText, X } from "lucide-react";
import { getUser } from "@/lib/auth";
import type { Attachment } from "@shared/schema";

interface AttachmentsPanelProps {
  entityType: "grn" | "supplier_invoice";
  entityId: string;
  module?: "inventory" | "accounts" | "sales";
}

const DOC_TYPE_LABELS: Record<string, { label: string; variant: string }> = {
  challan: { label: "Challan", variant: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800" },
  invoice: { label: "Invoice", variant: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800" },
  other: { label: "Other", variant: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/30 dark:text-gray-400 dark:border-gray-800" },
};

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function AttachmentsPanel({ entityType, entityId, module: mod = "inventory" }: AttachmentsPanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<"challan" | "invoice" | "other">("other");
  const currentUser = getUser();

  const { data: attachments, isLoading } = useQuery<Attachment[]>({
    queryKey: ["/api/attachments", entityType, entityId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/attachments/${entityType}/${entityId}`);
      return res.json();
    },
    enabled: !!entityId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attachments", entityType, entityId] });
      toast({ title: "Attachment removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!ALLOWED.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only PDF, JPG, and PNG files are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const fileHash = await computeSHA256(file);

      // Step 1: Request signed upload URL
      const reqRes = await apiRequest("POST", "/api/attachments/request-upload", {
        entityType,
        entityId,
        documentType: docType,
        module: mod,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileHash,
      });
      if (!reqRes.ok) {
        const errData = await reqRes.json();
        throw new Error(errData.message || "Failed to get upload URL");
      }
      const { uploadURL, objectPath } = await reqRes.json();

      // Step 2: Upload file directly to GCS
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file to storage");

      // Step 3: Confirm attachment record
      const confirmRes = await apiRequest("POST", "/api/attachments/confirm", {
        entityType,
        entityId,
        documentType: docType,
        module: mod,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileHash,
        objectPath,
      });
      if (!confirmRes.ok) {
        const errData = await confirmRes.json();
        throw new Error(errData.message || "Failed to save attachment record");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/attachments", entityType, entityId] });
      toast({ title: "File attached", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message || "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const canDelete = (att: Attachment) =>
    !!currentUser && (currentUser.id === att.uploadedBy || currentUser.role === "admin");

  const isImage = (fileType: string) => fileType.startsWith("image/");

  return (
    <div className="space-y-3" data-testid="panel-attachments">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Paperclip className="w-3 h-3" />
          Attachments {attachments && attachments.length > 0 && `(${attachments.length})`}
        </h4>
        <div className="flex items-center gap-2">
          <select
            value={docType}
            onChange={e => setDocType(e.target.value as any)}
            className="text-xs border rounded px-2 py-1 bg-background text-foreground h-7"
            data-testid="select-attachment-doc-type"
          >
            <option value="challan">Challan</option>
            <option value="invoice">Invoice</option>
            <option value="other">Other</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-attach-file"
          >
            <Upload className="w-3 h-3" />
            {uploading ? "Uploading…" : "Attach File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-file-attach"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : attachments && attachments.length > 0 ? (
        <div className="space-y-1.5">
          {attachments.map(att => {
            const dtInfo = DOC_TYPE_LABELS[att.documentType] ?? DOC_TYPE_LABELS.other;
            return (
              <div key={att.id} className="flex items-center gap-2 p-2 rounded-md border bg-background" data-testid={`row-attachment-${att.id}`}>
                {isImage(att.fileType) ? (
                  <a href={`/objects/${att.fileUrl.replace(/^\/objects\//, "")}`} target="_blank" rel="noreferrer">
                    <img
                      src={`/objects/${att.fileUrl.replace(/^\/objects\//, "")}`}
                      alt={att.fileName}
                      className="w-10 h-10 object-cover rounded border flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </a>
                ) : (
                  <a href={`/objects/${att.fileUrl.replace(/^\/objects\//, "")}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground flex-shrink-0">
                    <FileText className="w-8 h-8" />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-medium truncate">{att.fileName}</span>
                    <span className={`text-[10px] border rounded px-1.5 py-0.5 ${dtInfo.variant}`}>{dtInfo.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {(att.fileSize / 1024).toFixed(1)} KB · {new Date(att.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={`/objects/${att.fileUrl.replace(/^\/objects\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    download={att.fileName}
                    data-testid={`link-download-attachment-${att.id}`}
                  >
                    <Button size="icon" variant="ghost" className="w-7 h-7">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                  {canDelete(att) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => { if (confirm(`Remove attachment "${att.fileName}"?`)) deleteMutation.mutate(att.id); }}
                      data-testid={`button-delete-attachment-${att.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No attachments yet. Click "Attach File" to upload a PDF, JPG, or PNG (max 10 MB).</p>
      )}
    </div>
  );
}
