import { api, type Id } from "@eva/backend";
import type { AttachmentData } from "@vvedantb/native-ui/ai";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import { fetch as expoFetch } from "expo/fetch";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { parseStorageId } from "@eva/shared/storageUpload";

type Pending = AttachmentData & { storageId?: Id<"_storage"> };

/**
 * Composer attachments, as the web composer's + button: pick images, upload
 * each to Convex storage (`messages.generateUploadUrl`), and hand the storage
 * ids to the send. Uploads start on pick, so Send waits only for the last one.
 */
export function useAttachments() {
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const [items, setItems] = useState<Pending[]>([]);

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) throw new Error("No image data");
    const url = await generateUploadUrl({});
    // The image's bytes through Expo's native fetch. React Native's own fetch
    // of a file URI as a Blob, then a Blob body, sent nothing on Android.
    const response = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": asset.mimeType ?? "image/jpeg" },
      body: base64Bytes(asset.base64),
    });
    if (!response.ok) throw new Error(`Upload failed (${response.status})`);
    const storageId = parseStorageId(await response.text());
    if (!storageId) throw new Error("Upload failed");
    return storageId;
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
      const id = asset.assetId ?? asset.uri;
      setItems((current) => [...current, { id, url: asset.uri, mediaType: asset.mimeType ?? "image/jpeg", filename: asset.fileName ?? "Image" }]);
      upload(asset)
        .then((storageId) => {
          setItems((current) => current.map((item) => (item.id === id ? { ...item, storageId } : item)));
        })
        .catch(() => {
          // Never send without the image silently: say so, and drop the chip.
          toast.error("Couldn't upload the image");
          setItems((current) => current.filter((item) => item.id !== id));
        });
    }
  };

  return {
    items,
    pick,
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
