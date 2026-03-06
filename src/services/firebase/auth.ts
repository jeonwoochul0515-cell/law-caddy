// Firebase Authentication 서비스
// 이메일/비밀번호 인증 + Firestore 사용자 문서 관리

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../../config/firebase";
import type { User } from "../../types/user";

/** 회원가입 시 추가 입력 정보 */
interface SignUpData {
  name: string;
  firmName: string;
  barLicenseNumber: string;
  businessNumber?: string;
  businessVerified?: boolean;
  businessLicenseFile?: File;
  businessAddress?: string;
  businessType?: string;
  businessCategory?: string;
  businessStartDate?: string;
}

/**
 * 신규 변호사 회원가입
 * Firebase Auth 계정 생성 + Firestore users 문서 생성 (status: "approved" 즉시 활성화)
 *
 * @param email - 이메일
 * @param password - 비밀번호
 * @param userData - 변호사 추가 정보
 * @returns 생성된 사용자 정보
 * @throws 가입 실패 시 에러
 */
export async function signUp(
  email: string,
  password: string,
  userData: SignUpData
): Promise<User> {
  try {
    // Firebase Auth 계정 생성
    const credential = await createUserWithEmailAndPassword(
      auth!,
      email,
      password
    );
    const { uid } = credential.user;

    // 사업자등록증 이미지 업로드
    let businessLicenseUrl: string | undefined;
    if (userData.businessLicenseFile && storage) {
      const ext = userData.businessLicenseFile.name.split(".").pop() || "jpg";
      const storageRef = ref(storage, `business-licenses/${uid}.${ext}`);
      await uploadBytes(storageRef, userData.businessLicenseFile);
      businessLicenseUrl = await getDownloadURL(storageRef);
    }

    // Firestore 사용자 문서 생성
    const userDoc: Omit<User, "createdAt"> & { createdAt: ReturnType<typeof serverTimestamp> } = {
      uid,
      email,
      name: userData.name,
      firmName: userData.firmName,
      barLicenseNumber: userData.barLicenseNumber,
      role: "lawyer",
      status: userData.businessVerified ? "approved" : "pending",
      plan: "free",
      createdAt: serverTimestamp(),
      businessNumber: userData.businessNumber,
      businessVerified: userData.businessVerified,
      businessLicenseUrl,
      businessAddress: userData.businessAddress,
      businessType: userData.businessType,
      businessCategory: userData.businessCategory,
      businessStartDate: userData.businessStartDate,
    };

    await setDoc(doc(db!, "users", uid), userDoc);

    // 생성된 문서를 다시 읽어서 반환
    const createdUser = await getUserDoc(uid);
    if (!createdUser) {
      throw new Error("사용자 문서 생성 후 조회에 실패했습니다.");
    }

    return createdUser;
  } catch (error: unknown) {
    if (error instanceof Error) {
      // Firebase Auth 에러 코드별 한국어 메시지
      const firebaseError = error as Error & { code?: string };
      switch (firebaseError.code) {
        case "auth/email-already-in-use":
          throw new Error("이미 등록된 이메일입니다.");
        case "auth/invalid-email":
          throw new Error("유효하지 않은 이메일 형식입니다.");
        case "auth/weak-password":
          throw new Error("비밀번호는 6자 이상이어야 합니다.");
        default:
          throw error;
      }
    }
    throw new Error("회원가입 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 이메일/비밀번호 로그인
 *
 * @param email - 이메일
 * @param password - 비밀번호
 * @returns 사용자 정보
 * @throws 로그인 실패 시 에러
 */
export async function signIn(
  email: string,
  password: string
): Promise<User> {
  try {
    const credential = await signInWithEmailAndPassword(
      auth!,
      email,
      password
    );
    const { uid } = credential.user;

    const userDoc = await getUserDoc(uid);
    if (!userDoc) {
      throw new Error("사용자 정보를 찾을 수 없습니다. 관리자에게 문의하세요.");
    }

    return userDoc;
  } catch (error: unknown) {
    if (error instanceof Error) {
      const firebaseError = error as Error & { code?: string };
      switch (firebaseError.code) {
        case "auth/user-not-found":
          throw new Error("등록되지 않은 이메일입니다.");
        case "auth/wrong-password":
          throw new Error("비밀번호가 일치하지 않습니다.");
        case "auth/invalid-credential":
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        case "auth/too-many-requests":
          throw new Error(
            "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요."
          );
        default:
          throw error;
      }
    }
    throw new Error("로그인 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 로그아웃
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth!);
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("로그아웃 중 오류가 발생했습니다.");
  }
}

/**
 * Firestore에서 사용자 문서를 조회합니다.
 *
 * @param uid - Firebase Auth UID
 * @returns 사용자 정보 또는 null
 */
export async function getUserDoc(uid: string): Promise<User | null> {
  try {
    const docRef = doc(db!, "users", uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return docSnap.data() as User;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("사용자 정보 조회 중 오류가 발생했습니다.");
  }
}

/**
 * 비밀번호 변경
 *
 * @param currentPassword - 현재 비밀번호 (재인증 필요)
 * @param newPassword - 새 비밀번호
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  try {
    const user = auth!.currentUser;
    if (!user || !user.email) {
      throw new Error("로그인된 사용자가 없습니다.");
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const firebaseError = error as Error & { code?: string };
      switch (firebaseError.code) {
        case "auth/wrong-password":
          throw new Error("현재 비밀번호가 일치하지 않습니다.");
        case "auth/weak-password":
          throw new Error("새 비밀번호는 6자 이상이어야 합니다.");
        case "auth/requires-recent-login":
          throw new Error("보안을 위해 다시 로그인 후 시도해 주세요.");
        default:
          throw error;
      }
    }
    throw new Error("비밀번호 변경 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 프로필 정보 업데이트 (이름, 사무소명)
 */
export async function updateUserProfile(
  uid: string,
  data: { name?: string; firmName?: string }
): Promise<void> {
  try {
    await updateDoc(doc(db!, "users", uid), { ...data });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`프로필 업데이트 실패: ${error.message}`);
    }
    throw new Error("프로필 업데이트 중 알 수 없는 오류가 발생했습니다.");
  }
}
