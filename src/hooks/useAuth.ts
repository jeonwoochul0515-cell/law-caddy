// Firebase 인증 상태 관리 훅 (Zustand)
// onAuthStateChanged 리스너 + Firestore 사용자 문서 연동
// 데모 모드: Firebase 없이 목(mock) 사용자로 즉시 인증

import { create } from "zustand";
import { isDemoMode, DEMO_USER } from "../config/demo";
import type { User } from "../types/user";

/** 회원가입 시 추가 입력 정보 */
interface RegisterData {
  name: string;
  firmName: string;
  barLicenseNumber: string;
  phone?: string;
  privacyConsented?: boolean;
  businessNumber?: string;
  businessVerified?: boolean;
  businessLicenseFile?: File;
  businessAddress?: string;
  businessType?: string;
  businessCategory?: string;
  businessStartDate?: string;
}

/** Auth 스토어 상태 */
interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
}

/** Auth 스토어 액션 */
interface AuthActions {
  /** Firebase Auth 상태 리스너 시작 */
  initialize: () => () => void;
  /** 이메일/비밀번호 로그인 */
  login: (email: string, password: string) => Promise<User>;
  /** 변호사 회원가입 */
  register: (
    email: string,
    password: string,
    userData: RegisterData,
  ) => Promise<void>;
  /** 로그아웃 */
  logout: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const useAuth = create<AuthStore>((set) => ({
  // 초기 상태
  user: null,
  loading: true,
  initialized: false,

  initialize: () => {
    // 데모 모드: Firebase 리스너 없이 즉시 데모 사용자로 설정
    if (isDemoMode) {
      set({ user: DEMO_USER, loading: false, initialized: true });
      // 아무 작업도 하지 않는 unsubscribe 함수 반환
      return () => {};
    }

    // Firebase 모드: 동적으로 Firebase 모듈을 로드
    // (top-level import를 사용하면 데모 모드에서도 Firebase 초기화가 실행됨)
    const setupListener = async () => {
      const { onAuthStateChanged } = await import("firebase/auth");
      const { doc, getDoc } = await import("firebase/firestore");
      const { auth, db } = await import("../config/firebase");

      if (!auth || !db) {
        set({ user: null, loading: false, initialized: true });
        return () => {};
      }

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const docRef = doc(db, "users", firebaseUser.uid);
            const docSnap = await getDoc(docRef);
            const userDoc = docSnap.exists()
              ? (docSnap.data() as User)
              : null;
            set({ user: userDoc, loading: false, initialized: true });
          } catch {
            // Firestore 조회 실패 시에도 로딩은 완료
            set({ user: null, loading: false, initialized: true });
          }
        } else {
          set({ user: null, loading: false, initialized: true });
        }
      });

      return unsubscribe;
    };

    // 비동기 리스너 설정 시작
    let unsubscribeFn: (() => void) | null = null;
    setupListener().then((unsub) => {
      unsubscribeFn = unsub;
    });

    // 외부에 반환하는 unsubscribe: 비동기 설정 완료 후 해제
    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  },

  login: async (email: string, password: string) => {
    // 데모 모드: 즉시 데모 사용자로 로그인
    if (isDemoMode) {
      set({ user: DEMO_USER, loading: false });
      return DEMO_USER;
    }

    set({ loading: true });
    try {
      const { signIn } = await import("../services/firebase/auth");
      const user = await signIn(email, password);
      set({ user, loading: false });
      return user;
    } catch (error: unknown) {
      set({ loading: false });
      throw error;
    }
  },

  register: async (
    email: string,
    password: string,
    userData: RegisterData,
  ) => {
    // 데모 모드: 즉시 활성화 사용자로 설정
    if (isDemoMode) {
      const approvedUser: User = {
        ...DEMO_USER,
        email,
        name: userData.name,
        firmName: userData.firmName,
        barLicenseNumber: userData.barLicenseNumber,
        status: "approved",
      };
      set({ user: approvedUser, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const { signUp } = await import("../services/firebase/auth");
      const user = await signUp(email, password, userData);
      set({ user, loading: false });
    } catch (error: unknown) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    // 데모 모드: 즉시 사용자 제거
    if (isDemoMode) {
      set({ user: null, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const { signOut } = await import("../services/firebase/auth");
      await signOut();
      set({ user: null, loading: false });
    } catch (error: unknown) {
      set({ loading: false });
      throw error;
    }
  },
}));

export default useAuth;
