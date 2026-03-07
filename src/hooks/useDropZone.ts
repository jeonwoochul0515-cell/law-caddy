import { useState, useCallback, type DragEvent } from "react";

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
 * 드래그 앤 드롭 파일 업로드 훅
 *
 * @param onFiles - 드롭된 파일 배열을 받는 콜백
 * @param accept - 허용할 MIME 타입 패턴 (예: ["audio/*", "image/*", "application/pdf"])
 */
export default function useDropZone(
  onFiles: (files: File[]) => void,
  accept?: string[],
): UseDropZoneReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((c) => {
      if (c === 0) setIsDragging(true);
      return c + 1;
    });
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((c) => {
      const next = c - 1;
      if (next <= 0) {
        setIsDragging(false);
        return 0;
      }
      return next;
    });
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setDragCounter(0);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;

      if (accept && accept.length > 0) {
        const filtered = droppedFiles.filter((f) =>
          accept.some((pattern) => {
            if (pattern.endsWith("/*")) {
              return f.type.startsWith(pattern.replace("/*", "/"));
            }
            // 확장자 매칭 (.pdf, .hwp 등)
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
    },
    [onFiles, accept],
  );

  return {
    isDragging,
    dropZoneProps: { onDragOver, onDragEnter, onDragLeave, onDrop },
  };
}
