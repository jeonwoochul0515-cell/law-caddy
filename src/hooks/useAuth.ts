// Firebase 인증 상태 관리 훅 (Zustand)
// 구글 로그인 + Firestore 사용자 문서 연동
// 데모 모드: Firebase 없이 목(mock) 사용자로 즉시 인증

import { create } from "zustand";
import { isDemoMode, DEMO_USER } from "../config/demo";
import type { User } from "../types/user";

/** 프로필 설정 데이터 */
interface ProfileSetupData {
  name: string;
  firmName: string;
  barLicenseNumber: string;
  phone?: string;
  officePhone?: string;
  privacyConsented?: boolean;
  businessNumber?: string;
  businessVerified?: boolean;
  businessLicenseFile?: File;
  businessAddress?: string;
  businessType?: string;
  businessCategory?: string;
  businessStartDate?: string;
  businessCorporateNumber?: string;
  businessTaxOffice?: string;
  businessTaxType?: string;
}

/** 신규 구글 유저 정보 (프로필 미완성) */
interface NewGoogleUser {
  firebaseUid: string;
  email: string;
  photoURL?: string;
  displayName?: string;
}

/** Auth 스토어 상태 */
interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  /** 구글 로그인 했지만 프로필 미완성인 신규 유저 */
  newGoogleUser: NewGoogleUser | null;
}

/** Auth 스토어 액션 */
interface AuthActions {
  initialize: () => () => void;
  googleLogin: () => Promise<{ isNewUser: boolean }>;
  completeProfile: (profileData: ProfileSetupData) => Promise<User>;
  logout: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

const useAuth = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  newGoogleUser: null,

  initialize: () => {
    if (isDemoMode) {
      set({ user: DEMO_USER, loading: false, initialized: true });
      return () => {};
    }

    let unsubscribeFn: (() => void) | null = null;
    let disposed = false;

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
            if (docSnap.exists()) {
              const userDoc = docSnap.data() as User;
              set({ user: userDoc, newGoogleUser: null, loading: false, initialized: true });
            } else {
              // 구글로 로그인했지만 Firestore 문서가 없는 신규 유저
              set({
                user: null,
                newGoogleUser: {
                  firebaseUid: firebaseUser.uid,
                  email: firebaseUser.email || "",
                  photoURL: firebaseUser.photoURL || undefined,
                  displayName: firebaseUser.displayName || undefined,
                },
                loading: false,
                initialized: true,
              });
            }
          } catch {
            set({ user: null, loading: false, initialized: true });
          }
        } else {
          set({ user: null, newGoogleUser: null, loading: false, initialized: true });
        }
      });

      return unsubscribe;
    };

    setupListener().then((unsub) => {
      if (disposed) {
        unsub();
      } else {
        unsubscribeFn = unsub;
      }
    }).catch(() => {
      set({ user: null, loading: false, initialized: true });
    });

    return () => {
      disposed = true;
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  },

  googleLogin: async () => {
    if (isDemoMode) {
      set({ user: DEMO_USER, loading: false });
      return { isNewUser: false };
    }

    set({ loading: true });
    try {
      const { signInWithGoogle } = await import("../services/firebase/auth");
      const result = await signInWithGoogle();

      if (result.isNewUser) {
        set({
          user: null,
          newGoogleUser: {
            firebaseUid: result.firebaseUid,
            email: result.email,
            photoURL: result.photoURL,
            displayName: result.displayName,
          },
          loading: false,
        });
        return { isNewUser: true };
      } else {
        set({ user: result.user, newGoogleUser: null, loading: false });
        return { isNewUser: false };
      }
    } catch (error: unknown) {
      set({ loading: false });
      throw error;
    }
  },

  completeProfile: async (profileData: ProfileSetupData) => {
    const { newGoogleUser, user: existingUser } = get();

    // 신규 유저 또는 프로필 미완성 기존 유저
    const uid = newGoogleUser?.firebaseUid || existingUser?.uid;
    const email = newGoogleUser?.email || existingUser?.email;
    const photoURL = newGoogleUser?.photoURL || existingUser?.photoURL;

    if (!uid || !email) {
      throw new Error("프로필을 설정할 사용자 정보가 없습니다.");
    }

    set({ loading: true });
    try {
      const { completeProfile: completeProfileService } = await import("../services/firebase/auth");
      const user = await completeProfileService(
        uid,
        email,
        photoURL,
        profileData,
      );
      set({ user, newGoogleUser: null, loading: false });
      return user;
    } catch (error: unknown) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    if (isDemoMode) {
      set({ user: null, newGoogleUser: null, loading: false });
      return;
    }

    set({ loading: true });
    try {
      const { signOut } = await import("../services/firebase/auth");
      await signOut();
      set({ user: null, newGoogleUser: null, loading: false });
    } catch (error: unknown) {
      set({ loading: false });
      throw error;
    }
  },
}));

export default useAuth;
