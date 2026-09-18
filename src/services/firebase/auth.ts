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
  /** 사업자등록증 없이 접수(소속 변호사) — 항상 승인 대기로 들어간다 */
  noBusinessLicense?: boolean;
}

/** 구글 로그인 오류 코드 → 원인과 다음 행동을 담은 한국어 문구 */
const GOOGLE_LOGIN_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "로그인 창이 닫혀 취소되었습니다. 다시 눌러 주세요.",
  "auth/cancelled-popup-request": "로그인 창이 여러 개 열려 취소되었습니다. 한 번만 눌러 주세요.",
  "auth/popup-blocked":
    "브라우저가 로그인 창을 막았습니다. 카카오톡·네이버 앱 안에서 열었다면 오른쪽 위 메뉴에서 '다른 브라우저로 열기'를 눌러 크롬이나 사파리로 여세요. PC라면 주소창 오른쪽의 '팝업 차단됨' 아이콘을 눌러 허용해 주세요.",
  "auth/network-request-failed": "인터넷 연결이 끊겼습니다. 와이파이나 데이터 연결을 확인한 뒤 다시 눌러 주세요.",
  "auth/too-many-requests": "잠시 동안 시도가 너무 많았습니다. 1~2분 뒤 다시 눌러 주세요.",
  "auth/user-disabled": "이 구글 계정은 이용이 중지되어 있습니다. 아래 문의 채널로 연락 주세요.",
  "auth/account-exists-with-different-credential": "이미 다른 방법으로 가입된 이메일입니다. 아래 문의 채널로 연락 주세요.",
  "auth/unauthorized-domain": "이 주소에서는 로그인할 수 없습니다. law-caddy.com 으로 접속해 주세요.",
  "auth/operation-not-allowed": "구글 로그인이 잠시 꺼져 있습니다. 아래 문의 채널로 연락 주세요.",
  "auth/web-storage-unsupported":
    "브라우저가 로그인 정보를 저장할 수 없는 상태입니다. 시크릿 창이 아닌 일반 창에서 열거나, 쿠키 차단을 풀어 주세요.",
  "auth/internal-error": "구글 쪽에서 잠시 오류가 났습니다. 잠시 뒤 다시 눌러 주세요.",
};

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
      const code = firebaseError.code ?? "";
      const mapped = GOOGLE_LOGIN_ERRORS[code];
      if (mapped) throw new Error(mapped);
      // 사용자 문서 조회 실패(권한·오프라인)도 여기로 온다
      if (code === "permission-denied") {
        throw new Error("계정 정보를 읽을 권한이 없습니다. 아래 문의 채널로 연락 주세요.");
      }
      if (code === "unavailable" || /offline/i.test(error.message)) {
        throw new Error("인터넷 연결이 끊겼습니다. 연결을 확인한 뒤 다시 눌러 주세요.");
      }
      throw new Error(
        `로그인에 실패했습니다. 잠시 뒤 다시 시도해 주세요.${code ? ` (오류 코드 ${code})` : ""}`,
      );
    }
    throw new Error("구글 로그인 중 알 수 없는 오류가 발생했습니다.");
  }
}

/**
 * 프로필 설정 완료 (첫 구글 로그인 후)
 * Firestore users 문서 생성 + 사업자등록증 업로드
 *
 * 상태 결정 규칙.
 * - OCR로 변호사업이 확인되면 approved(즉시 이용)
 * - 확인이 안 되거나(OCR 실패·업태 불일치) 사업자등록증이 없으면 pending(관리자가 사람이 확인)
 * - 이미 문서가 있는 회원(거절 후 재신청 등)이 다시 제출하면 항상 pending으로 들어간다(관리자 재심사)
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
    // 기존 문서가 있으면(거절 후 재신청 등) 규칙상 스스로 approved로 올릴 수 없으므로 항상 pending.
    const existing = await getUserDoc(uid);
    const isApproved = profileData.businessVerified === true && !profileData.noBusinessLicense && !existing;

    const profileFields: Record<string, unknown> = {
      name: profileData.name,
      firmName: profileData.firmName,
      barLicenseNumber: profileData.barLicenseNumber,
      status: isApproved ? "approved" : "pending",
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
      noBusinessLicense: profileData.noBusinessLicense || false,
      profileCompleted: true,
    };

    if (existing) {
      // 기존 문서(거절 후 재신청, 프로필 미완성 계정)는 plan·createdAt·role을 건드리지 않고 갱신한다.
      // 거절 사유(rejectedReason)는 본인이 지우지 않는다 — 관리자가 승인·되돌리기할 때 지운다.
      await updateDoc(doc(db!, "users", uid), profileFields);
    } else {
      await setDoc(doc(db!, "users", uid), {
        uid,
        email,
        photoURL: photoURL || null,
        role: "lawyer",
        plan: "free",
        createdAt: serverTimestamp(),
        ...profileFields,
      });
    }

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
