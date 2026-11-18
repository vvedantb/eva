import { api, type Id } from "@eva/backend";
import type { AttachmentData } from "@vvedantb/native-ui/ai";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import { fetch as expoFetch } from "expo/fetch";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { parseStorageId } from "@eva/shared/storageUpload";
import { takeClipboardImage } from "@/chat/clipboardImage";

type Pending = AttachmentData & { storageId?: Id<"_storage"> };

/**
 * Composer attachments, as the web composer's + button and paste: pick images
 * or paste the clipboard's, upload each to Convex storage
 * (`messages.generateUploadUrl`), and hand the storage ids to the send.
 * Uploads start on pick, so Send waits only for the last one.
 */
export function useAttachments() {
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const [items, setItems] = useState<Pending[]>([]);

  const upload = async (base64: string, mimeType: string) => {
    const url = await generateUploadUrl({});
    // The image's bytes through Expo's native fetch. React Native's own fetch
    // of a file URI as a Blob, then a Blob body, sent nothing on Android.
    const response = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: base64Bytes(base64),
    });
    if (!response.ok) throw new Error(`Upload failed (${response.status})`);
    const storageId = parseStorageId(await response.text());
    if (!storageId) throw new Error("Upload failed");
    return storageId;
  };

  // Shows the chip at once and uploads in the background.
  const add = (item: AttachmentData, base64: string | null | undefined) => {
    setItems((current) => [...current, item]);
    const uploaded = base64 ? upload(base64, item.mediaType ?? "image/jpeg") : Promise.reject(new Error("No image data"));
    uploaded
      .then((storageId) => {
        setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, storageId } : entry)));
      })
      .catch(() => {
        // Never send without the image silently: say so, and drop the chip.
        toast.error("Couldn't upload the image");
        setItems((current) => current.filter((entry) => entry.id !== item.id));
      });
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      add(
        { id: asset.assetId ?? asset.uri, url: asset.uri, mediaType: asset.mimeType ?? "image/jpeg", filename: asset.fileName ?? "Image" },
        asset.base64,
      );
    }
  };

  /** The clipboard's image, as the web composer's paste. */
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

  return {
    items,
    pick,
    paste,
    remove: (id: string) => setItems((current) => current.filter((item) => item.id !== id)),
    clear: () => setItems([]),
    uploading: items.some((item) => item.storageId === undefined),
    storageIds: items.flatMap((item) => (item.storageId ? [item.storageId] : [])),
  };
}

/** The bytes of a base64 string (the picker's `base64`). */
function base64Bytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}
