// 녹음 + 파일 업로드 훅
// MediaRecorder API로 브라우저 녹음, Firebase Storage에 업로드

import { useState, useRef, useCallback } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

/** useRecording 반환 타입 */
interface UseRecordingReturn {
  /** 녹음 중 여부 */
  isRecording: boolean;
  /** 녹음된 오디오 Blob */
  audioBlob: Blob | null;
  /** 녹음 경과 시간 (초) */
  duration: number;
  /** 파일 업로드 중 여부 */
  uploading: boolean;
  /** 녹음 시작 */
  startRecording: () => Promise<void>;
  /** 녹음 중지 → Blob 반환 */
  stopRecording: () => Promise<Blob>;
  /** Firebase Storage에 파일 업로드 → 다운로드 URL 반환 */
  uploadFile: (file: Blob, ownerId: string, caseId: string) => Promise<string>;
  /** 녹음 상태 초기화 */
  reset: () => void;
}

/**
 * 녹음 + 파일 업로드 훅
 *
 * - startRecording: 마이크 접근 권한 요청 → MediaRecorder 녹음 시작
 * - stopRecording: 녹음 중지 → 오디오 Blob 반환
 * - uploadFile: Firebase Storage에 업로드 → 다운로드 URL 반환
 * - 녹음 중 경과 시간(초)을 1초 간격으로 추적
 */
export default function useRecording(): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);

  // MediaRecorder 및 타이머 참조
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // stopRecording에서 Promise resolve를 받기 위한 참조
  const resolveStopRef = useRef<((blob: Blob) => void) | null>(null);

  /** 경과 시간 타이머 시작 */
  const startTimer = useCallback(() => {
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  /** 타이머 정지 */
  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 마이크 스트림 해제 */
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  /** 녹음 시작 */
  const startRecording = useCallback(async () => {
    try {
      // 마이크 접근 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // MediaRecorder 초기화
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // 데이터 청크 수집
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 녹음 완료 시 Blob 생성
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stopTimer();
        releaseStream();

        // stopRecording 호출자에게 Blob 전달
        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        }
      };

      // 녹음 시작
      mediaRecorder.start(1000); // 1초 간격으로 데이터 수집
      setIsRecording(true);
      startTimer();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "마이크 접근에 실패했습니다.";
      throw new Error(`녹음 시작 실패: ${message}`);
    }
  }, [startTimer, stopTimer, releaseStream]);

  /** 녹음 중지 → Blob 반환 */
  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise<Blob>((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;

      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        reject(new Error("녹음이 진행 중이 아닙니다."));
        return;
      }

      resolveStopRef.current = resolve;
      mediaRecorder.stop();
      setIsRecording(false);
    });
  }, []);

  /** Firebase Storage에 파일 업로드 */
  const uploadFile = useCallback(
    async (file: Blob, ownerId: string, caseId: string): Promise<string> => {
      setUploading(true);

      try {
        const timestamp = Date.now();
        const fileName = `recording_${timestamp}.webm`;
        const storagePath = `recordings/${ownerId}/${caseId}/${fileName}`;
        const storageRef = ref(storage!, storagePath);

        await uploadBytes(storageRef, file, {
          contentType: "audio/webm",
          customMetadata: {
            ownerId,
            caseId,
            uploadedAt: new Date().toISOString(),
          },
        });

        const downloadUrl = await getDownloadURL(storageRef);
        return downloadUrl;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "파일 업로드 중 오류가 발생했습니다.";
        throw new Error(`업로드 실패: ${message}`);
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  /** 녹음 상태 초기화 */
  const reset = useCallback(() => {
    stopTimer();
    releaseStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    resolveStopRef.current = null;
    setIsRecording(false);
    setAudioBlob(null);
    setDuration(0);
    setUploading(false);
  }, [stopTimer, releaseStream]);

  return {
    isRecording,
    audioBlob,
    duration,
    uploading,
    startRecording,
    stopRecording,
    uploadFile,
    reset,
  };
}
