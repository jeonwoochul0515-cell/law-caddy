import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RegisterForm from "../components/auth/RegisterForm";
import useAuth from "../hooks/useAuth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuth((s) => s.register);
  const [error, setError] = useState("");

  const handleRegister = async (data: {
    email: string;
    password: string;
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
  }) => {
    setError("");
    try {
      await register(data.email, data.password, {
        name: data.name,
        firmName: data.firmName,
        barLicenseNumber: data.barLicenseNumber,
        phone: data.phone,
        privacyConsented: data.privacyConsented,
        businessNumber: data.businessNumber,
        businessVerified: data.businessVerified,
        businessLicenseFile: data.businessLicenseFile,
        businessAddress: data.businessAddress,
        businessType: data.businessType,
        businessCategory: data.businessCategory,
        businessStartDate: data.businessStartDate,
      });
      navigate("/pending");
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("회원가입에 실패했습니다.");
      }
    }
  };

  return <RegisterForm onSubmit={handleRegister} error={error} />;
}
