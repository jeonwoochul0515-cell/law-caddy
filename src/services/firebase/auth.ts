// Firebase Authentication 서비스
// 구글 로그인 + Firestore 사용자 문서 관리

import {
  signInWithPopup,
  GoogleAuthProvider,
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

const googleProvider = new GoogleAuthProvider();

/** 프로필 완성 시 필요한 데이터 */
export interface ProfileSetupData {
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

/**
 * 구글 로그인
 * - 기존 유저: Firestore 문서 반환
 * - 신규 유저: null 반환 (프로필 설정 필요)
 */
export async function signInWithGoogle(): Promise<{ user: User | null; isNewUser: boolean; firebaseUid: string; email: string; photoURL?: string; displayName?: string }> {
  try {
    const result = await signInWithPopup(auth!, googleProvider);
    const { uid, email, photoURL, displayName } = result.user;

    const userDoc = await getUserDoc(uid);

    if (userDoc) {
      return { user: userDoc, isNewUser: false, firebaseUid: uid, email: email || "", photoURL: photoURL || undefined, displayName: displayName || undefined };
    }

    // 신규 유저 — 프로필 설정이 필요함
    return { user: null, isNewUser: true, firebaseUid: uid, email: email || "", photoURL: photoURL || undefined, displayName: displayName || undefined };
  } catch (error: unknown) {
    if (error instanceof Error) {
      const firebaseError = error as Error & { code?: string };
      switch (firebaseError.code) {
        case "auth/popup-closed-by-user":
          throw new Error("로그인이 취소되었습니다.");
        case "auth/popup-blocked":
          throw new Error("팝업이 차단되었습니다. 팝업 차단을 해제해 주세요.");
        case "auth/account-exists-with-different-credential":
          throw new Error("이미 다른 방법으로 가입된 이메일입니다.");
        default:
          throw error;
      }
    }
    throw new Error("구글 로그인 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 프로필 설정 완료 (첫 구글 로그인 후)
 * Firestore users 문서 생성 + 사업자등록증 업로드
 */
export async function completeProfile(
  uid: string,
  email: string,
  photoURL: string | undefined,
  profileData: ProfileSetupData
): Promise<User> {
  try {
    // 사업자등록증 이미지 업로드
    let businessLicenseUrl: string | undefined;
    if (profileData.businessLicenseFile && storage) {
      const ext = profileData.businessLicenseFile.name.split(".").pop() || "jpg";
      const storageRef = ref(storage, `business-registrations/${uid}/${uid}.${ext}`);
      await uploadBytes(storageRef, profileData.businessLicenseFile);
      businessLicenseUrl = await getDownloadURL(storageRef);
    }

    // 변호사업 확인 여부에 따라 상태 결정
    const isApproved = profileData.businessVerified === true;

    const userDoc: Record<string, unknown> = {
      uid,
      email,
      photoURL: photoURL || null,
      name: profileData.name,
      firmName: profileData.firmName,
      barLicenseNumber: profileData.barLicenseNumber,
      role: "lawyer",
      status: isApproved ? "approved" : "pending",
      plan: "free",
      createdAt: serverTimestamp(),
      phone: profileData.phone || null,
      officePhone: profileData.officePhone || null,
      privacyConsented: profileData.privacyConsented || false,
      ...(profileData.privacyConsented ? { privacyConsentedAt: serverTimestamp() } : {}),
      businessNumber: profileData.businessNumber || null,
      businessVerified: profileData.businessVerified || false,
      businessLicenseUrl: businessLicenseUrl || null,
      businessAddress: profileData.businessAddress || null,
      businessType: profileData.businessType || null,
      businessCategory: profileData.businessCategory || null,
      businessStartDate: profileData.businessStartDate || null,
      businessCorporateNumber: profileData.businessCorporateNumber || null,
      businessTaxOffice: profileData.businessTaxOffice || null,
      businessTaxType: profileData.businessTaxType || null,
      profileCompleted: true,
    };

    await setDoc(doc(db!, "users", uid), userDoc);

    const createdUser = await getUserDoc(uid);
    if (!createdUser) {
      throw new Error("사용자 문서 생성 후 조회에 실패했습니다.");
    }

    return createdUser;
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("프로필 설정 중 알 수 없는 오류가 발생했습니다.");
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
  data: { name?: string; firmName?: string; phone?: string }
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
