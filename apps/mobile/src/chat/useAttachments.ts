import { api, type Id } from "@eva/backend";
import type { AttachmentData } from "@vvedantb/native-ui/ai";
import { useMutation } from "convex/react";
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
    const url = await generateUploadUrl({});
    const body = await (await fetch(asset.uri)).blob();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": asset.mimeType ?? "image/jpeg" },
      body,
    });
    const storageId = parseStorageId(await response.text());
    if (!storageId) throw new Error("Upload failed");
    return storageId;
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.8 });
    if (result.canceled) return;
    for (const asset of result.assets) {
      const id = asset.assetId ?? asset.uri;
      setItems((current) => [...current, { id, url: asset.uri, mediaType: asset.mimeType ?? "image/jpeg", filename: asset.fileName ?? "Image" }]);
      upload(asset)
        .then((storageId) => {
          setItems((current) => current.map((item) => (item.id === id ? { ...item, storageId } : item)));
        })
        .catch(() => setItems((current) => current.filter((item) => item.id !== id)));
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
