// 녹음 + 파일 업로드 훅
// MediaRecorder API로 브라우저 녹음, Firebase Storage에 업로드
//
// (2026-07-31) 폰에서 상담 중 전화가 오면 녹음이 통째로 날아가던 문제를 막는다:
//  - 조각(5초)마다 IndexedDB에 즉시 저장 → 브라우저가 죽어도 그 직전까지는 남는다
//  - 마이크를 뺏기면(track ended) 감지해 onInterrupted로 알린다 — 지금까지는 멈춘 줄도 몰랐다

import { useState, useRef, useCallback, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";
import { beginSession, appendChunk } from "../services/recordingStore";

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
  /** 전화 수신 등으로 녹음이 강제 중단되었는지 */
  interrupted: boolean;
  /** 중단 알림을 확인 처리 */
  clearInterrupted: () => void;
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
  const [interrupted, setInterrupted] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);

  // MediaRecorder 및 타이머 참조
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** 조각 저장 시 현재 경과 시간을 넘기기 위한 참조 (setState는 비동기라 값이 늦다) */
  const durationRef = useRef(0);

  // stopRecording에서 Promise resolve를 받기 위한 참조
  const resolveStopRef = useRef<((blob: Blob) => void) | null>(null);

  /** 경과 시간 타이머 시작 */
  const startTimer = useCallback(() => {
    setDuration(0);
    durationRef.current = 0;
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
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

  // 언마운트 시 타이머 + 마이크 스트림 정리
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  /** 녹음 시작 */
  const startRecording = useCallback(async () => {
    try {
      // 마이크 접근 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // MediaRecorder 초기화 (Safari 호환: WebM 미지원 시 브라우저 기본 코덱 사용)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // 이 녹음의 조각 저장소를 초기화 (이전 세션 조각은 버린다)
      await beginSession(mediaRecorder.mimeType || mimeType || "audio/webm");

      // 데이터 청크 수집 — 메모리에 쌓는 동시에 디스크에도 즉시 저장한다
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          void appendChunk(event.data, durationRef.current);
        }
      };

      // 마이크를 빼앗기면(전화 수신·다른 앱이 점유) 알린다.
      // 이 이벤트가 없으면 화면은 "녹음 중"인데 실제로는 아무것도 녹음되지 않는다.
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          setInterrupted(true);
          setIsRecording(false);
          stopTimer();
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            // 여기까지의 데이터를 확보한다 (onstop이 Blob을 만든다)
            mediaRecorderRef.current.stop();
          }
        };
      });

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

      mediaRecorder.onerror = () => {
        setInterrupted(true);
        setIsRecording(false);
        stopTimer();
      };

      // 녹음 시작 — 5초 간격으로 조각을 받아 즉시 저장한다
      // (1초는 IndexedDB 쓰기가 너무 잦고, 10초는 사고 시 잃는 양이 크다)
      mediaRecorder.start(5000);
      setIsRecording(true);
      setInterrupted(false);
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
        if (!storage) {
          throw new Error("Firebase Storage가 초기화되지 않았습니다.");
        }
        const timestamp = Date.now();
        const fileName = `recording_${timestamp}.webm`;
        const storagePath = `recordings/${ownerId}/${caseId}/${fileName}`;
        const storageRef = ref(storage, storagePath);

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
    setInterrupted(false);
    setAudioBlob(null);
    setDuration(0);
    durationRef.current = 0;
    setUploading(false);
  }, [stopTimer, releaseStream]);

  const clearInterrupted = useCallback(() => setInterrupted(false), []);

  return {
    isRecording,
    audioBlob,
    duration,
    uploading,
    startRecording,
    stopRecording,
    uploadFile,
    reset,
    interrupted,
    clearInterrupted,
  };
}
