import { useState, useCallback, useRef, type DragEvent } from "react";

interface UseDropZoneReturn {
  isDragging: boolean;
  dropZoneProps: {
    onDragOver: (e: DragEvent) => void;
    onDragEnter: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
}

/**
 * FileSystemEntry에서 재귀적으로 파일을 읽어옵니다.
 * 폴더 드래그 앤 드롭 시 폴더 내부 파일을 모두 가져옵니다.
 */
async function readEntriesRecursively(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([]),
      );
    });
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];

    // readEntries는 한 번에 최대 100개만 반환할 수 있으므로 반복 호출
    const readBatch = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve) => {
        dirReader.readEntries(
          (entries) => resolve(entries),
          () => resolve([]),
        );
      });

    let batch = await readBatch();
    while (batch.length > 0) {
      for (const child of batch) {
        const childFiles = await readEntriesRecursively(child);
        files.push(...childFiles);
      }
      batch = await readBatch();
    }

    return files;
  }

  return [];
}

/**
 * DataTransfer에서 파일을 추출합니다.
 * 폴더가 포함된 경우 webkitGetAsEntry를 사용해 재귀적으로 파일을 읽습니다.
 */
async function extractFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = dataTransfer.items;

  // webkitGetAsEntry를 지원하는 경우 (Chrome, Edge, Firefox)
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function") {
    const files: File[] = [];
    const entries: FileSystemEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    for (const entry of entries) {
      const entryFiles = await readEntriesRecursively(entry);
      files.push(...entryFiles);
    }

    return files;
  }

  // 폴백: 일반 파일만 (폴더는 0바이트로 들어오므로 필터)
  return Array.from(dataTransfer.files).filter((f) => f.size > 0);
}

/**
 * 드래그 앤 드롭 파일 업로드 훅
 * 폴더 드롭 시 내부 파일을 재귀적으로 읽어옵니다.
 *
 * @param onFiles - 드롭된 파일 배열을 받는 콜백
 * @param accept - 허용할 MIME 타입 패턴 (예: ["audio/*", "image/*", "application/pdf"])
 */
export default function useDropZone(
  onFiles: (files: File[]) => void,
  accept?: string[],
): UseDropZoneReturn {
  const [isDragging, setIsDragging] = useState(false);
  const counterRef = useRef(0);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    counterRef.current += 1;
    if (counterRef.current === 1) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    counterRef.current = Math.max(0, counterRef.current - 1);
    if (counterRef.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      counterRef.current = 0;

      // 비동기로 파일 추출 (폴더 포함)
      extractFiles(e.dataTransfer).then((droppedFiles) => {
        if (droppedFiles.length === 0) return;

        if (accept && accept.length > 0) {
          const filtered = droppedFiles.filter((f) =>
            accept.some((pattern) => {
              if (pattern.endsWith("/*")) {
                return f.type.startsWith(pattern.replace("/*", "/"));
              }
              if (pattern.startsWith(".")) {
                return f.name.toLowerCase().endsWith(pattern.toLowerCase());
              }
              return f.type === pattern;
            }),
          );
          onFiles(filtered.length > 0 ? filtered : droppedFiles);
        } else {
          onFiles(droppedFiles);
        }
      }).catch(() => {
        // 폴백: 일반 파일만
        const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
        if (files.length > 0) onFiles(files);
      });
    },
    [onFiles, accept],
  );

  return {
    isDragging,
    dropZoneProps: { onDragOver, onDragEnter, onDragLeave, onDrop },
  };
}
