import { api, type Id } from "@eva/backend";
import type { AttachmentData } from "@vvedantb/native-ui/ai";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  chatAttachmentErrorMessage,
  contentTypeForUpload,
  isAllowedAttachmentFile,
  isImageContentType,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
} from "@eva/shared";
import { parseStorageId } from "@eva/shared/storageUpload";
import { takeClipboardImage } from "@/chat/clipboardImage";

type Pending = AttachmentData & { storageId?: Id<"_storage"> };

/**
 * Composer attachments, as the web composer's + menu and paste: pick images
 * or files (HTML, Markdown, text, as the web), paste images into the field, or
 * take the clipboard's from the chip; upload each to Convex storage
 * (`messages.generateUploadUrl`), and hand the storage ids to the send.
 * Uploads start on pick, so Send waits only for the last one.
 */
export function useAttachments() {
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const [items, setItems] = useState<Pending[]>([]);

  const upload = async (data: string | ArrayBuffer, mimeType: string) => {
    const url = await generateUploadUrl({});
    const response = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: typeof data === "string" ? base64Bytes(data) : data,
    });
    if (!response.ok) throw new Error(`Upload failed (${response.status})`);
    const storageId = parseStorageId(await response.text());
    if (!storageId) throw new Error("Upload failed");
    return storageId;
  };

  const add = (item: AttachmentData, data: Promise<string | ArrayBuffer> | string | null | undefined) => {
    const image = isImageContentType(item.mediaType);
    setItems((current) => [...current, item]);
    const uploaded = Promise.resolve(data).then((bytes) =>
      bytes ? upload(bytes, item.mediaType ?? "image/jpeg") : Promise.reject(new Error("No file data")),
    );
    uploaded
      .then((storageId) => {
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, storageId } : entry)));
      })
      .catch(() => {
        toast.error(image ? "Couldn't upload the image" : "Couldn't upload the file");
        setItems((current) => current.filter((entry) => entry.id !== item.id));
      });
  };

  const admit = <T extends { mediaType?: string; filename?: string; size?: number }>(picked: T[]): T[] => {
    const allowed = picked.filter((file) => isAllowedAttachmentFile(file));
    const small = allowed.filter((file) => (file.size ?? 0) <= MAX_CHAT_ATTACHMENT_BYTES);
    const kept = small.slice(0, Math.max(0, MAX_CHAT_ATTACHMENTS - items.length));
    const code = allowed.length < picked.length ? "accept" : small.length < allowed.length ? "max_file_size" : kept.length < small.length ? "max_files" : null;
    if (code) toast.error(chatAttachmentErrorMessage({ code }));
    return kept;
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    const picked = result.assets.map((asset) => ({
      asset,
      mediaType: asset.mimeType ?? "image/jpeg",
      filename: asset.fileName ?? "Image",
      size: asset.fileSize,
    }));
    for (const { asset, mediaType, filename } of admit(picked)) {
      add({ id: asset.assetId ?? asset.uri, url: asset.uri, mediaType, filename }, asset.base64);
    }
  };

  const pickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const picked = result.assets.map((asset) => {
      const declared = asset.mimeType !== undefined && UPLOAD_TYPES.test(asset.mimeType) ? asset.mimeType : undefined;
      return { asset, filename: asset.name, mediaType: contentTypeForUpload({ mediaType: declared, filename: asset.name }, ""), size: asset.size };
    });
    for (const { asset, mediaType, filename } of admit(picked)) {
      const bytes = asset.file ? asset.file.arrayBuffer() : new File(asset.uri).arrayBuffer();
      add({ id: asset.uri, url: asset.uri, mediaType, filename }, bytes);
    }
  };

  const paste = async () => {
    const image = await takeClipboardImage().catch(() => null);
    if (!image) {
      toast.error("The clipboard has no image");
      return;
    }
    add(
      { id: `clipboard-${Date.now()}`, url: `data:${image.mimeType};base64,${image.base64}`, mediaType: image.mimeType, filename: "Pasted image" },
      image.base64,
    );
  };

  const pasteFiles = (uris: string[]) => {
    for (const uri of uris) {
      add({ id: uri, url: uri, mediaType: imageType(uri), filename: "Pasted image" }, new File(uri).base64());
    }
  };

  return {
    items,
    pick,
    pickFiles,
    paste,
    pasteFiles,
    remove: (id: string) => setItems((current) => current.filter((item) => item.id !== id)),
    clear: () => setItems([]),
    uploading: items.some((item) => item.storageId === undefined),
    storageIds: items.flatMap((item) => (item.storageId ? [item.storageId] : [])),
  };
}

const UPLOAD_TYPES = /^(image\/(jpeg|png|gif|webp|svg\+xml)|text\/(html|markdown|plain))$/;

function base64Bytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

function imageType(uri: string): string {
  const extension = uri.split("?")[0]?.split(".").pop()?.toLowerCase();
  return extension === "png" ? "image/png" : extension === "gif" ? "image/gif" : extension === "webp" ? "image/webp" : "image/jpeg";
}
