import React from "react";
import { uploadBytes, ref } from "firebase/storage";
import { nanoid } from "nanoid";

import { trackEvent } from "@causcape/causcape/analytics";
import { Card } from "@causcape/causcape/components/Card";
import { CauscapeLogo } from "@causcape/causcape/components/CauscapeLogo";
import { IconButton } from "@causcape/causcape/components/IconButton";
import { MIME_TYPES, getFrame } from "@causcape/common";
import {
  encryptData,
  generateEncryptionKey,
} from "@causcape/causcape/data/encryption";
import { serializeAsJSON } from "@causcape/causcape/data/json";
import { isInitializedImageElement } from "@causcape/element";
import { useI18n } from "@causcape/causcape/i18n";

import type {
  FileId,
  NonDeletedCauscapeElement,
} from "@causcape/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@causcape/causcape/types";

import { FILE_UPLOAD_MAX_BYTES } from "../app_constants";
import { encodeFilesForUpload } from "../data/FileManager";
import { loadFirebaseStorage, saveFilesToFirebase } from "../data/firebase";

export const exportToCauscapePlus = async (
  elements: readonly NonDeletedCauscapeElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
) => {
  const storage = await loadFirebaseStorage();

  const id = `${nanoid(12)}`;

  const encryptionKey = (await generateEncryptionKey())!;
  const encryptedData = await encryptData(
    encryptionKey,
    serializeAsJSON(elements, appState, files, "database"),
  );

  const blob = new Blob(
    [encryptedData.iv, new Uint8Array(encryptedData.encryptedBuffer)],
    {
      type: MIME_TYPES.binary,
    },
  );

  const storageRef = ref(storage, `/migrations/scenes/${id}`);
  await uploadBytes(storageRef, blob, {
    customMetadata: {
      data: JSON.stringify({ version: 2, name }),
      created: Date.now().toString(),
    },
  });

  const filesMap = new Map<FileId, BinaryFileData>();
  for (const element of elements) {
    if (isInitializedImageElement(element) && files[element.fileId]) {
      filesMap.set(element.fileId, files[element.fileId]);
    }
  }

  if (filesMap.size) {
    const filesToUpload = await encodeFilesForUpload({
      files: filesMap,
      encryptionKey,
      maxBytes: FILE_UPLOAD_MAX_BYTES,
    });

    await saveFilesToFirebase({
      prefix: `/migrations/files/scenes/${id}`,
      files: filesToUpload,
    });
  }

  window.open(
    `${
      import.meta.env.VITE_APP_PLUS_APP
    }/import?causcape=${id},${encryptionKey}`,
  );
};

export const ExportToCauscapePlus: React.FC<{
  elements: readonly NonDeletedCauscapeElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  name: string;
  onError: (error: Error) => void;
  onSuccess: () => void;
}> = ({ elements, appState, files, name, onError, onSuccess }) => {
  const { t } = useI18n();
  return (
    <Card color="primary">
      <div className="Card-icon">
        <CauscapeLogo
          style={{
            [`--color-logo-icon` as any]: "#fff",
            width: "2.8rem",
            height: "2.8rem",
          }}
        />
      </div>
      <h2>Causcape+</h2>
      <div className="Card-details">
        {t("exportDialog.causcapeplus_description")}
      </div>
      <IconButton
        className="Card-button"
        type="button"
        title={t("exportDialog.causcapeplus_button")}
        aria-label={t("exportDialog.causcapeplus_button")}
        showAriaLabel={true}
        onClick={async () => {
          try {
            trackEvent("export", "eplus", `ui (${getFrame()})`);
            await exportToCauscapePlus(elements, appState, files, name);
            onSuccess();
          } catch (error: any) {
            console.error(error);
            if (error.name !== "AbortError") {
              onError(new Error(t("exportDialog.causcapeplus_exportError")));
            }
          }
        }}
      />
    </Card>
  );
};
