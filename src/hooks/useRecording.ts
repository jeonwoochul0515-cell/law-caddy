// 녹음 + 파일 업로드 훅
// MediaRecorder API로 브라우저 녹음, Firebase Storage에 업로드
//
// (2026-07-31) 폰에서 상담 중 전화가 오면 녹음이 통째로 날아가던 문제를 막는다:
//  - 조각(5초)마다 IndexedDB에 즉시 저장 → 브라우저가 죽어도 그 직전까지는 남는다
//  - 마이크를 뺏기면(track ended) 감지해 onInterrupted로 알린다 — 지금까지는 멈춘 줄도 몰랐다
// (2026-09-11)
//  - 끊긴 순간 그때까지의 조각을 파일(interruptedFile)로 만들어 화면에 넘긴다.
//    "이어서 녹음"을 눌러도 새 세션이 이전 조각을 지우지 못하게(r1-03-01).
//  - 새 녹음 시작 전, 저장소에 남은 이전 조각이 있으면 파일로 먼저 꺼내 준다(recoveredFile).
//  - 마이크 권한 오류를 한국어로 바꾸고(r1-03-11), 임시저장 실패를 알린다(r2-02-22).

import { useState, useRef, useCallback, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";
import { beginSession, appendChunk, buildSavedFile, getSavedSession, clearSession } from "../services/recordingStore";
import { rawErrorText } from "../utils/friendlyError";

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
  /** 강제 중단 순간까지의 녹음을 담은 파일 (화면이 첨부 목록에 넣고 takeInterruptedFile로 비운다) */
  interruptedFile: File | null;
  takeInterruptedFile: () => File | null;
  /** 새 녹음을 시작하기 직전, 저장소에 남아 있던 이전 녹음을 되살린 파일 */
  recoveredFile: File | null;
  takeRecoveredFile: () => File | null;
  /** 조각 임시저장이 실패하고 있는지 (브라우저 저장공간 부족·비공개 모드) */
  storeUnavailable: boolean;
  /** 방금 만든 녹음 파일의 길이(초) — stopRecording이 돌려준 Blob에 해당 */
  lastRecordingSeconds: number;
}

/** 마이크 오류를 사람이 읽을 한국어로 바꾼다. 다음 행동까지 함께 적는다. */
export function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  // 여기서는 원문이 필요하다 — 아래 검사가 영어 패턴으로 오류 종류를 가른다.
  // 한국어로 먼저 바꾸면 분기가 전부 빗나간다.
  const message = rawErrorText(err);
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /permission|denied|not allowed/i.test(message)) {
    return "마이크 사용이 차단되어 있습니다. 주소창 왼쪽 자물쇠(또는 설정) 아이콘을 눌러 마이크를 '허용'으로 바꾼 뒤 다시 눌러 주세요. 급하면 휴대폰 녹음 앱으로 녹음한 파일을 다음 단계에서 첨부해도 됩니다.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || /not found|no device/i.test(message)) {
    return "연결된 마이크를 찾지 못했습니다. 마이크나 이어폰을 연결한 뒤 다시 눌러 주세요. 없으면 휴대폰 녹음 파일을 다음 단계에서 첨부하면 됩니다.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || /in use|could not start/i.test(message)) {
    return "다른 앱이 마이크를 쓰고 있어 녹음을 시작할 수 없습니다. 통화나 화상회의 앱을 닫고 다시 눌러 주세요.";
  }
  if (name === "SecurityError" || /secure context|https/i.test(message)) {
    return "이 주소에서는 마이크를 쓸 수 없습니다. https://law-caddy.com 으로 접속해 주세요.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
    return "이 브라우저는 녹음을 지원하지 않습니다. 크롬이나 사파리 최신 버전으로 열거나, 휴대폰 녹음 파일을 다음 단계에서 첨부해 주세요.";
  }
  return "녹음을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 눌러 주세요. 계속 안 되면 휴대폰 녹음 파일을 다음 단계에서 첨부해 주세요.";
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
  const [interruptedFile, setInterruptedFile] = useState<File | null>(null);
  const [recoveredFile, setRecoveredFile] = useState<File | null>(null);
  const [storeUnavailable, setStoreUnavailable] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lastRecordingSeconds, setLastRecordingSeconds] = useState(0);

  // MediaRecorder 및 타이머 참조
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** 조각 저장 시 현재 경과 시간을 넘기기 위한 참조 (setState는 비동기라 값이 늦다) */
  const durationRef = useRef(0);
  const mimeRef = useRef("audio/webm");
  const startedAtRef = useRef(0);

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

  /** 지금까지 모은 조각으로 파일을 만든다 */
  const buildFileFromChunks = useCallback((): File | null => {
    if (chunksRef.current.length === 0) return null;
    const type = mimeRef.current;
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunksRef.current, { type });
    return new File([blob], `recording_${startedAtRef.current || Date.now()}.${ext}`, {
      type,
      lastModified: startedAtRef.current || Date.now(),
    });
  }, []);

  /** 녹음 시작 */
  const startRecording = useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저는 녹음을 지원하지 않습니다.");
      }
      // 마이크 접근 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 저장소에 이전 녹음 조각이 남아 있으면 지우기 전에 파일로 먼저 꺼낸다
      // ("이어서 녹음"을 누르자마자 끊기기 전 녹음이 사라지던 사고를 막는다)
      try {
        const saved = await getSavedSession();
        if (saved && saved.duration > 3) {
          const file = await buildSavedFile();
          if (file) setRecoveredFile(file);
        }
      } catch { /* 저장소를 못 읽으면 그냥 진행 */ }

      // MediaRecorder 초기화 (Safari 호환: WebM 미지원 시 브라우저 기본 코덱 사용)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      // 사파리는 audio/mp4로 녹음된다 — Blob·파일 확장자를 실제 형식에 맞춘다
      const actualMime = (mediaRecorder.mimeType || mimeType || "audio/webm").split(";")[0];
      mimeRef.current = actualMime;
      startedAtRef.current = Date.now();
      setStoreUnavailable(false);

      // 이 녹음의 조각 저장소를 초기화 (이전 세션 조각은 위에서 파일로 꺼냈다)
      await beginSession(actualMime);

      // 데이터 청크 수집 — 메모리에 쌓는 동시에 디스크에도 즉시 저장한다
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          void appendChunk(event.data, durationRef.current).then((ok) => {
            if (!ok) setStoreUnavailable(true);
          });
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
            // 여기까지의 데이터를 확보한다 (onstop이 파일을 만든다)
            mediaRecorderRef.current.stop();
          } else {
            const file = buildFileFromChunks();
            if (file) setInterruptedFile(file);
          }
        };
      });

      // 녹음 완료 시 Blob 생성
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        setAudioBlob(blob);
        setLastRecordingSeconds(durationRef.current);
        stopTimer();
        releaseStream();

        // stopRecording 호출자에게 Blob 전달
        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        } else {
          // 호출자 없이 멈췄다 = 강제 중단. 그때까지의 녹음을 파일로 넘긴다.
          //
          // (2026-09-19) 여기서 clearSession()을 불렀다. 그러면 메모리 사본은
          // interruptedFile 하나뿐인데, 화면이 그걸 가져가지 않으면 둘 다 사라졌다.
          // 화면이 떠나는 중(언마운트)에도 이 경로를 타므로 더 위험했다.
          // 조각은 남겨 둔다. 다음에 들어오면 복구 배너가 살리고,
          // 화면이 파일을 받아간 뒤(takeInterruptedFile)에만 지운다.
          const file = buildFileFromChunks();
          if (file) setInterruptedFile(file);
        }
      };

      mediaRecorder.onerror = () => {
        setInterrupted(true);
        setIsRecording(false);
        stopTimer();
        const file = buildFileFromChunks();
        if (file) setInterruptedFile(file);
      };

      // 녹음 시작 — 5초 간격으로 조각을 받아 즉시 저장한다
      // (1초는 IndexedDB 쓰기가 너무 잦고, 10초는 사고 시 잃는 양이 크다)
      mediaRecorder.start(5000);
      setIsRecording(true);
      setInterrupted(false);
      startTimer();
    } catch (err: unknown) {
      releaseStream();
      throw new Error(describeMicError(err));
    }
  }, [startTimer, stopTimer, releaseStream, buildFileFromChunks]);

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
        const ext = (file.type || mimeRef.current).includes("mp4") ? "mp4" : "webm";
        const fileName = `recording_${timestamp}.${ext}`;
        const storagePath = `recordings/${ownerId}/${caseId}/${fileName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file, {
          contentType: file.type || mimeRef.current,
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
    setInterruptedFile(null);
    setRecoveredFile(null);
    setAudioBlob(null);
    setDuration(0);
    durationRef.current = 0;
    setUploading(false);
  }, [stopTimer, releaseStream]);

  const clearInterrupted = useCallback(() => setInterrupted(false), []);

  // 화면이 파일을 손에 넣은 뒤에만 디스크 조각을 지운다. 순서가 바뀜면 둘 다 잃는다.
  const takeInterruptedFile = useCallback((): File | null => {
    const f = interruptedFile;
    if (f) {
      setInterruptedFile(null);
      void clearSession();
    }
    return f;
  }, [interruptedFile]);

  const takeRecoveredFile = useCallback((): File | null => {
    const f = recoveredFile;
    if (f) setRecoveredFile(null);
    return f;
  }, [recoveredFile]);

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
    interruptedFile,
    takeInterruptedFile,
    recoveredFile,
    takeRecoveredFile,
    storeUnavailable,
    lastRecordingSeconds,
  };
}
